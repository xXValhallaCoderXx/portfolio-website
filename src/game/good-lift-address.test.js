import test from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_EPOCH, DAY_MS, dailyNumber, dayOf, gameHref, readGameAddress, sameGame } from './good-lift-address.js';

const at = (pathname, search = '', hash = '') => readGameAddress({ pathname, search, hash });

test('only the game\'s own addresses are the game\'s, and any other under /good-lift/ is missing', () => {
  for (const path of ['/good-lift', '/good-lift/', '/good-lift/daily', '/good-lift/daily/']) assert.ok(at(path), path);
  for (const path of ['/', '/fly', '/good-lift/x', '/good-lift/daily/x', '/good-liftx', '/goodlift', '/projects/good-lift', '']) {
    assert.equal(at(path), null, path);
  }
});

test('each address asks for one sky: the day\'s, practice, a named one or a challenge', () => {
  assert.deepEqual(at('/good-lift/daily'), { kind: 'daily', sky: null, vs: null, bad: null });
  assert.deepEqual(at('/good-lift'), { kind: 'practice', sky: null, vs: null, bad: null });
  assert.deepEqual(at('/good-lift', '?sky=6785502f'), { kind: 'sky', sky: 0x6785502f, vs: null, bad: null });
  assert.deepEqual(at('/good-lift/daily', '?sky=FFFFFFFF'), { kind: 'sky', sky: 0xffffffff, vs: null, bad: null });
  assert.deepEqual(at('/good-lift/daily', '', '#vs=AQGv-_x9'), { kind: 'vs', sky: null, vs: 'AQGv-_x9', bad: null });
  // A challenge flies the log's own sky, whatever else the address names.
  assert.equal(at('/good-lift', '?sky=12', '#vs=AQ').kind, 'vs');
  assert.equal(at('/good-lift', '', '#vs=').kind, 'practice', 'an empty challenge is no challenge');
});

test('a sky that cannot be read falls back to the day\'s, and says why', () => {
  for (const sky of ['zz', '123456789', '-1', '', '0x12']) {
    assert.deepEqual(at('/good-lift', `?sky=${sky}`), { kind: 'daily', sky: null, vs: null, bad: 'sky' }, sky);
  }
});

test('the day changes at midnight UTC and nowhere else, and Daily #1 is the epoch', () => {
  const midnight = DAILY_EPOCH * DAY_MS;
  assert.equal(dayOf(midnight), DAILY_EPOCH);
  assert.equal(dayOf(midnight - 1), DAILY_EPOCH - 1);
  assert.equal(dayOf(midnight + DAY_MS - 1), DAILY_EPOCH);
  assert.equal(dayOf(midnight + DAY_MS), DAILY_EPOCH + 1);
  assert.equal(dayOf(Date.UTC(2026, 9, 14, 23, 59)), DAILY_EPOCH);
  assert.equal(dailyNumber(DAILY_EPOCH), 1);
  assert.equal(dailyNumber(DAILY_EPOCH + 11), 12);
});

test('a written address reads back as the same sky', () => {
  for (const address of [
    { kind: 'daily', sky: null, vs: null, bad: null },
    { kind: 'practice', sky: null, vs: null, bad: null },
    { kind: 'sky', sky: 0x0000beef, vs: null, bad: null },
    { kind: 'vs', sky: null, vs: 'AQGv-_x9', bad: null },
  ]) {
    const url = new URL(gameHref(address), 'https://example.test');
    const read = readGameAddress(url);
    assert.deepEqual(read, address, gameHref(address));
    assert.ok(sameGame(read, address));
  }
  assert.equal(gameHref({ kind: 'sky', sky: 0xbeef }), '/good-lift?sky=0000beef');
  assert.ok(!sameGame(at('/good-lift'), at('/good-lift/daily')));
  assert.ok(!sameGame(at('/good-lift', '?sky=1'), at('/good-lift', '?sky=2')), 'another named sky is another game');
  assert.ok(!sameGame(at('/good-lift/daily', '', '#vs=AQ'), at('/good-lift/daily', '', '#vs=AR')), 'and another challenge');
  assert.ok(!sameGame(null, at('/good-lift')));
});

test('the address reader imports nothing, so it can sit in the page\'s own bundle', async () => {
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(new URL('./good-lift-address.js', import.meta.url), 'utf8');
  assert.doesNotMatch(text, /^\s*(import|export\s[^;]*\sfrom)\s/m);
});
