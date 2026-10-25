import type { ApiReply, BoardChange, BoardDocument, BoardLimits } from '../src/board.types.ts';
import type { WorldRow } from '../../src/domains/good-lift/board.types.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, ORIGINS, clientAddress, clientKey, createBoard, createLimiter, judge, publicBoard, readDay, withdraw } from '../src/runs.ts';
import { bytesOf, fly, rewrite, textOf } from './flights.ts';
import { MAX_LINK, encodeLog } from '../../src/domains/good-lift/recorder.ts';
import { SIM_VERSION } from '../../src/domains/good-lift/sim-version.ts';
import { DAILY_EPOCH, DAY_MS } from '../../src/domains/good-lift/good-lift-address.ts';
import { BOARD, boardKey, outranks } from '../../src/domains/good-lift/board.ts';
import { WORLD_BOARD } from '../../src/domains/good-lift/board-world.ts';
import { runId } from '../../src/adapters/crypto/run-identity.service.ts';
import { bynameFor } from '../../src/domains/good-lift/meet-bynames.ts';
import { BLOCKED } from '../../src/domains/good-lift/meet-initials.ts';
import { GLIDERS, LOG_WINGS } from '../../src/domains/good-lift/glider-ids.ts';

// The day the tests are run on, five hours into it, and its board's key.
const DAY = DAILY_EPOCH + 30;
const NOW = DAY * DAY_MS + 5 * 3_600_000;
const KEY = boardKey(SIM_VERSION, DAY);
// Two devices' tokens, as board-online.js makes them, and where their requests come from.
const ME = 'Q2hvc2VuLWJ5LWEtZmFpci1kaWNlLXJvbGwtZm9yLW1l';
const YOU = 'WW91cnMtaXMtYS1kaWZmZXJlbnQtdG9rZW4tYWx0b2dldGg';
const HOME = '203.0.113.7';
const AWAY = '198.51.100.20';

// Runs of today's Daily Sky, each flown once for every test here: three pilots the fog judges, one
// that touches down, and the last of them on yesterday's sky too.
type Flown = ReturnType<typeof fly>;
let flown: Record<string, Flown> | null = null;
const runs = () => (flown ??= {
  column: fly(DAY, 'column'),
  eased: fly(DAY, 'eased', { initials: 'TOR' }),
  collector: fly(DAY, 'collector', { initials: 'SIF' }),
  bar: fly(DAY, 'bar', { initials: 'ULL' }),
  landing: fly(DAY, 'landing', { initials: 'ULL' }),
  yesterday: fly(DAY - 1, 'bar'),
});
// The runs the fog judged, best first, as the board ranks them (by what they truly came to).
const ranked = () => ['column', 'eased', 'collector'].map((name) => runs()[name]).sort((a, b) => (outranks(a.sheet, b.sheet) ? -1 : outranks(b.sheet, a.sheet) ? 1 : 0));

// Every object in `value`, frozen, so a change that touches what it was handed throws.
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) freeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

// A store as Firestore is to runs.js: whole documents by key, changed in a transaction that may run
// its change more than once. This one always runs it twice on the same frozen document and keeps
// the second, so a change that touched what it was handed, or came to anything else the second
// time, fails the test.
function fakeStore() {
  const docs = new Map<string, BoardDocument>();
  const counts = { reads: 0, writes: 0 };
  return {
    docs,
    counts,
    async read(key: string) {
      counts.reads += 1;
      return docs.has(key) ? structuredClone(docs.get(key)) : null;
    },
    async update(key: string, change: (doc: unknown) => BoardChange) {
      const held = docs.has(key) ? freeze(structuredClone(docs.get(key))) : null;
      const first = change(held);
      const again = change(held);
      assert.deepEqual(again, first, 'a transaction tried again comes to the same');
      if (again.doc) {
        counts.writes += 1;
        docs.set(key, structuredClone(again.doc));
      }
      return again.result;
    },
  };
}

// The limits, but with no address ever asking too often: the minute's limits have a test of their own.
const OPEN: BoardLimits = { ...LIMITS, minute: { runs: Infinity, board: Infinity, remove: Infinity } };

// The function as a test meets it: a fake store, a clock that stands still unless moved, and what
// it notes for its owner. `send`, `ask` and `drop` are its three routes.
function service({ limits = OPEN, store = fakeStore() }: {limits?:BoardLimits;store?:ReturnType<typeof fakeStore>} = {}) {
  const clock = { now: NOW };
  const noted: Array<{message:string;detail:unknown}> = [];
  const board = createBoard({ store, now: () => clock.now, log: (message, detail) => noted.push({ message, detail }), limits });
  return {
    store,
    clock,
    noted,
    handle: board.handle,
    send: (log: string, { token = ME, ip = HOME } = {}) => board.handle({ method: 'POST', path: '/runs', body: JSON.stringify({ log, token }), ip }),
    ask: (day = DAY, ip = HOME) => board.handle({ method: 'GET', path: `/board/${day}`, ip }),
    drop: (day = DAY, token = ME, ip = HOME) => board.handle({ method: 'DELETE', path: `/runs/${day}`, ip, authorization: `Bearer ${token}` }),
  };
}

