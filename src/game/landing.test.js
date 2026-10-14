import assert from 'node:assert/strict';
import test from 'node:test';
import { createLandingLeg, scoreLanding } from './landing.js';

test('grades landing accuracy at the inclusive distance boundaries', () => {
  assert.equal(scoreLanding({ distance: 1, radius: 24, sinkRate: 2 }).grade, 'bullseye');
  assert.equal(scoreLanding({ distance: 1.01, radius: 24, sinkRate: 2 }).grade, 'good');
  assert.equal(scoreLanding({ distance: 6, radius: 24, sinkRate: 2 }).grade, 'good');
  assert.equal(scoreLanding({ distance: 6.01, radius: 24, sinkRate: 2 }).grade, 'on the ring');
});

test('softness adds at most five points without changing accuracy or grade', () => {
  const soft = scoreLanding({ distance: 0, radius: 24, sinkRate: 2 });
  const dive = scoreLanding({ distance: 0, radius: 24, sinkRate: 5 });
  assert.deepEqual(soft, { distance: 0, grade: 'bullseye', points: 100 });
  assert.deepEqual(dive, { distance: 0, grade: 'bullseye', points: 95 });
  assert.equal(scoreLanding({ distance: 0, radius: 24, sinkRate: 3.5 }).points, 98);
  assert.equal(scoreLanding({ distance: 24, radius: 24, sinkRate: 5 }).points, 0);
  assert.equal(scoreLanding({ distance: 12, radius: 24, sinkRate: 5 }).points, 48);
});

test('invalid measurements cannot produce NaN progress', () => {
  for (const measurement of [{ distance: NaN, radius: 24, sinkRate: 2 }, { distance: 1, radius: 0, sinkRate: 2 }]) {
    assert.throws(() => scoreLanding(measurement), RangeError);
  }
});

test('assistance remains attached to a flight leg until a fresh manual launch', () => {
  const leg = createLandingLeg();
  assert.equal(leg.eligible, false);
  leg.begin();
  assert.equal(leg.eligible, true);
  leg.assist();
  assert.equal(leg.eligible, false);
  // Steering takeover changes no eligibility state; only begin starts another leg.
  assert.equal(leg.eligible, false);
  leg.begin(true);
  assert.equal(leg.eligible, false);
  leg.begin(false);
  assert.equal(leg.eligible, true);
});
