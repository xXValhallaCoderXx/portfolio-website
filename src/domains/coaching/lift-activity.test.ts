import type { AirSample, ThermalSource } from '../flight/models.ts';
import type { CoachingAdapter, FlightObservation } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiftActivity, LIFT_ACTIVITY, ridgeTangent } from './lift-activity.ts';
import { createTerrainAir, thermalProfile } from '../flight/atmosphere.ts';
import { FLIGHT } from '../flight/flight.ts';
import { createCloudbaseRun } from '../good-lift/cloudbase-state.ts';
import { createRunWorld, startRun, stepBits } from '../good-lift/run-step.ts';
import { createReferenceKeys, TST } from '../good-lift/pilots.ts';
import { createRunCoachEnvironment } from '../../features/good-lift/services/coach-run.service.ts';

const STEP = 1 / 60, near = (a: number|null, b: number) => assert.ok(Math.abs(a! - b) < 1e-9, `${a} != ${b}`);
const cliff = (x: number): number => 80 * Math.max(0, Math.min(1, (x + 8) / 16));
const freeze = <T extends object>(object: T): Readonly<T> => { Object.values(object).forEach(value => { if (value && typeof value === 'object') freeze(value); }); return Object.freeze(object); };
function circle(time: number, { x = 0, z = 0, vx = 0, vz = 0, radius = 25, rate = 0.35, dir = 1, y = 150, vy = 1, start = 0 } = {}) {
  const angle = start + dir * rate * time, speed = radius * rate;
  return { pos: { x: x + vx * time + Math.sin(angle) * radius, y: y + vy * time, z: z + vz * time - Math.cos(angle) * radius },
    vy, yaw: angle + dir * Math.PI / 2, track: angle + dir * Math.PI / 2, yawRate: dir * rate,
    speed, bank: dir * 0.4, pitch: 0, stall: 0, tuck: 0, ears: 0,
    pilot: { vel: { x: vx + Math.cos(angle) * dir * speed, y: vy, z: vz + Math.sin(angle) * dir * speed } } };
}
function line(time: number, { x = -45, z = 0, vx = 0, vz = -10, y = 140, vy = 0 } = {}) {
  return { pos: { x: x + vx * time, y: y + vy * time, z: z + vz * time }, vy,
    yaw: Math.atan2(vx, -vz), track: Math.atan2(vx, -vz), yawRate: 0, speed: Math.hypot(vx, vz),
    bank: 0, pitch: 0, stall: 0, tuck: 0, ears: 0, pilot: { vel: { x: vx, y: vy, z: vz } } };
}
function environment(sources: readonly ThermalSource[] = [], heightAt: CoachingAdapter['heightAt'] = () => 0) { return { heightAt, sources: () => sources, inside: () => true }; }
function thermalAir(g: FlightObservation, sources: readonly ThermalSource[]): AirSample {
  const thermal = sources.reduce((sum: number, s) => sum + (s.live === false ? 0 : (s.s ?? 5.5) * (s.strength ?? 1) *
    thermalProfile(Math.hypot(g.pos.x - s.x, g.pos.z - s.z), s.r ?? 60, s.fade ?? 1)), 0);
  return { windX: 0, windZ: 0, windY: Math.min(6, thermal), thermal, ridge: 0, lee: 0 };
}
function thermalRun(observer: ReturnType<typeof createLiftActivity>, source: ThermalSource, until: number, { from = 0, geometry = {}, air: override, flags = {} }: {from?: number; geometry?: Parameters<typeof circle>[1]; air?: AirSample; flags?: Record<string, boolean>} = {}) {
  let state;
  for (let n = Math.round(from / STEP) + 1; n <= Math.round(until / STEP); n++) {
    const time = n * STEP;
    const g = circle(time, geometry);
    if (geometry!.vx || geometry!.vz) { source.x = (geometry!.x ?? 0) + (geometry!.vx ?? 0) * time; source.z = (geometry!.z ?? 0) + (geometry!.vz ?? 0) * time; }
    state = observer.step(STEP, { g, air: override ?? thermalAir(g, [source]), clock: time, ...flags });
  }
  return state;
}

