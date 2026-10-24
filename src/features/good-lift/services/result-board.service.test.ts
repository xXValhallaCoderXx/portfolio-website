import test from 'node:test';
import assert from 'node:assert/strict';
import { runId } from '../../../adapters/crypto/run-identity.service.ts';
import { emptyStore, recordRun } from '../../../domains/progression/good-lift-store.ts';
import { addRow, boardKey, rowsFor } from '../../../domains/good-lift/board.ts';
import { seedFor } from '../../../domains/good-lift/daily.ts';
import { BLOCKED } from '../../../domains/good-lift/meet-initials.ts';
import { createCloudbaseRun } from '../../../domains/good-lift/cloudbase-state.ts';
import { createRunWorld, startRun, stepBits, finishRun } from '../../../domains/good-lift/run-step.ts';
import { createMeet } from '../../../domains/good-lift/meet-state.ts';
import { createBells } from '../../../domains/good-lift/bells.ts';
import { createStyle } from '../../../domains/good-lift/meet-style.ts';
import { summariseRun } from '../../../domains/good-lift/meet-sheet.ts';
import { createRecorder, decodeLog, encodeLog } from '../../../domains/good-lift/recorder.ts';
import { replayLog } from '../../../domains/good-lift/replay.ts';
import { SIM_VERSION } from '../../../domains/good-lift/sim-version.ts';
import type { RunResult, WorldResult } from '../good-lift.models.ts';
import type { createOnlineBoard } from './board-online.service.ts';
import { createResultBoard } from './result-board.service.ts';

type Online = ReturnType<typeof createOnlineBoard>;
type Sent = Awaited<ReturnType<Online['send']>>;
const day = 20_770;
const key = boardKey(SIM_VERSION, day);

// A real completed flight, recorded through the canonical step boundary, reused as copies below.
function flight(): RunResult {
  const seed = seedFor(day);
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells(), style: createStyle() }), seed);
  const recorder = createRecorder();
  let reason = null;
  while (!reason) { recorder.push(0); reason = stepBits(world, 0); }
  finishRun(world, reason);
  const sheet = summariseRun(world, reason);
  const log = encodeLog({ simVersion: SIM_VERSION, seed, day, total: sheet.total, peak: sheet.peak, touch: true }, recorder.bits, recorder.steps);
  return { ...sheet, kind: 'daily', day, label: 'Daily test', at: 1234, style: sheet.stats.style,
    best: { total: sheet.total, peak: sheet.peak }, feats: { earned: [], fresh: [], streak: 0 },
    board: { rows: [], mine: log }, target: null, log, link: `https://flight.test/good-lift#vs=${log}`,
    verified: true, verifying: false, byname: '', verse: '', initials: '', pilot: '', online: true };
}
const completed = flight();
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
const settle = () => new Promise<void>(done => setImmediate(done));
const empty = () => ({ version: SIM_VERSION, day, rows: [] });

function setup() {
  const result = structuredClone(completed);
  const store = emptyStore();
  recordRun(store, { kind: result.kind, day, at: result.at, total: result.total, peak: result.peak,
    style: result.style, log: result.log, red: result.lifts.map(lift => lift.red), reason: result.reason }, { now: day * 86400000, version: SIM_VERSION });
  result.board!.rows = rowsFor(store.board, key);
  const events: { results: RunResult[]; worlds: WorldResult[]; posts: string[]; reads: number; deletes: number; writes: number } = { results: [], worlds: [], posts: [], reads: 0, deletes: 0, writes: 0 };
  const replies = {
    send: async (log: string): Promise<Sent> => {
      const decoded = decodeLog(log); assert.ok(decoded.ok);
      return { ok: true, why: '', rank: 1, board: { ...empty(), rows: [{ who: decoded.log.initials,
        id: await runId(decoded.log), total: result.total, style: result.style, peak: result.peak,
        red: result.lifts.map(lift => lift.red), byname: '', at: result.at }] } };
    },
    board: async (): ReturnType<Online['board']> => empty(),
    remove: async (): ReturnType<Online['remove']> => ({ ok: true, removed: 1, board: empty() }),
  };
  const online: Online = { on: true, token: 'a'.repeat(43),
    async send(log, askedDay) { assert.equal(askedDay, day); events.posts.push(String(log)); return replies.send(String(log)); },
    async board() { events.reads += 1; return replies.board(); },
    async remove() { events.deletes += 1; return replies.remove(); },
  };
  const controller = createResultBoard({ online, read: () => structuredClone(store),
    update: change => { events.writes += 1; return change(store); }, origin: () => 'https://flight.test',
    onResult: value => events.results.push(structuredClone(value)), onWorld: value => events.worlds.push(structuredClone(value)) });
  return { result, store, events, replies, controller, online };
}

