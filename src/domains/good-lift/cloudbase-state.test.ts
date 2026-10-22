import type { Vector2 } from '../flight/models.ts';
import type { CloudbaseRun } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOUD_FOG, CLOUD_GATE, CLOUD_OPENING, CLOUD_HUNT, CLOUD_LAUNCH, CLOUD_POOL, CLOUD_STORM, CLOUD_STRIKE, CLOUD_WEAR, CLOUD_ZONE, cloudFogSpeed, cloudThermalRemaining, createCloudbaseRun } from './cloudbase-state.ts';
import { surfaceAt } from '../flight/ground.ts';
import { createRunWorld, startRun, stepRun } from './run-step.ts';
const STEP = 1 / 60;
const point = (site: Vector2 = CLOUD_LAUNCH, y = 500) => ({ x: site.x, y, z: site.z });
function advance(run: CloudbaseRun, seconds: number, pos = point()) { let ended; for (let i = 0; i < Math.round(seconds / STEP); i++) { ended = run.step(STEP, pos); if (ended) break; } return ended; }

test('reachable source time uses the earlier boundary fade or natural expiry, including synthetic fixtures', () => {
  const full = { life: 120, age: 20, edgeFade: -1 };
  assert.equal(cloudThermalRemaining(full), 100);
  assert.equal(cloudThermalRemaining({ ...full, edgeFade: 7 }), 7);
  assert.equal(cloudThermalRemaining({ ...full, age: 118, edgeFade: 7 }), 2);
  assert.equal(cloudThermalRemaining({ ...full, edgeFade: 0 }), 0);
  assert.equal(cloudThermalRemaining({ ...full, age: 121 }), 0);
  assert.equal(cloudThermalRemaining({}), Infinity);
  assert.equal(cloudThermalRemaining({ edgeFade: 4 }), 4);
  assert.equal(cloudThermalRemaining({ life: Infinity, age: 400 }), Infinity);
});

