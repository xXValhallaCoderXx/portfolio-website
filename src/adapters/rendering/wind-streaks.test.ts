import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWindStreaks, WIND_STREAKS as W } from './wind-streaks.ts';
import { RUN_SKY, createCloudbaseRun } from '../../domains/good-lift/cloudbase-state.ts';
import { fjordBreeze } from '../../domains/flight/approach.ts';
import { surfaceAt } from '../../domains/flight/ground.ts';
import { arraysMadeBy } from '../../test/helpers/test-alloc.ts';
import { createTerrainAir } from '../../domains/flight/atmosphere.ts';
import { WIND_FLOW as F, type WindSampler } from '../../domains/flight/wind-flow.ts';
const STEP = 1 / 60;
const pos = { x: 0, y: 500, z: 0 }, eye = { x: 0, y: 520, z: 60 };
const wind: WindSampler = (x, y, z, out) => Object.assign(out, { x: 2, y: 3, z: -1, front: 0 });
const buffers = (v: ReturnType<typeof createWindStreaks>) => ({ p: v.lines.geometry.attributes.position.array, c: v.lines.geometry.attributes.color.array });
const midpoint = (p: ArrayLike<number>, i: number) => [0, 1, 2].map((a) => (p[i * 6 + a] + p[i * 6 + a + 3]) / 2);
const lit = (c: ArrayLike<number>, i: number) => c[i * 6 + 3] + c[i * 6 + 4] + c[i * 6 + 5] > 0;

