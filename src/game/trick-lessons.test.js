import test from 'node:test';
import { WING } from './wing-envelope.js';
import assert from 'node:assert/strict';
import { createFlight, stepFlight } from './flight.js';
import { sampleAtmosphere } from './atmosphere.js';
import { createSwingWatch } from './swing-watch.js';
import { createStyle } from './meet-style.js';
import { createTrickLessons, TRICK_LESSONS } from './trick-lessons.js';
import { createFlightCoach } from './flight-coach.js';
import { clearStore, emptyStore, learnTrickLesson, normalizeStore, readStore, repeatTrickLessons, writeStore } from './good-lift-store.js';

const dt = 1 / 60;
const released = () => ({ left: false, right: false, brake: false, deepBrake: false, bar: false, ears: false });
function follow(message, input) {
  const next = { ...input };
  for (const key of message.release) next[key] = false;
  if (message.release.includes('brake')) next.deepBrake = false;
  for (const key of message.hold) next[key] = true;
  if (message.hold.includes('brake')) next.deepBrake = message.brakeDepth === 'deep';
  return next;
}

// Real wing + air + scoring, beginning with ten seconds of an ordinary working-brake circle.
// After that, every input change comes only from a visible instruction and its reaction delay.
for (const kind of ['pitch', 'wingover']) for (const side of [-1, 1]) for (const delay of [0, 0.1, 0.2, 0.3]) {
  test(`${kind} lesson from ordinary circle, side ${side}, ${delay}s reaction: physical completion and banked style`, () => {
    const g = createFlight({ x: -side * 21, y: 1000, z: 0 });
    const watch = createSwingWatch(), style = createStyle(), controls = {}, world = { g, watch, controls }, air = {};
    const learned = [], lessons = createTrickLessons({ learned: () => kind === 'pitch' ? [] : ['pitch'], onLearned: id => learned.push(id) });
    let input = { ...released(), left: side < 0, right: side > 0, brake: true }, pending = null;
    let began = null, height = 0, banked = null;
    const phases = new Set();
    for (let tick = 0; tick < 45 * 60; tick++) {
      if (pending && pending.at <= tick) { input = pending.input; pending = null; }
      sampleAtmosphere(g.pos, { windX: 0, windZ: 0, thermals: [{ x: 0, z: 0, r: 80, s: 5.5 }] }, air);
      Object.assign(controls, { turn: Number(input.right) - Number(input.left), brake: input.brake,
        deepBrake: input.deepBrake, bar: input.bar, ears: input.ears });
      stepFlight(g, controls, air, dt); watch.step(dt, g, false, controls); style.step(dt, world);
      assert.equal(g.stall, 0); assert.equal(watch.state.breaks, 0); assert.equal(g.loops, 0);
      if (tick < 600) continue;
      const message = lessons.step(dt, { g, watch: watch.state, style: style.state, input, air,
        clearance: g.pos.y, fogClearance: g.pos.y });
      if (lessons.state.active && began === null) {
        began = watch.state.clock; height = g.pos.y;
        assert.ok(Math.abs(g.bank) > 0.4, 'stable circling enters directly, without knowing a trick setup');
        assert.equal(message.action, 'release-all'); assert.match(message.detail, /spend height.*style.*final score/);
      }
      if (message) phases.add(message.phase);
      if (message && !pending) {
        const next = follow(message, input);
        if (JSON.stringify(next) !== JSON.stringify(input)) pending = { at: tick + Math.round(delay / dt) + 1, input: next };
      }
      if (lessons.state.phase === 'banked') { banked = message; break; }
    }
    assert.ok(banked, 'following the whole lesson completes and recovers within its timeout');
    assert.equal(watch.state.moves, 1); assert.equal(watch.state.moveKind, kind === 'pitch' ? 1 : 2);
    assert.equal(style.state.landed, 1); assert.equal(style.state.lost, 0); assert.equal(style.state.pending, 0);
    assert.ok(watch.state.calm >= 1); assert.ok(style.state.total > 0);
    assert.equal(lessons.state.awarded, style.state.said); assert.deepEqual(learned, [kind]);
    assert.match(banked.title, new RegExp(`\\+${style.state.said} STYLE`));
    assert.ok(phases.has('deep') && phases.has('recovery'));
    assert.ok(kind === 'pitch' ? phases.has('shape') && phases.has('catch') : phases.has('prepare') && phases.has('reverse'));
    assert.ok(g.pos.y < height, 'a completed trick spends real altitude');
    assert.ok(watch.state.clock - began < TRICK_LESSONS.timeout);
  });
}