test('opening and verifying results only read the board, including legacy opted-in players', async () => {
  const { result, store, events, controller } = setup();
  store.initials = 'REN'; store.optIn = true;
  result.initials = 'REN'; result.verifying = true;
  const before = structuredClone(store);
  controller.show(result);
  await settle();
  assert.equal(controller.world?.loading, true);
  assert.equal(events.reads, 0);
  result.verifying = false;
  await controller.refresh();
  assert.equal(events.reads, 1);
  assert.deepEqual(events.posts, []);
  assert.equal(events.writes, 0);
  assert.deepEqual(store, before);
});

test('invalid initials, wrong results and ineligible flights never publish or write defaults', async () => {
  const { result, events, controller } = setup();
  controller.show(result);
  for (const initials of ['', 'AB', 'ABCD', 'A1C', BLOCKED[0]]) assert.equal(await controller.submit(initials, result), undefined);
  assert.equal(await controller.submit('REN', { ...result, at: result.at + 1 }), undefined);
  const variants = [{ kind: 'practice' }, { reason: 'quit' }, { verified: false }, { verifying: true }, { online: false }];
  for (const change of variants) {
    const other = { ...result, ...change };
    controller.show(other);
    assert.equal(await controller.submit('REN', other), undefined);
  }
  controller.show(null);
  assert.equal(await controller.submit('REN', result), undefined);
  assert.equal(events.posts.length, 0);
  assert.equal(events.writes, 0);
});

test('explicit submission names the finished recording without changing replay, identity, rank ties or rewards', async () => {
  const { result, store, events, controller } = setup();
  addRow(store.board, key, { ...store.board.days[key].rows[0], who: 'TOR', via: 'link', log: 'another', at: 9999 });
  const before = structuredClone(store);
  const original = decodeLog(result.log); assert.ok(original.ok);
  controller.show(result);
  await settle();
  const status = await controller.submit('ren', result);
  assert.equal(status?.phase, 'submitted');
  assert.equal(events.posts.length, 1);
  const named = decodeLog(events.posts[0]); assert.ok(named.ok);
  assert.equal(named.log.initials, 'REN');
  assert.deepEqual({ ...named.log, initials: '' }, original.log);
  assert.equal(await runId(named.log), await runId(original.log));
  assert.deepEqual(replayLog(named.log), replayLog(original.log));
  assert.equal(result.pilot, 'REN');
  assert.equal(result.board?.mine, result.log);
  assert.ok(result.link.includes(result.log));
  const row = store.board.days[key].rows.find(row => row.via === 'me')!;
  assert.deepEqual({ ...row, who: '', log: original.ok ? completed.log : '' }, before.board.days[key].rows.find(row => row.via === 'me'));
  assert.equal(store.board.days[key].rows.length, before.board.days[key].rows.length);
  assert.deepEqual(store.board.days[key].rows.find(row => row.via === 'link'), before.board.days[key].rows.find(row => row.via === 'link'));
  assert.deepEqual({ ...store, board: before.board, initials: before.initials, optIn: before.optIn }, before);
  assert.equal(store.initials, 'REN');
  assert.equal(store.optIn, false);
  assert.equal(controller.world?.rank, 1);
});

test('simultaneous submits and repeated actions publish a finished run once', async () => {
  const { result, events, replies, controller } = setup();
  const answer = deferred<Sent>();
  replies.send = () => answer.promise;
  controller.show(result);
  const first = controller.submit('REN', result);
  const second = controller.submit('TOR', result);
  assert.equal(first, second);
  assert.equal(result.submission?.phase, 'submitting');
  assert.equal(events.posts.length, 1);
  answer.resolve({ ok: true, rank: 0, why: '', board: empty() });
  await first;
  assert.equal((await controller.submit('TOR', result))?.phase, 'submitted');
  assert.equal(events.posts.length, 1);
});

test('remembered initials prefill later runs without authorizing another post', async () => {
  const { result, events, controller, store } = setup();
  controller.show(result);
  await controller.submit('REN', result);
  const next = { ...structuredClone(completed), at: result.at + 1, initials: store.initials };
  controller.show(next);
  await settle();
  assert.equal(events.posts.length, 1);
  assert.equal(next.submission, undefined);
  await controller.submit(next.initials, next);
  assert.equal(events.posts.length, 2);
});

test('a network failure keeps the locally named flight and retries only on another explicit submit', async () => {
  const { result, events, replies, controller, store } = setup();
  replies.send = async () => null;
  replies.board = async () => null;
  controller.show(result);
  const progress = { runs: store.runs, tonnage: store.tonnage, best: { ...store.best } };
  assert.equal((await controller.submit('REN', result))?.phase, 'failed');
  await settle();
  assert.equal(controller.world?.readFailed, true);
  await controller.refresh();
  assert.equal(events.posts.length, 1);
  assert.equal(result.submission?.phase, 'failed');
  assert.equal((await controller.submit('TOR', result))?.phase, 'failed');
  assert.equal(events.posts.length, 2);
  assert.equal(store.board.days[key].rows.length, 1);
  assert.equal(store.board.days[key].rows[0].who, 'TOR');
  assert.deepEqual({ runs: store.runs, tonnage: store.tonnage, best: store.best }, progress);
});

