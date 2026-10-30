import { calculateGroundVelocity } from '../utils/coordinates.js';
import { MS_TO_KNOTS } from '../utils/constants.js';

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const METERS_PER_DEGREE = 111320;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const normalizeHeading = value => ((value % 360) + 360) % 360;
const headingError = (target, current) => ((target - current + 540) % 360) - 180;

function bearingAndDistance(from, to) {
  const north = (to.latitude - from.lat) * METERS_PER_DEGREE;
  const east = (to.longitude - from.lon) * METERS_PER_DEGREE *
    Math.max(0.01, Math.cos(from.lat * DEG_TO_RAD));
  return {
    bearingDeg: normalizeHeading(Math.atan2(east, north) * RAD_TO_DEG),
    distanceNm: Math.hypot(north, east) / 1852
  };
}
function offsetPosition(origin, northMeters, eastMeters) {
  return {
    latitude: origin.lat + northMeters / METERS_PER_DEGREE,
    longitude: origin.lon + eastMeters /
      (METERS_PER_DEGREE * Math.max(0.01, Math.cos(origin.lat * DEG_TO_RAD)))
  };
}

function pointOnCourse(origin, headingDeg, distanceNm) {
  const distanceMeters = distanceNm * 1852;
  const headingRad = headingDeg * DEG_TO_RAD;
  return offsetPosition(
    origin,
    Math.cos(headingRad) * distanceMeters,
    Math.sin(headingRad) * distanceMeters
  );
}

export class FlightController {
  constructor(simulator) {
    this.simulator = simulator;
    this.owner = 'human';
    this.mode = 'manual';
    this.targets = {};
    this.route = [];
    this.routeIndex = 0;
    this.statusMessage = 'MANUAL CONTROL';
    this.autoDisengageOnHumanInput = true;
  }

  setOwner(owner) {
    if (!['human', 'instructor', 'autopilot'].includes(owner)) {
      throw new Error(`Unknown control owner: ${owner}`);
    }
    this.owner = owner;
    if (owner === 'human') {
      this.mode = 'manual';
      this.targets = {};
      this.route = [];
      this.statusMessage = 'MANUAL CONTROL';
    }
    return this.getState();
  }

  disengage(reason = 'DISENGAGED') {
    this.setOwner('human');
    this.statusMessage = reason;
    return this.getState();
  }

  humanOverride() {
    if (this.owner !== 'human' && this.autoDisengageOnHumanInput) {
      return this.disengage('AUTOPILOT OFF — PILOT INPUT');
    }
    return this.getState();
  }

  engage(mode = 'hold', owner = 'autopilot') {
    this.setOwner(owner);
    if (mode === 'direct') {
      this.targets = {};
      this.route = [];
      this.routeIndex = 0;
    }
    this.mode = mode;
    this.statusMessage = `${mode.toUpperCase()} — ${owner.toUpperCase()}`;
    return this.getState();
  }

  holdHeading(headingDeg, options = {}) {
    this.engage('hold', options.owner ?? 'autopilot');
    this.targets.headingDeg = normalizeHeading(headingDeg);
    if (Number.isFinite(options.maxBankDeg)) {
      this.targets.maxBankDeg = clamp(options.maxBankDeg, 5, 35);
    }
    return this.getState();
  }

  holdAltitude(altitudeMslFt, options = {}) {
    this.engage('hold', options.owner ?? 'autopilot');
    this.targets.altitudeMslFt = clamp(altitudeMslFt, -1000, 60000);
    return this.getState();
  }

  holdAirspeed(airspeedKt, options = {}) {
    this.engage('hold', options.owner ?? 'autopilot');
    this.targets.airspeedKt = clamp(airspeedKt, 45, 180);
    return this.getState();
  }