function fixture(learned = []) {
  const done = [];
  const lessons = createTrickLessons({ learned: () => learned, onLearned: id => done.push(id) });
  const g = { pos: { x: 0, y: 800, z: 0 }, bank: 0.52, pitch: 0.05, pitchRate: 0, rollRate: 0, vy: 2,
    stall: 0, stallLoad: 0, tuck: 0, ears: 0, loop: 0, acro: false };
  const watch = { clock: 0, calm: 0, moves: 0, breaks: 0, topAt: -Infinity, frontAt: -Infinity, moveAt: -Infinity };
  const style = { landed: 0, lost: 0, total: 0, said: 0, elements: 0, bankedAt: -Infinity };
  const frame = { g, watch, style, input: { ...released(), right: true, brake: true },
    air: { windY: 5.5 }, clearance: 800, fogClearance: 800, lift: { action: 'right', state: 'lift' } };
  const step = (seconds = dt) => { let m; for (let tick = 0; tick < Math.round(seconds / dt); tick++) {
    watch.clock += dt; m = lessons.step(dt, frame);
  } return m; };
  return { lessons, done, frame, g, watch, style, step };
}

test('direct lesson setup waits for both hands up before requesting the deep pull', () => {
  const f = fixture();
  f.g.bank = 0; f.watch.calm = 2;
  f.frame.input = { controlMode: 'brakes', leftBrake: .06, rightBrake: 0 };
  f.step(1.5);
  assert.equal(f.lessons.state.active, 'pitch');
  assert.equal(f.lessons.state.phase, 'level');
  f.frame.input.leftBrake = 0; f.step(.15);
  assert.equal(f.lessons.state.phase, 'deep');
  const message = f.step();
  assert.match(message.title, /PULL BOTH BRAKES DEEP/);
  assert.doesNotMatch(message.detail, /Double-tap|hold X/);
});

test('current height, separate terrain/fog clearance, useful stable lift and warnings gate lesson entry', () => {
  for (const [learned, height, reserve] of [[[], 500, 200], [['pitch'], 750, 250]]) {
    for (const blocked of ['height', 'terrain', 'fog', 'hazard', 'warning', 'gust', 'unstable', 'sink']) {
      const f = fixture(learned); f.g.pos.y = height; f.frame.clearance = f.frame.fogClearance = reserve;
      if (blocked === 'height') f.g.pos.y -= 0.01;
      if (blocked === 'terrain') f.frame.clearance -= 0.01;
      if (blocked === 'fog') f.frame.fogClearance -= 0.01;
      if (blocked === 'hazard') f.frame.hazard = { detail: 'raven warning' };
      if (blocked === 'warning') f.frame.warning = { context: 'CLOUD ABOVE' };
      if (blocked === 'gust') f.frame.hazardActive = true;
      if (blocked === 'unstable') f.g.pitchRate = 0.5;
      if (blocked === 'sink') f.g.vy = -0.1;
      f.step(2); assert.equal(f.lessons.state.active, null, blocked);
    }
    const f = fixture(learned); f.g.pos.y = height; f.frame.clearance = f.frame.fogClearance = reserve;
    f.step(0.9); assert.equal(f.lessons.state.active, null);
    f.step(0.2); assert.equal(f.lessons.state.active, learned.length ? 'wingover' : 'pitch');
  }
});

test('hazards, reserve, ignored setup, cancellation and the attempt timeout abort without mutating held controls', () => {
  for (const learned of [[], ['pitch']]) for (const reason of ['hazard', 'clearance', 'fog', 'idle', 'cancel', 'timeout']) {
    const f = fixture(learned); f.step(1.1); const input = structuredClone(f.frame.input);
    const id = f.lessons.state.active;
    if (reason === 'hazard') f.frame.hazard = { state: 'hazard', title: 'KEEP CLEAR', detail: 'Birds above.' };
    if (reason === 'clearance') f.frame.clearance = TRICK_LESSONS[id].abort - 0.01;
    if (reason === 'fog') f.frame.fogClearance = TRICK_LESSONS[id].abort - 0.01;
    if (reason === 'cancel') assert.equal(f.lessons.cancel(), true);
    if (reason === 'timeout') f.watch.clock += 45;
    f.step(reason === 'idle' ? 8.1 : dt);
    assert.equal(f.lessons.state.active, null, reason); assert.deepEqual(f.frame.input, input);
    assert.equal(f.style.total, 0); assert.deepEqual(f.done, []);
    const retry = f.lessons.state.retryAt;
    f.frame.hazard = null; f.frame.clearance = f.frame.fogClearance = 800;
    while (f.watch.clock + dt < retry) f.step();
    assert.equal(f.lessons.state.active, null, '45 seconds of cooldown');
    f.step(0.1); assert.equal(f.lessons.state.active, id, 'renewed safe entry retries the same unfinished lesson');
  }
});

