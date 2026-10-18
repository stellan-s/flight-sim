import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bodyToEarth,
  calculateGroundVelocity,
  earthToBody,
  getHorizontalSpeed
} from '../src/utils/coordinates.js';

const EPSILON = 1e-10;

test('body and earth transformations round-trip a vector', () => {
  const orientation = { pitch: 0.2, roll: -0.3, yaw: 1.1 };
  const body = { x: 52, y: -3, z: 4 };

  const earth = bodyToEarth(body, orientation);
  const roundTrip = earthToBody(earth, orientation);

  assert.ok(Math.abs(roundTrip.x - body.x) < EPSILON);
  assert.ok(Math.abs(roundTrip.y - body.y) < EPSILON);
  assert.ok(Math.abs(roundTrip.z - body.z) < EPSILON);
});

test('ground velocity combines transformed airspeed with wind', () => {
  const ground = calculateGroundVelocity(
    { u: 50, v: 0, w: 0 },
    { pitch: 0, roll: 0, yaw: 0 },
    { north: 0, east: 10, down: 0 }
  );

  assert.equal(ground.north, 50);
  assert.equal(ground.east, 10);
  assert.equal(ground.down, 0);
  assert.equal(getHorizontalSpeed(ground), Math.hypot(50, 10));
});
