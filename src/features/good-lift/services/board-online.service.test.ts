import { runId } from '../../../adapters/crypto/run-identity.service.ts';
import type { BoardFetch } from './board-online.service.ts';
import { clearStore } from '../../../adapters/browser/good-lift-storage.service.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_KEY, ONLINE, boardUrl, createOnlineBoard, placeOf, readBoard, takenOff } from './board-online.service.ts';
import { WORLD_BOARD } from '../../../domains/good-lift/board-world.ts';
import { GAME_STORE } from '../../../domains/progression/good-lift-store.ts';
import { decodeLog, encodeLog } from '../../../domains/good-lift/recorder.ts';
import { SIM_VERSION } from '../../../domains/good-lift/sim-version.ts';

const URL = 'https://us-central1-renate-gouveia-portfolio.cloudfunctions.net/board';
const DAY = 20_770;

// A storage that keeps what it is given, as the page's localStorage does, and notes every call.
function memoryStorage(entries: Record<string, string> = {}) {
  const items = new Map(Object.entries(entries));
  const calls: string[][] = [];
  return {
    items,
    calls,
    getItem: (key: string) => (calls.push(['get', key]), items.has(key) ? items.get(key)! : null),
    setItem: (key: string, value: unknown) => { calls.push(['set', key]); items.set(key, String(value)); },
    removeItem: (key: string) => { calls.push(['remove', key]); items.delete(key); },
  };
}

// The network as the tests have it: each request noted, each answered by `answer(url, init)`, which
// gives back the JSON body to send (or throws, as a network that fails does).
function network(answer: (url: string, init: RequestInit) => unknown = () => ({ ok: true })) {
  const asked: Array<{ url: string; init: RequestInit; body: Record<string, string> | undefined }> = [];
  const fetch: BoardFetch = async (url, init) => {
    asked.push({ url, init, body: init.body === undefined ? undefined : JSON.parse(init.body as string) });
    const body = await answer(url, init);
    return { json: async () => body };
  };
  return { asked, fetch };
}

// Bytes nobody chose: the same every time, so a token is the same in every run of the tests.
const random = (count: number) => Uint8Array.from({ length: count }, (_, i) => (i * 37 + 11) & 255);

// A row of the world board, and a day's board as the function sends it.
const row = (n: number, fields = {}) => ({ who: 'REN', byname: '', total: 500 - 2.5 * n, style: 0, peak: 900, red: [0, 0], at: 1_792_000_000_000 + n, id: n.toString(16).padStart(WORLD_BOARD.id, '0'),
  glider: 'en-b', ...fields });
const sent = <Row>(rows: Row[], day = DAY, version = SIM_VERSION) => ({ version, day, rows });

test('with no function named the world board is off: nothing is fetched, no token is made, and every answer is null', async () => {
  for (const url of [undefined, '', '   ', 'not a url', 'ftp://example.com/board', 'http://example.com/board', `${URL}?key=1`, `${URL}#here`, 'https://user:pass@example.com/board']) {
    const { asked, fetch } = network();
    const storage = memoryStorage();
    const online = createOnlineBoard({ url, fetch, storage, random });
    assert.equal(online.on, false, String(url));
    assert.deepEqual([await online.send('AQ', DAY), await online.board(DAY), await online.remove(DAY), online.token], [null, null, null, null]);
    assert.deepEqual(asked, []);
    assert.deepEqual(storage.calls, []);
  }
});

test('the function is named by an https address, or http on this machine for an emulator, without a trailing slash', () => {
  assert.equal(boardUrl(URL), URL);
  assert.equal(boardUrl(` ${URL}/ `), URL);
  assert.equal(boardUrl('https://board-abc123-uc.a.run.app'), 'https://board-abc123-uc.a.run.app');
  assert.equal(boardUrl('http://127.0.0.1:5001/demo-portfolio/us-central1/board'), 'http://127.0.0.1:5001/demo-portfolio/us-central1/board');
  assert.equal(boardUrl('http://localhost:5001/x/'), 'http://localhost:5001/x');
  for (const text of ['http://example.com', 'https://', 'javascript:alert(1)', 'data:text/plain,hi', 7, null]) assert.equal(boardUrl(text), '', String(text));
});

