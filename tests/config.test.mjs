import test from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../src/config.js';
import { AircraftState } from '../src/core/aircraft.js';
import { calculateTrueAirspeedForIAS } from '../src/core/forces.js';
import { ChartRenderer } from '../src/rendering/chart.js';
import { CHART_THEME_NAMES } from '../src/rendering/chart-themes.js';

test('configured initial speed produces the requested IAS at altitude', () => {
  const state = new AircraftState();
  state.position.altitude = CONFIG.INITIAL_ALTITUDE;
  state.velocity = {
    u: calculateTrueAirspeedForIAS(
      CONFIG.INITIAL_SPEED,
      CONFIG.INITIAL_ALTITUDE
    ),
    v: 0,
    w: 0
  };

  assert.ok(Math.abs(state.getIAS() - CONFIG.INITIAL_SPEED) < 0.01);
});

test('chart defaults and zoom limits come from configuration', () => {
  const canvas = {
    width: 1280,
    height: 720,
    getContext: () => ({})
  };
  const chart = new ChartRenderer(canvas);

  assert.equal(chart.zoom, CONFIG.DEFAULT_ZOOM);
  assert.equal(chart.baseScale, CONFIG.BASE_SCALE);
  assert.equal(chart.rotationMode, CONFIG.DEFAULT_ROTATION_MODE);
  assert.equal(chart.theme, CONFIG.DEFAULT_MAP_THEME);
  assert.deepEqual(CHART_THEME_NAMES, ['paper', 'night', 'phosphor', 'amber']);

  chart.setZoom(CONFIG.MAX_ZOOM + 1);
  assert.equal(chart.zoom, CONFIG.MAX_ZOOM);

  chart.setZoom(CONFIG.MIN_ZOOM - 1);
  assert.equal(chart.zoom, CONFIG.MIN_ZOOM);

  const paperBackground = chart.palette.background;
  assert.equal(chart.setTheme('night'), true);
  assert.equal(chart.theme, 'night');
  assert.notEqual(chart.palette.background, paperBackground);

  assert.equal(chart.setTheme('not-a-theme'), false);
  assert.equal(chart.theme, 'night');
});
