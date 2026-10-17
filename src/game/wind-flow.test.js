import test from 'node:test';
import assert from 'node:assert/strict';
import { createWindFlow, WIND_FLOW as F } from './wind-flow.js';
import { createTerrainAir, sampleAtmosphere } from './atmosphere.js';
import { createCloudbaseRun } from './cloudbase-state.js';
import { surfaceAt } from './ground.js';
import { arraysMadeBy } from './test-alloc.js';

const STEP = 1 / 60;
const cliff = (x) => 80 * Math.max(0, Math.min(1, (x + 8) / 16));
function actualCliff(direction = 1) {
  const heightAt = (x) => cliff(x * direction), terrain = createTerrainAir(heightAt), point = {};
  const windAt = (x, y, z, out) => { point.x = x; point.y = y; point.z = z; return terrain.sample(point, 3.5 * direction, 0, out); };
  return { heightAt, windAt, pos: { x: -45 * direction, y: 100, z: 0 }, eye: { x: -70 * direction, y: 120, z: 90 } };
}
function warm(flow, env, seconds = 1) {
  for (let n = 0; n < seconds * 60; n++) flow.update(STEP, env.pos, env.eye, env.windAt, 1, 0);
}

test('twelve world-anchored curves follow actual mirrored incoming, rising and crest air', () => {
  for (const direction of [1, -1]) {
    const env = actualCliff(direction), flow = createWindFlow(env);
    warm(flow, env);
    assert.equal(flow.state.active, 12);
    assert.equal(new Set(flow.anchors.map((a) => `${a.cellX}:${a.cellZ}`)).size, 12);
    let incoming = 0, climbing = 0, overCrest = 0, curved = 0;
    for (let i = 0; i < F.count; i++) {
      let lowSlope = Infinity, highSlope = -Infinity;
      for (let j = 0; j < flow.counts[i]; j++) {
        const p = (i * F.points + j) * 3, x = flow.paths[p], y = flow.paths[p + 1], z = flow.paths[p + 2];
        assert.ok(y > env.heightAt(x, z) + F.clearance);
        if (x * direction < -95) incoming++;
        if (x * direction > 10 && y > 80) overCrest++;
        const out = env.windAt(x, y, z, {});
        assert.ok(Math.abs(flow.vertical[i * F.points + j] - out.windY) < 2e-7);
        if (j + 1 < flow.counts[i]) {
          const dx = flow.paths[p + 3] - x, dy = flow.paths[p + 4] - y;
          assert.ok(dx * direction > 0);
          const slope = dy / Math.abs(dx); lowSlope = Math.min(lowSlope, slope); highSlope = Math.max(highSlope, slope);
          if (dy > 1) climbing++;
        }
      }
      if (highSlope - lowSlope > 0.5) curved++;
    }
    assert.ok(incoming > 20 && climbing > 100 && overCrest > 20, `${incoming} incoming, ${climbing} rising, ${overCrest} crest samples`);
    assert.ok(curved >= 10, `${curved} curves include the actual field bend`);
  }
});

test('camera and pilot movement retain occupied world cells instead of dragging the paths', () => {
  const env = actualCliff(), flow = createWindFlow(env); warm(flow, env);
  const before = flow.anchors.map((a) => ({ x: a.x, y: a.y, z: a.z, phase: a.phase })), paths = Array.from(flow.paths);
  const moved = { ...env, pos: { ...env.pos, x: env.pos.x + 8, z: env.pos.z + 10 }, eye: { ...env.eye, x: env.eye.x + 8, z: env.eye.z + 10 } };
  warm(flow, moved, 1);
  assert.deepEqual(flow.anchors.map((a) => ({ x: a.x, y: a.y, z: a.z, phase: a.phase })), before);
  assert.deepEqual(Array.from(flow.paths), paths);
});

test('actual descending lee is integrated downward and every retained point clears terrain and fog', () => {
  const heightAt = (x) => cliff(x), terrain = createTerrainAir(heightAt), point = {};
  const windAt = (x, y, z, out) => { Object.assign(point, { x, y, z }); return terrain.sample(point, -3.5, 0, out); };
  const env = { heightAt, windAt, pos: { x: -45, y: 55, z: 0 }, eye: { x: -65, y: 80, z: 90 } };
  const flow = createWindFlow(env); warm(flow, env);
  let downward = 0, sampled = 0;
  for (let i = 0; i < F.count; i++) for (let j = 0; j < flow.counts[i]; j++) {
    const p = (i * F.points + j) * 3, x = flow.paths[p], y = flow.paths[p + 1], z = flow.paths[p + 2]; sampled++;
    assert.ok(y > heightAt(x, z) + F.clearance && y > F.clearance);
    if (j && y < flow.paths[p - 2] - 0.05) downward++;
  }
  assert.ok(sampled > 100 && downward > 40, `${sampled} points, ${downward} descending`);
  for (let n = 0; n < 40; n++) flow.update(STEP, env.pos, env.eye, windAt, 1, 100);
  for (let i = 0; i < F.count; i++) if (flow.fades[i] > 0) for (let j = 0; j < flow.counts[i]; j++) assert.ok(flow.paths[(i * F.points + j) * 3 + 1] > 104);
});

