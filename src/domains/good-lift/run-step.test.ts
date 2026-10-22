import type { RunWorld, MeetSystem } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { RUN, TRACE, createRunWorld, finishRun, startRun, stepBits, stepRun } from './run-step.ts';
import { TST, createReferencePilot } from './pilots.ts';
import { CLOUD_GATE, CLOUD_STRIKE, CLOUD_ZONE, createCloudbaseRun } from './cloudbase-state.ts';
import { createMeet, MEET } from './meet-state.ts';
import { createBells } from './bells.ts';
import { copyFlight, createFlight, settleFlight } from '../flight/flight.ts';
import { surfaceAt } from '../flight/ground.ts';
import { createStyle, STYLE } from './meet-style.ts';

const fresh = (seed = 1, meet: MeetSystem | null = createMeet()) => startRun(createRunWorld({ sky: createCloudbaseRun(), meet, bells: createBells() }), seed);
const snapshot = (w: RunWorld) => structuredClone({ pilot: w.g.pilot, canopy: w.g.canopy, steps: w.steps, ended: w.ended, sky: w.sky.state, meet: w.meet?.state, bells: w.bells?.state, trace: w.trace });
function fly(w: RunWorld, count = 2000) {
  const pilot = createReferencePilot(TST), input = {};
  for (let i = 0; i < count; i++) {
    const ending = stepRun(w, pilot.decide(w, input));
    if (ending) return ending;
  }
  return null;
}
function park<T extends RunWorld>(w: T, x: number = CLOUD_ZONE.x, y = 1500, z: number = CLOUD_ZONE.z): T {
  Object.assign(w.g.pos, { x, y, z });
  settleFlight(w.g);
  w.sky.state.peak = y;
  w.sky.state.elapsed = RUN.grace + 1;
  return w;
}

test('every run begins in a settled canonical pose at the gate', () => {
  const w = fresh();
  assert.deepEqual(w.g.pos, { x: CLOUD_GATE.x, y: CLOUD_GATE.y, z: CLOUD_GATE.z });
  assert.equal(w.g.pos, w.g.pilot.pos);
  assert.ok(Math.abs(w.g.yaw - CLOUD_GATE.yaw) < 1e-10);
  assert.ok(w.g.canopy.pos.y > w.g.pilot.pos.y + 5);
  assert.equal(w.steps, 0);
  assert.equal(w.ended, '');
  assert.equal(w.trace.n, 1);
  assert.equal(w.trace.alt[0], CLOUD_GATE.y);
});

test('the same seed and pilot reproduce the same run after a used world is reset', () => {
  const reference = fresh(2);
  fly(reference);
  const used = fresh(7);
  fly(used, 2700);
  finishRun(used, 'quit');
  startRun(used, 2);
  fly(used);
  assert.deepEqual(snapshot(used), snapshot(reference));
});

test('a passive meet never changes the canonical wing or sky', () => {
  const met = fresh(3), bare = fresh(3, null);
  fly(met, 2400);
  fly(bare, 2400);
  assert.deepEqual(met.g.pilot, bare.g.pilot);
  assert.deepEqual(met.g.canopy, bare.g.canopy);
  assert.deepEqual(met.sky.state, bare.sky.state);
});

test('all five-bit controls use the same fixed step, including the bar shortcut and explicit ears', () => {
  for (let bits = 0; bits < 32; bits++) {
    const logged = fresh(4), direct = fresh(4);
    const both = (bits & 3) === 3, ears = (bits & 12) === 12;
    const deepBrake = !ears && !!(bits & 16);
    const brake = !ears && (!!(bits & 4) || deepBrake);
    const input = { turn: both ? 0 : (bits & 2 ? 1 : 0) - (bits & 1 ? 1 : 0), ears,
      brake, deepBrake, bar: !ears && !brake && (both || !!(bits & 8)) };
    assert.equal(stepBits(logged, bits), stepRun(direct, input));
    assert.deepEqual(logged.controls, direct.controls);
    assert.deepEqual(logged.g.pilot, direct.g.pilot);
    assert.deepEqual(logged.g.canopy, direct.g.canopy);
  }
});

test('the two-arrow chord under brake preserves the same coordinated rollout and flight', () => {
  const brake = park(fresh(4)), chord = park(fresh(4)), direct = park(fresh(4));
  for (const world of [brake, chord, direct]) world.sky.sample = (pos, yaw, out) => Object.assign(out!,
    { windX: 0, windY: 2, windZ: 0, hazardSink: 0, lift: 2, sink: 0, liftSide: 0, rough: 0 });
  for (let n = 0; n < 180; n++) for (const world of [brake, chord, direct]) stepBits(world, 6);
  assert.ok(brake.g.coordination > 0.5 && brake.g.bank > 0.2, 'the comparison begins in a real coordinated turn');
  for (let n = 0; n < 300; n++) {
    assert.equal(stepBits(brake, 4), stepBits(chord, 7));
    stepRun(direct, { turn: 0, brake: true, bar: true, ears: false });
    assert.equal(chord.intent.bar, false, 'the decoded chord does not retain an ineffective bar');
    assert.equal(direct.controls.bar, false, 'direct analog callers use the same effective controls');
    assert.deepEqual(chord.g, brake.g, `the decoded chord preserves physical state on step ${n}`);
    assert.deepEqual(direct.g, brake.g, `direct intent preserves physical state on step ${n}`);
    assert.deepEqual(chord.watch.state, brake.watch.state);
    assert.deepEqual(chord.meet!.state, brake.meet!.state);
  }
  assert.deepEqual(snapshot(chord), snapshot(brake));
  assert.deepEqual(snapshot(direct), snapshot(brake));
});

