import type { BynameId } from './meet-bynames.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BYNAME, BYNAMES, bynameFor, bynameOf } from './meet-bynames.ts';
import { TST, createReferencePilot, flyPilot } from './pilots.ts';
import { createRunWorld, startRun } from './run-step.ts';
import { createCloudbaseRun } from './cloudbase-state.ts';
import { createMeet } from './meet-state.ts';
import { createBells } from './bells.ts';
import { summariseRun } from './meet-sheet.ts';

// A lift as the meet keeps one: good with no more than one red light.
const lift = (line: number, red = 0, double = false) => ({ line, kg: 25, red, good: (red & (red - 1)) === 0, double, at: 0 });
// A sheet as summariseRun writes one, judged by the fog, that earns no byname until it is told to:
// two lines (one with a red light), a strike from the one kettlebell thrown, four seconds in cloud
// and a single rep, short of depth.
const sheet = (fields = {}, stats = {}) => ({
  seed: 1, reason: 'fog', steps: 8_000, seconds: 133, total: 100, peak: 700,
  lifts: [lift(250), lift(500, 1), lift(0)],
  stats: { strikes: 1, stalls: 0, cloud: 4, reps: 1, deep: 0, trails: 2, close: 0, thrown: 1, dodged: 0, hits: 1, ...stats },
  trace: { alt: [], fog: [], total: [], n: 0 },
  ...fields,
});
const clean = (lines: number) => [...Array.from({ length: lines }, (_, i) => lift(250 * (i + 1))), lift(0)];

test('bynames are few, each with its own name and a rule in words, and are found by their ids', () => {
  assert.ok(BYNAMES.length >= 4 && BYNAMES.length <= 8, `${BYNAMES.length} bynames`);
  assert.equal(new Set(BYNAMES.map((byname) => byname.id)).size, BYNAMES.length);
  assert.equal(new Set(BYNAMES.map((byname) => byname.name)).size, BYNAMES.length);
  for (const byname of BYNAMES) {
    assert.match(byname.id, /^[a-z]+(?:-[a-z]+)*$/, byname.id);
    assert.ok(byname.rule.length > 10, byname.id);
    assert.equal(bynameOf(byname.id), byname);
  }
  for (const none of ['', 'The Unstruck', 'constructor', '__proto__', null, undefined, 7]) assert.equal(bynameOf(none), null, String(none));
});

test('a plain run earns no byname, and nor does any run the sky did not judge', () => {
  assert.equal(bynameFor(sheet()), '');
  // The very run that earns the first byname earns none once its pilot ends it, or with no ending.
  const unbroken = sheet({ lifts: clean(5) }, { strikes: 0, thrown: 4, hits: 0, cloud: 0, reps: 3, deep: 3 });
  assert.equal(bynameFor(unbroken), 'unbroken');
  assert.equal(bynameFor({ ...unbroken, reason: 'landed' }), 'unbroken', 'a touchdown judges the bar as the fog does');
  for (const reason of ['quit', '', undefined, 'travel']) assert.equal(bynameFor({ ...unbroken, reason }), '', String(reason));
  for (const nonsense of [null, undefined]) assert.equal(bynameFor(nonsense), '');
});

