// The meet's bots: three reference pilots (pilots.js) who fly the sky a run was flown on once its
// meet sheet is open, each in a world of its own. What they lift sets the sky's medals, and the
// first of them, TST, is the bot a run is out to beat: the day's board pins it among the runs, and
// out-lifting it earns the beat-the-bot feat. They fly in the page, a few milliseconds at a time
// while it is idle and never as one long task: a whole run is some 8,600 steps, and the three of
// them took 90 to 150 ms of work in Node on a desktop (in 4 ms slices, 0.1 to 0.2 s in all), and
// take a phone several times that. What they came to is kept for the visit by sky (and by
// good-lift.js, in the store, for the day's), so a sky flown again never flies its bots twice.
//
// A bot flies through the one step every run takes (run-step.js), steering by degrees as the tests'
// pilots do, so the bots here come to exactly what the same pilots do on the same sky in `npm test`.
// Nothing a bot does reaches a run: each flies a world of its own, and none is ever recorded.
import { TST, createReferencePilot } from './pilots.js';
import { RUN, createRunWorld, finishRun, startRun, stepRun } from './run-step.js';
import { createCloudbaseRun } from './cloudbase-state.js';
import { createMeet } from './meet-state.js';
import { createBells } from './bells.js';
import { summariseRun } from './meet-sheet.js';
import { SIM_VERSION } from './sim-version.js';
import { outranks } from './board.js';

// The bots, in the order they fly: TST first, as the one a run is judged against for the feat and
// the board. On a typical sky the pilot holding its line on the light brake (and through every
// kettlebell) sets bronze, TST silver and the collector gold: their median totals over 40 skies
// under SIM_VERSION 2 are 191, 238 and 358 kg (good-lift.test.js). But on 20 of the 40 Daily Skies
// from 15 October 2026, under the same rules, two of them swapped places (the line-holder over TST
// on 11), so the medals go by what they lifted on the sky, not by who they are (medalsOf).
export const BOTS = Object.freeze([
  Object.freeze({ id: 'tst', name: 'TST', pilot: TST }),
  Object.freeze({ id: 'holder', name: 'the line-holder', pilot: Object.freeze({ brake: 'eased' }) }),
  Object.freeze({ id: 'collector', name: 'the collector', pilot: Object.freeze({ ...TST, collect: true }) }),
]);

// The medals, lightest first: as many as there are bots.
export const MEDALS = Object.freeze(['bronze', 'silver', 'gold']);

// How the bots fly in the page. A slice flies `chunk` steps at a time until `slice` ms have gone,
// or the idle time the browser offered if that is less, and always at least one chunk; it starts
// no chunk that the last one says would take it past that. Where the browser says when it is idle
// (requestIdleCallback) the next slice waits for that, `wait` ms at most; where it cannot (Safari),
// the next slice is the next task. A slice the browser found no idle time for by then (a page busy
// every frame, as a slow phone drawing the scene behind the sheet can be) flies a whole `slice` all
// the same: given a single 60-step chunk there, the bots took 420 slices, 105 s at a 250 ms wait,
// and given whole slices they take some 60 in Node, 6 s at 100 ms, while the page gives up some
// 4 ms in every 100. Cold, as the first of a visit are, making the bots' worlds and laying out a sky
// for them cost a few milliseconds each (in Node, 0.7 to 1.3 ms and 1.8 to 6.6 ms), so each has a
// slice of its own, and the first chunk flown takes most of a slice by itself (3.4 to 6.5 ms),
// however short it is. A bot's run the fog has not caught by `limit` seconds is ended there (none
// comes near: recorder.js's MAX_STEPS, the longest run a link can hold, is the same 240 s). The
// visit keeps the bots of the last `keep` skies.
export const BOT_FLIGHT = Object.freeze({
  slice: 4, // ms of flying at a time
  chunk: 20, // steps between looks at the clock: a third of a second of a bot's run, 0.2 ms warm in Node
  wait: 100, // ms a slice waits at most for the page to be idle
  limit: 240, // s of a bot's run
  keep: 16, // skies whose bots the visit keeps
});

/**
 * The sky's medals, from what its bots came to (`scores`, in BOTS order): bronze the lightest of
 * them, gold the heaviest, ranked the way the board ranks runs (total, then peak). Each is
 * { medal, total, peak, by }, `by` being the id of the bot that set it, lightest first.
 */
export function medalsOf(scores) {
  const set = scores.map((score, i) => ({ total: score.total, peak: score.peak, by: BOTS[i].id }));
  // Lightest first; of two that tie, the one that flew first sets the lighter medal.
  set.sort((a, b) => (outranks(a, b) ? 1 : outranks(b, a) ? -1 : 0));
  return set.map((mark, i) => ({ medal: MEDALS[i], ...mark }));
}