// The row a run's own replay makes, as the board should show it, taken at `at`.
async function rowOf({ sheet, log }: Flown, at = NOW) {
  return { who: log.initials, byname: bynameFor(sheet), total: sheet.total, style: sheet.stats.style, peak: sheet.peak, red: sheet.lifts.map((lift: {red:number}) => lift.red),
    glider: log.glider, at, id: await runId(log) };
}

test('a named run of the Daily Sky goes on the world board as its replay came to, and anyone may see it but not the device it came from', async () => {
  const { column } = runs();
  assert.ok(['fog', 'landed', 'time'].includes(column.sheet.reason));
  const fn = service();
  const sent = await fn.send(column.text);
  const row = await rowOf(column);
  assert.equal(sent.status, 200);
  assert.equal(sent.cache, 'no-store');
  assert.deepEqual(sent.body, { ok: true, rank: 1, board: { version: SIM_VERSION, day: DAY, rows: [row] } });

  // Kept: the row, a digest of the device and one of what the run flew (to know copies by), and how
  // many runs the device has sent; never its token, the log or the address it was sent from.
  const doc = fn.store.docs.get(KEY)!;
  assert.deepEqual(Object.keys(doc).sort(), ['day', 'devices', 'expires', 'rows', 'updated', 'version']);
  assert.match(doc.rows[0].device, /^[0-9a-f]{32}$/);
  assert.match(doc.rows[0].flight!, new RegExp(`^[0-9a-f]{${WORLD_BOARD.id}}$`));
  assert.deepEqual(doc.rows, [{ ...row, device: doc.rows[0].device, flight: doc.rows[0].flight }]);
  assert.deepEqual(doc.devices, { [doc.rows[0].device]: 1 });
  assert.equal(doc.updated, NOW);
  // The day's board is deleted (by a TTL policy on `expires`) once it leaves the fortnight it is served for.
  assert.equal(doc.expires.getTime(), (DAY + BOARD.days) * DAY_MS);
  const stored = JSON.stringify(doc);
  for (const secret of [ME, column.text, HOME]) assert.equal(stored.includes(secret), false, secret);

  // The day's board, to anyone, cached for half a minute: the same row, without the device.
  const asked = await fn.ask(DAY, AWAY);
  assert.equal(asked.status, 200);
  assert.equal(asked.cache, `public, max-age=${LIMITS.cache}`);
  assert.deepEqual(asked.body, { ok: true, board: { version: SIM_VERSION, day: DAY, rows: [row] } });
});

test('a run on any glider goes on the board, its row naming the glider, and the same keys on another glider are another run', async () => {
  const fn = service();
  const ids = new Set<string>();
  for (const [i, glider] of GLIDERS.entries()) {
    const flight = fly(DAY, 'eased', { glider, initials: 'TOR' });
    assert.equal(flight.log.glider, glider);
    const sent = await fn.send(flight.text, { token: `${ME}${i}` });
    assert.equal(sent.status, 200, `${glider}: ${JSON.stringify(sent.body)}`);
    const id = await runId(flight.log);
    assert.equal(sent.body.board!.rows.find((each) => each.id === id)?.glider, glider);
    ids.add(id);
  }
  assert.equal(ids.size, GLIDERS.length, 'one id for each glider flown');
  const rows = fn.store.docs.get(KEY)!.rows;
  assert.deepEqual(rows.map((each) => each.glider).sort(), [...GLIDERS].sort());
});

test('the server verifies quantized independent brakes and mixed digital steps against the exact live result', async () => {
  const flight = fly(DAY, 'analog');
  const fn = service();
  const response = await fn.send(flight.text);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.board!.rows, [await rowOf(flight)]);
});

test('a run that ended by touching down ranks as one the fog ended, and yesterday\'s sky is still taken today', async () => {
  const { landing: bar, yesterday } = runs();
  assert.equal(bar.sheet.reason, 'landed', 'this actual touchdown must rank');
  assert.ok(['fog', 'landed', 'time'].includes(yesterday.sheet.reason), 'yesterday may end by any judged outcome');
  const fn = service();
  const landed = await fn.send(bar.text);
  assert.equal(landed.status, 200);
  assert.deepEqual(landed.body.board!.rows, [await rowOf(bar)]);
  // A run begun before midnight is sent after it: yesterday's board takes it, on its own document.
  const late = await fn.send(yesterday.text);
  assert.equal(late.status, 200);
  assert.deepEqual(late.body.board, { version: SIM_VERSION, day: DAY - 1, rows: [await rowOf(yesterday)] });
  assert.deepEqual([...fn.store.docs.keys()].sort(), [boardKey(SIM_VERSION, DAY - 1), KEY].sort());
  // One device is another name on each day's board, so nothing kept ties its days together.
  const names = [KEY, boardKey(SIM_VERSION, DAY - 1)].map((key) => fn.store.docs.get(key)!.rows[0].device);
  assert.notEqual(names[0], names[1]);
});

