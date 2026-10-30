import test from 'node:test';
import assert from 'node:assert/strict';
import chartFeatures from '../data/chart-features.json' with { type: 'json' };

import { CONFIG } from '../src/config.js';
import { AircraftState, AircraftSpecs, Controls } from '../src/core/aircraft.js';
import { GroundSystem } from '../src/core/ground.js';
import { PhysicsEngine } from '../src/core/physics.js';
import { calculateLevelFlightTrim } from '../src/core/trim.js';
import { WindModel } from '../src/navigation/wind.js';

function trimmedFlight(altitudeFt = 5000, airspeedKt = 100) {
  const state = new AircraftState();
  const specs = new AircraftSpecs();
  const controls = new Controls();
  const trim = calculateLevelFlightTrim(specs, altitudeFt, airspeedKt);
  state.position.altitude = altitudeFt;
  state.velocity = { ...trim.velocity };
  state.orientation.pitch = trim.pitch;
  controls.elevator = trim.elevator;
  controls.throttle = trim.throttle;
  return { state, specs, controls, trim, physics: new PhysicsEngine(state, specs, controls) };
}

test('eval: stable level flight remains on its deterministic trim point', () => {
  const flight = trimmedFlight();
  for (let i = 0; i < 60 * 60; i++) flight.physics.update(1 / 60);

  assert.ok(Math.abs(flight.state.position.altitude - 5000) < 1);
  assert.ok(Math.abs(flight.state.getIAS() - 100) < 0.1);
  assert.ok(Math.abs(flight.state.angularVelocity.q) < 0.001);
});

test('eval: a one-second trim disturbance remains bounded without coefficient retuning', () => {
  const flight = trimmedFlight();
  let peakPitchRateDeg = 0;
  let peakPitchExcursionDeg = 0;
  for (let i = 0; i < 60 * 60; i++) {
    flight.controls.elevator = i < 60
      ? flight.trim.elevator + 0.08
      : flight.trim.elevator;
    flight.physics.update(1 / 60);
    peakPitchRateDeg = Math.max(
      peakPitchRateDeg,
      Math.abs(flight.state.angularVelocity.q * 180 / Math.PI)
    );
    peakPitchExcursionDeg = Math.max(
      peakPitchExcursionDeg,
      Math.abs((flight.state.orientation.pitch - flight.trim.pitch) * 180 / Math.PI)
    );
  }

  assert.ok(peakPitchRateDeg < 12);
  assert.ok(peakPitchExcursionDeg < 10);
  assert.ok(Math.abs(flight.state.position.altitude - 5000) < 100);
});

test('eval: crosswind takeoff arms flight without a false touchdown', () => {
  const state = new AircraftState();
  const specs = new AircraftSpecs();
  const controls = new Controls();
  const ground = new GroundSystem(chartFeatures, specs, { ...CONFIG });
  const wind = new WindModel();
  wind.setBaseWind(270, 15);
  ground.spawnOnRunway(state, controls, {
    north: wind.windNorth, east: wind.windEast, down: wind.windDown
  }, 'KABC', '18');
  const physics = new PhysicsEngine(state, specs, controls);
  physics.setWindModel(wind);
  physics.setGroundSystem(ground);
  controls.throttle = 1;
  const events = [];

  for (let i = 0; i < 25 * 60; i++) {
    controls.elevator = (physics.lastGroundState?.groundSpeedKt ?? 0) > 52 ? 0.12 : 0;
    physics.update(1 / 60);
    if (physics.lastGroundState?.event) events.push(physics.lastGroundState.event.type);
  }

  assert.deepEqual(events, ['takeoff']);
  assert.equal(physics.lastGroundState.phase, 'airborne');
  assert.equal(physics.lastGroundState.landingArmed, true);
  assert.ok(physics.lastGroundState.aglFt > 100);
});

test('eval: runway landing produces one deterministic scored touchdown', () => {
  const state = new AircraftState();
  const specs = new AircraftSpecs();
  const controls = new Controls();
  const ground = new GroundSystem(chartFeatures, specs, { ...CONFIG });
  state.position = { lat: 0, lon: 0, altitude: 1200 + CONFIG.GEAR_HEIGHT_FT };
  state.orientation = { pitch: 4 * Math.PI / 180, roll: 0, yaw: Math.PI };
  state.velocity = { u: 30, v: 0, w: 3.5 };
  ground.hasBeenAirborne = true;
  ground.landingArmed = true;

  const status = ground.update(1 / 60, state, controls, {});

  assert.equal(status.event.type, 'touchdown');
  assert.equal(status.lastReport.onRunway, true);
  assert.ok(status.lastReport.score > 0);
  assert.equal(status.crashed, false);
});
