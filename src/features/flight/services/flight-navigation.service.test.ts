import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestFlightZone } from './flight-navigation.service.ts';

test('destination selection prefers an unvisited place and preserves authored ties without changing progress', () => {
  const zones = [{ id: 'about', x: -10, z: 0 }, { id: 'projects', x: 10, z: 0 }];
  const visited = ['about'];
  assert.equal(nearestFlightZone({ x: 0, z: 0 }, zones, visited, false)?.zone.id, 'about');
  assert.equal(nearestFlightZone({ x: 0, z: 0 }, zones, visited, true)?.zone.id, 'projects');
  assert.equal(nearestFlightZone({ x: 0, z: 0 }, zones, ['about', 'projects'], true), null);
  assert.equal(nearestFlightZone({ x: 0, z: 0 }, [], [], false), null);
  assert.deepEqual(visited, ['about']);
});