test('ridge tangent comes from a real broad face, mirrors correctly and cannot invent a ridge on flat ground', () => {
  for (const side of [-1, 1]) {
    const terrain = createTerrainAir(x => cliff(side * x)), g = line(0, { x: side * -45 });
    const air = terrain.sample(g.pos, side * 3.5, 0, {});
    const tangent = ridgeTangent(g, air, terrain.heightAt);
    assert.notEqual(tangent, null); near(Math.abs(Math.cos(tangent!)), 1);
  }
  assert.equal(ridgeTangent(line(0), { ridge: 3, ambientX: 3.5, ambientZ: 0 }, () => 0), null);
  const distant = (x: number) => x > 75 ? 80 : 0;
  near(ridgeTangent(line(0, { x: 0 }), { ridge: 2, ambientX: 3.5, ambientZ: 0 }, distant), 0);
});

test('ridge activity earns its full1.5s from real ground motion along useful lift', () => {
  const terrain = createTerrainAir(cliff), observer = createLiftActivity(environment([], terrain.heightAt));
  let state;
  for (let n = 0; n < 90; n++) {
    const g = line(n * STEP); g.track = Math.PI / 2;
    state = observer.step(STEP, { g, air: terrain.sample(g.pos, 3.5, 0, {}), clock: n * STEP });
    assert.equal(state.activity, n < 89 ? 'navigating' : 'ridge', 'air-relative track cannot replace the actual ground course');
  }
  assert.equal(state!.sourceId, null); assert.equal(state!.sourceDir, null);
});

test('head-on flight, flat phantom lift, descending flight and thermal fly-throughs do not become ridge soaring', () => {
  const terrain = createTerrainAir(cliff);
  for (const kind of ['head-on', 'flat', 'descending', 'thermal'] as const) {
    const observer = createLiftActivity(environment([], kind === 'flat' ? () => 0 : terrain.heightAt));
    for (let n = 0; n < 240; n++) {
      const time = n * STEP;
      const g = line(time, kind === 'head-on' ? { vx: 10, vz: 0 } : kind === 'descending' ? { vy: -0.2 } : {});
      const air: AirSample = kind === 'flat' ? { windY: 3, ridge: 3, ambientX: 3.5, ambientZ: 0 } : terrain.sample(g.pos, 3.5, 0, {});
      if (kind === 'thermal') { air.thermal = 5.5; air.windY = 6; }
      observer.step(STEP, { g, air, clock: time });
    }
    assert.equal(observer.state.activity, 'navigating', kind);
  }
});

test('ridge acquisition pauses through a half-second dip, resets beyond it, and exits after1.5s', () => {
  const terrain = createTerrainAir(cliff), observer = createLiftActivity(environment([], terrain.heightAt));
  let clock = 0;
  const advance = (seconds: number, useful: boolean) => { for (let n = 0; n < Math.round(seconds / STEP); n++) {
    const g = line(clock); const air = terrain.sample(g.pos, 3.5, 0, {}); if (!useful) air.windY = 0;
    observer.step(STEP, { g, air, clock }); clock += STEP;
  } return observer.state; };
  near(advance(1, true).acquireSeconds, 1);
  near(advance(0.5, false).acquireSeconds, 1);
  assert.equal(advance(0.5, true).activity, 'ridge');
  assert.equal(advance(1.5 - STEP, false).activity, 'ridge');
  assert.equal(advance(STEP, false).activity, 'navigating');
  observer.reset(); clock = 0;
  advance(1, true); near(advance(0.5 + STEP, false).acquireSeconds, 0);
  assert.equal(advance(1.5 - STEP, true).activity, 'navigating');
  assert.equal(advance(STEP, true).activity, 'ridge');
});

test('thermalling requires3qualifying seconds and real30-degree orbit around one physical source', () => {
  for (const dir of [-1, 1]) {
    const source: ThermalSource = { id: 'core', generation: 2, x: 0, z: 0, r: 60, s: 5.5, remaining: 15 };
    const observer = createLiftActivity(environment([source])), g = circle(0, { dir });
    observer.step(STEP, { g, air: thermalAir(g, [source]), clock: 0 });
    assert.equal(thermalRun(observer, source, 3 - STEP, { geometry: { dir } })!.activity, 'navigating');
    const state = thermalRun(observer, source, 3, { from: 3 - STEP, geometry: { dir } });
    assert.equal(state!.activity, 'thermal'); assert.equal(state!.sourceId, 'core');
    assert.equal(state!.sourceGeneration, 2); assert.equal(state!.sourceDir, dir);
    assert.equal(state!.sourceKey, 'string:core:2');
    assert.ok(source.remaining! < 20, 'actual riding is independent of navigation lifetime reserves');
  }
});

