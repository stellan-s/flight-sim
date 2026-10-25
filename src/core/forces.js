/**
 * Filename: forces.js
 * Purpose: Aerodynamic force and moment calculations for aircraft
 *
 * This module calculates all forces acting on the aircraft:
 * - Lift: Perpendicular to relative wind, function of angle of attack (AOA)
 * - Drag: Parallel to relative wind, includes induced and parasitic drag
 * - Thrust: Engine force along aircraft longitudinal axis
 * - Weight: Gravitational force (mg) always pointing down
 *
 * Forces are computed in the aircraft body frame using:
 * - Dynamic pressure: q = 0.5 * ρ * V²
 * - Lift coefficient: Cl(α) - linear model with stall
 * - Drag coefficient: Cd(α) = Cd0 + k*Cl²
 *
 * The calculateForces() function returns:
 * - Body frame forces: {X, Y, Z} - forward, right, down
 * - Body frame moments: {L, M, N} - roll, pitch, yaw
 * - Aerodynamic data: {alpha, beta, V, q, Cl, Cd}
 * - Force components: {lift, drag, thrust, weight}
 */

import {
  AIR_DENSITY_SEA_LEVEL,
  GRAVITY,
  KNOTS_TO_MS
} from '../utils/constants.js';

const g = GRAVITY;

// Standard atmosphere model
export function getAirDensity(altitude_ft) {
  const h = altitude_ft * 0.3048; // feet to meters
  const T0 = 288.15; // K (sea level)
  const p0 = 101325; // Pa (sea level)
  const L = 0.0065;  // K/m (temperature lapse rate)
  const R = 287.05;  // J/(kg⋅K) (specific gas constant)

  const T = T0 - L * h;
  const p = p0 * Math.pow(T / T0, g / (R * L));
  return p / (R * T);
}

export function calculateTrueAirspeedForIAS(iasKnots, altitudeFt) {
  const indicatedAirspeedMs = iasKnots * KNOTS_TO_MS;
  const density = getAirDensity(altitudeFt);
  return indicatedAirspeedMs / Math.sqrt(density / AIR_DENSITY_SEA_LEVEL);
}

// State velocities are AIR-RELATIVE in body frame (steady wind handled in kinematics)
// windGust parameter reserved for turbulence/gusts (not currently used)
export function calculateAerodynamicForces(state, specs, controls, windGust = { u: 0, v: 0, w: 0 }) {
  const altitude = state.position.altitude;
  const rho = getAirDensity(altitude);

  // State velocity is already air-relative - use directly
  const v_rel = {
    u: state.velocity.u,
    v: state.velocity.v,
    w: state.velocity.w
  };

  const V = Math.sqrt(v_rel.u * v_rel.u + v_rel.v * v_rel.v + v_rel.w * v_rel.w);
  const longitudinalV = Math.hypot(v_rel.u, v_rel.w);

  // Longitudinal wing forces use forward/vertical airflow. Lateral derivatives
  // retain total airflow so a stationary aircraft can still weathercock in a
  // crosswind without treating side flow as an extreme angle of attack.
  const q = 0.5 * rho * longitudinalV * longitudinalV;
  const lateralQ = 0.5 * rho * V * V;

  // Angle of attack and sideslip (clamped)
  const alpha = v_rel.u > 1 ? Math.atan2(v_rel.w, v_rel.u) : 0;
  const beta = V > 0 ? Math.asin(Math.max(-1, Math.min(1, v_rel.v / V))) : 0;

  // Non-dimensional rates for damping/side force terms
  const p_hat = V > 0 ? (state.angularVelocity.p * specs.wingspan) / (2 * V) : 0;
  const q_hat = V > 0 ? (state.angularVelocity.q * specs.chord) / (2 * V) : 0;
  const r_hat = V > 0 ? (state.angularVelocity.r * specs.wingspan) / (2 * V) : 0;

  // Control deflections (radians)
  const elevator_rad = controls.elevator * ((specs.elevatorMaxDeg ?? 25) * Math.PI / 180);
  const aileron_rad = controls.aileron * ((specs.aileronMaxDeg ?? 20) * Math.PI / 180);
  const rudder_rad = controls.rudder * ((specs.rudderMaxDeg ?? 30) * Math.PI / 180);

  // === LIFT ===
  let Cl;
  if (alpha < specs.stallAlpha) {
    // Pre-stall: linear region
    Cl = specs.Cl0 + specs.Cl_alpha * alpha;
  } else {
    // Post-stall: parabolic decay
    const k_stall = specs.stallDecay ?? 0.5;
    const alpha_excess = alpha - specs.stallAlpha;
    Cl = specs.Cl_max - k_stall * alpha_excess * alpha_excess;
  }

  // Enforce physical limits
  Cl = Math.max(-1.5, Math.min(Cl, specs.Cl_max));

  const lift = q * specs.wingArea * Cl * (specs.liftMultiplier ?? 1);

  // === DRAG ===
  const Cd = specs.Cd0 + specs.K * Cl * Cl;
  const drag = q * specs.wingArea * Cd * (specs.dragMultiplier ?? 1);

  // === SIDE FORCE ===
  const Cy = specs.Cy_beta * beta +
             specs.Cy_p * p_hat +
             specs.Cy_r * r_hat +
             specs.Cy_da * aileron_rad +
             specs.Cy_dr * rudder_rad;

  const side = lateralQ * specs.wingArea * Cy * (specs.sideForceMultiplier ?? 1);

  // === THRUST ===
  // Engine power decreases with altitude
  const powerFactor = Math.pow(rho / 1.225, specs.powerLapseRate);
  const availableThrust = specs.maxThrust * powerFactor;
  const thrust = controls.throttle * availableThrust * (specs.thrustMultiplier ?? 1);

  // === WEIGHT ===
  const weight = specs.mass * g * (specs.gravityMultiplier ?? 1);

  // Transform from wind axes to body axes
  // Wind axes: X=into relative wind, Z=perpendicular down
  // Body axes: X=forward, Z=down
  const cos_a = Math.cos(alpha);
  const sin_a = Math.sin(alpha);

  const forces_body = {
    X: thrust - drag * cos_a + lift * sin_a,
    Y: side,
    Z: -lift * cos_a - drag * sin_a
  };

  // Transform weight from earth to body frame
  const theta = state.orientation.pitch;
  const phi = state.orientation.roll;

  const cos_theta = Math.cos(theta);
  const sin_theta = Math.sin(theta);
  const cos_phi = Math.cos(phi);
  const sin_phi = Math.sin(phi);

  forces_body.X -= weight * sin_theta;
  forces_body.Y += weight * cos_theta * sin_phi;
  forces_body.Z += weight * cos_theta * cos_phi;

  return {
    body: forces_body,
    components: {
      lift: lift,
      drag: drag,
      thrust: thrust,
      weight: weight,
      side: side
    },
    aerodynamic: {
      alpha: alpha,
      beta: beta,
      Cl: Cl,
      Cd: Cd,
      Cy: Cy,
      q: q,
      lateralQ: lateralQ,
      V: V
    }
  };
}