test('a seeded sky has four hunted thermals, anchored launch, stable pools and a northward start', () => {
  const run = createCloudbaseRun(); run.reset(80, 5);
  assert.equal(CLOUD_GATE.yaw, 0); assert.equal(run.state.thermals.length, 5); assert.equal(run.state.ravens.length, 20);
  assert.equal(run.state.thermals[0].x, CLOUD_LAUNCH.x);
  assert.equal(run.state.thermals[0].vx, 0);
  for (const t of run.state.thermals.slice(1)) { assert.equal(t.generation, 1); assert.equal(t.r, t === run.state.thermals[1] ? CLOUD_OPENING.r : CLOUD_HUNT.r); assert.ok(t.s <= 5.5); }
  const refs = [...run.state.thermals, ...run.state.ravens]; run.reset(80, 99);
  assert.deepEqual([...run.state.thermals, ...run.state.ravens].map((t, i) => t === refs[i]), refs.map(() => true));
});
test('hundreds of skies preserve full cell lifetimes and leave room for a complete boundary fade', () => {
  const run = createCloudbaseRun();
  for (let seed = 1; seed <= 300; seed++) {
    run.reset(80, seed);
    for (let i = 1; i < CLOUD_POOL.thermals; i++) {
      const t = run.state.thermals[i];
      assert.ok(t.life >= CLOUD_HUNT.life[0] && t.life <= CLOUD_HUNT.life[1]);
      assert.ok(Math.hypot(t.vx, t.vz) * t.life <= CLOUD_HUNT.drift + 1e-8);
      const reach = CLOUD_ZONE.r - CLOUD_HUNT.margin - CLOUD_HUNT.drift / t.life * CLOUD_HUNT.fade;
      assert.ok(Math.hypot(t.x - CLOUD_ZONE.x, t.z - CLOUD_ZONE.z) < reach);
      for (let j = 1; j < i; j++) assert.ok(Math.hypot(t.x - run.state.thermals[j].x, t.z - run.state.thermals[j].z) >= CLOUD_HUNT.separation - 1e-8);
    }
  }
});
test('cell drift preserves generation until rebirth and launch remains anchored', () => {
  const run = createCloudbaseRun({ hazards: false }); run.reset(80, 7);
  const t = run.state.thermals[2], x = t.x, z = t.z, id = t.generation;
  advance(run, 10, point(CLOUD_ZONE, 10000));
  assert.ok(Math.hypot(t.x - x, t.z - z) > 10); assert.equal(t.generation, id);
  assert.equal(run.state.thermals[0].x, CLOUD_LAUNCH.x); assert.equal(run.state.thermals[0].z, CLOUD_LAUNCH.z);
  advance(run, 150, point(CLOUD_ZONE, 10000)); assert.ok(t.generation > id);
});
test('fixed-step weather changes sides and current wind continuously advects clouds and cells', () => {
  const run = createCloudbaseRun({ hazards: false }); run.reset(80, 12);
  const firstX = run.state.ambientX;
  advance(run, 101, point(CLOUD_ZONE, 10000));
  assert.equal(run.state.weather.shifting, true); assert.equal(run.state.weather.transition, 1);
  assert.ok(run.state.weather.progress > 0 && run.state.weather.progress < 1);
  const cloud = run.state.clouds.find((c) => Math.abs(c.x - CLOUD_ZONE.x) < 300 && Math.abs(c.z - CLOUD_ZONE.z) < 300);
  const cell = run.state.thermals.find((t, i) => i > 0 && t.live && t.edgeFade < 0);
  assert.ok(cloud && cell);
  const cx = cloud.x, cz = cloud.z, tx = cell.x, tz = cell.z, generation = cell.generation;
  run.step(STEP, point(CLOUD_ZONE, 10000));
  assert.ok(Math.abs(cloud.x - cx - cloud.vx * STEP) < 1e-9);
  assert.ok(Math.abs(cloud.z - cz - cloud.vz * STEP) < 1e-9);
  assert.ok(Math.abs(cell.x - tx - cell.vx * STEP) < 1e-9);
  assert.ok(Math.abs(cell.z - tz - cell.vz * STEP) < 1e-9);
  assert.equal(cell.generation, generation);
  assert.equal(cloud.vx, run.state.wind[cloud.layer].x);
  const sampled = run.sample(point(CLOUD_ZONE, 80));
  assert.equal(sampled.ambientX, run.state.ambientX); assert.equal(sampled.ambientZ, run.state.ambientZ);
  advance(run, 15, point(CLOUD_ZONE, 10000));
  assert.equal(run.state.weather.shifting, false); assert.ok(firstX * run.state.ambientX < 0);
});
test('clouds wrap in both dimensions only at invisible seams without changing their current velocity', () => {
  for (const wind of [{ x: 4, z: 0 }, { x: 0, z: -4 }]) {
    const run = createCloudbaseRun({ hazards: false, fixedWind: wind }); run.reset();
    const c = run.state.clouds[0], half = CLOUD_STORM.span / 2;
    c.x = CLOUD_ZONE.x + (wind.x ? half - 0.01 : 0);
    c.z = CLOUD_ZONE.z + (wind.z ? -half + 0.01 : 0);
    c.fade = 0;
    const x = c.x, z = c.z;
    run.step(STEP, point(CLOUD_ZONE, 10000));
    assert.ok(Math.hypot(c.x - x, c.z - z) > 800);
    assert.ok(c.fade < 0.001, 'a seam crossing has no visible cloud or hazard');
    assert.equal(c.vx, wind.x); assert.equal(c.vz, wind.z);
  }
});
test('a cell boundary exit fades for twelve seconds and relocates only after strength reaches zero', () => {
  const run = createCloudbaseRun({ hazards: false, fixedWind: { x: 4, z: 0 } }); run.reset();
  const t = run.state.thermals[2], generation = t.generation, safe = CLOUD_ZONE.r - CLOUD_HUNT.margin;
  t.life = 120; t.age = 5; t.wear = 0; t.move = 0; t.live = true; t.strength = 1; t.edgeFade = -1;
  t.x = safe - CLOUD_HUNT.drift / t.life * CLOUD_HUNT.fade - 0.5; t.z = CLOUD_ZONE.z;
  let began = -1, ended = -1, previous = 1;
  for (let tick = 0; tick < 16 * 60; tick++) {
    const before = t.strength;
    run.step(STEP, point(CLOUD_ZONE, 10000));
    if (t.generation !== generation || t.waiting) {
      assert.ok(before < 0.001); assert.equal(t.strength, 0); ended = tick; break;
    }
    assert.ok(Math.hypot(t.x - CLOUD_ZONE.x, t.z - CLOUD_ZONE.z) <= safe + 1e-8);
    if (t.edgeFade >= 0) {
      if (began < 0) began = tick;
      assert.ok(t.strength <= previous); previous = t.strength;
    }
  }
  assert.ok(began >= 0 && ended > began);
  assert.ok(Math.abs((ended - began) * STEP - CLOUD_HUNT.fade) < STEP * 2);
});
test('turning weather keeps every live cell inside the boundary over many seeded complete runs', () => {
  const run = createCloudbaseRun({ hazards: false });
  for (let seed = 1; seed <= 12; seed++) {
    run.reset(80, seed);
    for (let tick = 0; tick < 600 * 60; tick++) {
      run.step(STEP, point(CLOUD_ZONE, 10000));
      if (tick % 10) continue;
      for (const t of run.state.thermals.slice(1)) if (t.live) {
        assert.ok(Math.hypot(t.x - CLOUD_ZONE.x, t.z - CLOUD_ZONE.z) <= CLOUD_ZONE.r - CLOUD_HUNT.margin + 1e-8);
        assert.ok(t.life >= 90 && t.life <= 120);
        assert.ok(Math.hypot(t.vx, t.vz) * t.life <= CLOUD_HUNT.drift + 1e-8);
      }
    }
  }
});
test('reset restores weather, cloud positions and source generations exactly, and disabled wind wins', () => {
  const run = createCloudbaseRun({ hazards: false }); run.reset(80, 77);
  const original = structuredClone(run.state), weather = run.state.weather, cloud = run.state.clouds[0];
  advance(run, 160, point(CLOUD_ZONE, 10000)); run.reset(80, 77);
  assert.deepEqual(run.state, original); assert.equal(run.state.weather, weather); assert.equal(run.state.clouds[0], cloud);
  const still = createCloudbaseRun({ wind: false, fixedWind: { x: 4, z: 0 } }); still.reset();
  const x = still.state.clouds[0].x, z = still.state.clouds[0].z;
  advance(still, 140, point(CLOUD_ZONE, 10000));
  assert.equal(still.state.ambientX, 0); assert.equal(still.state.ambientZ, 0);
  assert.equal(still.state.clouds[0].x, x); assert.equal(still.state.clouds[0].z, z);
  assert.ok(still.state.thermals.every((t) => t.vx === 0 && t.vz === 0));
});
test('sampling air never consumes lift, advances fog, changes a random seed or moves an obstacle', () => {
  const run = createCloudbaseRun(); run.reset(80, 9);
  const before = structuredClone(run.state);
  for (let i = 0; i < 200; i++) { run.sample(point(), 0.3); run.windAt(100, 500, 200, {}); }
  assert.deepEqual(run.state, before);
});
test('same input steps give the same sky despite different render sampling frequency', () => {
  const a = createCloudbaseRun({ hazards: false }), b = createCloudbaseRun({ hazards: false });
  a.reset(80, 13); b.reset(80, 13);
  for (let i = 0; i < 8000; i++) {
    const p = point(CLOUD_ZONE, 10000); a.step(STEP, p);
    if (i % 3) b.windAt(i % 200, 400, i % 300, {});
    b.step(STEP, p);
  }
  assert.deepEqual(a.state, b.state);
});
test('wind vector, visible air and vertical diagnostics agree, with bird damage separate', () => {
  const run = createCloudbaseRun(); run.reset(80, 5);
  const p = point(run.state.thermals[1], 700), a = run.sample(p), drawn = run.windAt(p.x, p.y, p.z, {});
  assert.equal(a.windX, drawn.x); assert.equal(a.windY, drawn.y); assert.equal(a.windZ, drawn.z);
  assert.equal(a.windY, a.lift! - a.sink!); assert.ok(a.windY <= 6);
  run.strike(); const folded = run.sample(p);
  assert.equal(folded.windY, a.windY); assert.equal(folded.hazardSink, CLOUD_STRIKE.sink);
});
test('launch departure clears real terrain at trim and slow flight with adverse cardinal winds', () => {
  for (const speed of [8.6, 11.5]) for (const wind of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
    const run = createCloudbaseRun({ hazards: false, fixedWind: { x: wind[0], z: wind[1] } }); run.reset();
    const p = { ...CLOUD_GATE }; let vy = 0, min = Infinity;
    for (let i = 0; i < 600; i++) {
      const a = run.sample(p);
      vy += (a.windY! - (speed === 8.6 ? 1 : 1.2) - vy) / 24;
      p.x += a.windX! * STEP; p.z += (-speed + a.windZ!) * STEP; p.y += vy * STEP;
      min = Math.min(min, p.y - surfaceAt(p.x, p.z)); run.step(STEP, p);
    }
    assert.ok(min > 20, `clearance ${min} at ${speed}m/s wind ${wind}`);
  }
});
test('ravens mark thermals below 500 m without attack opportunities', () => {
  const run = createCloudbaseRun(); run.reset(80, 21);
  advance(run, 120, point(CLOUD_ZONE, 499));
  assert.ok(run.state.ravens.some(r => r.fade > 0));
  assert.ok(run.state.ravens.every(r => !r.hot && !r.threat));
  assert.equal(run.state.ravenDue, -1);
});

