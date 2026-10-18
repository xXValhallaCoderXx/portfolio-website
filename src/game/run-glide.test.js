import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLIDE, GLIDE_LINES, breezeAt, createGlideRing, glideRing, glideTime, glideWord } from './run-glide.js';
import { CLOUD_ZONE, cloudFogSpeed, createCloudbaseRun } from './cloudbase-state.js';
import { sampleAtmosphere } from './atmosphere.js';
import { HINT_WIDTH } from './hints.js';
const STEP = 1 / 60;
const near = (a, b, e = 0.05) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
function skyAt(elapsed = 360) {
  const sky = createCloudbaseRun({ hazards: false }); sky.reset(80, 5);
  while (sky.state.elapsed < elapsed - STEP / 2) sky.step(STEP, { x: 0, y: 10000, z: 80 });
  return sky;
}
function held() {
  const run = createCloudbaseRun({ hazards: false }); run.reset();
  run.state.thermals.forEach((t) => { t.live = false; });
  return run;
}
test('glide time predicts the slowing wing meeting the same fog and respects the ten-minute limit', () => {
  for (const [elapsed, gap] of [[0, 60], [300, 120], [360, 180], [450, 250], [590, 3000]]) {
    const run = skyAt(elapsed); let y = run.state.fogHeight + gap;
    const prediction = glideTime(y, run.state.fogHeight, elapsed, 200);
    let t = 0, ended;
    while (!ended && t < 201) { y -= GLIDE.sink * STEP; ended = run.step(STEP, { x: 0, y, z: 80 }); t += STEP; if (run.state.elapsed >= 600 - 1e-7) ended = "time"; }
    near(prediction, t, STEP + 0.01);
    assert.ok(prediction <= 600 - elapsed);
  }
  assert.equal(glideTime(103, 100, 20), 0);
});
test('the ring breeze samples local terrain shelter instead of an altitude-only lee', () => {
  const run = held(), pos = { x: 200, y: 150, z: 280 }, out = {};
  breezeAt(run.state, pos.y, out, pos);
  const level = run.state.wind[0];
  const actual = sampleAtmosphere(pos, { windX: level.x, windZ: level.z, thermals: [] });
  near(out.x, actual.windX, 1e-10); near(out.z, actual.windZ, 1e-10);
  const still = createCloudbaseRun({ wind: false }); still.reset();
  breezeAt(still.state, 500, out, pos); assert.equal(out.x, 0); assert.equal(out.z, 0);
});
test('ring radius follows trim glide and its centre drifts with the local air', () => {
  const run = skyAt(), pos = { x: 0, y: run.state.fogHeight + 150, z: 80 };
  const ring = glideRing(run, pos, { x: 2, z: -1 }, {});
  near(ring.r, GLIDE.speed * ring.t, 1e-10); near(ring.x, pos.x + 2 * ring.t, 1e-10);
  near(ring.z, pos.z - ring.t, 1e-10); near(ring.y, pos.y - GLIDE.sink * ring.t, 1e-10);
});
test('a ridge obstructing a straight glide prevents a go recommendation', () => {
  const run = held(), t = run.state.thermals[1];
  Object.assign(t, { x: 200, z: 320, live: true, move: 0, strength: 1, vx: 0, vz: 0, life: Infinity });
  const pos = { x: 85, y: 80, z: 320 }, ring = glideRing(run, pos, { x: 0, z: 0 }, {}, 60);
  assert.equal(glideWord(run, ring, '', -1, {}).word, 'climb');
  Object.assign(t, { x: 85, z: 240 });
  assert.equal(glideWord(run, ring, '', -1, {}).word, 'go');
});
test('glide advice excludes a source fading at the boundary before the pilot can reach it', () => {
  const run = held(), t = run.state.thermals[1];
  Object.assign(t, { x: 85, z: 240, live: true, move: 0, strength: 1, vx: 0, vz: 0, life: 100, age: 10, edgeFade: 2 });
  const ring = glideRing(run, { x: 85, y: 80, z: 320 }, { x: 0, z: 0 }, {}, 60);
  assert.equal(glideWord(run, ring, '', -1, {}).word, 'climb');
  t.edgeFade = 12;
  assert.equal(glideWord(run, ring, '', -1, {}).word, 'go');
});
test('advice forecasts moving cores and excludes a core that expires before interception', () => {
  const run = held(), t = run.state.thermals[1];
  Object.assign(t, { x: 80, z: 80, live: true, move: 0, strength: 1, vx: 2, vz: 0, age: 20, life: 100 });
  const ring = glideRing(run, { x: 0, y: 500, z: 80 }, { x: 2, z: 0 }, {}, 60);
  assert.equal(glideWord(run, ring, '', -1, {}).word, 'go');
  t.life = 22;
  assert.equal(glideWord(run, ring, '', -1, {}).word, 'climb');
});
test('riding, weak and travelling flocks are excluded and hysteresis prevents flicker', () => {
  const run = held(), t = run.state.thermals[1]; Object.assign(t, { x: 50, z: 80, live: true, move: 0, strength: 1 });
  const ring = { x: 0, z: 80, r: 60 };
  assert.equal(glideWord(run, ring, '', -1, {}).word, 'go');
  assert.equal(glideWord(run, ring, '', 1, {}).target, -1);
  t.move = 2; assert.equal(glideWord(run, ring, '', -1, {}).word, 'climb'); t.move = 0;
  ring.r = 45; assert.equal(glideWord(run, ring, 'go', -1, {}).word, 'go');
  ring.r = 35; assert.equal(glideWord(run, ring, 'go', -1, {}).word, 'climb');
});
test('the band builds once, draws finite positions without advancing the sky, and disposes once', () => {
  const scene = new THREE.Scene(), view = createGlideRing({ scene }), sky = skyAt();
  assert.equal(view.root, null); view.begin(); const root = view.root; view.begin(); assert.equal(view.root, root);
  const band = root.getObjectByName('glide-ring'), geometry = band.geometry;
  const pos = new THREE.Vector3(0, sky.state.fogHeight + 130, 80), before = structuredClone(sky.state);
  for (let i = 0; i < 120; i++) view.update(STEP, pos, sky, 0);
  assert.deepEqual(sky.state, before); assert.equal(band.geometry, geometry);
  assert.ok(band.position.toArray().every(Number.isFinite)); assert.ok(band.scale.toArray().every(Number.isFinite));
  assert.equal(band.material.depthWrite, false);
  let disposed = 0; geometry.addEventListener('dispose', () => disposed++); band.material.addEventListener('dispose', () => disposed++);
  view.dispose(); view.dispose(); assert.equal(disposed, 2); assert.equal(scene.children.length, 0);
});
test('short instructions fit phone hints and the fog accelerates with the horn', () => {
  for (const text of Object.values(GLIDE_LINES)) assert.ok(text.length <= HINT_WIDTH);
  assert.ok(cloudFogSpeed(0, 301) > cloudFogSpeed(0, 300));
  assert.equal(CLOUD_ZONE.r, 320);
});
