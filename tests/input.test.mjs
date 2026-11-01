import test from 'node:test';
import assert from 'node:assert/strict';

import { InputHandler } from '../src/controls/input.js';

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
    this.hidden = false;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function createInput() {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const documentTarget = new FakeEventTarget();
  const windowTarget = new FakeEventTarget();
  globalThis.document = documentTarget;
  globalThis.window = windowTarget;

  const canvas = new FakeEventTarget();
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0 });
  const controls = {
    elevator: 0.4,
    aileron: -0.5,
    rudder: 0.3,
    throttle: 0.62,
    brake: 1,
    flaps: 0
  };
  const panCalls = [];
  const lookCalls = [];
  const resetLookCalls = [];
  const chart = {
    canvas,
    panByPixels(...args) { panCalls.push(args); },
    pixelsToLatLon(x, y) { return { lat: y, lon: x }; }
  };
  const simulator = {
    flightController: {
      owner: 'human',
      overrideCount: 0,
      humanOverride() {
        this.owner = 'human';
        this.overrideCount += 1;
      }
    },
    clients: {
      activeId: 'ascii',
      lookByPixels(...args) { lookCalls.push(args); },
      resetLook() { resetLookCalls.push(true); }
    }
  };
  const input = new InputHandler(controls, chart, null, simulator);

  return {
    input,
    controls,
    documentTarget,
    windowTarget,
    canvas,
    panCalls,
    lookCalls,
    resetLookCalls,
    restore() {
      globalThis.document = originalDocument;
      globalThis.window = originalWindow;
    }
  };
}

test('window blur releases held transient controls without changing throttle', () => {
  const fixture = createInput();
  try {
    fixture.input.elevatorTrim = 0.08;
    fixture.input.keys.ArrowDown = true;
    fixture.input.keys.b = true;

    fixture.windowTarget.dispatch('blur');

    assert.deepEqual(fixture.input.keys, {});
    assert.equal(fixture.controls.elevator, 0.08);
    assert.equal(fixture.controls.aileron, 0);
    assert.equal(fixture.controls.rudder, 0);
    assert.equal(fixture.controls.brake, 0);
    assert.equal(fixture.controls.throttle, 0.62);
  } finally {
    fixture.restore();
  }
});

test('joystick arms on movement and maps axes, throttle, brake and flap edge', () => {
  const fixture = createInput();
  const gamepad = {
    id: 'Test Flight Stick',
    index: 0,
    axes: [0, 0, 0, 1],
    buttons: Array.from({ length: 6 }, () => ({ pressed: false, value: 0 }))
  };
  fixture.input.getGamepads = () => [gamepad];
  try {
    fixture.input.update(1 / 60);
    assert.equal(fixture.input.getJoystickState().connected, true);
    assert.equal(fixture.input.getJoystickState().active, false);
    assert.equal(fixture.controls.throttle, 0.62);
    assert.equal(fixture.input.simulator.flightController.overrideCount, 0);

    gamepad.axes = [0.5, -0.5, 0.25, -1];
    gamepad.buttons[0] = { pressed: true, value: 1 };
    gamepad.buttons[1] = { pressed: true, value: 1 };
    fixture.input.update(1 / 60);

    const expectedRoll = (0.5 - fixture.input.joystickDeadzone) /
      (1 - fixture.input.joystickDeadzone);
    assert.equal(fixture.input.getJoystickState().active, true);
    assert.ok(Math.abs(fixture.controls.aileron - expectedRoll) < 1e-12);
    assert.ok(fixture.controls.elevator < 0);
    assert.ok(fixture.controls.rudder > 0);
    assert.equal(fixture.controls.throttle, 1);
    assert.equal(fixture.controls.brake, 1);
    assert.equal(fixture.controls.flaps, 1 / 3);
    assert.equal(fixture.input.simulator.flightController.overrideCount, 1);

    fixture.input.update(1 / 60);
    assert.equal(fixture.controls.flaps, 1 / 3);
  } finally {
    fixture.restore();
  }
});

test('stationary right-click still tunes a VOR instead of panning', () => {
  const fixture = createInput();
  const selections = [];
  fixture.input.vorNav = {
    selectVORByPosition(lat, lon) {
      selections.push({ lat, lon });
      return true;
    }
  };
  const event = values => ({
    preventDefault() {},
    stopPropagation() {},
    ...values
  });
  try {
    fixture.canvas.dispatch('pointerdown', event({
      type: 'pointerdown', button: 2, pointerId: 3, clientX: 50, clientY: 75
    }));
    fixture.canvas.dispatch('pointerup', event({
      type: 'pointerup', pointerId: 3, clientX: 50, clientY: 75
    }));

    assert.deepEqual(selections, [{ lat: 75, lon: 50 }]);
    assert.deepEqual(fixture.panCalls, []);
  } finally {
    fixture.restore();
  }
});

test('right-button drag pans the map and looks around in 3d', () => {
  const fixture = createInput();
  const event = values => ({
    preventDefault() {},
    stopPropagation() {},
    ...values
  });
  try {
    fixture.canvas.dispatch('pointerdown', event({
      button: 2, pointerId: 1, clientX: 100, clientY: 100
    }));
    fixture.canvas.dispatch('pointermove', event({
      pointerId: 1, clientX: 140, clientY: 80
    }));
    fixture.canvas.dispatch('pointerup', event({
      pointerId: 1, clientX: 140, clientY: 80
    }));
    assert.deepEqual(fixture.panCalls, [[40, -20]]);

    fixture.input.simulator.clients.activeId = 'vector-3d';
    fixture.canvas.dispatch('pointerdown', event({
      button: 2, pointerId: 2, clientX: 200, clientY: 200
    }));
    fixture.canvas.dispatch('pointermove', event({
      pointerId: 2, clientX: 170, clientY: 240
    }));
    fixture.canvas.dispatch('pointerup', event({
      pointerId: 2, clientX: 170, clientY: 240
    }));
    assert.deepEqual(fixture.lookCalls, [[-30, 40, fixture.input.mouseLookSensitivity]]);
    assert.equal(fixture.resetLookCalls.length, 1);
  } finally {
    fixture.restore();
  }
});

test('hidden document releases controls but does not overwrite autopilot outputs', () => {
  const fixture = createInput();
  try {
    fixture.input.simulator.flightController.owner = 'autopilot';
    fixture.documentTarget.hidden = true;
    fixture.documentTarget.dispatch('visibilitychange');

    assert.deepEqual(fixture.input.keys, {});
    assert.equal(fixture.controls.brake, 0);
    assert.equal(fixture.controls.elevator, 0.4);
    assert.equal(fixture.controls.aileron, -0.5);
    assert.equal(fixture.controls.rudder, 0.3);
  } finally {
    fixture.restore();
  }
});
