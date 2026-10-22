import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisibleDirectPilot } from '../../test/helpers/test-direct-opening.ts';

// These pilots follow the actual visible requests with the same quantized independent
// brakes as touch/keyboard. The weather, terrain, safety checks and hazards stay live.
for (const seed of [1, 2, 3]) for (const delay of [0.3, 0.6]) {
  test(`visible direct opening reaches first acro height, seed ${seed}, ${delay}s reactions`, () => {
    const pilot = createVisibleDirectPilot(seed, delay);
    const { world, stats } = pilot;
    while (world.sky.state.elapsed < 220 && stats.reached[500] === undefined && !stats.assisted)
      if (pilot.step()) break;

    const detail = JSON.stringify({ height: world.g.pos.y, seconds: world.sky.state.elapsed,
      reached: stats.reached, reason: world.ended, assisted: stats.assisted });
    assert.ok(stats.reached[450] !== undefined && stats.reached[450] <= 180, detail);
    assert.ok(stats.reached[500] !== undefined && stats.reached[500] <= 220, detail);
    assert.equal(stats.assisted, false, detail);
    assert.equal(world.stalls, 0, detail);
    assert.equal(world.tucks, 0, detail);
    assert.equal(world.sky.state.pilot.strikes, 0, detail);
    assert.ok(stats.minimumClearance >= 35, `clearance ${stats.minimumClearance}: ${detail}`);
    assert.ok(stats.firstThermal !== null, 'the observer must qualify actual thermalling');
    assert.ok(stats.followed > 0, 'every selected pair satisfies its visible instruction');
    assert.equal(pilot.input.controlMode, 'brakes');
  });
}