test('a run is sent as text, with this device\'s token, made once from random bytes and kept under its own key', async () => {
  const { asked, fetch } = network(() => ({ ok: true, rank: 3, board: sent([row(0), row(1), row(2)]) }));
  const storage = memoryStorage();
  const online = createOnlineBoard({ url: `${URL}/`, fetch, storage, random });
  assert.equal(online.on, true);
  // A visitor who never opts in never has a token.
  assert.equal(online.token, null);
  const reply = await online.send('AQ-log', DAY);
  assert.deepEqual(reply, { ok: true, why: '', rank: 3, board: sent([row(0), row(1), row(2)]) });
  const [{ url, init, body }] = asked;
  assert.equal(url, `${URL}/runs`);
  // Text, which a browser sends to another origin without first asking leave, and kept alive.
  assert.deepEqual([init.method, init.headers, init.keepalive], ['POST', { 'Content-Type': 'text/plain;charset=UTF-8' }, true]);
  assert.match(body!.token, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(body, { log: 'AQ-log', token: body!.token });
  assert.equal(storage.items.get(DEVICE_KEY), body!.token);
  assert.equal(online.token, body!.token);
  // The same token for every run after, in this page and the next.
  await online.send('AQ-other', DAY);
  assert.equal(asked[1].body!.token, body!.token);
  const later = network(() => ({ ok: true, rank: 0 }));
  await createOnlineBoard({ url: URL, fetch: later.fetch, storage, random: () => assert.fail('no new token') }).send('AQ', DAY);
  assert.equal(later.asked[0].body!.token, body!.token);
  assert.equal(body!.token.length, Math.ceil((ONLINE.token * 8) / 6));
});

test('the device token outlives Reset progress, which clears only Good Lift\'s own store', async () => {
  const storage = memoryStorage({ [GAME_STORE]: '{}' });
  await createOnlineBoard({ url: URL, fetch: network().fetch, storage, random }).send('AQ', DAY);
  const token = storage.items.get(DEVICE_KEY);
  assert.notEqual(DEVICE_KEY, GAME_STORE);
  clearStore(storage);
  assert.deepEqual([storage.items.has(GAME_STORE), storage.items.get(DEVICE_KEY)], [false, token]);
});

test('storage that is blocked still gives the visit a token, and one that is damaged is made again', async () => {
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  const { asked, fetch } = network();
  const online = createOnlineBoard({ url: URL, fetch, storage: blocked, random });
  await online.send('AQ', DAY);
  await online.send('AQ', DAY);
  assert.match(asked[0].body!.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(asked[1].body!.token, asked[0].body!.token);
  // No storage at all, as where the page cannot reach it.
  const none = createOnlineBoard({ url: URL, fetch, storage: null, random });
  await none.send('AQ', DAY);
  assert.match(none.token!, /^[A-Za-z0-9_-]{43}$/);
  for (const damaged of ['short', `${'A'.repeat(42)}!`, 'A'.repeat(44)]) {
    const storage = memoryStorage({ [DEVICE_KEY]: damaged });
    await createOnlineBoard({ url: URL, fetch, storage, random }).send('AQ', DAY);
    assert.match(storage.items.get(DEVICE_KEY)!, /^[A-Za-z0-9_-]{43}$/, damaged);
  }
});

test('a day\'s board is taken only as asked for: these rules, that day, clean rows, each run once and no more than the board keeps', async () => {
  const rows = [row(0), row(1), { ...row(2), who: '' }, { ...row(3), device: 'f'.repeat(32) }, row(0), { ...row(4), glider: 'classic' }, 'junk'];
  assert.deepEqual(readBoard(sent(rows), DAY), sent([row(0), row(1), row(3)]));
  assert.equal(readBoard(sent(rows, DAY - 1), DAY), null);
  assert.equal(readBoard(sent(rows, DAY, SIM_VERSION + 1), DAY), null);
  for (const nonsense of [null, 'board', [], { version: SIM_VERSION, day: DAY, rows: 'many' }]) assert.equal(readBoard(nonsense, DAY), null);
  const many = Array.from({ length: WORLD_BOARD.keep + 5 }, (_, n) => row(n, { total: 2.5 * (300 - n) }));
  assert.equal(readBoard(sent(many), DAY)!.rows.length, WORLD_BOARD.keep);

  const { asked, fetch } = network(() => ({ ok: true, board: sent([row(0)]) }));
  const online = createOnlineBoard({ url: URL, fetch, storage: memoryStorage(), random });
  assert.deepEqual(await online.board(DAY), sent([row(0)]));
  assert.deepEqual([asked[0].url, asked[0].init.method], [`${URL}/board/${DAY}`, 'GET']);
  // Asking for a day's board sends nothing of this browser's: no body, no token.
  assert.equal(asked[0].init.body, undefined);
  assert.equal(online.token, null);
  // A board of other rules is no board here (the function has not been deployed again since).
  const old = network(() => ({ ok: true, board: sent([row(0)], DAY, SIM_VERSION - 1) }));
  assert.equal(await createOnlineBoard({ url: URL, fetch: old.fetch, storage: memoryStorage(), random }).board(DAY), null);
  for (const day of [0, -1, 1.5, '20770', NaN]) assert.equal(await online.board(day), null);
  assert.equal(asked.length, 1);
});

test('the board this browser has just changed is fetched afresh, never from what the browser kept of it', async () => {
  const { asked, fetch } = network((url, init: RequestInit) => (init.method === 'GET' ? { ok: true, board: sent([]) } : { ok: true, removed: 1, rank: 1 }));
  const online = createOnlineBoard({ url: URL, fetch, storage: memoryStorage(), random });
  await online.board(DAY);
  await online.send('AQ', DAY);
  await online.board(DAY);
  await online.board(DAY);
  await online.remove(DAY);
  await online.board(DAY);
  assert.deepEqual(asked.filter(({ init }) => init.method === 'GET').map(({ init }) => init.cache), ['default', 'reload', 'default', 'reload']);
});

test('what the function says of a run is taken as words it knows, and a refusal is an answer like any other', async () => {
  const reply = (body: unknown) => createOnlineBoard({ url: URL, fetch: network(() => body).fetch, storage: memoryStorage(), random }).send('AQ', DAY);
  assert.deepEqual(await reply({ ok: false, why: 'not-best', rank: 4, board: sent([row(0)]) }), { ok: false, why: 'not-best', rank: 4, board: sent([row(0)]) });
  assert.deepEqual(await reply({ ok: false, why: 'mismatch' }), { ok: false, why: 'mismatch', rank: 0, board: null });
  assert.deepEqual(await reply({ ok: false, why: '<b>no</b>', rank: 101 }), { ok: false, why: '', rank: 0, board: null });
  assert.deepEqual(await reply({ ok: true, rank: 2.5 }), { ok: true, why: '', rank: 0, board: null });
  for (const nonsense of [null, 'ok', [], { rank: 3 }, { ok: 'yes' }]) assert.equal(await reply(nonsense), null, JSON.stringify(nonsense));
});

test('a request that fails, or does not come back in time, is null and never an error', async () => {
  const fails = createOnlineBoard({ url: URL, fetch: async () => { throw new TypeError('Failed to fetch'); }, storage: memoryStorage(), random });
  assert.deepEqual([await fails.send('AQ', DAY), await fails.board(DAY)], [null, null]);
  const garbled = createOnlineBoard({ url: URL, fetch: async () => ({ json: async () => { throw new SyntaxError('not JSON'); } }), storage: memoryStorage(), random });
  assert.equal(await garbled.board(DAY), null);
  // Given up after `wait`: the request is aborted, and the page told nothing.
  const signals: AbortSignal[] = [];
  const hangs: BoardFetch = (url, init) => new Promise((_, reject) => {
    signals.push(init.signal!);
    init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  const slow = createOnlineBoard({ url: URL, fetch: hangs, storage: memoryStorage(), random, wait: 20 });
  const started = performance.now();
  assert.deepEqual([await slow.send('AQ', DAY), await slow.board(DAY)], [null, null]);
  assert.ok(performance.now() - started < 1000);
  assert.deepEqual(signals.map((signal) => signal.aborted), [true, true]);
  assert.equal(ONLINE.wait, 8000);
});

test('this browser\'s run is taken off with its token as a bearer, and a browser that never sent one has nothing to take off', async () => {
  const { asked, fetch } = network((url, init: RequestInit) => (init.method === 'DELETE' ? { ok: true, removed: 1, board: sent([row(1)]) } : { ok: true, rank: 1 }));
  const storage = memoryStorage();
  const online = createOnlineBoard({ url: URL, fetch, storage, random });
  assert.equal(await online.remove(DAY), null);
  assert.deepEqual([asked.length, storage.items.has(DEVICE_KEY)], [0, false]);
  await online.send('AQ', DAY);
  assert.deepEqual(await online.remove(DAY), { ok: true, removed: 1, board: sent([row(1)]) });
  const { url, init } = asked[1];
  assert.deepEqual([url, init.method, init.headers], [`${URL}/runs/${DAY}`, 'DELETE', { Authorization: `Bearer ${online.token}` }]);
  const refused = createOnlineBoard({ url: URL, fetch: network(() => ({ ok: false, why: 'token' })).fetch, storage, random });
  assert.equal(await refused.remove(DAY), null);
});

test('a run taken off leaves the board, but one of this browser\'s runs that another browser sent stays where it now stands', () => {
  const shown = { rows: [row(0), row(1), row(2)], rank: 2 };
  // Taken off: the board as the function sent it back, or else as shown without the run.
  const off = { rows: [row(0), row(2)], rank: 0, removed: true, stays: false };
  assert.deepEqual(takenOff(shown, { removed: 1, board: sent([row(0), row(2)]) }), off);
  assert.deepEqual(takenOff(shown, { removed: 1, board: null }), off);
  // Nothing taken, and the run still there: another browser sent it, and it keeps its place, which may have moved.
  assert.deepEqual(takenOff(shown, { removed: 0, board: sent([row(3), row(0), row(1), row(2)]) }), { rows: [row(3), row(0), row(1), row(2)], rank: 3, removed: false, stays: true });
  assert.deepEqual(takenOff(shown, { removed: 0, board: null }), { ...shown, removed: false, stays: true });
  // Nothing taken, and the run gone already (taken off from another tab, or pushed off the board).
  assert.deepEqual(takenOff(shown, { removed: 0, board: sent([row(0), row(2)]) }), off);
});

test('where this browser stands is the best row that is one of its own runs, however that run was named', async () => {
  const bits = Uint8Array.from({ length: 300 }, (_, i) => (i >> 6) & 3);
  const text = (meta: { initials?: string; total?: number; }, steps = bits.length) => encodeLog({ simVersion: SIM_VERSION, glider: 'en-b', seed: 7, day: DAY, initials: 'REN', ...meta }, bits, steps);
  const mine = text({});
  const other = text({}, 299);
  const read = decodeLog(mine); assert.ok(read.ok);
  const id = await runId(read.log);
  const rows = [row(0), row(1), { ...row(2), id }, row(3)];
  assert.equal(await placeOf(rows, [mine]), 3);
  assert.equal(await placeOf(rows, [text({ initials: 'TOR', total: 50 })]), 3);
  assert.equal(await placeOf(rows, [other, 'not a log', mine]), 3);
  assert.equal(await placeOf(rows, [other]), 0);
  assert.equal(await placeOf([], [mine]), 0);
  // Where the page cannot work a digest out (plain http but on this machine), it stands nowhere.
  const { subtle } = globalThis.crypto;
  try {
    Object.defineProperty(globalThis.crypto, 'subtle', { configurable: true, get: () => undefined });
    assert.equal(await placeOf(rows, [mine]), 0);
  } finally {
    Object.defineProperty(globalThis.crypto, 'subtle', { configurable: true, get: () => subtle });
  }
  assert.equal(await placeOf(rows, [mine]), 3);
});