export function calculateMoments(state, specs, controls, forces) {
  const altitude = state.position.altitude;
  const rho = getAirDensity(altitude);

  const V = state.getVelocityMagnitude();
  const q_dyn = forces?.aerodynamic?.q ?? 0.5 * rho * V * V;
  const q_lateral = forces?.aerodynamic?.lateralQ ?? 0.5 * rho * V * V;
  const alpha = forces?.aerodynamic?.alpha ?? state.getAlpha();
  const beta = forces?.aerodynamic?.beta ?? state.getBeta();

  // Get angular rates
  const p_rate = state.angularVelocity.p;
  const q_rate = state.angularVelocity.q;
  const r_rate = state.angularVelocity.r;

  const S = specs.wingArea;
  const c = specs.chord;
  const b = specs.wingspan;

  // Non-dimensional rates
  const p_hat = V > 0 ? (p_rate * b) / (2 * V) : 0;
  const q_hat = V > 0 ? (q_rate * c) / (2 * V) : 0;
  const r_hat = V > 0 ? (r_rate * b) / (2 * V) : 0;

  // Convert control inputs to radians (max deflections)
  const elevator_rad = controls.elevator * ((specs.elevatorMaxDeg ?? 25) * Math.PI / 180);
  const aileron_rad = controls.aileron * ((specs.aileronMaxDeg ?? 20) * Math.PI / 180);
  const rudder_rad = controls.rudder * ((specs.rudderMaxDeg ?? 30) * Math.PI / 180);

  // === PITCHING MOMENT (M) ===
  // Cm = Cm0 + Cm_alpha * α + Cm_q * q̂ + Cm_de * δe
  const Cm = specs.Cm0 +
             specs.Cm_alpha * alpha +
             specs.Cm_q * q_hat +
             specs.Cm_de * elevator_rad;

  const M_pitch = q_dyn * S * c * Cm * (specs.pitchMomentMultiplier ?? 1);

  // === ROLLING MOMENT (L) ===
  // Cl = Cl_beta * β + Cl_p * p̂ + Cl_r * r̂ + Cl_da * δa + Cl_dr * δr
  const Cl = specs.Cl_beta * beta +
             specs.Cl_p * p_hat +
             specs.Cl_r * r_hat +
             specs.Cl_da * aileron_rad +
             specs.Cl_dr * rudder_rad;

  const L_roll = q_lateral * S * b * Cl * (specs.rollMomentMultiplier ?? 1);

  // === YAWING MOMENT (N) ===
  // Cn = Cn_beta * β + Cn_p * p̂ + Cn_r * r̂ + Cn_da * δa + Cn_dr * δr
  const Cn = specs.Cn_beta * beta +
             specs.Cn_p * p_hat +
             specs.Cn_r * r_hat +
             specs.Cn_da * aileron_rad +
             specs.Cn_dr * rudder_rad;

  const N_yaw = q_lateral * S * b * Cn * (specs.yawMomentMultiplier ?? 1);

  return {
    L: L_roll,   // Roll moment
    M: M_pitch,  // Pitch moment
    N: N_yaw     // Yaw moment
  };
}
