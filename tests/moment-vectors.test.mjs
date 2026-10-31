import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateMomentSweep,
  formatMomentLabel
} from '../src/rendering/vectors.js';

const OPTIONS = {
  fullScale: 20000,
  minSweepDeg: 18,
  maxSweepDeg: 300
};

test('moment arc sweep grows with magnitude and saturates at full scale', () => {
  const small = calculateMomentSweep(500, OPTIONS);
  const medium = calculateMomentSweep(5000, OPTIONS);
  const full = calculateMomentSweep(20000, OPTIONS);
  const beyondFull = calculateMomentSweep(40000, OPTIONS);

  assert.ok(small > 0);
  assert.ok(medium > small);
  assert.ok(full > medium);
  assert.equal(beyondFull, full);
});

test('moment arc direction follows the moment sign and hides near zero', () => {
  const positive = calculateMomentSweep(5000, OPTIONS);
  const negative = calculateMomentSweep(-5000, OPTIONS);

  assert.equal(negative, -positive);
  assert.equal(calculateMomentSweep(0, OPTIONS), 0);
  assert.equal(calculateMomentSweep(0.09, OPTIONS), 0);
});

test('moment labels identify axis, direction, value and torque unit', () => {
  assert.equal(formatMomentLabel('L', 420), 'L +420 N·m');
  assert.equal(formatMomentLabel('M', -420), 'M -420 N·m');
  assert.equal(formatMomentLabel('N', 4.25), 'N +4.3 N·m');
});
