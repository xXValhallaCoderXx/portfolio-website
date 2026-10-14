import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD, ROW, addRow, boardKey, emptyBoard, normalizeBoard, normalizeRow, pruneBoard, rowsFor } from './board.js';

const DAY = 20_756;
const KEY = boardKey(1, DAY);

// A whole row: a run flown here, unnamed, every light white. Each run on a day needs its own log.
const row = (fields = {}) => ({ who: '', via: 'me', total: 100, peak: 600, red: [0, 0, 0], at: 1_000, log: 'AQ', ...fields });
const logs = (board, key = KEY) => rowsFor(board, key).map(({ log }) => log);

test('the ten best runs of a day are kept, best total first, then peak, then the earliest', () => {
  assert.deepEqual(BOARD, { keep: 10, days: 14 });
  assert.equal(boardKey(1, DAY), '1:20756');
  const board = emptyBoard();
  assert.deepEqual(addRow(board, KEY, row({ total: 200, log: 'first' })), { rank: 1, best: true });
  assert.deepEqual(addRow(board, KEY, row({ total: 300, log: 'heavier' })), { rank: 1, best: true });
  assert.deepEqual(addRow(board, KEY, row({ total: 200, peak: 700, log: 'higher' })), { rank: 2, best: false });
  assert.deepEqual(addRow(board, KEY, row({ total: 200, at: 500, log: 'earlier' })), { rank: 3, best: false });
  // A run that ties one already there in total, peak and start ranks after it.
  assert.deepEqual(addRow(board, KEY, row({ total: 200, log: 'twin' })), { rank: 5, best: false });
  for (let i = 0; i < 5; i++) assert.equal(addRow(board, KEY, row({ total: 100 - 2.5 * i, log: `light${i}` })).rank, 6 + i);
  assert.equal(rowsFor(board, KEY).length, BOARD.keep);
  // An eleventh run lighter than all ten is not kept; a heavier one pushes the lightest off.
  assert.deepEqual(addRow(board, KEY, row({ total: 50, log: 'tooLight' })), { rank: 0, best: false });
  assert.deepEqual(addRow(board, KEY, row({ total: 250, log: 'late' })), { rank: 2, best: false });
  assert.deepEqual(logs(board), ['heavier', 'late', 'higher', 'earlier', 'first', 'twin', 'light0', 'light1', 'light2', 'light3']);
  // Each day, and each version of the rules, has a board of its own.
  assert.deepEqual(addRow(board, boardKey(1, DAY + 1), row({ total: 2.5, log: 'tomorrow' })), { rank: 1, best: true });
  assert.deepEqual(addRow(board, boardKey(2, DAY), row({ total: 2.5, log: 'newRules' })), { rank: 1, best: true });
  assert.equal(rowsFor(board, KEY).length, BOARD.keep);
});

test('a run already on the board is kept once, whoever brings it', () => {
  const board = emptyBoard();
  addRow(board, KEY, row({ total: 300, log: 'top' }));
  assert.deepEqual(addRow(board, KEY, row({ total: 200, log: 'mine' })), { rank: 2, best: false });
  // The same run again, even read back from a challenge link with a name on it, keeps its one row and place.
  assert.deepEqual(addRow(board, KEY, row({ total: 200, log: 'mine' })), { rank: 2, best: false });
  assert.deepEqual(addRow(board, KEY, row({ who: 'REN', via: 'link', total: 200, log: 'mine' })), { rank: 2, best: false });
  assert.deepEqual(addRow(board, KEY, row({ total: 300, log: 'top' })), { rank: 1, best: true });
  assert.deepEqual(rowsFor(board, KEY).map(({ log, via, who }) => [log, via, who]), [['top', 'me', ''], ['mine', 'me', '']]);
  // Another day's board, or another version's, is another board.
  assert.equal(addRow(board, boardKey(1, DAY + 1), row({ log: 'mine' })).rank, 1);
  assert.equal(addRow(board, boardKey(2, DAY), row({ log: 'mine' })).rank, 1);
});

