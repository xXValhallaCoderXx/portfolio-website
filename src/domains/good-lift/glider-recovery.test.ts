import test from 'node:test';
import assert from 'node:assert/strict';
import type { FlightInput, FlightState } from '../flight/models.ts';
import { PHYSICS, createFlight, induceFailure, physicsEnergy, stepFlight } from '../flight/flight.ts';
import { GLIDERS, GLIDER_TABLES } from './gliders.ts';
import { LAB_STEP, pair } from '../../test/helpers/flight-lab.ts';
import { flyFailure, guided } from '../../test/helpers/test-failures.ts';

// The hands a device gives (brake-input.js), as physical travel: a recovery that asks for one of them
// must be met or missed by a clear margin, never by a byte's rounding.
const MARKS = [0.2, 0.3, 0.5, 0.6, 0.65, 0.82, 1].map(mark => mark * PHYSICS.deepBrake);

test('no glider\'s recovery threshold sits on a device brake mark, nor its open half\'s latch at any usual fold', () => {
  for (const id of GLIDERS) {
    const { recovery: R, flow } = GLIDER_TABLES[id].feel!;
    const thresholds = { pumpFrom: R!.pumpFrom, pumpFull: R!.pumpFull, cravatDepth: R!.cravatDepth, deepHand: R!.deepHand,
      ...Object.fromEntries([0.3, 0.5, 0.7].map(fold => [`latch beside a ${fold} fold`, flow!.latch - R!.loadLatch * fold])) };
    for (const [name, value] of Object.entries(thresholds)) for (const mark of MARKS)
      assert.ok(Math.abs(value - mark) >= 0.01, `${id} ${name} ${value} is ${Math.abs(value - mark).toFixed(3)} from the mark ${mark}`);
  }
});

// A half collapse, as certification tests one: half the half folded, the pilot's hands off.
test('a half collapse left alone is answered as each class is certified', () => {
  for (const side of [-1, 1]) {
    const flown = Object.fromEntries(GLIDERS.map(id => [id, flyFailure(id, 'asym', { side, size: 0.5, seconds: 40 })]));
    for (const id of GLIDERS) assert.deepEqual(flown[id].seen, ['asym'], `${id} goes into nothing else`);
    assert.ok(flown['en-a'].seconds < 1.5 && flown['en-a'].turned < 90, `the A refills before it has turned a quarter: ${JSON.stringify(flown['en-a'])}`);
    assert.ok(flown['en-b'].seconds < 3 && flown['en-b'].turned < 180, `the B before half: ${flown['en-b'].seconds} s, ${flown['en-b'].turned}°`);
    assert.ok(flown['en-c'].turned >= 180 && flown['en-c'].turned <= 360, `the C turns a half to a whole turn: ${flown['en-c'].turned}°`);
    for (const id of ['en-d', 'acro']) {
      assert.ok(flown[id].turned > 360, `the ${id} keeps turning: ${flown[id].turned}°`);
      const g = createFlight({ x: 0, y: 3000, z: 0 }, id);
      induceFailure(g, 'asym', side, 0.5);
      for (let i = 0; i < 15 * 60; i++) stepFlight(g, pair(0), {}, LAB_STEP);
      assert.ok((side < 0 ? g.foldLeft : g.foldRight) > 0, `the ${id} has not refilled by itself in 15 s`);
    }
  }
});

test('flown with the fix, any collapse is out within seconds on every glider at a human reaction: the turn stopped, then pumped', () => {
  for (const id of GLIDERS) for (const size of [0.3, 0.5, 0.7, 0.85]) for (const side of [-1, 1]) for (const delay of [0.15, 0.3]) {
    const flight = flyFailure(id, 'asym', { side, size, hands: guided(delay) });
    const at = `${id} ${size} ${side < 0 ? 'left' : 'right'} ${delay} s late`;
    assert.deepEqual(flight.seen, ['asym'], `${at}: nothing worse`);
    assert.ok(flight.seconds < (size <= 0.5 ? 4 : 5), `${at}: steady in ${flight.seconds} s`);
    assert.ok(flight.turned < 120 && flight.lost < 60, `${at}: ${flight.turned}°, ${flight.lost} m`);
  }
});

