import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
// The page's own copy of the key, which its reset clears without loading this module.
import { GAME_STORE as RESET_KEY } from './achievements.js';
import { addRow, boardKey, emptyBoard, rowsFor } from './board.js';
import { DAY_MS } from './good-lift-address.js';
import {
  FEAT_IDS, GAME_STORE, KIT, TRAINING_BLOCK, clearStore, earnFeats, earnedKit, emptyStore, keepEarned, kitAfterRun, kitSheet, newlyEarned,
  normalizeStore, readStore, recordRun, setInitials, updateStore, writeStore,
} from './good-lift-store.js';
import { BLOCKED } from './meet-initials.js';
import { LIVERIES } from './livery.js';
import { WINGS, emptyKit } from './wing-kit.js';

const DAY = 20_756;
const NOON = DAY * DAY_MS + DAY_MS / 2;
const KEY = boardKey(1, DAY);
const AT = { version: 1, now: NOON };

// A finished run: today's Daily Sky, judged by the fog, unless told otherwise.
const run = (fields = {}) => ({
  kind: 'daily', day: DAY, total: 100, peak: 600, red: [0, 0, 1], at: NOON - 120_000, log: 'AQ', reason: 'fog', feats: [], ...fields,
});
const placed = ({ feats, rank, best }) => ({ feats, rank, best });

// A storage that keeps what it is given, as the page's localStorage does, and notes every key it is asked for.
function memoryStorage(entries = {}) {
  const items = new Map(Object.entries(entries));
  const keys = [];
  return {
    items,
    keys,
    getItem: (key) => (keys.push(key), items.has(key) ? items.get(key) : null),
    setItem: (key, value) => { keys.push(key); items.set(key, String(value)); },
    removeItem: (key) => { keys.push(key); items.delete(key); },
  };
}

// Site data blocked: merely reading localStorage throws.
const blockStorage = () => Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
// The module keeps the visit's copy from test to test, so each starts from nothing.
beforeEach(() => clearStore(memoryStorage()));
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else delete globalThis.localStorage;
});

test('a fresh or damaged store reads as empty, and a good one round-trips', () => {
  assert.deepEqual(emptyStore(), { v: 1, best: { total: 0, peak: 0, score: 0 }, tonnage: 0, runs: 0, feats: [], daily: { last: 0, streak: 0 }, initials: '', optIn: false, board: { days: {} }, bots: null });
  assert.deepEqual(readStore(memoryStorage()), emptyStore());
  for (const text of ['{broken', 'null', '[]', '"store"', '42', JSON.stringify({ best: 'high' })]) {
    assert.deepEqual(readStore(memoryStorage({ [GAME_STORE]: text })), emptyStore(), text);
  }

  const storage = memoryStorage();
  const store = { ...emptyStore(), best: { total: 512.5, peak: 1412, score: 646 }, tonnage: 1240, runs: 7, feats: ['opener', 'clean-meet'], daily: { last: DAY, streak: 3 }, initials: 'REN' };
  addRow(store.board, KEY, { who: 'REN', via: 'me', total: 512.5, style: 260, peak: 1412, red: [0, 2, 4], at: NOON, log: 'AQGv-_x9' });
  addRow(store.board, KEY, { who: 'TOR', via: 'link', total: 487.5, style: 0, peak: 1301, red: [0, 0, 1], at: NOON - 1, log: 'AQGw' });
  assert.equal(writeStore(store, storage), true);
  assert.deepEqual(JSON.parse(storage.items.get(GAME_STORE)), store);
  assert.deepEqual(readStore(storage), store);
  // Stored text that can no longer be read gives back what this visit last wrote; a key removed gives nothing.
  storage.items.set(GAME_STORE, '{broken');
  assert.deepEqual(readStore(storage), store);
  storage.items.delete(GAME_STORE);
  assert.deepEqual(readStore(storage), emptyStore());

  // Each damaged part falls back on its own, and only known feats are kept, once each.
  assert.deepEqual(normalizeStore({
    v: 7, best: { total: -1, peak: 1412 }, tonnage: NaN, runs: 2.5, feats: ['opener', 'opener', 'unknown', 'beat-the-bot', 3],
    daily: { last: DAY, streak: 0 }, initials: 'ren', board: { days: { yesterday: { rows: [] } } }, unlocked: ['airborne'],
  }), { ...emptyStore(), best: { total: 0, peak: 1412, score: 0 }, feats: ['opener', 'beat-the-bot'] });
  // No best or tonnage is negative, and the run count is a whole number small enough to count up from.
  assert.deepEqual(normalizeStore({ best: { total: 512.5, peak: -1 }, tonnage: -5, runs: 2 ** 53 }), { ...emptyStore(), best: { total: 512.5, peak: 0, score: 513 } });
  // A best score is read as the bests are, and is never less than the best total's own: a store from
  // before style multiplied the total, with none kept, starts from that.
  assert.equal(normalizeStore({ best: { total: 512.5, peak: 1412, score: 646 } }).best.score, 646);
  assert.equal(normalizeStore({ best: { total: 512.5, peak: 1412 } }).best.score, 513);
  assert.equal(normalizeStore({ best: { total: 512.5, peak: 1412, score: -1 } }).best.score, 513);
  assert.equal(normalizeStore({ best: { total: 512.5, peak: 1412, score: 400 } }).best.score, 513);
  assert.equal(normalizeStore({ runs: 2 ** 53 - 1 }).runs, 2 ** 53 - 1);
  // A streak and its day stand or fall together.
  assert.deepEqual(normalizeStore({ daily: { last: 0, streak: 4 } }).daily, { last: 0, streak: 0 });
  assert.deepEqual(normalizeStore({ daily: { last: DAY + 0.5, streak: 4 } }).daily, { last: 0, streak: 0 });
  assert.deepEqual(normalizeStore({ daily: { last: DAY, streak: 4 } }).daily, { last: DAY, streak: 4 });
  for (const nonsense of [null, undefined, [], 'store', 7, true, new Proxy({}, { get() { throw new Error('no'); } })]) {
    assert.deepEqual(normalizeStore(nonsense), emptyStore());
  }
  // The store read back shares nothing with what it was read from.
  const read = normalizeStore(store);
  read.best.total = 0;
  read.feats.push('opener');
  read.board.days[KEY].rows[0].red.push(7);
  assert.deepEqual(store.best, { total: 512.5, peak: 1412, score: 646 });
  assert.deepEqual(store.feats, ['opener', 'clean-meet']);
  assert.deepEqual(store.board.days[KEY].rows[0].red, [0, 2, 4]);
});

