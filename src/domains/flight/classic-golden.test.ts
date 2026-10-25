import test from 'node:test';
import assert from 'node:assert/strict';
import { classicScript, flyScript } from '../../test/helpers/flight-lab.ts';

// The classic wing, which the fjord, the hero and Training fly, flown through every regime it has
// (both control modes, still and moving air, turns, a spiral, a full stall into backfly and an
// uncaught exit, deep brake, bar, ears, wingovers and loops) and digested every half second. Other
// wings may be added beside it, but this one must keep flying bit for bit as it did when this was
// pinned (before the solver read its tables per wing).
const CLASSIC_DIGEST = '263176a698c90ba9';

test('the classic wing flies exactly as pinned through every regime it has', () => {
  const { hash, steps, g } = flyScript(classicScript());
  assert.equal(steps, 7830);
  assert.equal(g.loops, 1);
  assert.equal(hash, CLASSIC_DIGEST,
    `The classic wing no longer flies as pinned (it now digests to ${hash}). The fjord, the hero and Training ` +
    'fly it, and the classic wing must stay bit-identical: put the arithmetic back rather than re-pin this.');
});
