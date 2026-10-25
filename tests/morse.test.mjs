import test from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../src/config.js';
import { MorseCodePlayer } from '../src/audio/morse.js';

test('morse beep envelope uses the configured lower peak volume', async () => {
  const events = [];
  const player = new MorseCodePlayer();
  player.audioContext = {
    currentTime: 10,
    destination: {},
    createOscillator() {
      return {
        frequency: { value: 0 },
        type: '',
        connect() {},
        start() {},
        stop() {}
      };
    },
    createGain() {
      return {
        connect() {},
        gain: {
          setValueAtTime(value, time) { events.push(['set', value, time]); },
          linearRampToValueAtTime(value, time) { events.push(['ramp', value, time]); }
        }
      };
    }
  };

  await player.playBeep(10);

  assert.equal(CONFIG.MORSE_VOLUME, 0.08);
  assert.deepEqual(events.map(([, value]) => value), [0, 0.08, 0.08, 0]);
});
