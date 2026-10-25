import test from 'node:test';
import assert from 'node:assert/strict';

import { HelpPanel } from '../src/ui/help-panel.js';
import { CHART_THEMES } from '../src/rendering/chart-themes.js';

function makeContext(operations) {
  return {
    _fillStyle: '',
    globalAlpha: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    set fillStyle(value) { this._fillStyle = value; },
    get fillStyle() { return this._fillStyle; },
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    measureText: () => ({ width: 7 }),
    fillRect(...args) { operations.push(['fillRect', this._fillStyle, ...args]); },
    fillText(text) { operations.push(['fillText', this._fillStyle, text]); }
  };
}

function makeSimulator(theme = 'black-white') {
  return {
    showHelp: true,
    paused: false,
    helpOpenedAt: performance.now() - 1000,
    helpScrollOffset: 0,
    chart: { palette: CHART_THEMES[theme] }
  };
}

test('help panel uses the active chart palette and literal ASCII terminal chrome', () => {
  const operations = [];
  const simulator = makeSimulator();
  const panel = new HelpPanel(simulator);
  panel.draw(makeContext(operations), { width: 1280, height: 720 });

  assert.ok(operations.some(([name, color]) =>
    name === 'fillRect' && color === CHART_THEMES['black-white'].background));
  const text = operations
    .filter(([name]) => name === 'fillText')
    .map(([, , value]) => value);
  assert.ok(text.some(value => value.includes('C172 OPERATIONS MANUAL / HELP')));
  assert.ok(text.some(value => value.includes('MANUAL TOPICS')));
  assert.ok(text.every(value => /^[\x20-\x7E]*$/.test(value)));
  assert.equal(panel.activeSection, 'FLIGHT CONTROLS');
});

test('help panel clamps scrolling and updates the active terminal topic', () => {
  const operations = [];
  const simulator = makeSimulator('nord');
  simulator.helpScrollOffset = 999999;
  const panel = new HelpPanel(simulator);
  panel.draw(makeContext(operations), { width: 900, height: 520 });

  assert.ok(simulator.helpScrollOffset < 999999);
  assert.equal(panel.activeSection, 'VOR PROCEDURES');
  assert.ok(operations.some(([name, color]) =>
    name === 'fillRect' && color === CHART_THEMES.nord.background));
  assert.ok(operations.some(([name, color]) =>
    name === 'fillText' && color === CHART_THEMES.nord.accent));
});
