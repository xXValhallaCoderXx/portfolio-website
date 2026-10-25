import type { KitReward } from './models.ts';
export interface GoodLiftStore {
  scoreVersion: number;
  best: { total: number; peak: number; score: number }; tonnage: number; runs: number;
  feats: string[]; learnedLessons: string[]; foundationLessons: string[]; daily: {last: number; streak: number};
  initials: string; optIn: boolean; board: ReturnType<typeof emptyBoard>; bots: ReturnType<typeof normalizeBots>;
  tricks: TrickBook;
}
/** The best combo the trick book keeps: its points, its moves in all, and its latest with the named link into each (0 for none). */
export interface BookCombo { points: number; moves: number; sequence: number[]; links: number[] }
/** The trick book, over every run on this device (emptyBook says what each part holds). */
export interface TrickBook { moves: number[]; links: number[]; best: number[]; bestCombo: BookCombo | null; flows: number; points: number; mirror: number }
export interface KitProgress { tonnage: number; feats: readonly string[]; best: {total: number} }
export interface RecordedRun {
  kind?: string; day?: number; total?: number; peak?: number; style?: number; red?: number[];
  at?: number; log?: string; reason?: string; feats?: string[]; byname?: string; glider?: string;
  tricks?: Partial<Omit<TrickBook, 'bestCombo'>> | null;
  bestCombo?: { points: number; moves?: number; sequence: readonly number[]; links?: readonly number[] } | null;
}
export interface RecordOptions { version?: number; now: number }
// Good Lift's own progress on this device, under its own localStorage key. It holds the best total,
// peak and score (score.js), the tonnage and the runs ever flown, the feats earned, the Daily Sky streak, the
// initials the board shows and whether they are the pilot's opt-in to the world board, the board
// itself (board.js), what the bots (meet-bots.js) came to on the last Daily Sky they flew, so
// that sky flown again that day never flies them again, and the trick book: what the combos
// (meet-combo.js) have banked here. The kit those earn is worked out from it (KIT), and the kit worn
// is kept under a key of its own that the page can read (wing-kit.js).
//
// It is kept apart from the fjord's 'fjord-glider-v1' on purpose. achievements.js's normaliser
// erases anything it does not know, and nothing done here moves the fjord's belt. Reset progress
// clears both keys.
//
// Where storage is missing, blocked or full, the store lives in this module's memory for the visit
// (achievements.js does the same for the fjord when storage is blocked). A visitor who blocks site
// data therefore still has their runs on the board until they leave. Reads always come back
// normalised: whatever another tab or a hand edit left there, the game only ever
// sees a valid store.
//
// Writers re-read before they write. Read, change and write in one go (updateStore does exactly
// that), never with a store read long before, or a run recorded in another tab is written over.
import { addRow, boardKey, emptyBoard, normalizeBoard, normalizeBots, pruneBoard, trimBoardLogs } from '../good-lift/board.ts';
import { dayOf } from '../good-lift/good-lift-address.ts';
import { scoreOf, styleOf } from '../good-lift/score.ts';
import { SIM_VERSION } from '../good-lift/sim-version.ts';
import { isBlocked } from '../good-lift/meet-initials.ts';
import { KIT_GLIDERS, normalizeKit } from './wing-kit.ts';
import { isJudgedEnding } from '../good-lift/run-rules.ts';
import { GAME_STORE } from './good-lift-key.ts';
import { normalizeLearnedLessons } from './trick-learning.ts';
import { normalizeFoundationLessons } from './foundation-learning.ts';
import { COMBO_SHOWN, bookFeatsFor } from '../good-lift/meet-card.ts';
import { LINK_COUNT, MOVE_COUNT } from '../good-lift/trick-tables.ts';

/** The localStorage key Good Lift keeps everything under; the page's reset clears it by name. */
export { GAME_STORE };

// Every feat there is, in the order the card shows them and recordRun reports them. They live only
// here, so they never move the fjord's belt.
//   opener               lock out the first line
//   under-the-horn       a good lift after Gjallarhorn
//   giant-dodger         dodge every kettlebell in a run that had at least three
//   clean-meet           four lifts or more, every light white
//   thousand-pound-club  a total of at least 453.6 kg (1,000 lb)
//   wingover-five        five linked wingovers in a set of tricks landed (meet-card.js TRICK_FEATS)
//   pitched-45           a pitched swing 45° ahead, caught, in a set landed
//   training-block       the Daily Sky flown on TRAINING_BLOCK UTC days in a row (recordRun awards it)
//   beat-the-bot         out-lift TST on the same sky (good-lift.js awards it with earnFeats once the
//                        bots have flown it, after the run is recorded)
//   first-link           a named link banked: recordRun awards these four from a run's trick book
//                        (meet-card.js bookFeatsFor)
//   flow-three           three flows in one combo banked
//   mirror               one move flown both ways in one combo banked
//   big-bank             300 points or more banked in one combo
export const FEAT_IDS = Object.freeze([
  'opener', 'under-the-horn', 'giant-dodger', 'clean-meet', 'thousand-pound-club', 'wingover-five', 'pitched-45', 'training-block', 'beat-the-bot',
  'first-link', 'flow-three', 'mirror', 'big-bank',
]);

