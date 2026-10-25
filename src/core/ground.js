import { CONFIG } from '../config.js';
import { bodyToEarth, calculateGroundVelocity, earthToBody } from '../utils/coordinates.js';
import { GRAVITY, MS_TO_KNOTS } from '../utils/constants.js';

const FEET_TO_METERS = 0.3048;
const METERS_PER_DEGREE = 111320;
const FPM_PER_MPS = 196.850394;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const moveTowardZero = (value, amount) =>
  Math.sign(value) * Math.max(0, Math.abs(value) - Math.max(0, amount));

function offsetMeters(lat, lon, originLat, originLon) {
  const north = (lat - originLat) * METERS_PER_DEGREE;
  const east = (lon - originLon) * METERS_PER_DEGREE *
    Math.max(0.01, Math.cos(originLat * Math.PI / 180));
  return { north, east };
}

function offsetLatLon(originLat, originLon, north, east) {
  return {
    lat: originLat + north / METERS_PER_DEGREE,
    lon: originLon + east /
      (METERS_PER_DEGREE * Math.max(0.01, Math.cos(originLat * Math.PI / 180)))
  };
}

function runwayFrame(vector, headingRad) {
  return {
    along: vector.north * Math.cos(headingRad) + vector.east * Math.sin(headingRad),
    cross: -vector.north * Math.sin(headingRad) + vector.east * Math.cos(headingRad)
  };
}

function earthFrame(along, cross, headingRad) {
  return {
    north: along * Math.cos(headingRad) - cross * Math.sin(headingRad),
    east: along * Math.sin(headingRad) + cross * Math.cos(headingRad)
  };
}

export class GroundSystem {
  constructor(chartFeatures, specs, options = CONFIG) {
    this.chartFeatures = chartFeatures ?? { airports: [] };
    this.specs = specs;
    this.options = options;
    this.contact = false;
    this.crashed = false;
    this.hasBeenAirborne = false;
    this.phase = 'airborne';
    this.elapsed = 0;
    this.lastReport = null;
    this.lastEvent = null;
    this.message = '';
    this.messageUntil = 0;
    this.surface = null;
    this.constraintForceEarth = { north: 0, east: 0, down: 0 };
    this.lastGroundVelocity = null;
  }

  reset({ contact = false } = {}) {
    this.contact = contact;
    this.crashed = false;
    this.hasBeenAirborne = false;
    this.phase = contact ? 'ground' : 'airborne';
    this.elapsed = 0;
    this.lastReport = null;
    this.lastEvent = null;
    this.message = contact ? 'LINED UP — RELEASE BRAKES AND APPLY POWER' : '';
    this.messageUntil = contact ? 8 : 0;
    this.constraintForceEarth = { north: 0, east: 0, down: 0 };
    this.lastGroundVelocity = null;
  }

  findRunway(airportId, runwayEndId) {
    const airports = this.chartFeatures.airports ?? [];
    const airport = airports.find(entry => entry.id === airportId) ?? airports[0];
    if (!airport) return null;

    const requested = String(runwayEndId ?? '').toUpperCase();
    const runway = (airport.runways ?? []).find(entry =>
      entry.id.toUpperCase() === requested ||
      entry.id.toUpperCase().split('/').includes(requested)
    ) ?? airport.runways?.[0];
    if (!runway) return null;

    const ends = runway.id.toUpperCase().split('/');
    const reciprocal = requested && requested === ends[1];
    const heading = ((runway.heading + (reciprocal ? 180 : 0)) % 360 + 360) % 360;
    return {
      airport,
      runway,
      runwayEnd: ends[reciprocal ? 1 : 0] ?? requested,
      heading,
      reciprocal
    };
  }

  spawnOnRunway(state, controls, windEarth, airportId, runwayEndId) {
    const selection = this.findRunway(airportId, runwayEndId);
    if (!selection) return null;

    const { airport, runway, runwayEnd, heading } = selection;
    const headingRad = heading * Math.PI / 180;
    const runwayLength = runway.length * FEET_TO_METERS;
    const startAlong = -runwayLength * 0.38;
    const positionOffset = earthFrame(startAlong, 0, headingRad);
    const position = offsetLatLon(
      airport.lat,
      airport.lon,
      positionOffset.north,
      positionOffset.east
    );

    state.position.lat = position.lat;
    state.position.lon = position.lon;
    state.position.altitude = airport.elevation + this.options.GEAR_HEIGHT_FT;
    state.orientation.pitch = 0;
    state.orientation.roll = 0;
    state.orientation.yaw = headingRad;
    state.angularVelocity.p = 0;
    state.angularVelocity.q = 0;
    state.angularVelocity.r = 0;

    const bodyAir = earthToBody({
      north: -(windEarth?.north ?? 0),
      east: -(windEarth?.east ?? 0),
      down: -(windEarth?.down ?? 0)
    }, state.orientation);
    state.velocity.u = bodyAir.x;
    state.velocity.v = bodyAir.y;
    state.velocity.w = bodyAir.z;

    controls.elevator = 0;
    controls.aileron = 0;
    controls.rudder = 0;
    controls.throttle = 0;
    controls.brake = 0;

    this.reset({ contact: true });
    this.lastGroundVelocity = { north: 0, east: 0, down: 0 };
    this.surface = this.getSurface(state.position.lat, state.position.lon);
    return { ...selection, position };
  }