test('the board keeps its own copy of a row, and hands out copies', () => {
  const board = emptyBoard();
  const mine = row({ red: [0, 1], log: 'mine' });
  addRow(board, KEY, mine);
  mine.total = 999;
  mine.red.push(7);
  assert.deepEqual(rowsFor(board, KEY), [row({ red: [0, 1], log: 'mine' })]);
  const handed = rowsFor(board, KEY);
  handed[0].peak = 1;
  handed[0].red.push(7);
  handed.pop();
  assert.deepEqual(rowsFor(board, KEY), [row({ red: [0, 1], log: 'mine' })]);
  // A day the board does not hold has no rows, whatever its key looks like.
  for (const key of [boardKey(1, DAY - 1), 'constructor', '__proto__', 'toString']) assert.deepEqual(rowsFor(board, key), [], key);
  assert.deepEqual(rowsFor(emptyBoard(), KEY), []);
});

test('old days are forgotten, under any version of the rules', () => {
  const board = emptyBoard();
  const keys = [
    boardKey(1, DAY), boardKey(1, DAY - 13), boardKey(1, DAY - 14), boardKey(1, DAY - 400),
    boardKey(0, DAY - 1), boardKey(0, DAY - 14), boardKey(1, DAY + 1),
  ];
  for (const key of keys) addRow(board, key, row());
  assert.equal(pruneBoard(board, DAY), board);
  // Today and the 13 days before it stay; a day after today (a clock once set ahead) waits its turn.
  assert.deepEqual(Object.keys(board.days).sort(), [boardKey(0, DAY - 1), boardKey(1, DAY - 13), boardKey(1, DAY), boardKey(1, DAY + 1)].sort());
  pruneBoard(board, DAY + 1);
  assert.deepEqual(Object.keys(board.days).sort(), [boardKey(0, DAY - 1), boardKey(1, DAY), boardKey(1, DAY + 1)].sort());
  // A today that is no number forgets nothing; a key boardKey would not write is always forgotten.
  board.days.yesterday = { rows: [row()] };
  pruneBoard(board, NaN);
  assert.deepEqual(Object.keys(board.days).sort(), [boardKey(0, DAY - 1), boardKey(1, DAY), boardKey(1, DAY + 1)].sort());
  pruneBoard(board, DAY + 14);
  assert.deepEqual(Object.keys(board.days), [boardKey(1, DAY + 1)]);
  pruneBoard(board, DAY + 15);
  assert.deepEqual(board, emptyBoard());
});