// UTC days in a row of Daily Skies that earn the training block.
export const TRAINING_BLOCK = 7;

// Good Lift's kit, and what earns each piece; what is worn is kept apart, where the page can read it
// (wing-kit.js). There is no shop: each rung opens at `kg` banked over every run (the store's
// `tonnage`), at a feat, or at both; a piece `after` another opens only once that one has. The
// colours and the helmet are looks; the gliders change how a run flies, each good at something and
// none at everything. In the order the kit tab lists them:
//   chalk       a puff of chalk from the hands as a plate or a rep loads (meet-chalk.js)
//   raven …     colour themes: each opens both the wing and cocoon harness
//   gjermundbu  the helmet (helmet.js), for the 1,000 lb club
//   en-b …      the gliders (gliders.js) past the EN-A every pilot starts on
export const KIT: readonly KitReward[] = Object.freeze([
  Object.freeze({ id: 'chalk', kind: 'chalk', kg: 25 }),
  Object.freeze({ id: 'raven', kind: 'wing', kg: 50 }),
  Object.freeze({ id: 'calibrated', kind: 'wing', kg: 100 }),
  Object.freeze({ id: 'sheetless', kind: 'wing', kg: 250 }),
  Object.freeze({ id: 'flyte', kind: 'wing', kg: 500 }),
  Object.freeze({ id: 'hird', kind: 'wing', kg: 1000 }),
  Object.freeze({ id: 'valkyrie', kind: 'wing', feat: 'clean-meet' }),
  Object.freeze({ id: 'gjermundbu', kind: 'helmet', feat: 'thousand-pound-club' }),
  Object.freeze({ id: 'en-b', kind: 'glider', kg: 150 }),
  Object.freeze({ id: 'en-c', kind: 'glider', kg: 750, feat: 'first-link' }),
  Object.freeze({ id: 'en-d', kind: 'glider', kg: 2000, feat: 'wingover-five' }),
  Object.freeze({ id: 'acro', kind: 'glider', after: 'en-c', feat: 'flow-three' }),
]);

// What each of an item's asks says of `store`, with `earned` the items earned so far in KIT order.
const meets = (item: KitReward, store: KitProgress, earned: readonly string[]) => ({
  kg: item.kg === undefined || store.tonnage >= item.kg,
  feat: !item.feat || store.feats.includes(item.feat),
  after: !item.after || earned.includes(item.after),
});

/** The ids of the kit `store` has earned, in KIT order: every one of each item's asks met. */
export function earnedKit(store: KitProgress) {
  const earned: string[] = [];
  for (const item of KIT) {
    const met = meets(item, store, earned);
    if (met.kg && met.feat && met.after) earned.push(item.id);
  }
  return earned;
}

/** The kit earned in `after` that was not yet in `before` (two reads of the store), in KIT order. */
export function newlyEarned(before: KitProgress, after: KitProgress) {
  const had = earnedKit(before);
  return earnedKit(after).filter((id) => !had.includes(id));
}

/**
 * `kit` (wing-kit.js) with everything `store` has not earned taken off. Wing and harness are
 * checked independently against the same earned themes; a glider not earned is the first. This is
 * all Good Lift ever writes.
 */
export function keepEarned(kit: unknown, store: KitProgress) {
  const kept = normalizeKit(kit);
  const earned = earnedKit(store);
  if (kept.wing !== 'standard' && !earned.includes(kept.wing)) kept.wing = 'standard';
  if (kept.harness !== 'standard' && !earned.includes(kept.harness)) kept.harness = 'standard';
  kept.helmet &&= earned.includes('gjermundbu');
  kept.chalk &&= earned.includes('chalk');
  if (kept.glider !== KIT_GLIDERS[0] && !earned.includes(kept.glider)) kept.glider = KIT_GLIDERS[0];
  return kept;
}