test('streamlines point along the complete 3D environmental vector and advect at local speed', () => {
  const v = createWindStreaks({ scene: new THREE.Scene(), order: 9 }); v.update(STEP, pos, eye, wind, 1, 0, null, false);
  const { p, c } = buffers(v), before = Array.from({ length: W.count }, (_, i) => midpoint(p, i)), wasLit = Array.from({ length: W.count }, (_, i) => lit(c, i));
  assert.equal(v.lines.renderOrder, 9); assert.ok(v.lines.material.transparent); assert.equal(v.lines.material.depthWrite, false);
  for (let i = 0; i < W.count; i++) if (lit(c, i)) {
    const j = i * 6, dx = p[j + 3] - p[j], dy = p[j + 4] - p[j + 1], dz = p[j + 5] - p[j + 2];
    assert.ok(Math.abs(dy / dx - 1.5) < 1e-4); assert.ok(Math.abs(dz / dx + 0.5) < 1e-4);
  }
  v.update(STEP, pos, eye, wind, 1, 0, null, false);
  let checked = 0;
  for (let i = 0; i < W.count; i++) if (lit(c, i) && wasLit[i]) {
    const after = midpoint(p, i); if (Math.abs(after[0] - before[i][0]) > 1) continue;
    assert.ok(Math.abs(after[0] - before[i][0] - 2 * STEP) < 1e-4);
    assert.ok(Math.abs(after[1] - before[i][1] - 3 * STEP) < 1e-4); checked++;
  }
  assert.ok(checked > 20); v.dispose();
});
test('each streamline follows its own local airflow rather than all particles riding the pilot wind', () => {
  const local: WindSampler = (x, y, z, out) => Object.assign(out, { x: x < 0 ? -2 : 2, y: 0, z: 0, front: 0 });
  const v = createWindStreaks({ scene: new THREE.Scene() }); v.update(STEP, pos, eye, local, 1, 0, null, false);
  const { p, c } = buffers(v); let left = 0, right = 0;
  for (let i = 0; i < W.count; i++) if (lit(c, i)) {
    const j = i * 6, x = (p[j] + p[j + 3]) / 2;
    assert.equal(Math.sign(p[j + 3] - p[j]), Math.sign(x)); if (x < 0) left++; else right++;
  }
  assert.ok(left > 10 && right > 10); v.dispose();
});
test('weak rising air keeps the cool wind colour while usable strong lift becomes warm', () => {
  const cool = new THREE.Color(W.colour), warm = new THREE.Color(W.liftColour);
  for (const rise of [0.5, 1.5, 3]) {
    const v = createWindStreaks({ scene: new THREE.Scene() });
    v.update(STEP, pos, eye, (x, y, z, out) => Object.assign(out, { x: 3, y: rise, z: 0, front: 0 }), 1, 0, null, false);
    const { p, c } = buffers(v);
    const colour = rise <= 1.5 ? cool : warm;
    let checked = 0;
    for (let i = 0; i < W.count; i++) if (lit(c, i)) {
      const j = i * 6;
      assert.ok(Math.abs(c[j + 3] / c[j + 5] - colour.r / colour.b) < 1e-5);
      assert.ok(Math.abs((p[j + 4] - p[j + 1]) / (p[j + 3] - p[j]) - rise / 3) < 1e-4, 'colour does not exaggerate the physical flow');
      checked++;
    }
    assert.ok(checked > 20);
    assert.equal(p.length, (W.count + W.front + W.leads) * 6);
    v.dispose();
  }
});
test('terrain and the requested floor hide air inside rock and below fog', () => {
  const v = createWindStreaks({ scene: new THREE.Scene() });
  const p0 = { x: 160, y: 130, z: 280 }, e0 = { x: 160, y: 155, z: 340 };
  v.update(STEP, p0, e0, wind, 1, 125, null, false);
  const { p, c } = buffers(v);
  for (let i = 0; i < W.count; i++) if (lit(c, i)) {
    const j = i * 6;
    assert.ok(p[j + 1] > 125 && p[j + 4] > 125);
    assert.ok(p[j + 1] > surfaceAt(p[j], p[j + 2])); assert.ok(p[j + 4] > surfaceAt(p[j + 3], p[j + 5]));
  }
  v.dispose();
});
test('paused drawing holds particles and does not advance or consume the seeded sky', () => {
  const run = createCloudbaseRun(); run.reset(80, 3);
  const v = createWindStreaks({ scene: new THREE.Scene(), sky: RUN_SKY });
  v.update(STEP, pos, eye, run.windAt, 1, 0, run.state.gusts, false);
  const before = structuredClone(run.state), p = Array.from(buffers(v).p);
  for (let i = 0; i < 40; i++) v.update(0, pos, eye, run.windAt, 1, 0, run.state.gusts, false);
  assert.deepEqual(run.state, before); assert.deepEqual(Array.from(buffers(v).p), p); v.dispose();
});
test('still air draws no streaks and hidden fields make no sampling calls', () => {
  const v = createWindStreaks({ scene: new THREE.Scene() });
  let calls = 0; const still: WindSampler = (x, y, z, out) => { calls++; Object.assign(out, { x: 0, y: 0, z: 0, front: 0 }); };
  v.update(STEP, pos, eye, still, 1, 0, null, false); assert.ok(buffers(v).c.every((n: number) => n === 0));
  calls = 0; v.update(STEP, pos, eye, still, 0, 0, null, false); assert.equal(calls, 0); assert.equal(v.lines.visible, false); v.dispose();
});
test('reduced motion retains physical directions with fewer particles and no twinkle', () => {
  const regular = createWindStreaks({ scene: new THREE.Scene() }), calm = createWindStreaks({ scene: new THREE.Scene(), calm: true });
  regular.update(STEP, pos, eye, wind, 1, 0, null, false); calm.update(STEP, pos, eye, wind, 1, 0, null, false);
  const r = buffers(regular), c = buffers(calm);
  assert.ok(Array.from({ length: W.count }, (_, i) => lit(c.c, i)).filter(Boolean).length < Array.from({ length: W.count }, (_, i) => lit(r.c, i)).filter(Boolean).length);
  regular.dispose(); calm.dispose();
});
test('buffers stay stable, finite and independent across remounts and teleports', () => {
  const scene = new THREE.Scene(), a = createWindStreaks({ scene }), b = createWindStreaks({ scene });
  const first = buffers(a); assert.notEqual(first.p, buffers(b).p);
  for (let i = 0; i < 600; i++) a.update(STEP, { x: i % 200, y: 100 + i, z: -i % 300 }, eye, fjordBreeze, 0.35, 3, null, i > 300);
  assert.equal(first.p, buffers(a).p); assert.equal(first.c, buffers(a).c);
  assert.ok(first.p.every(Number.isFinite) && first.c.every(Number.isFinite));
  let disposed = 0; a.lines.geometry.addEventListener('dispose', () => disposed++); a.lines.material.addEventListener('dispose', () => disposed++);
  a.dispose(); a.dispose(); assert.equal(disposed, 2); assert.equal(scene.children.length, 1); b.dispose(); assert.equal(scene.children.length, 0);
});

