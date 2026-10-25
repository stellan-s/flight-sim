/**
 * Filename: physics.js
 * Purpose: 6DOF physics engine with RK4 integration
 *
 * This module implements the core flight dynamics simulation:
 *
 * State Vector (12 states):
 * - Velocity (body frame): u, v, w (m/s) - forward, right, down
 * - Angular rates (body frame): p, q, r (rad/s) - roll, pitch, yaw rates
 * - Position (earth frame): lat, lon, altitude (degrees, degrees, feet)
 * - Orientation (Euler angles): φ (roll), θ (pitch), ψ (yaw) - radians
 *
 * Integration Method:
 * - RK4 (Runge-Kutta 4th order) for numerical accuracy
 * - Evaluates derivatives at 4 points per timestep
 * - Error: O(h⁵) where h is timestep
 *
 * Equations of Motion:
 * - Force equations: m * dV/dt = F (in body frame)
 * - Moment equations: I * dω/dt + ω × (I*ω) = M (Euler's equation)
 * - Kinematic equations: Position and orientation propagation
 *
 * Frame Transformations:
 * - Body → Earth: Forces and velocities transformed using DCM
 * - Earth → Body: Wind and gravity transformed using DCM transpose
 */

import { calculateAerodynamicForces, calculateMoments } from './forces.js';
import { earthToBody } from '../utils/coordinates.js';

const g = 9.81; // m/s²

export class PhysicsEngine {
  constructor(state, specs, controls) {
    this.state = state;
    this.specs = specs;
    this.controls = controls;
    this.windBody = { u: 0, v: 0, w: 0 };   // Wind velocity in body frame
    this.windEarth = { north: 0, east: 0, down: 0 }; // Wind in earth frame (NED)
  }

  // Set wind model
  setWindModel(windModel) {
    this.windModel = windModel;
  }

  setGroundSystem(groundSystem) {
    this.groundSystem = groundSystem;
  }

  getEnvironment(state) {
    if (!this.groundSystem) return { aglFt: Infinity };
    const surface = this.groundSystem.getSurface(
      state.position.lat,
      state.position.lon
    );
    return {
      aglFt: state.position.altitude - surface.elevationFt,
      surfaceType: surface.surfaceType,
      onRunway: surface.onRunway
    };
  }

  // Update wind transformation before physics step
  updateWind() {
    if (!this.windModel) {
      this.windBody = { u: 0, v: 0, w: 0 };
      this.windEarth = { north: 0, east: 0, down: 0 };
      return;
    }

    // Get wind in body frame based on current orientation
    this.windBody = this.windModel.getWindBodyFrame(
      this.state.orientation.yaw,
      this.state.orientation.pitch,
      this.state.orientation.roll
    );

    // Also cache earth-frame wind for kinematics
    this.windEarth = {
      north: this.windModel.windNorth,
      east: this.windModel.windEast,
      down: this.windModel.windDown
    };
  }

