import type { RunWorld } from './models.ts';
// The meet sheet's numbers for one run of Good Lift: what it banked and how it was flown, copied out
// of the run's world (run-step.js) once the run has ended. Live play and a replay of the run's log
// (replay.js) both read a run here, so the sheet a pilot is shown and the one a replay checks it by
// can only differ if the runs themselves did. It reads the world and never writes to it; the
// sheet's words, feats and barogram are drawn from what it returns (meet-card.js).

/**
 * The sheet of a run that has ended for `reason`, read from `world` after finishRun (run-step.js)
 * has judged what was left on the bar. A new object each call, sharing nothing with the world's
 * pools, so it can be kept, sent and compared; it is made once a run, never once a step.
 *
 *   seed, reason      the sky the run was flown on, and how it ended: 'fog', 'landed', 'time' or 'quit'
 *                     (any other ending is a quit, as the meet counts it)
 *   steps, seconds    fixed steps flown, and run seconds on the sky's clock
 *   total             kg banked by good lifts, a multiple of 2.5 (0 with no meet)
 *   peak              m: the highest the glider was, whole metres down
 *   lifts             the lifts judged, in order, the bar judged as the run ended last (`line`
 *                     0): { line, kg, red (bit 0 contact, bit 1 control, bit 2 airspace), good,
 *                     double, at }
 *   stats             strikes, stalls, seconds in cloud (rounded); the plates loaded: reps and those
 *                     of them to depth, trails laid, plates off gust fronts, from under clouds and
 *                     the fog's bait, and close calls; plates a strike sprayed off the bar and those
 *                     loaded back; kettlebells thrown, dodged, hit and glanced off Algiz, and how
 *                     the Beast came out (BELL_RESULT; 0 if it was never thrown, or still falling);
 *                     rune gates flown through, and the runes taken (bit rune - 1 for each, RUNE);
 *                     and the run's style (meet-style.js): the points its tricks landed, the most
 *                     wingovers in one set landed, and the deepest pitch caught, in whole degrees
 *   trace             the barogram: `alt`, `fog` and `total` for each run second, `n` of them
 */
import { isJudgedEnding } from './run-rules.ts';

export function summariseRun(world: RunWorld, reason?: string) {
  const { sky, g, meet, bells, trace, style } = world;
  const { state } = sky;
  const { pilot } = state;
  const met = meet ? meet.state : null;
  const thrown = bells ? bells.state : null;
  const lifts = [];
  if (met) {
    for (let i = 0; i < Math.min(met.count, met.lifts.length); i++) {
      const { line, kg, red, good, double, at } = met.lifts[i];
      lifts.push({ line, kg, red, good, double, at });
    }
  }
  const n = trace ? trace.n : 0;
  return {
    seed: state.seed,
    reason: isJudgedEnding(reason) ? reason : 'quit',
    steps: world.steps,
    seconds: state.elapsed,
    total: met ? met.total : 0,
    peak: Math.floor(Math.max(state.peak, g.pos.y)),
    lifts,
    stats: {
      strikes: pilot.strikes,
      stalls: world.stalls,
      cloud: Math.round(pilot.cloudTime),
      reps: met ? met.reps : 0,
      deep: met ? met.deep : 0,
      trails: met ? met.trails : 0,
      wind: met ? met.wind : 0,
      thunder: met ? met.thunder : 0,
      bait: met ? met.bait : 0,
      close: met ? met.close : thrown ? thrown.close : 0,
      scattered: met ? met.scattered : 0,
      recovered: met ? met.recovered : 0,
      thrown: thrown ? thrown.thrown : 0,
      dodged: thrown ? thrown.dodged : 0,
      hits: thrown ? thrown.hits : 0,
      glanced: thrown ? thrown.glanced : 0,
      beast: thrown ? thrown.beast.result : 0,
      gates: met ? met.runes.taken : 0,
      runes: met ? met.runes.runes : 0,
      style: style ? style.state.total : 0,
      wingovers: style ? style.state.wingovers : 0,
      pitch: style ? style.state.pitch : 0,
      loops: style ? style.state.mostLoops : 0,
    },
    trace: {
      alt: trace ? Array.from(trace.alt.subarray(0, n)) : [],
      fog: trace ? Array.from(trace.fog.subarray(0, n)) : [],
      total: trace ? Array.from(trace.total.subarray(0, n)) : [],
      n,
    },
  };
}
