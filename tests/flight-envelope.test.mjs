import test from 'node:test';
import assert from 'node:assert/strict';

import { AircraftSpecs, AircraftState, Controls } from '../src/core/aircraft.js';
import { FlightEnvelopeSystem } from '../src/core/flight-envelope.js';

function makeForces(specs, alphaDeg, { beta = 0, loadFactor = 1 } = {}) {
  return {
    aerodynamic: {
      alpha: alphaDeg * Math.PI / 180,
      beta,
      groundEffect: 0
    },
    components: {
      lift: specs.mass * 9.81 * loadFactor,
      weight: specs.mass * 9.81
    }
  };
}

test('stall warning adds deterministic buffet and wing-drop response', () => {
  const specs = new AircraftSpecs();
  const state = new AircraftState();
  const controls = new Controls();
  const envelope = new FlightEnvelopeSystem(specs);

  const before = state.angularVelocity.p;
  const status = envelope.update(
    0.25,
    state,
    controls,
    makeForces(specs, 17, { beta: 0.08 }),
    { contact: false }
  );

  assert.equal(status.phase, 'stall');
  assert.equal(status.stalled, true);
  assert.ok(status.stallSeverity > 0.5);
  assert.notEqual(state.angularVelocity.p, before);
});

test('developed spin requires forward elevator and opposite rudder to recover', () => {
  const specs = new AircraftSpecs();
  const state = new AircraftState();
  const controls = new Controls();
  const envelope = new FlightEnvelopeSystem(specs);
  state.angularVelocity.p = 0.6;
  const stalledForces = makeForces(specs, 20, { beta: 0.1 });

  let status;
  for (let step = 0; step < 12; step++) {
    status = envelope.update(0.1, state, controls, stalledForces, { contact: false });
  }
  assert.equal(status.spinning, true);

  controls.elevator = -1;
  controls.rudder = -status.spinDirection;
  for (let step = 0; step < 8; step++) {
    status = envelope.update(0.1, state, controls, stalledForces, { contact: false });
  }
  assert.equal(status.spinning, false);
  assert.equal(status.recovering, true);
});

test('G-limit and Vne exceedance accumulate persistent structural damage', () => {
  const specs = new AircraftSpecs();
  const state = new AircraftState();
  const controls = new Controls();
  const envelope = new FlightEnvelopeSystem(specs);
  state.velocity.u = 100;

  const status = envelope.update(
    1,
    state,
    controls,
    makeForces(specs, 2, { loadFactor: 5 }),
    { contact: false }
  );

  assert.equal(status.overspeed, true);
  assert.ok(status.loadFactorG > specs.positiveGLimit);
  assert.ok(status.structuralDamage > 0);
});