test('braked too hard, the open half of a C, a D or the acro wing spins; the A and the B only turn, and a light counter spins none', () => {
  for (const id of GLIDERS) {
    const hard = flyFailure(id, 'asym', { side: 1, size: 0.5, hands: pair(0.82, 0), seconds: 3 });
    assert.equal(hard.seen.includes('spin'), id !== 'en-a' && id !== 'en-b', `${id}: ${hard.seen}`);
    const light = flyFailure(id, 'asym', { side: 1, size: 0.7, hands: pair(0.3, 0), seconds: 8 });
    assert.ok(!light.seen.includes('spin'), `${id} light counter: ${light.seen}`);
  }
});

test('a pump refills the travel the hand pulls, whatever the frame rate', () => {
  const pumpedAt = (dt: number) => {
    const g = createFlight({ x: 0, y: 3000, z: 0 }, 'en-d');
    induceFailure(g, 'asym', 1, 0.8);
    for (const [seconds, hands] of [[0.2, pair(0)], [0.6, pair(0, 0.82)], [0.2, pair(0)]] as const)
      for (let i = 0; i < Math.round(seconds / dt); i++) stepFlight(g, hands, {}, dt);
    return g.foldRight;
  };
  const sixty = pumpedAt(1 / 60);
  assert.ok(sixty < 0.5, `one stroke of Q refills a good share: ${sixty}`);
  assert.ok(Math.abs(sixty - pumpedAt(1 / 120)) < 0.005, `${sixty} vs ${pumpedAt(1 / 120)}`);
});

test('a fold only ever takes energy away, whatever the hands do after it', () => {
  for (const id of GLIDERS) {
    const g: FlightState = createFlight({ x: 0, y: 3000, z: 0 }, id);
    induceFailure(g, 'asym', -1, 0.7);
    let energy = physicsEnergy(g), seed = 11;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 1800; i++) {
      const hands = i % 45 === 0 ? pair(Math.round(random() * 10) / 10, Math.round(random() * 10) / 10) : null;
      stepFlight(g, hands ?? { controlMode: 'brakes', leftBrake: g.leftBrakeTarget / 0.6, rightBrake: g.rightBrakeTarget / 0.6 }, {}, 1 / 60);
      const next = physicsEnergy(g);
      assert.ok(next <= energy + 0.001, `${id} gained ${next - energy} J at step ${i}`);
      energy = next;
    }
  }
});

test('a spin started on a half turns the canopy toward that half, and with the hands up it flies again', () => {
  for (const id of ['en-c', 'en-d', 'acro']) for (const side of [-1, 1]) {
    const g = createFlight({ x: 0, y: 3000, z: 0 }, id);
    assert.ok(induceFailure(g, 'spin', side));
    stepFlight(g, pair(0), {}, LAB_STEP);
    assert.ok(-side * g.canopy.omega.y > 1, `${id} ${side}: turning toward the stalled half, ${g.canopy.omega.y} rad/s about up (left positive)`);
    for (let i = 0; i < 2 * 60; i++) stepFlight(g, pair(0), {}, LAB_STEP);
    assert.ok(g.physical.sepL < 0.5 && g.physical.sepR < 0.5, `${id} ${side}: out of it within 2 s`);
    // The D's stalled half fills again the slowest of all, softening its exit.
    for (let i = 0; i < 6 * 60; i++) stepFlight(g, pair(0), {}, LAB_STEP);
    assert.equal(g.physical.sepL + g.physical.sepR, 0, `${id} ${side}: both halves fly`);
  }
});

// Flies `wing` from trim through `legs`, after `start` (an instructor's failure, say), and says when a
// front collapse first opened, whether it ever stalled deep, and when that deep stall ended.
function trace(wing: string, legs: [number, FlightInput][], start?: (g: FlightState) => void) {
  const g = createFlight({ x: 0, y: 3000, z: 0 }, wing);
  start?.(g);
  const tucked = g.tuck > 0;
  let t = 0, opened = Infinity, deep = false, out = Infinity;
  for (const [seconds, hands] of legs) for (let i = 0; i < Math.round(seconds * 60); i++) {
    stepFlight(g, hands, {}, LAB_STEP); t += LAB_STEP;
    if (tucked && opened === Infinity && g.tuck === 0) opened = t;
    if (g.deepStall > 0) deep = true;
    if (deep && g.deepStall === 0 && out === Infinity) out = t;
  }
  return { g, opened, deep, out };
}
const frontal = (g: FlightState) => { induceFailure(g, 'frontal'); };
const deep = (g: FlightState) => { induceFailure(g, 'deep'); };

