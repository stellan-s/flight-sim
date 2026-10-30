import test from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../src/config.js';
import { AircraftState } from '../src/core/aircraft.js';
import { calculateTrueAirspeedForIAS } from '../src/core/forces.js';
import { ChartRenderer } from '../src/rendering/chart.js';
import { CHART_THEMES, CHART_THEME_NAMES } from '../src/rendering/chart-themes.js';

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
  assert.equal(chart.requestedZoom, CONFIG.DEFAULT_ZOOM);
  assert.equal(chart.baseScale, CONFIG.BASE_SCALE);
  assert.equal(chart.rotationMode, CONFIG.DEFAULT_ROTATION_MODE);
  assert.equal(chart.theme, CONFIG.DEFAULT_MAP_THEME);
  assert.equal(CONFIG.DEFAULT_MAP_THEME, 'black-white');
  assert.deepEqual(CHART_THEME_NAMES, [
    'paper', 'night', 'phosphor', 'amber', 'black-white',
    'github-light', 'github-dark', 'nord', 'dracula',
    'solarized-light', 'solarized-dark', 'gruvbox-dark',
    'tokyo-night', 'catppuccin-mocha'
  ]);

  chart.setZoom(CONFIG.MAX_ZOOM + 1);
  assert.equal(chart.zoom, CONFIG.MAX_ZOOM);

  chart.setZoom(CONFIG.MIN_ZOOM - 1);
  assert.equal(chart.zoom, CONFIG.MIN_ZOOM);

  chart.setZoom(3);
  chart.updateContextZoom(6, 0.25, 4);
  assert.equal(chart.zoom, 6);
  assert.equal(chart.requestedZoom, 3);
  chart.setZoom(2);
  assert.equal(chart.zoom, 6);
  assert.equal(chart.requestedZoom, 2);
  chart.updateContextZoom(null, 0.25, 4);
  assert.equal(chart.zoom, 2);

  const defaultBackground = chart.palette.background;
  assert.equal(chart.setTheme('night'), true);
  assert.equal(chart.theme, 'night');
  assert.notEqual(chart.palette.background, defaultBackground);

  assert.equal(chart.setTheme('not-a-theme'), false);
  assert.equal(chart.theme, 'night');
});

test('every chart theme provides the complete render palette', () => {
  const requiredKeys = Object.keys(CHART_THEMES.paper);

  for (const [name, palette] of Object.entries(CHART_THEMES)) {
    assert.deepEqual(Object.keys(palette), requiredKeys, `${name} palette keys`);
    assert.notEqual(palette.background, palette.foreground, `${name} foreground contrast`);
    assert.ok(Object.values(palette).every(value => typeof value === 'string' && value.length > 0));
  }

  assert.equal(CHART_THEMES['black-white'].background, '#FFFFFF');
  assert.equal(CHART_THEMES['black-white'].foreground, '#000000');
  assert.equal(CHART_THEMES['black-white'].vectorLiftNominal, '#0072B2');
  assert.equal(CHART_THEMES['black-white'].vectorThrust, '#009E73');
  assert.equal(CHART_THEMES['black-white'].vectorDrag, '#D55E00');
  assert.equal(CHART_THEMES['black-white'].vectorSide, '#A23BAA');
  assert.equal(CHART_THEMES['black-white'].vectorGroundTrack, '#E06C00');
});
