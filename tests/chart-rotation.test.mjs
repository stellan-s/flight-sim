import test from 'node:test';
import assert from 'node:assert/strict';

import { ChartRenderer } from '../src/rendering/chart.js';

const EPSILON = 1e-10;

function createChart() {
  return new ChartRenderer({
    width: 1280,
    height: 720,
    getContext: () => ({})
  });
}

function assertVector(actual, expected) {
  assert.ok(Math.abs(actual.x - expected.x) < EPSILON);
  assert.ok(Math.abs(actual.y - expected.y) < EPSILON);
}

test('north-up projects cardinal headings directly onto the canvas', () => {
  const chart = createChart();

  assertVector(chart.headingToScreenVector(0), { x: 0, y: -1 });
  assertVector(chart.headingToScreenVector(Math.PI / 2), { x: 1, y: 0 });
  assertVector(chart.headingToScreenVector(Math.PI), { x: 0, y: 1 });
  assertVector(chart.headingToScreenVector(3 * Math.PI / 2), { x: -1, y: 0 });
});

test('track-up keeps the aircraft heading pointed toward the top', () => {
  const chart = createChart();
  chart.setRotationMode('track-up');
  chart.aircraftHeading = Math.PI / 2;

  assertVector(
    chart.headingToScreenVector(chart.aircraftHeading),
    { x: 0, y: -1 }
  );
  assertVector(chart.headingToScreenVector(0), { x: -1, y: 0 });
  assertVector(chart.headingToScreenVector(Math.PI), { x: 1, y: 0 });
});

test('track-up rotates geographic positions with direction vectors', () => {
  const chart = createChart();
  chart.setCenter(0, 0);
  chart.setRotationMode('track-up');
  chart.aircraftHeading = Math.PI / 2;

  const pointNorthOfCenter = chart.latLonToPixels(0.01, 0);
  const northDirection = chart.earthVectorToScreen({ north: 1, east: 0 });

  assert.ok(pointNorthOfCenter.x < chart.canvas.width / 2);
  assert.ok(Math.abs(pointNorthOfCenter.y - chart.canvas.height / 2) < EPSILON);
  assertVector(northDirection, { x: -1, y: 0 });
});

test('force projection preserves vertical lift and weight directions', () => {
  const chart = createChart();
  const weight = chart.earthForceToScreen({ north: 0, east: 0, down: 1 });
  const lift = chart.earthForceToScreen({ north: 0, east: 0, down: -1 });

  assert.ok(Math.hypot(weight.x, weight.y) > 0);
  assertVector(lift, { x: -weight.x, y: -weight.y });
});