function circleTraffic({ y = 700, turn = -1, eligible = true, due = 120, seconds = 12 } = {}) {
  const run = createCloudbaseRun({ wind: false }); run.reset(y, 1);
  for (const cloud of run.state.clouds) cloud.y = 10000;
  for (const [id, cell] of run.state.thermals.entries()) {
    cell.live = id === 1; cell.move = 0;
    if (id === 1) Object.assign(cell, { x: 0, z: 80, fromX: 0, fromZ: 80, dir: 1, life: 1000 });
  }
  run.state.ravenDue = due;
  const warnings = [];
  for (let i = 0; i < seconds / STEP; i++) {
    const angle = i * STEP * turn * 0.4, cell = run.state.thermals[1];
    run.step(STEP, { x: cell.x + Math.sin(angle) * 25, y, z: cell.z - Math.cos(angle) * 25 }, { flowEligible: eligible });
    if (run.state.ravenAttack >= 0) warnings.push({ time: run.state.elapsed, at: run.state.ravenAt,
      hot: run.state.ravens.some(bird => bird.hot), strikes: run.state.pilot.strikes });
  }
  return { run, warnings };
}

test('sustained opposing traffic spends encounter time at 1.5x after grace, while correct flow keeps the baseline', () => {
  const against = circleTraffic().run, matching = circleTraffic({ turn: 1 }).run;
  assert.equal(matching.state.ravenDue, 120);
  assert.equal(against.state.flow.pressure, true);
  assert.ok(against.state.ravenDue > 115.4 && against.state.ravenDue < 115.6);
  assert.equal(against.state.pilot.strikes, 0, 'extra pressure alone causes no strike');
  for (const options of [{ y: 499 }, { eligible: false }]) {
    const { run } = circleTraffic(options);
    assert.equal(run.state.ravenDue, 120);
    assert.ok(run.state.ravens.every(bird => !bird.hot && !bird.threat));
  }
});

