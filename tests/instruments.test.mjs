import test from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../src/config.js';
import { getChartTheme } from '../src/rendering/chart-themes.js';
import { InstrumentRenderer, getPitchLadderMarks } from '../src/rendering/instruments.js';

test('pitch ladder marks follow the current pitch in five-degree increments', () => {
  const marks = getPitchLadderMarks(12, 20);

  assert.deepEqual(marks, [-5, 0, 5, 10, 15, 20, 25, 30]);
  assert.ok(marks.every((mark, index) => index === 0 || mark - marks[index - 1] === 5));
});

test('pitch indicator can be shown and hidden from configuration', () => {
  const operations = [];
  const ctx = {
    save() {}, restore() {}, beginPath() {}, clip() {}, stroke() {}, fill() {},
    fillRect(...args) { operations.push(['fillRect', ...args]); },
    strokeRect(...args) { operations.push(['strokeRect', ...args]); },
    moveTo() {}, lineTo() {}, rect() {}, translate() {},
    rotate(value) { operations.push(['rotate', value]); },
    fillText() {}, arc() {}
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
    assert.ok(operations.some(([name]) => name === 'fillRect'));
    assert.ok(operations.some(([name, value]) => name === 'rotate' && Math.abs(value + 5 * Math.PI / 180) < 1e-9));

    const operationCount = operations.length;
    CONFIG.SHOW_PITCH_INDICATOR = false;
    renderer.drawAttitudeIndicator(state);
    assert.equal(operations.length, operationCount);
  } finally {
    CONFIG.SHOW_PITCH_INDICATOR = originalVisibility;
  }
});
