import type { SkyContext } from './rendering.types.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createNordicSky, islandFormations, NORDIC_SKY, skyBlend } from './nordic-sky.ts';
import { createTestLoader } from '../../test/helpers/test-models.ts';

function named(root: THREE.Object3D, name: string): THREE.Object3D {
  const part = root.getObjectByName(name);
  assert.ok(part, name);
  return part;
}
function curtain(root: THREE.Object3D): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const part = named(root, 'aurora').children[0];
  assert.ok(part instanceof THREE.Mesh);
  return part;
}
const context = (altitude = 1000, extra: Partial<SkyContext> = {}): SkyContext => ({ mode: 'cloudbase', altitude, seed: 1,
  camera: { position: new THREE.Vector3(20, altitude, 85) }, ...extra });
const frames = (sky: ReturnType<typeof createNordicSky>, ctx: SkyContext, seconds = 2, start = 0) => {
  for (let i = 0; i <= seconds * 60; i++) sky.update(start + i / 60, ctx);
};

test('altitude blends are smooth, and every seeded hero extent stays beyond the playable boundary', () => {
  assert.deepEqual(skyBlend(150), { sea: 0, aurora: 0, high: 0 });
  assert.deepEqual(skyBlend(900), { sea: 1, aurora: 0, high: 0 });
  assert.deepEqual(skyBlend(2000), { sea: 1, aurora: 1, high: 1 });
  for (const seed of [0, 1, 80, 0xffffffff]) {
    const places = islandFormations(seed);
    assert.deepEqual(islandFormations(seed), places);
    for (const p of places) assert.ok(Math.hypot(p.x, p.z - 80) - p.size > NORDIC_SKY.inner - 110);
  }
  assert.notDeepEqual(islandFormations(1), islandFormations(2));
  for (let y = 450; y <= 2100; y++) {
    const a = skyBlend(y), b = skyBlend(y + 0.01);
    for (const k of Object.keys(a) as (keyof typeof a)[]) assert.ok(Math.abs(a[k] - b[k]) < 0.0001);
  }
});

test('legacy updates retain the original placement; contextual celestial objects follow translation, never camera rotation', () => {
  const sky = createNordicSky(); sky.update(10);
  const celestial = named(sky.group, 'celestial'), stars = named(sky.group, 'stars') as THREE.Points;
  assert.deepEqual(celestial.position.toArray(), [0, 0, 0]);
  assert.equal(named(sky.group, 'altitude scenery').visible, false);
  assert.equal(curtain(sky.group).material.uniforms.uTime.value, 10);
  const positions = stars.geometry.attributes.position.array.slice();
  const ctx = context(2000); frames(sky, ctx);
  assert.deepEqual(celestial.position.toArray(), [20, 2000, 85]);
  assert.deepEqual(celestial.quaternion.toArray(), [0, 0, 0, 1]);
  assert.deepEqual(stars.geometry.attributes.position.array, positions);
  assert.equal(named(sky.group, 'moon').visible, true);
  ctx.reducedMotion = true; sky.update(4, ctx);
  assert.equal(curtain(sky.group).material.uniforms.uTime.value, 0);
  sky.update(4.5, { ...ctx, lowDetail: true });
  sky.update(5); assert.deepEqual(celestial.position.toArray(), [0, 0, 0]);
  assert.equal(stars.geometry.drawRange.count, 1400);
  assert.ok(named(sky.group, 'aurora').children.every(v => v.visible));
  sky.dispose();
});