test('blocked storage still keeps the visit\'s runs', () => {
  blockStorage();
  assert.deepEqual(readStore(), emptyStore());
  assert.equal(updateStore((store) => recordRun(store, run({ total: 150, log: 'one' }), AT)).rank, 1);
  assert.equal(updateStore((store) => recordRun(store, run({ total: 200, log: 'two' }), AT)).rank, 1);
  const store = readStore();
  assert.equal(store.runs, 2);
  assert.equal(store.tonnage, 350);
  assert.deepEqual(rowsFor(store.board, KEY).map(({ log }) => log), ['two', 'one']);
  assert.equal(writeStore(store), false, 'a write that only the visit keeps says so');
  // The visit keeps a copy of what was written, not the object it was handed.
  store.runs = 99;
  store.board.days[KEY].rows[0].red.push(7);
  assert.equal(readStore().runs, 2);
  assert.deepEqual(rowsFor(readStore().board, KEY)[0].red, [0, 0, 1]);
  // No storage at all is the same.
  assert.equal(readStore(null).runs, 2);

  // Storage that reads but refuses writes (full, or a private window with no room) keeps the visit's copy too,
  // rather than handing back what it held before.
  clearStore(memoryStorage());
  const full = memoryStorage({ [GAME_STORE]: JSON.stringify({ ...emptyStore(), runs: 40 }) });
  const setItem = full.setItem;
  full.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(readStore(full).runs, 40);
  updateStore((store) => recordRun(store, run(), AT), full);
  assert.equal(readStore(full).runs, 41);
  assert.equal(JSON.parse(full.items.get(GAME_STORE)).runs, 40);
  // Once a write lands again, storage has the last word: what another tab writes after it is what reads give.
  full.setItem = setItem;
  updateStore((store) => recordRun(store, run({ log: 'AR' }), AT), full);
  assert.equal(JSON.parse(full.items.get(GAME_STORE)).runs, 42);
  assert.equal(readStore(full).runs, 42);
  full.items.set(GAME_STORE, JSON.stringify({ ...emptyStore(), runs: 50 }));
  assert.equal(readStore(full).runs, 50);
});

test('recording a run raises the bests and the tonnage and counts it', () => {
  const store = emptyStore();
  const first = recordRun(store, run({ kind: 'practice', day: 0, total: 150, peak: 900 }), AT);
  assert.equal(first.store, store);
  assert.deepEqual(placed(first), { feats: [], rank: 0, best: false });
  assert.deepEqual([store.best, store.tonnage, store.runs], [{ total: 150, peak: 900, score: 150 }, 150, 1]);
  // Each best is raised on its own.
  recordRun(store, run({ kind: 'sky', day: 0, total: 100, peak: 1200 }), AT);
  assert.deepEqual([store.best, store.tonnage, store.runs], [{ total: 150, peak: 1200, score: 150 }, 250, 2]);
  // An empty run still counts.
  recordRun(store, run({ kind: 'vs', day: 0, total: 0, peak: 80, reason: 'landed' }), AT);
  assert.deepEqual([store.best, store.tonnage, store.runs], [{ total: 150, peak: 1200, score: 150 }, 250, 3]);
  // A number no run can bank counts as nothing, rather than spoiling the store.
  recordRun(store, run({ kind: 'practice', day: 0, total: NaN, peak: -5 }), AT);
  assert.deepEqual([store.best, store.tonnage, store.runs], [{ total: 150, peak: 1200, score: 150 }, 250, 4]);
  // Tonnage keeps adding up in whole plates.
  for (let i = 0; i < 400; i++) recordRun(store, run({ kind: 'practice', day: 0, total: 512.5, peak: 1000 }), AT);
  assert.deepEqual([store.best, store.tonnage, store.runs], [{ total: 512.5, peak: 1200, score: 513 }, 250 + 400 * 512.5, 404]);
  assert.deepEqual(normalizeStore(JSON.parse(JSON.stringify(store))), store);
});

