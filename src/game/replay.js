// Replays a run from its log (recorder.js): a sky of its own laid out from the log's seed, with its
// own meet and kettlebells, flown through the one fixed step (run-step.js) on each logged step's
// controls, exactly as live play flew them. A run is its seed and its controls, so a replay lands on
// the same total, peak and lights as the run it was recorded from, and that is how a challenge
// link's claim is checked and a board row's total proved. Sliced, so a page can spread one over
// frames; it allocates nothing once it is made.
import { createCloudbaseRun } from './cloudbase-state.js';
import { createMeet } from './meet-state.js';
import { createBells } from './bells.js';
import { createStyle } from './meet-style.js';
import { createRunWorld, finishRun, startRun, stepFrame } from './run-step.js';
import { summariseRun } from './meet-sheet.js';
import { SIM_VERSION } from './sim-version.js';

/**
 * A replay of `log` (decodeLog's), flown a slice at a time. A log flown under another sim version
 * is refused at once: its sky and its rules are not these.
 *
 *   advance(maxSteps)   flies up to `maxSteps` more logged steps (all of them if left out); true once done
 *   done                whether the replay has finished
 *   result              null until done; then the run's sheet (meet-sheet.js's summariseRun), or
 *                       { error: 'version' } for a log of another sim version, or { error: 'corrupt' }
 *                       when the run ended before its log did: the log says the pilot flew on in a run
 *                       that was over, which no recording does
 *
 * A log that runs out while the run is still flying is a run its pilot ended: it is finished as a
 * quit, which forfeits what is on the bar.
 */
export function createReplay({ log }) {
  let done = false;
  let result = null;
  let at = 0;
  let world = null;
  if (log.simVersion !== SIM_VERSION) {
    done = true;
    result = { error: 'version' };
  } else {
    world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells(), style: createStyle() }), log.seed);
  }

  function advance(maxSteps = Infinity) {
    if (done) return true;
    const { bits, steps } = log;
    const end = Math.min(steps, at + Math.max(0, maxSteps));
    let ended = null;
    while (at < end && !ended) {
      ended = stepFrame(world, bits[at]);
      at += 1;
    }
    if (ended && at < steps) {
      done = true;
      result = { error: 'corrupt' };
    } else if (ended || at >= steps) {
      const reason = ended ?? 'quit';
      finishRun(world, reason);
      done = true;
      result = summariseRun(world, reason);
    }
    return done;
  }

  return {
    advance,
    get done() { return done; },
    get result() { return result; },
  };
}

/** Replays the whole of `log` at once: its sheet, or { error: 'version' } or { error: 'corrupt' }. */
export function replayLog(log) {
  const replay = createReplay({ log });
  replay.advance();
  return replay.result;
}