test('each byname is earned by its own rule, and not by a run that falls just short of it', () => {
  // The Unbroken: every light white, the mist's too, over four lines or more.
  assert.equal(BYNAME.lines, 4);
  assert.equal(bynameFor(sheet({ lifts: clean(4) })), 'unbroken');
  assert.notEqual(bynameFor(sheet({ lifts: clean(3) })), 'unbroken', 'three lines');
  assert.notEqual(bynameFor(sheet({ lifts: [...clean(4).slice(0, 4), lift(0, 4)] })), 'unbroken', 'a red light from the mist');
  assert.notEqual(bynameFor(sheet({ lifts: [lift(250), lift(500, 2), lift(750), lift(1000), lift(0)] })), 'unbroken', 'one red light on a good lift');
  // The Unstruck: no strike all run, with three kettlebells or more thrown.
  assert.equal(BYNAME.thrown, 3);
  assert.equal(bynameFor(sheet({}, { strikes: 0, thrown: 3, hits: 0 })), 'unstruck');
  assert.equal(bynameFor(sheet({}, { strikes: 0, thrown: 2, hits: 0 })), '', 'two thrown');
  // The Centred: three reps or more, every one to depth.
  assert.equal(BYNAME.reps, 3);
  assert.equal(bynameFor(sheet({}, { reps: 3, deep: 3 })), 'centred');
  assert.equal(bynameFor(sheet({}, { reps: 7, deep: 7 })), 'centred');
  assert.equal(bynameFor(sheet({}, { reps: 3, deep: 2 })), '', 'one rep off the core');
  assert.equal(bynameFor(sheet({}, { reps: 2, deep: 2 })), '', 'two reps');
  // Bell-dodger: every kettlebell dodged, three or more, though a raven struck.
  assert.equal(bynameFor(sheet({}, { strikes: 1, thrown: 3, hits: 0, dodged: 3 })), 'bell-dodger');
  assert.equal(bynameFor(sheet({}, { strikes: 1, thrown: 4, hits: 1, dodged: 3 })), '', 'one hit');
  // Horn-lifter: a good lift after Gjallarhorn sounds.
  assert.equal(bynameFor(sheet({ lifts: [lift(250), lift(500, 1), lift(750, 0, true), lift(0)] })), 'horn-lifter');
  assert.equal(bynameFor(sheet({ lifts: [lift(250), lift(500, 1), lift(750, 3, true), lift(0)] })), '', 'no lift under the horn');
  // Cloud-shy: not a second in cloud, on a climb past 750 m.
  assert.equal(BYNAME.peak, 750);
  assert.equal(bynameFor(sheet({ peak: 750 }, { cloud: 0 })), 'cloud-shy');
  assert.equal(bynameFor(sheet({ peak: 749 }, { cloud: 0 })), '', 'a climb that stopped short of the clouds');
  assert.equal(bynameFor(sheet({ peak: 1400 }, { cloud: 1 })), '', 'a second in cloud');
});

test('a run that earns several bynames is given the first of them in BYNAMES order', () => {
  // One run that meets every rule: each byname taken away in turn leaves the next.
  const all = { lifts: [...clean(4).slice(0, 3), lift(1000, 0, true), lift(0)], peak: 1100 };
  const stats = { strikes: 0, thrown: 4, hits: 0, dodged: 4, reps: 3, deep: 3, cloud: 0 };
  const spoil: Record<BynameId, (run: ReturnType<typeof sheet>) => ReturnType<typeof sheet>> = {
    unbroken: (run) => ({ ...run, lifts: run.lifts.map((each, i: number) => (i === 1 ? lift(500, 2) : each)) }),
    unstruck: (run) => ({ ...run, stats: { ...run.stats, strikes: 1 } }),
    centred: (run) => ({ ...run, stats: { ...run.stats, deep: 2 } }),
    'bell-dodger': (run) => ({ ...run, stats: { ...run.stats, strikes: 2, hits: 1 } }),
    'horn-lifter': (run) => ({ ...run, lifts: run.lifts.map((each) => ({ ...each, double: false })) }),
    'cloud-shy': (run) => ({ ...run, stats: { ...run.stats, cloud: 3 } }),
  };
  assert.deepEqual(Object.keys(spoil), BYNAMES.map((byname) => byname.id));
  let run = sheet(all, stats);
  for (const byname of BYNAMES) {
    assert.equal(bynameFor(run), byname.id);
    run = spoil[byname.id](run);
  }
  assert.equal(bynameFor(run), '');
});

test('a flown run earns the byname whose rule it meets first, and the same one again from a copy of its sheet', () => {
  const pilots = [{ brake: 'eased' }, TST, { ...TST, collect: true }];
  for (const seed of [1, 2, 3]) {
    for (const pilot of pilots) {
      const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells() }), seed);
      const { reason } = flyPilot(world, createReferencePilot(pilot));
      const flown = summariseRun(world, reason ?? undefined);
      // Everything the rules read is on a run's sheet, as numbers and lifts.
      for (const stat of ['strikes', 'thrown', 'hits', 'reps', 'deep', 'cloud'] as const) assert.ok(Number.isInteger(flown.stats[stat]), stat);
      assert.ok(Number.isInteger(flown.peak) && flown.lifts.every((each) => typeof each.good === 'boolean' && typeof each.double === 'boolean' && Number.isInteger(each.red)));
      const id = bynameFor(flown);
      const at = BYNAMES.findIndex((byname) => byname.id === id);
      // Its own rule holds, and no rule before it does.
      if (id) assert.ok(at >= 0 && BYNAMES[at].earns(flown), `seed ${seed}: ${id}`);
      for (const before of BYNAMES.slice(0, at < 0 ? BYNAMES.length : at)) assert.equal(before.earns(flown), false, `seed ${seed}: ${before.id}`);
      assert.equal(bynameFor(structuredClone(flown)), id);
    }
  }
});