test('models load progressively, fade after arrival and reuse bounded pools through climbs, seed changes and reset', async () => {
  const loader = createTestLoader({ maps: true }), sky = createNordicSky(loader);
  sky.update(0, context(100)); await sky.ready;
  assert.deepEqual(loader.calls.map(([name]) => name), ['island-alpine']);
  assert.equal(sky.state.visibleHeroes, 0, 'completed loads start transparent');
  frames(sky, context(150), 2, 1); await sky.ready;
  assert.equal(sky.state.visibleHeroes, 1, 'the shelf is visible during the opening climb');
  assert.deepEqual(loader.calls.map(([name]) => name), ['island-alpine', 'island-ruins']);
  sky.update(3, context(250)); await sky.ready;
  assert.equal(loader.calls.at(-1)![0], 'island-split');
  frames(sky, context(400), 2, 3); await sky.ready;
  assert.equal(sky.state.visibleHeroes, 3, 'all designs appear by 400 m');
  assert.ok(sky.state.islands.every(view => view.opacity === 1));
  frames(sky, context(1000), 3, 5);
  assert.ok(sky.state.visibleHeroes > 0);
  assert.equal(loader.calls.length, 4);
  const childCount = named(sky.group, 'altitude scenery').children.length;
  const textures = await loader.owned();
  for (let i = 0; i < 30; i++) {
    frames(sky, context(500 + i * 190, { seed: i % 4 }), 0.2, 8 + i * 0.2);
    assert.ok(sky.state.visibleHeroes <= 3 && sky.state.visibleClouds <= 8);
  }
  assert.equal(named(sky.group, 'altitude scenery').children.length, childCount);
  assert.equal(loader.calls.length, 4);
  frames(sky, context(1800, { lowDetail: true }), 2, 20);
  assert.ok(sky.state.visibleHeroes <= 2 && sky.state.visibleClouds <= 2);
  frames(sky, context(1800, { fog: 2400 }), 2, 22);
  assert.equal(sky.state.visibleHeroes, 0); assert.equal(sky.state.visibleClouds, 0);
  frames(sky, context(1600), 2, 24);
  assert.ok(sky.state.visibleHeroes > 0);
  sky.update(0, context(150));
  assert.equal(sky.state.visibleHeroes, 0); assert.equal(sky.state.visibleClouds, 0);
  sky.update(1, { mode: 'flying', altitude: 150 });
  assert.equal(named(sky.group, 'altitude scenery').visible, false);
  const counts = new Map([...textures.materials, ...textures.geometries, ...textures.textures].map(v => [v, 0]));
  for (const v of counts.keys()) v.addEventListener('dispose', () => counts.set(v, counts.get(v)! + 1));
  sky.dispose(); sky.dispose();
  for (const n of counts.values()) assert.equal(n, 0, 'loader resources remain owned by the cache');
});

test('the first shelf is ahead of the gate and a reused island never changes position while visible', async () => {
  const sky = createNordicSky(createTestLoader());
  frames(sky, context(400)); await sky.ready; frames(sky, context(400), 2, 2);
  const shelf = named(sky.group, 'island-alpine'), before = shelf.position.clone();
  assert.ok(Math.abs(before.x) < 70 && before.z < -900);
  assert.equal(before.y, 180);
  sky.update(4.05, context(1000));
  assert.deepEqual(shelf.position, before, 'the old world position remains throughout the fade');
  let relocated = false;
  for (let i = 1; i <= 180; i++) {
    sky.update(4.05 + i / 60, context(1000));
    if (!shelf.position.equals(before)) {
      if (!relocated) assert.equal(shelf.visible, false, 'relocation happens only at zero opacity');
      relocated = true;
    }
  }
  assert.ok(relocated && shelf.visible);
  sky.dispose();
});

test('failed and late model loads leave scenery usable and release only resources owned by this view', async () => {
  const sky = createNordicSky({ loadModel: () => Promise.reject(new Error('offline')) });
  frames(sky, context(2000)); await sky.ready;
  assert.equal(sky.state.clouds, 'failed'); assert.ok(sky.state.islands.every(v => v.status === 'failed'));
  assert.equal(named(sky.group, 'mountains 0').visible, true);
  const owned = new Set<THREE.BufferGeometry | THREE.Material>(); sky.group.traverse(p => {
    if ('geometry' in p && p.geometry instanceof THREE.BufferGeometry) owned.add(p.geometry);
    if ('material' in p && p.material instanceof THREE.Material) owned.add(p.material);
  });
  const counts = new Map([...owned].map(v => [v, 0]));
  for (const v of owned) v.addEventListener('dispose', () => counts.set(v, counts.get(v)! + 1));
  sky.dispose(); sky.dispose(); for (const n of counts.values()) assert.equal(n, 1);
  const resolves: ((value: THREE.Object3D) => void)[] = [];
  const late = createNordicSky({ loadModel: () => new Promise(r => { resolves.push(r); }) });
  late.update(1, context(500)); await Promise.resolve(); late.dispose();
  for (const resolve of resolves) resolve(new THREE.Group());
  await late.ready;
  assert.equal(late.group.children.length, 0);
});
