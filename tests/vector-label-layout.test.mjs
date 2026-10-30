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