test('a front collapse opens by itself, hands up, the slower the higher the class; held hands slow it, and on the C and up a pump of both hands speeds it', () => {
  const opens = Object.fromEntries(GLIDERS.map(id => [id, trace(id, [[8, pair(0)]], frontal).opened]));
  assert.ok(opens['en-a'] < 1.5 && opens['en-d'] > 3 && opens['en-d'] < 4.5, JSON.stringify(opens));
  assert.ok(opens['en-a'] < opens['en-b'] && opens['en-b'] < opens['en-c'] && opens['en-c'] < opens['acro'] && opens['acro'] <= opens['en-d'], JSON.stringify(opens));
  for (const id of GLIDERS) {
    const pumped = trace(id, [[0.3, pair(0)], [0.3, pair(0.6)], [8, pair(0)]], frontal).opened;
    if (id === 'en-a' || id === 'en-b') assert.ok(pumped >= opens[id], `${id}: a pump does not open the A or the B`);
    else assert.ok(pumped < opens[id] - 0.1, `${id}: pumped ${pumped} s against ${opens[id]} s`);
  }
  const held = trace('en-a', [[8, pair(0.6)]], frontal);
  assert.ok(held.opened > opens['en-a'] + 0.3 && held.opened < 4, `held hands slow the A's opening, never stop it: ${held.opened} s`);
});

test('opened with both hands held, a front collapse stalls deep on the B and up, never on the A', () => {
  for (const id of GLIDERS) assert.equal(trace(id, [[10, pair(0.6)]], frontal).deep, id !== 'en-a', id);
});

test('a deep stall: hands up alone fly the B out of it in seconds, the C slowly, the D and the acro wing never; the speed bar flies each out within a second or so; braking back in is a full stall', () => {
  const bar = { ...pair(0), bar: true };
  const out = Object.fromEntries(['en-b', 'en-c', 'en-d', 'acro'].map(id => [id, trace(id, [[20, pair(0)]], deep).out]));
  assert.ok(out['en-b'] < 5 && out['en-c'] > out['en-b'] && out['en-c'] < 12, JSON.stringify(out));
  assert.equal(out['en-d'], Infinity); assert.equal(out['acro'], Infinity);
  for (const id of ['en-b', 'en-c', 'en-d', 'acro']) {
    const barred = trace(id, [[20, bar]], deep);
    assert.ok(barred.out < 2, `${id} on the bar: ${barred.out} s`);
    assert.equal(barred.g.wingPhase, 'flying');
    const braked = trace(id, [[1, pair(0)], [2, pair(1)]], deep);
    assert.equal(braked.g.deepStall, 0); assert.ok(['full-stall', 'backfly'].includes(braked.g.wingPhase), `${id}: ${braked.g.wingPhase}`);
  }
});

test('let go of a full stall slowly and the B and up stall deep; let go cleanly and none does', () => {
  for (const id of ['en-b', 'en-c', 'en-d', 'acro']) {
    assert.equal(trace(id, [[6, pair(1)], [1.5, pair(0.4)], [4, pair(0)]]).deep, true, `${id} crept out`);
    assert.equal(trace(id, [[6, pair(1)], [6, pair(0)]]).deep, false, `${id} let go`);
  }
});

