// Good Lift's own progress on this device, under its own localStorage key. It holds the best total
// and peak, the tonnage and the runs ever flown, the feats earned, the Daily Sky streak, the
// initials the board shows, and the board itself (board.js).
//
// It is kept apart from the fjord's 'fjord-glider-v1' on purpose. achievements.js's normaliser
// erases anything it does not know, and nothing done here moves the fjord's belt. Reset progress
// clears both keys.
//
// Where storage is missing, blocked or full, the store lives in this module's memory for the visit
// (achievements.js does the same for the fjord when storage is blocked). A visitor who blocks site
// data therefore still has their runs on the board until they leave. Reads always come back
// normalised: whatever another tab, an older build or a hand edit left there, the game only ever
// sees a valid store.
//
// Writers re-read before they write. Read, change and write in one go (updateStore does exactly
// that), never with a store read long before, or a run recorded in another tab is written over.
import { addRow, boardKey, emptyBoard, normalizeBoard, pruneBoard } from './board.js';
import { dayOf } from './good-lift-address.js';
import { SIM_VERSION } from './sim-version.js';

/** The localStorage key Good Lift keeps everything under; the page's reset clears it by name. */
export const GAME_STORE = 'good-lift-v1';

// Every feat there is, in the order the card shows them and recordRun reports them. They live only
// here, so they never move the fjord's belt.
//   opener               lock out the first line
//   under-the-horn       a good lift after Gjallarhorn
//   giant-dodger         dodge every kettlebell in a run that had at least three
//   clean-meet           four lifts or more, every light white
//   thousand-pound-club  a total of at least 453.6 kg (1,000 lb)
//   training-block       the Daily Sky flown on TRAINING_BLOCK UTC days in a row (recordRun awards it)
//   beat-the-bot         out-total TST on the same sky (optional; earnFeats awards it once TST has flown)
export const FEAT_IDS = Object.freeze(['opener', 'under-the-horn', 'giant-dodger', 'clean-meet', 'thousand-pound-club', 'training-block', 'beat-the-bot']);

// UTC days in a row of Daily Skies that earn the training block.
export const TRAINING_BLOCK = 7;

/** A store with nothing flown yet. */
export function emptyStore() {
  return { v: 1, best: { total: 0, peak: 0 }, tonnage: 0, runs: 0, feats: [], daily: { last: 0, streak: 0 }, initials: '', board: emptyBoard() };
}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isAmount = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
const INITIALS = /^(?:[A-Z]{3})?$/;

/**
 * A valid store from anything: what storage held, a store from an older build, or nonsense. Each
 * part that is missing or damaged falls back to its empty value on its own, so one bad number
 * costs only itself:
 * - the bests and the tonnage are non-negative finite numbers;
 * - the run count is a whole number;
 * - the last daily is a whole UTC day, and it and the streak stand or fall together, since a
 *   streak with no day, or a day with no streak, cannot be carried on;
 * - feats are known ids, each once;
 * - initials are none or three capitals;
 * - the board keeps its whole rows (board.js).
 * The result always has `v` 1, whatever version `raw` claims. Never throws, and shares no object
 * with `raw`.
 */
export function normalizeStore(raw) {
  try {
    const store = emptyStore();
    if (!isRecord(raw)) return store;
    if (isAmount(raw.best?.total)) store.best.total = raw.best.total;
    if (isAmount(raw.best?.peak)) store.best.peak = raw.best.peak;
    if (isAmount(raw.tonnage)) store.tonnage = raw.tonnage;
    if (isCount(raw.runs)) store.runs = raw.runs;
    if (Array.isArray(raw.feats)) store.feats = [...new Set(raw.feats.filter((id) => FEAT_IDS.includes(id)))];
    const { last, streak } = isRecord(raw.daily) ? raw.daily : {};
    if (isCount(last) && isCount(streak) && (last === 0) === (streak === 0)) store.daily = { last, streak };
    if (typeof raw.initials === 'string' && INITIALS.test(raw.initials)) store.initials = raw.initials;
    store.board = normalizeBoard(raw.board);
    return store;
  } catch {
    // Only an object built to throw when read gets here; JSON never does.
    return emptyStore();
  }
}

