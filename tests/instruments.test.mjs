import test from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../src/config.js';
import { getChartTheme } from '../src/rendering/chart-themes.js';
import { InstrumentRenderer } from '../src/rendering/instruments.js';

test('viewport pitch line follows pitch and roll and can be hidden', () => {
  const operations = [];
  const ctx = {
    save() {}, restore() {}, beginPath() {}, stroke() {}, fill() {},
    fillRect(...args) { operations.push(['fillRect', ...args]); },
    strokeRect(...args) { operations.push(['strokeRect', ...args]); },
    moveTo(...args) { operations.push(['moveTo', ...args]); },
    lineTo(...args) { operations.push(['lineTo', ...args]); },
    translate(...args) { operations.push(['translate', ...args]); },
    rotate(value) { operations.push(['rotate', value]); },
    fillText(...args) { operations.push(['fillText', ...args]); },
    measureText(text) { return { width: text.length * 7 }; },
    setLineDash(...args) { operations.push(['setLineDash', ...args]); }
  };
  const renderer = new InstrumentRenderer({
    ctx,
    canvas: { width: 1280, height: 720 },
    palette: getChartTheme('night')
  });
  const state = {
    orientation: { pitch: 10 * Math.PI / 180, roll: 5 * Math.PI / 180 },
    getAlpha: () => 2 * Math.PI / 180
  };
  const originalVisibility = CONFIG.SHOW_PITCH_INDICATOR;

  try {
    CONFIG.SHOW_PITCH_INDICATOR = true;
    renderer.drawAttitudeIndicator(state);
    assert.ok(!operations.some(([name]) => name === 'fillRect'));
    assert.ok(operations.some(([name, value]) => name === 'rotate' && Math.abs(value + 5 * Math.PI / 180) < 1e-9));
    assert.ok(operations.some(([name, x, y]) => name === 'moveTo' && x < -1000 && y === 50));
    assert.ok(operations.some(([name, text]) => name === 'fillText' && text === '+10.0°'));

    const operationCount = operations.length;
    CONFIG.SHOW_PITCH_INDICATOR = false;
    renderer.drawAttitudeIndicator(state);
    assert.equal(operations.length, operationCount);
  } finally {
    CONFIG.SHOW_PITCH_INDICATOR = originalVisibility;
  }
});

test('throttle indicator renders the proportional center-adjacent vector bar', () => {
  const operations = [];
  const ctx = {
    save() {}, restore() {}, beginPath() {}, stroke() {}, fill() {},
    fillRect(...args) { operations.push(['fillRect', ...args]); },
    strokeRect(...args) { operations.push(['strokeRect', ...args]); },
    moveTo(...args) { operations.push(['moveTo', ...args]); },
    lineTo() {},
    fillText(...args) { operations.push(['fillText', ...args]); }
  };
  const renderer = new InstrumentRenderer({
    ctx,
    canvas: { width: 1280, height: 720 },
    palette: getChartTheme('phosphor')
  });
  const originalVisibility = CONFIG.SHOW_THROTTLE_INDICATOR;

  try {
    CONFIG.SHOW_THROTTLE_INDICATOR = true;
    renderer.drawThrottleIndicator(0.5);

    const fill = operations.find(([name, x, y, width, height]) =>
      name === 'fillRect' && width === CONFIG.THROTTLE_INDICATOR_WIDTH - 4 && height === 56
    );
    assert.ok(fill, 'expected a half-height throttle fill');
    assert.ok(operations.some(([name, text]) => name === 'fillText' && text === '50%'));
    assert.equal(fill[1], 1280 / 2 + CONFIG.THROTTLE_INDICATOR_OFFSET_X + 2);
    assert.ok(operations.some(([name]) => name === 'strokeRect'));

    const operationCount = operations.length;
    CONFIG.SHOW_THROTTLE_INDICATOR = false;
    renderer.drawThrottleIndicator(1);
    assert.equal(operations.length, operationCount);
  } finally {
    CONFIG.SHOW_THROTTLE_INDICATOR = originalVisibility;
  }
});

test('ground and envelope status use plain text without panel rectangles', () => {
  const operations = [];
  const ctx = {
    save() {}, restore() {},
    fillText(...args) { operations.push(['fillText', ...args]); },
    fillRect(...args) { operations.push(['fillRect', ...args]); },
    strokeRect(...args) { operations.push(['strokeRect', ...args]); }
  };
  const renderer = new InstrumentRenderer({
    ctx,
    canvas: { width: 1280, height: 720 },
    palette: getChartTheme('black-white')
  });

  renderer.drawGroundStatus({
    contact: true,
    onRunway: true,
    airportId: 'KABC',
    runwayId: '18/36',
    surfaceType: 'asphalt',
    groundSpeedKt: 0,
    brake: 0,
    crashed: false,
    phase: 'ground',
    message: 'LINED UP'
  });
  renderer.drawEnvelopeStatus({
    loadFactorG: 1,
    phase: 'normal',
    alphaDeg: 2,
    failed: false,
    spinning: false,
    recovering: false,
    warning: false,
    overspeed: false,
    structuralDamage: 0,
    groundEffect: 0,
    stalled: false
  }, { flaps: 0 }, { flapMaxDeg: 30 });

  assert.ok(operations.some(([name, text]) => name === 'fillText' && text.startsWith('GROUND ')));
  assert.ok(operations.some(([name, text]) => name === 'fillText' && text.startsWith('ENVELOPE ')));
  assert.ok(!operations.some(([name]) => name === 'fillRect' || name === 'strokeRect'));
});