test('drawing the physical field makes no arrays after its fixed pools are warm', () => {
  const v = createWindStreaks({ scene: new THREE.Scene() });
  v.update(STEP, pos, eye, fjordBreeze, 1, 0, null, false);
  const made = arraysMadeBy(() => { for (let i = 0; i < 120; i++) v.update(STEP, pos, eye, fjordBreeze, 1, 0, null, false); });
  assert.equal(made, 0); v.dispose();
});

test('the fixed pool concentrates readable air beside a nearby face, then follows its lee after a wind shift', () => {
  const ground = (x: number) => x >= 30 ? 520 : 480;
  let direction = 1;
  const field: WindSampler = (x, y, z, out) => {
    const face = x > -10 && x < 30;
    const lift = face ? 2 * direction : 0;
    return Object.assign(out, { windX: 3 * direction, windY: lift, windZ: 0, ambientX: 3 * direction, ambientZ: 0,
      ridge: Math.max(0, lift), lee: Math.max(0, -lift), crestHeight: 520, front: 0 });
  };
  const v = createWindStreaks({ scene: new THREE.Scene(), heightAt: ground });
  const pilot = { x: -40, y: 500, z: 0 }, camera = { x: -50, y: 520, z: 60 };
  v.update(STEP, pilot, camera, field, 1, 0, null, false);
  const { p, c } = buffers(v);
  let focused = 0, warm = 0;
  for (let i = 0; i < Math.ceil(W.count * W.ridgeShare); i++) {
    const [x] = midpoint(p, i);
    if (lit(c, i) && x > -10 && x < 30) { focused++; assert.ok(p[i * 6 + 4] > p[i * 6 + 1]); }
  }
  for (let i = 0; i < W.count; i++) if (lit(c, i) && p[i * 6 + 4] > p[i * 6 + 1]) {
    warm++;
    assert.ok(c[i * 6 + 3] / c[i * 6 + 5] > 0.7, 'rising air has a warm head');
  }
  assert.ok(focused >= 25 && warm >= 30, `${focused} concentrated and ${warm} warm lines`);
  assert.equal(p.length, (W.count + W.front + W.leads) * 6, 'no extra particle pool');
  direction = -1;
  v.update(STEP, pilot, camera, field, 1, 0, null, false);
  let descending = 0;
  for (let i = 0; i < W.count; i++) if (lit(c, i)) {
    const j = i * 6;
    assert.ok(p[j + 3] < p[j]);
    if (p[j + 4] < p[j + 1]) {
      descending++;
      assert.ok(c[j + 3] / c[j + 5] < 0.7, 'descending lee air stays cool');
    }
    assert.ok(p[j + 1] > ground(p[j]) && p[j + 4] > ground(p[j + 3]));
  }
  assert.ok(descending >= 25);
  v.dispose();
});

function ribbonScene({ calm = false, rise = null }: { calm?: boolean; rise?: number | null } = {}) {
  const heightAt = (x: number, _z?: number) => 80 * Math.max(0, Math.min(1, (x + 8) / 16));
  const terrain = createTerrainAir(heightAt), point = { x: 0, y: 0, z: 0 };
  const windAt: WindSampler = (x, y, z, out) => {
    Object.assign(point, { x, y, z }); terrain.sample(point, 3.5, 0, out);
    if (rise !== null) out.windY = rise;
    return out;
  };
  const pilot = { x: -45, y: 100, z: 0 }, camera = { x: -70, y: 120, z: 90 };
  const scene = new THREE.Scene(), view = createWindStreaks({ scene, heightAt, calm, order: 7 });
  const update = (dt = STEP, floor = 0, bright = false) => view.update(dt, pilot, camera, windAt, 1, floor, null, bright);
  for (let i = 0; i < 60; i++) update();
  return { scene, view, update, pilot, camera, windAt, heightAt };
}