test('a run flown under other rules, on another day or sky, or ended by its pilot is turned away, and nothing is kept of it', async () => {
  const { column, bar } = runs();
  const fn = service();
  const refused = async (text: string, status: number, why: string) => {
    const answer = await fn.send(text);
    assert.deepEqual([answer.status, answer.body], [status, { ok: false, why }], why);
  };
  for (const simVersion of [SIM_VERSION - 1, SIM_VERSION + 1]) {
    await refused(rewrite(column, { simVersion }), 422, 'version');
  }
  // A log of the format before this one (no wing named) was flown under the rules before these.
  const bytes = bytesOf(column.text);
  assert.deepEqual(bytes.slice(0, 3), [3, SIM_VERSION, LOG_WINGS.indexOf(column.log.glider)]);
  await refused(textOf([2, ...bytes.slice(1, 2), ...bytes.slice(3)]), 422, 'version');
  // A wing this build does not know, and the classic wing, which no run is flown on.
  await refused(textOf([...bytes.slice(0, 2), LOG_WINGS.length, ...bytes.slice(3)]), 422, 'glider');
  await refused(rewrite(column, { glider: 'classic' }), 422, 'glider');
  // The same keys on another glider fly another run, which the log no longer fits: it ends before the
  // log does, or somewhere else, or comes to another sheet than the log claims.
  for (const glider of GLIDERS.filter((each) => each !== column.log.glider)) {
    const other = await fn.send(rewrite(column, { glider }));
    assert.equal(other.status, 422, glider);
    assert.ok(['corrupt', 'ending', 'mismatch'].includes(other.body.why!), `${glider}: ${other.body.why}`);
  }
  // Only today's Daily Sky and yesterday's: not the day before, not tomorrow's, not a practice sky.
  for (const day of [DAY - 2, DAY + 1, 0]) await refused(rewrite(column, { day }), 422, 'day');
  // A log that names yesterday but was flown on today's sky is not yesterday's run.
  await refused(rewrite(column, { day: DAY - 1 }), 422, 'seed');
  // Ended part of the way up, by its pilot: the bar it carried is forfeit, and so is its place.
  const quit = fly(DAY, 'column', { quit: 600 });
  assert.equal(quit.sheet.reason, 'quit');
  await refused(quit.text, 422, 'ending');
  // A log that flies on after its run touched down is no recording at all.
  const steps = bar.log.steps + 60;
  const more = new Uint8Array(steps).fill(0);
  more.set(bar.log.bits);
  await refused(encodeLog(bar.log, more, steps), 422, 'corrupt');
  assert.equal(fn.store.docs.size, 0);
  assert.equal(fn.store.counts.writes, 0);
});

test('a request that is not exactly a run and a token is refused as it is read, and so is one longer than any run', async () => {
  const { column } = runs();
  const fn = service();
  const post = (body: unknown) => fn.handle({ method: 'POST', path: '/runs', body, ip: HOME });
  for (const body of ['', 'not json', '[]', '{}', JSON.stringify({ log: column.text }), JSON.stringify({ log: 7, token: ME }), JSON.stringify({ token: ME })]) {
    assert.deepEqual(await post(body), { status: 400, body: { ok: false, why: 'body' }, cache: 'no-store' }, body);
  }
  for (const token of ['', 'short', `${ME}!`, `${ME} `, 'A'.repeat(LIMITS.token[1] + 1)]) {
    assert.deepEqual((await post(JSON.stringify({ log: column.text, token }))).body, { ok: false, why: 'token' }, token);
  }
  // The bytes the functions framework keeps of a body, or an object a parser already read, the same.
  assert.equal((await post(new TextEncoder().encode(JSON.stringify({ log: column.text, token: ME })))).status, 200);
  assert.equal((await post({ log: column.text, token: 'short' })).body.why, 'token');
  // A log cut short or damaged, as recorder.js reads it.
  assert.deepEqual((await fn.send(column.text.slice(0, -3))).body, { ok: false, why: 'truncated' });
  assert.deepEqual((await fn.send(`${column.text.slice(0, -1)}=`)).body, { ok: false, why: 'corrupt' });
  // Longer than a link can be: the log itself, and a body longer than any run's.
  assert.deepEqual(await fn.send('A'.repeat(MAX_LINK + 1)), { status: 413, body: { ok: false, why: 'long' }, cache: 'no-store' });
  assert.deepEqual(await post('x'.repeat(LIMITS.body + 1)), { status: 413, body: { ok: false, why: 'long' }, cache: 'no-store' });
  assert.equal((await post(new Uint8Array(LIMITS.body + 1))).status, 413);
});

