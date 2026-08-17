import test from 'node:test';
import assert from 'node:assert/strict';

import { AircraftState } from '../src/core/aircraft.js';
import { EnergyDiagram } from '../src/rendering/energy-diagram.js';
import { FEET_TO_METERS } from '../src/utils/constants.js';

test('potential energy converts aircraft altitude from feet to metres', () => {
  const state = new AircraftState();
  state.position.altitude = 5000;
  state.velocity = { u: 0, v: 0, w: 0 };

  const diagram = new EnergyDiagram({});
  diagram.update(state, diagram.sampleInterval);

  const expectedPotentialEnergy = diagram.g * 5000 * FEET_TO_METERS;

  assert.equal(diagram.potentialEnergy[0], expectedPotentialEnergy);
  assert.equal(diagram.kineticEnergy[0], 0);
  assert.equal(diagram.totalEnergy[0], expectedPotentialEnergy);
});

test('total energy is the sum of potential and kinetic energy', () => {
  const state = new AircraftState();
  state.position.altitude = 1000;
  state.velocity = { u: 50, v: 0, w: 0 };

  const diagram = new EnergyDiagram({});
  diagram.update(state, diagram.sampleInterval);

  const expectedPotentialEnergy = diagram.g * 1000 * FEET_TO_METERS;
  const expectedKineticEnergy = 0.5 * 50 ** 2;

  assert.equal(diagram.potentialEnergy[0], expectedPotentialEnergy);
  assert.equal(diagram.kineticEnergy[0], expectedKineticEnergy);
  assert.equal(
    diagram.totalEnergy[0],
    expectedPotentialEnergy + expectedKineticEnergy
  );
});
