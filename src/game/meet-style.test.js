import test from 'node:test';
import assert from 'node:assert/strict';
import { STYLE, createStyle } from './meet-style.js';
import { BANDS } from './swing-watch.js';
import { RUN, createRunWorld, finishRun, startRun, stepRun } from './run-step.js';
import { TST, createReferencePilot } from './pilots.js';
import { createCloudbaseRun } from './cloudbase-state.js';
import { createMeet } from './meet-state.js';
import { createBells } from './bells.js';
import { summariseRun } from './meet-sheet.js';

const STEP = 1 / 60;
const DEG = Math.PI / 180;

// The style beside a watch driven by hand: what the watch would have seen, peak by peak.
function scored({ folds = true } = {}) {
  const style = createStyle();
  const watch = { fronts: 0, front: 0, building: 0, tops: 0, top: 0, chain: 0, topSide: 0, breaks: 0, broke: 0, calm: 0 };
  const world = { watch: { state: watch }, controls: { folds } };
  const step = () => style.step(STEP, world);
  return {
    style,
    world,
    front(deg, building) {
      Object.assign(watch, { fronts: watch.fronts + 1, front: deg * DEG, building, calm: 0 });
      step();
    },
    top(deg, chain) {
      Object.assign(watch, { tops: watch.tops + 1, top: deg * DEG, chain, calm: 0 });
      step();
    },
    calm(seconds) {
      for (let i = 0; i < Math.round(seconds / STEP); i++) {
        watch.calm += STEP;
        step();
      }
    },
    broke(code) {
      Object.assign(watch, { breaks: watch.breaks + 1, broke: code, calm: 0 });
      step();
    },
  };
}

test('linked wingovers score from the second top, the first with it, each by its band and more the more are linked', () => {
  const { style, top, calm } = scored();
  // A held turn reversed: its first top alone counts for nothing.
  top(45, 1);
  assert.equal(style.state.elements, 0);
  top(54, 2);
  top(62, 3);
  top(68, 4);
  top(72, 5);
  top(75, 6);
  // 45° is short of the first band, so 54° starts the links: 10, 20, 30 x1.5, 50 x2, 50 x2.5.
  assert.deepEqual([style.state.elements, style.state.pending], [5, 10 + 20 + 45 + 100 + 125]);
  calm(STYLE.settle);
  assert.deepEqual([style.state.total, style.state.landed, style.state.wingovers, style.state.pitch], [300, 1, 5, 0]);
  assert.equal(style.state.pending, 0);
  // Every element's points are a multiple of 5.
  for (const points of STYLE.points) for (const half of STYLE.chain) assert.equal(((points * half) / 2) % 5, 0);
});

test('a pitched swing counts from its third forward peak in a row, the two before it with it, and lands as it is caught', () => {
  const { style, front, calm } = scored();
  front(26, 1);
  front(41, 2);
  assert.equal(style.state.elements, 0, 'two peaks are not yet a pitched swing');
  front(50, 3);
  assert.deepEqual([style.state.elements, style.state.pending], [3, 10 + 30 + 75]);
  calm(STYLE.settle);
  assert.deepEqual([style.state.total, style.state.pitch, style.state.wingovers], [115, 50, 0]);
});

test('a set lands only with three elements in it, once the wing has flown level and calm a second, and pitching and wingovers link into one', () => {
  const short = scored();
  short.top(55, 1);
  short.top(56, 2);
  short.calm(5);
  assert.deepEqual([short.style.state.total, short.style.state.landed, short.style.state.elements], [0, 0, 0]);
  const mixed = scored();
  mixed.top(55, 1);
  mixed.top(60, 2);
  mixed.calm(STYLE.settle - 2 * STEP);
  assert.equal(mixed.style.state.landed, 0, 'not calm long enough');
  mixed.front(25, 1);
  mixed.front(30, 2);
  mixed.front(42, 3);
  mixed.calm(STYLE.settle);
  // 10 + 20, then the pitch's three linked on: 10 x1.5, 20 x2, 30 x2.5.
  assert.deepEqual([mixed.style.state.landed, mixed.style.state.total, mixed.style.state.wingovers, mixed.style.state.pitch], [1, 30 + 15 + 40 + 75, 2, 42]);
});

test('a tuck, a tip, a stall or a strike loses the set in hand, and nothing counts again until the wing is calm; the ears drop it unscored', () => {
  for (const code of [1, 2, 3, 4]) {
    const { style, top, calm, broke } = scored();
    top(55, 1);
    top(60, 2);
    top(66, 3);
    broke(code);
    assert.deepEqual([style.state.lost, style.state.said, style.state.pending, style.state.total], [1, 10 + 20 + 45, 0, 0], `break ${code}`);
    // The swing left after it counts for nothing until the wing has been calm.
    top(62, 4);
    top(64, 5);
    top(66, 6);
    assert.equal(style.state.elements, 0);
    calm(STYLE.settle);
    assert.equal(style.state.total, 0);
  }
  const eared = scored();
  eared.top(55, 1);
  eared.top(60, 2);
  eared.top(66, 3);
  eared.broke(5);
  assert.deepEqual([eared.style.state.lost, eared.style.state.pending], [0, 0]);
  // A dodge turned back can make a lone element: no set in hand yet, so broken off it is only dropped.
  const dodged = scored();
  dodged.top(45, 1);
  dodged.top(55, 2);
  assert.equal(dodged.style.state.elements, 1);
  dodged.broke(4);
  assert.deepEqual([dodged.style.state.lost, dodged.style.state.said, dodged.style.state.elements], [0, 0, 0]);
});

