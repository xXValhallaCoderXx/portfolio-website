import test from 'node:test';
import assert from 'node:assert/strict';
import { CATCH, createReferencePilot } from './pilots.js';
import { RUN, createRunWorld, startRun, stepRun } from './run-step.js';
import { CLOUD_STRIKE, createCloudbaseRun } from './cloudbase-state.js';
import { createMeet } from './meet-state.js';
import { createBells } from './bells.js';

// Catching the wing (SIM_VERSION 4): every reference pilot catches a dive with the brake and pumps
// a fold open, as the hints tell a player to (pilots.js CATCH), and one told not to shows what that
// is worth. Kept apart from good-lift.test.js, the suite's longest file, so the two fly side by side.

const firstSkies = (count) => Array.from({ length: count }, (_, i) => i + 1);
const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;

// A whole run with the kettlebells and the meet, flown by the reference pilot with `options`,
// watching every dive (the steps from its start to its end, and whether it tucked) and every fold
// (its steps).
function flyWatched(seed, options) {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), bells: createBells(), meet: createMeet() }), seed);
  const pilot = createReferencePilot(options);
  const intent = { turn: 0, brake: false, bar: false };
  const dives = [];
  const folds = [];
  let diving = null;
  let folded = 0;
  let reason = null;
  while (!reason && world.sky.state.elapsed < 200) {
    pilot.decide(world, intent);
    const wasFolded = world.sky.state.pilot.collapse > 0;
    reason = stepRun(world, intent, RUN.step);
    if (diving) {
      diving.steps += 1;
      if (world.g.dive === 0) {
        diving.tucked = world.g.tuck > 0;
        dives.push(diving);
        diving = null;
      }
    } else if (world.g.dive > 0) {
      diving = { steps: 0, tucked: false };
    }
    if (wasFolded) folded += 1;
    if (wasFolded && world.sky.state.pilot.collapse === 0) {
      folds.push(folded);
      folded = 0;
    }
  }
  return { peak: world.sky.state.peak, tucks: world.tucks, dives, folds };
}

test('every reference pilot catches its wing 0.4 s into a dive and pumps a fold open twice, and one told not to never does', () => {
  // Hands up and dodging 0.6 s in, the pilot that meets the most dives: its own brake never
  // catches one first.
  const lead = Math.round(CATCH.react / RUN.step);
  const pumped = Math.round((CLOUD_STRIKE.collapse - CLOUD_STRIKE.pump.most * CLOUD_STRIKE.pump.cut) / RUN.step);
  const left = Math.round(CLOUD_STRIKE.collapse / RUN.step);
  let dives = 0;
  let folds = 0;
  for (const seed of firstSkies(6)) {
    const catching = flyWatched(seed, { react: 0.6 });
    const not = flyWatched(seed, { react: 0.6, catches: false });
    for (const dive of catching.dives) {
      assert.equal(dive.tucked, false, `seed ${seed}`);
      assert.equal(dive.steps, lead + 1, `seed ${seed}: caught on the step after the reaction`);
    }
    // A fold's clock runs down in steps that do not sum to it exactly, so it may close a step late.
    for (const steps of catching.folds) assert.ok(Math.abs(steps - pumped) <= 1, `seed ${seed}: a fold pumped open twice lasted ${steps} steps`);
    for (const dive of not.dives) assert.equal(dive.tucked, true, `seed ${seed}`);
    for (const steps of not.folds) assert.ok(Math.abs(steps - left) <= 1, `seed ${seed}: a fold left alone lasted ${steps} steps`);
    assert.equal(catching.tucks, 0);
    assert.equal(not.tucks, not.dives.length);
    dives += catching.dives.length + not.dives.length;
    folds += catching.folds.length + not.folds.length;
  }
  // On these skies: 24 dives and 18 folds between the two (under SIM_VERSION 4).
  assert.ok(dives >= 10 && folds >= 10, `${dives} dives and ${folds} folds`);
});

test('a pilot who never catches its wing tucks a couple of times a run and climbs lower than the same pilot catching', () => {
  // On these sixteen skies under SIM_VERSION 4, circling hands up and dodging 0.6 s in: never
  // catching, 1.9 tucks a run and a mean peak of 912 m against the catching pilot's 950 m and no
  // tucks; over seeds 1 to 40 and 1001 to 1040, 2.1 / 1.8 tucks a run, a mean peak 60 / 49 m lower,
  // and 9 / 12 runs past 1,000 m against 13 / 20.
  const catching = firstSkies(16).map((seed) => flyWatched(seed, { react: 0.6 }));
  const not = firstSkies(16).map((seed) => flyWatched(seed, { react: 0.6, catches: false }));
  const tucks = mean(not.map((run) => run.tucks));
  assert.ok(tucks >= 1, `${tucks.toFixed(2)} tucks a run`);
  assert.equal(mean(catching.map((run) => run.tucks)), 0);
  const lower = mean(catching.map((run) => run.peak)) - mean(not.map((run) => run.peak));
  assert.ok(lower > 15, `never catching peaked ${lower.toFixed(0)} m lower`);
});