test('thermal-only and still fields do not invent cliff ribbons; dead flow fades before reuse', () => {
  const env = actualCliff(), flow = createWindFlow(env); warm(flow, env);
  const anchors = flow.anchors.map((a) => `${a.x}:${a.z}`);
  const thermal = (x, y, z, out) => Object.assign(out, { windX: 3, windY: 5, windZ: 0, thermal: 5, ridge: 0, lee: 0 });
  for (let n = 0; n < 90; n++) flow.update(STEP, env.pos, env.eye, thermal, 1, 0);
  assert.equal(flow.state.active, 0);
  const empty = createWindFlow({ heightAt: () => 0 });
  empty.update(STEP, env.pos, env.eye, thermal, 1, 0); assert.equal(empty.state.active, 0);
  const still = (x, y, z, out) => Object.assign(out, { windX: 0, windY: 0, windZ: 0, ridge: 4, ambientX: 0, ambientZ: 0 });
  empty.update(1, env.pos, env.eye, still, 1, 0); assert.equal(empty.state.active, 0);
  warm(flow, env, 2); assert.equal(flow.state.active, 12);
  assert.deepEqual(flow.anchors.map((a) => `${a.x}:${a.z}`), anchors);
});

test('paused, hidden and disposed views query nothing and never advance the seeded simulation', () => {
  const run = createCloudbaseRun(); run.reset(100, 1);
  const pos = { x: 80, y: 100, z: 220 }, eye = { x: 50, y: 120, z: 270 };
  const flow = createWindFlow({ heightAt: surfaceAt }); flow.update(STEP, pos, eye, run.windAt, 1, 0);
  const state = structuredClone(run.state), paths = Array.from(flow.paths), stats = { ...flow.state };
  for (let i = 0; i < 100; i++) flow.update(0, pos, eye, run.windAt, 1, 0);
  assert.deepEqual(flow.state, stats); assert.deepEqual(Array.from(flow.paths), paths); assert.deepEqual(run.state, state);
  const noQuery = () => assert.fail('disabled ribbons must not query air');
  flow.update(STEP, pos, eye, noQuery, 0, 0); flow.dispose(); flow.update(STEP, pos, eye, noQuery, 1, 0);
  assert.deepEqual(run.state, state);
});

test('cache and typed buffers stay bounded with no frame allocations through movement and weather', () => {
  const env = actualCliff(), flow = createWindFlow(env); warm(flow, env);
  const paths = flow.paths, vertical = flow.vertical, anchors = flow.anchors, counts = flow.counts;
  const before = { ...flow.state };
  const made = arraysMadeBy(() => warm(flow, env, 10));
  assert.equal(made, 0);
  assert.ok(flow.state.searches - before.searches <= 10);
  assert.ok(flow.state.integrations - before.integrations <= 20 * F.count);
  assert.ok(flow.state.samples - before.samples < 22000, 'at most twelve cached 41-node paths refresh twice per second');
  assert.equal(flow.paths, paths); assert.equal(flow.vertical, vertical); assert.equal(flow.anchors, anchors); assert.equal(flow.counts, counts);
  assert.equal(anchors.length, 12); assert.equal(paths.length, 12 * 41 * 3);
  const far = { x: 4000, y: 100, z: 4000 };
  flow.update(STEP, far, far, env.windAt, 1, 0);
  for (const a of anchors) if (a.occupied) assert.ok(Math.hypot(a.x - far.x, a.z - far.z) < F.range);
  assert.ok(paths.every(Number.isFinite));
});

test('real fjord terrain reads current wind without changing the caller weather or source records', () => {
  const weather = Object.freeze({ windX: -3.5, windZ: -1, thermals: Object.freeze([Object.freeze({ x: 100, z: 285, r: 60, s: 5.5 })]) });
  const point = {}, windAt = (x, y, z, out) => { Object.assign(point, { x, y, z }); return sampleAtmosphere(point, weather, out); };
  const env = { pos: { x: -80, y: 100, z: 220 }, eye: { x: -40, y: 120, z: 280 }, windAt };
  const flow = createWindFlow({ heightAt: surfaceAt }); warm(flow, env);
  assert.ok(flow.state.active >= 6, `${flow.state.active} paths show adjacent real cliff patches`);
  for (let i = 0; i < F.count; i++) for (let j = 0; j < flow.counts[i]; j++) {
    const p = (i * F.points + j) * 3;
    assert.ok(flow.paths[p + 1] > surfaceAt(flow.paths[p], flow.paths[p + 2]) + F.clearance);
  }
  assert.equal(weather.thermals[0].x, 100);
});