test('a slow partial orbit cannot qualify solely because3seconds passed', () => {
  const source = { x: 0, z: 0, r: 120, s: 5.5 }, observer = createLiftActivity(environment([source]));
  const geometry = { radius: 50, rate: 0.1 }, g = circle(0, geometry);
  observer.step(STEP, { g, air: thermalAir(g, [source]), clock: 0 });
  assert.equal(thermalRun(observer, source, 3, { geometry })!.activity, 'navigating');
  assert.equal(thermalRun(observer, source, 5.3, { from: 3, geometry })!.activity, 'thermal');
});

test('straight passes, rotating the nose, rising outside a source and a ballistic climb cannot claim thermalling', () => {
  const source = { x: 0, z: 0, r: 60, s: 5.5 };
  for (const kind of ['pass', 'nose', 'outside', 'ballistic'] as const) {
    const observer = createLiftActivity(environment([source]));
    for (let n = 0; n < 360; n++) {
      const time = n * STEP;
      const g = kind === 'pass' ? line(time, { x: 8, z: 20, vz: -7, vy: 1 }) : circle(time);
      if (kind === 'nose') { g.pos.x = 0; g.pos.z = -25; g.pilot.vel.x = g.pilot.vel.z = 0; }
      if (kind === 'outside') g.pos.x += 200;
      const air = thermalAir(g, [source]);
      if (kind === 'ballistic') { air.windY = 0; air.thermal = 0; }
      observer.step(STEP, { g, air, clock: time });
    }
    assert.equal(observer.state.activity, 'navigating', kind);
  }
});

test('a drifting centre keeps one confirmed identity and actual orbit sense', () => {
  const source = { id: 4, generation: 8, x: 20, z: 10, r: 60, s: 5.5, vx: 2, vz: -1 };
  const observer = createLiftActivity(environment([source])), geometry = { x: 20, z: 10, vx: 2, vz: -1, dir: -1 };
  const g = circle(0, geometry); observer.step(STEP, { g, air: thermalAir(g, [source]), clock: 0 });
  thermalRun(observer, source, 3, { geometry }); const confirmed = observer.state;
  const state = thermalRun(observer, source, 12, { from: 3, geometry });
  assert.equal(state!.activity, 'thermal'); assert.equal(state!.sourceKey, confirmed.sourceKey);
  assert.equal(state!.since, confirmed.since); assert.equal(state!.sourceDir, -1);
  source.generation++;
  const next = thermalRun(observer, source, 12 + STEP, { from: 12, geometry });
  assert.equal(next!.activity, 'navigating'); near(next!.acquireSeconds, 0);
  assert.equal(confirmed.sourceGeneration, 8, 'old snapshots retain their original identity');
});

test('pending thermal acquisition resets immediately on death, rebirth or clear departure', () => {
  for (const kind of ['dead', 'reborn', 'departure'] as const) {
    const source: ThermalSource = { id: 'core', generation: 1, x: 0, z: 0, r: 60, s: 5.5 };
    const observer = createLiftActivity(environment([source])), g = circle(0);
    observer.step(STEP, { g, air: thermalAir(g, [source]), clock: 0 });
    thermalRun(observer, source, 2); assert.ok(observer.state.acquireSeconds > 1.9);
    if (kind === 'dead') source.live = false;
    if (kind === 'reborn') source.generation!++;
    const nextG = circle(2 + STEP); if (kind === 'departure') nextG.pos.x += 200;
    observer.step(STEP, { g: nextG, air: thermalAir(nextG, [source]), clock: 2 + STEP });
    assert.equal(observer.state.activity, 'navigating'); near(observer.state.acquireSeconds, 0);
  }
});

test('established thermal activity survives easing the turn and exits only after2seconds of lost support', () => {
  const source = { x: 0, z: 0, r: 60, s: 5.5 }, observer = createLiftActivity(environment([source]));
  const initial = circle(0); observer.step(STEP, { g: initial, air: thermalAir(initial, [source]), clock: 0 });
  thermalRun(observer, source, 3);
  for (let n = 181; n <= 360; n++) {
    const g = circle(n * STEP); g.yawRate = 0; g.bank = 0;
    observer.step(STEP, { g, air: thermalAir(g, [source]), clock: n * STEP });
    assert.equal(observer.state.activity, 'thermal', 'turn-input release or eased bank is not a loss of the source');
  }
  assert.equal(thermalRun(observer, source, 8 - STEP, { from: 6, air: { windY: 0, thermal: 0 } })!.activity, 'thermal');
  assert.equal(thermalRun(observer, source, 8, { from: 8 - STEP, air: { windY: 0, thermal: 0 } })!.activity, 'navigating');
});

