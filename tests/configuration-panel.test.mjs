import test from 'node:test';
import assert from 'node:assert/strict';

import { ConfigurationPanel } from '../src/ui/configuration-panel.js';
import { AircraftSpecs, AircraftState, Controls } from '../src/core/aircraft.js';
import { WindModel } from '../src/navigation/wind.js';

function makeSimulator() {
  return {
    paused: false,
    showHelp: false,
    dt: 1 / 60,
    physicsSubsteps: 1,
    debugMode: false,
    specs: new AircraftSpecs(),
    state: new AircraftState(),
    controls: new Controls(),
    input: {
      elevatorTrim: 0,
      pitchRate: 0.25,
      rollRate: 0.5,
      rudderRate: 0.4,
      throttleRate: 0.3,
      trimRate: 0.05
    },
    wind: new WindModel(),
    chart: {
      zoom: 3,
      baseScale: 10000,
      rotationMode: 'north-up',
      setZoom(value) { this.zoom = value; },
      setRotationMode(value) { this.rotationMode = value; }
    },
    vectors: { vectorMode: 'all' },
    energyDiagram: {
      maxSamples: 120,
      sampleInterval: 0.5,
      referenceMass: 1000,
      g: 9.81,
      height: 150,
      margin: { top: 10, right: 60, bottom: 35, left: 80 }
    },
    chartFeatures: {
      vors: [{ id: 'ABC', name: 'Alpha', lat: 0.1, lon: 0.2, frequency: '113.5' }],
      airports: [{
        id: 'KABC', name: 'Alpha Airport', lat: 0, lon: 0, elevation: 100,
        runways: [{
          id: '18/36', heading: 180, length: 3000, width: 75,
          surfaceType: 'asphalt',
          trafficPattern: { side: 'left', altitude: 1000, distance: 0.8 }
        }]
      }],
      obstacles: [{ lat: 0.2, lon: 0.3, elevation: 1500, agl: 500, type: 'tower' }]
    },
    vorNav: { selectedVOR: null, obs: 0, setOBS(value) { this.obs = value; } },
    airportNav: {
      selectedAirport: null,
      clearSelection() { this.selectedAirport = null; },
      selectAirport(id) {
        this.selectedAirport = this.chartFeatures?.airports?.find(airport => airport.id === id) ?? null;
      }
    },
    physics: {
      computeDerivatives() {
        return {
          forces: { components: { lift: 42 } },
          moments: { L: 1, M: 2, N: 3 }
        };
      }
    },
    lastForces: null,
    retrimCurrentFlight() {},
    resetConfiguredFlight() {}
  };
}

test('configuration panel pauses and restores the simulation', () => {
  const simulator = makeSimulator();
  const panel = new ConfigurationPanel(simulator);

  panel.open();
  assert.equal(panel.isOpen, true);
  assert.equal(simulator.paused, true);

  panel.close();
  assert.equal(panel.isOpen, false);
  assert.equal(simulator.paused, false);
});

test('plus and minus update the selected numeric parameter', () => {
  const simulator = makeSimulator();
  const panel = new ConfigurationPanel(simulator);
  panel.open();

  const original = simulator.dt;
  panel.handleKey({ key: '+', shiftKey: false });
  assert.ok(simulator.dt > original);
  assert.equal(simulator.lastForces.components.lift, 42);
  assert.deepEqual(simulator.lastForces.moments, { L: 1, M: 2, N: 3 });

  panel.handleKey({ key: '-', shiftKey: false });
  assert.ok(Math.abs(simulator.dt - original) < 1e-9);
});

test('arrow keys navigate categories and rows without selecting headings', () => {
  const simulator = makeSimulator();
  const panel = new ConfigurationPanel(simulator);
  panel.open();

  panel.handleKey({ key: 'ArrowRight', shiftKey: false });
  panel.handleKey({ key: 'ArrowDown', shiftKey: false });
  const state = panel.getState();

  assert.equal(state.category, 'LIVE STATE');
  assert.notEqual(state.selectedRow, 'POSITION');
  assert.equal(state.open, true);
});

test('enter supports direct numeric editing', () => {
  const simulator = makeSimulator();
  const panel = new ConfigurationPanel(simulator);
  panel.open();

  panel.handleKey({ key: 'Enter', shiftKey: false });
  for (const key of '0.02') panel.handleKey({ key, shiftKey: false });
  panel.handleKey({ key: 'Enter', shiftKey: false });

  assert.equal(simulator.dt, 0.02);
  assert.equal(panel.getState().editing, false);
});