  getSurface(lat, lon) {
    let fieldSurface = null;

    for (const airport of this.chartFeatures.airports ?? []) {
      const offset = offsetMeters(lat, lon, airport.lat, airport.lon);
      const distance = Math.hypot(offset.north, offset.east);
      const runways = airport.runways ?? [];
      const fieldRadius = Math.max(450, ...runways.map(runway => runway.length * FEET_TO_METERS * 0.6));

      if (distance <= fieldRadius && (!fieldSurface || distance < fieldSurface.distance)) {
        fieldSurface = {
          airport,
          runway: null,
          runwayEnd: null,
          elevationFt: airport.elevation,
          surfaceType: 'grass',
          onRunway: false,
          alongMeters: 0,
          crossMeters: distance,
          distance
        };
      }

      for (const runway of runways) {
        const headingRad = runway.heading * Math.PI / 180;
        const local = runwayFrame(offset, headingRad);
        const halfLength = runway.length * FEET_TO_METERS / 2;
        const halfWidth = runway.width * FEET_TO_METERS / 2;
        if (Math.abs(local.along) <= halfLength && Math.abs(local.cross) <= halfWidth) {
          return {
            airport,
            runway,
            runwayEnd: runway.id,
            elevationFt: airport.elevation,
            surfaceType: runway.surfaceType ?? 'asphalt',
            onRunway: true,
            alongMeters: local.along,
            crossMeters: local.cross,
            headingRad,
            distance
          };
        }
      }
    }

    return fieldSurface ?? {
      airport: null,
      runway: null,
      runwayEnd: null,
      elevationFt: this.specs.groundAltitude ?? 0,
      surfaceType: 'terrain',
      onRunway: false,
      alongMeters: 0,
      crossMeters: Infinity,
      distance: Infinity
    };
  }

  applyGroundVelocity(state, groundVelocity, windEarth) {
    const airEarth = {
      north: groundVelocity.north - (windEarth?.north ?? 0),
      east: groundVelocity.east - (windEarth?.east ?? 0),
      down: groundVelocity.down - (windEarth?.down ?? 0)
    };
    const bodyAir = earthToBody(airEarth, state.orientation);
    state.velocity.u = bodyAir.x;
    state.velocity.v = bodyAir.y;
    state.velocity.w = bodyAir.z;
  }

  evaluateTouchdown(state, surface, sinkRateFpm, groundSpeedMps) {
    const rollDeg = Math.abs(state.orientation.roll * 180 / Math.PI);
    const pitchDeg = state.orientation.pitch * 180 / Math.PI;
    const offRunway = !surface.onRunway;
    const crashed = sinkRateFpm >= this.options.CRASH_SINK_RATE_FPM ||
      rollDeg >= this.options.CRASH_BANK_DEG ||
      Math.abs(pitchDeg) >= this.options.CRASH_PITCH_DEG;
    const hard = sinkRateFpm >= this.options.HARD_LANDING_SINK_RATE_FPM || offRunway;

    let quality = 'SMOOTH';
    if (crashed) quality = 'CRASH';
    else if (hard) quality = 'HARD';
    else if (sinkRateFpm >= 240) quality = 'FIRM';
    else if (sinkRateFpm >= 100) quality = 'GOOD';

    const score = crashed ? 0 : clamp(Math.round(
      100 - sinkRateFpm / 7 - rollDeg * 1.8 - Math.abs(pitchDeg - 4) * 1.2 -
      (offRunway ? 35 : 0)
    ), 0, 100);

    return {
      quality,
      score,
      crashed,
      onRunway: surface.onRunway,
      airportId: surface.airport?.id ?? null,
      runwayId: surface.runway?.id ?? null,
      surfaceType: surface.surfaceType,
      sinkRateFpm: Math.round(sinkRateFpm),
      groundSpeedKt: Math.round(groundSpeedMps * MS_TO_KNOTS),
      rollDeg: Number(rollDeg.toFixed(1)),
      pitchDeg: Number(pitchDeg.toFixed(1))
    };
  }

  emit(type, report = null) {
    const event = { type, report, sequence: (this.lastEvent?.sequence ?? 0) + 1 };
    this.lastEvent = event;
    if (report?.quality) this.lastReport = report;
    return event;
  }

