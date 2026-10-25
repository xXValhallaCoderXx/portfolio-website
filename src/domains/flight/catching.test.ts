import type { FlightInput } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReferencePilot } from '../good-lift/pilots.ts';
import { RUN, createRunWorld, startRun, stepRun } from '../good-lift/run-step.ts';
import { CLOUD_LAUNCH, CLOUD_STRIKE, createCloudbaseRun } from '../good-lift/cloudbase-state.ts';

// Test deliberate recovery inputs, not a population of synthetic surges from the old oscillator. The
// scripted fold and its pumps are a wing's whose halves never fold by themselves: the classic wing's
// (a glider's half folds where it is struck, and is flown out: recovery-runs.test.js).
function recover(catches: boolean, seed: number) {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun({ hazards: false, wind: false }), wing: 'classic' }), seed);
  world.g.pos.x = CLOUD_LAUNCH.x; world.g.pos.z = CLOUD_LAUNCH.z; world.g.pos.y = 500;
  world.sky.state.thermals.forEach((t: { live: boolean; strength: number; }) => { t.live = false; t.strength = 0; });
  world.sky.strike();
  const pilot = createReferencePilot({ catches }), intent: FlightInput = { turn: 0, brake: false, bar: false, ears: false };
  let steps = 0, lowest = 500;
  while (world.sky.state.pilot.collapse > 0 && steps < 300) {
    pilot.decide(world, intent);
    assert.equal(stepRun(world, intent), null);
    lowest = Math.min(lowest, world.g.pos.y); steps++;
  }
  return { world, steps, lowest };
}
test('a reference pilot pumps a deliberate bird collapse open twice and saves height', () => {
  for (const seed of [1, 7, 19]) {
    const pumped = recover(true, seed), left = recover(false, seed);
    const expected = (CLOUD_STRIKE.collapse - CLOUD_STRIKE.pump.most * CLOUD_STRIKE.pump.cut) / RUN.step;
    assert.ok(Math.abs(pumped.steps - expected) <= 1);
    assert.equal(pumped.world.pump.n, 2);
    assert.ok(Math.abs(left.steps - CLOUD_STRIKE.collapse / RUN.step) <= 1);
    assert.equal(left.world.pump.n, 0);
    assert.ok(pumped.lowest > left.lowest + 2, 'timed recovery saves real altitude');
    assert.equal(pumped.world.sky.state.pilot.collapse, 0);
    assert.ok(pumped.world.g.speed > 0 && Number.isFinite(pumped.world.g.pos.y));
  }
});
test('short brake taps and holding the brake through a fold do not count as reopening pumps', () => {
  for (const mode of ['short', 'held'] as const) {
    const world = startRun(createRunWorld({ sky: createCloudbaseRun({ hazards: false, wind: false }), wing: 'classic' }), 3);
    world.g.pos.y = 500; world.sky.strike();
    let steps = 0;
    while (world.sky.state.pilot.collapse > 0 && steps < 300) {
      const brake = mode === 'held' || steps % 10 < 2;
      stepRun(world, { turn: 0, brake, bar: false, ears: false }); steps++;
    }
    assert.equal(world.pump.n, 0);
    assert.ok(Math.abs(steps - CLOUD_STRIKE.collapse / RUN.step) <= 1);
  }
});
