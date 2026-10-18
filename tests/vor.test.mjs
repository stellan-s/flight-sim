import test from 'node:test';
import assert from 'node:assert/strict';

import { VORNavigation } from '../src/navigation/vor.js';

function createNavigation() {
  const navigation = new VORNavigation({
    vors: [{
      id: 'TST',
      name: 'Test VOR',
      frequency: '113.0',
      lat: 0,
      lon: 0
    }]
  });
  navigation.morsePlayer.playMorse = async () => {};
  navigation.selectVOR('TST');
  return navigation;
}

test('VOR bearing, radial, and distance use consistent geometry', () => {
  const navigation = createNavigation();
  const data = navigation.getNavigationData(-0.1, 0);

  assert.ok(Math.abs(data.bearing - 0) < 1e-10);
  assert.ok(Math.abs(data.radial - 180) < 1e-10);
  assert.ok(Math.abs(data.distance - 6.004) < 0.01);
});

test('CDI centers with the correct TO and FROM indications', () => {
  const navigation = createNavigation();

  navigation.setOBS(0);
  let cdi = navigation.getCDIDeflection(-0.1, 0);
  assert.equal(cdi.toFrom, 'TO');
  assert.ok(Math.abs(cdi.deflection) < 1e-10);

  navigation.setOBS(180);
  cdi = navigation.getCDIDeflection(-0.1, 0);
  assert.equal(cdi.toFrom, 'FROM');
  assert.ok(Math.abs(cdi.deflection) < 1e-10);
});
