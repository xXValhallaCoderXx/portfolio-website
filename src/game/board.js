// Good Lift's local board: the best runs of each Daily Sky flown on this device, kept inside the
// game's own store (good-lift-store.js, under 'good-lift-v1'). A day's board is the top BOARD.keep
// runs flown on one UTC day under one version of the rules (sim-version.js), since a run flown
// under one version is never judged against another. Runs rank by total, then by peak, then by
// which started first, so a board always has one order.
//
// Every row keeps its run's log. The log is its proof, because a replay of it flies to the same
// total, and it is the seam for Slice 2's online board, which will be sent exactly that. A row
// comes from a run flown here ('me') or from a challenge link ('link'), and the same log is never
// on a day twice: a challenger opened twice, or your own run sent back to you, keeps one row.
//
// Everything here works on a plain object, { days: { 'version:day': { rows: [row, …] } } }, so the
// store can write it as JSON and read it back. Nothing here touches storage or the clock.

// How much the board remembers: the best `keep` runs of each day, for `days` UTC days (today and
// the 13 before it). A row is about 1.2 KB, mostly its log, so a full board is some 170 KB.
export const BOARD = Object.freeze({ keep: 10, days: 14 });

// What one row may hold. A log is base64url (recorder.js writes it) under `log` characters (8 KB):
// a real run's is 1.1 to 1.6 thousand, and a challenge link longer than that is not read at all.
// `lights` is more lifts than any run is judged (the meet keeps 16, and the fog allows twelve
// lines and the mist), so a damaged row's lights cannot grow without bound.
export const ROW = Object.freeze({ log: 8192, lights: 32 });

/** The board key of a UTC day's Daily Sky flown under one version of the rules. */
export const boardKey = (version, day) => `${version}:${day}`;

/** A board with no runs on it. */
export function emptyBoard() {
  return { days: {} };
}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isAmount = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const KEY = /^(0|[1-9]\d*):(0|[1-9]\d*)$/;
const WHO = /^(?:[A-Z]{3})?$/;
const LOG = /^[A-Za-z0-9_-]+$/;

// The UTC day a board key names, or NaN for a key boardKey would never write. Only such keys get
// onto a board, so nothing read back from storage can name a day '__proto__'.
function dayIn(key) {
  const match = typeof key === 'string' ? KEY.exec(key) : null;
  if (!match || !Number.isSafeInteger(Number(match[1])) || !Number.isSafeInteger(Number(match[2]))) return NaN;
  return Number(match[2]);
}

// Best first: the heavier total, then the higher peak, then the run that started first. The sort
// is stable, so a run that ties another exactly in all three ranks after the one already there.
const byRank = (a, b) => b.total - a.total || b.peak - a.peak || a.at - b.at;

/**
 * A clean copy of a board row, or null when any part of it is damaged. A row is
 *
 *   who     '' for a run flown unnamed, or three capitals A to Z
 *   via     'me' for a run flown here, 'link' for one read from a challenge link
 *   total   kg, a whole number of 2.5 kg steps
 *   peak    m, whole metres
 *   red     each lift's lights in lift order, the mist last: 0 to 7 (bit 0 contact, bit 1
 *           control, bit 2 airspace), at most ROW.lights of them
 *   at      ms since 1970 when the run started
 *   log     the run's log, non-empty base64url under ROW.log characters
 *
 * Anything else in the object is left behind. A damaged row is dropped, never repaired: a total
 * rounded to the nearest plate, or a name guessed from lower case, would be a run nobody flew,
 * and its log would not replay to it.
 */
export function normalizeRow(row) {
  if (!isRecord(row)) return null;
  const { who, via, total, peak, red, at, log } = row;
  if (typeof who !== 'string' || !WHO.test(who)) return null;
  if (via !== 'me' && via !== 'link') return null;
  // Twice the total is a whole number of 5 kg exactly when the total is a multiple of 2.5, and
  // doubling is exact in floating point, so no near miss rounds its way onto the board.
  if (!isAmount(total) || !Number.isInteger(total * 2) || (total * 2) % 5 !== 0) return null;
  if (!Number.isInteger(peak) || peak < 0) return null;
  if (!Array.isArray(red) || red.length > ROW.lights) return null;
  // Each light by its index, not with `every`, which skips a gap in a sparse array. A gap copied
  // here would be written to storage as null and dropped on the next read, so a run ranked now
  // would be gone after a reload.
  for (let i = 0; i < red.length; i++) {
    const light = red[i];
    if (!Number.isInteger(light) || light < 0 || light > 7) return null;
  }
  if (!isAmount(at)) return null;
  if (typeof log !== 'string' || log.length >= ROW.log || !LOG.test(log)) return null;
  return { who, via, total, peak, red: [...red], at, log };
}

/**
 * A clean board from anything, such as what storage hands back. A day is kept only under a key
 * boardKey writes, with its whole rows (normalizeRow) in rank order, each log once (its higher
 * placed copy) and no more than BOARD.keep of them. A log's other copies go before the ten are
 * counted, so a copy never costs another run its place. A day with no whole rows left is
 * forgotten. Never throws on anything JSON can hold (an object built to throw when read can; the
 * store's normaliser catches that), and shares no object with `raw`.
 */
export function normalizeBoard(raw) {
  const board = emptyBoard();
  if (!isRecord(raw) || !isRecord(raw.days)) return board;
  for (const key of Object.keys(raw.days)) {
    const day = raw.days[key];
    if (Number.isNaN(dayIn(key)) || !isRecord(day) || !Array.isArray(day.rows)) continue;
    const rows = [];
    for (const row of day.rows.map((candidate) => normalizeRow(candidate)).filter(Boolean).sort(byRank)) {
      if (rows.length === BOARD.keep) break;
      if (!rows.some((other) => other.log === row.log)) rows.push(row);
    }
    if (rows.length) board.days[key] = { rows };
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
export function addRow(board, key, row) {
  const clean = normalizeRow(row);
  if (!clean || Number.isNaN(dayIn(key))) return { rank: 0, best: false };
  if (!Object.hasOwn(board.days, key)) board.days[key] = { rows: [] };
  const { rows } = board.days[key];
  const known = rows.findIndex((other) => other.log === clean.log);
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
export function rowsFor(board, key) {
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
export function pruneBoard(board, today) {
  for (const key of Object.keys(board.days)) {
    const day = dayIn(key);
    if (Number.isNaN(day) || day <= today - BOARD.days) delete board.days[key];
  }
  return board;
}
