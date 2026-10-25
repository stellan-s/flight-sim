const RAD_TO_DEG = 180 / Math.PI;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const approach = (value, target, rate, dt) =>
  value + (target - value) * Math.min(1, Math.max(0, rate * dt));

export class FlightEnvelopeSystem {
  constructor(specs) {
    this.specs = specs;
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.phase = 'normal';
    this.stallDirection = 0;
    this.stallTimer = 0;
    this.spinning = false;
    this.recovering = false;
    this.recoveryTimer = 0;
    this.structuralDamage = 0;
    this.failed = false;
    this.failureCause = '';
    this.status = {
      phase: 'normal',
      warning: false,
      stalled: false,
      spinning: false,
      recovering: false,
      failed: false,
      alphaDeg: 0,
      stallMarginDeg: 0,
      stallSeverity: 0,
      spinDirection: 0,
      recoveryProgress: 0,
      loadFactorG: 0,
      positiveGLimit: this.specs.positiveGLimit,
      negativeGLimit: this.specs.negativeGLimit,
      overspeed: false,
      structuralDamage: 0,
      failureCause: '',
      groundEffect: 0
    };
    return this.status;
  }

  chooseStallDirection(state, beta) {
    if (Math.abs(beta) > 0.01) return Math.sign(beta);
    if (Math.abs(state.orientation.roll) > 0.02) {
      return Math.sign(state.orientation.roll);
    }
    return Math.sin(this.elapsed * 1.7) >= 0 ? 1 : -1;
  }

