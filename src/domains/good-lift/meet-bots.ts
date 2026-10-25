import type { RankedScore } from './board.types.ts';
export interface BotScore extends RankedScore {red: readonly number[]; reason?: string}
export interface MedalMark extends RankedScore {medal: string; by: string}
export interface BotRun extends RankedScore {reason?: string; seed: number; at: number; wing?: string}
export interface BotLandingResult {at: number; seed: number; medals: MedalMark[]; medal: string; beat: boolean; tst: RankedScore & {who: string; red: readonly number[]; glider?: string}; fresh: string[]; scores: readonly BotScore[]}
export interface BotDeadline {didTimeout?: boolean; timeRemaining?: () => number}
export interface BotScheduler<Handle> {now: () => number; later: (work: (deadline?: BotDeadline) => void) => Handle; cancel: (handle: Handle) => void; onError?: (error: unknown) => void}
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
import { TST, createReferencePilot } from './pilots.ts';
import { GLIDERS, planFor } from './gliders.ts';
import { RUN, createRunWorld, finishRun, startRun, stepRun } from './run-step.ts';
import { createCloudbaseRun } from './cloudbase-state.ts';
import { createMeet } from './meet-state.ts';
import { createBells } from './bells.ts';
import { summariseRun } from './meet-sheet.ts';
import { SIM_VERSION } from './sim-version.ts';
import { outranks } from './board.ts';
import { isJudgedEnding } from './run-rules.ts';

// Reference pilots set each sky's medals from their actual ranked flights, with TST pinned first.
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
// comes near: recorder.js's MAX_STEPS, the longest run a link can hold, is the same ten-minute deadline). The
// visit keeps the bots of the last `keep` skies.
export const BOT_FLIGHT = Object.freeze({
  slice: 4, // ms of flying at a time
  chunk: 20, // steps between looks at the clock: a third of a second of a bot's run, 0.2 ms warm in Node
  wait: 100, // ms a slice waits at most for the page to be idle
  limit: RUN.seconds, // s: the same deadline as live play
  keep: 16, // skies whose bots the visit keeps
});

/**
 * The sky's medals, from what its bots came to (`scores`, in BOTS order): bronze the lightest of
 * them, gold the heaviest, ranked the way the board ranks runs (the score, then the peak; a bot flies
 * no tricks, so its score is its total). Each is
 * { medal, total, peak, by }, `by` being the id of the bot that set it, lightest first.
 */
export function medalsOf(scores: readonly RankedScore[]): MedalMark[] {
  const set = scores.map((score, i: number) => ({ total: score.total, peak: score.peak, by: BOTS[i].id }));
  // Lightest first; of two that tie, the one that flew first sets the lighter medal.
  set.sort((a, b) => (outranks(a, b) ? 1 : outranks(b, a) ? -1 : 0));
  return set.map((mark, i: number) => ({ medal: MEDALS[i], ...mark }));
}

/**
 * The medal a run ({ reason, total, peak }) took on a sky whose bots came to `scores`: as a meet
 * places its lifters, gold for beating all three bots, silver for two of them and bronze for one,
 * a run beating a bot when it outranks it as the board ranks them (a tie is the bot's); '' for
 * none. Only a run the sky judged can take one: a run ended with [ end run ] forfeits its bar, and
 * its place with it.
 */
export function medalFor(run: RankedScore & {reason?: string}, scores: readonly RankedScore[]) {
  if (!isJudgedEnding(run.reason)) return '';
  let beaten = 0;
  for (const score of scores) if (outranks(run, score)) beaten += 1;
  return beaten > 0 ? MEDALS[beaten - 1] : '';
}

/**
 * The run still to be held up against TST once the bots land on its sky, after the sheet of `run`
 * ({ seed, wing, reason, total, style, peak }) has opened: `run` itself if the sky judged it and it
 * outranks the run `owed` before on the same sky and glider, or else that one. What was owed on
 * another sky, or on another glider, is dropped: its sheet was put away before the bots landed, and
 * they have left that sky, or fly another glider. null for none.
 */