/**
 * The kit to keep once a run is in the store, and `fresh`, the ids that run earned (newlyEarned).
 * `kit` is the choice kept so far (wing-kit.js's readKit, never a kit only tried on), and `before`
 * and `after` the store read either side of the run. Whatever `after` has not earned comes off, so
 * a kit kept from before a reset, or written by hand, does. The chalk comes on by itself the first
 * time it is earned, being no look to pick but a touch on every pickup; colours and the helmet wait
 * in the kit tab to be put on.
 */
export function kitAfterRun(kit: unknown, before: KitProgress, after: KitProgress) {
  const fresh = newlyEarned(before, after);
  const kept = keepEarned(fresh.includes('chalk') ? { ...normalizeKit(kit), chalk: true } : kit, after);
  return { kept, fresh };
}

/**
 * What the meet sheet's kit tab shows, from `store`, the kit `worn` and the ids `fresh` this run
 * earned (newlyEarned): the `tonnage` banked and the `best` total; every piece in KIT order with
 * whether it is `earned`, which of its asks are `met` (kg, feat, after) and, for a rung of tonnage,
 * the kilos `left` to it; and `next`, the rung of tonnage the kilos reach next (null once every one
 * is reached).
 */
export function kitSheet(store: KitProgress, worn: unknown, fresh: string[] = []) {
  const earned = earnedKit(store);
  const items = KIT.map((item) => ({
    ...item,
    earned: earned.includes(item.id),
    met: meets(item, store, earned),
    left: item.kg && !earned.includes(item.id) ? Math.max(0, item.kg - store.tonnage) : 0,
  }));
  let next: typeof items[number] | null = null;
  for (const item of items) if (item.kg && !item.earned && store.tonnage < item.kg && (!next || item.kg < next.kg!)) next = item;
  return {
    tonnage: store.tonnage,
    best: store.best.total,
    items,
    next,
    fresh: KIT.map((item) => item.id).filter((id) => fresh.includes(id)),
    worn: normalizeKit(worn),
  };
}

/**
 * A store with nothing flown yet. `optIn` says the initials were set where the sheet said they put
 * this browser's best run of each day on the world board (setInitials). Initials alone do not
 * grant that consent. `bots` is what the
 * bots came to on the last Daily Sky they flew (board.js normalizeBots: { key, seed, scores }), or
 * null: one day's, as a later day's takes its place. `tricks` is the trick book (emptyBook).
 */
export function emptyStore(): GoodLiftStore {
  return { scoreVersion: SIM_VERSION, best: { total: 0, peak: 0, score: 0 }, tonnage: 0, runs: 0, feats: [], learnedLessons: [], foundationLessons: [], daily: { last: 0, streak: 0 }, initials: '', optIn: false, board: emptyBoard(), bots: null, tricks: emptyBook() };
}

/**
 * A trick book with nothing banked. By move id (trick-tables.js MOVE, 0 for none), `moves` counts
 * each move banked here and `best` holds the most one was worth; by named link id (LINKS, 0 for
 * none), `links` counts each link banked. `bestCombo` is the combo that banked the most, or null:
 * its points, its `moves` in all and its latest COMBO_SHOWN in `sequence`, with the named link into
 * each in `links`. `flows` and `points` are the most of each in one combo banked, and `mirror` is 1
 * once a combo banked has flown one move both ways.
 */
