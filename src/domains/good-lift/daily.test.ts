import { randomSeed } from '../../adapters/browser/random-seed.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSky, seedFor, skyId } from './daily.ts';
import { DAILY_EPOCH, DAY_MS, readGameAddress } from './good-lift-address.ts';
import { SIM_VERSION } from './sim-version.ts';

const at = (pathname: string, search = '', hash = '') => readGameAddress({ pathname, search, hash });

test('a day\'s sky is the same all day, everywhere, and changes at midnight UTC', () => {
  const midnight = (DAILY_EPOCH + 3) * DAY_MS;
  const day = resolveSky(at('/good-lift/daily'), midnight);
  for (const now of [midnight + 1, midnight + DAY_MS / 2, midnight + DAY_MS - 1]) assert.deepEqual(resolveSky(at('/good-lift/daily'), now), day);
  assert.notEqual(resolveSky(at('/good-lift/daily'), midnight - 1).seed, day.seed);
  assert.notEqual(resolveSky(at('/good-lift/daily'), midnight + DAY_MS).seed, day.seed);
  assert.deepEqual(day, { kind: 'daily', seed: seedFor(DAILY_EPOCH + 3), day: DAILY_EPOCH + 3 });
});

test('seeds are pinned for each day and version of the rules, and a new version is a new sky', () => {
  // Computed once in Node: a browser computes the same, with nothing but 32-bit integer maths.
  assert.equal(skyId(seedFor(20740, 0)), 'c9da7355');
  assert.equal(skyId(seedFor(20741, 0)), 'ed2d4393');
  assert.equal(skyId(seedFor(20740, 1)), 'a5a8651b');
  assert.equal(skyId(seedFor(20756, 1)), '6785502f');
  assert.equal(seedFor(DAILY_EPOCH), seedFor(DAILY_EPOCH, SIM_VERSION));
  const seen = new Set();
  for (let day = DAILY_EPOCH; day < DAILY_EPOCH + 400; day++) for (const version of [0, 1, 2]) seen.add(seedFor(day, version));
  assert.equal(seen.size, 1200, 'no two days or versions share a sky');
});

test('every address resolves to one sky: the day\'s, a practice sky drawn afresh, or the one it names', () => {
  const now = (DAILY_EPOCH + 9) * DAY_MS + 5000;
  let draws = 0;
  const random = () => [0x1234abcd, 0xfedc0001][draws++];
  assert.deepEqual(resolveSky(at('/good-lift'), now, random), { kind: 'practice', seed: 0x1234abcd, day: 0 });
  assert.deepEqual(resolveSky(at('/good-lift'), now, random), { kind: 'practice', seed: 0xfedc0001, day: 0 }, 'a new sky every run');
  assert.deepEqual(resolveSky(at('/good-lift/daily', '?sky=00c0ffee'), now), { kind: 'sky', seed: 0xc0ffee, day: 0 });
  // A sky that cannot be read, a challenge not yet read and no address at all are the day's.
  for (const address of [at('/good-lift', '?sky=nope'), at('/good-lift/daily', '', '#vs=AQ'), null]) {
    assert.deepEqual(resolveSky(address, now), { kind: 'daily', seed: seedFor(DAILY_EPOCH + 9), day: DAILY_EPOCH + 9 });
  }
  assert.equal(skyId(0xbeef), '0000beef');
});

test('a practice seed is a whole 32-bit number, and rarely the same twice', () => {
  const seeds = new Set(Array.from({ length: 64 }, randomSeed));
  for (const seed of seeds) assert.ok(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32);
  assert.ok(seeds.size > 60);
});