test('pitch queues before wingover; only a fresh matching move and its recovered style bank teach it', () => {
  const f = fixture(); f.watch.moves = 4; f.watch.moveAt = -10; f.watch.moveKind = 1;
  f.style.landed = 3; f.style.total = 60; f.step(1.1);
  assert.equal(f.lessons.state.active, 'pitch'); assert.deepEqual(f.done, []);
  f.watch.moves++; f.watch.moveAt = f.watch.clock + dt; f.watch.moveKind = 2; f.step();
  assert.deepEqual(f.done, [], 'a different fresh maneuver does not teach pitch');
  f.watch.moves++; f.watch.moveKind = 1; f.watch.moveAt = f.watch.clock + dt; f.style.elements = 1; f.step();
  assert.deepEqual(f.done, [], 'completion is still pending');
  f.style.landed++; f.style.elements = 0; f.style.total = 90; f.style.said = 30;
  f.style.bankedAt = f.watch.clock + dt; f.watch.calm = 1;
  assert.match(f.step().title, /\+30 STYLE · ×1.09/); assert.deepEqual(f.done, ['pitch']);
  f.step(3.1); assert.equal(f.lessons.state.active, 'wingover');
  const remembered = fixture(['wingover', 'pitch', 'pitch', 'unknown']); remembered.step(5);
  assert.equal(remembered.lessons.state.active, null); assert.deepEqual(remembered.lessons.state.learned, ['pitch', 'wingover']);
});

test('off policy suppresses deliberate maneuver teaching but keeps stall, collapse, surge, inversion and low-clearance recovery', () => {
  for (const danger of ['stall', 'collapse', 'surge', 'inversion', 'clearance', 'ears']) {
    const f = fixture(); const coach = createFlightCoach();
    if (danger === 'stall') Object.assign(f.g,{stall:1,wingPhase:WING.stalled});
    if (danger === 'collapse') Object.assign(f.g,{tuck:.8,wingPhase:WING.frontal});
    if (danger === 'inversion') f.g.loop = 1;
    if (danger === 'surge') { f.g.pitch = -1; f.g.pitchRate = -0.8; }
    if (danger === 'clearance') { f.g.acro = true; f.frame.clearance = 60; }
    if (danger === 'ears') f.g.ears = 0.5;
    assert.equal(coach.step(dt, { ...f.frame, maneuverPolicy: 'off' }).state, 'recover');
  }
  const f = fixture(), coach = createFlightCoach(); f.g.acro = true; f.frame.input.deepBrake = true;
  f.watch.front = 0.6; f.watch.building = 2;
  for (let i = 0; i < 6; i++) {
    f.watch.clock += dt; f.watch.frontAt = f.watch.clock;
    assert.equal(coach.step(dt, { ...f.frame, maneuverPolicy: 'off', lift: null }), null);
  }
});

test('learning normalizes, persists immediately, survives blocked storage and repeats without resetting scores', () => {
  const items = new Map(), storage = { getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) };
  clearStore(storage);
  writeStore({ ...emptyStore(), best: { total: 100, score: 100, peak: 800 }, runs: 8, tonnage: 500 }, storage);
  assert.equal(learnTrickLesson('pitch', storage), true); assert.equal(learnTrickLesson('pitch', storage), false);
  assert.deepEqual(readStore(storage).learnedLessons, ['pitch']);
  assert.deepEqual(normalizeStore({ learnedLessons: ['wingover', 'oops', 'pitch', 'wingover', 4] }).learnedLessons, ['pitch', 'wingover']);
  const before = readStore(storage); repeatTrickLessons(storage);
  assert.deepEqual(readStore(storage), { ...before, learnedLessons: [] });
  const blocked = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } };
  assert.equal(learnTrickLesson('wingover', blocked), true); assert.deepEqual(readStore(blocked).learnedLessons, ['wingover']);
  repeatTrickLessons(blocked); assert.deepEqual(readStore(blocked).learnedLessons, []);
  learnTrickLesson('pitch', blocked); clearStore(blocked); assert.deepEqual(readStore(blocked), emptyStore());
});
