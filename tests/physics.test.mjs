import test from 'node:test';
import assert from 'node:assert/strict';

import { AircraftState, AircraftSpecs, Controls } from '../src/core/aircraft.js';
import { PhysicsEngine } from '../src/core/physics.js';

test('RK4 temporary states read their own intermediate values', () => {
  const originalState = new AircraftState();
  originalState.velocity = { u: 50, v: 0, w: 0 };

  const physics = new PhysicsEngine(
    originalState,
    new AircraftSpecs(),
    new Controls()
  );
  const intermediateState = physics.cloneState(originalState);

  intermediateState.velocity.u = 80;

  assert.ok(intermediateState instanceof AircraftState);
  assert.equal(intermediateState.getVelocityMagnitude(), 80);
  assert.equal(originalState.getVelocityMagnitude(), 50);
});

test('RK4 temporary state objects are isolated from the original state', () => {
  const originalState = new AircraftState();
  const physics = new PhysicsEngine(
    originalState,
    new AircraftSpecs(),
    new Controls()
  );
  const intermediateState = physics.cloneState(originalState);

  intermediateState.position.altitude = 8000;
  intermediateState.orientation.pitch = 0.2;
  intermediateState.angularVelocity.q = 0.1;

  assert.equal(originalState.position.altitude, 5000);
  assert.equal(originalState.orientation.pitch, 0);
  assert.equal(originalState.angularVelocity.q, 0);
});