test('flown with the fix, a deep stall is out within seconds on every glider that has one, and a front collapse goes into nothing worse', () => {
  for (const id of GLIDERS) for (const delay of [0.15, 0.3]) {
    if (id !== 'en-a') {
      const flight = flyFailure(id, 'deep', { hands: guided(delay) });
      assert.ok(flight.seconds < 4.5, `${id} deep, ${delay} s late: ${flight.seconds} s`);
      assert.deepEqual(flight.seen, ['deep']);
    }
    const tuck = flyFailure(id, 'frontal', { hands: guided(delay) });
    assert.deepEqual(tuck.seen, ['frontal'], `${id} frontal, ${delay} s late`);
    assert.ok(tuck.seconds < 9, `${id} frontal, ${delay} s late: ${tuck.seconds} s`);
  }
});

test('a big collapse left alone on a C, a D or the acro wing ends with its tip caught in the lines, which never comes free by itself; the A and the B never catch one, and the fix never does', () => {
  for (const id of GLIDERS) {
    const left = flyFailure(id, 'asym', { side: 1, size: 0.85, seconds: 20 });
    assert.equal(left.seen.includes('cravat'), id === 'en-c' || id === 'en-d' || id === 'acro', `${id}: ${left.seen}`);
    for (const delay of [0.15, 0.3]) assert.ok(!flyFailure(id, 'asym', { side: -1, size: 0.85, hands: guided(delay) }).seen.includes('cravat'), `${id} flown`);
  }
  for (const id of ['en-c', 'en-d', 'acro'] as const) {
    const g = createFlight({ x: 0, y: 3000, z: 0 }, id);
    induceFailure(g, 'cravat', -1);
    for (let i = 0; i < 15 * 60; i++) stepFlight(g, pair(0), {}, LAB_STEP);
    assert.equal(g.cravatLeft, 1, `${id}: still caught after 15 s`);
    assert.ok(g.foldLeft >= GLIDER_TABLES[id].feel!.recovery!.cravatFloor, 'and its half folded');
  }
});

test('a caught tip comes free with its side held long and deep, or with a full stall; flown with the fix it is out within seconds', () => {
  const freed = (id: string, hands: FlightInput) => {
    const g = createFlight({ x: 0, y: 3000, z: 0 }, id);
    induceFailure(g, 'cravat', 1);
    let t = 0;
    while (g.cravatRight > 0 && t < 10 * 60) { stepFlight(g, hands, {}, LAB_STEP); t += 1; }
    return t * LAB_STEP;
  };
  for (const id of ['en-c', 'en-d', 'acro'] as const) {
    const pull = GLIDER_TABLES[id].feel!.recovery!.cravatPull;
    const held = freed(id, pair(0, 0.82));
    assert.ok(held > pull && held < pull + 0.6, `${id}: E held frees it in ${held} s (pull ${pull} s)`);
    assert.ok(freed(id, pair(1)) < 1.5, `${id}: a full stall shakes it free`);
    for (const delay of [0.15, 0.3]) {
      const flight = flyFailure(id, 'cravat', { side: -1, hands: guided(delay) });
      assert.ok(flight.saved < 6.5 && flight.savedLost < 60, `${id} ${delay} s late: saved in ${flight.saved} s, ${flight.savedLost} m`);
      assert.equal(flight.escalations, 0, `${id} ${delay} s late: ${flight.seen}`);
    }
  }
});

test('only the acro wing twists its lines: no caught exit binds them, a spin reversed into the other side does', () => {
  const S = pair(0.6), UP = pair(0);
  // Lets go, and brakes the dive with S for a second once the canopy is well ahead, 0.15 s late.
  const caught = () => {
    let dived = -1;
    return (g: FlightState, tick: number): FlightInput => {
      if (dived < 0 && g.pitch < -0.26 && g.pitchRate < 0) dived = tick;
      return dived >= 0 && tick >= dived + 9 && tick < dived + 69 ? S : UP;
    };
  };
  const most = (id: string, legs: [number, FlightInput | ((g: FlightState, tick: number) => FlightInput)][]) => {
    const g = createFlight({ x: 0, y: 3000, z: 0 }, id);
    let bound = 0, tick = 0;
    for (const [seconds, hands] of legs) for (let i = 0; i < seconds * 60; i++, tick++) {
      stepFlight(g, typeof hands === 'function' ? hands(g, tick) : hands, {}, LAB_STEP);
      bound = Math.max(bound, g.twisted);
    }
    return bound;
  };
  for (const legs of [[[8, S], [4, pair(1, 0)], [12, caught()]], [[10, pair(0.82, 0)], [10, pair(1, 0)], [12, caught()]],
    [[6, pair(1)], [8, pair(1, 0.6)], [2, pair(1)], [12, caught()]], [[6, pair(1)], [8, pair(1, 0.6)], [12, UP]]] as const)
    assert.equal(most('acro', legs as never), 0, JSON.stringify(legs));
  assert.ok(most('acro', [[3, UP], [4, pair(1, 0)], [2, pair(0, 1)], [12, UP]]) > 0, 'a spin reversed into the other side binds them');
  for (const id of ['en-a', 'en-b', 'en-c', 'en-d']) assert.equal(most(id, [[8, S], [4, pair(1, 0)], [2, pair(0, 1)], [12, UP]]), 0, id);
});

