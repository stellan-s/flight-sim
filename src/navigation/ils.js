const METERS_PER_DEGREE = 111320;
const FEET_PER_NM = 6076.12;
const METERS_PER_NM = 1852;
const RAD_TO_DEG = 180 / Math.PI;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function offsetMeters(point, origin) {
  return {
    north: (point.lat - origin.lat) * METERS_PER_DEGREE,
    east: (point.lon - origin.lon) * METERS_PER_DEGREE *
      Math.max(0.01, Math.cos(origin.lat * Math.PI / 180))
  };
}

function offsetPoint(origin, northMeters, eastMeters) {
  const latitudeScale = Math.max(0.01, Math.cos(origin.lat * Math.PI / 180));
  return {
    lat: origin.lat + northMeters / METERS_PER_DEGREE,
    lon: origin.lon + eastMeters / (METERS_PER_DEGREE * latitudeScale)
  };
}

export function getRunwayThreshold(airport, runway) {
  if (!airport || !runway || !Number.isFinite(runway.heading)) return null;
  const headingRad = runway.heading * Math.PI / 180;
  const halfLengthMeters = Math.max(0, runway.length ?? 0) * 0.3048 / 2;
  return offsetPoint(
    airport,
    -Math.cos(headingRad) * halfLengthMeters,
    -Math.sin(headingRad) * halfLengthMeters
  );
}

/**
 * Calculate localizer and glideslope guidance for one runway end.
 * Positive localizer error means the aircraft is right of centerline.
 * Positive glideslope error means the aircraft is above the glide path.
 */
export function calculateIlsGuidance(position, airport, runway, options = {}) {
  const glidePathDeg = options.glidePathDeg ?? 3;
  const localizerFullScaleDeg = options.localizerFullScaleDeg ?? 2.5;
  const glideslopeFullScaleDeg = options.glideslopeFullScaleDeg ?? 0.7;
  const maxRangeNm = options.maxRangeNm ?? 18;
  const thresholdCrossingHeightFt = options.thresholdCrossingHeightFt ?? 50;
  const threshold = getRunwayThreshold(airport, runway);

  if (!position || !airport || !runway || !threshold) {
    return {
      available: false,
      reason: 'SELECT AIRPORT',
      airportId: airport?.id ?? null,
      runwayId: runway?.id ?? null
    };
  }

  const headingRad = runway.heading * Math.PI / 180;
  const offset = offsetMeters(position, threshold);
  const alongMeters = offset.north * Math.cos(headingRad) +
    offset.east * Math.sin(headingRad);
  const crossTrackMeters = -offset.north * Math.sin(headingRad) +
    offset.east * Math.cos(headingRad);
  const distanceToThresholdNm = -alongMeters / METERS_PER_NM;
  const slantRangeNm = Math.hypot(alongMeters, crossTrackMeters) / METERS_PER_NM;
  const localizerErrorDeg = Math.atan2(
    crossTrackMeters,
    Math.max(1, -alongMeters)
  ) * RAD_TO_DEG;
  const heightAboveThresholdFt = position.altitude - airport.elevation;
  const actualGlideAngleDeg = Math.atan2(
    heightAboveThresholdFt - thresholdCrossingHeightFt,
    Math.max(1, distanceToThresholdNm * FEET_PER_NM)
  ) * RAD_TO_DEG;
  const glideslopeErrorDeg = actualGlideAngleDeg - glidePathDeg;
  const targetAltitudeMslFt = airport.elevation + thresholdCrossingHeightFt +
    Math.max(0, distanceToThresholdNm) * FEET_PER_NM *
      Math.tan(glidePathDeg / RAD_TO_DEG);
  const inFrontOfRunway = distanceToThresholdNm >= 0;
  const inRange = inFrontOfRunway && slantRangeNm <= maxRangeNm;
  const localizerNeedle = clamp(
    -localizerErrorDeg / Math.max(0.01, localizerFullScaleDeg),
    -1,
    1
  );
  const glideslopeNeedle = clamp(
    glideslopeErrorDeg / Math.max(0.01, glideslopeFullScaleDeg),
    -1,
    1
  );
  const localizerCaptured = inRange && Math.abs(localizerNeedle) <= 0.25;
  const glideslopeCaptured = inRange && Math.abs(glideslopeNeedle) <= 0.25;
  const captured = localizerCaptured && glideslopeCaptured;

  return {
    available: inRange,
    reason: inRange ? null : (inFrontOfRunway ? 'OUT OF RANGE' : 'BEYOND THRESHOLD'),
    airportId: airport.id,
    runwayId: runway.id,
    runwayHeadingDeg: runway.heading,
    threshold,
    distanceToThresholdNm,
    slantRangeNm,
    crossTrackMeters,
    localizerErrorDeg,
    glideslopeErrorDeg,
    localizerNeedle,
    glideslopeNeedle,
    localizerDots: localizerErrorDeg / Math.max(0.01, localizerFullScaleDeg / 2.5),
    glideslopeDots: glideslopeErrorDeg / Math.max(0.01, glideslopeFullScaleDeg / 2.5),
    glidePathDeg,
    targetAltitudeMslFt,
    heightErrorFt: position.altitude - targetAltitudeMslFt,
    localizerCaptured,
    glideslopeCaptured,
    captured,
    status: captured
      ? 'ILS CAPTURED'
      : localizerCaptured
        ? 'LOC CAPTURED / GS INTERCEPT'
        : 'ILS INTERCEPT'
  };
}
