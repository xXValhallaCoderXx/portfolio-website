import type { CloudbaseRun } from '../good-lift/models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
CLOUD_ENCOUNTERS,CLOUD_HUNT,CLOUD_LAUNCH,CLOUD_OPENING,CLOUD_POOL,CLOUD_STORM,CLOUD_STRIKE,
CLOUD_WEAR,createCloudbaseRun,encounterInterval
} from '../good-lift/cloudbase-state.ts';
import { BELLS } from '../good-lift/bells.ts';

const dt = 1 / 60;
function advance(sky: CloudbaseRun, seconds: number, pos: { x: number; y: number; z: number; }) { for (let n = 0; n < Math.round(seconds / dt); n++) sky.step(dt, pos); }

test('opening cores stay fixed, full and unspent below the first 450 m crossing, then blend once for 45 seconds', () => {
  const sky = createCloudbaseRun({ hazards: false }); sky.reset(100, 7);
  const refs = sky.state.thermals.slice(0, 2), ids = refs.map(t => t.generation);
  assert.deepEqual(refs.map(t => [t.x, t.z, t.r, t.s]), [[100, 285, CLOUD_OPENING.r, 5.5], [60, 170, CLOUD_OPENING.r, 5.5]]);
  for (const t of refs) advance(sky, 90, { x: t.x, y: 449, z: t.z });
  assert.equal(sky.state.openingAt, -1);
  assert.deepEqual(refs.map(t => [t.x, t.z, t.r, t.wear, t.age, t.strength, t.vx, t.vz]),
    [[100, 285, CLOUD_OPENING.r, 0, 0, 1, 0, 0], [60, 170, CLOUD_OPENING.r, 0, 0, 1, 0, 0]]);
  sky.step(dt, { x: 60, y: 450, z: 170 }); const released = sky.state.openingAt;
  advance(sky, 22.5, { x: 60, y: 449, z: 170 });
  assert.equal(sky.state.openingAt, released);
  for (const [i, t] of refs.entries()) assert.ok(Math.abs(t.r - (CLOUD_OPENING.r + (i ? CLOUD_HUNT.r : CLOUD_LAUNCH.r)) / 2) < 0.01);
  assert.ok(refs[1].wear > 20 && refs[1].wear < 24, 'depletion restarts at the crossing');
  assert.ok(refs[1].age > 22 && refs[1].age < 24, 'the protected lifetime restarts');
  advance(sky, 22.5, { x: 60, y: 449, z: 170 });
  for (const [i, t] of refs.entries()) { assert.equal(t, sky.state.thermals[i]); assert.equal(t.generation, ids[i]); assert.ok(Math.abs(t.r - (i ? CLOUD_HUNT.r : CLOUD_LAUNCH.r)) < 1e-8); }
  assert.ok(Math.hypot(refs[1].x - 60, refs[1].z - 170) > 10, 'the same second source acquires normal drift');
  assert.equal(refs[0].x, 100); assert.equal(refs[0].z, 285);
  refs[0].wear = CLOUD_WEAR.dead; sky.step(dt, { x: 0, y: 449, z: 0 });
  assert.equal(refs[0].live, false, 'the launch can deplete after protection ends');
  sky.reset(100, 7); assert.equal(sky.state.openingAt, -1); assert.equal(refs[0].wear, 0); assert.equal(refs[1].x, 60);
});

