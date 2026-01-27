/**
 * Filename: coordinates.js
 * Purpose: Coordinate system transformations
 *
 * Coordinate Systems:
 * - Body Frame: Aircraft-centered (x=forward, y=right, z=down)
 * - Earth Frame (NED): North-East-Down fixed to earth surface
 *
 * These transformations are used throughout the simulator for
 * converting forces, velocities, and directions between frames.
 */

/**
 * Transform vector from body frame to earth frame (NED)
 * Uses Direction Cosine Matrix (DCM) rotation
 *
 * @param {Object} bodyVec - Vector in body frame {x, y, z}
 * @param {Object} orientation - Aircraft orientation {pitch, roll, yaw} in radians
 * @returns {Object} Vector in earth frame {north, east, down}
 */
export function bodyToEarth(bodyVec, orientation) {
  const theta = orientation.pitch;
  const phi = orientation.roll;
  const psi = orientation.yaw;

  const cos_theta = Math.cos(theta);
  const sin_theta = Math.sin(theta);
  const cos_phi = Math.cos(phi);
  const sin_phi = Math.sin(phi);
  const cos_psi = Math.cos(psi);
  const sin_psi = Math.sin(psi);

  // DCM rotation from body to earth (NED)
  const north = bodyVec.x * cos_theta * cos_psi +
                bodyVec.y * (-cos_phi * sin_psi + sin_phi * sin_theta * cos_psi) +
                bodyVec.z * (sin_phi * sin_psi + cos_phi * sin_theta * cos_psi);

  const east = bodyVec.x * cos_theta * sin_psi +
               bodyVec.y * (cos_phi * cos_psi + sin_phi * sin_theta * sin_psi) +
               bodyVec.z * (-sin_phi * cos_psi + cos_phi * sin_theta * sin_psi);

  const down = -bodyVec.x * sin_theta +
                bodyVec.y * sin_phi * cos_theta +
                bodyVec.z * cos_phi * cos_theta;

  return { north, east, down };
}

/**
 * Transform vector from earth frame (NED) to body frame
 * Uses transpose of DCM (DCM is orthogonal)
 *
 * @param {Object} earthVec - Vector in earth frame {north, east, down}
 * @param {Object} orientation - Aircraft orientation {pitch, roll, yaw} in radians
 * @returns {Object} Vector in body frame {x, y, z}
 */
export function earthToBody(earthVec, orientation) {
  const theta = orientation.pitch;
  const phi = orientation.roll;
  const psi = orientation.yaw;

  const cos_theta = Math.cos(theta);
  const sin_theta = Math.sin(theta);
  const cos_phi = Math.cos(phi);
  const sin_phi = Math.sin(phi);
  const cos_psi = Math.cos(psi);
  const sin_psi = Math.sin(psi);

  // Transpose of DCM (inverse rotation)
  const x = earthVec.north * cos_theta * cos_psi +
            earthVec.east * cos_theta * sin_psi +
            earthVec.down * (-sin_theta);

  const y = earthVec.north * (-cos_phi * sin_psi + sin_phi * sin_theta * cos_psi) +
            earthVec.east * (cos_phi * cos_psi + sin_phi * sin_theta * sin_psi) +
            earthVec.down * sin_phi * cos_theta;

  const z = earthVec.north * (sin_phi * sin_psi + cos_phi * sin_theta * cos_psi) +
            earthVec.east * (-sin_phi * cos_psi + cos_phi * sin_theta * sin_psi) +
            earthVec.down * cos_phi * cos_theta;

  return { x, y, z };
}

/**
 * Normalize angle to range [-PI, PI]
 *
 * @param {number} angle - Angle in radians
 * @returns {number} Normalized angle in radians
 */
export function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

/**
 * Normalize angle to range [0, 2*PI]
 *
 * @param {number} angle - Angle in radians
 * @returns {number} Normalized angle in radians
 */
export function normalizeAngle360(angle) {
  while (angle < 0) angle += 2 * Math.PI;
  while (angle >= 2 * Math.PI) angle -= 2 * Math.PI;
  return angle;
}