test('the daily streak counts consecutive days and restarts after a gap, and seven in a row earns the training block', () => {
  assert.equal(TRAINING_BLOCK, 7);
  const store = emptyStore();
  const fly = (day, fields = {}) => recordRun(store, run({ day, log: '', ...fields }), { version: 1, now: day * DAY_MS + 60_000 });
  fly(DAY);
  assert.deepEqual(store.daily, { last: DAY, streak: 1 });
  fly(DAY + 1);
  assert.deepEqual(store.daily, { last: DAY + 1, streak: 2 });
  // Retrying (R) flies the same Daily Sky again, so the same day comes round more than any other.
  fly(DAY + 1);
  fly(DAY + 1, { reason: 'quit' });
  assert.deepEqual(store.daily, { last: DAY + 1, streak: 2 }, 'the same day again leaves it');
  fly(DAY + 3);
  assert.deepEqual(store.daily, { last: DAY + 3, streak: 1 }, 'a day missed starts it again');
  // Runs on any other sky neither count toward it nor break it, nor does a daily whose day is no whole day.
  for (const kind of ['practice', 'sky', 'vs']) recordRun(store, run({ kind, day: 0 }), { version: 1, now: (DAY + 5) * DAY_MS });
  recordRun(store, run({ kind: 'vs', day: DAY + 5 }), { version: 1, now: (DAY + 5) * DAY_MS });
  recordRun(store, run({ day: 0 }), { version: 1, now: (DAY + 5) * DAY_MS });
  recordRun(store, run({ day: DAY + 4.5 }), { version: 1, now: (DAY + 5) * DAY_MS });
  assert.deepEqual(store.daily, { last: DAY + 3, streak: 1 });
  for (let day = DAY + 4; day < DAY + 9; day++) assert.deepEqual(fly(day).feats, [], `day ${day - DAY}`);
  assert.deepEqual(store.daily, { last: DAY + 8, streak: 6 });
  // The seventh day in a row earns the training block, with whatever else the run earned, in feat order.
  assert.deepEqual(fly(DAY + 9, { feats: ['beat-the-bot', 'opener'] }).feats, ['opener', 'training-block', 'beat-the-bot']);
  assert.deepEqual(store.daily, { last: DAY + 9, streak: 7 });
  assert.deepEqual(fly(DAY + 10).feats, [], 'once');
  // A run begun before midnight and recorded after a later day's (in another tab), so on that later
  // day or after, neither extends nor breaks it.
  recordRun(store, run({ day: DAY + 9, log: '' }), { version: 1, now: (DAY + 10) * DAY_MS + 120_000 });
  assert.deepEqual(store.daily, { last: DAY + 10, streak: 8 });
  // A run that crosses midnight belongs to the day it started; a run ended early still counts.
  recordRun(store, run({ day: DAY + 11, log: '' }), { version: 1, now: (DAY + 12) * DAY_MS + 5_000 });
  fly(DAY + 12, { reason: 'quit' });
  assert.deepEqual(store.daily, { last: DAY + 12, streak: 10 });
  // A training block earned some other way is kept, and not earned again.
  const other = emptyStore();
  other.feats.push('training-block');
  other.daily = { last: DAY - 1, streak: 6 };
  assert.deepEqual(recordRun(other, run({ log: '' }), AT).feats, []);
  assert.deepEqual(other.feats, ['training-block']);
  // Seven days or more earn it, not only the seventh: a streak past seven whose feats were lost (a
  // damaged list falls back on its own) earns it on its next day.
  const lost = normalizeStore({ feats: 'damaged', daily: { last: DAY - 1, streak: 9 } });
  assert.deepEqual(recordRun(lost, run({ log: '' }), AT).feats, ['training-block']);
  assert.deepEqual(lost.daily, { last: DAY, streak: 10 });
});

