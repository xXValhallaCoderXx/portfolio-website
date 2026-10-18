import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { readModel } from './test-models.js';

test('dedicated Nordic islands meet the geometry, texture, material, normalization and download budgets', async () => {
  for (const kind of ['alpine', 'ruins', 'split']) {
    const bytes = await readFile(new URL(`../../public/models/island-${kind}.glb`, import.meta.url));
    assert.ok(bytes.length < 1.5 * 1024 * 1024);
    const jsonLength = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
    assert.ok(json.materials.length <= 2);
    assert.equal(json.images.length, 1); assert.equal(json.images[0].uri, undefined);
    const picture = json.bufferViews[json.images[0].bufferView];
    const image = bytes.subarray(28 + jsonLength + (picture.byteOffset ?? 0));
    assert.equal(image.readUInt32BE(16), 1024); assert.equal(image.readUInt32BE(20), 1024);
    assert.ok(json.materials.every(m => !!m.pbrMetallicRoughness.baseColorTexture));
    const { scene } = await readModel(`island-${kind}`); scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene), size = box.getSize(new THREE.Vector3());
    assert.ok(Math.abs(Math.max(size.x, size.y, size.z) - 1) < 0.001);
    assert.ok(Math.abs(box.min.y) < 0.001);
    assert.ok(Math.abs(box.min.x + box.max.x) < 0.001 && Math.abs(box.min.z + box.max.z) < 0.001);
    let triangles = 0, volume = 0;
    const edges = new Map();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), cross = new THREE.Vector3();
    scene.traverse(part => {
      if (!part.isMesh) return;
      const p = part.geometry.attributes.position, index = part.geometry.index;
      const count = index?.count ?? p.count; triangles += count / 3;
      // The merged rock shell and its tapered shards have outward faces and a positive enclosed volume.
      if (part.name !== 'rock') return;
      for (let i = 0; i < count; i += 3) {
        a.fromBufferAttribute(p, index ? index.getX(i) : i).applyMatrix4(part.matrixWorld);
        b.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1).applyMatrix4(part.matrixWorld);
        c.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2).applyMatrix4(part.matrixWorld);
        volume += a.dot(cross.crossVectors(b, c)) / 6;
        const corners = [a, b, c].map(v => [v.x, v.y, v.z].map(x => Math.round(x * 1e5)).join(','));
        if (new Set(corners).size < 3) continue;
        for (let edge = 0; edge < 3; edge++) {
          const key = [corners[edge], corners[(edge + 1) % 3]].sort().join('|');
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
    });
    assert.ok(triangles > 1000 && triangles <= 25000);
    assert.ok(volume > 0.03, `complete outward rock underside: ${kind} volume ${volume}`);
    assert.ok(edges.size > 300);
    assert.ok([...edges.values()].every(count => count === 2), `${kind} has no open rock edges`);
  }
});
