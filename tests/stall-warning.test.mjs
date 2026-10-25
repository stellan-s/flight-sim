import test from 'node:test';
import assert from 'node:assert/strict';

import { StallWarningPlayer } from '../src/audio/stall-warning.js';

function makeConfig() {
  return {
    STALL_WARNING_ENABLED: true,
    STALL_WARNING_VOLUME: 0.12,
    STALL_WARNING_FREQUENCY: 680,
    STALL_WARNING_PULSE_HZ: 4
  };
}

function makeAudioContext() {
  const ramps = [];
  const oscillator = {
    type: '',
    frequency: { value: 0 },
    connect() {},
    start() {},
    stop() {}
  };
  const gainNode = {
    connect() {},
    gain: {
      value: 0,
      cancelScheduledValues() {},
      setValueAtTime(value) { this.value = value; },
      linearRampToValueAtTime(value) {
        this.value = value;
        ramps.push(value);
      }
    }
  };
  return {
    currentTime: 0,
    state: 'running',
    destination: {},
    createOscillator: () => oscillator,
    createGain: () => gainNode,
    close() {},
    oscillator,
    gainNode,
    ramps
  };
}

test('stall horn pulses at configured volume and frequency during warning', () => {
  const config = makeConfig();
  const context = makeAudioContext();
  const player = new StallWarningPlayer(config);
  player.audioContext = context;
  player.initAudio();

  const target = player.update({ warning: true, stallSeverity: 0.5 });

  assert.equal(context.oscillator.type, 'triangle');
  assert.equal(context.oscillator.frequency.value, 680);
  assert.equal(target, 0.09);
  assert.equal(context.ramps.at(-1), 0.09);
  assert.equal(player.getState().active, true);
  assert.equal(player.getState().sounding, true);
});

test('stall horn has a silent pulse gap and mutes immediately when paused', () => {
  const context = makeAudioContext();
  const player = new StallWarningPlayer(makeConfig());
  player.audioContext = context;
  player.initAudio();

  context.currentTime = 0.2;
  assert.equal(player.update({ warning: true, stallSeverity: 0.5 }), 0);

  context.currentTime = 0.25;
  assert.ok(player.update({ warning: true, stallSeverity: 0.5 }) > 0);
  assert.equal(player.update({ warning: true, stallSeverity: 1 }, { muted: true }), 0);
  assert.equal(player.getState().active, false);
  assert.equal(player.getState().sounding, false);
});

test('stall horn stays silent on the ground or when disabled', () => {
  const config = makeConfig();
  const player = new StallWarningPlayer(config);

  assert.equal(player.targetGain({ warning: false, stallSeverity: 0 }, 0), 0);
  config.STALL_WARNING_ENABLED = false;
  assert.equal(player.targetGain({ warning: true, stallSeverity: 1 }, 0), 0);
});