export function emptyBook(): TrickBook {
  return { moves: new Array(MOVE_COUNT).fill(0), links: new Array(LINK_COUNT).fill(0), best: new Array(MOVE_COUNT).fill(0), bestCombo: null, flows: 0, points: 0, mirror: 0 };
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const INITIALS = /^(?:[A-Z]{3})?$/;
// `length` whole numbers of zero or more, index by index from `raw`, any other a 0; slot 0 names no
// move and no link, so it is always 0.
const counts = (raw: unknown, length: number) => Array.from({ length }, (_, i) => (i > 0 && Array.isArray(raw) && isCount(raw[i]) ? raw[i] : 0));

/**
 * A best combo from anything (a sheet's receipt, meet-combo.js, or the book's own): one that banked
 * points, every move in it a move there is and the link into each a named link or none; else null.
 * Only its latest COMBO_SHOWN moves are kept, and `moves` still counts them all.
 */
function normalizeCombo(raw: unknown): BookCombo | null {
  if (!isRecord(raw) || !isCount(raw.points) || raw.points === 0) return null;
  const { sequence, links } = raw;
  if (!Array.isArray(sequence) || !Array.isArray(links) || !sequence.length || links.length !== sequence.length) return null;
  if (!sequence.every((move) => isCount(move) && move > 0 && move < MOVE_COUNT) || !links.every((link) => isCount(link) && link < LINK_COUNT)) return null;
  const moves = isCount(raw.moves) && raw.moves >= sequence.length ? raw.moves : sequence.length;
  return { points: raw.points, moves, sequence: sequence.slice(-COMBO_SHOWN), links: links.slice(-COMBO_SHOWN) };
}

/**
 * A valid trick book from anything (emptyBook says what it holds): the counts and bests are whole
 * numbers of zero or more, one for each move and named link there is, the best combo is whole or
 * none, and `mirror` is 1 or 0. Each part falls back on its own; never throws, and shares nothing
 * with `raw`.
 */
export function normalizeBook(raw: unknown): TrickBook {
  const book = emptyBook();
  try {
    if (!isRecord(raw)) return book;
    book.moves = counts(raw.moves, MOVE_COUNT);
    book.links = counts(raw.links, LINK_COUNT);
    book.best = counts(raw.best, MOVE_COUNT);
    book.bestCombo = normalizeCombo(raw.bestCombo);
    if (isCount(raw.flows)) book.flows = raw.flows;
    if (isCount(raw.points)) book.points = raw.points;
    book.mirror = raw.mirror === 1 ? 1 : 0;
  } catch {
    // Only an object built to throw when read gets here; JSON never does.
    return emptyBook();
  }
  return book;
}

// Adds `flown`, one run's trick book, to the device's `book`: its counts, its bests, its best combo if
// that banked more, and its most flows and points in one combo.
function addToBook(book: TrickBook, flown: TrickBook) {
  for (let move = 1; move < MOVE_COUNT; move++) {
    book.moves[move] += flown.moves[move];
    book.best[move] = Math.max(book.best[move], flown.best[move]);
  }
  for (let link = 1; link < LINK_COUNT; link++) book.links[link] += flown.links[link];
  if (flown.bestCombo && flown.bestCombo.points > (book.bestCombo?.points ?? 0)) book.bestCombo = flown.bestCombo;
  book.flows = Math.max(book.flows, flown.flows);
  book.points = Math.max(book.points, flown.points);
  book.mirror = Math.max(book.mirror, flown.mirror);
}

/**
 * A valid store from anything storage held. Each
 * part that is missing or damaged falls back to its empty value on its own, so one bad number
 * costs only itself:
 * - the bests and the tonnage are non-negative finite numbers;
 * - the run count is a whole number;
 * - the last daily is a whole UTC day, and it and the streak stand or fall together, since a
 *   streak with no day, or a day with no streak, cannot be carried on;
 * - feats are known ids, each once;
 * - initials are none or three capitals the board will show (meet-initials.js);
 * - the opt-in to the world board is true only with initials to go up under;
 * - the board keeps its whole rows (board.js);
 * - the day's bots are whole (board.js normalizeBots) or none;
 * - the trick book's counts are whole, one for each move and named link, and its best combo whole
 *   or none (normalizeBook).
 * Never throws, and shares no object with `raw`.
 */
export function normalizeStore(raw: unknown): GoodLiftStore {
  try {
    const store = emptyStore();
    if (!isRecord(raw)) return store;
    const best = raw.best as Partial<GoodLiftStore['best']> | null | undefined;
    if (isAmount(best?.total)) store.best.total = best.total;
    if (isAmount(best?.peak)) store.best.peak = best.peak;
    if (raw.scoreVersion === SIM_VERSION && isAmount(best?.score)) store.best.score = best.score;
    if (isAmount(raw.tonnage)) store.tonnage = raw.tonnage;
    if (isCount(raw.runs)) store.runs = raw.runs;
    if (Array.isArray(raw.feats)) store.feats = [...new Set(raw.feats.filter((id): id is string => typeof id === 'string' && FEAT_IDS.includes(id)))];
    store.learnedLessons = normalizeLearnedLessons(raw.learnedLessons);
    store.foundationLessons = normalizeFoundationLessons(raw.foundationLessons);
    const { last, streak } = isRecord(raw.daily) ? raw.daily : {};
    if (isCount(last) && isCount(streak) && (last === 0) === (streak === 0)) store.daily = { last, streak };
    if (typeof raw.initials === 'string' && INITIALS.test(raw.initials) && !isBlocked(raw.initials)) store.initials = raw.initials;
    store.optIn = raw.optIn === true && store.initials !== '';
    store.board = trimBoardLogs(normalizeBoard(raw.board));
    store.bots = normalizeBots(raw.bots);
    store.tricks = normalizeBook(raw.tricks);
    return store;
  } catch {
    // Only an object built to throw when read gets here; JSON never does.
    return emptyStore();
  }
}

/**
 * Adds the feats among `ids` (an array or a Set) that `store` has not yet earned, and returns them
 * in FEAT_IDS order. Unknown ids are ignored. recordRun uses it, and it serves a feat awarded after
 * the run was recorded (beat-the-bot, once TST has flown).
 */
export function earnFeats(store: GoodLiftStore, ids: unknown) {
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
 *   reason   'fog', 'landed', 'time' or 'quit'
 *   feats    the feat ids it earned, as the caller judged them
 *   byname   the byname it earned (meet-bynames.js), or '': its board row carries it
 *   glider   the glider it was flown on (glider-ids.js): its board row carries it
 *   tricks   its sheet's trick book (meet-sheet.js stats.tricks), and `bestCombo` its sheet's best combo
 *
 * Every run raises the bests, adds its total to the tonnage, counts as a run and earns its feats.
 * A run with a trick book also adds what it banked to the device's book (`store.tricks`) and earns
 * the book's feats it met (meet-card.js bookFeatsFor).
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
 * Only a Daily Sky that the sky judged (reason 'fog', 'landed' or 'time') and that has a log goes on the
 * day's board, under the store's initials as this device's own run. A run ended with [ end run ]
 * ('quit') forfeits its bar and its place on the board, though what it banked before still counts
 * toward the bests and the tonnage, and it still counts as a run and toward the streak. A run whose
 * numbers a board row cannot hold (board.js normalizeRow), such as a peak that is not whole metres,
 * still counts in every other way but takes no row.
 *
 * Days the board no longer remembers are forgotten as of `now`, before the run's row goes on.
 * Record each run once, on a store read just before; updateStore does both.
 */
export function recordRun(store: GoodLiftStore, run: RecordedRun, { version = SIM_VERSION, now }: RecordOptions) {
  // A number no run can bank counts as nothing, so a bad one cannot spoil the bests or the tonnage.
  const total = isAmount(run.total) ? run.total : 0;
  const peak = isAmount(run.peak) ? run.peak : 0;
  const style = styleOf(run.style);
  const today = dayOf(now);
  if (store.scoreVersion !== version) { store.best.score = 0; store.scoreVersion = version; }
  store.best.total = Math.max(store.best.total, total);
  store.best.peak = Math.max(store.best.peak, peak);
  store.best.score = Math.max(store.best.score, scoreOf({ total, style }));
  store.tonnage += total;
  store.runs += 1;
  pruneBoard(store.board, today);

  const earned = new Set(Array.isArray(run.feats) ? run.feats : []);
  recordBook(store, run, earned);
  let rank = 0;
  let best = false;
  if (run.kind === 'daily' && typeof run.day === 'number' && Number.isSafeInteger(run.day) && run.day > 0) {
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
    const judged = isJudgedEnding(run.reason);
    if (judged && typeof run.log === 'string' && run.log !== '') {
      const row = { who: store.initials, via: 'me', total: run.total, style, peak: run.peak, red: run.red, at: run.at, log: run.log, byname: run.byname ?? '',
        glider: run.glider };
      ({ rank, best } = addRow(store.board, boardKey(version, run.day), row));
    }
  }
  return { store, feats: earnFeats(store, earned), rank, best };
}

// A run's trick book into the device's, with the feats it earned into `earned`. Whatever its sheet
// says that no run can bank counts as nothing, as a bad total does.
function recordBook(store: GoodLiftStore, run: RecordedRun, earned: Set<string>) {
  if (!isRecord(run.tricks)) return;
  const flown = normalizeBook(run.tricks);
  flown.bestCombo = normalizeCombo(run.bestCombo);
  addToBook(store.tricks, flown);
  for (const id of bookFeatsFor(flown)) earned.add(id);
}

/**
 * Sets the initials the board shows for this device's runs, from what a visitor typed: three
 * letters A to Z in either case (kept as capitals), or nothing, to fly unnamed. Spaces around them
 * are ignored. Anything else is refused, three letters the board will not show among it
 * (meet-initials.js BLOCKED), and the initials stay as they were. Returns the initials as they now
 * stand. Runs already on the board keep the name they were flown under.
 *
 * `world` says they were typed where the sheet says initials put this browser's best run of each
 * day on the world board: there, three letters are the pilot's opt-in to it. Anywhere else they
 * leave the opt-in as it was; clearing initials always opts out.
 */
export function setInitials(store: GoodLiftStore, text: unknown, { world = false } = {}) {
  const typed = typeof text === 'string' ? text.trim() : null;
  if (typed !== null && /^(?:[A-Za-z]{3})?$/.test(typed) && !isBlocked(typed.toUpperCase())) {
    store.initials = typed.toUpperCase();
    if (!store.initials) store.optIn = false;
    else if (world) store.optIn = true;
  }
  return store.initials;
}
