import test from 'node:test';
import assert from 'node:assert/strict';

import { AircraftState } from '../src/core/aircraft.js';
import { InstructorMonitor } from '../src/core/instructor-monitor.js';

function makeSimulator() {
  const state = new AircraftState();
  state.position.altitude = 2200;
  state.velocity = { u: 50, v: 0, w: 0 };
  return {
    state,
    wind: { windNorth: 0, windEast: 0, windDown: 0, direction: 270 },
    airportNav: null,
    groundState: {
      phase: 'airborne', contact: false, crashed: false, aglFt: 1000, onRunway: false
    },
    envelopeState: { warning: false, stalled: false, spinning: false }
  };
}

test('instructor monitor samples locally once per second', () => {
  const simulator = makeSimulator();
  const monitor = new InstructorMonitor();

  assert.equal(monitor.update(simulator, 0), true);
  assert.equal(monitor.getState().sampleCount, 1);
  assert.equal(monitor.getState().revision, 1);
  assert.equal(monitor.update(simulator, 0.9), false);
  assert.equal(monitor.getState().sampleCount, 1);
  assert.equal(monitor.update(simulator, 1), true);
  assert.equal(monitor.getState().sampleCount, 2);
  assert.equal(monitor.getState().revision, 1);
  assert.equal(monitor.getState().changed, false);
});

test('instructor monitor increments revision only for a meaningful flight-state change', () => {
  const simulator = makeSimulator();
  const monitor = new InstructorMonitor();
  monitor.update(simulator, 0);

  simulator.state.velocity.u = 50.1;
  monitor.update(simulator, 1);
  assert.equal(monitor.getState().revision, 1);

  simulator.groundState.aglFt = 350;
  simulator.state.velocity.w = 4;
  monitor.update(simulator, 2);
  const state = monitor.getState();
  assert.equal(state.revision, 2);
  assert.equal(state.risk, 'excessive-descent');
  assert.ok(state.changedFields.includes('risk'));
});

test('wind-relative airspeed changes do not wake the instructor while stationary', () => {
  const simulator = makeSimulator();
  simulator.groundState = {
    phase: 'ground', contact: true, crashed: false, aglFt: 4.1,
    onRunway: true, groundSpeedKt: 0
  };
  const monitor = new InstructorMonitor();
  monitor.update(simulator, 0);

  simulator.state.velocity.u += 2;
  monitor.update(simulator, 1);

  assert.equal(monitor.getState().revision, 1);
  assert.equal(monitor.getState().changed, false);
});

test('reset keeps revisions monotonic and the next sample describes the new scenario', () => {
  const simulator = makeSimulator();
  const monitor = new InstructorMonitor();
  monitor.update(simulator, 0);

  monitor.reset(0);
  simulator.groundState = {
    phase: 'ground', contact: true, crashed: false, aglFt: 4.1,
    onRunway: true, groundSpeedKt: 0
  };
  monitor.update(simulator, 0);

  const state = monitor.getState();
  assert.equal(state.revision, 2);
  assert.equal(state.phase, 'ground');
  assert.equal(state.risk, 'none');
});