  flyToWaypoint(waypoint, options = {}) {
    const normalized = {
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
      altitudeMslFt: waypoint.altitudeMslFt,
      airspeedKt: waypoint.airspeedKt,
      captureRadiusNm: waypoint.captureRadiusNm ?? 0.15,
      name: waypoint.name ?? 'WAYPOINT'
    };
    if (!Number.isFinite(normalized.latitude) || !Number.isFinite(normalized.longitude)) {
      throw new Error('Waypoint requires finite latitude and longitude');
    }
    this.engage('waypoint', options.owner ?? 'autopilot');
    this.route = [normalized];
    this.routeIndex = 0;
    return this.getState();
  }

  setRoute(mode, waypoints, owner = 'autopilot') {
    this.engage(mode, owner);
    this.route = waypoints;
    this.routeIndex = 0;
    return this.getState();
  }

  joinPattern(airport, runway, options = {}) {
    if (!airport || !runway) throw new Error('Pattern requires an airport and active runway');
    const side = runway.trafficPattern?.side ?? 'left';
    const direction = side === 'right' ? 1 : -1;
    const patternDistanceNm = runway.trafficPattern?.distance ?? 0.8;
    const patternAltitudeMslFt = airport.elevation +
      (runway.trafficPattern?.altitude ?? 1000);
    const downwindHeading = normalizeHeading(runway.heading + 180);
    const lateralHeading = normalizeHeading(runway.heading + direction * 90);
    const lateral = pointOnCourse(airport, lateralHeading, patternDistanceNm);
    const entry = pointOnCourse(lateral, downwindHeading, 1.5);
    const abeam = { ...lateral };
    const base = pointOnCourse(lateral, runway.heading, 1.2);

    return this.setRoute('pattern', [
      { ...entry, altitudeMslFt: patternAltitudeMslFt, airspeedKt: options.airspeedKt ?? 90, captureRadiusNm: 0.25, name: '45 ENTRY' },
      { ...abeam, altitudeMslFt: patternAltitudeMslFt, airspeedKt: options.airspeedKt ?? 90, captureRadiusNm: 0.2, name: 'DOWNWIND' },
      { ...base, altitudeMslFt: patternAltitudeMslFt - 300, airspeedKt: 80, captureRadiusNm: 0.2, name: 'BASE' }
    ], options.owner ?? 'autopilot');
  }

  flyApproach(airport, runway, options = {}) {
    if (!airport || !runway) throw new Error('Approach requires an airport and active runway');
    const physical = (airport.runways ?? []).find(candidate =>
      candidate.id === runway.physicalRunwayId || candidate.id.includes(runway.id)
    ) ?? runway;
    const runwayLengthNm = (physical.length ?? 4000) / 6076.12;
    const threshold = pointOnCourse(airport, normalizeHeading(runway.heading + 180), runwayLengthNm / 2);
    const finalFix = pointOnCourse(threshold, normalizeHeading(runway.heading + 180), options.finalDistanceNm ?? 4);
    const glideAltitude = airport.elevation +
      (options.finalDistanceNm ?? 4) * 6076.12 * Math.tan(3 * DEG_TO_RAD);
    return this.setRoute('approach', [
      { ...finalFix, altitudeMslFt: glideAltitude, airspeedKt: options.airspeedKt ?? 75, captureRadiusNm: 0.25, name: 'FINAL APPROACH FIX' },
      { ...threshold, altitudeMslFt: airport.elevation + 30, airspeedKt: options.thresholdSpeedKt ?? 65, captureRadiusNm: 0.08, name: `RWY ${runway.id}` }
    ], options.owner ?? 'autopilot');
  }

