import test from 'node:test';
import assert from 'node:assert/strict';

import { VectorRenderer } from '../src/rendering/vectors.js';

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}

test('vector labels avoid reserved HUD regions and each other', () => {
  const drawn = [];
  const ctx = {
    save() {}, restore() {},
    measureText(text) { return { width: text.length * 6 }; }
  };
  const renderer = new VectorRenderer({
    ctx,
    canvas: { width: 1280, height: 720 },
    palette: { panelSolid: '#fff' },
    drawLabel(x, y, text) { drawn.push({ x, y, text }); }
  });

  renderer.resetVectorLabelLayout();
  const first = renderer.drawVectorLabel(808, 360, 'THRUST: 900N', '#000');
  const second = renderer.drawVectorLabel(808, 360, 'WIND: 8kt', '#000');

  assert.ok(!renderer.reservedLabelBounds.some(bound => overlaps(first, bound)));
  assert.ok(!renderer.reservedLabelBounds.some(bound => overlaps(second, bound)));
  assert.ok(!overlaps(first, second));
  assert.equal(drawn.length, 2);
});

test('shared state HUD includes every primary flight control', () => {
  const text = [];
  const ctx = {
    save() {}, restore() {},
    fillText(value) { text.push(value); },
    strokeText() {}
  };
  const renderer = new VectorRenderer({
    ctx,
    canvas: { width: 1280, height: 720 },
    palette: {
      accent: '#0ff', foreground: '#fff', panelSolid: '#000'
    }
  });
  renderer.drawStateVectors({
    orientation: { pitch: 0, roll: 0 },
    getAlpha: () => 0,
    getVelocityMagnitude: () => 50
  }, {
    elevator: -0.2,
    aileron: 0.3,
    rudder: -0.4,
    throttle: 0.5,
    flaps: 1 / 3,
    brake: 0.6
  }, {
    getTrimDisplay: () => 0.1
  }, null);

  for (const label of ['ELEV', 'AIL', 'RUD', 'TRIM', 'THR', 'FLAP', 'BRK']) {
    assert.ok(text.some(line => line.startsWith(label)), `${label} missing from shared HUD`);
  }
});