for (const [why, phase] of [['not-best', 'not-best'], ['duplicate', 'rejected'], ['day', 'rejected'], ['mismatch', 'rejected'], ['quota', 'rejected'], ['rate', 'failed'], ['store', 'failed']] as const) {
  test(`the server's ${why} response stays distinct from a successful submission`, async () => {
    const { result, controller, replies } = setup();
    replies.send = async () => ({ ok: false, why, rank: why === 'not-best' ? 3 : 0, board: empty() });
    controller.show(result);
    const status = await controller.submit('REN', result);
    assert.equal(status?.phase, phase);
    assert.equal(status?.why, why);
    if (why === 'not-best') assert.equal(controller.world?.rank, 3);
  });
}

test('a slow initial board read cannot overwrite an explicit submission', async () => {
  const { result, controller, replies, events } = setup();
  const oldRead = deferred<Awaited<ReturnType<Online['board']>>>();
  replies.board = () => oldRead.promise;
  controller.show(result);
  await controller.submit('REN', result);
  const after = structuredClone(controller.world);
  const count = events.worlds.length;
  oldRead.resolve(empty());
  await settle();
  assert.deepEqual(controller.world, after);
  assert.equal(events.worlds.length, count);
});

test('late submission responses cannot change a new result or a closed sheet', async () => {
  for (const leave of [false, true]) {
    const { result, controller, replies, events } = setup();
    const answer = deferred<Sent>();
    replies.send = () => answer.promise;
    controller.show(result);
    const sending = controller.submit('REN', result);
    const next = { ...structuredClone(completed), at: result.at + 1 };
    controller.show(leave ? null : next);
    await settle();
    const count = events.results.length;
    const currentWorld = structuredClone(controller.world);
    answer.resolve({ ok: true, why: '', rank: 1, board: empty() });
    assert.equal(await sending, undefined);
    assert.equal(events.results.length, count);
    assert.equal(next.submission, undefined);
    assert.deepEqual(controller.world, currentWorld);
  }
});

test('withdrawing a submitted score preserves the local result and never republishes it', async () => {
  const { result, controller, events, store } = setup();
  controller.show(result);
  await controller.submit('REN', result);
  assert.equal(await controller.remove(), true);
  assert.equal(result.submission?.phase, 'withdrawn');
  assert.equal(controller.world?.removed, true);
  assert.equal((await controller.submit('REN', result))?.phase, 'withdrawn');
  await controller.refresh();
  assert.equal(events.posts.length, 1);
  assert.equal(events.deletes, 1);
  assert.equal(store.board.days[key].rows.length, 1);
});

test('withdrawal failures remain retryable and a copy sent by another browser stays on the board', async () => {
  const { result, controller, events, replies } = setup();
  controller.show(result);
  await controller.submit('REN', result);
  replies.remove = async () => null;
  assert.equal(await controller.remove(), false);
  assert.equal(controller.world?.failed, true);
  assert.equal(result.submission?.phase, 'submitted');
  replies.remove = async () => ({ ok: true, removed: 0, board: null });
  assert.equal(await controller.remove(), false);
  assert.equal(controller.world?.stays, true);
  assert.equal(result.submission?.phase, 'submitted');
  assert.equal(events.posts.length, 1);
});

test('naming a result outside the local top ten does not insert it or reaward it', async () => {
  const { result, controller, store } = setup();
  store.board.days[key].rows = [];
  const before = structuredClone(store);
  controller.show(result);
  await controller.submit('REN', result);
  assert.deepEqual(store.board, before.board);
  assert.equal(store.runs, before.runs);
  assert.equal(store.tonnage, before.tonnage);
});

test('a slow board refresh cannot delay a submission outcome or prevent an explicit retry', async () => {
  const { result, controller, replies, events } = setup();
  controller.show(result);
  await settle();
  const slowRead = deferred<Awaited<ReturnType<Online['board']>>>();
  replies.board = () => slowRead.promise;
  replies.send = async () => null;
  let outcome: Awaited<ReturnType<typeof controller.submit>>;
  const first = controller.submit('REN', result).then(value => { outcome = value; });
  try {
    await settle();
    assert.equal(outcome?.phase, 'failed', 'the POST outcome is available while the following GET is still pending');
    assert.equal(controller.world?.loading, true);
    replies.send = async () => ({ ok: true, why: '', rank: 1, board: empty() });
    assert.equal((await controller.submit('REN', result))?.phase, 'submitted');
    assert.equal(events.posts.length, 2);
    const after = structuredClone(controller.world);
    slowRead.resolve(null);
    await first;
    await settle();
    assert.deepEqual(controller.world, after, 'the old GET cannot replace the retry result');
  } finally {
    slowRead.resolve(null);
  }
});