test('lines twisted and bound stay so left alone, take the brakes\' reach, and unwind with the hands up and the unwinding side held', () => {
  for (const side of [-1, 1]) {
    const g = createFlight({ x: 0, y: 3000, z: 0 }, 'acro');
    induceFailure(g, 'twist', side);
    for (let i = 0; i < 10 * 60; i++) stepFlight(g, pair(0), {}, LAB_STEP);
    assert.equal(g.twisted, 1, `${side}: still bound after 10 s`);
    for (const delay of [0.15, 0.3]) {
      const flight = flyFailure('acro', 'twist', { side, hands: guided(delay) });
      assert.ok(flight.saved < 2.5, `${side} ${delay} s late: ${flight.saved} s`);
      assert.deepEqual(flight.seen, ['twist']);
    }
  }
  const turn = (twisted: boolean) => {
    const g = createFlight({ x: 0, y: 3000, z: 0 }, 'acro');
    if (twisted) induceFailure(g, 'twist', 1);
    let yaw = 0;
    for (let i = 0; i < 90; i++) { stepFlight(g, pair(0, 0.82), {}, LAB_STEP); yaw += g.yawRate * LAB_STEP; }
    return yaw;
  };
  assert.ok(turn(true) < turn(false) / 2, `bound, E turns the wing ${turn(true)} rad against ${turn(false)} free`);
});

test('a cravat and a line twist only ever take energy away, whatever the hands do', () => {
  for (const [id, kind] of [['en-d', 'cravat'], ['acro', 'cravat'], ['acro', 'twist']] as const) {
    const g: FlightState = createFlight({ x: 0, y: 3000, z: 0 }, id);
    induceFailure(g, kind, 1);
    let energy = physicsEnergy(g), seed = 23;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 1800; i++) {
      const hands = i % 45 === 0 ? pair(Math.round(random() * 10) / 10, Math.round(random() * 10) / 10) : null;
      stepFlight(g, hands ?? { controlMode: 'brakes', leftBrake: g.leftBrakeTarget / 0.6, rightBrake: g.rightBrakeTarget / 0.6 }, {}, 1 / 60);
      const next = physicsEnergy(g);
      assert.ok(next <= energy + 0.001, `${id} ${kind} gained ${next - energy} J at step ${i}`);
      energy = next;
    }
  }
});

test('ordinary flying never folds a half, catches a tip, stalls deep or twists the lines, on any glider', () => {
  const regimes: FlightInput[] = [pair(0), pair(0.3, 0), pair(0, 0.5), pair(0.2), pair(0.6), pair(0.82, 0), pair(0, 0.82), { ...pair(0), bar: true }];
  for (const id of GLIDERS) for (const hands of regimes) {
    const g = createFlight({ x: 0, y: 3000, z: 0 }, id);
    let worst = 0;
    // A minute held, then hands up for half a minute: a spiral's exit is ordinary flying too.
    for (let i = 0; i < 90 * 60; i++) {
      stepFlight(g, i < 60 * 60 ? hands : pair(0), {}, LAB_STEP);
      worst = Math.max(worst, g.foldLeft, g.foldRight, g.cravatLeft, g.cravatRight, g.deepStall, g.twisted);
    }
    assert.equal(worst, 0, `${id} ${JSON.stringify(hands)}`);
  }
});
