import test from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../src/config.js';
import { calculateIlsGuidance, getRunwayThreshold } from '../src/navigation/ils.js';
import { IlsOverlayRenderer } from '../src/rendering/ils-overlay.js';
import { getChartTheme } from '../src/rendering/chart-themes.js';

const METERS_PER_DEGREE = 111320;
const FEET_PER_NM = 6076.12;

const airport = {
  id: 'KILS',
  lat: 0,
  lon: 0,
  elevation: 1000
};
const runway = {
  id: '18',
  physicalRunwayId: '18/36',
  heading: 180,
  length: 5000
};

function approachPoint(distanceNm, lateralMeters = 0, heightOffsetFt = 0) {
  const threshold = getRunwayThreshold(airport, runway);
  const targetAltitude = airport.elevation + 50 +
    distanceNm * FEET_PER_NM * Math.tan(3 * Math.PI / 180);
  return {
    lat: threshold.lat + distanceNm * 1852 / METERS_PER_DEGREE,
    lon: threshold.lon + lateralMeters / METERS_PER_DEGREE,
    altitude: targetAltitude + heightOffsetFt
  };
}

test('ILS centers localizer and glideslope on the three-degree final', () => {
  const guidance = calculateIlsGuidance(approachPoint(5), airport, runway);

  assert.equal(guidance.available, true);
  assert.equal(guidance.captured, true);
  assert.ok(Math.abs(guidance.distanceToThresholdNm - 5) < 0.01);
  assert.ok(Math.abs(guidance.localizerErrorDeg) < 0.001);
  assert.ok(Math.abs(guidance.glideslopeErrorDeg) < 0.001);
  assert.ok(Math.abs(guidance.heightErrorFt) < 0.1);
});

test('ILS needles point toward centerline and glide path', () => {
  const eastOfFinal = calculateIlsGuidance(approachPoint(5, 300), airport, runway);
  const westOfFinal = calculateIlsGuidance(approachPoint(5, -300), airport, runway);
  const abovePath = calculateIlsGuidance(approachPoint(5, 0, 300), airport, runway);
  const belowPath = calculateIlsGuidance(approachPoint(5, 0, -300), airport, runway);

  assert.ok(eastOfFinal.localizerErrorDeg < 0);
  assert.ok(eastOfFinal.localizerNeedle > 0, 'southbound pilot should steer right toward runway');
  assert.ok(westOfFinal.localizerErrorDeg > 0);
  assert.ok(westOfFinal.localizerNeedle < 0, 'southbound pilot should steer left toward runway');
  assert.ok(abovePath.glideslopeErrorDeg > 0);
  assert.ok(abovePath.glideslopeNeedle > 0, 'glideslope line should move below an aircraft above path');
  assert.ok(belowPath.glideslopeErrorDeg < 0);
  assert.ok(belowPath.glideslopeNeedle < 0, 'glideslope line should move above an aircraft below path');
});

test('ILS rejects positions beyond the threshold and outside configured range', () => {
  const threshold = getRunwayThreshold(airport, runway);
  const beyond = calculateIlsGuidance({
    lat: threshold.lat - 0.01,
    lon: threshold.lon,
    altitude: 1100
  }, airport, runway);
  const far = calculateIlsGuidance(approachPoint(20), airport, runway, { maxRangeNm: 18 });

  assert.equal(beyond.available, false);
  assert.equal(beyond.reason, 'BEYOND THRESHOLD');
  assert.equal(far.available, false);
  assert.equal(far.reason, 'OUT OF RANGE');
});

test('ILS overlay spans the viewport and uses themed guidance colors', () => {
  const operations = [];
  const ctx = {
    save() {}, restore() {}, beginPath() {}, stroke() {},
    moveTo(...args) { operations.push(['moveTo', ...args]); },
    lineTo(...args) { operations.push(['lineTo', ...args]); },
    setLineDash(...args) { operations.push(['setLineDash', ...args]); },
    fillText(...args) { operations.push(['fillText', ...args]); },
    strokeText() {}
  };
  const chart = {
    ctx,
    canvas: { width: 1280, height: 720 },
    palette: getChartTheme('black-white')
  };
  const renderer = new IlsOverlayRenderer(chart);
  const original = CONFIG.SHOW_ILS_OVERLAY;

  try {
    CONFIG.SHOW_ILS_OVERLAY = true;
    renderer.draw(calculateIlsGuidance(approachPoint(5), airport, runway));

    assert.ok(operations.some(([name, x, y]) =>
      name === 'lineTo' && Math.abs(x - 640) < 0.01 && y === 688));
    assert.ok(operations.some(([name, x, y]) =>
      name === 'lineTo' && x === 1280 && Math.abs(y - 360) < 0.01));
    assert.ok(operations.some(([name, text]) => name === 'fillText' && text.includes('ILS CAPTURED')));
  } finally {
    CONFIG.SHOW_ILS_OVERLAY = original;
  }
});