test('windY is forwarded once and collapse sink remains separate from diagnostic lift/sink', () => {
  const w = park(fresh());
  w.sky.sample = (pos, yaw, out) => Object.assign(out!, { windX: 1, windY: 2, windZ: -1, hazardSink: 4, lift: 2, sink: 9, liftSide: 0, rough: 0 });
  stepBits(w, 0);
  assert.equal(w.air.windY, 2);
  assert.equal(w.air.hazardSink, 4);
  assert.equal(w.g.physical.windY, -2, 'diagnostic sink is not charged a second time');
});

test('ridge diagnostics reach presentation and reset without becoming extra forces', () => {
  const w = park(fresh());
  w.sky.sample = (pos, yaw, out) => Object.assign(out!, { windX: 2, windY: 1.5, windZ: -1, hazardSink: 0,
    lift: 1.5, sink: 0, liftSide: 0, rough: 0, ridge: 2, lee: 0.5, thermal: 0, crestHeight: 120, ambientX: 3, ambientZ: -1 });
  stepBits(w, 0);
  assert.deepEqual([w.air.ridge, w.air.lee, w.air.thermal, w.air.crestHeight, w.air.ambientX, w.air.ambientZ], [2, 0.5, 0, 120, 3, -1]);
  assert.equal(w.g.physical.windY, 1.5, 'the already combined vertical air is the only environmental force');
  startRun(w, 7);
  assert.deepEqual([w.air.ridge, w.air.lee, w.air.thermal, w.air.crestHeight, w.air.ambientX, w.air.ambientZ], [0, 0, 0, 0, 0, 0]);
});

test('a boundary recovery is marked as assisted steering for the maneuver observer', () => {
  const w = park(fresh(), CLOUD_ZONE.x + CLOUD_ZONE.r + 20);
  stepBits(w, 0);
  assert.equal(w.controls.steered, true);
});

test('a landed step ends before advancing the sky, and repeated calls never fly on', () => {
  const w = fresh();
  w.g.pos.y = surfaceAt(w.g.pos.x, w.g.pos.z) + 0.1;
  settleFlight(w.g);
  const before = w.sky.state.elapsed;
  assert.equal(stepBits(w, 0), 'landed');
  assert.equal(w.sky.state.elapsed, before);
  const pose = structuredClone(w.g.pilot);
  assert.equal(stepBits(w, 1), 'landed');
  assert.deepEqual(w.g.pilot, pose);
});

test('a folded wing can be pumped open with deliberate holds and releases, twice at most', () => {
  const w = park(fresh());
  w.sky.state.pilot.collapse = CLOUD_STRIKE.collapse;
  for (let n = 0; n < 2; n++) {
    for (let i = 0; i < Math.ceil(CLOUD_STRIKE.pump.hold / RUN.step); i++) stepBits(w, 4);
    stepBits(w, 0);
  }
  assert.equal(w.pump.n, 2);
  assert.ok(w.sky.state.pilot.collapse < CLOUD_STRIKE.collapse - 2 * CLOUD_STRIKE.pump.cut);
  const n = w.pump.n;
  stepBits(w, 4);
  stepBits(w, 0);
  assert.equal(w.pump.n, n, 'short taps earn no extra pump');
});

test('traces sample once per second and are cleared when a new run starts', () => {
  const w = fresh();
  fly(w, 1200);
  assert.equal(w.trace.n, 21);
  assert.equal(w.trace.alt.length, TRACE.length);
  assert.equal(w.trace.alt[20], Math.fround(w.g.pos.y));
  startRun(w, 9);
  assert.equal(w.trace.n, 1);
  for (const a of [w.trace.alt, w.trace.fog, w.trace.total]) assert.ok(a.subarray(1).every((value: number) => value === 0));
});

test('natural and timed endings judge the bar once; quitting forfeits carried weight', () => {
  for (const reason of ['fog', 'landed', 'time', 'quit']) {
    const w = fresh();
    w.meet!.state.bar = 15;
    finishRun(w, reason);
    const judged = reason !== 'quit';
    assert.equal(w.meet!.state.total, judged ? MEET.bar + 15 : 0);
    assert.equal(w.meet!.state.count, judged ? 1 : 0);
    assert.equal(w.sky.state.active, false);
    const kept = structuredClone(w.meet!.state);
    finishRun(w, reason === 'quit' ? 'fog' : 'quit');
    assert.deepEqual(w.meet!.state, kept);
  }
});

