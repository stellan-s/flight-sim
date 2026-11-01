import test from 'node:test';
import assert from 'node:assert/strict';

import { ClientManager } from '../src/clients/client-manager.js';

test('client manager swaps renderers without replacing shared state', () => {
  const shared = { frames: 0 };
  const ascii = {
    id: 'ascii',
    render() { shared.frames += 1; },
    getPalette() { return { name: 'ascii' }; }
  };
  const threeD = {
    id: 'vector-3d',
    styleId: 'vector-day',
    cameraId: 'cockpit',
    render() { shared.frames += 10; },
    setStyle(value) { this.styleId = value; return value; },
    cycleStyle() { return this.setStyle('nord-night'); },
    setCamera(value) { this.cameraId = value; return value; },
    cycleCamera() { return this.setCamera('chase'); },
    getPalette() { return { name: this.styleId }; }
  };
  const manager = new ClientManager([ascii, threeD]);

  manager.render();
  assert.equal(shared.frames, 1);
  assert.equal(manager.toggle(), 'vector-3d');
  manager.render();
  assert.equal(shared.frames, 11);
  assert.equal(manager.setStyle('blueprint'), 'blueprint');
  assert.equal(manager.getStyle(), 'blueprint');
  assert.equal(manager.setCamera('tower'), 'tower');
  assert.equal(manager.getCamera(), 'tower');
  assert.equal(manager.cycleCamera(), 'chase');
  assert.equal(manager.getPalette().name, 'blueprint');
});

test('3d is accepted as a convenient client alias', () => {
  const manager = new ClientManager([
    { id: 'ascii' },
    { id: 'vector-3d', styleId: 'vector-day', cameraId: 'cockpit' }
  ]);

  assert.equal(manager.select('3d'), 'vector-3d');
  assert.throws(() => manager.select('unknown'), /Unknown client/);
});
