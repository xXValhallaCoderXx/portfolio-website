import type { Board, BoardRow, BotRow, BotScores, RankedScore, Score } from './board.types.ts';
// Good Lift's local board: the best runs of each Daily Sky flown on this device, kept inside the
// game's own store (good-lift-store.js, under 'good-lift'). A day's board is the top BOARD.keep
// runs flown on one UTC day under one version of the rules (sim-version.js), since a run flown
// under one version is never judged against another. Runs rank by score (lifted points plus banked
// acro, score.js), then by peak, then by which started first, so a board always
// has one order.
//
// Every row keeps its run's log. The log is its proof, because a replay of it flies to the same
// total, and it is the seam for Slice 2's online board, which will be sent exactly that. A row
// comes from a run flown here ('me') or from a challenge link ('link'), and the same log is never
// on a day twice: a challenger opened twice, or your own run sent back to you, keeps one row.
//
// Everything here works on a plain object, { days: { 'version:day': { rows: [row, …] } } }, so the
// store can write it as JSON and read it back. Nothing here touches storage or the clock.
//
// The sheet shows a day's board with TST, the bot to beat (meet-bots.js), pinned among its runs
// where it ranks (withBot), but a bot is never a row: no row stored here was flown by one. What the
// day's bots came to is kept beside the board (normalizeBots), so a sky flown again that day never
// flies them again.
import { bynameOf } from './meet-bynames.ts';
import { byRank, outranks } from './score.ts';
import { MAX_LINK } from './recorder.ts';
import { SIM_VERSION } from './sim-version.ts';

// How much the board remembers: the best `keep` runs of each day, for `days` UTC days (today and
// the 13 before it). The independent log budget bounds storage even for rapidly changing inputs.
export const BOARD = Object.freeze({ keep: 10, days: 14 });

// A row can hold a complete ten-minute trace and every judgment the meet can issue.
export const ROW = Object.freeze({ log: MAX_LINK, lights: 96 });
// Keep persistent logs below one MiB of text; progression is stored independently of this budget.
export const BOARD_LOG_BUDGET = 1_048_576;

/** The board key of a UTC day's Daily Sky flown under one version of the rules. */
export const boardKey = (version: number, day: number) => `${version}:${day}`;