  update(dt) {
    if (this.owner === 'human') return this.getState();
    const sim = this.simulator;
    const state = sim.state;
    const controls = sim.controls;
    const windEarth = {
      north: sim.wind?.windNorth ?? 0,
      east: sim.wind?.windEast ?? 0,
      down: sim.wind?.windDown ?? 0
    };
    const groundVelocity = calculateGroundVelocity(state.velocity, state.orientation, windEarth);
    const groundTrackDeg = normalizeHeading(
      Math.atan2(groundVelocity.east, groundVelocity.north) * RAD_TO_DEG
    );
    const onGround = Boolean(sim.groundState?.contact);

    let waypoint = this.route[this.routeIndex] ?? null;
    if (waypoint) {
      let navigation = bearingAndDistance(state.position, waypoint);
      if (navigation.distanceNm <= waypoint.captureRadiusNm && this.routeIndex < this.route.length - 1) {
        this.routeIndex += 1;
        waypoint = this.route[this.routeIndex];
        navigation = bearingAndDistance(state.position, waypoint);
      } else if (navigation.distanceNm <= waypoint.captureRadiusNm && this.routeIndex === this.route.length - 1) {
        this.mode = 'hold';
        this.route = [];
        this.routeIndex = 0;
        this.statusMessage = `${waypoint.name} CAPTURED`;
      }
      if (waypoint) {
        this.targets.headingDeg = navigation.bearingDeg;
        if (Number.isFinite(waypoint.altitudeMslFt)) this.targets.altitudeMslFt = waypoint.altitudeMslFt;
        if (Number.isFinite(waypoint.airspeedKt)) this.targets.airspeedKt = waypoint.airspeedKt;
        this.statusMessage = `${this.mode.toUpperCase()} ${waypoint.name} ${navigation.distanceNm.toFixed(1)}NM`;
      }
    }

    if (Number.isFinite(this.targets.headingDeg)) {
      const currentCourseDeg = onGround
        ? normalizeHeading(state.orientation.yaw * RAD_TO_DEG)
        : groundTrackDeg;
      const courseError = headingError(this.targets.headingDeg, currentCourseDeg);
      if (onGround) {
        controls.aileron = 0;
        controls.rudder = clamp(
          courseError * 0.035 - state.angularVelocity.r * RAD_TO_DEG * 0.025,
          -0.65,
          0.65
        );
      } else {
        const maxBank = this.targets.maxBankDeg ?? 25;
        const desiredBankDeg = clamp(courseError * 0.45, -maxBank, maxBank);
        const bankDeg = state.orientation.roll * RAD_TO_DEG;
        const rollRateDeg = state.angularVelocity.p * RAD_TO_DEG;
        controls.aileron = clamp(
          (desiredBankDeg - bankDeg) * 0.035 - rollRateDeg * 0.018,
          -0.65,
          0.65
        );
        controls.rudder = clamp(
          -state.getBeta() * RAD_TO_DEG * 0.025,
          -0.25,
          0.25
        );
      }
    }

    if (!onGround && Number.isFinite(this.targets.altitudeMslFt)) {
      const altitudeError = this.targets.altitudeMslFt - state.position.altitude;
      const verticalSpeedFpm = state.getClimbRate();
      const desiredFlightPathAngleDeg = clamp(
        altitudeError * 0.008 - verticalSpeedFpm * 0.0018,
        -8,
        10
      );
      const desiredPitchDeg = state.getAlpha() * RAD_TO_DEG +
        desiredFlightPathAngleDeg;
      const pitchDeg = state.orientation.pitch * RAD_TO_DEG;
      const pitchRateDeg = state.angularVelocity.q * RAD_TO_DEG;
      const trim = sim.input?.elevatorTrim ?? 0;
      const elevator = trim +
        (desiredPitchDeg - pitchDeg) * 0.018 - pitchRateDeg * 0.025;
      controls.elevator = clamp(elevator, -0.65, 0.65);
    }

    if (Number.isFinite(this.targets.airspeedKt)) {
      const error = this.targets.airspeedKt - state.getIAS();
      controls.throttle = clamp(controls.throttle + error * 0.004 * dt, 0, 1);
    }

    return this.getState();
  }

  getState() {
    return {
      owner: this.owner,
      mode: this.mode,
      targets: { ...this.targets },
      route: this.route.map(waypoint => ({ ...waypoint })),
      routeIndex: this.routeIndex,
      statusMessage: this.statusMessage,
      autoDisengageOnHumanInput: this.autoDisengageOnHumanInput
    };
  }
}