test('prediction copies cannot alias or mutate a live wing', () => {
  const w = park(fresh());
  const clone = copyFlight(createFlight(), w.g);
  const before = structuredClone(w.g);
  clone.pilot.pos.x += 20;
  clone.canopy.vel.z -= 10;
  clone.physical.steer = 1;
  assert.deepEqual(w.g, before);
});


test('deep brake aliases replay identically and stay distinct from working brake', () => {
  const canonical = park(fresh(4)), alias = park(fresh(4)), working = park(fresh(4));
  for (let tick = 0; tick < 120; tick++) {
    stepBits(canonical, 20); stepBits(alias, 16); stepBits(working, 4);
    assert.deepEqual(alias.g, canonical.g);
    assert.deepEqual(alias.watch.state, canonical.watch.state);
  }
  assert.equal(canonical.controls.deepBrake, true);
  assert.equal(working.controls.deepBrake, false);
  assert.notDeepEqual(canonical.g.pilot, working.g.pilot);
  startRun(canonical, 4);
  assert.equal(canonical.controls.deepBrake, false);
  assert.equal(canonical.intent.deepBrake, false);
});


test('ears suppress both brake depths in direct fold pumps exactly as recorded controls do', () => {
  const direct = park(fresh(4)), recorded = park(fresh(4));
  direct.sky.state.pilot.collapse = recorded.sky.state.pilot.collapse = CLOUD_STRIKE.collapse;
  const count = Math.ceil(CLOUD_STRIKE.pump.hold / RUN.step) + 2;
  for (let tick = 0; tick < count; tick++) {
    stepRun(direct, { turn: 0, ears: true, brake: true, deepBrake: true });
    stepBits(recorded, 28);
    assert.deepEqual(direct.pump, recorded.pump);
    assert.deepEqual(direct.g, recorded.g);
  }
  assert.equal(direct.pump.held, 0);
  assert.equal(direct.pump.n, 0);
  stepRun(direct, {}); stepBits(recorded, 0);
  assert.deepEqual(direct.pump, recorded.pump);
  assert.deepEqual(direct.g, recorded.g);
});

for (const source of ['sky', 'bell'] as const) test(`a ${source} strike on the banking frame interrupts style before banking, once`, () => {
  const w = park(fresh());
  w.style = createStyle();
  // Seed an observer receipt only; the subject here is hazard/observer/scoring order. Actual
  // physical maneuvers and three-second recoveries are covered by direct-acro.test.ts.
  Object.assign(w.watch.state, { moves: 1, moveKind: 4, moveBand: 0, moveSize: Math.PI * 2 });
  w.style.step(RUN.step, w);
  assert.equal(w.style.state.pending, STYLE.spiral);
  w.watch.state.clock = STYLE.settle - RUN.step;
  w.watch.state.calm = STYLE.settle - RUN.step;
  w.sky.state.pilot.shield = 0;
  w.sky.sample = (_pos, _yaw, out) => Object.assign(out!, { windX: 0, windY: 0, windZ: 0, lift: 0, sink: 0, hazardSink: 0, rough: 0 });
  const stepSky = w.sky.step;
  let struck = false;
  const strike = () => { if (!struck) { assert.equal(w.sky.strike(-1), true); struck = true; } };
  if (source === 'sky') w.sky.step = (...args) => { const ended = stepSky(...args); strike(); return ended; };
  else w.bells!.step = () => strike();
  const before = w.watch.state.clock;
  stepBits(w, 0);
  assert.equal(w.watch.state.clock, before + RUN.step, 'the watch advances once');
  assert.equal(w.watch.state.broke, 4);
  assert.equal(w.watch.state.breaks, 1);
  assert.equal(w.watch.state.calm, 0);
  assert.equal(w.style.state.total, 0);
  assert.equal(w.style.state.landed, 0);
  assert.equal(w.style.state.pending, 0);
  assert.equal(w.style.state.lost, 1);
  for (let tick = 0; tick < 30; tick++) stepBits(w, 0);
  assert.equal(w.watch.state.breaks, 1, 'the later collapsed observations do not count the strike twice');
  assert.equal(w.style.state.lost, 1);
  assert.equal(w.style.state.total, 0);
});

test('a same-step strike consumes a newly completed move without scoring or resurrecting it', () => {
  const w = park(fresh()); w.style = createStyle();
  w.sky.state.pilot.shield = 0;
  const stepWatch = w.watch.step;
  w.watch.step = (...args) => {
    stepWatch(...args);
    Object.assign(w.watch.state, { moves: w.watch.state.moves + 1, moveKind: 4, moveBand: 0, moveSize: Math.PI * 2 });
  };
  w.bells!.step = () => { w.sky.strike(-1); };
  stepBits(w, 0);
  assert.equal(w.style.state.total, 0);
  assert.equal(w.style.state.pending, 0);
  assert.equal(w.style.state.armed, false);
  w.watch.step = stepWatch;
  w.sky.state.pilot.collapse = 0;
  w.bells!.step = () => {};
  for (let tick = 0; tick < 240; tick++) stepBits(w, 0);
  assert.equal(w.style.state.total, 0);
  assert.equal(w.style.state.pending, 0, 'the already consumed move cannot reappear after rearming');
});