test('a last daily dated after today, from a clock once set ahead or a damaged store, gives way rather than freezing the streak', () => {
  const fly = (store, day, fields = {}) => recordRun(store, run({ day, log: '', ...fields }), { version: 1, now: day * DAY_MS + 60_000 });
  // A sky peeked at with the clock a month ahead, then the clock put right: today's daily starts the streak again from today.
  const peeked = normalizeStore({ daily: { last: DAY + 30, streak: 2 } });
  fly(peeked, DAY);
  assert.deepEqual(peeked.daily, { last: DAY, streak: 1 });
  fly(peeked, DAY + 1);
  assert.deepEqual(peeked.daily, { last: DAY + 1, streak: 2 });
  // A day no clock will ever reach gives way too, and the training block can still be earned.
  const damaged = normalizeStore({ daily: { last: Number.MAX_SAFE_INTEGER, streak: 2 } });
  for (let day = DAY; day < DAY + TRAINING_BLOCK - 1; day++) assert.deepEqual(fly(damaged, day).feats, [], `day ${day - DAY}`);
  assert.deepEqual(fly(damaged, DAY + TRAINING_BLOCK - 1).feats, ['training-block']);
  assert.deepEqual(damaged.daily, { last: DAY + TRAINING_BLOCK - 1, streak: TRAINING_BLOCK });
  // The same day as the last still leaves it, even a day after today (a retry of the sky flown with the clock ahead).
  const retried = normalizeStore({ daily: { last: DAY + 30, streak: 2 } });
  recordRun(retried, run({ day: DAY + 30, log: '' }), AT);
  assert.deepEqual(retried.daily, { last: DAY + 30, streak: 2 });
  // While the last day is today or before, an earlier day is a run recorded late, and still leaves it alone.
  const late = normalizeStore({ daily: { last: DAY + 1, streak: 4 } });
  recordRun(late, run({ day: DAY, log: '' }), { version: 1, now: (DAY + 1) * DAY_MS + 5_000 });
  recordRun(late, run({ day: DAY, log: '' }), { version: 1, now: (DAY + 3) * DAY_MS });
  assert.deepEqual(late.daily, { last: DAY + 1, streak: 4 });
  // A `now` that is no number cannot say the last day is to come, so the late run is left alone as before.
  recordRun(late, run({ day: DAY, log: '' }), { version: 1, now: NaN });
  assert.deepEqual(late.daily, { last: DAY + 1, streak: 4 });
});

test('only daily runs reach the board, and feats are earned once', () => {
  const store = emptyStore();
  setInitials(store, 'ren');
  // Practice, a named sky and a challenge never reach the board, whatever their log; nor a daily with no day.
  for (const kind of ['practice', 'sky', 'vs']) assert.deepEqual(placed(recordRun(store, run({ kind, day: kind === 'vs' ? DAY : 0, total: 900, log: kind }), AT)), { feats: [], rank: 0, best: false });
  assert.equal(recordRun(store, run({ day: 0, total: 900, log: 'noDay' }), AT).rank, 0);
  // A daily with no log counts, but has nothing to put on the board.
  assert.equal(recordRun(store, run({ total: 900, log: '' }), AT).rank, 0);
  assert.deepEqual(store.board, emptyBoard());

  // A Daily Sky goes on its day's board, under the store's initials, as this device's own run.
  const first = recordRun(store, run({ total: 200, peak: 800, red: [0, 2, 0, 4], log: 'daily1', feats: ['opener', 'opener', 'made-up'], byname: 'horn-lifter' }), AT);
  assert.deepEqual(placed(first), { feats: ['opener'], rank: 1, best: true });
  assert.deepEqual(rowsFor(store.board, KEY), [{ who: 'REN', via: 'me', total: 200, style: 0, peak: 800, red: [0, 2, 0, 4], at: NOON - 120_000, log: 'daily1', byname: 'horn-lifter' }]);
  // A lighter run ranks below it, and a feat earned again is not earned anew. `best` says whether this
  // run now leads its day, as addRow does; the leading row itself is the first of rowsFor.
  assert.deepEqual(placed(recordRun(store, run({ total: 100, log: 'daily2', feats: ['under-the-horn', 'opener'] }), AT)), { feats: ['under-the-horn'], rank: 2, best: false });
  assert.equal(rowsFor(store.board, KEY)[0].log, 'daily1');
  // Feats come back in FEAT_IDS order, however the run lists them.
  const third = recordRun(store, run({ total: 300, log: 'daily3', feats: ['thousand-pound-club', 'giant-dodger', 'clean-meet'] }), AT);
  assert.deepEqual(placed(third), { feats: ['giant-dodger', 'clean-meet', 'thousand-pound-club'], rank: 1, best: true });
  assert.deepEqual(store.feats, ['opener', 'under-the-horn', 'giant-dodger', 'clean-meet', 'thousand-pound-club']);
  // The same run recorded again keeps its one row (though, recorded twice, it counts twice: record each run once).
  assert.deepEqual(placed(recordRun(store, run({ total: 300, log: 'daily3' }), AT)), { feats: [], rank: 1, best: true });
  assert.deepEqual(rowsFor(store.board, KEY).map(({ log }) => log), ['daily3', 'daily1', 'daily2']);
  // Under a new version of the rules the day has a new board.
  assert.deepEqual(placed(recordRun(store, run({ total: 50, log: 'daily4' }), { version: 2, now: NOON })), { feats: [], rank: 1, best: true });
  assert.deepEqual(rowsFor(store.board, boardKey(2, DAY)).map(({ log }) => log), ['daily4']);
  // A run whose numbers no row can hold still counts, but takes no row: it is not repaired into one,
  // such as a 0 kg row for a total that is no number.
  const runs = store.runs;
  assert.equal(recordRun(store, run({ total: 900, peak: 812.4, log: 'fraction' }), AT).rank, 0);
  assert.equal(recordRun(store, run({ total: NaN, log: 'noTotal' }), AT).rank, 0);
  assert.equal(store.runs, runs + 2);
  assert.equal(store.best.total, 900);
  assert.deepEqual(rowsFor(store.board, KEY).map(({ log }) => log), ['daily3', 'daily1', 'daily2']);
  // A feat awarded later (beat-the-bot, once TST has flown) is earned once too, and unknown ids are ignored.
  assert.deepEqual(earnFeats(store, ['beat-the-bot', 'opener', 'made-up']), ['beat-the-bot']);
  assert.deepEqual(earnFeats(store, new Set(['beat-the-bot'])), []);
  for (const nonsense of [undefined, null, 7, 'opener', { 0: 'opener', length: 1 }]) assert.deepEqual(earnFeats(store, nonsense), []);
  // Every feat these runs earned: all but the streak's and the tricks', which none of them flew.
  assert.deepEqual(store.feats, [...FEAT_IDS.filter((id) => !['training-block', 'wingover-five', 'pitched-45'].includes(id))]);
});