// The store as this visit last wrote it, and whether that write reached storage. While storage is
// missing, blocked or refusing writes (full, or a private window with no room), the visit carries
// on from `memory`. The next write that lands gives storage the last word again.
let memory = null;
let landed = true;

// The page's localStorage, or undefined where there is none. Reading the property itself throws
// where the visitor blocks site data, so the defaults below look it up here and not as a bare
// `globalThis.localStorage`, which would throw before the function could catch it.
function deviceStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The store `storage` holds, normalised. What comes back:
 * - storage that is missing, blocked or failing to read, or that refused this visit's last write:
 *   the visit's own copy (empty if nothing was written);
 * - nothing stored: an empty store;
 * - stored text that cannot be parsed: the visit's copy, or an empty store.
 */
export function readStore(storage = deviceStorage()) {
  let text;
  try {
    text = storage.getItem(GAME_STORE);
  } catch {
    return normalizeStore(memory);
  }
  if (!landed) return normalizeStore(memory);
  if (text === null || text === undefined) return emptyStore();
  try {
    return normalizeStore(JSON.parse(text));
  } catch {
    return normalizeStore(memory);
  }
}

/**
 * Writes `store`, normalised, under GAME_STORE, keeping a copy for the visit in case storage cannot
 * hold it. Returns true when it reached storage, false when it lasts only for this visit.
 */
export function writeStore(store, storage = deviceStorage()) {
  memory = normalizeStore(store);
  try {
    storage.setItem(GAME_STORE, JSON.stringify(memory));
    landed = true;
  } catch {
    landed = false;
  }
  return landed;
}

/**
 * Forgets Good Lift's progress on this device: the stored key and the visit's copy. Reset progress
 * calls this, and clears the fjord's own key itself; this module never touches that key.
 */
export function clearStore(storage = deviceStorage()) {
  memory = null;
  try {
    storage.removeItem(GAME_STORE);
    landed = true;
  } catch {
    // Storage that cannot be reached cannot be cleared. Whatever it still holds is no longer this
    // visit's, so reads get the empty copy until a write lands.
    landed = false;
  }
}

/**
 * Reads the store afresh, lets `change(store)` change it, writes it back, and returns what `change`
 * returned. This is the safe way to change the store: one read long before would write over
 * whatever another tab has recorded since.
 *
 *   const { feats, rank, best } = updateStore((store) => recordRun(store, run, { version, now }));
 */
export function updateStore(change, storage = deviceStorage()) {
  const store = readStore(storage);
  const result = change(store);
  writeStore(store, storage);
  return result;
}

/**
 * Adds the feats among `ids` (an array or a Set) that `store` has not yet earned, and returns them
 * in FEAT_IDS order. Unknown ids are ignored. recordRun uses it, and it serves a feat awarded after
 * the run was recorded (beat-the-bot, once TST has flown).
 */
export function earnFeats(store, ids) {
  const wanted = new Set(Array.isArray(ids) || ids instanceof Set ? ids : []);
  const fresh = FEAT_IDS.filter((id) => wanted.has(id) && !store.feats.includes(id));
  store.feats.push(...fresh);
  return fresh;
}

