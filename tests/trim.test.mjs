import test from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../src/config.js';
import { AircraftSpecs, AircraftState, Controls } from '../src/core/aircraft.js';
import {
  calculateAerodynamicForces,
  calculateMoments
} from '../src/core/forces.js';
import { calculateLevelFlightTrim } from '../src/core/trim.js';

test('calculated initial trim balances forces and pitching moment', () => {
  const specs = new AircraftSpecs();
  const trim = calculateLevelFlightTrim(
    specs,
    CONFIG.INITIAL_ALTITUDE,
    CONFIG.INITIAL_SPEED
  );
  const state = new AircraftState();
  state.position.altitude = CONFIG.INITIAL_ALTITUDE;
  state.velocity = { ...trim.velocity };
  state.orientation = { pitch: trim.pitch, roll: 0, yaw: 0 };
  const controls = new Controls();
  controls.elevator = trim.elevator;
  controls.throttle = trim.throttle;

  const forces = calculateAerodynamicForces(state, specs, controls);
  const moments = calculateMoments(state, specs, controls, forces);

  assert.ok(Math.abs(forces.body.X) < 1e-8);
  assert.ok(Math.abs(forces.body.Y) < 1e-8);
  assert.ok(Math.abs(forces.body.Z) < 1e-8);
  assert.ok(Math.abs(moments.M) < 1e-8);
  assert.ok(Math.abs(state.getClimbRate()) < 1e-8);
  assert.ok(Math.abs(state.getIAS() - CONFIG.INITIAL_SPEED) < 0.01);
  assert.ok(trim.throttle > 0 && trim.throttle < 1);
  assert.ok(Math.abs(trim.elevator) < 1);
});

test('level-flight trim includes deployed flap lift, drag, and pitch effects', () => {
  const specs = new AircraftSpecs();
  const clean = calculateLevelFlightTrim(specs, 3000, 80);
  const extended = calculateLevelFlightTrim(specs, 3000, 80, { flaps: 1 });

  assert.ok(extended.alpha < clean.alpha);
  assert.ok(extended.drag > clean.drag);
  assert.notEqual(extended.elevator, clean.elevator);
  assert.ok(extended.throttle > clean.throttle);
});