test('only a run flown under initials the board will show goes on it: initials are how a pilot opts in', async () => {
  const { column } = runs();
  const fn = service();
  assert.deepEqual((await fn.send(rewrite(column, { initials: '' }))).body, { ok: false, why: 'initials' });
  for (const initials of BLOCKED) assert.deepEqual((await fn.send(rewrite(column, { initials }))).body, { ok: false, why: 'initials' }, initials);
  assert.equal(fn.store.docs.size, 0);
});

test('a run whose log claims another total or peak than its replay comes to is turned away, and its owner is told', async () => {
  const { column } = runs();
  const fn = service();
  for (const claim of [{ total: column.sheet.total + 2.5 }, { peak: column.sheet.peak + 1 }]) {
    assert.deepEqual(await fn.send(rewrite(column, claim)), { status: 422, body: { ok: false, why: 'mismatch' }, cache: 'no-store' });
  }
  assert.equal(fn.store.docs.size, 0);
  assert.equal(fn.noted.length, 2);
  assert.deepEqual((fn.noted[0].detail as {replayed:unknown}).replayed, { total: column.sheet.total, peak: column.sheet.peak });
  // What is noted names the run, never who sent it.
  assert.equal(JSON.stringify(fn.noted).includes(ME), false);
});

// Rows for the board's own rules: a run's numbers as any run might have them, its id and its device.
const hex = (n: number, digits: number) => n.toString(16).padStart(digits, '0');
const row = (n: number, total: number, peak: number, at = NOW + n, style = 0) => ({ who: 'ABC', byname: '', total, style, peak, red: [0], at, id: hex(n, WORLD_BOARD.id),
  glider: GLIDERS[n % GLIDERS.length] as string });
const device = (n: number) => hex(n, 32);
const ON = { version: SIM_VERSION, day: DAY, at: NOW };
// Puts each [row, device] on a board in turn, as runs come in, and returns the last reply and the board.
function board(entries: Array<[WorldRow, string]>, doc: BoardDocument | null = null) {
  let result: ApiReply | null = null;
  for (const [each, from] of entries) {
    const next = judge(doc, { row: each, device: from }, { ...ON, at: each.at });
    doc = next.doc ?? doc;
    result = next.result;
  }
  assert.ok(doc); assert.ok(result);
  return { doc, result, rows: readDay(doc).rows };
}

test('the board adds uncapped banked acro to lifted points, with the same exact ties as the page', () => {
  // 100 kg plus 25 acro beats 120 kg; 100 kg plus 20 acro ties it, and the higher peak goes first.
  const { rows } = board([
    [row(1, 120, 500), device(1)],
    [row(2, 100, 500, NOW + 2, 25), device(2)],
    [row(3, 100, 600, NOW + 3, 20), device(3)],
    [row(4, 0, 700, NOW + 4, 1500), device(4)],
  ]);
  assert.deepEqual(rows.map((each) => each.id), [4, 2, 3, 1].map((n) => hex(n, WORLD_BOARD.id)));
  assert.deepEqual(rows.map((each) => each.style), [1500, 25, 20, 0]);
});

test('the board ranks by total, then by peak, then by which run came first', () => {
  const { rows, result } = board([
    [row(1, 100, 500), device(1)],
    [row(2, 102.5, 400), device(2)],
    [row(3, 100, 600), device(3)],
    [row(4, 100, 500), device(4)],
    [row(5, 95, 900), device(5)],
  ]);
  assert.deepEqual(rows.map((each) => each.id), [2, 3, 1, 4, 5].map((n) => hex(n, WORLD_BOARD.id)));
  // A run that ties another exactly goes under it, and its rank says so.
  assert.equal(result.body.rank, 5);
  const tie = board([[row(6, 100, 500), device(6)]], board([[row(1, 100, 500), device(1)]]).doc);
  assert.equal(tie.result.body.rank, 2);
});

test('the board keeps its best hundred: a run that does not make them is counted but not kept, and one that does pushes the last off', () => {
  const full = board(Array.from({ length: WORLD_BOARD.keep }, (_, n) => [row(n, 1000 - 2.5 * n, 500), device(n)]));
  assert.equal(full.rows.length, WORLD_BOARD.keep);
  assert.equal(full.result.body.rank, WORLD_BOARD.keep);
  const short = board([[row(500, 1000 - 2.5 * WORLD_BOARD.keep, 500), device(500)]], full.doc);
  assert.deepEqual(short.result.body, { ok: true, rank: 0, board: publicBoard(full, SIM_VERSION, DAY) });
  assert.deepEqual(short.rows, full.rows);
  assert.equal(short.doc.devices[device(500)], 1);
  // Level on kilos with the 81st and higher, it goes over it, and the last is gone.
  const placed = board([[row(501, 1000 - 2.5 * 80, 501), device(501)]], short.doc);
  assert.equal(placed.result.body.rank, 81);
  assert.equal(placed.rows.length, WORLD_BOARD.keep);
  assert.equal(placed.rows[80].id, hex(501, WORLD_BOARD.id));
  assert.equal(placed.rows.some((each) => each.id === hex(WORLD_BOARD.keep - 1, WORLD_BOARD.id)), false);
});

