import test from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../src/config.js';
import { AircraftSpecs } from '../src/core/aircraft.js';
import { PersistenceManager } from '../src/core/persistence.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function makeSimulator() {
  return {
    config: { ...CONFIG },
    specs: new AircraftSpecs(),
    input: {
      pitchRate: 0.25, rollRate: 0.5, rudderRate: 0.4,
      throttleRate: 0.3, trimRate: 0.05,
      elevatorReturnRate: 1.5, aileronReturnRate: 4,
      rudderReturnRate: 4, trimMin: -0.3, trimMax: 0.3,
      elevatorTrim: 0,
      mouseLookSensitivity: 0.003, mapPanSensitivity: 1,
      joystickEnabled: true, joystickDeadzone: 0.06,
      joystickActivationThreshold: 0.12,
      joystickRollAxis: 0, joystickPitchAxis: 1,
      joystickRudderAxis: 2, joystickThrottleAxis: 3,
      joystickRollInverted: false, joystickPitchInverted: false,
      joystickRudderInverted: false, joystickThrottleReversed: true,
      joystickBrakeButton: 0, joystickFlapsButton: 1,
      joystickTrimDownButton: 4, joystickTrimUpButton: 5
    },
    wind: {
      baseDirection: 270, baseSpeed: 15, directionVariation: 20,
      speedVariation: 5, changeRate: 0.02, verticalWind: 0,
      setBaseWind(direction, speed) { this.baseDirection = direction; this.baseSpeed = speed; },
      windDown: 0
    },
    chart: {
      theme: 'black-white', zoom: 3, rotationMode: 'north-up',
      setTheme(value) { this.theme = value; return true; },
      setZoom(value) { this.zoom = value; },
      setRotationMode(value) { this.rotationMode = value; }
    },
    vectors: { vectorMode: 'all' },
    clients: {
      activeId: 'ascii',
      style: 'vector-day',
      camera: 'cockpit',
      select(value) { this.activeId = value; },
      setStyle(value) { this.style = value; },
      getStyle() { return this.style; },
      setCamera(value) { this.camera = value; },
      getCamera() { return this.camera; }
    },
    energyDiagram: {
      maxSamples: 120, sampleInterval: 0.5, referenceMass: 1000,
      g: 9.81, height: 150,
      margin: { top: 10, right: 60, bottom: 35, left: 80 }
    },
    chartFeatures: { airports: [{ id: 'KTEST' }], vors: [], obstacles: [] }
  };
}

test('autosave restores settings, display state, and chart features', () => {
  const storage = new MemoryStorage();
  const persistence = new PersistenceManager(storage);
  const source = makeSimulator();
  source.config.DEFAULT_MAP_THEME = 'nord';
  source.specs.mass = 1234;
  source.input.pitchRate = 0.8;
  source.input.joystickDeadzone = 0.14;
  source.input.joystickPitchInverted = true;
  source.chart.theme = 'nord';
  source.chart.zoom = 5;
  source.wind.baseSpeed = 22;
  source.clients.select('vector-3d');
  source.clients.setStyle('blueprint');
  source.clients.setCamera('tower');

  assert.equal(persistence.saveAutosave(source, { force: true }), true);

  const target = makeSimulator();
  assert.equal(persistence.apply(target, persistence.loadAutosave()), true);
  assert.equal(target.config.DEFAULT_MAP_THEME, 'nord');
  assert.equal(target.specs.mass, 1234);
  assert.equal(target.input.pitchRate, 0.8);
  assert.equal(target.input.joystickDeadzone, 0.14);
  assert.equal(target.input.joystickPitchInverted, true);
  assert.equal(target.chart.theme, 'nord');
  assert.equal(target.chart.zoom, 5);
  assert.equal(target.wind.baseSpeed, 22);
  assert.equal(target.clients.activeId, 'vector-3d');
  assert.equal(target.clients.style, 'nord');
  assert.equal(target.clients.camera, 'tower');
  assert.equal(target.chartFeatures.airports[0].id, 'KTEST');
});

test('named presets and JSON export round-trip complete snapshots', () => {
  const persistence = new PersistenceManager(new MemoryStorage());
  const simulator = makeSimulator();
  simulator.specs.maxThrust = 3210;

  assert.equal(persistence.savePreset('STOL', simulator), 'STOL');
  assert.deepEqual(persistence.getPresetNames(), ['STOL']);
  const preset = persistence.loadPreset('STOL');
  assert.equal(preset.specs.maxThrust, 3210);
  assert.equal(preset.persistence.profileName, 'STOL');

  const imported = persistence.importJSON(persistence.exportJSON(simulator));
  assert.equal(imported.specs.maxThrust, 3210);
  assert.equal(imported.version, 1);
  assert.equal(persistence.deletePreset('STOL'), true);
  assert.deepEqual(persistence.getPresetNames(), []);
});

test('landing history keeps newest reports first', () => {
  const persistence = new PersistenceManager(new MemoryStorage());
  persistence.recordLanding({ quality: 'GOOD', score: 88 }, 120);
  persistence.recordLanding({ quality: 'SMOOTH', score: 97 }, 240);

  const history = persistence.getLandingHistory();
  assert.equal(history.length, 2);
  assert.equal(history[0].quality, 'SMOOTH');
  assert.equal(history[0].flightTimeSeconds, 240);

  persistence.clearLandingHistory();
  assert.deepEqual(persistence.getLandingHistory(), []);
});
