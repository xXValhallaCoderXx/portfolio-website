import test from 'node:test';
import assert from 'node:assert/strict';
import { guidedOpening, guidedRecovery } from './test-guided-opening.js';

for (const delay of [0.3, 0.6, 1]) test(`visible opening instructions across 32 seeded skies, ${delay}s reactions`, t => {
  const runs = Array.from({ length: 32 }, (_, i) => guidedOpening(i + 1, delay));
  const passed = runs.filter(run => run.height >= 450 && run.seconds <= 180 + 1 / 60 && !run.assisted && !run.reason);
  assert.ok(passed.length >= 29, `${passed.length}/32: ${JSON.stringify(runs.filter(run => !passed.includes(run)))}`);
  for (const run of passed) {
    assert.ok(run.minimumClearance >= 30, `sky ${run.seed}: ${run.minimumClearance}m clearance`);
    assert.ok(run.shown > 600, 'the pilot actually follows visible directions through the climb');
    assert.ok(run.firstThermal >= 3, 'THERMALLING never appears before the physical qualification');
  }
  t.diagnostic(JSON.stringify({ delay, passed: passed.length, fastest: Math.min(...passed.map(run => run.seconds)),
    slowest: Math.max(...passed.map(run => run.seconds)), minimumClearance: Math.min(...passed.map(run => run.minimumClearance)) }));
});

for (const height of [150, 250, 350]) test(`real flight leaves lift at ${height}m and loses 20m before following recovery guidance`, t => {
  const runs = [{ seed: 1, delay: 0.6 }, { seed: 2, delay: 0.3 }].map(({ seed, delay }) => guidedRecovery(seed, delay, height));
  for (const run of runs) {
    assert.ok(run.departure.height >= height && run.departure.height < height + 1, 'the actual climb supplies the starting height');
    assert.ok(run.lost >= 20 && run.lost < 21, `deliberate departure must really lose height: ${JSON.stringify(run)}`);
    assert.equal(run.ended, null); assert.equal(run.assisted, false);
    assert.ok(run.climbedFor >= 1 && run.seconds <= 45 && run.shown > 0, JSON.stringify(run));
    assert.ok(run.minimumClearance >= 30, JSON.stringify(run));
  }
  t.diagnostic(JSON.stringify(runs));
});
