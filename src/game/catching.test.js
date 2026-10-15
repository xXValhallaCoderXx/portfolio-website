import test from 'node:test';
import assert from 'node:assert/strict';
import { CATCH, createReferencePilot } from './pilots.js';
import { ROLL, pitchPeak } from './flight.js';
import { RUN, createRunWorld, startRun, stepRun } from './run-step.js';
import { CLOUD_STRIKE, createCloudbaseRun } from './cloudbase-state.js';
import { createMeet } from './meet-state.js';
import { createBells } from './bells.js';

// Catching the wing (SIM_VERSION 4): every reference pilot catches a surging wing with the brake and
// pumps a fold open, as the hints tell a player to (pilots.js CATCH), and one told not to shows what
// that is worth. Kept apart from good-lift.test.js, the suite's longest file, so the two fly side by side.

const firstSkies = (count) => Array.from({ length: count }, (_, i) => i + 1);
const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;

// A whole run with the kettlebells and the meet, flown by the reference pilot with `options`,
// watching every surge that wants catching (from the step it sets in, heading for a peak more than
// CATCH.surge ahead, to the step it swings back: the steps until the brake came on for it, if it
// did, and whether it tucked) and every fold (its steps).
function flyWatched(seed, options) {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), bells: createBells(), meet: createMeet() }), seed);
  const pilot = createReferencePilot(options);
  const intent = { turn: 0, brake: false, bar: false };
  const surges = [];
  const folds = [];
  let surge = null;
  let banked = 0;
  let folded = 0;
  let reason = null;
  const { g } = world;
  while (!reason && world.sky.state.elapsed < 200) {
    const wants = g.tuck === 0 && g.pitchRate < 0 && pitchPeak(g) < -CATCH.surge && world.sky.state.pilot.collapse === 0;
    if (!surge && wants) surge = { steps: 0, braked: null, tucked: false };
    pilot.decide(world, intent);
    if (surge) {
      surge.steps += 1;
      if (surge.braked === null && pilot.catching) surge.braked = surge.steps;
    }
    const wasFolded = world.sky.state.pilot.collapse > 0;
    reason = stepRun(world, intent, RUN.step);
    banked = Math.max(banked, Math.abs(g.bank));
    if (surge && (g.tuck > 0 || g.pitchRate >= 0 || world.sky.state.pilot.collapse > 0)) {
      surge.tucked = g.tuck > 0;
      surges.push(surge);
      surge = null;
    }
    if (wasFolded) folded += 1;
    if (wasFolded && world.sky.state.pilot.collapse === 0) {
      folds.push(folded);
      folded = 0;
    }
  }
  return { peak: world.sky.state.peak, tucks: world.tucks, tips: world.tips, banked, surges, folds };
}

test('every reference pilot brakes 0.4 s into a surge that wants catching and holds it till the wing swings back, pumps a fold open twice, and one told not to never does', () => {
  // Hands up and dodging 0.6 s in, the pilot that meets the most surges: its own brake never
  // holds one first.
  const lead = Math.round(CATCH.react / RUN.step);
  const pumped = Math.round((CLOUD_STRIKE.collapse - CLOUD_STRIKE.pump.most * CLOUD_STRIKE.pump.cut) / RUN.step);
  const left = Math.round(CLOUD_STRIKE.collapse / RUN.step);
  let caught = 0;
  let missed = 0;
  let folds = 0;
  for (const seed of firstSkies(6)) {
    const catching = flyWatched(seed, { react: 0.6 });
    const not = flyWatched(seed, { react: 0.6, catches: false });
    for (const surge of catching.surges) {
      assert.equal(surge.tucked, false, `seed ${seed}`);
      // One the wing turns back from by itself within the reaction is never braked.
      if (surge.steps > lead + 1) assert.equal(surge.braked, lead + 1, `seed ${seed}: braked on the step after the reaction`);
      if (surge.braked !== null) caught += 1;
    }
    // A fold's clock runs down in steps that do not sum to it exactly, so it may close a step late.
    for (const steps of catching.folds) assert.ok(Math.abs(steps - pumped) <= 1, `seed ${seed}: a fold pumped open twice lasted ${steps} steps`);
    for (const surge of not.surges) assert.equal(surge.braked, null, `seed ${seed}`);
    for (const steps of not.folds) assert.ok(Math.abs(steps - left) <= 1, `seed ${seed}: a fold left alone lasted ${steps} steps`);
    assert.equal(catching.tucks, 0);
    // Dodging and circling as they do, no pilot ever swings near enough the limit to tip a wingtip.
    for (const run of [catching, not]) {
      assert.equal(run.tips, 0, `seed ${seed}`);
      assert.ok(run.banked < ROLL.limit - 10 * Math.PI / 180, `seed ${seed}: banked ${(run.banked * 180 / Math.PI).toFixed(1)}°`);
    }
    missed += not.tucks;
    folds += catching.folds.length + not.folds.length;
  }
  assert.ok(caught >= 5 && missed >= 5 && folds >= 10, `${caught} surges caught, ${missed} tucks left uncaught, ${folds} folds`);
});

test('a pilot who never catches its wing tucks a couple of times a run and climbs lower than the same pilot catching', () => {
  // Circling hands up and dodging 0.6 s in, on these sixteen skies under SIM_VERSION 4: never
  // catching, 1.8 tucks a run and a mean peak of 907 m against the catching pilot's 992 m and no
  // tucks; over seeds 1 to 40 and 1001 to 1040, 1.6 / 1.6 tucks a run, a mean peak 50 / 80 m lower,
  // and 12 / 11 runs past 1,000 m against 17 / 18.
  const catching = firstSkies(16).map((seed) => flyWatched(seed, { react: 0.6 }));
  const not = firstSkies(16).map((seed) => flyWatched(seed, { react: 0.6, catches: false }));
  const tucks = mean(not.map((run) => run.tucks));
  assert.ok(tucks >= 1, `${tucks.toFixed(2)} tucks a run`);
  assert.equal(mean(catching.map((run) => run.tucks)), 0);
  const lower = mean(catching.map((run) => run.peak)) - mean(not.map((run) => run.peak));
  assert.ok(lower > 15, `never catching peaked ${lower.toFixed(0)} m lower`);
});