test('a run is never on the board twice: sent again from its device it keeps its place, and from any other, renamed or not, it is a duplicate', async () => {
  const { column, eased } = runs();
  const fn = service();
  await fn.send(eased.text, { token: YOU });
  const first = await fn.send(column.text);
  const writes = fn.store.counts.writes;
  const again = await fn.send(column.text);
  assert.equal(again.status, 200);
  assert.deepEqual(again.body, first.body);
  for (const text of [column.text, rewrite(column, { initials: 'TOR' }), rewrite(column, { touch: true })]) {
    const copy = await fn.send(text, { token: YOU, ip: AWAY });
    assert.equal(copy.status, 409);
    assert.equal(copy.body.why, 'duplicate');
    assert.equal(copy.body.board!.rows.length, 2);
  }
  // A run already there changes nothing, so it is neither written nor counted against anyone.
  assert.equal(fn.store.counts.writes, writes);
  assert.deepEqual(Object.values(fn.store.docs.get(KEY)!.devices), [1, 1]);
});

test('a copy using the two-arrow bar chord under its brake is the same run, and a duplicate', async () => {
  // The run circling on the light brake, which holds the brake straight on many steps.
  const { eased: column } = runs();
  const fn = service();
  assert.equal((await fn.send(column.text)).status, 200);
  // The brake wins over the two-arrow speed-bar chord.
  const bits = Uint8Array.from(column.log.bits);
  let braked = 0;
  for (let i = 0; i < column.log.steps; i++) {
    if (bits[i] !== 4) continue;
    bits[i] = 7;
    braked += 1;
  }
  assert.ok(braked > 0, 'the run held the brake straight on some steps');
  const copy = encodeLog({ ...column.log, initials: 'XYZ' }, bits, column.log.steps);
  const sent = await fn.send(copy, { token: YOU, ip: AWAY });
  assert.deepEqual([sent.status, sent.body.why], [409, 'duplicate']);
  assert.equal(sent.body.board!.rows.length, 1);
  // What a run flew is kept to tell copies by, and never shown.
  assert.ok(fn.store.docs.get(KEY)!.rows[0].flight);
  assert.ok(sent.body.board!.rows.every((row) => !('flight' in row) && !('device' in row)));
});

test('copies of one run sent under token after token are neither counted nor written, so they never shut a pilot out', async () => {
  const { bar, column } = runs();
  // A day that counts runs from no more than three devices.
  const fn = service({ limits: { ...OPEN, devices: 3 } });
  assert.equal((await fn.send(bar.text)).status, 200);
  const writes = fn.store.counts.writes;
  for (let n = 0; n < 12; n++) {
    const copy = await fn.send(bar.text, { token: `made-up-token-number-${String(n).padStart(4, '0')}`, ip: `2001:db8:${n}::1` });
    assert.deepEqual([copy.status, copy.body.why], [409, 'duplicate']);
  }
  assert.equal(fn.store.counts.writes, writes);
  assert.equal(Object.keys(fn.store.docs.get(KEY)!.devices).length, 1);
  // Another pilot's run goes up as ever.
  const theirs = await fn.send(column.text, { token: YOU, ip: AWAY });
  assert.equal(theirs.status, 200);
  assert.deepEqual(theirs.body.board!.rows.map((each) => each.id).sort(), [await runId(bar.log), await runId(column.log)].sort());
});

test('a day whose count of devices is full lets a new one in, in place of one with no run on the board that has sent the fewest', () => {
  // Two devices with runs on the board, and three whose runs never made it.
  const doc = freeze({
    rows: [{ ...row(1, 100, 500), device: device(1) }, { ...row(2, 90, 500), device: device(2) }],
    devices: { [device(1)]: 1, [device(2)]: 1, [device(3)]: 5, [device(4)]: 2, [device(5)]: 2 },
  });
  const most = (devices: number) => ({ ...ON, limits: { ...LIMITS, devices } });
  const next = judge(doc, { row: row(6, 95, 500), device: device(6) }, most(5));
  assert.deepEqual([next.result.status, next.result.body.rank], [200, 2]);
  // Of the two that sent the fewest, the first by name goes.
  assert.deepEqual(readDay(next.doc).devices, { [device(1)]: 1, [device(2)]: 1, [device(3)]: 5, [device(5)]: 2, [device(6)]: 1 });
  // A count past the limit (a limit lowered since) gives up as many as it must.
  assert.deepEqual(Object.keys(readDay(judge(doc, { row: row(6, 95, 500), device: device(6) }, most(3)).doc).devices).sort(), [device(1), device(2), device(6)]);
  // A device already counted is no new one.
  assert.equal(readDay(judge(doc, { row: row(7, 95, 500), device: device(3) }, most(5)).doc).devices[device(3)], 6);
  // Only where every device counted has a run on the board is a new one turned away, and nothing is written.
  const onBoard = { rows: doc.rows, devices: { [device(1)]: 1, [device(2)]: 1 } };
  assert.deepEqual(judge(onBoard, { row: row(6, 95, 500), device: device(6) }, most(2)), { doc: null, result: { status: 429, body: { ok: false, why: 'full' }, cache: 'no-store' } });
});