test('accelerated traffic retains the full warning lead and requires the normal contact window', () => {
  const { run, warnings } = circleTraffic({ due: 12, seconds: 11 });
  assert.ok(warnings.length > 60);
  assert.ok(warnings[0].time < 10, 'opposing flow reaches the scheduled opportunity sooner');
  assert.ok(warnings.filter(w => w.time - w.at < 1 - 1e-9).every(w => !w.hot && !w.strikes));
  assert.ok(warnings.some(w => w.time - w.at >= 1 && w.hot));
  const before = structuredClone(run.state.flow);
  run.step(0, point(CLOUD_ZONE, 700));
  assert.deepEqual(run.state.flow, before);
  run.reset(); assert.equal(run.state.flow.source, -1); assert.equal(run.state.flow.pressure, false);
});
test('a warned raven in its collision window folds the canopy once and the shield prevents repeats', () => {
  const run = createCloudbaseRun({ wind: false }); run.reset();
  run.state.clouds.forEach(c => { c.y = 10000; });
  run.step(STEP, point(CLOUD_ZONE, 700));
  const index = run.state.ravens.findIndex(bird => bird.fade >= 1);
  const r = run.state.ravens[index]; assert.ok(r);
  run.state.ravenAttack = index; run.state.ravenAt = run.state.elapsed - 1.1;
  run.state.ravenDue = run.state.elapsed + 60;
  run.step(STEP, { x: r.x, y: r.y - CLOUD_STRIKE.rise, z: r.z });
  assert.equal(run.state.pilot.strikes, 1); assert.ok(run.state.pilot.collapse > 0);
  run.strike(); assert.equal(run.state.pilot.strikes, 1);
  assert.ok(run.reopen(0.4)); assert.ok(run.state.pilot.collapse < CLOUD_STRIKE.collapse);
});
test('spent launch never regenerates and a hunted cell rebirth changes generation', () => {
  const run = createCloudbaseRun({ hazards: false }); run.reset();
  const t = run.state.thermals[2], gen = t.generation; t.wear = CLOUD_WEAR.dead;
  run.step(STEP, point(CLOUD_ZONE, 10000)); assert.ok(t.generation > gen || t.waiting);
  advance(run, 46, point(CLOUD_ZONE, 10000));
  const launch = run.state.thermals[0]; launch.wear = CLOUD_WEAR.dead;
  run.step(STEP, point(CLOUD_ZONE, 10000)); assert.equal(launch.live, false);
  advance(run, 120, point(CLOUD_ZONE, 10000)); assert.equal(launch.live, false);
});
test('cloud weather changes the same vertical vector that the streaks draw', () => {
  const run = createCloudbaseRun(); run.reset();
  const cloud = run.state.clouds[0]; Object.assign(cloud, { x: 100, y: 600, z: 285, fade: 1, rx: 30, ry: 30, rz: 30 });
  const p = { x: 100, y: 600 - CLOUD_STRIKE.rise, z: 285 };
  const felt = run.sample(p), drawn = run.windAt(p.x, p.y, p.z, {});
  assert.ok(felt.windY! < 0); assert.equal(felt.windY, drawn.y);
});
test('fog preserves the opening then rises slowly enough to leave high acro room through the deadline', () => {
  for (const elapsed of [0, 60, 150, 299, 300]) {
    assert.equal(cloudFogSpeed(0, elapsed), 0.25 + 0.001 * elapsed, `unchanged opening at ${elapsed}s`);
  }
  for (const elapsed of [300, 360, 480, 600, 1200]) {
    assert.equal(cloudFogSpeed(0, elapsed), CLOUD_FOG.max, `capped at ${elapsed}s`);
    assert.equal(cloudFogSpeed(1000, elapsed), CLOUD_FOG.max, 'altitude cannot accelerate the floor');
  }
  const run = createCloudbaseRun({ hazards: false }); run.reset();
  assert.equal(advance(run, 300, point(CLOUD_ZONE, 10000)), null);
  assert.ok(Math.abs(run.state.fogHeight - 120) < 0.01);
  assert.equal(advance(run, 300, point(CLOUD_ZONE, 10000)), null); assert.equal(run.state.active, true);
  assert.ok(Math.abs(run.state.fogHeight - 285) < 0.01);
  assert.ok(750 - run.state.fogHeight > 450, 'wingover altitude retains useful room after ten minutes');
  assert.equal(run.step(STEP, point(CLOUD_ZONE, run.state.fogHeight + 2)), 'fog');
});
test('finish freezes the entire sky and clears canopy damage', () => {
  const run = createCloudbaseRun(); run.reset(); run.strike(); run.finish();
  assert.equal(run.state.pilot.collapse, 0);
  const before = structuredClone(run.state); advance(run, 30); assert.deepEqual(run.state, before);
  assert.equal(run.sample(point()).windY, 0);
});