test('connected cliff ribbons keep fixed geometry and move shader arrowheads along world-anchored curves', () => {
  const { view, update } = ribbonScene(), mesh = view.ribbons;
  assert.equal(mesh.parent, view.lines); assert.equal(mesh.visible, true); assert.equal(mesh.renderOrder, 7.01);
  assert.equal(mesh.geometry.attributes.position.count, 12 * 40 * 6);
  assert.ok(mesh.material.transparent && mesh.material.depthTest); assert.equal(mesh.material.depthWrite, false);
  assert.equal(mesh.material.blending, THREE.NormalBlending); assert.equal(mesh.material.side, THREE.DoubleSide);
  const paths = Array.from(view.flow.paths), positions = mesh.geometry.attributes.position.array, before = Array.from(positions);
  const clock = mesh.material.uniforms.clock.value;
  update(); assert.ok(mesh.material.uniforms.clock.value > clock);
  assert.deepEqual(Array.from(view.flow.paths), paths); assert.deepEqual(Array.from(positions), before);
  const travel = mesh.geometry.attributes.flowTravel.array;
  assert.equal(travel[1] - travel[0], F.seconds);
  assert.match(mesh.material.fragmentShader, /clock-travel\+phase/, 'the head moves toward increasing physical integration time');
  view.dispose();
});

test('ribbon colour describes the actual net vertical air, including weak rise and descending lee', () => {
  for (const rise of [0.5, 1.5, 3, -2]) {
    const { view } = ribbonScene({ rise }), tint = view.ribbons.geometry.attributes.flowTint.array;
    const expected = new THREE.Color(rise >= 3 ? F.lift : rise < 0 ? F.lee : F.ambient);
    let seen = 0;
    for (let j = 0; j < tint.length; j += 4) if (tint[j + 3] > 0.01) {
      assert.ok(Math.abs(tint[j] - expected.r) < 1e-6 && Math.abs(tint[j + 2] - expected.b) < 1e-6);
      seen++;
    }
    assert.ok(seen > 120, `${rise}m/s has ${seen} visible ribbon vertices`); view.dispose();
  }
});

test('ribbon surfaces clear rock and fog and fade away from the glider sightline', () => {
  const { view, update, heightAt } = ribbonScene();
  update(STEP, 125);
  const p = view.ribbons.geometry.attributes.position.array, tint = view.ribbons.geometry.attributes.flowTint.array;
  let visible = 0, hidden = 0;
  for (let j = 0; j < tint.length; j += 4) {
    if (tint[j + 3] > 0) {
      const v = j / 4 * 3; visible++;
      assert.ok(p[v + 1] > 125 && p[v + 1] > heightAt(p[v], p[v + 2]));
    } else hidden++;
  }
  assert.ok(visible > 0 && hidden > 0);
  view.dispose();
});

test('reduced motion freezes ribbon heads and the unbloomed view preserves contrast', () => {
  const { view, update } = ribbonScene({ calm: true });
  const clock = view.ribbons.material.uniforms.clock.value;
  for (let n = 0; n < 60; n++) update();
  assert.equal(clock, 0); assert.equal(view.ribbons.material.uniforms.clock.value, clock);
  update(STEP, 0, true); assert.equal(view.ribbons.material.uniforms.boost.value, 1.35);
  assert.match(view.ribbons.material.fragmentShader, /contrast/, 'a dark edge keeps the arrows readable without additive bloom');
  view.dispose();
});

test('ribbon pools allocate no per-frame arrays and dispose their GPU resources exactly once', () => {
  const { view, update, scene } = ribbonScene();
  const geometry = view.ribbons.geometry, material = view.ribbons.material, positions = geometry.attributes.position.array;
  assert.equal(arraysMadeBy(() => { for (let n = 0; n < 120; n++) update(); }), 0);
  assert.equal(view.ribbons.geometry, geometry); assert.equal(geometry.attributes.position.array, positions);
  let destroyed = 0; geometry.addEventListener('dispose', () => destroyed++); material.addEventListener('dispose', () => destroyed++);
  view.dispose(); view.dispose(); assert.equal(destroyed, 2); assert.equal(scene.children.length, 0);
  assert.equal(view.flow.state.active, 0);
});
