import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplayWork } from './replay-work.js';
import { replayLog } from './replay.js';
import { createReferenceKeys, TST } from './pilots.js';
import { createRunWorld, finishRun, startRun, stepBits } from './run-step.js';
import { createCloudbaseRun } from './cloudbase-state.js';
import { createMeet } from './meet-state.js';
import { createBells } from './bells.js';
import { createStyle } from './meet-style.js';
import { createRecorder } from './recorder.js';
import { summariseRun } from './meet-sheet.js';
import { SIM_VERSION } from './sim-version.js';

function scheduler() {
  let id = 0, time = 0;
  const queued = new Map();
  return {
    later: (work) => { queued.set(++id, work); return id; },
    cancel: (key) => queued.delete(key),
    now: () => ++time,
    tick() { const [key, work] = queued.entries().next().value ?? []; if (!work) return false; queued.delete(key); work(); return true; },
    get queued() { return [...queued.values()]; },
  };
}
function flight() {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells(), style: createStyle() }), 17);
  const keys = createReferenceKeys(TST), recorder = createRecorder();
  let ending = null;
  while (!ending) { const bits = keys(world); recorder.push(bits); ending = stepBits(world, bits); }
  finishRun(world, ending);
  return { sheet: summariseRun(world, ending), log: { simVersion: SIM_VERSION, seed: 17, bits: Uint8Array.from(recorder.bits), steps: recorder.steps } };
}

test('a complete skilled digital run yields between slices and equals the synchronous judge exactly', async () => {
  const { sheet, log } = flight();
  const schedule = scheduler(), worker = createReplayWork(schedule);
  const promise = worker.run(log);
  assert.equal(worker.pending, 1);
  let slices = 0;
  while (schedule.tick()) slices++;
  assert.ok(slices > 100, `${slices} separately scheduled slices`);
  assert.deepEqual(await promise, sheet);
  assert.deepEqual(await promise, replayLog(log));
  assert.equal(worker.pending, 0);
});

test('cancellation stops queued work and a stale callback cannot complete an earlier generation', async () => {
  const schedule = scheduler();
  let advanced = 0;
  const make = () => ({ advance() { advanced++; return advanced > 5; }, result: { total: 10 } });
  const worker = createReplayWork({ ...schedule, make });
  const stale = worker.run({});
  const callback = schedule.queued[0];
  worker.cancel();
  callback();
  assert.deepEqual(await stale, { error: 'cancelled' });
  assert.equal(advanced, 0);
  const fresh = worker.run({});
  while (schedule.tick()) {}
  assert.deepEqual(await fresh, { total: 10 });
  assert.equal(worker.pending, 0);
});

test('a callback already running cancels safely, and refusal or failure settles without hanging', async () => {
  const schedule = scheduler();
  let worker;
  worker = createReplayWork({ ...schedule, make: () => ({ advance() { worker.cancel(); return false; }, result: { total: 999 } }) });
  const pending = worker.run({});
  while (schedule.tick()) {}
  assert.deepEqual(await pending, { error: 'cancelled' });
  for (const make of [() => { throw new Error('bad log'); }, () => ({ advance: () => true, result: { error: 'version' } })]) {
    const next = createReplayWork({ ...schedule, make });
    const answer = next.run({});
    while (schedule.tick()) {}
    assert.ok((await answer).error);
    assert.equal(next.pending, 0);
  }
});