  update(dt, state, controls, forces, groundStatus = null) {
    this.elapsed += Math.max(0, dt);
    const aerodynamic = forces?.aerodynamic ?? {};
    const components = forces?.components ?? {};
    const alpha = aerodynamic.alpha ?? state.getAlpha();
    const beta = aerodynamic.beta ?? state.getBeta();
    const absAlpha = Math.abs(alpha);
    const warningAlpha = Math.abs(
      this.specs.stallWarningAlpha ?? this.specs.stallAlpha * 0.8
    );
    const stallAlpha = Math.abs(this.specs.stallAlpha);
    const fullAlpha = Math.max(
      stallAlpha + 0.01,
      warningAlpha + 0.01,
      Math.abs(this.specs.stallFullAlpha ?? stallAlpha + 5 / RAD_TO_DEG)
    );
    const airborne = !groundStatus?.contact;
    const warning = airborne && absAlpha >= warningAlpha;
    const stalled = airborne && absAlpha >= stallAlpha;
    const stallSeverity = warning
      ? clamp((absAlpha - warningAlpha) / (fullAlpha - warningAlpha), 0, 1)
      : 0;
    const weight = Math.max(1, components.weight ?? this.specs.mass * 9.81);
    const loadFactorG = airborne
      ? (components.lift ?? 0) * Math.cos(alpha) / weight
      : 1;
    const iasKt = state.getIAS();
    const overspeedRatio = Math.max(0, iasKt / Math.max(1, this.specs.Vne) - 1);
    const positiveExcess = Math.max(0, loadFactorG - this.specs.positiveGLimit);
    const negativeExcess = Math.max(0, this.specs.negativeGLimit - loadFactorG);
    const overstress = airborne && (positiveExcess > 0 || negativeExcess > 0);
    const overspeed = airborne && overspeedRatio > 0;

    if (overstress || overspeed) {
      this.structuralDamage = clamp(
        this.structuralDamage + dt * (
          (positiveExcess + negativeExcess) * this.specs.structuralDamageRate +
          overspeedRatio * this.specs.overspeedDamageRate
        ),
        0,
        1
      );
    }

    if (this.structuralDamage >= 1) {
      this.failed = true;
      if (!this.failureCause) {
        this.failureCause = overspeed ? 'OVERSPEED' : 'G OVERSTRESS';
      }
    }

    if (!airborne) {
      this.stallTimer = 0;
      this.stallDirection = 0;
      this.spinning = false;
      this.recovering = false;
      this.recoveryTimer = 0;
      this.phase = this.failed ? 'structural failure' : 'ground';
    } else {
      if (warning) {
        const buffet = Math.sin(this.elapsed * 43) +
          0.45 * Math.sin(this.elapsed * 71 + 0.8);
        state.angularVelocity.p += buffet *
          this.specs.stallBuffetRollAccel * stallSeverity * dt;
        state.angularVelocity.q += Math.sin(this.elapsed * 53 + 0.3) *
          this.specs.stallBuffetPitchAccel * stallSeverity * dt;

        if (stallSeverity > 0.35) {
          if (!this.stallDirection) {
            this.stallDirection = this.chooseStallDirection(state, beta);
          }
          const dropSeverity = (stallSeverity - 0.35) / 0.65;
          state.angularVelocity.p += this.stallDirection *
            this.specs.stallWingDropAccel * dropSeverity ** 2 * dt;
          state.angularVelocity.r += this.stallDirection *
            this.specs.stallYawAccel * dropSeverity ** 2 * dt;
        }
      } else if (!this.spinning) {
        this.stallDirection = 0;
      }

      if (!this.recovering && stalled && stallSeverity >= 0.65) {
        this.stallTimer += dt;
      } else if (!this.spinning) {
        this.stallTimer = Math.max(0, this.stallTimer - dt * 2);
      }

      const autorotationPresent = Math.abs(beta) > 0.05 ||
        Math.abs(state.angularVelocity.p) > 0.3 ||
        Math.abs(state.angularVelocity.r) > 0.2;
      if (!this.spinning && !this.recovering && stalled && autorotationPresent &&
          this.stallTimer >= this.specs.spinEntryDelay) {
        this.spinning = true;
        this.recovering = false;
        this.recoveryTimer = 0;
        this.stallDirection ||= this.chooseStallDirection(state, beta);
      }

      if (this.spinning) {
        const direction = this.stallDirection || 1;
        state.angularVelocity.p = approach(
          state.angularVelocity.p,
          direction * this.specs.spinRollRate,
          2.6,
          dt
        );
        state.angularVelocity.r = approach(
          state.angularVelocity.r,
          direction * this.specs.spinYawRate,
          2.2,
          dt
        );
        state.angularVelocity.q = approach(
          state.angularVelocity.q,
          this.specs.spinPitchRate,
          1.4,
          dt
        );

        const forwardElevator = controls.elevator < -0.25;
        const oppositeRudder = controls.rudder * direction < -0.35;
        if (forwardElevator && oppositeRudder) this.recoveryTimer += dt;
        else this.recoveryTimer = Math.max(0, this.recoveryTimer - dt * 1.5);

        if (this.recoveryTimer >= this.specs.spinRecoveryTime) {
          this.spinning = false;
          this.recovering = true;
          this.recoveryTimer = 0;
          state.angularVelocity.p *= 0.45;
          state.angularVelocity.r *= 0.45;
        }
      } else if (this.recovering && !warning &&
          Math.abs(state.angularVelocity.p) < 0.25 &&
          Math.abs(state.angularVelocity.r) < 0.2) {
        this.recovering = false;
        this.stallDirection = 0;
      }

      if (this.failed) {
        const direction = this.stallDirection || 1;
        state.angularVelocity.p += direction *
          this.specs.structuralFailureRollAccel * dt;
        this.phase = 'structural failure';
      } else if (this.spinning) {
        this.phase = 'spin';
      } else if (this.recovering) {
        this.phase = 'recovering';
      } else if (stalled) {
        this.phase = 'stall';
      } else if (warning) {
        this.phase = 'stall warning';
      } else if (overspeed) {
        this.phase = 'overspeed';
      } else if (overstress) {
        this.phase = 'overstress';
      } else {
        this.phase = 'normal';
      }
    }

    this.status = {
      phase: this.phase,
      warning,
      stalled,
      spinning: this.spinning,
      recovering: this.recovering,
      failed: this.failed,
      alphaDeg: alpha * RAD_TO_DEG,
      stallMarginDeg: (stallAlpha - absAlpha) * RAD_TO_DEG,
      stallSeverity,
      spinDirection: this.stallDirection,
      recoveryProgress: this.spinning
        ? clamp(this.recoveryTimer / this.specs.spinRecoveryTime, 0, 1)
        : 0,
      loadFactorG,
      positiveGLimit: this.specs.positiveGLimit,
      negativeGLimit: this.specs.negativeGLimit,
      overspeed,
      structuralDamage: this.structuralDamage,
      failureCause: this.failureCause,
      groundEffect: aerodynamic.groundEffect ?? 0
    };
    return this.status;
  }
}
