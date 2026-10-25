import test from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../src/config.js';
import { AircraftSpecs, AircraftState, Controls } from '../src/core/aircraft.js';
import { GroundSystem } from '../src/core/ground.js';
import { calculateGroundVelocity } from '../src/utils/coordinates.js';

const features = {
  airports: [{
    id: 'KTEST',
    name: 'Test Field',
    lat: 1,
    lon: 2,
    elevation: 725,
    runways: [{
      id: '09/27',
      heading: 90,
      length: 4000,
      width: 100,
      surfaceType: 'asphalt'
    }]
  }]
};

function makeGround() {
  return new GroundSystem(features, new AircraftSpecs(), { ...CONFIG });
}

test('runway spawn uses the selected end, field elevation, and zero ground speed', () => {
  const ground = makeGround();
  const state = new AircraftState();
  const controls = new Controls();
  const wind = { north: 3, east: -7, down: 0 };

  const spawn = ground.spawnOnRunway(state, controls, wind, 'KTEST', '27');
  const groundVelocity = calculateGroundVelocity(state.velocity, state.orientation, wind);

  assert.equal(spawn.runwayEnd, '27');
  assert.ok(Math.abs(state.orientation.yaw - 3 * Math.PI / 2) < 1e-12);
  assert.equal(state.position.altitude, 725 + CONFIG.GEAR_HEIGHT_FT);
  assert.ok(Math.hypot(groundVelocity.north, groundVelocity.east, groundVelocity.down) < 1e-10);
  assert.equal(ground.contact, true);
  assert.equal(controls.throttle, 0);
});

test('wheel brakes and rolling resistance reduce runway ground speed', () => {
  const ground = makeGround();
  const state = new AircraftState();
  const controls = new Controls();
  state.position = { lat: 1, lon: 2, altitude: 725 + CONFIG.GEAR_HEIGHT_FT };
  state.orientation = { pitch: 0, roll: 0, yaw: Math.PI / 2 };
  state.velocity = { u: 20, v: 0, w: 0 };
  controls.brake = 1;
  ground.reset({ contact: true });

  const status = ground.update(1, state, controls, { north: 0, east: 0, down: 0 });

  assert.equal(status.contact, true);
  assert.equal(status.onRunway, true);
  assert.ok(status.groundSpeedKt < 20 * 1.94384);
});

test('runway tire grip realigns yaw while the rudder is neutral', () => {
  const ground = makeGround();
  const state = new AircraftState();
  const controls = new Controls();
  state.position = { lat: 1, lon: 2, altitude: 725 + CONFIG.GEAR_HEIGHT_FT };
  state.orientation = { pitch: 0, roll: 0, yaw: 100 * Math.PI / 180 };
  state.velocity = { u: 20, v: 0, w: 0 };
  ground.reset({ contact: true });

  ground.update(0.1, state, controls, {});

  assert.ok(state.orientation.yaw < 100 * Math.PI / 180);
  assert.ok(state.orientation.yaw > 90 * Math.PI / 180);
});

test('wheel contact limits runway rotation before liftoff', () => {
  const ground = makeGround();
  const state = new AircraftState();
  const controls = new Controls();
  state.position = { lat: 1, lon: 2, altitude: 725 + CONFIG.GEAR_HEIGHT_FT };
  state.orientation = { pitch: 30 * Math.PI / 180, roll: 0, yaw: Math.PI / 2 };
  state.velocity = { u: 25, v: 0, w: 0 };
  state.angularVelocity.q = 1;
  ground.reset({ contact: true });

  ground.update(1 / 60, state, controls, {});

  assert.ok(state.orientation.pitch <= CONFIG.GROUND_MAX_ROTATION_DEG * Math.PI / 180);
  assert.ok(state.angularVelocity.q <= 0);
});

test('wheel contact releases when the free-flight force points upward', () => {
  const ground = makeGround();
  const state = new AircraftState();
  const controls = new Controls();
  state.position = { lat: 1, lon: 2, altitude: 725 + CONFIG.GEAR_HEIGHT_FT };
  state.orientation = { pitch: 12 * Math.PI / 180, roll: 0, yaw: Math.PI / 2 };
  state.velocity = { u: 32, v: 0, w: 0 };
  state.angularVelocity.q = 1;
  ground.reset({ contact: true });

  const status = ground.update(1 / 60, state, controls, {}, {
    body: { X: 0, Y: 0, Z: -500 }
  });

  assert.equal(status.event.type, 'takeoff');
  assert.equal(status.phase, 'airborne');
  assert.equal(status.contact, false);
  assert.ok(state.orientation.pitch <= CONFIG.GROUND_MAX_ROTATION_DEG * Math.PI / 180);
  assert.ok(state.angularVelocity.q <= 10 * Math.PI / 180);
});

test('touchdown is graded and captures runway landing data', () => {
  const ground = makeGround();
  const state = new AircraftState();
  const controls = new Controls();
  state.position = { lat: 1, lon: 2, altitude: 725 + CONFIG.GEAR_HEIGHT_FT };
  state.orientation = { pitch: 4 * Math.PI / 180, roll: 0, yaw: Math.PI / 2 };
  state.velocity = { u: 28, v: 0, w: 2.4 };
  ground.hasBeenAirborne = true;

  const status = ground.update(1 / 60, state, controls, { north: 0, east: 0, down: 0 });

  assert.equal(status.event.type, 'touchdown');
  assert.equal(status.lastReport.airportId, 'KTEST');
  assert.equal(status.lastReport.runwayId, '09/27');
  assert.equal(status.lastReport.onRunway, true);
  assert.ok(status.lastReport.score > 0);
  assert.equal(status.crashed, false);
  assert.ok(status.constraintForceEarth.down < 0);
});

test('hard intermediate contact bounces and excessive sink rate crashes', () => {
  const bounceGround = makeGround();
  const bounceState = new AircraftState();
  const controls = new Controls();
  bounceState.position = { lat: 1, lon: 2, altitude: 725 + CONFIG.GEAR_HEIGHT_FT };
  bounceState.orientation = { pitch: 0, roll: 0, yaw: Math.PI / 2 };
  bounceState.velocity = { u: 25, v: 0, w: 2.5 };
  bounceGround.hasBeenAirborne = true;

  const bounce = bounceGround.update(1 / 60, bounceState, controls, {});
  assert.equal(bounce.event.type, 'bounce');
  assert.equal(bounce.contact, false);
  assert.ok(bounceState.velocity.w < 0);

  const crashGround = makeGround();
  const crashState = new AircraftState();
  crashState.position = { lat: 1, lon: 2, altitude: 725 + CONFIG.GEAR_HEIGHT_FT };
  crashState.orientation = { pitch: 0, roll: 0, yaw: Math.PI / 2 };
  crashState.velocity = { u: 25, v: 0, w: 5 };
  crashGround.hasBeenAirborne = true;

  const crash = crashGround.update(1 / 60, crashState, new Controls(), {});
  assert.equal(crash.event.type, 'crash');
  assert.equal(crash.crashed, true);
  assert.equal(crash.lastReport.quality, 'CRASH');

  const stopped = crashGround.update(1 / 60, crashState, new Controls(), {
    north: 4,
    east: -3,
    down: 0
  });
  assert.equal(stopped.groundSpeedKt, 0);
});