test('a run ended early counts toward the runs, the bests and the streak, but takes no place on the board', () => {
  const store = emptyStore();
  const quit = recordRun(store, run({ total: 250, peak: 900, reason: 'quit', log: 'quitter', feats: ['opener'] }), AT);
  assert.deepEqual(placed(quit), { feats: ['opener'], rank: 0, best: false });
  assert.deepEqual([store.best, store.tonnage, store.runs, store.daily], [{ total: 250, peak: 900, score: 250 }, 250, 1, { last: DAY, streak: 1 }]);
  assert.deepEqual(store.board, emptyBoard());
  // Only the fog or a touchdown judges a run: one with no reason, or a reason unknown, is not placed either.
  for (const reason of [undefined, '', 'ghost']) assert.equal(recordRun(store, run({ reason, log: `unjudged${reason}` }), AT).rank, 0, String(reason));
  assert.deepEqual(store.board, emptyBoard());
  // Touching down is judged as the fog judges, so it takes its place.
  assert.deepEqual(placed(recordRun(store, run({ reason: 'landed', log: 'lander' }), AT)), { feats: [], rank: 1, best: true });
});

test('recording a run forgets the board\'s days more than two weeks old', () => {
  const store = emptyStore();
  recordRun(store, run({ day: DAY - 14, log: 'old' }), { version: 1, now: (DAY - 14) * DAY_MS });
  recordRun(store, run({ day: DAY - 13, log: 'recent' }), { version: 1, now: (DAY - 13) * DAY_MS });
  assert.deepEqual(Object.keys(store.board.days).sort(), [boardKey(1, DAY - 14), boardKey(1, DAY - 13)]);
  recordRun(store, run({ kind: 'practice', day: 0 }), AT);
  assert.deepEqual(Object.keys(store.board.days), [boardKey(1, DAY - 13)]);
});

test('initials are three letters A to Z or none, and anything else is refused', () => {
  const store = emptyStore();
  assert.equal(setInitials(store, ' ren '), 'REN');
  for (const typed of ['RE', 'RENA', 'R3N', 'RÉN', 'R N', 'ßa', 'ıii', null, 42, undefined]) assert.equal(setInitials(store, typed), 'REN', String(typed));
  assert.equal(store.initials, 'REN');
  // A run on the board keeps the name it was flown under.
  recordRun(store, run({ log: 'named' }), AT);
  assert.equal(setInitials(store, ''), '');
  recordRun(store, run({ total: 90, log: 'unnamed' }), AT);
  assert.deepEqual(rowsFor(store.board, KEY).map(({ who, log }) => [who, log]), [['REN', 'named'], ['', 'unnamed']]);
  assert.equal(setInitials(store, 'Tor'), 'TOR');
  assert.equal(setInitials(store, '   '), '');
});