  update(dt, state, controls, windEarth = {}, freeFlightForces = null) {
    this.elapsed += dt;
    const surface = this.getSurface(state.position.lat, state.position.lon);
    this.surface = surface;
    const contactAltitude = surface.elevationFt + this.options.GEAR_HEIGHT_FT;
    let groundVelocity = calculateGroundVelocity(state.velocity, state.orientation, windEarth);
    const unconstrainedVelocity = { ...groundVelocity };
    const groundSpeed = Math.hypot(groundVelocity.north, groundVelocity.east);
    const sinkRateFpm = Math.max(0, groundVelocity.down * FPM_PER_MPS);
    const clearanceFt = state.position.altitude - contactAltitude;
    let event = null;

    if (this.crashed) {
      state.position.altitude = contactAltitude;
      groundVelocity = { north: 0, east: 0, down: 0 };
      this.applyGroundVelocity(state, groundVelocity, windEarth);
      state.angularVelocity.p = 0;
      state.angularVelocity.q = 0;
      state.angularVelocity.r = 0;
      controls.throttle = 0;
      controls.brake = 1;
      this.constraintForceEarth = { north: 0, east: 0, down: 0 };
      return this.getStatus(state, controls, groundVelocity, event);
    }

    const totalForceEarth = freeFlightForces?.body
      ? bodyToEarth({
          x: freeFlightForces.body.X,
          y: freeFlightForces.body.Y,
          z: freeFlightForces.body.Z
        }, state.orientation)
      : null;
    const unsupportedUpwardForce = totalForceEarth && totalForceEarth.down < -1;
    const visiblySeparated = clearanceFt > this.options.GROUND_CONTACT_TOLERANCE_FT &&
      groundVelocity.down < -0.25;
    const liftingOff = this.contact && (unsupportedUpwardForce || visiblySeparated);
    if (liftingOff) {
      const maxGroundPitch = this.options.GROUND_MAX_ROTATION_DEG * Math.PI / 180;
      state.orientation.pitch = Math.min(state.orientation.pitch, maxGroundPitch);
      state.angularVelocity.q = clamp(
        state.angularVelocity.q,
        -10 * Math.PI / 180,
        10 * Math.PI / 180
      );
      this.contact = false;
      this.hasBeenAirborne = true;
      this.phase = 'airborne';
      this.message = 'AIRBORNE';
      this.messageUntil = this.elapsed + 3;
      event = this.emit('takeoff');
    }

    const touchingSurface = !this.contact &&
      clearanceFt <= this.options.GROUND_CONTACT_TOLERANCE_FT &&
      groundVelocity.down >= 0;

    if (touchingSurface) {
      if (this.hasBeenAirborne && sinkRateFpm >= this.options.BOUNCE_SINK_RATE_FPM &&
          sinkRateFpm < this.options.CRASH_SINK_RATE_FPM) {
        groundVelocity.down = -groundVelocity.down * 0.28;
        state.position.altitude = contactAltitude + 0.1;
        this.applyGroundVelocity(state, groundVelocity, windEarth);
        this.phase = 'bounce';
        this.message = `BOUNCE ${Math.round(sinkRateFpm)} FPM`;
        this.messageUntil = this.elapsed + 4;
        event = this.emit('bounce', { sinkRateFpm: Math.round(sinkRateFpm) });
        return this.getStatus(state, controls, groundVelocity, event);
      }

      this.contact = true;
      this.phase = 'ground';
      if (this.hasBeenAirborne) {
        const report = this.evaluateTouchdown(state, surface, sinkRateFpm, groundSpeed);
        this.crashed = report.crashed;
        this.phase = report.crashed ? 'crashed' : 'landed';
        this.message = report.crashed
          ? `CRASH — ${report.sinkRateFpm} FPM`
          : `${report.quality} LANDING ${report.score}/100`;
        this.messageUntil = Infinity;
        event = this.emit(report.crashed ? 'crash' : 'touchdown', report);
      }
    }

    if (!this.contact) {
      if (clearanceFt > 10) this.hasBeenAirborne = true;
      this.constraintForceEarth = { north: 0, east: 0, down: 0 };
      return this.getStatus(state, controls, groundVelocity, event);
    }

    state.position.altitude = contactAltitude;
    groundVelocity.down = 0;

    const brake = clamp(controls.brake ?? 0, 0, 1);
    const rough = !surface.onRunway;
    const rollingCoefficient = rough
      ? this.options.ROUGH_GROUND_ROLLING_RESISTANCE
      : this.options.RUNWAY_ROLLING_RESISTANCE;
    const rollingDeceleration = rollingCoefficient * GRAVITY;
    const brakingDeceleration = brake * this.options.BRAKE_DECELERATION;

    if (surface.onRunway) {
      const runwayMotion = runwayFrame(groundVelocity, surface.headingRad);
      runwayMotion.along = moveTowardZero(
        runwayMotion.along,
        (rollingDeceleration + brakingDeceleration) * dt
      );
      runwayMotion.cross = moveTowardZero(
        runwayMotion.cross,
        (this.options.LATERAL_TIRE_GRIP + brakingDeceleration * 0.4) * dt
      );
      const constrained = earthFrame(runwayMotion.along, runwayMotion.cross, surface.headingRad);
      groundVelocity.north = constrained.north;
      groundVelocity.east = constrained.east;
    } else {
      const deceleration = (rollingDeceleration + brakingDeceleration) * dt;
      const speed = Math.hypot(groundVelocity.north, groundVelocity.east);
      const nextSpeed = Math.max(0, speed - deceleration);
      const ratio = speed > 0 ? nextSpeed / speed : 0;
      groundVelocity.north *= ratio;
      groundVelocity.east *= ratio;
    }

    const constrainedSpeed = Math.hypot(groundVelocity.north, groundVelocity.east);
    if (constrainedSpeed < 0.35 && controls.throttle < 0.04) {
      groundVelocity.north = 0;
      groundVelocity.east = 0;
    }

    if (constrainedSpeed < 25 && Math.abs(controls.rudder) > 0.001) {
      const speedFactor = clamp(constrainedSpeed / 10, 0.2, 1);
      state.orientation.yaw += controls.rudder * this.options.GROUND_STEER_RATE *
        Math.PI / 180 * speedFactor * dt;
    }

    state.orientation.roll *= Math.max(0, 1 - dt * 8);
    state.angularVelocity.p *= Math.max(0, 1 - dt * 10);
    state.angularVelocity.r *= Math.max(0, 1 - dt * 12);
    if (constrainedSpeed < 5) {
      state.orientation.pitch *= Math.max(0, 1 - dt * 5);
      state.angularVelocity.q *= Math.max(0, 1 - dt * 8);
    }
    const maxGroundPitch = this.options.GROUND_MAX_ROTATION_DEG * Math.PI / 180;
    const minGroundPitch = -3 * Math.PI / 180;
    if (state.orientation.pitch > maxGroundPitch) {
      state.orientation.pitch = maxGroundPitch;
      state.angularVelocity.q = Math.min(0, state.angularVelocity.q);
    } else if (state.orientation.pitch < minGroundPitch) {
      state.orientation.pitch = minGroundPitch;
      state.angularVelocity.q = Math.max(0, state.angularVelocity.q);
    }
    if (surface.onRunway && Math.abs(controls.rudder) < 0.001) {
      const primary = surface.headingRad;
      const reciprocal = primary + Math.PI;
      const normalize = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
      const primaryError = normalize(primary - state.orientation.yaw);
      const reciprocalError = normalize(reciprocal - state.orientation.yaw);
      const headingError = Math.abs(primaryError) <= Math.abs(reciprocalError)
        ? primaryError
        : reciprocalError;
      const alignmentRate = constrainedSpeed < 1 ? 8 : 5;
      state.orientation.yaw += headingError * Math.min(1, dt * alignmentRate);
    }

    this.constraintForceEarth = {
      north: this.specs.mass * (groundVelocity.north - unconstrainedVelocity.north) / dt,
      east: this.specs.mass * (groundVelocity.east - unconstrainedVelocity.east) / dt,
      down: this.specs.mass * (groundVelocity.down - unconstrainedVelocity.down) / dt
    };
    this.applyGroundVelocity(state, groundVelocity, windEarth);
    return this.getStatus(state, controls, groundVelocity, event);
  }

  getStatus(state, controls, groundVelocity = null, event = null) {
    if (groundVelocity) this.lastGroundVelocity = { ...groundVelocity };
    const velocity = groundVelocity ?? this.lastGroundVelocity ?? bodyToEarth({
      x: state.velocity.u,
      y: state.velocity.v,
      z: state.velocity.w
    }, state.orientation);
    const surface = this.surface ?? this.getSurface(state.position.lat, state.position.lon);
    const aglFt = state.position.altitude - surface.elevationFt;
    return {
      phase: this.phase,
      contact: this.contact,
      crashed: this.crashed,
      hasBeenAirborne: this.hasBeenAirborne,
      airportId: surface.airport?.id ?? null,
      runwayId: surface.runway?.id ?? null,
      surfaceType: surface.surfaceType,
      onRunway: surface.onRunway,
      aglFt,
      groundSpeedKt: Math.hypot(velocity.north, velocity.east) * MS_TO_KNOTS,
      brake: clamp(controls.brake ?? 0, 0, 1),
      message: this.messageUntil > this.elapsed ? this.message : '',
      lastReport: this.lastReport,
      constraintForceEarth: this.constraintForceEarth ?? { north: 0, east: 0, down: 0 },
      event
    };
  }
}
