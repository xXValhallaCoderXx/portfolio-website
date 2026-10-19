import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudbaseRun } from './cloudbase-state.ts';
import { settleFlight } from '../flight/flight.ts';
import { createMeet } from './meet-state.ts';
import { RUN, TRACE, createRunWorld, finishRun, startRun, stepBits } from './run-step.ts';
import { RUN_RULES, isJudgedEnding } from './run-rules.ts';
import { summariseRun } from './meet-sheet.ts';

// Uniform rising air isolates the deadline from weather balance and pilot skill. The real wing,
// scoring and fixed-step controller still run for all 36,000 steps.
function soaringWorld() {
  const sky = createCloudbaseRun({ hazards: false, wind: false });
  const world = startRun(createRunWorld({ sky, meet: createMeet() }), 1);
  sky.inside = () => true;
  sky.sample = (pos, yaw, out) => Object.assign(out!, { lift: 5, sink: 0, liftSide: 0, windX: 0, windY: 5, windZ: 0, hazardSink: 0, rough: 0 });
  sky.step = (dt, pos) => {
    sky.state.elapsed += dt;
    sky.state.peak = Math.max(sky.state.peak, pos.y);
    return null;
  };
  world.g.pos.y = 2000;
  settleFlight(world.g);
  return world;
}

test('a soaring run ends on step 36000, keeps every second, and judges the final bar once', () => {
  const world = soaringWorld();
  let ending = null;
  for (let i = 1; i <= RUN_RULES.maxSteps; i++) {
    ending = stepBits(world, 0);
    if (i < RUN_RULES.maxSteps) assert.equal(ending, null, `step ${i}`);
  }
  assert.equal(ending, 'time');
  assert.equal(world.steps, 36_000);
  assert.equal(world.trace.n, 601);
  assert.equal(world.trace.alt.length, TRACE.length);
  assert.ok(Math.abs(world.sky.state.elapsed - 600) < 1e-8);
  world.meet!.state.bar = 15;
  const before = world.meet!.state.total;
  finishRun(world, ending);
  const sheet = summariseRun(world, ending);
  assert.equal(sheet.reason, 'time');
  assert.equal(sheet.total, before + 40);
  assert.equal(sheet.lifts.at(-1)!.line, 0);
  assert.equal(sheet.trace.n, 601);
  finishRun(world, ending);
  assert.equal(world.meet!.state.total, sheet.total);
  assert.equal(stepBits(world, 0), 'time');
  assert.equal(world.steps, RUN.maxSteps);
});

test('a natural fog ending on the last step takes precedence over the time limit', () => {
  const world = soaringWorld();
  world.steps = RUN.maxSteps - 1;
  world.sky.step = () => 'fog';
  assert.equal(stepBits(world, 0), 'fog');
  assert.equal(world.steps, RUN.maxSteps);
});

test('only natural endings and a completed time limit are judged', () => {
  for (const reason of ['fog', 'landed', 'time']) assert.equal(isJudgedEnding(reason), true);
  for (const reason of ['quit', 'travel', '', undefined, null]) assert.equal(isJudgedEnding(reason), false);
});
