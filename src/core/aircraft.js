// Aircraft state vector and specifications

export class AircraftState {
  constructor() {
    // Position (geodetic)
    this.position = {
      lat: 0,           // degrees
      lon: 0,           // degrees
      altitude: 5000    // feet MSL
    };

    // Velocity (body frame, m/s)
    this.velocity = {
      u: 60,  // forward (positive = forward)
      v: 0,   // lateral (positive = right)
      w: 0    // vertical (positive = down)
    };

    // Orientation (Euler angles, radians)
    this.orientation = {
      pitch: 0,   // θ (positive = nose up)
      roll: 0,    // φ (positive = right wing down)
      yaw: 0      // ψ (heading, 0 = north, positive = clockwise)
    };

    // Angular velocity (body frame, rad/s)
    this.angularVelocity = {
      p: 0,  // roll rate
      q: 0,  // pitch rate
      r: 0   // yaw rate
    };
  }

  // Get total velocity magnitude (m/s)
  getVelocityMagnitude() {
    return Math.sqrt(
      this.velocity.u * this.velocity.u +
      this.velocity.v * this.velocity.v +
      this.velocity.w * this.velocity.w
    );
  }

  // Get indicated airspeed (knots)
  // IAS is calibrated to sea level air density
  getIAS() {
    const alt = this.position.altitude;
    const h = alt * 0.3048; // feet to meters
    const T0 = 288.15;
    const p0 = 101325;
    const L = 0.0065;
    const R = 287.05;
    const g = 9.81;

    const T = T0 - L * h;
    const p = p0 * Math.pow(T / T0, g / (R * L));
    const rho = p / (R * T);
    const rho0 = 1.225; // sea level density

    // TAS
    const v_tas = this.getVelocityMagnitude();

    // IAS: equivalent airspeed at sea level for same dynamic pressure
    const v_ias = v_tas * Math.sqrt(rho / rho0);

    return v_ias * 1.94384; // m/s to knots
  }

  // Get angle of attack (radians)
  getAlpha() {
    return Math.atan2(this.velocity.w, this.velocity.u);
  }

  // Get sideslip angle (radians)
  getBeta() {
    const v = this.getVelocityMagnitude();
    if (v <= 0) return 0;
    const ratio = Math.max(-1, Math.min(1, this.velocity.v / v));
    return Math.asin(ratio);
  }

  // Get climb rate (feet per minute)
  getClimbRate() {
    // Transform vertical velocity from body to the earth-frame NED down axis.
    const theta = this.orientation.pitch;
    const phi = this.orientation.roll;

    const downVelocity = -this.velocity.u * Math.sin(theta) +
                          this.velocity.v * Math.sin(phi) * Math.cos(theta) +
                          this.velocity.w * Math.cos(theta) * Math.cos(phi);

    // Climb rate is positive upward, opposite the NED down axis.
    return downVelocity === 0 ? 0 : -downVelocity * 196.85; // m/s to ft/min
  }
}

export class AircraftSpecs {
  constructor(type = 'cessna172') {
    const specs = {
      cessna172: {
        name: 'Cessna 172 Skyhawk',
        mass: 1043,              // kg (empty weight)
        wingArea: 16.2,          // m²
        wingspan: 11.0,          // m
        chord: 1.47,             // m (mean aerodynamic chord)
        maxThrust: 2400,         // N (180 HP @ sea level)

        // Aerodynamic coefficients (clean configuration)
        Cl0: 0.21,               // Lift coefficient at α=0
        Cl_alpha: 4.8,           // Lift curve slope (per radian)
        Cl_max: 1.45,            // Maximum lift coefficient
        Cd0: 0.028,              // Zero-lift drag coefficient
        K: 0.054,                // Induced drag factor
        stallAlpha: 0.262,       // rad (~15 degrees)

        // Stability derivatives (longitudinal)
        Cm0: 0.02,               // Pitching moment coefficient at α=0
        Cm_alpha: -0.57,         // Pitch stiffness (per radian)
        Cm_q: -18.0,             // Pitch damping (per radian/sec)
        Cm_de: 1.8,              // Elevator effectiveness (per radian), positive = nose-up

        // Side force derivatives
        Cy_beta: -0.83,          // Weathercock/side force stability (per radian)
        Cy_p: -0.08,             // Side force from roll rate (per radian/sec)
        Cy_r: 0.26,              // Side force from yaw rate (per radian/sec)
        Cy_da: 0.0,              // Side force from aileron (per radian)
        Cy_dr: 0.19,             // Side force from rudder (per radian)

        // Stability derivatives (lateral-directional)
        Cl_beta: -0.08,          // Dihedral effect (roll from sideslip, per radian)
        Cl_p: -0.5,              // Roll damping (per radian/sec)
        Cl_r: 0.14,              // Roll due to yaw rate (per radian/sec)
        Cl_da: 0.22,             // Aileron effectiveness (per radian)
        Cl_dr: 0.017,            // Rudder effect on roll (per radian)

        Cn_beta: 0.1,            // Weathercock stability (yaw from sideslip, per radian)
        Cn_p: -0.03,             // Adverse yaw (yaw from roll rate, per radian/sec)
        Cn_r: -0.2,              // Yaw damping (per radian/sec)
        Cn_da: -0.01,            // Adverse yaw from aileron (per radian)
        Cn_dr: -0.1,             // Rudder effectiveness (per radian)

        // Inertia (kg⋅m²)
        Ixx: 1285,               // Roll inertia
        Iyy: 1824,               // Pitch inertia
        Izz: 2666,               // Yaw inertia
        Ixz: 0,                  // Product of inertia

        // Engine
        propEfficiency: 0.8,     // Propeller efficiency
        powerLapseRate: 0.12,    // Power reduction per 1000ft

        // Limits (for reference, not enforced)
        Vne: 163,                // Never exceed speed (knots)
        Vso: 47,                 // Stall speed landing config (knots)
        Vs: 55                   // Stall speed clean (knots)
      }
    };

    Object.assign(this, specs[type]);
    this.type = type;
  }
}

// Control inputs (-1 to +1)
export class Controls {
  constructor() {
    this.elevator = 0;    // Pitch control (-1=nose down, +1=nose up)
    this.aileron = 0;     // Roll control (-1=left, +1=right)
    this.rudder = 0;      // Yaw control (-1=left, +1=right)
    this.throttle = 0.7;  // Throttle (0=idle, 1=full)
  }
}
