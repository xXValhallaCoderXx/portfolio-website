import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSkyPreparation } from './sky-preparation.ts';
import type { GameAddress } from '../../../domains/good-lift/good-lift-address.ts';
import type { ResolvedSky } from '../../good-lift/good-lift.models.ts';

const daily: GameAddress = { kind: 'daily', sky: null, vs: null, bad: null };
const practice: GameAddress = { ...daily, kind: 'practice' };
const sky: ResolvedSky = { kind: 'daily', seed: 42, day: 20_750 };
function deferred() {
  let resolve!: (sky: ResolvedSky) => void, reject!: (reason: Error) => void;
  const promise = new Promise<ResolvedSky>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('a ready sky is prepared once and consumed only once by an explicit start', async () => {
  const pending = deferred(); let loads = 0;
  const launch = createSkyPreparation(() => { loads++; return pending.promise; });
  const ready = launch.prepare(daily);
  assert.equal(launch.prepare({ ...daily }), ready);
  assert.equal(launch.consume(), null);
  pending.resolve(sky);
  assert.equal(await ready, sky);
  assert.equal(loads, 1);
  assert.equal(launch.consume({ ...sky }), null, 'a stale caller cannot start the current sky');
  assert.deepEqual(launch.consume(sky), { address: daily, sky });
  assert.equal(launch.consume(), null, 'double activation cannot restart the run');
});

test('exit cancels loading and a late completion cannot authorize a run', async () => {
  const pending = deferred();
  const launch = createSkyPreparation(() => pending.promise);
  const ready = launch.prepare(daily);
  launch.cancel(); pending.resolve(sky);
  assert.equal(await ready, null);
  assert.equal(launch.consume(), null);
});

test('exit during module loading skips later challenge verification', async () => {
  const module = deferred(); let verifications = 0;
  const launch = createSkyPreparation(async (_address, isCurrent) => {
    await module.promise;
    if (!isCurrent()) return null;
    verifications++;
    return sky;
  });
  const ready = launch.prepare(daily);
  launch.cancel(); module.resolve(sky);
  assert.equal(await ready, null);
  assert.equal(verifications, 0);
  assert.equal(launch.consume(), null);
});

test('changing addresses discards an older challenge response', async () => {
  const first = deferred(), next = deferred();
  const launch = createSkyPreparation(address => address.kind === 'daily' ? first.promise : next.promise);
  const old = launch.prepare(daily), active = launch.prepare(practice);
  first.resolve(sky);
  assert.equal(await old, null);
  const fresh = { ...sky, kind: 'practice', seed: 7 };
  next.resolve(fresh); await active;
  assert.deepEqual(launch.consume(), { address: practice, sky: fresh });
});

test('a failed load can be retried', async () => {
  const first = deferred(), next = deferred(); let loads = 0;
  const launch = createSkyPreparation(() => (++loads === 1 ? first.promise : next.promise));
  const failed = launch.prepare(daily);
  first.reject(new Error('offline'));
  await assert.rejects(failed, /offline/);
  const retry = launch.prepare(daily); next.resolve(sky);
  assert.equal(await retry, sky);
  assert.ok(launch.consume());
});
