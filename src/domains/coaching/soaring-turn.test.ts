import type { AirSample, FlightInput, Vector3, FlightState } from '../flight/models.ts';
import type { CoachingAdapter } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlight, stepFlight, PHYSICS } from '../flight/flight.ts';
import { createSoaringTurn, SOARING_TURN } from './soaring-turn.ts';
import { createLiftActivity } from './lift-activity.ts';
import { createLiftGuide } from './lift-guide.ts';
import { sampleAtmosphere } from '../flight/atmosphere.ts';
import { shore, surfaceAt } from '../flight/ground.ts';

const STEP = 1 / 60;
function ordinary(g: FlightState) {
  assert.equal(g.deepBrake, false, 'a soaring return never requests a deep pull');
  assert.equal(g.acro, false, 'ordinary turn-and-brake holds stay outside acro');
  assert.ok(g.brakeTarget <= PHYSICS.brake, 'the held brake stays within working depth');
}
function field(overrides: Partial<CoachingAdapter> = {}): CoachingAdapter {
  return { heightAt: () => 0, sampleAir: (_pos, out) => Object.assign(out,
    { windX: 0, windY: 3.5, windZ: 0, ridge: 0, thermal: 3.5, lee: 0 }), ...overrides };
}
function flying(adapter: CoachingAdapter) {
  const g = createFlight({ x: 0, y: 2000, z: 0 }), air: AirSample = {};
  for (let n = 0; n < 300; n++) { adapter.sampleAir(g.pos, air); stepFlight(g, {}, air, STEP); ordinary(g); }
  return { g, air };
}
const controls = (dir: number): FlightInput => ({ turn: dir, brake: true, bar: false, ears: false });
const raw = (dir: number): FlightInput => ({ left: dir < 0, right: dir > 0, brake: true });
const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

test('direct gentle turns forecast the held brake pair and release both to level', () => {
  for (const dir of [-1, 1]) {
    const adapter = field(), { g, air } = flying(adapter), turn = createSoaringTurn(adapter);
    const input = Object.freeze({ controlMode: 'brakes', leftBrake: dir < 0 ? .30 : 0, rightBrake: dir > 0 ? .30 : 0 });
    const before = structuredClone(g);
    const result = turn.step(STEP, { g, air, input, clock: 0, activity: 'navigating' });
    assert.equal(result.supported, true);
    assert.equal(result.forecast!.safe, true);
    assert.equal(result.message!.accepted, true);
    assert.deepEqual(g, before, 'forecast does not fly the real wing');
    for (let tick = 1; tick < 240; tick++) {
      stepFlight(g, input, air, STEP);
      turn.step(STEP, { g, air, input, clock: tick * STEP, activity: 'navigating' });
    }
    const neutral: FlightInput = { controlMode: 'brakes', leftBrake: 0, rightBrake: 0 };
    const release = turn.step(STEP, { g, air, input: neutral, clock: 4, activity: 'navigating' });
    assert.equal(release.phase, 'rollout');
    assert.match(release.message!.title, /HANDS UP/);
    assert.equal(release.message!.accepted, true);
  }
});

// Establish the actual wing along a real cliff before asking for its return. No position,
// velocity or weather diagnostic is changed after launch; the same sampler feeds the forecast.
function ridgeFlight(side: number, speed: number) {
  const weather = { windX: side * speed, windZ: 0, thermals: [] };
  const adapter: CoachingAdapter = { heightAt: surfaceAt, sources: () => [],
    inside: (p: { x: number; z: number; }) => Math.abs(p.x) < 380 && p.z > -385 && p.z < 385,
    sampleAir: (p: Vector3, out: {}|undefined) => sampleAtmosphere(p, weather, out) };
  const guide = createLiftGuide(adapter);
  const g = createFlight({ x: shore(240, side, 60), y: 100, z: 240 }), air: AirSample = {};
  let clock = 0;
  for (let tick = 0; tick < 300; tick++) {
    adapter.sampleAir(g.pos, air);
    const z = g.pos.z - 50, x = shore(z, side, 60), distance = Math.hypot(x - g.pos.x, z - g.pos.z);
    const wanted = Math.atan2((x - g.pos.x) / distance * 11.5 - air.windX!,
      -((z - g.pos.z) / distance * 11.5 - air.windZ!));
    const error = wrap(wanted - g.yaw) - g.yawRate * 0.8;
    const turn = Math.abs(error) < 0.3 ? 0 : Math.sign(error);
    stepFlight(g, { turn }, air, STEP); clock += STEP;
    ordinary(g);
    guide.step(STEP, { g, air, input: { left: turn < 0, right: turn > 0 }, clock });
  }
  assert.equal(guide.activity.activity, 'ridge');
  return { g, air, adapter, guide, weather, clock };
}

