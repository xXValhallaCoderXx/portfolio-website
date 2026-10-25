import type { RunLog } from '../../../domains/good-lift/recorder.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplayWork } from './replay-work.service.ts';
import { replayLog } from '../../../domains/good-lift/replay.ts';
import { createReferenceKeys, TST } from '../../../domains/good-lift/pilots.ts';
import { createRunWorld, finishRun, startRun, stepBits } from '../../../domains/good-lift/run-step.ts';
import { createCloudbaseRun } from '../../../domains/good-lift/cloudbase-state.ts';
import { createMeet } from '../../../domains/good-lift/meet-state.ts';
import { createBells } from '../../../domains/good-lift/bells.ts';
import { createComboStyle } from '../../../domains/good-lift/meet-combo.ts';
import { LOG_FORMAT, createRecorder } from '../../../domains/good-lift/recorder.ts';
import { summariseRun } from '../../../domains/good-lift/meet-sheet.ts';
import { SIM_VERSION } from '../../../domains/good-lift/sim-version.ts';

const emptyLog = (): RunLog => ({ format: LOG_FORMAT, simVersion: SIM_VERSION, glider: 'en-a', seed: 1, day: 0, touch: false, initials: '', total: 0, peak: 0, bits: new Uint32Array(), steps: 0 });

function scheduler() {
  let id = 0, time = 0;
  const queued = new Map<number, () => void>();
  return {
    later: (work: () => void) => { queued.set(++id, work); return id; },
    cancel: (key: number | ReturnType<typeof setTimeout>) => typeof key === 'number' && queued.delete(key),
    now: () => ++time,
    tick() { const [key, work] = queued.entries().next().value ?? []; if (!work) return false; queued.delete(key!); work(); return true; },
    get queued() { return [...queued.values()]; },
  };
}
function flight() {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells(), style: createComboStyle(), wing: 'en-b' }), 17);
  const keys = createReferenceKeys(TST), recorder = createRecorder();
  let ending = null;
  while (!ending) { const bits = keys(world); recorder.push(bits); ending = stepBits(world, bits); }
  finishRun(world, ending);
  return { sheet: summariseRun(world, ending), log: { format: LOG_FORMAT, simVersion: SIM_VERSION, glider: 'en-b' as const, seed: 17, day: 0, touch: false, initials: '',
    total: world.meet!.state.total, peak: Math.floor(world.sky.state.peak), bits: Uint32Array.from(recorder.bits), steps: recorder.steps } };
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
  const stale = worker.run(emptyLog());
  const callback = schedule.queued[0];
  worker.cancel();
  callback();
  assert.deepEqual(await stale, { error: 'cancelled' });
  assert.equal(advanced, 0);
  const fresh = worker.run(emptyLog());
  while (schedule.tick()) {}
  assert.deepEqual(await fresh, { total: 10 });
  assert.equal(worker.pending, 0);
});

test('a callback already running cancels safely, and refusal or failure settles without hanging', async () => {
  const schedule = scheduler();
  let worker: ReturnType<typeof createReplayWork<{ total: number }>>;
  worker = createReplayWork({ ...schedule, make: () => ({ advance() { worker.cancel(); return false; }, result: { total: 999 } }) });
  const pending = worker.run(emptyLog());
  while (schedule.tick()) {}
  assert.deepEqual(await pending, { error: 'cancelled' });
  for (const make of [() => { throw new Error('bad log'); }, () => ({ advance: () => true, result: { error: 'version' } })]) {
    const next = createReplayWork({ ...schedule, make });
    const answer = next.run(emptyLog());
    while (schedule.tick()) {}
    const outcome = await answer;
    assert.ok('error' in outcome && outcome.error);
    assert.equal(next.pending, 0);
  }
});