export function owing(owed: (RankedScore & {seed: number; wing?: string}) | null, run: RankedScore & {seed: number; reason?: string; wing?: string}) {
  const before = owed?.seed === run.seed && owed.wing === run.wing ? owed : null;
  const judged = isJudgedEnding(run.reason);
  return judged && (!before || outranks(run, before)) ? { seed: run.seed, ...(run.wing ? { wing: run.wing } : {}), total: run.total, style: run.style ?? 0, peak: run.peak } : before;
}

/**
 * What the bots tell the sheet of `run` (a sheet's result: { at, seed, wing, reason, total, peak })
 * once they have landed on its sky, flying its glider, with `scores` (BOTS order), `fresh` being the
 * feats that earned:
 *
 *   at, seed   the run whose sheet it is for (its start, ms) and its sky
 *   medals     the sky's medals, lightest first (medalsOf)
 *   medal      the medal the run took: 'bronze', 'silver', 'gold', or '' for none (medalFor)
 *   beat       whether the run out-lifted TST, as the board ranks runs
 *   tst        TST's run, for the day's board: { who, total, peak, red, glider }
 *   fresh      the feats newly earned as they landed
 *   scores     what each bot came to
 */
export function landing(run: BotRun, scores: readonly BotScore[], fresh: string[] = []): BotLandingResult {
  const [tst] = scores;
  return {
    at: run.at,
    seed: run.seed,
    medals: medalsOf(scores),
    medal: medalFor(run, scores),
    beat: isJudgedEnding(run.reason) && outranks(run, tst),
    tst: { who: BOTS[0].name, total: tst.total, peak: tst.peak, red: tst.red, ...(run.wing ? { glider: run.wing } : {}) },
    fresh,
    scores,
  };
}

/**
 * The bots flying one sky, a slice at a time, each in a world of its own that is made once and
 * reused for every sky after it. Nothing is made while they fly but each bot's score as it lands.
 *
 *   start(seed, wing)  lays out the sky from `seed` for every bot and puts them all at the gate, in
 *                   `wing` (the player's glider: the EN-A unless another is named)
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
  const pilots: (ReturnType<typeof createReferencePilot> | null)[] = BOTS.map(() => null);
  const scores: (Readonly<BotScore> | null)[] = BOTS.map(() => null);
  // What a bot asks of its wing, written by its pilot at every step: one object for all of them.
  const intent = { turn: 0, brake: false, bar: false };
  let seed = -1;
  let wing: string = GLIDERS[0];
  let landed = 0;
  let steps = 0;

  function start(next: number, flown: string = GLIDERS[0]) {
    seed = next >>> 0;
    wing = flown;
    landed = steps = 0;
    for (let i = 0; i < BOTS.length; i++) {
      worlds[i].wing = wing;
      startRun(worlds[i], seed);
      pilots[i] = createReferencePilot({ ...BOTS[i].pilot, plan: planFor(wing) });
      scores[i] = null;
    }
  }

  // Ends the flying bot's run as a run ends (finishRun) and reads its score off its sheet.
  function land(ending: string) {
    const world = worlds[landed];
    finishRun(world, ending);
    const sheet = summariseRun(world, ending);
    scores[landed] = Object.freeze({ total: sheet.total, style: 0, peak: sheet.peak, red: Object.freeze(sheet.lifts.map((lift) => lift.red)), reason: sheet.reason });
    landed += 1;
  }

  function advance(most = Infinity) {
    let left = most;
    while (seed >= 0 && landed < BOTS.length && left > 0) {
      const world = worlds[landed];
      const pilot = pilots[landed];
      let ending = null;
      // As flyPilot flies one (pilots.js): what it asks for, then the step.
      while (!ending && left > 0 && world.steps < RUN.maxSteps) {
        ending = stepRun(world, pilot!.decide(world, intent), RUN.step);
        left -= 1;
        steps += 1;
      }
      if (ending) land(ending);
      else if (world.steps >= RUN.maxSteps) land('time');
    }
    return landed === BOTS.length;
  }

  return {
    start,
    advance,
    get seed() { return seed; },
    get wing() { return wing; },
    get landed() { return landed; },
    get steps() { return steps; },
    get done() { return seed >= 0 && landed === BOTS.length; },
    get scores() { return scores; },
  };
}

/**
 * The bots for the meet sheet: flown while the page is idle, a slice at a time, and kept for the
 * visit by sky once they have landed.
 *
 *   fly(seed, landed, wing) asks for the bots of the sky laid out from `seed`, flying `wing` (the
 *                           player's glider; the EN-A if none is named): `landed(scores)` is
 *                           called once they are all in (BOTS order, as createBotFlight's), from the
 *                           visit's own if they have flown that sky before, and never within the
 *                           call. Asking again takes the place of the last ask: bots part of the way
 *                           through the same sky fly on from where they were, and any other sky
 *                           starts them afresh. If they cannot fly at all (a fault), `landed(null)`.
 *   pause()                 stops flying, and forgets the ask, until fly() is called again (as a run
 *                           is flown: the bots never take a frame from a run)
 *   remember(seed, scores, wing)  keeps scores known from elsewhere: the store's, for the day's sky
 *   known(seed, wing)       the scores the visit keeps for that sky and wing, or null
 *   state                   { seed, asked, flying, landed, steps, kept } for QA
 *   dispose()               stops for good
 *
 * `now` (ms), `later(work)` and `cancel(handle)` are the clock and the page's scheduler; `later`
 * calls `work` with the browser's idle deadline, if it has one. The tests hand in their own.
 */
