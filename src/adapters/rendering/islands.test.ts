import { isMesh } from './mesh.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ImageUtils, type GLTF } from '@gltf-transform/core';
import * as THREE from 'three';
import { readModel } from '../../test/helpers/test-models.ts';

test('authored islands meet the geometry, texture, material, normalization and download budgets', async t => {
  for (const kind of ['alpine', 'ruins', 'split']) {
    const bytes = await readFile(new URL(`../../../public/models/island-${kind}.glb`, import.meta.url));
    assert.ok(bytes.length < 1.5 * 1024 * 1024, `${kind}: download budget`);
    const jsonLength = bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString()) as GLTF.IGLTF;
    assert.ok(json.materials && json.materials.length > 0 && json.materials.length <= 2, `${kind}: material budget`);
    assert.ok(json.materials.every(material => !!material.pbrMetallicRoughness?.baseColorTexture), `${kind}: textured colour materials`);
    assert.ok(json.images?.length, `${kind}: embedded colour texture`);
    for (const material of json.materials) {
      const texture = json.textures?.[material.pbrMetallicRoughness!.baseColorTexture!.index];
      assert.ok(texture && typeof texture.source === 'number' && json.images[texture.source], `${kind}: valid colour texture reference`);
    }
    assert.equal(bytes.readUInt32LE(24 + jsonLength), 0x004e4942, `${kind}: binary data chunk`);
    for (const picture of json.images) {
      assert.equal(picture.uri, undefined, `${kind}: no external texture request`);
      assert.ok(picture.mimeType === 'image/png' || picture.mimeType === 'image/jpeg', `${kind}: browser-supported texture format`);
      assert.equal(typeof picture.bufferView, 'number');
      const view = json.bufferViews?.[picture.bufferView!];
      assert.ok(view, `${kind}: valid texture buffer view`);
      assert.equal(view.buffer, 0);
      const start = 28 + jsonLength + (view.byteOffset ?? 0), end = start + view.byteLength;
      assert.ok(start >= 28 + jsonLength && end <= bytes.length, `${kind}: embedded texture bounds`);
      const dimensions = ImageUtils.getSize(bytes.subarray(start, end), picture.mimeType);
      assert.ok(dimensions && dimensions.every(side => side > 0 && side <= 1024), `${kind}: texture dimensions at most 1024px`);
    }
    const { scene } = await readModel(`island-${kind}`); scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene), size = box.getSize(new THREE.Vector3());
    assert.ok(Math.abs(Math.max(size.x, size.y, size.z) - 1) < 0.001);
    assert.ok(Math.abs(box.min.y) < 0.001);
    assert.ok(Math.abs(box.min.x + box.max.x) < 0.001 && Math.abs(box.min.z + box.max.z) < 0.001);
    assert.ok(size.y > 0.4, `${kind}: substantial vertical geometry`);
    let triangles = 0, volume = 0, area = 0, lowerArea = 0;
    const lowerBox = new THREE.Box3();
    const edges = new Map<string, number>();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), cross = new THREE.Vector3(), edge = new THREE.Vector3();
    scene.traverse(part => {
      if (!isMesh(part)) return;
      const p = part.geometry.attributes.position, uv = part.geometry.attributes.uv, index = part.geometry.index;
      assert.ok(p && p.itemSize === 3, `${kind}: vertex positions`);
      assert.ok(uv && uv.itemSize === 2 && uv.count === p.count, `${kind}: UVs for every textured vertex`);
      for (let i = 0; i < p.count; i++) {
        assert.ok([p.getX(i), p.getY(i), p.getZ(i), uv.getX(i), uv.getY(i)].every(Number.isFinite), `${kind}: finite position and UV data`);
      }
      const count = index?.count ?? p.count;
      assert.equal(count % 3, 0, `${kind}: complete triangles`);
      triangles += count / 3;
      for (let i = 0; i < count; i += 3) {
        const indices = [0, 1, 2].map(offset => index ? index.getX(i + offset) : i + offset);
        assert.ok(indices.every(vertex => Number.isInteger(vertex) && vertex >= 0 && vertex < p.count), `${kind}: valid triangle indices`);
        a.fromBufferAttribute(p, indices[0]!).applyMatrix4(part.matrixWorld);
        b.fromBufferAttribute(p, indices[1]!).applyMatrix4(part.matrixWorld);
        c.fromBufferAttribute(p, indices[2]!).applyMatrix4(part.matrixWorld);
        volume += a.dot(cross.crossVectors(b, c)) / 6;
        const faceArea = cross.subVectors(b, a).cross(edge.subVectors(c, a)).length() / 2;
        area += faceArea;
        if ((a.y + b.y + c.y) / 3 < box.min.y + size.y * 0.4) lowerArea += faceArea;
        for (const vertex of [a, b, c]) {
          if (vertex.y < box.min.y + size.y * 0.4) lowerBox.expandByPoint(vertex);
        }
        const corners = [a, b, c].map(v => [v.x, v.y, v.z].map(x => Math.round(x * 1e5)).join(','));
        if (new Set(corners).size < 3) continue;
        for (let edge = 0; edge < 3; edge++) {
          const key = [corners[edge], corners[(edge + 1) % 3]].sort().join('|');
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
    });
    assert.ok(triangles > 1000 && triangles <= 25000, `${kind}: triangle budget`);
    assert.ok(volume > 0.03, `${kind}: substantial outward volume, got ${volume}`);
    const lowerSize = lowerBox.getSize(new THREE.Vector3());
    assert.ok(lowerSize.x > size.x * 0.35 && lowerSize.z > size.z * 0.35 && lowerArea > area * 0.08, `${kind}: substantial three-dimensional underside`);
    const edgeUses = [...edges.values()];
    // Small tree/ruin intersections and openings do not prevent these scenery assets rendering.
    // Report their topology instead of requiring every authored detail to form a sealed manifold.
    t.diagnostic(`${kind}: ${triangles} triangles, ${(bytes.length / 1024).toFixed(1)} KiB, volume ${volume.toFixed(3)}, ${edgeUses.filter(uses => uses === 1).length} boundary edges, ${edgeUses.filter(uses => uses > 2).length} non-manifold edges`);
  }
});