test('each device keeps its best run of the day on the board: a better one takes its place, and a worse one is turned away', async () => {
  const [best, , worst] = ranked();
  assert.ok(outranks(best.sheet, worst.sheet), 'two pilots who fly the sky differently come to different sheets');
  const fn = service();
  assert.equal((await fn.send(worst.text)).body.rank, 1);
  fn.clock.now += 60_000;
  const better = await fn.send(best.text);
  assert.equal(better.status, 200);
  assert.deepEqual(better.body.board!.rows, [await rowOf(best, fn.clock.now)]);
  // The worse run, sent again, finds the device's better one there.
  const worse = await fn.send(worst.text);
  assert.deepEqual([worse.status, worse.body.ok, worse.body.why, worse.body.rank], [409, false, 'not-best', 1]);
  assert.equal(worse.body.board!.rows.length, 1);
  // And another device's run goes on beside it, in its own place.
  const mid = ranked()[1];
  const theirs = await fn.send(mid.text, { token: YOU });
  assert.equal(theirs.status, 200);
  assert.deepEqual(theirs.body.board!.rows.map((each) => each.id), [await runId(best.log), await runId(mid.log)]);
});

test('a device takes its run off the board with its token, which no other token can do', async () => {
  const { column, eased } = runs();
  const fn = service();
  await fn.send(column.text);
  await fn.send(eased.text, { token: YOU });
  const writes = fn.store.counts.writes;
  // Another device's token takes nothing, and nothing is written.
  const missed = await fn.drop(DAY, 'Tm8tcnVuLWV2ZXItY2FtZS1mcm9tLXRoaXMtZGV2aWNl');
  assert.deepEqual([missed.status, missed.body.ok, missed.body.removed, missed.body.board!.rows.length], [200, true, 0, 2]);
  assert.equal(fn.store.counts.writes, writes);
  const taken = await fn.drop(DAY, ME);
  assert.deepEqual([taken.status, taken.body.removed], [200, 1]);
  assert.deepEqual(taken.body.board!.rows, [await rowOf(eased)]);
  // Served at once, and from the store as well.
  assert.deepEqual((await fn.ask()).body.board!.rows, [await rowOf(eased)]);
  fn.clock.now += LIMITS.cache * 1000;
  assert.deepEqual((await fn.ask()).body.board!.rows, [await rowOf(eased)]);
  // Its count of runs sent stays: taking a run off buys no more of them.
  assert.equal(Object.keys(fn.store.docs.get(KEY)!.devices).length, 2);
  // No token, or not a token, is refused, and so is a day the board no longer serves.
  for (const authorization of ['', 'Bearer', `Basic ${ME}`, 'Bearer short']) {
    assert.deepEqual((await fn.handle({ method: 'DELETE', path: `/runs/${DAY}`, ip: HOME, authorization })).body, { ok: false, why: 'token' }, authorization);
  }
  for (const day of [DAY - BOARD.days, DAY + 1]) assert.deepEqual((await fn.drop(day)).body, { ok: false, why: 'day' });
});

test('taking a run off is a change like any other: it never touches the document it is handed', () => {
  const { doc } = board([[row(1, 100, 500), device(1)], [row(2, 90, 500), device(2)]]);
  freeze(doc);
  const taken = withdraw(doc, device(1), ON);
  assert.deepEqual(taken.result.body.board!.rows.map((each) => each.id), [hex(2, WORLD_BOARD.id)]);
  assert.deepEqual(readDay(taken.doc).devices, readDay(doc).devices);
  assert.equal(withdraw(null, device(1), ON).doc, null);
});

test('an address may ask only so often a minute, by route, and may ask again the next minute', async () => {
  const { column } = runs();
  const fn = service({ limits: { ...LIMITS, minute: { runs: 2, board: 3, remove: 1 } } });
  for (let i = 0; i < 2; i++) assert.equal((await fn.send(column.text)).status, 200);
  assert.deepEqual(await fn.send(column.text), { status: 429, body: { ok: false, why: 'rate' }, cache: 'no-store' });
  // Another address, or another route, is its own count.
  assert.equal((await fn.send(column.text, { ip: AWAY })).status, 200);
  for (let i = 0; i < 3; i++) assert.equal((await fn.ask()).status, 200);
  assert.equal((await fn.ask()).body.why, 'rate');
  assert.equal((await fn.drop()).status, 200);
  assert.equal((await fn.drop()).body.why, 'rate');
  fn.clock.now += 60_000;
  assert.equal((await fn.send(column.text)).status, 200);
  assert.equal((await fn.ask()).status, 200);
});