/**
 * The medal a run ({ reason, total, peak }) took on a sky whose bots came to `scores`: as a meet
 * places its lifters, gold for beating all three bots, silver for two of them and bronze for one,
 * a run beating a bot when it outranks it as the board ranks them (a tie is the bot's); '' for
 * none. Only a run the sky judged can take one: a run ended with [ end run ] forfeits its bar, and
 * its place with it.
 */
export function medalFor(run, scores) {
  if (run.reason !== 'fog' && run.reason !== 'landed') return '';
  let beaten = 0;
  for (const score of scores) if (outranks(run, score)) beaten += 1;
  return beaten > 0 ? MEDALS[beaten - 1] : '';
}

/**
 * The run still to be held up against TST once the bots land on its sky, after the sheet of `run`
 * ({ seed, reason, total, peak }) has opened: `run` itself if the sky judged it and it outranks the
 * run `owed` before on the same sky, or else that one. What was owed on another sky is dropped:
 * its sheet was put away before the bots landed, and they have left that sky. null for none.
 */
export function owing(owed, run) {
  const before = owed?.seed === run.seed ? owed : null;
  const judged = run.reason === 'fog' || run.reason === 'landed';
  return judged && (!before || outranks(run, before)) ? { seed: run.seed, total: run.total, peak: run.peak } : before;
}

/**
 * What the bots tell the sheet of `run` (a sheet's result: { at, seed, reason, total, peak }) once
 * they have landed on its sky with `scores` (BOTS order), `fresh` being the feats that earned:
 *
 *   at, seed   the run whose sheet it is for (its start, ms) and its sky
 *   medals     the sky's medals, lightest first (medalsOf)
 *   medal      the medal the run took: 'bronze', 'silver', 'gold', or '' for none (medalFor)
 *   beat       whether the run out-lifted TST, as the board ranks runs
 *   tst        TST's run, for the day's board: { who, total, peak, red }
 *   fresh      the feats newly earned as they landed
 *   scores     what each bot came to
 */
export function landing(run, scores, fresh = []) {
  const [tst] = scores;
  return {
    at: run.at,
    seed: run.seed,
    medals: medalsOf(scores),
    medal: medalFor(run, scores),
    beat: (run.reason === 'fog' || run.reason === 'landed') && outranks(run, tst),
    tst: { who: BOTS[0].name, total: tst.total, peak: tst.peak, red: tst.red },
    fresh,
    scores,
  };
}

/**
 * The bots flying one sky, a slice at a time, each in a world of its own that is made once and
 * reused for every sky after it. Nothing is made while they fly but each bot's score as it lands.
 *
 *   start(seed)     lays out the sky from `seed` for every bot and puts them all at the gate
 *   advance(steps)  flies up to `steps` more steps, one bot after another; true once all have landed
 *   seed            the sky being flown, -1 before the first
 *   landed          how many bots have finished their runs
 *   steps           steps flown on this sky, by all the bots together
 *   done            whether every bot has landed
 *   scores          what each came to, in BOTS order, null until it lands: { total, peak, red,
 *                   reason }, read off its run's sheet (summariseRun) as a player's is
 */
export function createBotFlight() {
  const worlds = BOTS.map(() => createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells() }));
  const pilots = BOTS.map(() => null);
  const scores = BOTS.map(() => null);
  // What a bot asks of its wing, written by its pilot at every step: one object for all of them.
  const intent = { turn: 0, brake: false, bar: false };
  let seed = -1;
  let landed = 0;
  let steps = 0;

  function start(next) {
    seed = next >>> 0;
    landed = steps = 0;
    for (let i = 0; i < BOTS.length; i++) {
      startRun(worlds[i], seed);
      pilots[i] = createReferencePilot(BOTS[i].pilot);
      scores[i] = null;
    }
  }

  // Ends the flying bot's run as a run ends (finishRun) and reads its score off its sheet.
  function land(ending) {
    const world = worlds[landed];
    finishRun(world, ending);
    const sheet = summariseRun(world, ending);
    scores[landed] = Object.freeze({ total: sheet.total, peak: sheet.peak, red: Object.freeze(sheet.lifts.map((lift) => lift.red)), reason: sheet.reason });
    landed += 1;
  }

  function advance(most = Infinity) {
    let left = most;
    while (seed >= 0 && landed < BOTS.length && left > 0) {
      const world = worlds[landed];
      const pilot = pilots[landed];
      const { state } = world.sky;
      let ending = null;
      // As flyPilot flies one (pilots.js): what it asks for, then the step.
      while (!ending && left > 0 && state.elapsed < BOT_FLIGHT.limit) {
        ending = stepRun(world, pilot.decide(world, intent), RUN.step);
        left -= 1;
        steps += 1;
      }
      if (ending) land(ending);
      else if (state.elapsed >= BOT_FLIGHT.limit) land('quit');
    }
    return landed === BOTS.length;
  }

  return {
    start,
    advance,
    get seed() { return seed; },
    get landed() { return landed; },
    get steps() { return steps; },
    get done() { return seed >= 0 && landed === BOTS.length; },
    get scores() { return scores; },
  };
}

