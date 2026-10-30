import test from 'node:test';
import assert from 'node:assert/strict';

import { AircraftState, Controls } from '../src/core/aircraft.js';
import { FlightController } from '../src/core/flight-controller.js';
import { calculateFlightMetrics } from '../src/core/flight-metrics.js';
import { FlightRecorder } from '../src/core/flight-recorder.js';

function makeSimulator() {
  return {
    state: new AircraftState(),
    controls: new Controls(),
    wind: { windNorth: 0, windEast: 0, windDown: 0, direction: 0 },
    input: { elevatorTrim: 0 }
  };
}

test('high-level controller owns controls and produces coordinated corrections', () => {
  const simulator = makeSimulator();
  simulator.state.position.altitude = 5000;
  simulator.state.velocity = { u: 45, v: 2, w: 0 };
  simulator.controls.throttle = 0.4;
  const controller = new FlightController(simulator);
  simulator.flightController = controller;

  controller.holdHeading(90);
  controller.holdAltitude(5500);
  controller.holdAirspeed(100);
  controller.update(0.1);

  assert.equal(controller.owner, 'autopilot');
  assert.equal(controller.mode, 'hold');
  assert.ok(simulator.controls.aileron > 0);
  assert.ok(simulator.controls.elevator > 0);
  assert.ok(simulator.controls.throttle > 0.4);
  assert.ok(simulator.controls.rudder < 0);
});

test('human control input disconnects the autopilot and clears its targets', () => {
  const simulator = makeSimulator();
  const controller = new FlightController(simulator);
  controller.holdHeading(180);

  controller.humanOverride();

  assert.equal(controller.owner, 'human');
  assert.equal(controller.mode, 'manual');
  assert.deepEqual(controller.targets, {});
  assert.match(controller.statusMessage, /PILOT INPUT/);
});

test('flight metrics include track, flight path, selected-airport height and centerline error', () => {
  const simulator = makeSimulator();
  simulator.state.position = { lat: 0.001, lon: 0.002, altitude: 2200 };
  simulator.state.velocity = { u: 50, v: 0, w: 0 };
  const airport = {
    id: 'KTEST', lat: 0, lon: 0, elevation: 1200,
    runways: [{ id: '18/36', heading: 180, length: 5000, trafficPattern: { altitude: 1000 } }]
  };
  const runway = {
    ...airport.runways[0], id: '18', physicalRunwayId: '18/36', heading: 180,
    trafficPattern: { altitude: 1000 }
  };
  simulator.airportNav = {
    selectedAirport: airport,
    selectedRunway: runway
  };

  const metrics = calculateFlightMetrics(simulator);

  assert.ok(Math.abs(metrics.groundTrackDeg) < 1e-9);
  assert.ok(Math.abs(metrics.flightPathAngleDeg) < 1e-9);
  assert.equal(metrics.heightAboveSelectedAirportFt, 1000);
  assert.equal(metrics.patternAltitudeMslFt, 2200);
  assert.ok(metrics.runway.centerlineDistanceMeters > 200);
});

test('flight recorder samples on simulation timestamps and exports events', () => {
  const recorder = new FlightRecorder({ sampleIntervalSeconds: 0.1, maxSamples: 3 });
  for (const time of [0, 0.05, 0.1, 0.2, 0.3]) {
    recorder.update(time, () => ({ altitudeMslFt: 1000 + time }));
  }
  recorder.addEvent('takeoff', 0.25, { runwayId: '18' });
  const recording = recorder.export();

  assert.equal(recording.samples.length, 3);
  assert.deepEqual(recording.samples.map(sample => sample.timeSeconds), [0.1, 0.2, 0.3]);
  assert.equal(recording.events[0].type, 'takeoff');
  assert.equal(recorder.getStatus().eventCount, 1);
});