export function createBots<Handle>({ now, later, cancel, onError }: BotScheduler<Handle>) {
  // Made the first time bots are flown: three skies' worth of pools.
  let flight: ReturnType<typeof createBotFlight> | null = null;
  const kept = new Map<string, readonly BotScore[]>();
  let ask: {seed: number; wing: string; landed: (scores: readonly BotScore[] | null) => void} | null = null;
  let timer: Handle | null = null;

  // Each glider's bots are kept apart: they fly it.
  const keyOf = (seed: number, wing: string) => `${SIM_VERSION}:${seed >>> 0}:${wing}`;

  function remember(seed: number, scores: readonly BotScore[], wing: string = GLIDERS[0]) {
    const key = keyOf(seed, wing);
    kept.delete(key);
    kept.set(key, Object.freeze(scores.map((score) => Object.freeze({ ...score, red: Object.freeze([...score.red]) }))));
    // The oldest goes first: a Map keeps the order its keys were set in.
    while (kept.size > BOT_FLIGHT.keep) kept.delete(kept.keys().next().value!);
  }

  const known = (seed: number, wing: string = GLIDERS[0]) => kept.get(keyOf(seed, wing)) ?? null;

  function pause() {
    if (timer !== null) cancel(timer);
    timer = null;
    ask = null;
  }

  function fly(seed: number, landed: (scores: readonly BotScore[] | null) => void, wing: string = GLIDERS[0]) {
    pause();
    ask = { seed: seed >>> 0, wing, landed };
    timer = later(work);
  }

  // One slice: the kept scores if the sky has been flown; otherwise the bots' worlds made, or their
  // sky laid out, each a slice of its own; otherwise as much flying as the slice allows. Then the
  // next slice, or the scores once every bot is in.
  function work(deadline?: BotDeadline) {
    timer = null;
    const asked = ask;
    if (!asked) return;
    let scores = known(asked.seed, asked.wing);
    if (!scores) {
      try {
        if (!flight || flight.seed !== asked.seed || flight.wing !== asked.wing) {
          if (flight) flight.start(asked.seed, asked.wing);
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
        remember(asked.seed, flight.scores as BotScore[], asked.wing);
        scores = known(asked.seed, asked.wing);
      } catch (error) {
        onError?.(error);
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