/**
 * Records a finished run in `store` (changing it) and returns { store, feats, rank, best }:
 * - `store`: the same store;
 * - `feats`: the feats this run newly earned, in FEAT_IDS order;
 * - `rank` and `best`: the run's place on its day's board (board.js addRow: 1 for the top, 0 when
 *   it is not on the board) and whether it now leads that day. `best` is that yes or no, passed on
 *   from addRow, not the leading row itself: the day's rows, best first, are
 *   rowsFor(store.board, boardKey(version, run.day)). A run that goes on no board has 0 and false.
 * It touches no storage, and reads the clock only when `now` is not given. `version` (SIM_VERSION)
 * names the board a day's runs go on, and `now` (ms) only says which UTC day is today, for
 * forgetting old days.
 *
 * `run` holds:
 *   kind     'daily', 'practice', 'sky' or 'vs'
 *   day      the UTC day of a Daily Sky (the day it started), 0 for any other
 *   total    kg banked, a multiple of 2.5
 *   peak     whole metres
 *   red      each lift's lights (board.js), the mist last
 *   at       ms since 1970 when the run started
 *   log      the run's log (base64url), or ''
 *   reason   'fog', 'landed' or 'quit'
 *   feats    the feat ids it earned, as the caller judged them
 *
 * Every run raises the bests, adds its total to the tonnage, counts as a run and earns its feats.
 *
 * A Daily Sky (kind 'daily', day above 0) also counts toward the streak:
 * - the same day as the last leaves the streak as it is;
 * - the next day adds one;
 * - any later day starts it again at one;
 * - an earlier day leaves it alone: a run begun before midnight and recorded after a later day's
 *   run (in another tab) can neither extend a streak that has moved on nor break it;
 * - except when the last day is after today (dayOf(now)). No clock that is right flew that day:
 *   it was a clock once set ahead (to peek at a later sky) or a damaged store. An earlier day
 *   then starts the streak again at one from its own day, since leaving it alone would freeze
 *   the streak until that day came round, or for good.
 * A streak of TRAINING_BLOCK (seven) days or more earns the training block.
 *
 * Only a Daily Sky that the sky judged (reason 'fog' or 'landed') and that has a log goes on the
 * day's board, under the store's initials as this device's own run. A run ended with [ end run ]
 * ('quit') forfeits its bar and its place on the board, though what it banked before still counts
 * toward the bests and the tonnage, and it still counts as a run and toward the streak. A run whose
 * numbers a board row cannot hold (board.js normalizeRow), such as a peak that is not whole metres,
 * still counts in every other way but takes no row.
 *
 * Days the board no longer remembers are forgotten as of `now`, before the run's row goes on.
 * Record each run once, on a store read just before; updateStore does both.
 */
export function recordRun(store, run, { version = SIM_VERSION, now = Date.now() } = {}) {
  // A number no run can bank counts as nothing, so a bad one cannot spoil the bests or the tonnage.
  const total = isAmount(run.total) ? run.total : 0;
  const peak = isAmount(run.peak) ? run.peak : 0;
  const today = dayOf(now);
  store.best.total = Math.max(store.best.total, total);
  store.best.peak = Math.max(store.best.peak, peak);
  store.tonnage += total;
  store.runs += 1;
  pruneBoard(store.board, today);

  const earned = new Set(Array.isArray(run.feats) ? run.feats : []);
  let rank = 0;
  let best = false;
  if (run.kind === 'daily' && Number.isSafeInteger(run.day) && run.day > 0) {
    const { daily } = store;
    // An earlier day than the last is a run recorded late, which may not move the streak, unless
    // the last day is still to come: then it is the last day that is wrong, not the run. (A `now`
    // that is no number never finds it so, and leaves the guard as it was.)
    const lastAhead = daily.last > today;
    if (run.day > daily.last || (run.day < daily.last && lastAhead)) {
      daily.streak = run.day === daily.last + 1 ? daily.streak + 1 : 1;
      daily.last = run.day;
    }
    if (daily.streak >= TRAINING_BLOCK) earned.add('training-block');
    const judged = run.reason === 'fog' || run.reason === 'landed';
    if (judged && typeof run.log === 'string' && run.log !== '') {
      const row = { who: store.initials, via: 'me', total: run.total, peak: run.peak, red: run.red, at: run.at, log: run.log };
      ({ rank, best } = addRow(store.board, boardKey(version, run.day), row));
    }
  }
  return { store, feats: earnFeats(store, earned), rank, best };
}

/**
 * Sets the initials the board shows for this device's runs, from what a visitor typed: three
 * letters A to Z in either case (kept as capitals), or nothing, to fly unnamed. Spaces around them
 * are ignored. Anything else is refused, and the initials stay as they were. Returns the initials
 * as they now stand. Runs already on the board keep the name they were flown under.
 */
export function setInitials(store, text) {
  const typed = typeof text === 'string' ? text.trim() : null;
  if (typed !== null && /^(?:[A-Za-z]{3})?$/.test(typed)) store.initials = typed.toUpperCase();
  return store.initials;
}
