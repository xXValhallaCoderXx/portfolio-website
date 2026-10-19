import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { BELTS, beltFor, emptyProgress, normalizeProgress } from './achievements.ts';
import { readProgress, writeProgress } from '../../adapters/browser/flight-progress.service.ts';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

const storageWith = (value: string|null) => {
  let stored = value;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: unknown) => { assert.equal(key, 'fjord-glider-v1'); return stored; },
    setItem: (key: unknown, next: string) => { assert.equal(key, 'fjord-glider-v1'); stored = next; },
  } });
};

test('old progress gains independent defaults without losing earned progress', () => {
  storageWith(JSON.stringify({ unlocked: ['airborne', 'reserve'], visited: ['about'], stones: [0, 2] }));
  assert.deepEqual(readProgress(), { ...emptyProgress(), unlocked: ['airborne', 'reserve'], visited: ['about'], stones: [0, 2] });
  const first = emptyProgress();
  first.cloudbase.bestAltitude = 999;
  first.landingBests.about = 1;
  assert.deepEqual(emptyProgress().cloudbase, { discovered: false, bestAltitude: 0 });
  assert.deepEqual(emptyProgress().landingBests, {});
});

test('malformed data drops unknown entries, duplicates and invalid bests', () => {
  assert.deepEqual(normalizeProgress({
    unlocked: ['bullseye', 'bullseye', 'unknown', null],
    visited: ['about', 'about', 'cloudbase'], stones: [0, '1', -1, 1.5, 0, 2],
    landingBests: { about: 0, experience: -1, projects: '1', contact: Infinity, unknown: 2 },
    cloudbase: { discovered: 'yes', bestAltitude: NaN },
  }), { ...emptyProgress(), unlocked: ['bullseye'], visited: ['about'], stones: [0, 2], landingBests: { about: 0 } });
  for (const invalid of [null, [], 'string', 10]) assert.deepEqual(normalizeProgress(invalid), emptyProgress());
  storageWith('{broken');
  assert.deepEqual(readProgress(), emptyProgress());
});

test('new progress round trips and blocked storage preserves session progress', () => {
  storageWith(null);
  const progress = { ...emptyProgress(), landingBests: { about: 0.4 }, cloudbase: { discovered: true, bestAltitude: 1032 } };
  writeProgress(progress);
  assert.deepEqual(readProgress(), progress);
  storageWith('{broken');
  assert.deepEqual(readProgress(), emptyProgress());
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  progress.cloudbase.bestAltitude = 1540;
  writeProgress(progress);
  progress.cloudbase.bestAltitude = 0;
  assert.equal(readProgress().cloudbase.bestAltitude, 1540);
});

test('additional achievements preserve the established belt cap', () => {
  assert.equal(beltFor(emptyProgress()), BELTS[0]);
  assert.equal(beltFor({ unlocked: Array(14).fill('earned') }), BELTS.at(-1));
});