test('the actual wing has ten seconds of clear northward departure and can circle launch for thirty', () => {
  for (let seed = 1; seed <= 64; seed++) {
    const straight = startRun(createRunWorld({ sky: createCloudbaseRun({ hazards: false }) }), seed);
    for (let i = 0; i < 600; i++) {
      assert.equal(stepRun(straight, { turn: 0, brake: false, bar: false, ears: false }), null);
      assert.ok(straight.g.pos.y - surfaceAt(straight.g.pos.x, straight.g.pos.z) > 20);
    }
    const world = startRun(createRunWorld({ sky: createCloudbaseRun({ hazards: false }) }), seed);
    for (let i = 0; i < 1800; i++) {
      const g = world.g, core = CLOUD_LAUNCH;
      const angle = Math.atan2(g.pos.x - core.x, -(g.pos.z - core.z)) + 0.8;
      const want = Math.atan2(core.x + Math.sin(angle) * 25 - g.pos.x, -(core.z - Math.cos(angle) * 25 - g.pos.z));
      const error = Math.atan2(Math.sin(want - g.yaw), Math.cos(want - g.yaw));
      const turn = Math.max(-1, Math.min(1, error * 1.2 - g.yawRate));
      assert.equal(stepRun(world, { turn, brake: true, bar: false, ears: false }), null);
      assert.ok(g.pos.y - surfaceAt(g.pos.x, g.pos.z) > 15, `launch clearance under sky ${seed}`);
    }
    assert.ok(world.g.pos.y > CLOUD_GATE.y + 20, `a controlled circle climbs under sky ${seed}`);
  }
});
