import test from 'node:test';
import assert from 'node:assert/strict';

import { AircraftState } from '../src/core/aircraft.js';

const FEET_PER_MINUTE_PER_METER_PER_SECOND = 196.85;

test('climb rate is positive when the aircraft is moving upward', () => {
  const state = new AircraftState();
  state.velocity = { u: 50, v: 0, w: 0 };
  state.orientation = { pitch: 10 * Math.PI / 180, roll: 0, yaw: 0 };

  const expected = 50 * Math.sin(10 * Math.PI / 180) *
    FEET_PER_MINUTE_PER_METER_PER_SECOND;

  assert.ok(state.getClimbRate() > 0);
  assert.ok(Math.abs(state.getClimbRate() - expected) < 1e-9);
});

test('climb rate is negative when the aircraft is descending', () => {
  const state = new AircraftState();
  state.velocity = { u: 0, v: 0, w: 5 };
  state.orientation = { pitch: 0, roll: 0, yaw: 0 };

  assert.equal(
    state.getClimbRate(),
    -5 * FEET_PER_MINUTE_PER_METER_PER_SECOND
  );
});

test('climb rate is zero in level flight with no vertical velocity', () => {
  const state = new AircraftState();
  state.velocity = { u: 50, v: 0, w: 0 };
  state.orientation = { pitch: 0, roll: 0, yaw: 0 };

  assert.equal(state.getClimbRate(), 0);
});
