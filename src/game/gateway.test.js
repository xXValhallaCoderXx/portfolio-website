import test from 'node:test';
import assert from 'node:assert/strict';
import { crossesGateway } from './gateway.js';
import { GATEWAY } from './terrain.js';

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
test('the world gateway accepts the early-right approach lifted by normal launch thermals', () => {
  assert.equal(crossesGateway({ x: 84.8, y: 85.2, z: 317.8 }, { x: 85.2, y: 85.2, z: 317.8 }, GATEWAY), true);
  assert.equal(crossesGateway({ x: 84.8, y: 89, z: 320 }, { x: 85.2, y: 89, z: 320 }, GATEWAY), false);
});