  // Compute derivatives of state vector
  computeDerivatives(state, controls) {
    // Calculate forces (state velocities are already air-relative)
    const forces = calculateAerodynamicForces(
      state,
      this.specs,
      controls,
      { u: 0, v: 0, w: 0 },
      this.getEnvironment(state)
    );
    const moments = calculateMoments(state, this.specs, controls, forces);

    const m = this.specs.mass;
    const Ixx = this.specs.Ixx;
    const Iyy = this.specs.Iyy;
    const Izz = this.specs.Izz;
    const Ixz = this.specs.Ixz;

    // Get angular velocities
    const q = state.angularVelocity.q;
    const p = state.angularVelocity.p;
    const r = state.angularVelocity.r;

    // Get velocities
    const u = state.velocity.u;
    const v = state.velocity.v;
    const w = state.velocity.w;

    // Force equations (body frame)
    // du/dt = X/m - q*w + r*v
    // dv/dt = Y/m - r*u + p*w
    // dw/dt = Z/m - p*v + q*u
    const du_dt = forces.body.X / m - q * w + r * v;
    const dv_dt = forces.body.Y / m - r * u + p * w;
    const dw_dt = forces.body.Z / m - p * v + q * u;

    // Moment equations (Euler's equations for rotating rigid body)
    // Simplified (assuming Ixz = 0 for Cessna 172)
    const dp_dt = (moments.L + (Iyy - Izz) * q * r) / Ixx;
    const dq_dt = (moments.M + (Izz - Ixx) * p * r) / Iyy;
    const dr_dt = (moments.N + (Ixx - Iyy) * p * q) / Izz;

    // Euler angle rates
    const theta = state.orientation.pitch;
    const phi = state.orientation.roll;

    const cos_theta = Math.cos(theta);
    const sin_theta = Math.sin(theta);
    const tan_theta = Math.tan(theta);
    const cos_phi = Math.cos(phi);
    const sin_phi = Math.sin(phi);

    const dphi_dt = p + q * sin_phi * tan_theta + r * cos_phi * tan_theta;
    const dtheta_dt = q * cos_phi - r * sin_phi;
    const dpsi_dt = (q * sin_phi + r * cos_phi) / cos_theta;

    // Position rates (earth frame)
    // Transform velocity from body to earth frame
    const cos_psi = Math.cos(state.orientation.yaw);
    const sin_psi = Math.sin(state.orientation.yaw);

    // Air-relative velocity in earth frame (NED)
    const v_north_air = u * cos_theta * cos_psi +
                        v * (-cos_phi * sin_psi + sin_phi * sin_theta * cos_psi) +
                        w * (sin_phi * sin_psi + cos_phi * sin_theta * cos_psi);

    const v_east_air = u * cos_theta * sin_psi +
                       v * (cos_phi * cos_psi + sin_phi * sin_theta * sin_psi) +
                       w * (-sin_phi * cos_psi + cos_phi * sin_theta * sin_psi);

    const v_down_air = -u * sin_theta +
                        v * sin_phi * cos_theta +
                        w * cos_phi * cos_theta;

    // Ground-relative velocity adds steady wind in earth frame
    const v_north = v_north_air + this.windEarth.north;
    const v_east = v_east_air + this.windEarth.east;
    const v_down = v_down_air + this.windEarth.down;

    // Convert to lat/lon rates (simplified flat earth)
    const earthRadius = this.specs.earthRadius ?? 6371000;
    const dlat_dt = (v_north / earthRadius) * (180 / Math.PI);
    const dlon_dt = (v_east / (earthRadius * Math.cos(state.position.lat * Math.PI / 180))) * (180 / Math.PI);
    const dalt_dt = -v_down * 3.28084; // m/s to ft/s

    return {
      velocity: { u: du_dt, v: dv_dt, w: dw_dt },
      angularVelocity: { p: dp_dt, q: dq_dt, r: dr_dt },
      orientation: { pitch: dtheta_dt, roll: dphi_dt, yaw: dpsi_dt },
      position: { lat: dlat_dt, lon: dlon_dt, altitude: dalt_dt },
      forces: forces,
      moments: moments
    };
  }

