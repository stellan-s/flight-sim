import { calculateGroundVelocity, getHorizontalSpeed } from '../utils/coordinates.js';
import { MS_TO_KNOTS } from '../utils/constants.js';
import { CONFIG } from '../config.js';
import { calculateIlsGuidance } from '../navigation/ils.js';

const METERS_PER_DEGREE = 111320;
const RAD_TO_DEG = 180 / Math.PI;

const normalizeHeading = value => ((value % 360) + 360) % 360;

function localOffsetMeters(position, origin) {
  return {
    north: (position.lat - origin.lat) * METERS_PER_DEGREE,
    east: (position.lon - origin.lon) * METERS_PER_DEGREE *
      Math.max(0.01, Math.cos(origin.lat * Math.PI / 180))
  };
}
export function calculateRunwayGeometry(position, airport, runway) {
  if (!airport || !runway) return null;
  const offset = localOffsetMeters(position, airport);
  const headingRad = runway.heading * Math.PI / 180;
  const alongMeters = offset.north * Math.cos(headingRad) +
    offset.east * Math.sin(headingRad);
  const crossTrackMeters = -offset.north * Math.sin(headingRad) +
    offset.east * Math.cos(headingRad);

  return {
    alongMeters,
    crossTrackMeters,
    centerlineDistanceMeters: Math.abs(crossTrackMeters),
    centerlineDistanceNm: Math.abs(crossTrackMeters) / 1852
  };
}

export function calculateFlightMetrics(simulator) {
  const { state, wind, airportNav } = simulator;
  const windEarth = {
    north: wind?.windNorth ?? 0,
    east: wind?.windEast ?? 0,
    down: wind?.windDown ?? 0
  };
  const groundVelocity = calculateGroundVelocity(
    state.velocity,
    state.orientation,
    windEarth
  );
  const horizontalSpeedMps = getHorizontalSpeed(groundVelocity);
  const groundTrackDeg = horizontalSpeedMps > 0.05
    ? normalizeHeading(Math.atan2(groundVelocity.east, groundVelocity.north) * RAD_TO_DEG)
    : normalizeHeading(state.orientation.yaw * RAD_TO_DEG);
  const flightPathAngleDeg = Math.atan2(
    -groundVelocity.down,
    Math.max(0.001, horizontalSpeedMps)
  ) * RAD_TO_DEG;
  const { pitch, roll } = state.orientation;
  const { q, r } = state.angularVelocity;
  const turnRateDegPerSecond = (
    (q * Math.sin(roll) + r * Math.cos(roll)) /
    Math.max(0.05, Math.cos(pitch))
  ) * RAD_TO_DEG;

  const airport = airportNav?.selectedAirport ?? null;
  let runway = airportNav?.selectedRunway ?? null;
  if (airport && !runway && typeof airportNav.determineActiveRunway === 'function') {
    runway = airportNav.determineActiveRunway(airport, wind?.direction ?? 0);
  }
  const patternAltitudeAglFt = runway?.trafficPattern?.altitude ?? 1000;
  const runwayGeometry = calculateRunwayGeometry(state.position, airport, runway);
  const ils = calculateIlsGuidance(state.position, airport, runway, {
    glidePathDeg: CONFIG.ILS_GLIDE_PATH_DEG,
    localizerFullScaleDeg: CONFIG.ILS_LOCALIZER_FULL_SCALE_DEG,
    glideslopeFullScaleDeg: CONFIG.ILS_GLIDESLOPE_FULL_SCALE_DEG,
    maxRangeNm: CONFIG.ILS_MAX_RANGE_NM,
    thresholdCrossingHeightFt: CONFIG.ILS_THRESHOLD_CROSSING_HEIGHT_FT
  });

  return {
    groundVelocity,
    groundSpeedKt: horizontalSpeedMps * MS_TO_KNOTS,
    groundTrackDeg,
    flightPathAngleDeg,
    turnRateDegPerSecond,
    sideslipDeg: state.getBeta() * RAD_TO_DEG,
    selectedAirportId: airport?.id ?? null,
    heightAboveSelectedAirportFt: airport
      ? state.position.altitude - airport.elevation
      : null,
    patternAltitudeAglFt: airport ? patternAltitudeAglFt : null,
    patternAltitudeMslFt: airport
      ? airport.elevation + patternAltitudeAglFt
      : null,
    activeRunwayId: runway?.id ?? null,
    activeRunwayHeadingDeg: runway?.heading ?? null,
    runway: runwayGeometry,
    ils
  };
}
