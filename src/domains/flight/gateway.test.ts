import type { AirSample } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { crossesGateway } from './gateway.ts';
import { GATEWAY, START, surfaceAt } from '../../adapters/rendering/terrain.ts';
import { createFlight, stepFlight } from './flight.ts';
import { sampleFjordAir } from './atmosphere.ts';

const gate = { x: 85, corridor: { minY: 70, maxY: 84, minZ: 316, maxZ: 324 } };
test('crossing interpolates the aperture in either direction, including a boosted step', () => {
  const west = { x: 60, y: 68, z: 310 };
  const east = { x: 110, y: 86, z: 330 };
  assert.equal(crossesGateway(west, east, gate), true);
  assert.equal(crossesGateway(east, west, gate), true);
});
test('proximity, height misses, side misses and resting on the plane never trigger', () => {
  assert.equal(crossesGateway({ x: 82, y: 80, z: 320 }, { x: 84, y: 80, z: 320 }, gate), false);
  assert.equal(crossesGateway({ x: 84, y: 90, z: 320 }, { x: 86, y: 90, z: 320 }, gate), false);
  assert.equal(crossesGateway({ x: 84, y: 80, z: 325 }, { x: 86, y: 80, z: 325 }, gate), false);
  assert.equal(crossesGateway({ x: 85, y: 80, z: 320 }, { x: 85, y: 80, z: 320 }, gate), false);
});

const arch = { ...gate, entry: { halfDepth: 7, margin: 2 } };
test('an arch accepts its front face, pilot margin and paths starting on its centre plane', () => {
  assert.equal(crossesGateway({ x: 75.9, y: 80, z: 320 }, { x: 76.1, y: 80, z: 320 }, arch), true);
  assert.equal(crossesGateway({ x: 84, y: 85.5, z: 325.5 }, { x: 86, y: 85.5, z: 325.5 }, arch), true);
  assert.equal(crossesGateway({ x: 85, y: 80, z: 320 }, { x: 85.2, y: 80, z: 320 }, arch), true);
  assert.equal(crossesGateway({ x: 85, y: 80, z: 320 }, { x: 84.8, y: 80, z: 320 }, arch), true);
});
test('a swept arch catches boosted passes in either direction without accepting corner misses', () => {
  const west = { x: 60, y: 68, z: 310 }, east = { x: 110, y: 86, z: 330 };
  assert.equal(crossesGateway(west, east, arch), true);
  assert.equal(crossesGateway(east, west, arch), true);
  assert.equal(crossesGateway({ x: 75, y: 90, z: 320 }, { x: 95, y: 80, z: 340 }, arch), false,
    'each axis overlaps at a different time, so the path never enters the opening');
});
test('arch tolerance does not trigger distant, above, beside, stationary or parallel passes', () => {
  assert.equal(crossesGateway({ x: 72, y: 80, z: 320 }, { x: 75, y: 80, z: 320 }, arch), false);
  assert.equal(crossesGateway({ x: 60, y: 87, z: 320 }, { x: 110, y: 87, z: 320 }, arch), false);
  assert.equal(crossesGateway({ x: 60, y: 80, z: 327 }, { x: 110, y: 80, z: 327 }, arch), false);
  assert.equal(crossesGateway({ x: 85, y: 80, z: 320 }, { x: 85, y: 80, z: 320 }, arch), false);
  assert.equal(crossesGateway({ x: 85, y: 80, z: 310 }, { x: 85, y: 80, z: 330 }, arch), false);
});
test('the fjord entry covers the visible opening instead of only a narrow centre strip', () => {
  for (const y of [61, 75, 95, 98]) for (const z of [307.5, 320, 332.5]) {
    assert.equal(crossesGateway({ x: 60, y, z }, { x: 110, y, z }, GATEWAY), true, `${y}m high at z=${z}`);
  }
  assert.equal(crossesGateway({ x: 60, y: 100, z: 320 }, { x: 110, y: 100, z: 320 }, GATEWAY), false);
  assert.equal(crossesGateway({ x: 60, y: 80, z: 334 }, { x: 110, y: 80, z: 334 }, GATEWAY), false);
});

test('manual right steering from the real launch reaches the aperture with room to release', () => {
  for (const heldSteps of [285, 300, 315]) {
    const g = createFlight({ x: START.x, y: START.y, z: START.z });
    const air: AirSample = {}, previous = {} as import('./models.ts').Vector3;
    let entered = false;
    for (let tick = 0; tick < 20 * 60 && !entered; tick++) {
      Object.assign(previous, g.pos);
      sampleFjordAir(g.pos, tick / 60, air);
      stepFlight(g, { turn: tick < heldSteps ? 1 : 0 }, air);
      assert.ok(g.pos.y - surfaceAt(g.pos.x, g.pos.z) > 1.4, 'the approach stays clear of the terrain');
      entered = crossesGateway(previous, g.pos, GATEWAY);
    }
    assert.equal(entered, true, `release after ${heldSteps / 60}s reaches the gate`);
  }
});