test('mixed air cannot replace retained ridge activity with a thermal candidate', () => {
  const terrain = createTerrainAir(cliff), source = { id: 'mixed', x: 5, z: -15, r: 120, s: 5.5, live: false };
  const observer = createLiftActivity(environment([source], terrain.heightAt));
  for (let n = 0; n < 90; n++) { const g = line(n * STEP); observer.step(STEP, { g, air: terrain.sample(g.pos, 3.5, 0, {}), clock: n * STEP }); }
  assert.equal(observer.state.activity, 'ridge'); source.live = true;
  for (let n = 1; n <= 180; n++) {
    const g = circle(n * STEP, { x: 5, z: -15, radius: 50, rate: 0.2, start: -Math.PI / 2, y: 140 });
    const air = terrain.sample(g.pos, 3.5, 0, {}); air.thermal = thermalAir(g, [source]).thermal!; air.windY = Math.min(6, air.windY + air.thermal);
    observer.step(STEP, { g, air, clock: 1.5 + n * STEP });
    assert.equal(observer.state.activity, 'ridge'); assert.equal(observer.state.acquiring, null);
  }
});

test('activity uses a0.75s climb EMA, resets unsafe flight immediately, and freezes while paused', () => {
  const terrain = createTerrainAir(cliff), observer = createLiftActivity(environment([], terrain.heightAt));
  const g = line(0), air = terrain.sample(g.pos, 3.5, 0, {});
  observer.step(STEP, { g, air, clock: 0 });
  const rising = line(STEP, { vy: 3 }); observer.step(STEP, { g: rising, air, clock: STEP });
  near(observer.state.climb, 3 * (1 - Math.exp(-STEP / 0.75)));
  const snapshot = observer.state;
  for (let n = 0; n < 100; n++) {
    assert.equal(observer.step(0, { g: rising, air, clock: STEP }), snapshot);
    assert.equal(observer.step(STEP, { g: rising, air, clock: STEP, unsafe: true }), snapshot);
  }
  assert.ok(Object.isFrozen(snapshot));
  assert.equal(observer.step(STEP, { g: rising, air, clock: 2 * STEP, unsafe: true }).activity, 'navigating');
  assert.equal(observer.state.acquireSeconds, 0); assert.notEqual(observer.state, snapshot);
  assert.equal(observer.reset().activity, 'navigating');
});

test('frozen source, flight and air inputs stay unchanged and render reads never advance observations', () => {
  const source = freeze({ id: 'fixed', generation: 1, x: 0, z: 0, r: 60, s: 5.5 });
  const observer = createLiftActivity(environment([source]));
  for (let n = 0; n <= 240; n++) {
    const g = freeze(circle(n * STEP)), air = freeze(thermalAir(g, [source])), before = structuredClone({ g, air, source });
    const state = observer.step(STEP, { g, air, clock: n * STEP });
    for (let read = 0; read < n % 7; read++) assert.equal(observer.state, state);
    assert.deepEqual({ g, air, source }, before);
  }
  assert.equal(observer.state.activity, 'thermal');
});

test('actual v8 fixed-step source observations establish activity without changing a replayed wing or sky', () => {
  for (const seed of [1, 2]) {
    const baseline = createRunWorld({ sky: createCloudbaseRun() }), observed = createRunWorld({ sky: createCloudbaseRun() });
    startRun(baseline, seed); startRun(observed, seed);
    const keys = createReferenceKeys(TST), observer = createLiftActivity(createRunCoachEnvironment(observed.sky));
    let thermalSeconds = 0;
    for (let n = 0; n < 1800; n++) {
      const bits = keys(baseline); assert.equal(stepBits(baseline, bits), null); assert.equal(stepBits(observed, bits), null);
      observer.step(STEP, { g: observed.g, air: observed.air, clock: observed.sky.state.elapsed });
      if (observer.state.activity === 'thermal') thermalSeconds += STEP;
    }
    assert.ok(thermalSeconds > 1, `sky ${seed}: ${thermalSeconds}s of confirmed thermalling`);
    assert.deepEqual(observed.g, baseline.g); assert.deepEqual(observed.sky.state, baseline.sky.state);
    assert.equal(FLIGHT.sink.trim + 0.25, LIFT_ACTIVITY.useful);
  }
});