/** A board with no runs on it. */
export function emptyBoard(): Board {
  return { days: {} };
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const KEY = /^(0|[1-9]\d*):(0|[1-9]\d*)$/;
const WHO = /^(?:[A-Z]{3})?$/;
const LOG = /^[A-Za-z0-9_-]+$/;

/**
 * The UTC day a board key names, or NaN for a key boardKey would never write. Only such keys get
 * onto a board, so nothing read back from storage can name a day '__proto__'.
 */
export function boardDay(key: unknown) {
  const match = typeof key === 'string' ? KEY.exec(key) : null;
  if (!match || !Number.isSafeInteger(Number(match[1])) || !Number.isSafeInteger(Number(match[2]))) return NaN;
  return Number(match[2]);
}

// Whether one run ranks above another: lifted points plus banked acro (score.js), then the peak,
// then the earlier run.
export { outranks };

/**
 * A clean copy of what a run banked, { total, style, peak, red }, held to the rules a row's are (see
 * normalizeRow), or null when any of them is damaged. Anything else in the object is left behind.
 */
export function normalizeScore(score: unknown): Score | null {
  if (!isRecord(score)) return null;
  const { total, style, peak, red } = score;
  if (typeof style !== 'number' || !Number.isSafeInteger(style) || style < 0 || style % 5 !== 0) return null;
  // Twice the total is a whole number of 5 kg exactly when the total is a multiple of 2.5, and
  // doubling is exact in floating point, so no near miss rounds its way onto the board.
  if (!isAmount(total) || !Number.isInteger(total * 2) || (total * 2) % 5 !== 0) return null;
  if (typeof peak !== 'number' || !Number.isInteger(peak) || peak < 0) return null;
  if (!Array.isArray(red) || red.length > ROW.lights) return null;
  // Each light by its index, not with `every`, which skips a gap in a sparse array. A gap copied
  // here would be written to storage as null and dropped on the next read, so a run ranked now
  // would be gone after a reload.
  for (let i = 0; i < red.length; i++) {
    const light = red[i];
    if (!Number.isInteger(light) || light < 0 || light > 7) return null;
  }
  return { total, style, peak, red: [...red] };
}

/**
 * A clean copy of a board row, or null when any part of it is damaged. A row is
 *
 *   who     '' for a run flown unnamed, or three capitals A to Z
 *   via     'me' for a run flown here, 'link' for one read from a challenge link
 *   total   kg, a whole number of 2.5 kg steps
 *   style   the style the run landed (meet-style.js), a whole number of 5 points; with the total, it
 *           is the score the board ranks by (score.js)
 *   peak    m, whole metres
 *   red     each lift's lights in lift order, the mist last: 0 to 7 (bit 0 contact, bit 1
 *           control, bit 2 airspace), at most ROW.lights of them
 *   at      ms since 1970 when the run started
 *   log     the run's log, non-empty base64url under ROW.log characters
 *   byname  the byname the run earned (meet-bynames.js), by its id, or '' for none
 *
 * Anything else in the object is left behind. A damaged row is dropped, never repaired: a total
 * rounded to the nearest plate, or a name guessed from lower case, would be a run nobody flew,
 * and its log would not replay to it. A byname is the one exception: it says only how the run was
 * flown, and its log earns it again whenever it is replayed, so one this build does not know (damage) is left off and the run keeps its row.
 */
export function normalizeRow(row: unknown): BoardRow | null {
  if (!isRecord(row)) return null;
  const { who, via, at, log, byname } = row;
  if (typeof who !== 'string' || !WHO.test(who)) return null;
  if (typeof byname !== 'string') return null;
  if (via !== 'me' && via !== 'link') return null;
  const score = normalizeScore(row);
  if (!score) return null;
  if (!isAmount(at)) return null;
  if (typeof log !== 'string' || log.length > ROW.log || !LOG.test(log)) return null;
  return { who, via, ...score, at, log, byname: bynameOf(byname) ? byname : '' };
}

/**
 * A clean board from anything, such as what storage hands back. A day is kept only under a key
 * boardKey writes, with its whole rows (normalizeRow) in rank order, each log once (its higher
 * placed copy) and no more than BOARD.keep of them. A log's other copies go before the ten are
 * counted, so a copy never costs another run its place. A day with no whole rows left is
 * forgotten. Never throws on anything JSON can hold (an object built to throw when read can; the
 * store's normaliser catches that), and shares no object with `raw`.
 */
export function normalizeBoard(raw: unknown, version = SIM_VERSION): Board {
  const board = emptyBoard();
  if (!isRecord(raw) || !isRecord(raw.days)) return board;
  for (const key of Object.keys(raw.days)) {
    const day = raw.days[key];
    if (Number.isNaN(boardDay(key)) || !isRecord(day) || !Array.isArray(day.rows)) continue;
    const rows: BoardRow[] = [];
    const valid = day.rows.map((candidate) => normalizeRow(candidate)).filter((candidate): candidate is BoardRow => candidate !== null);
    // Old-version rows retain their historical order; today's formula cannot rescore them.
    if (Number(key.split(':')[0]) === version) valid.sort(byRank);
    for (const row of valid) {
      if (rows.length === BOARD.keep) break;
      if (!rows.some((other) => other.log === row.log)) rows.push(row);
    }
    if (rows.length) board.days[key] = { rows };
  }
  return board;
}

/** Evicts older days' lower-ranked runs first, keeping the newest day's best throughout. */
export function trimBoardLogs(board: Board, budget = BOARD_LOG_BUDGET) {
  const keys = Object.keys(board.days).sort((a, b) => boardDay(a) - boardDay(b));
  let size = 0;
  for (const key of keys) for (const row of board.days[key].rows) size += row.log.length;
  for (const key of keys) {
    const rows = board.days[key].rows;
    while (size > budget && rows.length > 0) {
      if (key === keys[keys.length - 1] && rows.length === 1) break;
      size -= rows.pop()!.log.length;
    }
    if (!rows.length) delete board.days[key];
    if (size <= budget) break;
  }
  return board;
}

/**
 * Puts a run on the board for day `key` (boardKey) and returns { rank, best }: its place that
 * day, from 1, or 0 when it did not make the top BOARD.keep; and whether it now leads the day.
 * A row whose log is already on that day is not added again, and its place is returned as it
 * stands. The board keeps a copy of the row, never the caller's object.
 *
 * A damaged row (normalizeRow) or a key boardKey would not write is refused, rank 0, with the
 * board untouched. Storing it would gain nothing, since the store drops such rows when it next
 * reads the board.
 */
export function addRow(board: Board, key: string, row: unknown) {
  const clean = normalizeRow(row);
  if (!clean || Number.isNaN(boardDay(key))) return { rank: 0, best: false };
  if (!Object.hasOwn(board.days, key)) board.days[key] = { rows: [] };
  const { rows } = board.days[key];
  const known = rows.findIndex((other: { log: string; }) => other.log === clean.log);
  if (known >= 0) return { rank: known + 1, best: known === 0 };
  rows.push(clean);
  rows.sort(byRank);
  const place = rows.indexOf(clean);
  if (rows.length > BOARD.keep) rows.length = BOARD.keep;
  const rank = place < BOARD.keep ? place + 1 : 0;
  return { rank, best: rank === 1 };
}

/**
 * The rows of day `key`, best first, as copies the caller may keep or change. A day the board
 * does not hold has none.
 */
export function rowsFor(board: Board | null | undefined, key: string): BoardRow[] {
  const days = board?.days;
  if (!isRecord(days) || !Object.hasOwn(days, key)) return [];
  return days[key].rows.map((row) => ({ ...row, red: [...row.red] }));
}

/**
 * Forgets every day more than BOARD.days old as of UTC day `today`, under any version of the
 * rules, and any key boardKey would not write. Today and the 13 days before it stay. So does a
 * day after today: a clock once set ahead only puts off its forgetting. A `today` that is not a
 * number forgets nothing by age. Returns the board.
 */
export function pruneBoard(board: Board, today: number) {
  for (const key of Object.keys(board.days)) {
    const day = boardDay(key);
    if (Number.isNaN(day) || day <= today - BOARD.days) delete board.days[key];
  }
  return board;
}

/**
 * The rows of a day (rowsFor's, best first) with a bot's run pinned among them where it ranks, for
 * the sheet to show: under every run that outranks it and over the rest, so a run that only ties it
 * stays under it. `bot` is { who, total, peak, red }: a bot flies no tricks, so its score is its total. Its row comes back as a bot's: `via` 'bot',
 * with no start, log or byname, which normalizeRow refuses, so it can never be stored as a run. A
 * new list, holding the caller's own rows.
 */
export function withBot<T extends RankedScore>(rows: T[], bot: Omit<Score, 'style' | 'red'> & { who: string; style?: number; red: readonly number[] }): (T | BotRow)[] {
  let place = 0;
  while (place < rows.length && outranks(rows[place], bot)) place += 1;
  const pinned: BotRow = { who: bot.who, via: 'bot', total: bot.total, style: bot.style ?? 0, peak: bot.peak, red: [...bot.red], at: 0, log: '', byname: '' };
  return [...rows.slice(0, place), pinned, ...rows.slice(place)];
}

// Bound the number of cached bot scores even when storage is damaged.
const BOTS_KEPT = 8;

/**
 * A clean copy of what the bots of a day's Daily Sky came to, as the store keeps them, or null when
 * any part of it is damaged. It is
 *
 *   key      the day's board key (boardKey): the rules the bots flew under, and the UTC day
 *   seed     the sky's seed, 32 bits
 *   scores   each bot's { total, peak, red } (normalizeScore), in the order meet-bots.js flies them,
 *            one to eight of them
 *
 * Anything else in the object is left behind. Shares no object with `raw`.
 */
export function normalizeBots(raw: unknown): BotScores | null {
  if (!isRecord(raw)) return null;
  const { key, seed, scores } = raw;
  if (typeof key !== 'string' || Number.isNaN(boardDay(key))) return null;
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
  if (!Array.isArray(scores) || scores.length < 1 || scores.length > BOTS_KEPT) return null;
  const clean: Score[] = [];
  for (let i = 0; i < scores.length; i++) {
    const score = normalizeScore(scores[i]);
    if (!score) return null;
    clean.push(score);
  }
  return { key, seed, scores: clean };
}