test('a damaged row is dropped rather than repaired', () => {
  const good = { who: 'REN', via: 'link', total: 512.5, peak: 1412, red: [0, 2, 0, 7], at: 1_791_000_000_000, log: 'AQGv-_x9' };
  assert.deepEqual(normalizeRow(good), good);
  assert.notEqual(normalizeRow(good).red, good.red);
  assert.deepEqual(normalizeRow({ ...good, total: 0, peak: 0, red: [], at: 0, who: '', via: 'me' }), { ...good, total: 0, peak: 0, red: [], at: 0, who: '', via: 'me' });
  assert.deepEqual(normalizeRow({ ...good, ghost: true }), good, 'anything else in a row is left behind');
  assert.equal(normalizeRow({ ...good, log: 'A'.repeat(ROW.log - 1) }).log.length, ROW.log - 1);
  assert.deepEqual(normalizeRow({ ...good, red: Array(ROW.lights).fill(7) }).red, Array(ROW.lights).fill(7));
  const damaged = {
    'initials in lower case': { who: 'ren' },
    'two initials': { who: 'RE' },
    'initials that are not text': { who: null },
    'an unknown way onto the board': { via: 'ghost' },
    'a total of no plate': { total: 101 },
    'a total a quarter plate off': { total: 101.25 },
    'a total just off a plate': { total: 512.5000000000001 },
    'a negative total': { total: -2.5 },
    'an endless total': { total: Infinity },
    'a total as text': { total: '100' },
    'a peak between metres': { peak: 600.5 },
    'a negative peak': { peak: -1 },
    'a peak that is no number': { peak: NaN },
    'lights that are not a list': { red: 0 },
    'a light past three bits': { red: [0, 8] },
    'a negative light': { red: [-1] },
    'a light between masks': { red: [1.5] },
    'a light as text': { red: ['1'] },
    'more lights than any run': { red: Array(ROW.lights + 1).fill(0) },
    'lights with a gap': { red: [0, , 1] },
    'lights never set': { red: Array(3) },
    'a start before 1970': { at: -1 },
    'an endless start': { at: Infinity },
    'an empty log': { log: '' },
    'a padded log': { log: 'AQ==' },
    'a log with a slash': { log: 'AQ/v' },
    'a log as long as the limit': { log: 'A'.repeat(ROW.log) },
    'no log': { log: undefined },
  };
  for (const [why, fields] of Object.entries(damaged)) assert.equal(normalizeRow({ ...good, ...fields }), null, why);
  for (const nonsense of [null, undefined, 'row', 7, [], [good]]) assert.equal(normalizeRow(nonsense), null);

  // Adding one refuses it, and makes no day for it. A row with a gap in its lights in particular is
  // not ranked now only to be gone after a reload, when its gap has been written as null.
  const board = emptyBoard();
  assert.deepEqual(addRow(board, KEY, { ...good, total: 101 }), { rank: 0, best: false });
  assert.deepEqual(addRow(board, KEY, { ...good, red: Array(3) }), { rank: 0, best: false });
  for (const key of ['today', '__proto__', '01:20756', '1:020756']) assert.deepEqual(addRow(board, key, good), { rank: 0, best: false }, key);
  assert.deepEqual(board, emptyBoard());
  assert.equal(Object.getPrototypeOf(board.days), Object.prototype);

  // A stored board, as storage hands it back: its damaged rows and repeated logs go, the rest stand
  // in rank order, ten at most; a day left empty and a key boardKey would not write go too, in
  // either half of the key.
  const twelve = Array.from({ length: 12 }, (_, i) => row({ total: 2.5 * i, log: `r${i}` }));
  const stored = JSON.parse(JSON.stringify({
    days: {
      [KEY]: { rows: [row({ total: 100, log: 'b' }), { ...good, total: 101 }, row({ total: 200, log: 'a' }), row({ total: 50, log: 'a' }), 'row', null] },
      [boardKey(1, DAY - 1)]: { rows: [{ ...good, who: 'ren' }] },
      [boardKey(1, DAY - 2)]: { rows: 'none' },
      [boardKey(1, DAY - 3)]: { rows: twelve },
      // Eleven runs and a second copy of the best: the copy goes before the ten are counted, so ten stand.
      [boardKey(1, DAY - 4)]: { rows: [...twelve.slice(1), twelve[11]] },
      [boardKey(2, DAY)]: [good],
      yesterday: { rows: [good] },
      '1:020756': { rows: [good] },
      '1:99999999999999999999': { rows: [good] },
      '01:20756': { rows: [good] },
      '99999999999999999999:20756': { rows: [good] },
    },
    extra: true,
  }).replace('"yesterday"', '"__proto__"'));
  assert.ok(Object.hasOwn(stored.days, '__proto__'), 'the stored board names a day __proto__');
  const read = normalizeBoard(stored);
  assert.deepEqual(Object.keys(read).sort(), ['days']);
  assert.deepEqual(Object.keys(read.days).sort(), [KEY, boardKey(1, DAY - 3), boardKey(1, DAY - 4)].sort());
  assert.equal(Object.getPrototypeOf(read.days), Object.prototype);
  assert.deepEqual(rowsFor(read, KEY), [row({ total: 200, log: 'a' }), row({ total: 100, log: 'b' })]);
  assert.deepEqual(logs(read, boardKey(1, DAY - 3)), ['r11', 'r10', 'r9', 'r8', 'r7', 'r6', 'r5', 'r4', 'r3', 'r2']);
  assert.deepEqual(logs(read, boardKey(1, DAY - 4)), ['r11', 'r10', 'r9', 'r8', 'r7', 'r6', 'r5', 'r4', 'r3', 'r2']);
  for (const nonsense of [null, undefined, [], 'board', { days: [] }, { days: null }, { days: 'x' }]) assert.deepEqual(normalizeBoard(nonsense), emptyBoard());
});