test('raven and gust schedules begin at 500 m, retain sampled due times and smoothly accelerate by peak height', () => {
  for (const seed of [1, 2, 7, 19, 32]) {
    const sky = createCloudbaseRun(); sky.reset(100, seed);
    advance(sky, 120, { x: 0, y: 499, z: 80 });
    assert.equal(sky.state.ravenDue, -1); assert.equal(sky.state.gustDue, -1);
    assert.ok(sky.state.ravens.every(r => !r.hot && !r.threat));
    sky.step(dt, { x: 0, y: 500, z: 80 }); const now = sky.state.elapsed;
    const raven = sky.state.ravenDue, gust = sky.state.gustDue;
    assert.ok(raven - now >= 45 && raven - now <= 60); assert.ok(gust - now >= 30 && gust - now <= 45);
    sky.step(dt, { x: 0, y: 1000, z: 80 });
    assert.equal(sky.state.ravenDue, raven); assert.equal(sky.state.gustDue, gust, 'rising peak never redraws a scheduled interval');
    const copy = structuredClone(sky.state);
    for (let n = 0; n < 20; n++) sky.sample({ x: 0, y: 1000, z: 80 });
    assert.deepEqual(sky.state, copy, 'render reads do not advance encounters');
    sky.reset(100, seed); advance(sky, 120, { x: 0, y: 499, z: 80 }); sky.step(dt, { x: 0, y: 500, z: 80 });
    assert.equal(sky.state.ravenDue, raven); assert.equal(sky.state.gustDue, gust, 'reset uses the same seeded draws');
  }
  for (const schedule of [CLOUD_ENCOUNTERS.raven, CLOUD_ENCOUNTERS.gust, { from: BELLS.from, every: BELLS.every, high: BELLS.oftener }]) {
    for (const draw of [0, 0.3, 1]) {
      const low = encounterInterval(schedule, schedule.from, draw), high = encounterInterval(schedule, 1000, draw);
      assert.equal(encounterInterval(schedule, (schedule.from + 1000) / 2, draw), (low + high) / 2);
      assert.equal(encounterInterval(schedule, 1200, draw), high); assert.ok(high < low);
    }
  }
});

test('one raven warns for a second, can collide for three seconds, and spends even a missed opportunity', () => {
  const sky = createCloudbaseRun({ wind: false }); sky.reset(100, 1);
  const pos = { x: 60, y: 700, z: 170 };
  sky.step(dt, pos); sky.state.ravenDue = sky.state.elapsed + dt;
  sky.step(dt, pos); const at = sky.state.ravenAt, due = sky.state.ravenDue;
  assert.ok(sky.state.ravenAttack >= 0); assert.equal(sky.state.pilot.danger, 1);
  advance(sky, 0.9, pos); assert.ok(sky.state.ravens.every(r => !r.hot));
  advance(sky, 0.2, pos); assert.ok(sky.state.ravens.filter(r => r.hot).length <= 1);
  assert.equal(sky.state.pilot.danger, 1);
  advance(sky, 3, { x: -300, y: 700, z: 80 });
  assert.ok(sky.state.elapsed > at + 4); assert.equal(sky.state.ravenAttack, -1);
  assert.equal(sky.state.pilot.danger, 0); assert.equal(sky.state.pilot.strikes, 0);
  assert.equal(sky.state.ravenDue, due, 'a miss cannot open another window');
});

test('storm pool and every damage field respect the 500 m floor, including the canopy just below it', () => {
  const sky = createCloudbaseRun(); sky.reset();
  assert.equal(CLOUD_POOL.clouds, 33); assert.equal(sky.state.clouds.length, 33);
  assert.deepEqual(CLOUD_STORM.layers, [560, 680, 800, 930, 1060, 1190, 1320, 1460, 1580, 1700]);
  assert.deepEqual(CLOUD_STORM.counts, [1, 2, 3, 3, 4, 4, 4, 4, 4, 4]);
  for (const c of sky.state.clouds) assert.ok(c.y - c.ry >= 500 - 1e-9);
  const c = sky.state.clouds[0]; Object.assign(c, { x: 100, y: 505, z: 285, rx: 100, ry: 10, rz: 100, fade: 1 });
  assert.equal(sky.depthAt(100, 499, 285), 0);
  const low = sky.sample({ x: 100, y: 499, z: 285 }); assert.ok(low.windY! > 0);
  sky.state.ravenAttack = 0; sky.state.ravenAt = sky.state.elapsed - 2;
  sky.step(dt, { x: 100, y: 499, z: 285 });
  assert.equal(sky.state.pilot.cloud, 0); assert.equal(sky.state.pilot.danger, 0);
  assert.ok(sky.state.ravens.every(r => !r.hot));
  assert.equal(CLOUD_STRIKE.collapse, 2.4); assert.equal(CLOUD_STRIKE.sink, 8);
  assert.equal(CLOUD_OPENING.height, 450);
});