test('manual brake turns get reactive advice anywhere sustained rising air supports the full arc', () => {
  for (const dir of [-1, 1]) {
    const adapter = field(), { g, air } = flying(adapter), before = structuredClone(g);
    const turn = createSoaringTurn(adapter);
    const result = turn.step(STEP, { g, air, input: raw(dir), clock: 0, activity: 'navigating' });
    assert.equal(result.supported, true); assert.equal(result.forecast!.safe, true);
    assert.equal(result.message!.activity, 'soaring-turn');
    assert.equal(result.message!.brakeDepth, 'working');
    assert.deepEqual(result.message!.hold, [dir < 0 ? 'left' : 'right', 'brake']);
    assert.deepEqual(g, before, 'forecasting never presses controls or changes the real wing');
    let lowest = g.pos.y, start = g.pos.y;
    for (let n = 1; n <= 420; n++) {
      adapter.sampleAir(g.pos, air); stepFlight(g, controls(dir), air, STEP);
      ordinary(g);
      turn.step(STEP, { g, air, input: raw(dir), clock: n * STEP, activity: 'navigating' });
      lowest = Math.min(lowest, g.pos.y);
      assert.equal(g.stall, 0); assert.equal(g.loops, 0);
    }
    assert.ok(g.pos.y > start && lowest >= start - 1, 'actual sustained air supports the turn, without bonus lift');
    const release = turn.step(STEP, { g, air, input: {}, clock: 421 * STEP });
    assert.equal(release.phase, 'rollout'); assert.deepEqual(release.message!.hold, []);
    assert.equal(release.message!.brakeDepth, 'working');
    assert.ok(release.message!.release.includes('brake'), 'silence/release never starts another turn');
  }
});

test('horizontal wind, weak air and ordinary steering do not open turn coaching', () => {
  const adapter = field(), { g, air } = flying(adapter);
  const turn = createSoaringTurn(adapter);
  assert.equal(turn.step(STEP, { g, air, input: { right: true }, clock: 0 }).message, null);
  assert.equal(turn.step(STEP, { g, air: { windX: 15, windY: 0.7 }, input: raw(1), clock: STEP }).message, null);
  assert.equal(turn.step(STEP, { g, air, input: { left: true, right: true, brake: true }, clock: 2 * STEP }).message, null);
});

test('deep intent or an active acro configuration immediately withdraw ordinary soaring advice', () => {
  let queries = 0;
  const adapter = field({ sampleAir: (_pos, out) => {
    queries++;
    return Object.assign(out, { windX: 0, windY: 3.5, windZ: 0, ridge: 0, thermal: 3.5, lee: 0 });
  } });
  const { g, air } = flying(adapter);
  for (const blocked of [
    { g, input: { ...raw(1), deepBrake: true } },
    { g: { ...g, deepBrake: true }, input: raw(1) },
    { g: { ...g, acro: true }, input: raw(1) },
  ]) {
    const turn = createSoaringTurn(adapter);
    assert.equal(turn.step(STEP, { g, air, input: raw(1), clock: 0 }).supported, true);
    const before = structuredClone(blocked.g), count = queries;
    const state = turn.step(STEP, { ...blocked, air, clock: STEP });
    assert.equal(state.active, false); assert.equal(state.supported, false); assert.equal(state.message, null);
    assert.equal(queries, count, 'deep or acro state cannot receive a normal-brake forecast');
    assert.deepEqual(blocked.g, before, 'suppressing advice never changes the real wing');
  }
});

