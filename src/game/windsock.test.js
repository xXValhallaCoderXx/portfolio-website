import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildWindsock } from './scenery.js';
import { loadModel } from './test-models.js';

function fixture(load = () => new Promise(() => {})) {
  const sock = buildWindsock({ loadModel: load });
  const parent = new THREE.Group();
  parent.position.set(100, 60, -30);
  sock.group.position.set(4, 0, 7);
  parent.add(sock.group);
  return sock;
}
test('a windsock samples live air at its own world position and follows a changing wind', () => {
  const sock = fixture();
  let vector = { x: 2, z: 0 }, sampled;
  const windAt = (x, y, z, out) => { sampled = [x, y, z]; Object.assign(out, { windX: vector.x, windZ: vector.z }); };
  sock.update(0, windAt);
  assert.deepEqual(sampled, [104, 67.1, -23]);
  assert.ok(Math.abs(sock.group.rotation.y) < 1e-12);
  vector = Object.freeze({ x: -2, z: 0 });
  sock.update(120, windAt);
  assert.equal(Math.abs(sock.group.rotation.y), Math.PI);
  assert.deepEqual(vector, { x: -2, z: 0 });
  vector = { x: 0, z: -3 };
  sock.update(140, windAt);
  assert.equal(sock.group.rotation.y, Math.PI / 2);
});
test('loaded cloth and the fallback use the same direction; reduced motion removes flutter', async () => {
  const fallback = fixture(), loaded = fixture(loadModel);
  assert.equal(await loaded.ready, true);
  const windAt = (x, y, z, out) => Object.assign(out, { windX: 1, windZ: 2 });
  for (const sock of [fallback, loaded]) sock.update(0, windAt, true);
  assert.equal(loaded.group.rotation.y, fallback.group.rotation.y);
  const before = [];
  loaded.group.traverse((part) => { if (part.isMesh) before.push(Array.from(part.geometry.attributes.position.array)); });
  loaded.update(25, windAt, true);
  const after = [];
  loaded.group.traverse((part) => { if (part.isMesh) after.push(Array.from(part.geometry.attributes.position.array)); });
  assert.deepEqual(after, before);
  loaded.update(25, windAt, false);
  const fluttered = [];
  loaded.group.traverse((part) => { if (part.isMesh) fluttered.push(Array.from(part.geometry.attributes.position.array)); });
  assert.notDeepEqual(fluttered, before);
});