  // RK4 integration step
  update(dt) {
    // Update wind transformation
    this.updateWind();

    // Store original state VALUES (not reference)
    const original = {
      position: { ...this.state.position },
      velocity: { ...this.state.velocity },
      orientation: { ...this.state.orientation },
      angularVelocity: { ...this.state.angularVelocity }
    };

    // Create temp state for intermediate calculations
    let tempState = this.cloneState(this.state);

    // K1
    const k1 = this.computeDerivatives(tempState, this.controls);

    // K2
    tempState = this.cloneState(this.state);
    this.applyDerivatives(tempState, k1, dt / 2);
    const k2 = this.computeDerivatives(tempState, this.controls);

    // K3
    tempState = this.cloneState(this.state);
    this.applyDerivatives(tempState, k2, dt / 2);
    const k3 = this.computeDerivatives(tempState, this.controls);

    // K4
    tempState = this.cloneState(this.state);
    this.applyDerivatives(tempState, k3, dt);
    const k4 = this.computeDerivatives(tempState, this.controls);

    // Apply combined RK4 result to ORIGINAL state object (don't create new object)
    this.state.position.lat = original.position.lat;
    this.state.position.lon = original.position.lon;
    this.state.position.altitude = original.position.altitude;
    this.state.velocity.u = original.velocity.u;
    this.state.velocity.v = original.velocity.v;
    this.state.velocity.w = original.velocity.w;
    this.state.orientation.pitch = original.orientation.pitch;
    this.state.orientation.roll = original.orientation.roll;
    this.state.orientation.yaw = original.orientation.yaw;
    this.state.angularVelocity.p = original.angularVelocity.p;
    this.state.angularVelocity.q = original.angularVelocity.q;
    this.state.angularVelocity.r = original.angularVelocity.r;

    // Now apply derivatives
    this.applyDerivatives(this.state, k1, dt / 6);
    this.applyDerivatives(this.state, k2, dt / 3);
    this.applyDerivatives(this.state, k3, dt / 3);
    this.applyDerivatives(this.state, k4, dt / 6);

    // Normalize angles
    this.state.orientation.pitch = this.normalizeAngle(this.state.orientation.pitch);
    this.state.orientation.roll = this.normalizeAngle(this.state.orientation.roll);
    this.state.orientation.yaw = this.normalizeAngle(this.state.orientation.yaw);

    // Safety limits to prevent runaway instability
    const MAX_PITCH_RATE = this.specs.maxPitchRate ?? 2.0;
    const MAX_ROLL_RATE = this.specs.maxRollRate ?? 3.0;
    const MAX_YAW_RATE = this.specs.maxYawRate ?? 2.0;

    this.state.angularVelocity.p = Math.max(-MAX_ROLL_RATE, Math.min(MAX_ROLL_RATE, this.state.angularVelocity.p));
    this.state.angularVelocity.q = Math.max(-MAX_PITCH_RATE, Math.min(MAX_PITCH_RATE, this.state.angularVelocity.q));
    this.state.angularVelocity.r = Math.max(-MAX_YAW_RATE, Math.min(MAX_YAW_RATE, this.state.angularVelocity.r));

    // Resolve runway/terrain contact in ground-relative coordinates after the
    // free-flight integration step. Standalone physics users retain the simple
    // flat ground fallback when no ground system is attached.
    if (this.groundSystem) {
      this.lastGroundState = this.groundSystem.update(
        dt,
        this.state,
        this.controls,
        this.windEarth,
        k1.forces
      );
    } else {
      const groundAltitude = this.specs.groundAltitude ?? 0;
      if (this.state.position.altitude < groundAltitude) {
        this.state.position.altitude = groundAltitude;
        this.state.velocity.u = 0;
        this.state.velocity.w = 0;
        this.state.angularVelocity.p = 0;
        this.state.angularVelocity.q = 0;
        this.state.angularVelocity.r = 0;
      }
    }

    // Recompute final forces and moments for rendering and diagnostics.
    const finalForces = calculateAerodynamicForces(
      this.state,
      this.specs,
      this.controls,
      { u: 0, v: 0, w: 0 },
      this.getEnvironment(this.state)
    );
    const finalMoments = calculateMoments(
      this.state,
      this.specs,
      this.controls,
      finalForces
    );

    const constraintEarth = this.lastGroundState?.constraintForceEarth;
    if (this.lastGroundState?.contact && constraintEarth) {
      const constraintBody = earthToBody(constraintEarth, this.state.orientation);
      finalForces.body.X += constraintBody.x;
      finalForces.body.Y += constraintBody.y;
      finalForces.body.Z += constraintBody.z;
      finalForces.components.groundReaction = Math.hypot(
        constraintEarth.north,
        constraintEarth.east,
        constraintEarth.down
      );
      finalForces.groundReactionEarth = constraintEarth;
    }
    return { ...finalForces, moments: finalMoments };
  }

  cloneState(state) {
    const clonedState = Object.create(Object.getPrototypeOf(state));
    clonedState.position = { ...state.position };
    clonedState.velocity = { ...state.velocity };
    clonedState.orientation = { ...state.orientation };
    clonedState.angularVelocity = { ...state.angularVelocity };
    return clonedState;
  }

  applyDerivatives(state, derivatives, dt) {
    state.velocity.u += derivatives.velocity.u * dt;
    state.velocity.v += derivatives.velocity.v * dt;
    state.velocity.w += derivatives.velocity.w * dt;

    state.angularVelocity.p += derivatives.angularVelocity.p * dt;
    state.angularVelocity.q += derivatives.angularVelocity.q * dt;
    state.angularVelocity.r += derivatives.angularVelocity.r * dt;

    state.orientation.pitch += derivatives.orientation.pitch * dt;
    state.orientation.roll += derivatives.orientation.roll * dt;
    state.orientation.yaw += derivatives.orientation.yaw * dt;

    state.position.lat += derivatives.position.lat * dt;
    state.position.lon += derivatives.position.lon * dt;
    state.position.altitude += derivatives.position.altitude * dt;
  }

  normalizeAngle(angle) {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }
}
