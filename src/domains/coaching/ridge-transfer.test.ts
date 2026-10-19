import type { AirSample, HeightSampler, ThermalSource, Vector3 } from '../flight/models.ts';
import type { CoachingAdapter, FlightObservation, LiftFrame } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRidgeTransfer, RIDGE_TRANSFER } from './ridge-transfer.ts';
import { createFlight, FLIGHT } from '../flight/flight.ts';
import { createCloudbaseRun } from '../good-lift/cloudbase-state.ts';
import { createRunCoachEnvironment } from '../../features/good-lift/services/coach-run.service.ts';
import { shore } from '../flight/ground.ts';

const STEP = 1 / 60;
const source = (changes = {}) => ({ id: 1, generation: 2, x: 0, z: -150, r: 60,
  s: 5.5, strength: 1, live: true, remaining: 120, vx: 0, vz: 0, ...changes });
const wing = (y = 100, yaw = 0) => ({ pos: { x: 0, y, z: 0 }, track: yaw, yaw,
  speed: FLIGHT.speed.trim, bank: 0, pitch: 0, stall: 0, tuck: 0, ears: 0 });
const environment = (sources: readonly ThermalSource[] = [source()], overrides: Partial<CoachingAdapter> = {}): CoachingAdapter & {sources: () => readonly ThermalSource[]} => ({ heightAt: () => 0,
  sources: () => sources, sampleAir: (_p, out) => Object.assign(out, { windY: 0 }),
  inside: () => true, fog: () => null, cloudDepth: () => 0, ...overrides });
const facts = (g: FlightObservation = wing(), clock = 0, air: AirSample = {}): LiftFrame => ({ g, clock, air });
const freeze = <T extends object>(object: T): Readonly<T> => {
  for (const value of Object.values(object)) if (value && typeof value === 'object') freeze(value);
  return Object.freeze(object);
};

test('a live hunted thermal needs height for alignment, glide and a complete entry reserve', () => {
  const transfer = createRidgeTransfer(environment()), g = wing(40);
  const low = transfer.step(STEP, facts(g));
  assert.equal(low.ready, false); assert.equal(low.targetId, 1); assert.equal(low.generation, 2);
  assert.ok(low.requiredHeight! > 60 && low.missingHeight! > 20);
  assert.equal(low.missingHeight, low.requiredHeight! - g.pos.y);
  g.pos.y = low.requiredHeight!;
  const enough = transfer.step(STEP, facts(g, 0.5));
  assert.equal(enough.ready, true); assert.equal(enough.missingHeight, 0);
  assert.ok(enough.seconds! > 10 && enough.seconds! < 20);
  const facingAway = createRidgeTransfer(environment()).step(STEP, facts(wing(40, Math.PI)));
  assert.ok(facingAway.requiredHeight! > low.requiredHeight! + 5, 'initially pointing away costs real turn time and height');
  assert.ok(facingAway.seconds! > low.seconds!);
});

test('ambient headwind and moving-source drift change readiness rather than crediting ridge lift', () => {
  const estimate = (air: {}|undefined, next = source()) => createRidgeTransfer(environment([next])).step(STEP, facts(wing(), 0, air));
  const tail = estimate({ ambientZ: -3 }), head = estimate({ ambientZ: 3 });
  assert.ok(head.seconds! > tail.seconds! && head.requiredHeight! > tail.requiredHeight!);
  const away = estimate({}, source({ vz: -2 })), fixed = estimate({});
  assert.ok(away.seconds! > fixed.seconds! && away.requiredHeight! > fixed.requiredHeight!);
  assert.deepEqual(estimate({ ambientZ: 3, windZ: -3 }), head, 'local cliff deflection cannot stand in for incoming ambient wind');
  const rising = createRidgeTransfer(environment([source()], { sampleAir: (_p, out) => Object.assign(out, { windY: 5 }) })).step(STEP, facts());
  assert.deepEqual(rising, fixed, 'positive air on the current route is not promised throughout a transfer');
  assert.equal(estimate({ ambientZ: 15 }).targetId, null, 'a numerical interception cannot promise progress against wind stronger than the wing');
});

test('terrain under either wing and the entry circle contributes to required height', () => {
  const estimate = (heightAt: HeightSampler) => createRidgeTransfer(environment([source()], { heightAt })).step(STEP, facts(wing(50)));
  const flat = estimate(() => 0);
  const ridge = estimate((_x, z: number) => z < -50 && z > -70 ? 100 : 0);
  assert.equal(ridge.ready, false); assert.ok(ridge.requiredHeight! > 115);
  const wingTip = estimate((x): number => x > 4 && x < 8 ? 60 : 0);
  assert.ok(wingTip.requiredHeight! >= 60 + RIDGE_TRANSFER.clearance && wingTip.requiredHeight! > flat.requiredHeight! + 20,
    'a clear centre line does not clear the wing-height obstacle plus the remaining glide loss');
  const capture = estimate((x): number => x > 20 ? 100 : 0);
  assert.ok(capture.requiredHeight! > flat.requiredHeight! + 80, 'arrival must leave room and height for the first circle');
  const join = estimate((x: number, z: number) => Math.abs(x) < 2 && z < -158 && z > -164 ? 200 : 0);
  assert.ok(join.requiredHeight! > 215, 'the connection from the intercepted centre to the entry circle is sampled too');
});