test('the minute\'s limits hold an address no longer than the minute it asked in: the next minute\'s first request forgets them all', () => {
  const limiter = createLimiter({ runs: 1 });
  for (let i = 0; i < 300; i++) limiter.allow('runs', `10.0.${i >> 8}.${i & 255}`, 59_999);
  assert.equal(limiter.held, 300);
  assert.equal(limiter.allow('runs', '10.0.0.0', 59_999), false);
  assert.equal(limiter.allow('runs', '192.0.2.1', 60_000), true);
  assert.equal(limiter.held, 1);
  assert.equal(limiter.allow('runs', '10.0.0.0', 60_000), true);
  // A clock put back is another minute too.
  assert.equal(limiter.allow('runs', '10.0.0.0', 0), true);
  assert.equal(limiter.held, 1);
});

test('an IPv6 address is counted by its /64, which one home or phone holds whole, and an IPv4 address whole', () => {
  const limiter = createLimiter({ runs: 2 });
  const allowed = (address: string) => limiter.allow('runs', address, 0);
  assert.deepEqual(['2001:db8:1:2::1', '2001:0DB8:0001:0002:ffff:ffff:ffff:fffe', '[2001:db8:1:2:abcd::9]:443'].map(allowed), [true, true, false]);
  assert.equal(allowed('2001:db8:1:3::1'), true, 'the next /64 is another home');
  assert.deepEqual(['203.0.113.7', '::ffff:203.0.113.7', '203.0.113.7:51234'].map(allowed), [true, true, false]);
  assert.equal(allowed('203.0.113.8'), true);
  // As written in the counts: a /64 in its shortest form, IPv4 as itself however it came.
  for (const [address, key] of [
    ['2001:db8:85a3::8a2e:370:7334', '2001:db8:85a3:0::/64'],
    ['2001:DB8:85A3:0:0:8A2E:370:7334', '2001:db8:85a3:0::/64'],
    ['fe80::1%eth0', 'fe80:0:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['64:ff9b:1:2:3:4:192.0.2.33', '64:ff9b:1:2::/64'],
    [' 203.0.113.7 ', '203.0.113.7'],
    ['::ffff:cb00:7107', '203.0.113.7'],
    ['0:0:0:0:0:ffff:203.0.113.7', '203.0.113.7'],
  ]) assert.equal(clientKey(address), key, address);
  // Anything else is counted as it came, so it is never taken for anyone else.
  for (const odd of ['', 'unknown', '1:2:3', '1::2::3', '1:2:3:4:5:6:7:8:9', '12345::1', '::ffff:300.1.1.1']) assert.equal(clientKey(odd), odd, odd);
});

test('a device may send only so many runs a day, a run already on the board costing it none, and a day counts runs from only so many devices', async () => {
  const [best, mid, worst] = ranked();
  const fn = service({ limits: { ...OPEN, runs: 2, devices: 1 } });
  assert.equal((await fn.send(best.text)).status, 200);
  assert.equal((await fn.send(worst.text)).body.why, 'not-best');
  // Sent again, the run on the board answers its place and is not counted.
  assert.deepEqual([(await fn.send(best.text)).status, Object.values(fn.store.docs.get(KEY)!.devices)], [200, [2]]);
  assert.deepEqual(await fn.send(mid.text), { status: 429, body: { ok: false, why: 'quota' }, cache: 'no-store' });
  // The one device counted has a run on the board, so a day that counts one takes no other.
  assert.deepEqual((await fn.send(mid.text, { token: YOU })).body, { ok: false, why: 'full' });
  assert.deepEqual(fn.store.docs.get(KEY)!.devices, { [fn.store.docs.get(KEY)!.rows[0].device]: 2 });
});

test('a day\'s board is served from memory for half a minute, and a change made here is served at once', async () => {
  const { column } = runs();
  const fn = service();
  assert.deepEqual((await fn.ask()).body.board!.rows, []);
  await fn.ask();
  assert.equal(fn.store.counts.reads, 1);
  await fn.send(column.text);
  assert.equal((await fn.ask()).body.board!.rows.length, 1);
  assert.equal(fn.store.counts.reads, 1);
  fn.clock.now += LIMITS.cache * 1000;
  assert.equal((await fn.ask()).body.board!.rows.length, 1);
  assert.equal(fn.store.counts.reads, 2);
  // The fortnight the local board keeps, and no day before Daily #1 or after today.
  for (const day of [DAY - BOARD.days + 1, DAY]) assert.equal((await fn.ask(day)).status, 200);
  for (const day of [DAY - BOARD.days, DAY + 1, DAILY_EPOCH - 1]) assert.deepEqual((await fn.ask(day)).body, { ok: false, why: 'day' });
});

test('the routes read the same with the function\'s name in front of them or without it, and nothing else is answered', async () => {
  const fn = service();
  const status = async (method: string, path: string) => (await fn.handle({ method, path, ip: HOME })).status;
  for (const path of [`/board/${DAY}`, `/board/board/${DAY}`, `/board/${DAY}/`]) assert.equal(await status('GET', path), 200, path);
  for (const path of ['/', '/board', '/runs/', '/board/board', '/board/abc', `/board/${DAY}/rows`, `/api/board/${DAY}`, `/board/-1`]) {
    assert.ok([404, 405, 400].includes(await status('GET', path)), path);
  }
  assert.equal(await status('GET', '/nope'), 404);
  assert.equal(await status('PUT', '/runs'), 405);
  assert.equal(await status('POST', `/board/${DAY}`), 405);
  assert.equal(await status('GET', `/runs/${DAY}`), 405);
  assert.equal(await status('POST', '/board/runs'), 400);
});

test('a store that fails is a 503 and a note for the owner, never a crash', async () => {
  const { column } = runs();
  const broken = { ...fakeStore(), read: async () => { throw new Error('unavailable'); }, update: async () => { throw new Error('aborted'); } };
  const fn = service({ store: broken });
  assert.deepEqual(await fn.send(column.text), { status: 503, body: { ok: false, why: 'store' }, cache: 'no-store' });
  assert.deepEqual((await fn.ask()).body, { ok: false, why: 'store' });
  assert.deepEqual((await fn.drop()).body, { ok: false, why: 'store' });
  assert.equal(fn.noted.length, 3);
});

test('a day\'s document is read cleanly: damaged rows, a run or a device twice and bad counts are dropped, the best kept', () => {
  const good = { ...row(1, 100, 500), device: device(1) };
  const day = readDay({
    rows: [
      { ...row(2, 50, 500), device: device(2) },
      good,
      { ...good, at: NOW + 99 },
      { ...row(3, 120, 500), device: device(1) },
      { ...row(4, 200, 500), device: 'not a device' },
      { ...row(5, 200, 500), who: '', device: device(5) },
      { ...row(6, 200, 500), total: 101, device: device(6) },
      { ...row(9, 200, 500), glider: 'classic', device: device(9) },
      { ...row(10, 200, 500), glider: undefined, device: device(10) },
      'junk',
    ],
    devices: { [device(1)]: 3, [device(2)]: 0, nope: 4, [device(7)]: 1.5, [device(8)]: 2 },
  });
  assert.deepEqual(day.rows.map((each) => [each.id, each.device]), [[hex(3, WORLD_BOARD.id), device(1)], [hex(2, WORLD_BOARD.id), device(2)]]);
  assert.deepEqual(day.devices, { [device(1)]: 3, [device(8)]: 2 });
  for (const nonsense of [null, undefined, 'board', [], { rows: 'many', devices: [] }]) assert.deepEqual(readDay(nonsense), { rows: [], devices: {} });
});

test('only the site, its preview channels and a development server here may read what the function says', () => {
  const allowed = (origin: string) => ORIGINS.some((each) => (typeof each === 'string' ? each === origin : each.test(origin)));
  for (const origin of [
    'https://renate-gouveia.dev', 'https://renate-gouveia-portfolio.web.app', 'https://renate-gouveia-portfolio.firebaseapp.com',
    'https://renate-gouveia-portfolio--prelaunch-a1b2c3d4.web.app', 'http://localhost:5173', 'http://127.0.0.1:4173', 'http://localhost',
  ]) assert.equal(allowed(origin), true, origin);
  for (const origin of [
    'https://example.com', 'http://renate-gouveia-portfolio.web.app', 'https://renate-gouveia-portfolio.web.app.example.com',
    'http://renate-gouveia.dev', 'https://renate-gouveia.dev.example.com', 'https://evil-renate-gouveia.dev',
    'https://evil--renate-gouveia-portfolio.web.app', 'http://localhost.example.com', 'https://localhost:5173', 'null', '',
  ]) assert.equal(allowed(origin), false, origin);
});

test('where a request came from is the last address in X-Forwarded-For, the one Google\'s front end added', () => {
  assert.equal(clientAddress('203.0.113.7'), '203.0.113.7');
  assert.equal(clientAddress('1.2.3.4, 203.0.113.7'), '203.0.113.7');
  assert.equal(clientAddress(' 1.2.3.4 ,203.0.113.7 , '), '203.0.113.7');
  assert.equal(clientAddress(undefined, '::1'), '::1');
  assert.equal(clientAddress('', undefined), '');
});
