import { calculateFlightMetrics } from './flight-metrics.js';

const RAD_TO_DEG = 180 / Math.PI;
const band = (value, size) => Number.isFinite(value) ? Math.round(value / size) : null;

function classifySituation(simulator, metrics) {
  const ground = simulator.groundState;
  const envelope = simulator.envelopeState;
  const aglFt = ground?.aglFt ?? null;
  const verticalSpeedFpm = simulator.state.getClimbRate();
  const rollDeg = simulator.state.orientation.roll * RAD_TO_DEG;
  const iasKt = simulator.state.getIAS();

  if (ground?.crashed) return { phase: 'crashed', risk: 'crash' };
  if (envelope?.spinning) return { phase: 'airborne', risk: 'spin' };
  if (envelope?.stalled) return { phase: 'airborne', risk: 'stall' };
  if (ground?.phase === 'bounce') return { phase: 'landing', risk: 'bounce' };
  if (ground?.contact) {
    return {
      phase: ground.phase === 'landing' ? 'landing' : 'ground',
      risk: ground.onRunway === false ? 'off-runway' : 'none'
    };
  }
  if (Number.isFinite(aglFt) && aglFt <= 500 && verticalSpeedFpm < -700) {
    return { phase: metrics.ils?.available ? 'approach' : 'airborne', risk: 'excessive-descent' };
  }
  if (Number.isFinite(aglFt) && aglFt <= 500 && Math.abs(rollDeg) > 20) {
    return { phase: metrics.ils?.available ? 'approach' : 'airborne', risk: 'excessive-bank' };
  }
  if (metrics.ils?.available && Number.isFinite(metrics.ils.distanceToThresholdNm) &&
      metrics.ils.distanceToThresholdNm <= 6) {
    if (aglFt <= 500 && iasKt > 85) return { phase: 'approach', risk: 'high-approach-speed' };
    return { phase: 'approach', risk: 'none' };
  }
  if (envelope?.warning) return { phase: 'airborne', risk: 'stall-warning' };
  return { phase: 'airborne', risk: 'none' };
}

function changedFields(previous, next) {
  if (!previous) return ['initial'];
  return Object.keys(next).filter(key => previous[key] !== next[key]);
}

export class InstructorMonitor {
  constructor({ sampleIntervalSeconds = 1 } = {}) {
    this.sampleIntervalSeconds = sampleIntervalSeconds;
    this.reset(0);
  }

  reset(simulationTime = 0) {
    const previousRevision = Number.isFinite(this.revision) ? this.revision : 0;
    this.nextSampleTime = simulationTime;
    this.sampleCount = 0;
    this.revision = previousRevision;
    this.lastSignature = null;
    this.state = {
      sampleIntervalSeconds: this.sampleIntervalSeconds,
      sampleCount: 0,
      revision: previousRevision,
      changed: false,
      changedFields: [],
      sampledAtFlightTimeSeconds: simulationTime,
      phase: 'unknown',
      risk: 'none'
    };
  }

  update(simulator, simulationTime = 0) {
    if (simulationTime + 1e-9 < this.nextSampleTime) return false;
    this.nextSampleTime = simulationTime + this.sampleIntervalSeconds;
    this.sampleCount += 1;

    const metrics = calculateFlightMetrics(simulator);
    const classification = classifySituation(simulator, metrics);
    const aglFt = simulator.groundState?.aglFt ?? null;
    const iasKt = simulator.state.getIAS();
    const verticalSpeedFpm = simulator.state.getClimbRate();
    const headingDeg = ((simulator.state.orientation.yaw * RAD_TO_DEG) + 360) % 360;
    const rollDeg = simulator.state.orientation.roll * RAD_TO_DEG;
    const onGround = classification.phase === 'ground';
    const monitoredSpeed = onGround
      ? simulator.groundState?.groundSpeedKt ?? 0
      : iasKt;
    const signature = {
      phase: classification.phase,
      risk: classification.risk,
      airport: metrics.selectedAirportId,
      runway: metrics.activeRunwayId,
      ilsAvailable: Boolean(metrics.ils?.available),
      localizerCaptured: Boolean(metrics.ils?.localizerCaptured),
      glideslopeCaptured: Boolean(metrics.ils?.glideslopeCaptured),
      speedBand: band(monitoredSpeed, classification.phase === 'approach' ? 5 : 10),
      heightBand: onGround ? null : band(aglFt, classification.phase === 'approach' ? 50 : 100),
      verticalSpeedBand: onGround ? null : band(verticalSpeedFpm, 250),
      headingBand: band(headingDeg, 10),
      rollBand: onGround ? null : band(rollDeg, 5)
    };
    const changes = changedFields(this.lastSignature, signature);
    const changed = changes.length > 0;
    if (changed) this.revision += 1;
    this.lastSignature = signature;

    this.state = {
      sampleIntervalSeconds: this.sampleIntervalSeconds,
      sampleCount: this.sampleCount,
      revision: this.revision,
      changed,
      changedFields: changes,
      sampledAtFlightTimeSeconds: simulationTime,
      phase: classification.phase,
      risk: classification.risk,
      aircraft: {
        iasKt,
        aglFt,
        altitudeMslFt: simulator.state.position.altitude,
        verticalSpeedFpm,
        headingDeg,
        rollDeg,
        pitchDeg: simulator.state.orientation.pitch * RAD_TO_DEG
      },
      navigation: {
        selectedAirportId: metrics.selectedAirportId,
        activeRunwayId: metrics.activeRunwayId,
        runwayLocked: simulator.airportNav?.runwaySelectionLocked ?? false,
        centerlineSignedMeters: metrics.runway?.crossTrackMeters ?? null,
        ilsAvailable: Boolean(metrics.ils?.available),
        distanceToThresholdNm: metrics.ils?.distanceToThresholdNm ?? null,
        localizerDots: metrics.ils?.localizerDots ?? null,
        glideslopeDots: metrics.ils?.glideslopeDots ?? null,
        localizerCaptured: Boolean(metrics.ils?.localizerCaptured),
        glideslopeCaptured: Boolean(metrics.ils?.glideslopeCaptured)
      }
    };
    return true;
  }

  getState() {
    return structuredClone(this.state);
  }
}