test('a run that ends with a set in hand lands none of it, and a new run starts with nothing', () => {
  const { style, top } = scored();
  for (const [deg, chain] of [[55, 1], [60, 2], [66, 3], [70, 4]]) top(deg, chain);
  style.finish('fog');
  assert.deepEqual([style.state.total, style.state.pending, style.state.elements], [0, 0, 0]);
  style.reset();
  assert.deepEqual(style.state, createStyle().state);
  for (const value of Object.values(style.state)) assert.ok(typeof value === 'number' || typeof value === 'boolean');
});

// A whole run with the meet and the kettlebells and the style, flown by the reference pilot with
// `options`, or by the very asks `asked` of another run; `style` false flies it without one. Hands
// back the world, its sheet and what was asked at every step.
function flyRun(seed, options, { style = true, asked = null } = {}) {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells(), style: style ? createStyle() : null }), seed);
  const pilot = asked ? null : createReferencePilot(options);
  const intent = { turn: 0, brake: false, bar: false };
  const asks = [];
  let reason = null;
  while (!reason) {
    const ask = asked ? asked[world.steps] : pilot.decide(world, intent);
    if (!asked) asks.push({ ...ask });
    reason = stepRun(world, ask, RUN.step);
  }
  finishRun(world, reason);
  return { world, sheet: summariseRun(world, reason), asks };
}

test('the reference pilots, flying as they always have, earn no style', () => {
  for (const options of [TST, { ...TST, collect: true }, { brake: 'eased' }, { brake: 'none' }]) {
    for (let seed = 1; seed <= 6; seed++) {
      const { world } = flyRun(seed, options);
      assert.equal(world.style.state.total, 0, `seed ${seed} ${JSON.stringify(options)}`);
    }
  }
});

test('TST told to fly wingovers or to pitch its wing high in a run lands them, and pitched too long it tucks and loses the set', () => {
  for (let seed = 1; seed <= 3; seed++) {
    const wingovers = flyRun(seed, { ...TST, tricks: { swaps: 6, from: 350 } }).world.style.state;
    assert.ok(wingovers.landed >= 1 && wingovers.wingovers >= 4 && wingovers.total >= 100, `seed ${seed}: ${JSON.stringify(wingovers)}`);
    const pitched = flyRun(seed, { ...TST, tricks: { pumps: 4, from: 350 } }).world.style.state;
    assert.ok(pitched.landed === 1 && pitched.pitch >= 45 && pitched.total >= 100, `seed ${seed}: ${JSON.stringify(pitched)}`);
    const { world } = flyRun(seed, { ...TST, tricks: { pumps: 6, from: 350 } });
    assert.ok(world.tucks >= 1 && world.style.state.lost === 1 && world.style.state.total === 0, `seed ${seed}: ${JSON.stringify(world.style.state)}`);
  }
});

test('TST told to fly its wingovers on into loops goes round as often as told, rolls out and lands the set, each loop worth more the more are linked', () => {
  for (let seed = 1; seed <= 3; seed++) {
    const scores = [1, 3, 5].map((loops) => {
      const { world } = flyRun(seed, { ...TST, tricks: { swaps: 4, loops, from: 350 } });
      const style = world.style.state;
      assert.ok(style.landed === 1 && style.lost === 0 && style.mostLoops === loops && world.tucks === 0, `seed ${seed}, ${loops} loops: ${JSON.stringify(style)}`);
      return style.total;
    });
    // The fourth and fifth loop, linked deep, add more than the second and third.
    assert.ok(scores[0] >= 150 && scores[2] - scores[1] > scores[1] - scores[0], `seed ${seed}: ${scores.join(', ')}`);
  }
});

test('style never touches the wing, the sky or the meet: a run flies and lifts the same with it as without it, and its sheet carries it', () => {
  for (const tricks of [{ swaps: 6, from: 350 }, { pumps: 4, from: 350 }, { swaps: 4, loops: 3, from: 350 }]) {
    // Without a style the same pilot would fly on differently (it watches for its set to land), so
    // the bare world is flown with the very asks the scored one made.
    const scoredRun = flyRun(2, { ...TST, tricks });
    const bare = flyRun(2, null, { style: false, asked: scoredRun.asks });
    const wing = (g) => ({ ...g, pos: { ...g.pos } });
    assert.deepEqual(wing(scoredRun.world.g), wing(bare.world.g));
    assert.deepEqual(scoredRun.world.meet.state, bare.world.meet.state);
    assert.deepEqual(scoredRun.world.sky.state, bare.world.sky.state);
    const { stats } = scoredRun.sheet;
    assert.deepEqual([stats.style, stats.wingovers, stats.pitch], [scoredRun.world.style.state.total, scoredRun.world.style.state.wingovers, scoredRun.world.style.state.pitch]);
    assert.ok(stats.style > 0);
    assert.deepEqual([bare.sheet.stats.style, bare.sheet.stats.wingovers, bare.sheet.stats.pitch], [0, 0, 0]);
    // The kilograms are the meet's alone.
    assert.equal(scoredRun.sheet.total, bare.sheet.total);
  }
  assert.ok(BANDS.roll.length === STYLE.points.length && BANDS.pitch.length === STYLE.points.length);
});
