import test from 'node:test';
import assert from 'node:assert/strict';

import { SimulationSession } from '../src/core/simulation-session.js';

test('simulation session owns one complete fixed physics step', () => {
  const calls = [];
  const simulator = {
    dt: 0.1,
    physicsSubsteps: 2,
    wind: { updateDynamic(dt) { calls.push(['wind', dt]); } },
    flightController: { update(dt) { calls.push(['controller', dt]); } },
    physics: {
      lastGroundState: { phase: 'flight' },
      update(dt) { calls.push(['physics', dt]); return { components: {} }; }
    },
    state: {}, controls: {}, groundState: null,
    envelope: {
      update(dt) { calls.push(['envelope', dt]); return { phase: 'normal' }; }
    },
    handleGroundEvent() {},
    energyDiagram: { update(state, dt) { calls.push(['energy', dt]); } },
    flightTime: 4,
    flightRecorder: { update(time) { calls.push(['recorder', time]); } },
    createRecorderSample() { return {}; },
    updateMapZoom(dt) { calls.push(['zoom', dt]); },
    chart: { setCenter(lat, lon) { calls.push(['center', lat, lon]); } },
    debugInterval: 0,
    debugMode: false,
    config: { DEBUG_OUTPUT_INTERVAL: 1000 }
  };
  simulator.state.position = { lat: 1, lon: 2 };

  new SimulationSession(simulator).stepFixed();

  assert.equal(calls.filter(([name]) => name === 'physics').length, 2);
  assert.deepEqual(calls.find(([name]) => name === 'energy'), ['energy', 0.1]);
  assert.equal(simulator.flightTime, 4.1);
  assert.deepEqual(calls.at(-1), ['center', 1, 2]);
});

test('simulation session exposes renderer-neutral control commands', () => {
  const simulator = {
    controls: { elevator: 0, aileron: 0, rudder: 0, throttle: 0, brake: 0, flaps: 0 },
    paused: false,
    renderCalls: 0,
    render() { this.renderCalls += 1; },
    state: {
      position: { lat: 0, lon: 0, altitude: 1000 },
      orientation: { pitch: 0, roll: 0, yaw: 0 },
      angularVelocity: { p: 0, q: 0, r: 0 },
      velocity: { u: 0, v: 0, w: 0 },
      getIAS: () => 0,
      getClimbRate: () => 0,
      getBeta: () => 0
    },
    input: { elevatorTrim: 0 },
    wind: { direction: 0, speed: 0, windNorth: 0, windEast: 0, windDown: 0 },
    airportNav: null,
    lastForces: null,
    groundState: null,
    envelopeState: null,
    chartFeatures: null,
    flightTime: 0,
    worldReady: true
  };
  const session = new SimulationSession(simulator);

  session.command({
    type: 'set_controls',
    elevator: 2,
    aileron: -0.5,
    throttle: 0.75,
    brake: -1
  });

  assert.equal(simulator.controls.elevator, 1);
  assert.equal(simulator.controls.aileron, -0.5);
  assert.equal(simulator.controls.throttle, 0.75);
  assert.equal(simulator.controls.brake, 0);
  assert.equal(simulator.renderCalls, 1);
});
