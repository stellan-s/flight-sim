import test from 'node:test';
import assert from 'node:assert/strict';

import { AirportNavigation } from '../src/navigation/airport-nav.js';

const airport = {
  id: 'KTEST',
  name: 'Test Airport',
  lat: 0,
  lon: 0,
  runways: [{
    id: '18/36',
    heading: 180,
    length: 5000,
    width: 100,
    trafficPattern: {
      side: 'left',
      altitude: 1000,
      distance: 0.8
    }
  }]
};

function createNavigation() {
  return new AirportNavigation({ airports: [airport] });
}

test('active runway selects the primary end for wind aligned with it', () => {
  const navigation = createNavigation();
  const activeRunway = navigation.determineActiveRunway(airport, 180);

  assert.equal(activeRunway.id, '18');
  assert.equal(activeRunway.physicalRunwayId, '18/36');
  assert.equal(activeRunway.heading, 180);
  assert.equal(activeRunway.reciprocal, false);
  assert.equal(activeRunway.trafficPattern.side, 'left');
});

test('active runway preserves the reciprocal end and pattern geometry', () => {
  const navigation = createNavigation();
  const activeRunway = navigation.determineActiveRunway(airport, 360);

  assert.equal(activeRunway.id, '36');
  assert.equal(activeRunway.physicalRunwayId, '18/36');
  assert.equal(activeRunway.heading, 0);
  assert.equal(activeRunway.reciprocal, true);
  assert.equal(activeRunway.trafficPattern.side, 'right');
});

test('navigation guidance uses the selected reciprocal heading', () => {
  const navigation = createNavigation();
  navigation.selectAirport('KTEST');

  const guidance = navigation.getNavigationData(
    -0.1,
    0,
    0,
    100,
    360
  );

  assert.equal(guidance.activeRunway.id, '36');
  assert.equal(guidance.activeRunway.heading, 0);
  assert.equal(guidance.recommendedEntry, 'STRAIGHT-IN');
});

test('straight-in guidance requires the aircraft to be aligned with final', () => {
  const navigation = createNavigation();
  const runway = navigation.determineActiveRunway(airport, 360);

  assert.notEqual(
    navigation.getRecommendedEntry(-0.1, 0, 180, airport, runway),
    'STRAIGHT-IN'
  );
});

test('selected runway stays locked when a varying crosswind crosses the reciprocal tie', () => {
  const navigation = createNavigation();
  navigation.selectAirport('KTEST');

  const first = navigation.getNavigationData(0.1, 0, 180, 90, 269);
  const varied = navigation.getNavigationData(0.1, 0, 180, 90, 271);

  assert.equal(first.activeRunway.id, '18');
  assert.equal(varied.activeRunway.id, '18');
  assert.equal(varied.runwayLocked, true);

  navigation.selectAirport('KTEST');
  const reselected = navigation.getNavigationData(0.1, 0, 0, 90, 271);
  assert.equal(reselected.activeRunway.id, '36');
});

test('an explicit runway spawn locks navigation to the same runway end', () => {
  const navigation = createNavigation();
  const selectedAirport = navigation.selectAirport('KTEST');
  const runway = navigation.selectRunwayEnd(selectedAirport, '18');

  assert.equal(runway.id, '18');
  assert.equal(runway.heading, 180);
  assert.equal(runway.reciprocal, false);
  assert.equal(runway.trafficPattern.side, 'left');
  assert.equal(navigation.runwaySelectionLocked, true);
  assert.equal(navigation.determineActiveRunway(selectedAirport, 360).id, '18');
});
