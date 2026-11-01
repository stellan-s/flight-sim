import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clipBodyPolygonToNearPlane,
  clipBodySegmentToNearPlane,
  clipScreenSegmentToRect,
  gridMicroSpacingForHeight,
  gridNearPlaneForHeight,
  gridWireframeForHeight,
  orientationToward,
  projectBodyPoint,
  resolveVector3DStyleId,
  Vector3DClient,
  VECTOR_3D_CAMERA_IDS,
  VECTOR_3D_STYLE_IDS
} from '../src/clients/vector-3d-client.js';
import { CHART_THEMES, CHART_THEME_NAMES } from '../src/rendering/chart-themes.js';

const viewport = { centerX: 640, centerY: 360, focalLength: 600 };

test('3d projection maps forward body coordinates into the viewport', () => {
  assert.deepEqual(projectBodyPoint({ x: 100, y: 0, z: 0 }, viewport), {
    x: 640,
    y: 360,
    depth: 100
  });
  assert.equal(projectBodyPoint({ x: -1, y: 0, z: 0 }, viewport), null);
  assert.ok(projectBodyPoint({ x: 100, y: 10, z: -10 }, viewport).x > 640);
  assert.ok(projectBodyPoint({ x: 100, y: 10, z: -10 }, viewport).y < 360);
});

test('3d line clipping preserves the visible part of a segment', () => {
  const clipped = clipBodySegmentToNearPlane(
    { x: -10, y: -4, z: 2 },
    { x: 10, y: 4, z: -2 },
    1
  );

  assert.equal(clipped[0].x, 1);
  assert.deepEqual(clipped[1], { x: 10, y: 4, z: -2 });
  assert.equal(clipBodySegmentToNearPlane(
    { x: -10, y: 0, z: 0 },
    { x: -2, y: 0, z: 0 },
    1
  ), null);
});

test('3d polygon clipping creates a visible near edge for a runway', () => {
  const clipped = clipBodyPolygonToNearPlane([
    { x: -10, y: -5, z: 2 },
    { x: 100, y: -5, z: 2 },
    { x: 100, y: 5, z: 2 },
    { x: -10, y: 5, z: 2 }
  ], 20);

  assert.equal(clipped.length, 4);
  assert.equal(clipped.filter(point => point.x === 20).length, 2);
});

test('screen clipping preserves the perspective line instead of clamping its coordinates', () => {
  const clipped = clipScreenSegmentToRect(
    { x: -100000, y: -25000 },
    { x: 1000, y: 500 },
    { left: 0, top: 0, right: 1280, bottom: 720 }
  );
  assert.ok(clipped);
  for (const point of clipped) {
    assert.ok(point.x >= 0 && point.x <= 1280);
    assert.ok(point.y >= 0 && point.y <= 720);
    const expectedY = -25000 + (point.x + 100000) * (25500 / 101000);
    assert.ok(Math.abs(point.y - expectedY) < 1e-9);
  }
});

test('ground grid near plane moves close enough to fill the viewport at runway height', () => {
  assert.equal(gridNearPlaneForHeight(0), 1.5);
  assert.ok(gridNearPlaneForHeight(4 * 0.3048) < 2);
  assert.equal(gridNearPlaneForHeight(100), 20);
});

test('ground grid spacing coarsens with camera height', () => {
  assert.equal(gridMicroSpacingForHeight(4 * 0.3048), 2);
  assert.equal(gridMicroSpacingForHeight(5), 5);
  assert.equal(gridMicroSpacingForHeight(20), 10);
  assert.equal(gridMicroSpacingForHeight(50), 25);
  assert.equal(gridMicroSpacingForHeight(100), null);
});

test('ground grid uses one unbroken wireframe scale at each camera height', () => {
  assert.deepEqual(
    [1, 5, 20, 50, 100, 500, 1500, 4000].map(height =>
      gridWireframeForHeight(height).spacing),
    [2, 5, 10, 25, 100, 300, 1000, 2500]
  );
  for (const height of [1, 5, 20, 50, 100, 500, 1500, 4000]) {
    const wireframe = gridWireframeForHeight(height);
    assert.ok(wireframe.range >= wireframe.spacing * 300);
    assert.ok(!Object.hasOwn(wireframe, 'innerRange'));
  }
});