test('a supported arc offers its forecast release before any ridge or thermal activity is established', () => {
  for (const dir of [-1, 1]) {
    const adapter = field(), { g, air } = flying(adapter), turn = createSoaringTurn(adapter);
    let message = null;
    for (let tick = 0; tick < 900; tick++) {
      adapter.sampleAir(g.pos, air); stepFlight(g, controls(dir), air, STEP);
      ordinary(g);
      message = turn.step(STEP, { g, air, input: raw(dir), clock: tick * STEP, activity: 'navigating' }).message;
      if (message?.phase === 'level') break;
    }
    assert.equal(message?.phase, 'level', 'the forecast and offered controls finish the same full arc');
    assert.deepEqual(message.hold, []);
    assert.ok(message.release.includes('brake') && message.release.includes(dir < 0 ? 'left' : 'right'));
  }
});

test('a turn path checks terrain, wing span, clouds, fog and arena margins before giving advice', () => {
  for (const constraint of [
    { heightAt: (x: number, z: number) => x > 15 && z < -3 ? 2500 : 0 },
    { heightAt: (x: number): number => x > 5 && x < 8 ? 2500 : 0 },
    { inside: (p: { x: number; }) => p.x < 15 },
    { cloudDepth: (p: { x: number; }) => p.x > 15 ? 1 : 0 },
    { fog: () => ({ height: 1990, elapsed: 0, speedAt: () => 20 }) },
  ]) {
    const clear = field(), { g, air } = flying(clear), adapter = field(constraint), turn = createSoaringTurn(adapter);
    assert.equal(turn.step(STEP, { g, air, input: raw(1), clock: 0 }).message, null);
  }
  const adapter = field({ sampleAir: (p: { x: number; z: number; }, out) => Object.assign(out,
    { windX: 0, windY: Math.hypot(p.x, p.z) < 8 ? 3.5 : 0, windZ: 0 }) });
  const { g, air } = flying(field()); g.pos.x = 0; g.pos.z = 0;
  assert.equal(createSoaringTurn(adapter).step(STEP, { g, air, input: raw(1), clock: 0 }).message, null,
    'rising air at the current point alone cannot promise a supported return');
});

test('active ridge turns retain their header across the tangent while losing actual lift still exits', () => {
  const adapter = field({ heightAt: (x: number): number => 0.3 * x, sources: () => [] });
  const observer = createLiftActivity(adapter);
  const g = { pos: { x: -45, y: 150, z: 0 }, vy: 1, bank: 0,
    pilot: { vel: { x: 0, z: -10 } } };
  const air = { ridge: 3, thermal: 0, lee: 0, windY: 3, ambientX: 3.5, ambientZ: 0 };
  for (let n = 0; n < 100; n++) observer.step(STEP, { g, air, clock: n * STEP });
  assert.equal(observer.state.activity, 'ridge');
  g.pilot.vel.x = -10; g.pilot.vel.z = 0;
  for (let n = 100; n < 500; n++) observer.step(STEP, { g, air, clock: n * STEP, turnSupported: true });
  assert.equal(observer.state.activity, 'ridge', 'the actual supported turn is not a ridge departure');
  for (let n = 500; n < 650; n++) observer.step(STEP, { g, air: { ...air, ridge: 0, windY: 0 },
    clock: n * STEP, turnSupported: true });
  assert.equal(observer.state.activity, 'navigating', 'a turn hint cannot keep a false lift mode alive');
});

test('paused reads and intervening ticks do not repeat the full-arc forecast; recovery resets intent', () => {
  let samples = 0;
  const base = field(), adapter = { ...base, sampleAir(p: Vector3, out: AirSample) { samples++; return base.sampleAir(p, out); } };
  const { g, air } = flying(base), turn = createSoaringTurn(adapter), input = raw(1);
  const result = turn.step(STEP, { g, air, input, clock: 0 });
  const count = samples;
  assert.ok(count > 100);
  for (let n = 1; n < 15; n++) turn.step(STEP, { g, air, input, clock: n * STEP });
  assert.equal(samples, count, 'heavy forecasts run at quarter-second cadence');
  const stable = turn.state;
  for (let n = 0; n < 20; n++) assert.equal(turn.step(0, { g, air, input, clock: 1 }), stable);
  turn.step(STEP, { g, air, input, clock: 0.25, suspended: true });
  assert.equal(turn.state.active, false); assert.equal(turn.state.message, null);
  assert.equal(result.supported, true, 'old immutable snapshots do not change');
});

