// Browser work yields between slices; the deterministic replay also serves the server judge.
import { createReplay } from '../../../domains/good-lift/replay.ts';
import type { RunLog } from '../../../domains/good-lift/recorder.ts';
import type { RunSheet } from '../good-lift.models.ts';

export type ReplayResult = RunSheet | { error: string };
export const REPLAY_WORK = Object.freeze({ chunk: 30, budget: 4 });
const clock = () => globalThis.performance?.now() ?? Date.now();
type Timer = ReturnType<typeof setTimeout> | number;
interface ReplayCursor<T> { advance(maxSteps: number): boolean; readonly result: T | null }
interface ReplayWorkOptions<T> {
  now?: () => number; later?: (work: () => void) => Timer; cancel?: (timer: Timer) => void;
  make?: (input: { log: RunLog }) => ReplayCursor<T>; chunk?: number; budget?: number;
}

/** Cancellation settles every job, even if its scheduler already queued another callback. */
export function createReplayWork<T = ReplayResult>({ now = clock, later = (work) => setTimeout(work, 0), cancel = clearTimeout,
  make, chunk = REPLAY_WORK.chunk, budget = REPLAY_WORK.budget }: ReplayWorkOptions<T> = {}) {
  if (!Number.isInteger(chunk) || chunk < 1 || !(budget > 0) || !Number.isFinite(budget)) throw new RangeError('invalid replay work budget');
  const jobs = new Set<{ stop(): void }>();
  let generation = 0;
  function run(log: RunLog): Promise<T | ReplayResult> {
    const epoch = generation;
    let timer: Timer | null = null, replay: ReplayCursor<T> | ReturnType<typeof createReplay> | null = null, done = false;
    let resolve!: (value: T | ReplayResult) => void;
    const promise = new Promise<T | ReplayResult>((answer) => { resolve = answer; });
    const job = { stop: () => finish({ error: 'cancelled' }) };
    jobs.add(job);
    function finish(result: T | ReplayResult | null) {
      if (done) return;
      done = true;
      if (timer !== null) cancel(timer);
      timer = null;
      jobs.delete(job);
      resolve(result ?? { error: 'corrupt' });
    }
    function work() {
      timer = null;
      if (done || epoch !== generation) return finish({ error: 'cancelled' });
      try {
        const from = now();
        replay ??= make ? make({ log }) : createReplay({ log });
        let at = now(), cost = 0;
        do {
          const before = now();
          const finished = replay.advance(chunk);
          if (done || epoch !== generation) return finish({ error: 'cancelled' });
          if (finished) return finish(replay.result);
          at = now();
          cost = at - before;
        } while (at - from + cost < budget);
        timer = later(work);
      } catch { finish({ error: 'corrupt' }); }
    }
    timer = later(work);
    return promise;
  }
  function stop() { generation++; for (const job of [...jobs]) job.stop(); }
  return { run, cancel: stop, get pending() { return jobs.size; } };
}