test('vector 3d exposes the same themes as the ASCII chart', () => {
  assert.deepEqual(VECTOR_3D_STYLE_IDS, CHART_THEME_NAMES);
  assert.equal(resolveVector3DStyleId('vector-day'), 'black-white');
  assert.equal(resolveVector3DStyleId('nord-night'), 'nord');
  assert.equal(resolveVector3DStyleId('unknown'), null);
});

test('vector 3d follows chart theme changes and updates the chart when selected', () => {
  const chart = {
    theme: 'black-white',
    setTheme(value) { this.theme = value; return true; }
  };
  const canvas = { getContext: () => ({}) };
  const client = new Vector3DClient(canvas, { simulator: { chart } });

  assert.equal(client.styleId, 'black-white');
  assert.equal(client.style.sky, CHART_THEMES['black-white'].background);
  chart.setTheme('dracula');
  assert.equal(client.styleId, 'dracula');
  assert.equal(client.style.foreground, CHART_THEMES.dracula.foreground);
  assert.equal(client.setStyle('amber'), 'amber');
  assert.equal(chart.theme, 'amber');
  assert.equal(client.setStyle('blueprint'), 'night');
  assert.equal(chart.theme, 'night');
});

test('external cameras use the expected cycle and look-at orientation', () => {
  assert.deepEqual(VECTOR_3D_CAMERA_IDS, ['cockpit', 'chase', 'tower']);
  const north = orientationToward({ north: 100, east: 0, down: 0 });
  assert.equal(north.yaw, 0);
  assert.ok(Math.abs(north.pitch) < 1e-12);
  const rightAndAbove = orientationToward({ north: 0, east: 100, down: -100 });
  assert.ok(Math.abs(rightAndAbove.yaw - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(rightAndAbove.pitch - Math.PI / 4) < 1e-12);
});

test('right-drag look offsets every 3d camera without moving the aircraft', () => {
  const canvas = { getContext: () => ({}) };
  const client = new Vector3DClient(canvas, { simulator: { chart: { theme: 'black-white' } } });
  const frame = {
    position: { lat: 0, lon: 0, altitude: 1200 },
    orientation: { yaw: 0, pitch: 0, roll: 0 }
  };

  client.lookByPixels(100, -50, 0.002);
  const camera = client.resolveCamera(frame);

  assert.ok(Math.abs(camera.orientation.yaw - 0.2) < 1e-12);
  assert.ok(Math.abs(camera.orientation.pitch - 0.1) < 1e-12);
  const look = client.getLook();
  assert.ok(Math.abs(look.yawDeg - 0.2 * 180 / Math.PI) < 1e-12);
  assert.ok(Math.abs(look.pitchDeg - 0.1 * 180 / Math.PI) < 1e-12);
  client.resetLook();
  assert.deepEqual(client.getLook(), { yawDeg: 0, pitchDeg: 0 });
});

test('vector 3d renders the shared HUD around its client-specific scene', () => {
  const calls = [];
  const simulator = {
    drawSharedHudUnderlay() { calls.push('hud-underlay'); },
    drawSharedHudOverlay() { calls.push('hud-overlay'); }
  };
  const client = Object.create(Vector3DClient.prototype);
  client.session = {
    simulator,
    getFrame: () => ({ worldReady: true })
  };
  client.resolveCamera = () => ({ id: 'cockpit' });
  client.drawAttitudeBackground = () => calls.push('background');
  client.drawWorld = () => calls.push('world');
  client.drawForceVectors = () => calls.push('forces');
  client.drawAircraft = () => calls.push('aircraft');
  client.drawPostEffects = () => calls.push('effects');

  client.render();

  assert.deepEqual(calls, [
    'background', 'world', 'hud-underlay', 'forces', 'aircraft', 'effects', 'hud-overlay'
  ]);
});
