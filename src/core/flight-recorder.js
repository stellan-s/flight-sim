const DEFAULT_SAMPLE_INTERVAL = 0.1;
const DEFAULT_MAX_SAMPLES = 18000;

export class FlightRecorder {
  constructor({
    sampleIntervalSeconds = DEFAULT_SAMPLE_INTERVAL,
    maxSamples = DEFAULT_MAX_SAMPLES
  } = {}) {
    this.sampleIntervalSeconds = sampleIntervalSeconds;
    this.maxSamples = maxSamples;
    this.recording = true;
    this.samples = [];
    this.events = [];
    this.nextSampleTime = 0;
    this.startedAt = new Date().toISOString();
  }

  reset(simulationTime = 0) {
    this.samples.length = 0;
    this.events.length = 0;
    this.nextSampleTime = simulationTime;
    this.startedAt = new Date().toISOString();
  }

  setRecording(recording, simulationTime = 0) {
    this.recording = Boolean(recording);
    if (this.recording) this.nextSampleTime = simulationTime;
    return this.getStatus();
  }

  update(simulationTime, createSample) {
    if (!this.recording || simulationTime + 1e-9 < this.nextSampleTime) return false;
    const sample = createSample();
    this.samples.push({ timeSeconds: simulationTime, ...sample });
    if (this.samples.length > this.maxSamples) {
      this.samples.splice(0, this.samples.length - this.maxSamples);
    }
    this.nextSampleTime = simulationTime + this.sampleIntervalSeconds;
    return true;
  }

  addEvent(type, simulationTime, data = null) {
    const event = { type, timeSeconds: simulationTime, data };
    this.events.push(event);
    if (this.events.length > 2000) this.events.shift();
    return event;
  }

  getStatus() {
    return {
      recording: this.recording,
      sampleIntervalSeconds: this.sampleIntervalSeconds,
      sampleCount: this.samples.length,
      eventCount: this.events.length,
      durationSeconds: this.samples.length > 1
        ? this.samples.at(-1).timeSeconds - this.samples[0].timeSeconds
        : 0
    };
  }

  export() {
    return {
      format: 'vector-flight-recorder',
      version: 1,
      startedAt: this.startedAt,
      sampleIntervalSeconds: this.sampleIntervalSeconds,
      samples: this.samples.map(sample => ({ ...sample })),
      events: this.events.map(event => ({ ...event }))
    };
  }
}
