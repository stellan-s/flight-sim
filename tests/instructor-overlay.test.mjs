import test from 'node:test';
import assert from 'node:assert/strict';

import { InstructorOverlay } from '../src/ui/instructor-overlay.js';
import { getChartTheme } from '../src/rendering/chart-themes.js';

function context(operations) {
  return {
    font: '',
    fillStyle: '',
    save() {},
    restore() {},
    measureText(text) { return { width: text.length * 8 }; },
    fillRect(...args) { operations.push(['fillRect', this.fillStyle, ...args]); },
    fillText(...args) { operations.push(['fillText', this.fillStyle, ...args]); },
    strokeText(...args) { operations.push(['strokeText', ...args]); }
  };
}

test('instructor draws a high-contrast borderless subtitle strip', () => {
  const operations = [];
  const overlay = new InstructorOverlay();
  const palette = getChartTheme('black-white');
  overlay.show('Hold 75 knots and trim the pressure away.', { durationSeconds: 60 }, 10);

  overlay.draw(context(operations), { width: 1280, height: 720 }, palette, 20);

  assert.ok(operations.some(([name, color]) =>
    name === 'fillRect' && color === palette.foreground));
  assert.ok(operations.some(([name, color, text]) =>
    name === 'fillText' && color === palette.background && text.includes('HOLD 75 KNOTS')));
});

test('instructor wraps long subtitles and stops drawing after expiry', () => {
  const operations = [];
  const overlay = new InstructorOverlay();
  const ctx = context(operations);
  const palette = getChartTheme('nord');
  overlay.show('This is a deliberately long instruction that needs to wrap inside a narrow simulator viewport.', { durationSeconds: 5 }, 0);

  overlay.draw(ctx, { width: 360, height: 480 }, palette, 1);
  assert.equal(operations.filter(([name]) => name === 'fillText').length, 2);

  operations.length = 0;
  overlay.draw(ctx, { width: 360, height: 480 }, palette, 6);
  assert.equal(operations.length, 0);
});
