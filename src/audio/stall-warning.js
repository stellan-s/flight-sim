import { CONFIG } from '../config.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class StallWarningPlayer {
  constructor(config = CONFIG, contextFactory = null) {
    this.config = config;
    this.contextFactory = contextFactory;
    this.audioContext = null;
    this.oscillator = null;
    this.gainNode = null;
    this.unlockTarget = null;
    this.commanded = false;
    this.currentGain = 0;
    this.unlockHandler = () => this.unlock();
  }

  initAudio() {
    if (!this.audioContext) {
      const Context = this.contextFactory ??
        globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Context) return null;
      this.audioContext = new Context();
    }

    if (!this.oscillator || !this.gainNode) {
      this.oscillator = this.audioContext.createOscillator();
      this.gainNode = this.audioContext.createGain();
      this.oscillator.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);
      this.oscillator.type = 'triangle';
      this.oscillator.frequency.value = this.config.STALL_WARNING_FREQUENCY;
      this.gainNode.gain.value = 0;
      this.oscillator.start();
    }

    return this.audioContext;
  }

  attachUnlock(target = globalThis.document) {
    if (!target?.addEventListener || this.unlockTarget === target) return;
    this.detachUnlock();
    this.unlockTarget = target;
    for (const eventName of ['keydown', 'pointerdown', 'touchstart']) {
      target.addEventListener(eventName, this.unlockHandler, { passive: true });
    }
  }

  detachUnlock() {
    if (!this.unlockTarget?.removeEventListener) return;
    for (const eventName of ['keydown', 'pointerdown', 'touchstart']) {
      this.unlockTarget.removeEventListener(eventName, this.unlockHandler);
    }
    this.unlockTarget = null;
  }

  unlock() {
    const context = this.initAudio();
    if (context?.state === 'suspended') {
      context.resume().catch(() => {});
    }
  }

  targetGain(status, audioTime, muted = false) {
    const enabled = this.config.STALL_WARNING_ENABLED !== false;
    this.commanded = Boolean(enabled && status?.warning && !muted);
    if (!this.commanded) return 0;

    const severity = clamp(status?.stallSeverity ?? 0, 0, 1);
    const volume = clamp(this.config.STALL_WARNING_VOLUME ?? 0, 0, 1);
    const pulseRate = Math.max(0.1, this.config.STALL_WARNING_PULSE_HZ ?? 3);
    const phase = (audioTime * pulseRate) % 1;
    const dutyCycle = 0.55 + severity * 0.25;
    const pulseOn = severity >= 0.95 || phase < dutyCycle;
    return pulseOn ? volume * (0.5 + severity * 0.5) : 0;
  }

  update(status, { muted = false } = {}) {
    const now = this.audioContext?.currentTime ?? 0;
    const target = this.targetGain(status, now, muted);
    if (!this.audioContext || !this.gainNode || !this.oscillator) return target;

    this.oscillator.frequency.value = clamp(
      this.config.STALL_WARNING_FREQUENCY ?? 680,
      80,
      4000
    );
    const gain = this.gainNode.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(this.currentGain, now);
    gain.linearRampToValueAtTime(target, now + (target > 0 ? 0.012 : 0.025));
    this.currentGain = target;
    return target;
  }

  getState() {
    return {
      enabled: this.config.STALL_WARNING_ENABLED !== false,
      unlocked: Boolean(this.audioContext && this.audioContext.state !== 'suspended'),
      active: this.commanded,
      sounding: this.currentGain > 0,
      volume: clamp(this.config.STALL_WARNING_VOLUME ?? 0, 0, 1),
      frequencyHz: clamp(this.config.STALL_WARNING_FREQUENCY ?? 680, 80, 4000),
      pulseHz: Math.max(0.1, this.config.STALL_WARNING_PULSE_HZ ?? 3)
    };
  }

  stop() {
    this.detachUnlock();
    this.commanded = false;
    this.currentGain = 0;
    try {
      this.oscillator?.stop();
    } catch {
      // The oscillator may already have stopped.
    }
    this.audioContext?.close?.();
    this.oscillator = null;
    this.gainNode = null;
    this.audioContext = null;
  }
}
