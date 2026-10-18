// Original, deterministic low-poly Nordic island models. No external asset or generator service.
// Author in metres, Y-up, with closed rock undersides and one embedded 1K colour atlas.
// npm run models -- island-alpine island-ruins island-split normalizes only these new exports.
import fs from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NodeIO, Document } from '@gltf-transform/core';

const random = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const palette = [0x566472, 0x71818c, 0x384a5b, 0x8a989f, 0xc4d3d9, 0xe2eced, 0x617467, 0x344f48,
  0x213c39, 0x38504a, 0x607e78, 0x849287, 0x6c6054, 0x849ba5, 0x516771, 0xabc2c8];
const P = { rock: 0, stone: 1, dark: 2, edge: 3, ice: 4, snow: 5, moss: 6, pine: 7,
  needle: 8, bark: 12, rune: 15 };
// A small PNG encoder keeps authoring reproducible without a canvas or image-tool dependency.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length); body.copy(out, 4); out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4);
  return out;
}
function atlas() {
  const size = 1024, stride = size * 3 + 1, bytes = Buffer.alloc(stride * size), draw = random(0x61746c61);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const tile = (Math.floor(y / 256) * 4 + Math.floor(x / 256)) % palette.length;
    const col = palette[tile], noise = (Math.floor(draw() * 3) - 1) * 3;
    const stratum = Math.sin(y * 0.15 + Math.sin(x * 0.05) * 2) > 0.9 ? -5 : 0;
    const p = y * stride + 1 + x * 3;
    for (let c = 0; c < 3; c++) bytes[p + c] = Math.max(0, Math.min(255, (col >>> (16 - c * 8) & 255) + noise + stratum));
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(bytes, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const textureBytes = atlas();

function author(kind) {
  const draw = random({ alpine: 39, ruins: 47, split: 63 }[kind]);
  const parts = { rock: [], detail: [] };
  function add(geo, tile, at = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0], bucket = 'detail') {
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); geo.dispose();
    g.deleteAttribute('normal');
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...at),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    g.applyMatrix4(matrix); g.computeVertexNormals();
    const uv = g.getAttribute('uv') ?? new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2);
    const pos = g.getAttribute('position');
    for (let i = 0; i < uv.count; i++) {
      const unit = (v) => v >= 0 && v <= 1 ? v : ((v % 1) + 1) % 1;
      const u = unit(g.hasAttribute('uv') ? uv.getX(i) : pos.getX(i) * 0.03);
      const v = unit(g.hasAttribute('uv') ? uv.getY(i) : pos.getY(i) * 0.03 + pos.getZ(i) * 0.01);
      uv.setXY(i, (tile % 4 + 0.04 + u * 0.92) / 4, (Math.floor(tile / 4) + 0.04 + v * 0.92) / 4);
    }
    g.setAttribute('uv', uv); parts[bucket].push(g);
  }
  const box = (at, size, tile = P.stone, turn = 0) => add(new THREE.BoxGeometry(...size), tile, at, [1, 1, 1], [0, turn, 0]);
  function beam(from, to, width, tile) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), mid = a.clone().add(b).multiplyScalar(0.5);
    const geo = new THREE.CylinderGeometry(width, width * 1.1, a.distanceTo(b), 5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    geo.applyQuaternion(q); add(geo, tile, mid.toArray());
  }
  function shelf(cx, cz, rx, rz, top, depth, snow = false) {
    const n = 22, vertices = [], indices = [];
    const jitter = Array.from({ length: n }, () => 0.84 + draw() * 0.27);
    const rings = [[0.82, top + 2], [1, top - 2], [0.96, top - 11], [0.72, top - depth * 0.43], [0.36, top - depth * 0.78], [0.07, top - depth]];
    for (let j = 0; j < rings.length; j++) for (let i = 0; i < n; i++) {
      const angle = i / n * Math.PI * 2;
      const [reach, y] = rings[j];
      vertices.push(cx + Math.cos(angle) * rx * reach * jitter[i] + j * 0.8,
        y + Math.sin(angle * 3 + j) * (j < 2 ? 2.5 : 4), cz + Math.sin(angle) * rz * reach * jitter[i]);
      if (j < rings.length - 1) {
        const a = j * n + i, b = j * n + (i + 1) % n, c = a + n, d = b + n;
        indices.push(a, b, c, b, d, c);
      }
    }
    // Both caps face outward; there is no missing underside from any viewing direction.
    const topIndex = vertices.length / 3; vertices.push(cx, top + 3, cz);
    const bottomIndex = vertices.length / 3; vertices.push(cx + 4, top - depth - 1, cz);
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n, last = (rings.length - 1) * n;
      indices.push(topIndex, next, i, bottomIndex, last + i, last + next);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setIndex(indices);
    add(geo, P.rock, [0, 0, 0], [1, 1, 1], [0, 0, 0], 'rock');
    // Irregular top skin is faceted and slightly raised, with stone showing at its broken rim.
    const cap = [], triangles = [];
    cap.push(cx, top + 3.2, cz);
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2;
      cap.push(cx + Math.cos(a) * rx * 0.82 * jitter[i], top + 2.25 + Math.sin(a * 3) * 2.5,
        cz + Math.sin(a) * rz * 0.82 * jitter[i]); }
    for (let i = 0; i < n; i++) triangles.push(0, (i + 1) % n + 1, i + 1);
    const skin = new THREE.BufferGeometry(); skin.setAttribute('position', new THREE.Float32BufferAttribute(cap, 3)); skin.setIndex(triangles);
    add(skin, snow ? P.snow : P.moss);
    for (let i = 0; i < 7; i++) {
      const a = draw() * Math.PI * 2;
      add(new THREE.ConeGeometry(2 + draw() * 3, 16 + draw() * 16, 5), i % 2 ? P.dark : P.edge,
        [cx + Math.cos(a) * rx * 0.5, top - depth * 0.65, cz + Math.sin(a) * rz * 0.5], [1, 1, 1], [Math.PI, 0, (draw() - 0.5) * 0.3], 'rock');
    }
  }
  function pine(x, y, z, h, snow = false) {
    const lean = 0.13 + draw() * 0.12;
    beam([x, y, z], [x + h * lean, y + h, z - h * 0.08], 0.4 + h * 0.015, P.bark);
    for (let tier = 0; tier < 5; tier++) {
      const dy = h * (0.22 + tier * 0.15), r = h * (0.25 - tier * 0.035);
      const at = [x + dy * lean, y + dy, z - dy * 0.08];
      add(new THREE.ConeGeometry(r, h * 0.34, 7), tier % 2 ? P.pine : P.needle, at, [1.2, 1, 0.85], [0.08, tier, -lean]);
      if (snow && tier % 2 === 0) add(new THREE.ConeGeometry(r * 0.75, h * 0.22, 7), P.snow,
        [at[0] + 0.25, at[1] + h * 0.065, at[2]], [1.2, 1, 0.85], [0.08, tier, -lean]);
    }
  }
  function stones(cx, cz, reach, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = draw() * Math.PI * 2, r = Math.sqrt(draw()) * reach;
      add(new THREE.IcosahedronGeometry(1.8 + draw() * 2.6, 0), i % 3 ? P.edge : P.moss,
        [cx + Math.cos(a) * r, 4 + draw() * 2, cz + Math.sin(a) * r], [1.5, 0.7, 1]);
    }
  }
  if (kind === 'alpine') {
    shelf(-5, 0, 54, 38, 0, 77, true);
    // An asymmetric ridge makes the shelf recognizable even from behind and below.
    add(new THREE.ConeGeometry(22, 29, 5), P.edge, [-22, 14, -12], [1.3, 1, 0.65]);
    add(new THREE.ConeGeometry(17, 20, 5), P.snow, [-22, 20, -12], [1.3, 1, 0.65]);
    for (const [x, z, h] of [[12, -17, 22], [29, -8, 19], [37, 8, 15], [7, 19, 24], [-9, 24, 17], [-40, 7, 16], [20, 13, 15]]) pine(x, 3, z, h, true);
    stones(1, 4, 34, 9);
  } else if (kind === 'ruins') {
    shelf(0, 0, 55, 40, 0, 70);
    shelf(-12, -13, 34, 24, 9, 17);
    box([-8, 12, -7], [43, 3, 26], P.dark);
    // Uneven masonry walls, missing bays and a single surviving gable of a Norse hall.
    for (const z of [-20, 6]) for (let col = 0; col < 9; col++) {
      const rows = z < 0 ? 2 + Math.floor(draw() * 4) : 1 + Math.floor(draw() * 3);
      for (let row = 0; row < rows; row++) box([-27 + col * 4.5 + (row % 2) * 0.6, 15 + row * 3, z], [4.1, 2.7, 3.3], row % 3 ? P.stone : P.edge);
    }
    for (let row = 0; row < 6; row++) for (const z of [-16, -10, -4, 2])
      box([-29, 15 + row * 3, z], [3.3, 2.7, 5.3], P.stone);
    const gable = new THREE.Shape(); gable.moveTo(-15, 0); gable.lineTo(15, 0); gable.lineTo(2, 18); gable.lineTo(-8, 12); gable.closePath();
    const g = new THREE.ExtrudeGeometry(gable, { depth: 3.4, bevelEnabled: false });
    add(g, P.edge, [-30.5, 31, -7], [1, 1, 1], [0, Math.PI / 2, 0]);
    // Broken arch: one crown segment has fallen, leaving a readable opening and fracture.
    for (const x of [25, 41]) for (let row = 0; row < 4; row++) box([x, 5 + row * 3.4, 16], [3.6, 3, 4.2]);
    for (let i = 0; i < 7; i++) {
      if (i === 3 || i === 4) continue;
      const a = i / 6 * Math.PI;
      add(new THREE.BoxGeometry(4, 3.8, 4.2), P.edge, [33 + Math.cos(a) * 8, 15 + Math.sin(a) * 8, 16], [1, 1, 1], [0, 0, a - Math.PI / 2]);
    }
    add(new THREE.CylinderGeometry(2.5, 4.2, 20, 5), P.dark, [-27, 12, 22], [1, 1, 0.6], [0.05, 0.2, -0.06]);
    // Shallow pale runes on the monolith, all part of the same base-colour material.
    for (const y of [8, 13, 18]) {
      beam([-27, y - 1.8, 24.3], [-27, y + 1.8, 24.3], 0.16, P.rune);
      beam([-27, y + 1.5, 24.3], [-25.5, y, 24.3], 0.16, P.rune);
    }
    pine(23, 3, -22, 17); pine(-38, 3, -2, 14); stones(2, 8, 39, 20);
  } else {
    shelf(-35, -5, 29, 35, 4, 83); shelf(37, 9, 24, 27, -4, 60);
    // Separate broken bridge ends; the centre remains a pronounced twenty-metre gap.
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      const x = side * (22 - i * 4.5), y = side < 0 ? 7 + i * 0.5 : 0 + i * 1.4;
      box([x, y, 2], [4.1, 3, 9], P.edge, side * 0.03);
      for (const z of [-2, 6]) if (i < 2) box([x, y + 2.5, z], [4, 2, 1], P.stone);
    }
    beam([-24, 5, 2], [-18, -5, 2], 2.1, P.dark); beam([25, -2, 2], [19, -12, 2], 2, P.dark);
    for (const [x, z, h, y] of [[-42, -19, 23, 7], [-52, 6, 18, 7], [-30, 16, 16, 7], [42, 19, 19, -1], [46, -6, 13, -1]]) pine(x, y, z, h);
    stones(-35, -5, 19, 9); stones(37, 9, 17, 7);
  }
  const doc = new Document(), buffer = doc.createBuffer(), scene = doc.createScene(`Nordic ${kind}`);
  const tex = doc.createTexture('Nordic stone, snow and pine atlas').setImage(textureBytes).setMimeType('image/png');
  const mat = doc.createMaterial('Nordic matte').setBaseColorTexture(tex).setMetallicFactor(0).setRoughnessFactor(1);
  const root = doc.createNode(`island-${kind}`); scene.addChild(root);
  for (const [name, shapes] of Object.entries(parts)) {
    const geo = mergeGeometries(shapes);
    const prim = doc.createPrimitive().setMaterial(mat);
    for (const [source, target] of [['position', 'POSITION'], ['normal', 'NORMAL'], ['uv', 'TEXCOORD_0']]) {
      const attribute = geo.getAttribute(source);
      prim.setAttribute(target, doc.createAccessor().setType(attribute.itemSize === 2 ? 'VEC2' : 'VEC3').setArray(attribute.array).setBuffer(buffer));
    }
    const mesh = doc.createMesh(name).addPrimitive(prim);
    root.addChild(doc.createNode(name).setMesh(mesh));
    geo.dispose(); shapes.forEach((g) => g.dispose());
  }
  doc.getRoot().setDefaultScene(scene);
  return doc;
}
await fs.mkdir(new URL('../models-raw/', import.meta.url), { recursive: true });
const io = new NodeIO();
for (const kind of ['alpine', 'ruins', 'split']) {
  const doc = author(kind);
  await io.write(new URL(`../models-raw/island-${kind}.glb`, import.meta.url).pathname, doc);
  const count = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((n, p) => n + p.getAttribute('POSITION').getCount() / 3, 0);
  console.log(`island-${kind}: ${count} triangles, original Y-up model with embedded 1024px atlas`);
}
