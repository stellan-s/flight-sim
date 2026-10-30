import test from 'node:test';
import assert from 'node:assert/strict';

import {
  asciiBar,
  signedAsciiBar
} from '../src/rendering/ascii-hud.js';

test('ASCII bars clamp and render deterministic fill levels', () => {
  assert.equal(asciiBar(0), '[..........]');
  assert.equal(asciiBar(0.5), '[#####.....]');
  assert.equal(asciiBar(2), '[##########]');
});

test('signed ASCII bars grow away from a fixed center mark', () => {
  assert.equal(signedAsciiBar(0), '[....|....]');
  assert.equal(signedAsciiBar(0.5), '[....|##..]');
  assert.equal(signedAsciiBar(-0.5), '[..##|....]');
});