test('clearStore forgets everything', () => {
  const storage = memoryStorage();
  updateStore((store) => recordRun(store, run(), AT), storage);
  assert.equal(readStore(storage).runs, 1);
  clearStore(storage);
  assert.equal(storage.items.has(GAME_STORE), false);
  assert.deepEqual(readStore(storage), emptyStore());
  // Storage that reads but will not let the key go: what it still holds is no longer this visit's.
  const stuck = memoryStorage({ [GAME_STORE]: JSON.stringify({ ...emptyStore(), runs: 9 }) });
  stuck.removeItem = () => { throw new Error('SecurityError'); };
  clearStore(stuck);
  assert.deepEqual(readStore(stuck), emptyStore());
  // With storage blocked, it is the visit's copy that is forgotten.
  blockStorage();
  updateStore((store) => recordRun(store, run(), AT));
  assert.equal(readStore().runs, 1);
  clearStore();
  assert.deepEqual(readStore(), emptyStore());
});

test('every change re-reads the store first, so a run recorded elsewhere is not written over', () => {
  const storage = memoryStorage();
  const early = readStore(storage);
  // Another tab records a run after this one read the store...
  storage.setItem(GAME_STORE, JSON.stringify(recordRun(emptyStore(), run({ total: 300, log: 'theirs' }), AT).store));
  // ...and this one records its own through updateStore, not on the store it read before.
  updateStore((store) => recordRun(store, run({ total: 200, log: 'mine' }), AT), storage);
  const store = readStore(storage);
  assert.equal(store.runs, 2);
  assert.deepEqual(rowsFor(store.board, KEY).map(({ log }) => log), ['theirs', 'mine']);
  assert.deepEqual(early, emptyStore());
});

test('the store never touches the fjord\'s own key', () => {
  // The page's reset clears Good Lift's key by name, from achievements.js's own copy of it, without
  // loading this module; were the two to part, Reset progress would leave the bests, feats, streak and board.
  assert.equal(GAME_STORE, 'good-lift-v1');
  assert.equal(RESET_KEY, GAME_STORE);
  const fjord = JSON.stringify({ unlocked: ['airborne'], cloudbase: { discovered: true, bestAltitude: 1032 } });
  const storage = memoryStorage({ 'fjord-glider-v1': fjord });
  readStore(storage);
  updateStore((store) => {
    setInitials(store, 'REN');
    return recordRun(store, run({ feats: ['opener'] }), AT);
  }, storage);
  writeStore(readStore(storage), storage);
  clearStore(storage);
  assert.deepEqual([...new Set(storage.keys)], [GAME_STORE]);
  assert.equal(storage.items.get('fjord-glider-v1'), fjord);
  assert.deepEqual([...storage.items.keys()], ['fjord-glider-v1']);
});

test('initials the board will not show are refused as they are typed, and read as none if a store still holds them', () => {
  const store = emptyStore();
  setInitials(store, 'REN');
  for (const blocked of BLOCKED) {
    assert.equal(setInitials(store, blocked), 'REN', blocked);
    assert.equal(setInitials(store, ` ${blocked.toLowerCase()} `), 'REN', blocked);
  }
  // A word for who someone is is no insult, and everyday initials go through as ever.
  for (const fine of ['GAY', 'JEW', 'TOR', 'ASH', 'SAS']) assert.equal(setInitials(store, fine), fine);
  // Initials a store kept before the blocklist refused them read as none, and the rest as it was.
  assert.deepEqual(normalizeStore({ initials: BLOCKED[0], runs: 3 }), { ...emptyStore(), runs: 3 });
  assert.equal(normalizeStore({ initials: 'TOR' }).initials, 'TOR');
});

test('initials typed where the sheet offers the world board are the opt-in to it, initials set anywhere else are not, and none opt out', () => {
  const store = emptyStore();
  // Set where the sheet said nothing of a world board, as every set before there was one was.
  setInitials(store, 'REN');
  assert.equal(store.optIn, false);
  setInitials(store, 'REN', { world: true });
  assert.equal(store.optIn, true);
  // Changed elsewhere, or refused, the opt-in stands.
  for (const typed of ['TOR', 'R3N', BLOCKED[0]]) setInitials(store, typed, { world: false });
  assert.deepEqual([store.initials, store.optIn], ['TOR', true]);
  // Cleared anywhere, the initials take the opt-in with them.
  setInitials(store, '', { world: false });
  assert.deepEqual([store.initials, store.optIn], ['', false]);
  setInitials(store, 'ULL');
  assert.equal(store.optIn, false);
  // Read back, the opt-in needs initials to go up under, and is true or nothing.
  assert.equal(normalizeStore({ initials: 'REN' }).optIn, false);
  assert.equal(normalizeStore({ initials: 'REN', optIn: true }).optIn, true);
  for (const raw of [{ optIn: true }, { initials: 'ren', optIn: true }, { initials: BLOCKED[0], optIn: true }, { initials: 'REN', optIn: 'yes' }]) {
    assert.equal(normalizeStore(raw).optIn, false, JSON.stringify(raw));
  }
});

