// Browser replay work yields between short slices. The numeric replay remains the server's
// synchronous judge; this scheduler only controls when the same steps are evaluated.
import { createReplay } from './replay.js';

export const REPLAY_WORK = Object.freeze({ chunk: 30, budget: 4 });
const clock = () => globalThis.performance?.now() ?? Date.now();

/** Sliced replays with explicit cancellation, including callbacks already queued by a scheduler. */
export function createReplayWork({ now = clock, later = (work) => setTimeout(work, 0), cancel = clearTimeout,
  make = createReplay, chunk = REPLAY_WORK.chunk, budget = REPLAY_WORK.budget } = {}) {
  if (!Number.isInteger(chunk) || chunk < 1 || !(budget > 0) || !Number.isFinite(budget)) throw new RangeError('invalid replay work budget');
  const jobs = new Set();
  let generation = 0;

  function run(log) {
    const epoch = generation;
    let timer = null, replay = null, done = false;
    let resolve;
    const promise = new Promise((answer) => { resolve = answer; });
    const job = { stop: () => finish({ error: 'cancelled' }) };
    jobs.add(job);
    function finish(result) {
      if (done) return;
      done = true;
      if (timer !== null) cancel(timer);
      timer = null;
      jobs.delete(job);
      resolve(result);
    }
    function work() {
      timer = null;
      if (done || epoch !== generation) return finish({ error: 'cancelled' });
      try {
        const from = now();
        replay ??= make({ log });
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
      } catch {
        finish({ error: 'corrupt' });
      }
    }
    timer = later(work);
    return promise;
  }

  function stop() {
    generation++;
    for (const job of [...jobs]) job.stop();
  }
  return { run, cancel: stop, get pending() { return jobs.size; } };
}
