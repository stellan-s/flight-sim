// Wind model and simulation

export class WindModel {
  constructor() {
    // Wind in earth frame (NED: North-East-Down)
    this.windNorth = 0;   // m/s (positive = from north)
    this.windEast = 7.7;  // m/s (positive = from east, ~15 knots)
    this.windDown = 0;
    this.verticalWind = 0; // m/s, positive down in NED coordinates

    // Wind direction and speed (meteorological convention: direction FROM which wind blows)
    this.direction = 270; // degrees (270 = from west, blowing east)
    this.speed = 15;      // knots

    // Dynamic wind parameters
    this.baseDirection = 270;
    this.baseSpeed = 15;
    this.directionVariation = 20; // ±20° variation
    this.speedVariation = 5;      // ±5 kt variation
    this.changeRate = 0.02;       // How fast wind changes
    this.time = 0;

    this.setWindFromMeteo(this.direction, this.speed);
  }

  // Set wind from meteorological direction and speed
  setWindFromMeteo(direction_deg, speed_kts) {
    this.direction = direction_deg;
    this.speed = speed_kts;

    const speed_ms = speed_kts * 0.514444; // knots to m/s
    const dir_rad = direction_deg * Math.PI / 180;

    // Wind FROM direction means it's blowing TOWARD opposite direction
    // North component: negative of north component of FROM direction
    this.windNorth = -speed_ms * Math.cos(dir_rad);
    this.windEast = -speed_ms * Math.sin(dir_rad);
    this.windDown = this.verticalWind;
  }

  // Update dynamic wind (call each frame with dt)
  updateDynamic(dt) {
    this.time += dt;

    // Use sine waves with different periods for natural variation
    const dirOffset = Math.sin(this.time * this.changeRate) * this.directionVariation +
                     Math.sin(this.time * this.changeRate * 0.7) * (this.directionVariation * 0.3);

    const speedOffset = Math.sin(this.time * this.changeRate * 1.3) * this.speedVariation +
                       Math.sin(this.time * this.changeRate * 0.5) * (this.speedVariation * 0.4);

    // Apply variations
    const newDirection = this.baseDirection + dirOffset;
    const newSpeed = Math.max(0, this.baseSpeed + speedOffset);

    this.setWindFromMeteo(newDirection, newSpeed);
  }

  // Set base wind that dynamic variations work from
  setBaseWind(direction_deg, speed_kts) {
    this.baseDirection = direction_deg;
    this.baseSpeed = speed_kts;
    this.setWindFromMeteo(direction_deg, speed_kts);
  }

  // Get wind in body frame for a given aircraft orientation
  getWindBodyFrame(psi, theta = 0, phi = 0) {
    // Transform from earth (NED) to body frame using full attitude
    const cos_psi = Math.cos(psi);
    const sin_psi = Math.sin(psi);
    const cos_theta = Math.cos(theta);
    const sin_theta = Math.sin(theta);
    const cos_phi = Math.cos(phi);
    const sin_phi = Math.sin(phi);

    // Rotation matrix transpose of body->earth
    const u_wind = this.windNorth * (cos_theta * cos_psi) +
                   this.windEast * (cos_theta * sin_psi) +
                   this.windDown * (-sin_theta);

    const v_wind = this.windNorth * (sin_phi * sin_theta * cos_psi - cos_phi * sin_psi) +
                   this.windEast * (sin_phi * sin_theta * sin_psi + cos_phi * cos_psi) +
                   this.windDown * (sin_phi * cos_theta);

    const w_wind = this.windNorth * (cos_phi * sin_theta * cos_psi + sin_phi * sin_psi) +
                   this.windEast * (cos_phi * sin_theta * sin_psi - sin_phi * cos_psi) +
                   this.windDown * (cos_phi * cos_theta);

    return { u: u_wind, v: v_wind, w: w_wind };
  }

  // Get wind vector at a lat/lon position (for visualization)
  getWindAtPosition(lat, lon) {
    // For now, uniform wind field
    // Future: could add turbulence, wind shear, etc.
    return {
      north: this.windNorth,
      east: this.windEast,
      magnitude: Math.sqrt(this.windNorth * this.windNorth + this.windEast * this.windEast),
      direction: this.direction
    };
  }
}