test('what the bots came to on the day\'s sky is kept beside the board, whole or not at all, and comes back from storage', () => {
  const bots = {
    key: boardKey(2, DAY),
    seed: 4_236_776_022,
    scores: [{ total: 115, style: 0, peak: 1040, red: [0, 0, 0, 1, 0] }, { total: 145, style: 0, peak: 1152, red: [0] }, { total: 160, style: 0, peak: 1110, red: [] }],
  };
  const storage = memoryStorage();
  updateStore((store) => {
    store.bots = bots;
  }, storage);
  assert.deepEqual(readStore(storage).bots, bots);
  // A damaged one reads as none, and costs nothing else.
  assert.deepEqual(normalizeStore({ runs: 2, bots: { ...bots, seed: -1 } }), { ...emptyStore(), runs: 2 });
  assert.equal(normalizeStore({ bots: { ...bots, key: 'today' } }).bots, null);
  // Recording a run leaves it be, and the store read back shares nothing with it.
  updateStore((store) => recordRun(store, run(), AT), storage);
  const read = readStore(storage);
  assert.deepEqual(read.bots, bots);
  read.bots.scores[0].red.push(7);
  assert.deepEqual(bots.scores[0].red, [0, 0, 0, 1, 0]);
  assert.deepEqual(readStore(storage).bots, bots);
});

test('a run\'s byname goes onto its row, and one this build does not know goes on as none', () => {
  const store = emptyStore();
  recordRun(store, run({ log: 'named', byname: 'unstruck' }), AT);
  recordRun(store, run({ total: 90, log: 'later', byname: 'a-later-byname' }), AT);
  recordRun(store, run({ total: 80, log: 'older' }), AT);
  assert.deepEqual(rowsFor(store.board, KEY).map(({ log, byname }) => [log, byname]), [['named', 'unstruck'], ['later', ''], ['older', '']]);
});

// A store with `tonnage` kilos banked and `feats` earned, and nothing else flown.
const banked = (tonnage, feats = [], best = 0) => ({ ...emptyStore(), tonnage, feats, best: { total: best, peak: 0 } });

test('the kit ladder opens at 1, 2.5, 5, 10, 20 and 40 tonnes banked, the Valkyrie wing with a clean meet and the helmet with the 1,000 lb club', () => {
  const rungs = KIT.filter((item) => item.kg).map((item) => [item.id, item.kg]);
  assert.deepEqual(rungs, [['chalk', 1000], ['raven', 2500], ['calibrated', 5000], ['sheetless', 10000], ['flyte', 20000], ['hird', 40000]]);
  assert.deepEqual(KIT.filter((item) => item.feat).map((item) => [item.id, item.feat]), [['valkyrie', 'clean-meet'], ['gjermundbu', 'thousand-pound-club']]);
  // Its wings are the ones that can be worn and painted, and its feats are the store's own.
  assert.deepEqual(['standard', ...KIT.filter((item) => item.kind === 'wing').map((item) => item.id)], WINGS);
  assert.deepEqual(Object.keys(LIVERIES), WINGS.slice(1));
  for (const item of KIT) if (item.feat) assert.ok(FEAT_IDS.includes(item.feat), item.feat);
  // Each rung opens at its tonnage exactly, not a kilo before.
  assert.deepEqual(earnedKit(banked(0)), []);
  assert.deepEqual(earnedKit(banked(999.5)), []);
  assert.deepEqual(earnedKit(banked(1000)), ['chalk']);
  assert.deepEqual(earnedKit(banked(4997.5)), ['chalk', 'raven']);
  assert.deepEqual(earnedKit(banked(40000)), ['chalk', 'raven', 'calibrated', 'sheetless', 'flyte', 'hird']);
  // A feat earns its piece whatever the tonnage.
  assert.deepEqual(earnedKit(banked(0, ['clean-meet', 'thousand-pound-club'])), ['valkyrie', 'gjermundbu']);
  assert.deepEqual(earnedKit(banked(0, ['opener', 'giant-dodger'])), []);
});

test('only what has been earned is kept: an unearned wing is the standard one, an unearned helmet or chalk is off', () => {
  const everything = { wing: 'hird', helmet: true, chalk: true };
  assert.deepEqual(keepEarned(everything, banked(0)), emptyKit());
  assert.deepEqual(keepEarned(everything, banked(40000)), { wing: 'hird', helmet: false, chalk: true });
  assert.deepEqual(keepEarned(everything, banked(39997.5, ['thousand-pound-club'])), { wing: 'standard', helmet: true, chalk: true });
  assert.deepEqual(keepEarned({ wing: 'valkyrie' }, banked(50000)), emptyKit(), 'tonnage never buys a feat\'s wing');
  assert.deepEqual(keepEarned({ wing: 'valkyrie' }, banked(0, ['clean-meet'])).wing, 'valkyrie');
  // The standard wing is always there, and nonsense is the empty kit.
  assert.deepEqual(keepEarned({ wing: 'standard', helmet: false, chalk: false }, banked(0)), emptyKit());
  assert.deepEqual(keepEarned('raven', banked(99999)), emptyKit());
});

