import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrainingLandscape } from './training-landscape.ts';

test('training ridges have deterministic shoulders and saddles outside the lesson corridor', () => {
  const first = createTrainingLandscape(), second = createTrainingLandscape();
  const ridges = first.group.children.filter(part => part instanceof THREE.Mesh);
  assert.equal(ridges.length, 2);
  let triangles = 0;
  for (const ridge of ridges) {
    const other = second.group.getObjectByName(ridge.name);
    assert.ok(other instanceof THREE.Mesh);
    assert.deepEqual(ridge.geometry.attributes.position.array, other.geometry.attributes.position.array);
    const position = ridge.geometry.attributes.position;
    const radii = new Set<number>(), heights: number[] = [];
    for (let i = 0; i < position.count; i++) {
      const radius = Math.hypot(position.getX(i), position.getZ(i) - 80);
      assert.ok(radius >= 1449.99, 'no new obstacle lies inside the lesson corridor');
      assert.ok(Number.isFinite(position.getY(i)));
      radii.add(Math.round(radius / 100)); heights.push(position.getY(i));
      const normal = ridge.geometry.attributes.normal;
      assert.ok(Number.isFinite(normal.getX(i)) && Number.isFinite(normal.getY(i)) && Number.isFinite(normal.getZ(i)));
    }
    assert.ok(radii.size >= 5, 'radial shoulders create depth, rather than a vertical curtain');
    assert.ok(Math.max(...heights) > 1600 && Math.max(...heights) < 2200, 'snowy peaks rise above the 1,100 m lesson start');
    assert.ok(Math.min(...heights) < 400, 'slopes descend to low foothills');
    assert.ok(ridge.geometry.getIndex()); triangles += ridge.geometry.getIndex()!.count / 3;
    assert.ok(ridge.material instanceof THREE.MeshLambertMaterial);
    assert.equal(ridge.material.fog, false);
  }
  assert.ok(triangles <= 10000, `bounded scenery triangle count: ${triangles}`);
  first.dispose(); second.dispose();
});

test('detail reduction and fading reuse the same bounded resources; disposal owns each exactly once', () => {
  const landscape = createTrainingLandscape(), scene = new THREE.Scene(); scene.add(landscape.group);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  landscape.group.traverse(part => {
    if (part instanceof THREE.Mesh || part instanceof THREE.LineSegments) {
      geometries.add(part.geometry); assert.ok(part.material instanceof THREE.Material); materials.add(part.material);
    }
  });
  const counts = new Map([...geometries, ...materials].map(resource => [resource, 0]));
  for (const resource of counts.keys()) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource)! + 1));
  for (let i = 0; i < 20; i++) landscape.update({ lowDetail: i % 2 === 0, opacity: i / 20 });
  landscape.update({ lowDetail: true, opacity: 1 });
  assert.equal(landscape.group.children.filter(part => part.visible).length, 1);
  landscape.update({ opacity: .5 });
  for (const part of landscape.group.children) {
    if (!(part instanceof THREE.Mesh)) continue;
    assert.equal(part.material.opacity, .5); assert.equal(part.material.depthWrite, false);
  }
  landscape.update({ opacity: 0 }); assert.ok(landscape.group.children.every(part => !part.visible));
  assert.equal(landscape.group.children.length, 4);
  landscape.dispose(); landscape.dispose(); landscape.update();
  assert.equal(scene.children.length, 0); assert.equal(landscape.group.children.length, 0);
  for (const count of counts.values()) assert.equal(count, 1);
});
