import assert from 'node:assert/strict';
import test from 'node:test';
import { nextSession } from './set-demo.service.ts';
import { altitudeAt, clock } from './flight-demo.service.ts';
import { SCRIPT, stateAt } from './hird-demo.service.ts';

test('sample strength progression distinguishes missed reps and exertion', () => {
  assert.equal(nextSession(4, 6).change, -2.5);
  assert.equal(nextSession(5, 9).change, -2.5);
  assert.equal(nextSession(5, 8).change, 0);
  assert.equal(nextSession(5, 7).change, 2.5);
  assert.equal(nextSession(5, 6).change, 5);
});

test('sample track keeps its launch, thermal peaks and finish', () => {
  assert.equal(altitudeAt(0), 640);
  assert.equal(altitudeAt(0.3), 1180);
  assert.equal(altitudeAt(1), 120);
  assert.equal(clock(840), '14:00');
});

test('swarm replay samples are independent snapshots and expose the final report', () => {
  const initial = stateAt(0);
  const running = stateAt(1);
  const finished = stateAt(SCRIPT.length);
  assert.deepEqual(initial, { seats: {}, report: false, spend: 0 });
  assert.equal(running.seats.a, 'running');
  assert.equal(finished.report, true);
  assert.equal(finished.spend, 0.21);
  running.seats.a = 'waiting';
  assert.equal(stateAt(1).seats.a, 'running');
});