test('rising fog increases the budget; clouds, arena edges and insufficient source life cannot be fixed by extra height', () => {
  const flat = createRidgeTransfer(environment()).step(STEP, facts(wing(50)));
  const fog = createRidgeTransfer(environment([source()], { fog: () => ({ height: 0, elapsed: 20, speedAt: () => 1.5 }) })).step(STEP, facts(wing(50)));
  assert.ok(fog.requiredHeight! > flat.requiredHeight! + 20);
  for (const adapter of [
    environment([source()], { cloudDepth: (p: Vector3) => p.z < -60 ? 1 : 0 }),
    environment([source()], { cloudDepth: (p: Vector3) => Math.abs(p.x) < 2 && p.z < -158 && p.z > -164 ? 1 : 0 }),
    environment([source()], { inside: (p: Vector3) => p.x < 5 }),
    environment([source({ remaining: 35 })]),
    environment([source({ id: 0 })]),
    environment([source({ launch: true })]),
    environment([source({ move: 1 })]),
    environment([source({ strength: 0.1 })]),
  ]) {
    const result = createRidgeTransfer(adapter).step(STEP, facts(wing(200)));
    assert.equal(result.ready, false); assert.equal(result.targetId, null);
    assert.equal(result.requiredHeight, null);
  }
});

test('eight metres of height hysteresis prevents a ready target flickering around its entry threshold', () => {
  const transfer = createRidgeTransfer(environment()), g = wing(40);
  const first = transfer.step(STEP, facts(g));
  g.pos.y = first.requiredHeight!;
  assert.equal(transfer.step(STEP, facts(g, 0.5)).ready, true);
  g.pos.y -= RIDGE_TRANSFER.hysteresis - 1;
  assert.equal(transfer.step(STEP, facts(g, 1)).ready, true, 'small altitude loss stays inside the retained safety margin');
  g.pos.y -= 2;
  const lost = transfer.step(STEP, facts(g, 1.5));
  assert.equal(lost.ready, false); assert.ok(lost.missingHeight! > 0);
  assert.equal(transfer.step(STEP, facts(g, 2)).ready, false, 're-entry requires the full margin again');
});

test('source death, generation replacement and material wind changes invalidate the half-second cache', () => {
  const next = source(), sources = [next], transfer = createRidgeTransfer(environment(sources));
  const g = wing(200), first = transfer.step(STEP, facts(g));
  assert.equal(first.ready, true);
  assert.equal(transfer.step(STEP, facts(g, STEP)), first);
  next.live = false;
  assert.equal(transfer.step(STEP, facts(g, 2 * STEP)).targetId, null);
  next.live = true;
  const live = transfer.step(STEP, facts(g, 1));
  next.generation++;
  const reborn = transfer.step(STEP, facts(g, 1 + STEP));
  assert.equal(reborn.generation, 3); assert.notEqual(reborn, live);
  const wind = transfer.step(STEP, facts(g, 1 + 2 * STEP, { ambientZ: 3 }));
  assert.notEqual(wind, reborn); assert.ok(wind.seconds! > reborn.seconds!);
  next.vz = -2;
  const drifting = transfer.step(STEP, facts(g, 1 + 3 * STEP, { ambientZ: 3 }));
  assert.notEqual(drifting, wind); assert.ok(drifting.seconds! > wind.seconds!, 'new source drift invalidates a stale interception');
});

test('paused reads and cached ticks do not resample or mutate frozen flight/source data', () => {
  let samples = 0;
  const sources = freeze([source()]), g = freeze(wing()), air = freeze({ ambientX: 1, windY: 3 });
  const adapter = environment(sources, { sampleAir: (_p, out) => { samples++; return Object.assign(out, { windY: 0 }); } });
  const transfer = createRidgeTransfer(adapter), before = JSON.stringify({ g, air, sources });
  const result = transfer.step(STEP, facts(g, 0, air)), count = samples;
  assert.ok(count > 10 && count < 200, 'a bounded corridor is sampled once');
  for (let n = 1; n < 30; n++) assert.equal(transfer.step(STEP, facts(g, n * STEP, air)), result);
  for (let n = 0; n < 50; n++) assert.equal(transfer.step(0, facts(g, 2, air)), result);
  assert.equal(samples, count);
  assert.equal(JSON.stringify({ g, air, sources }), before);
  assert.ok(Object.isFrozen(result));
  assert.equal(transfer.reset().ready, false);
  assert.equal(transfer.state.targetId, null);
});

test('seeded skies in both initial wind directions yield finite live-target budgets without advancing weather', () => {
  for (const [seed, side] of [[1, -1], [2, 1]]) {
    const sky = createCloudbaseRun(); sky.reset(100, seed);
    const adapter = createRunCoachEnvironment(sky), g = createFlight({ x: shore(180, side, 55), y: 160, z: 180 });
    const air = sky.sample(g.pos, g.yaw, {}), before = JSON.stringify(sky.state);
    const result = createRidgeTransfer(adapter).step(STEP, facts(g, 0, air));
    assert.ok((result.targetId as number) > 0, `sky ${seed} has a live hunted transfer candidate`);
    assert.ok(Number.isFinite(result.requiredHeight) && result.requiredHeight! > 40);
    assert.ok(Number.isFinite(result.seconds) && result.seconds! > 0 && result.seconds! <= RIDGE_TRANSFER.maximumSeconds);
    assert.equal(JSON.stringify(sky.state), before);
  }
});
