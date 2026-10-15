import test from 'node:test';
import assert from 'node:assert/strict';
import { TST, createReferencePilot } from './pilots.js';
import { RUN, createRunWorld, finishRun, startRun, stepRun } from './run-step.js';
import { createCloudbaseRun } from './cloudbase-state.js';
import { createMeet } from './meet-state.js';
import { createBells } from './bells.js';

// Big ears in a whole run (SIM_VERSION 4): the way down out of lift, and no new answer to a
// kettlebell. Kept apart from good-lift.test.js, the suite's longest file, so the two fly side by side.

const firstSkies = (count) => Array.from({ length: count }, (_, i) => i + 1);
const sum = (values) => values.reduce((total, value) => total + value, 0);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

// TST, but pulling the ears wherever it would push the bar to dodge a bell thrown at it circling:
// the change a player might reach for once the ears are known.
function earsDodger() {
  const pilot = createReferencePilot(TST);
  return {
    decide(world, intent) {
      pilot.decide(world, intent);
      intent.ears = false;
      if (world.bells.state.warning >= 0 && intent.bar) {
        intent.bar = false;
        intent.brake = false;
        intent.ears = true;
      }
      return intent;
    },
  };
}

function flyMeet(seed, pilot) {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), bells: createBells(), meet: createMeet() }), seed);
  const intent = { turn: 0, brake: false, bar: false, ears: false };
  let reason = null;
  while (!reason && world.sky.state.elapsed < 200) reason = stepRun(world, pilot.decide(world, intent), RUN.step);
  if (reason) finishRun(world, reason);
  return { total: world.meet.state.total, thrown: world.bells.state.thrown, hits: world.bells.state.hits };
}

test('pulled instead of the bar when a kettlebell comes, the ears dodge far fewer bells than the bar and bank less', () => {
  // On these sixteen skies: 14 of 57 bells hit the pilot pulling its ears, none of 69 TST on the
  // bar, for medians of 255 kg against 280 kg; on 1001 to 1040, 47 of 155 against 1 of 171, and 220
  // against 240 kg. Slower and turning wider, the ears move the wing off its line, but not far: the
  // bell is aimed where the held controls take it, and the bar's 4.5 m/s more is what gets clear.
  const bar = firstSkies(16).map((seed) => flyMeet(seed, createReferencePilot(TST)));
  const ears = firstSkies(16).map((seed) => flyMeet(seed, earsDodger()));
  const share = (runs) => sum(runs.map((run) => run.hits)) / sum(runs.map((run) => run.thrown));
  assert.ok(share(bar) <= 0.05, `${(share(bar) * 100).toFixed(1)}% of bells hit the bar`);
  assert.ok(share(ears) >= 0.15, `${(share(ears) * 100).toFixed(1)}% of bells hit the ears`);
  assert.ok(median(ears.map((run) => run.total)) < median(bar.map((run) => run.total)));
});
