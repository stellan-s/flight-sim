import test from 'node:test';
import assert from 'node:assert/strict';

import { AircraftState, AircraftSpecs, Controls } from '../src/core/aircraft.js';
import { PhysicsEngine } from '../src/core/physics.js';
import { calculateAerodynamicForces, calculateMoments } from '../src/core/forces.js';

function simulatePitchResponse(dt) {
  const state = new AircraftState();
  state.position.altitude = 5000;
  state.velocity = { u: 55, v: 0, w: 2 };
  state.orientation.pitch = 0.04;
  const controls = new Controls();
  controls.elevator = 0.08;
  controls.throttle = 0.45;
  const physics = new PhysicsEngine(state, new AircraftSpecs(), controls);

  const steps = Math.round(2 / dt);
  for (let i = 0; i < steps; i++) physics.update(dt);
  return state.orientation.pitch;
}

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

test('physics updates return finite moments for diagnostics and rendering', () => {
  const state = new AircraftState();
  const physics = new PhysicsEngine(
    state,
    new AircraftSpecs(),
    new Controls()
  );

  const result = physics.update(1 / 60);

  assert.ok(Number.isFinite(result.moments.L));
  assert.ok(Number.isFinite(result.moments.M));
  assert.ok(Number.isFinite(result.moments.N));
});

test('RK4 converges as the timestep is reduced', () => {
  const coarse = simulatePitchResponse(1 / 30);
  const medium = simulatePitchResponse(1 / 60);
  const fine = simulatePitchResponse(1 / 120);

  assert.ok(Math.abs(medium - fine) < Math.abs(coarse - fine));
});

test('runtime force and moment gains scale their modeled outputs', () => {
  const state = new AircraftState();
  state.velocity = { u: 55, v: 2, w: 4 };
  state.angularVelocity = { p: 0.02, q: -0.01, r: 0.03 };
  const controls = new Controls();
  controls.aileron = 0.1;
  const specs = new AircraftSpecs();

  const baselineForces = calculateAerodynamicForces(state, specs, controls);
  const baselineMoments = calculateMoments(state, specs, controls, baselineForces);

  specs.liftMultiplier = 1.5;
  specs.dragMultiplier = 0.5;
  specs.thrustMultiplier = 2;
  specs.rollMomentMultiplier = 1.75;
  const tunedForces = calculateAerodynamicForces(state, specs, controls);
  const tunedMoments = calculateMoments(state, specs, controls, tunedForces);

  assert.ok(Math.abs(tunedForces.components.lift / baselineForces.components.lift - 1.5) < 1e-12);
  assert.ok(Math.abs(tunedForces.components.drag / baselineForces.components.drag - 0.5) < 1e-12);
  assert.ok(Math.abs(tunedForces.components.thrust / baselineForces.components.thrust - 2) < 1e-12);
  assert.ok(Math.abs(tunedMoments.L / baselineMoments.L - 1.75) < 1e-12);
});