test('real ridge returns follow delayed semantic cues safely on both cliffs without flipping the ridge header', () => {
  for (const side of [-1, 1]) for (const speed of [3, 3.5]) {
    const flight = ridgeFlight(side, speed), { g, air, adapter, guide } = flight;
    const input: FlightInput = { ...raw(-side), bar: false, ears: false };
    const startHeight = g.pos.y;
    let clock = flight.clock, previous = g.track, heading = 0, pending = null, applyAt = -1;
    let levelAt = -1, lowest = startHeight, clearance = Infinity, supportedSteps = 0;
    for (let tick = 0; tick < 1200; tick++) {
      if (pending && tick >= applyAt) {
        for (const name of pending.release) input[name] = false;
        for (const name of pending.hold) input[name] = true;
        pending = null;
      }
      adapter.sampleAir(g.pos, air);
      stepFlight(g, { turn: Number(input.right) - Number(input.left), brake: input.brake,
        bar: input.bar, ears: input.ears }, air, STEP);
      ordinary(g);
      clock += STEP; heading += wrap(g.track - previous); previous = g.track;
      const message = guide.step(STEP, { g, air, input, clock });
      if (guide.turn.supported) {
        supportedSteps++;
        assert.equal(guide.activity.activity, 'ridge', 'a supported return stays in its established ridge activity');
      }
      if (message?.context === 'soaring turn' && message.phase === 'level' && levelAt < 0) levelAt = tick;
      if (!pending && message && (message.hold.some((name) => !input[name]) || message.release.some((name) => input[name]))) {
        pending = message; applyAt = tick + 13; // 0.2s response plus the next fixed step
      }
      lowest = Math.min(lowest, g.pos.y);
      clearance = Math.min(clearance, g.pos.y - surfaceAt(g.pos.x, g.pos.z));
      assert.equal(g.stall, 0); assert.equal(g.loops, 0);
      if (levelAt >= 0 && tick > levelAt + 180) break;
    }
    assert.ok(supportedSteps > 180 && levelAt > 0, 'the actual full arc receives a release-to-level cue');
    assert.ok(lowest >= startHeight - 2 && g.pos.y > startHeight, 'rising air supports the real turn and rollout');
    assert.ok(clearance >= 30, `the complete return keeps terrain clearance: ${clearance}m`);
    assert.ok(Math.abs(heading) > 150 * Math.PI / 180 && Math.abs(heading) < 210 * Math.PI / 180,
      'the delayed controls produce a return along the opposite direction');
  }
});

test('a real ridge wind reversal or loss withdraws the cached support promise while the chord is still held', () => {
  for (const side of [-1, 1]) for (const change of [0, -1]) {
    const flight = ridgeFlight(side, 3.5), { g, air, adapter, guide, weather } = flight;
    const input = raw(-side);
    let clock = flight.clock;
    for (let tick = 0; tick < 120; tick++) {
      adapter.sampleAir(g.pos, air);
      stepFlight(g, { turn: -side, brake: true }, air, STEP); clock += STEP;
      ordinary(g);
      guide.step(STEP, { g, air, input, clock });
    }
    assert.equal(guide.turn.supported, true);
    weather.windX *= change;
    let withdrawnAt = -1;
    for (let tick = 0; tick < 120; tick++) {
      adapter.sampleAir(g.pos, air);
      const held = withdrawnAt < 0 || tick < withdrawnAt + 13;
      stepFlight(g, { turn: held ? -side : 0, brake: held }, air, STEP); clock += STEP;
      ordinary(g);
      guide.step(STEP, { g, air, input: held ? input : {}, clock });
      if (!guide.turn.supported && withdrawnAt < 0) withdrawnAt = tick;
    }
    assert.ok(withdrawnAt >= 0 && withdrawnAt * STEP <= SOARING_TURN.searchEvery + 2 * STEP,
      'the bounded forecast cadence must not retain a promise after the actual wind changes');
    assert.equal(guide.turn.supported, false);
    assert.equal(guide.turn.message, null);
    assert.equal(guide.activity.activity, 'navigating', 'a forecast cannot preserve a false ridge classification');
  }
});
