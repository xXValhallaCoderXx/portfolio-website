import test from 'node:test';
import assert from 'node:assert/strict';
import { summariseRun } from './meet-sheet.js';
import { RUN, createRunWorld, finishRun, startRun, stepRun } from './run-step.js';
import { createReferencePilot } from './pilots.js';
import { CLOUD_GATE, createCloudbaseRun } from './cloudbase-state.js';
import { MEET, MEET_POOL, createMeet } from './meet-state.js';
import { createBells } from './bells.js';

// A run on `seed` with the meet and the kettlebells, flown by the reference pilot (pilots.js) until
// the fog, and ended as live play ends it.
function flown(seed, pilot = {}) {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells() }), seed);
  const reference = createReferencePilot(pilot);
  const intent = { turn: 0, brake: false, bar: false };
  let reason = null;
  while (!reason) {
    reference.decide(world, intent);
    reason = stepRun(world, intent, RUN.step);
  }
  finishRun(world, reason);
  return { world, reason };
}

test('a run\'s sheet is what its world holds: every lift judged in order with the mist last, the counters, and the peak to the whole metre', () => {
  for (const seed of [1, 2, 3]) {
    const { world, reason } = flown(seed, { brake: 'eased' });
    const { sky, g, meet, bells, trace } = world;
    const met = meet.state;
    const sheet = summariseRun(world, reason);
    assert.deepEqual(Object.keys(sheet), ['seed', 'reason', 'steps', 'seconds', 'total', 'peak', 'lifts', 'stats', 'trace']);
    assert.deepEqual([sheet.seed, sheet.reason, sheet.steps, sheet.seconds, sheet.total], [seed, 'fog', world.steps, sky.state.elapsed, met.total]);
    assert.equal(sheet.peak, Math.floor(Math.max(sky.state.peak, g.pos.y)));
    assert.deepEqual(sheet.lifts, met.lifts.slice(0, met.count));
    assert.deepEqual(sheet.lifts.map((lift) => lift.line), [...sheet.lifts.slice(0, -1).map((_, i) => MEET.every * (i + 1)), 0]);
    assert.deepEqual(sheet.stats, {
      strikes: sky.state.pilot.strikes, stalls: world.stalls, cloud: Math.round(sky.state.pilot.cloudTime),
      reps: met.reps, deep: met.deep, trails: met.trails, close: met.close, thrown: bells.state.thrown, dodged: bells.state.dodged, hits: bells.state.hits,
    });
    assert.deepEqual(sheet.trace, { alt: [...trace.alt.subarray(0, trace.n)], fog: [...trace.fog.subarray(0, trace.n)], total: [...trace.total.subarray(0, trace.n)], n: trace.n });
    assert.ok(sheet.lifts.length >= 4 && sheet.stats.thrown >= 2 && sheet.trace.n > 100, JSON.stringify(sheet.stats));
  }
});

test('a sheet is plain data of its own: it can be kept and sent, and neither it nor the world it came from can change the other', () => {
  const { world, reason } = flown(4);
  const sheet = summariseRun(world, reason);
  assert.deepEqual(structuredClone(sheet), sheet);
  assert.deepEqual(JSON.parse(JSON.stringify(sheet)), sheet);
  const kept = structuredClone(sheet);
  // Writing on the sheet leaves the meet's pools alone, and the next run in the same world leaves
  // the sheet alone.
  sheet.lifts[0].kg = 999;
  sheet.trace.alt[0] = -1;
  sheet.stats.reps = -1;
  assert.notEqual(world.meet.state.lifts[0].kg, 999);
  assert.notEqual(world.trace.alt[0], -1);
  const again = summariseRun(world, reason);
  assert.deepEqual(again, kept);
  const pilot = createReferencePilot();
  const intent = { turn: 0, brake: false, bar: false };
  startRun(world, 5);
  for (let i = 0; i < 60 * 60; i++) stepRun(world, pilot.decide(world, intent), RUN.step);
  assert.ok(world.meet.state.count > 0 && world.trace.n > 60);
  assert.deepEqual(again, kept);
});

test('a quit is any ending but the fog and a touchdown, and a world with no meet or kettlebells reads as nothing banked', () => {
  const { world } = flown(6);
  for (const [asked, said] of [['fog', 'fog'], ['landed', 'landed'], ['quit', 'quit'], ['travel', 'quit'], [undefined, 'quit']]) {
    assert.equal(summariseRun(world, asked).reason, said);
  }
  const bare = startRun(createRunWorld({ sky: createCloudbaseRun() }), 6);
  const pilot = createReferencePilot();
  const intent = { turn: 0, brake: false, bar: false };
  for (let i = 0; i < 20 * 60; i++) assert.equal(stepRun(bare, pilot.decide(bare, intent), RUN.step), null);
  finishRun(bare, 'quit');
  const sheet = summariseRun(bare, 'quit');
  assert.deepEqual([sheet.total, sheet.lifts, sheet.steps, sheet.trace.n], [0, [], 20 * 60, 21]);
  assert.deepEqual(sheet.stats, { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 0, close: 0, thrown: 0, dodged: 0, hits: 0 });
  assert.ok(sheet.peak > CLOUD_GATE.y);
});

test('the peak counts where the glider is as well as the highest the sky saw, and only the lifts the meet keeps are listed', () => {
  const { world, reason } = flown(7);
  const { meet, g, sky } = world;
  // A glider above the highest the sky has counted (a touchdown's step is never counted) is where the peak is.
  g.pos.y = sky.state.peak + 3.7;
  assert.equal(summariseRun(world, reason).peak, Math.floor(sky.state.peak + 3.7));
  // More lifts judged than the pool keeps: the first MEET_POOL.lifts are listed, in order.
  meet.state.count = MEET_POOL.lifts + 3;
  const sheet = summariseRun(world, reason);
  assert.equal(sheet.lifts.length, MEET_POOL.lifts);
  assert.deepEqual(sheet.lifts, meet.state.lifts);
});