// The page's next quiet moment: an idle callback where the browser has them, and the next task
// where it does not. Looked up when asked, so the tests' clock can stand in for the page's.
const idle = () => typeof globalThis.requestIdleCallback === 'function';
const WAIT = Object.freeze({ timeout: BOT_FLIGHT.wait });
const soon = (work) => (idle() ? globalThis.requestIdleCallback(work, WAIT) : setTimeout(work, 0));
const stop = (handle) => (idle() ? globalThis.cancelIdleCallback(handle) : clearTimeout(handle));
const clock = () => performance.now();

/**
 * The bots for the meet sheet: flown while the page is idle, a slice at a time, and kept for the
 * visit by sky once they have landed.
 *
 *   fly(seed, landed)       asks for the bots of the sky laid out from `seed`: `landed(scores)` is
 *                           called once they are all in (BOTS order, as createBotFlight's), from the
 *                           visit's own if they have flown that sky before, and never within the
 *                           call. Asking again takes the place of the last ask: bots part of the way
 *                           through the same sky fly on from where they were, and any other sky
 *                           starts them afresh. If they cannot fly at all (a fault), `landed(null)`.
 *   pause()                 stops flying, and forgets the ask, until fly() is called again (as a run
 *                           is flown: the bots never take a frame from a run)
 *   remember(seed, scores)  keeps scores known from elsewhere: the store's, for the day's sky
 *   known(seed)             the scores the visit keeps for that sky, or null
 *   state                   { seed, asked, flying, landed, steps, kept } for QA
 *   dispose()               stops for good
 *
 * `now` (ms), `later(work)` and `cancel(handle)` are the clock and the page's scheduler; `later`
 * calls `work` with the browser's idle deadline, if it has one. The tests hand in their own.
 */
export function createBots({ now = clock, later = soon, cancel = stop } = {}) {
  // Made the first time bots are flown: three skies' worth of pools.
  let flight = null;
  const kept = new Map();
  let ask = null;
  let timer = null;

  const keyOf = (seed) => `${SIM_VERSION}:${seed >>> 0}`;

  function remember(seed, scores) {
    const key = keyOf(seed);
    kept.delete(key);
    kept.set(key, Object.freeze(scores.map((score) => Object.freeze({ ...score, red: Object.freeze([...score.red]) }))));
    // The oldest goes first: a Map keeps the order its keys were set in.
    while (kept.size > BOT_FLIGHT.keep) kept.delete(kept.keys().next().value);
  }

  const known = (seed) => kept.get(keyOf(seed)) ?? null;

  function pause() {
    if (timer !== null) cancel(timer);
    timer = null;
    ask = null;
  }

  function fly(seed, landed) {
    pause();
    ask = { seed: seed >>> 0, landed };
    timer = later(work);
  }

  // One slice: the kept scores if the sky has been flown; otherwise the bots' worlds made, or their
  // sky laid out, each a slice of its own; otherwise as much flying as the slice allows. Then the
  // next slice, or the scores once every bot is in.
  function work(deadline) {
    timer = null;
    const asked = ask;
    if (!asked) return;
    let scores = known(asked.seed);
    if (!scores) {
      try {
        if (!flight || flight.seed !== asked.seed) {
          if (flight) flight.start(asked.seed);
          else flight = createBotFlight();
          timer = later(work);
          return;
        }
        // The idle time the browser offers, up to a slice; a whole slice where it says nothing of
        // idle time (Safari) or has given up waiting for some, since none is coming.
        const offered = deadline && !deadline.didTimeout ? deadline.timeRemaining?.() : undefined;
        const budget = Math.min(BOT_FLIGHT.slice, offered ?? BOT_FLIGHT.slice);
        // Chunk after chunk, but never one that the last says would run past the budget: the first
        // of a visit is cold, and takes most of a slice by itself.
        const from = now();
        let at = from;
        let last = 0;
        let done = false;
        do {
          done = flight.advance(BOT_FLIGHT.chunk);
          const time = now();
          last = time - at;
          at = time;
        } while (!done && at - from + last <= budget);
        if (!done) {
          timer = later(work);
          return;
        }
        remember(asked.seed, flight.scores);
        scores = known(asked.seed);
      } catch (error) {
        console.warn('Good Lift: the bots could not fly this sky.', error);
        flight = null;
        scores = null;
      }
    }
    ask = null;
    asked.landed(scores);
  }

  return {
    fly,
    pause,
    remember,
    known,
    dispose: pause,
    get state() {
      return {
        seed: flight?.seed ?? -1, asked: ask?.seed ?? -1, flying: timer !== null, landed: flight?.landed ?? 0, steps: flight?.steps ?? 0, kept: kept.size,
      };
    },
  };
}
