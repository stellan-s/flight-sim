import test from 'node:test';
import assert from 'node:assert/strict';

import { WindModel } from '../src/navigation/wind.js';
import { KNOTS_TO_MS } from '../src/utils/constants.js';

const EPSILON = 1e-10;

test('meteorological west wind blows toward the east', () => {
  const wind = new WindModel();
  wind.setWindFromMeteo(270, 10);

  assert.ok(Math.abs(wind.windNorth) < EPSILON);
  assert.ok(Math.abs(wind.windEast - 10 * KNOTS_TO_MS) < EPSILON);
});

test('meteorological north wind blows toward the south', () => {
  const wind = new WindModel();
  wind.setWindFromMeteo(0, 10);

  assert.ok(Math.abs(wind.windNorth + 10 * KNOTS_TO_MS) < EPSILON);
  assert.ok(Math.abs(wind.windEast) < EPSILON);
});