test('the kit a run earns is what its tonnage or its feats crossed into, as recordRun counts them, and only that', () => {
  const before = { ...emptyStore(), tonnage: 2400, feats: ['opener'] };
  const after = normalizeStore(before);
  recordRun(after, run({ total: 150, feats: ['clean-meet'] }), AT);
  assert.equal(after.tonnage, 2550);
  assert.deepEqual(newlyEarned(before, after), ['raven', 'valkyrie']);
  // The same run again earns nothing new, and a run that banks nothing earns nothing.
  const again = normalizeStore(after);
  recordRun(again, run({ total: 150, feats: ['clean-meet'], log: 'AR' }), AT);
  assert.deepEqual(newlyEarned(after, again), []);
  // A run that leaps several rungs earns every one.
  assert.deepEqual(newlyEarned(banked(0), banked(5000)), ['chalk', 'raven', 'calibrated']);
});

test('as a run ends the kit kept is held to what has been earned, and the chalk switches itself on the first time it is earned and never again', () => {
  // The run that crosses a tonne: the chalk comes on, and the wing kept stays on.
  assert.deepEqual(kitAfterRun({ wing: 'standard', helmet: false, chalk: false }, banked(990), banked(1010)), {
    kept: { wing: 'standard', helmet: false, chalk: true },
    fresh: ['chalk'],
  });
  // Switched off in the kit tab after that, it stays off.
  assert.deepEqual(kitAfterRun({ wing: 'standard', helmet: false, chalk: false }, banked(1010), banked(1200)), { kept: emptyKit(), fresh: [] });
  // A wing or the helmet just earned waits to be put on.
  assert.deepEqual(kitAfterRun(emptyKit(), banked(2400), banked(2600, ['thousand-pound-club'])).kept, emptyKit());
  // A kit kept from before a reset, or written by hand, comes off, whether or not the run was recorded.
  assert.deepEqual(kitAfterRun({ wing: 'hird', helmet: true, chalk: true }, banked(0), banked(0)), { kept: emptyKit(), fresh: [] });
  assert.deepEqual(kitAfterRun({ wing: 'hird', helmet: true, chalk: false }, banked(0), banked(1500)).kept, { wing: 'standard', helmet: false, chalk: true });
  // An earned kit is kept as it is, and nonsense is the empty kit.
  const raven = { wing: 'raven', helmet: true, chalk: false };
  assert.deepEqual(kitAfterRun(raven, banked(3000, ['thousand-pound-club']), banked(3100, ['thousand-pound-club'])), { kept: raven, fresh: [] });
  assert.deepEqual(kitAfterRun('raven', banked(990), banked(1000)).kept, { ...emptyKit(), chalk: true });
});

test('the kit tab is told how far each rung is, which comes next, the best total for the 1,000 lb club, and what was just earned', () => {
  const sheet = kitSheet(banked(3240, ['thousand-pound-club'], 467.5), { wing: 'raven', helmet: true, chalk: true }, ['gjermundbu', 'raven']);
  assert.equal(sheet.tonnage, 3240);
  assert.equal(sheet.best, 467.5);
  assert.deepEqual(sheet.worn, { wing: 'raven', helmet: true, chalk: true });
  assert.deepEqual(sheet.fresh, ['raven', 'gjermundbu'], 'in the kit\'s own order');
  const by = Object.fromEntries(sheet.items.map((item) => [item.id, item]));
  assert.deepEqual(sheet.items.map((item) => item.id), KIT.map((item) => item.id));
  assert.deepEqual([by.chalk.earned, by.chalk.left], [true, 0]);
  assert.deepEqual([by.raven.earned, by.raven.left], [true, 0]);
  assert.deepEqual([by.calibrated.earned, by.calibrated.left], [false, 1760]);
  assert.deepEqual([by.hird.earned, by.hird.left], [false, 36760]);
  assert.deepEqual([by.valkyrie.earned, by.valkyrie.left], [false, 0]);
  assert.deepEqual([by.gjermundbu.earned, by.gjermundbu.kind], [true, 'helmet']);
  assert.equal(sheet.next.id, 'calibrated');
  assert.equal(sheet.next.left, 1760);
  // Once every rung is open there is none next; the sheet says what is worn as a kit, whatever it is handed.
  const all = kitSheet(banked(41000), null);
  assert.equal(all.next, null);
  assert.deepEqual(all.worn, emptyKit());
  assert.deepEqual(all.fresh, []);
});
