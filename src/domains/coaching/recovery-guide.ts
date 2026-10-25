import type { FlightState } from '../flight/models.ts';
import type { Failure } from '../flight/wing-folds.ts';
import { FAILURES } from '../flight/wing-folds.ts';
import { wingTable } from '../flight/flight-physics.ts';
// The one way out of each way a wing fails (wing-folds.js): which failure the wing is in, the hands
// that fly it out step by step, and how long it took and how much height it cost. Training's cards,
// the run's cue, the bots and the tests all ask it, so a recovery is taught, shown, flown and checked
// alike. It only reads the wing: it never changes a run, and no replay steps it. Every pair of hands it
// asks for is a device's mark (brake-input.js), so a key gives it: 0.3 on one side (A/D), 0.6 on both
// (S), 0.82 on one side (Q/E), all of both (Shift with S), and the speed bar.

export const RECOVERY = Object.freeze({
  // Hands, as device marks: a light pull on one side, working depth on both, a deep pull on one side, all of it.
  counter: 0.3, both: 0.6, deep: 0.82, full: 1,
  // A half folded this much or more counts as a collapse; separated this much, as flying on its plate.
  folded: 0.05, half: 0.5,
  // rad/s: a canopy turning this fast on one separated half is spinning; a collapse's turn under
  // `turning` has been stopped.
  spinRate: 1.2, turning: 0.35,
  // Steps, sixty a second: the first counter at most, each pump's stroke, the counter between strokes,
  // each long pull on a caught tip, and how many of those before the tip is stalled free instead.
  counterMost: 60, stroke: 30, between: 24, pull: 60, pulls: 3,
  // A front collapse is pumped once with both hands for `frontalStroke` steps, `frontalWait` steps in,
  // on a wing a pump opens (Recovery's frontalPump: the C and up), and only while it is still more than
  // `frontalShut` tucked: hands held as it opens would stall it deep.
  frontalWait: 12, frontalStroke: 18, frontalShut: 0.5,
  // A stall is held until the swing has settled under these (rad, rad/s), or for `settleMost` steps.
  settledPitch: 0.17, settledRate: 0.2, settleMost: 180,
  // The dive after it is caught with both hands at working depth while the wing is this far ahead (rad)
  // and still going faster than `catchRate` rad/s.
  catchPitch: -0.35, catchRate: 0,
  // A wing still banked past `levelBank` rad once it is out is rolled level on the high side's light
  // pull, until it is under half that.
  levelBank: 0.2,
  // Saved after `calm` steps of the wing flying, its swing under `calmPitch` rad, level within
  // `levelBank` and its turn under `calmYaw` rad/s.
  calm: 30, calmPitch: 0.35, calmYaw: 0.5,
});
const HZ = 60;

/**
 * What a recovery is doing: countering a collapse's turn on the open side, a pump on the folded side,
 * hands up, catching the dive, rolling level, holding or letting go of a stall, the speed bar, a caught
 * tip pulled free, the lines unwound.
 */
export type RecoveryPhase = '' | 'counter' | 'pump' | 'up' | 'catch' | 'level' | 'hold' | 'release' | 'bar' | 'pull' | 'unwind';

/** What a trick watch (trick-watch.js) sees, where one is flown: a spin it has called, and a full stall flown on purpose. */
export interface TrickSight { spin: number; stalling: boolean }

/**
 * What the guide says this step.
 *
 *   event        the failure the wing is in ('' none), and its `side` (−1 left, 1 right, 0 both)
 *   phase        the step of its way out, and the hands it asks for: `left` and `right` (0 to 1) and the `bar`
 *   episode      episodes begun so far: an episode runs from a failure until the wing is saved
 *   first        what began this one, and `since`, the steps since it did (0 out of one)
 *   seen         every failure this one has gone through, a bit each (1 << its index in FAILURES)
 *   escalations  failures it went through that it did not begin with
 *   saves        episodes flown out of, and the last: what began it, its side, its seconds and the metres it cost
 */
export interface RecoveryAdvice {
  event: Failure | ''; side: number; phase: RecoveryPhase; left: number; right: number; bar: boolean;
  episode: number; first: Failure | ''; since: number; seen: number; escalations: number;
  saves: number; saved: { event: Failure | ''; side: number; seconds: number; lost: number };
}

const sideWord = (side: number) => side < 0 ? 'LEFT' : 'RIGHT';

/** What a failure is called by the pilot, on its side. */
export function failureName(event: Failure | '', side: number) {
  switch (event) {
    case 'asym': return `${sideWord(side)} COLLAPSE`;
    case 'frontal': return 'FRONTAL';
    case 'stall': return 'FULL STALL';
    case 'spin': return side < 0 ? '◂ SPIN' : 'SPIN ▸';
    case 'cravat': return `${sideWord(side)} CRAVAT`;
    case 'deep': return 'DEEP STALL';
    case 'twist': return 'LINE TWIST';
    default: return '';
  }
}

/**
 * The way out of a failure, as the guide flies it, in a few words: for a collapse and a cravat, the
 * open side braked and the other pumped or pulled; for a line twist, the side that unwinds it.
 */
export function failureFix(event: Failure | '', side: number) {
  switch (event) {
    case 'asym': return `BRAKE ${sideWord(-side)} · PUMP ${sideWord(side)}`;
    case 'frontal': return 'HANDS UP · CATCH THE DIVE';
    case 'stall': return 'HOLD IT · THEN LET GO';
    case 'spin': return 'HANDS UP · CATCH THE DIVE';
    case 'cravat': return `BRAKE ${sideWord(-side)} · PULL ${sideWord(side)}`;
    case 'deep': return 'HANDS UP · SPEED BAR';
    case 'twist': return `HANDS UP · ${sideWord(side)} UNWINDS`;
    default: return '';
  }
}

/** What a save cost, said in a few words: the seconds it took, and the metres lost if a metre or more. */
export function savedWords(seconds: number, lost: number) {
  const metres = Math.round(lost);
  return `SAVED · ${seconds.toFixed(1)} s${metres >= 1 ? ` · −${metres} m` : ''}`;
}

/**
 * The failure `g` is in this step, the worst first: a line twist, a deep stall, a tip caught, a spin, a
 * stall, a front collapse, a half folded; '' for none. One separated half is a spin once the canopy
 * turns on it fast enough; where a trick watch is flown (`tricks`), out of trouble, only once it has
 * called one, since a helicopter or a SAT is one flown on purpose. A full stall flown on purpose is a
 * trick, not a failure.
 */
export function classify(g: FlightState, trouble = false, tricks?: Readonly<TrickSight> | null): Failure | '' {
  if (g.twisted > 0) return 'twist';
  if (g.deepStall > 0) return 'deep';
  if (g.cravatLeft > 0 || g.cravatRight > 0) return 'cravat';
  const s = g.physical, R = RECOVERY;
  const half = (s.sepL >= R.half) !== (s.sepR >= R.half);
  if (half && g.stall === 0 && (trouble || !tricks ? Math.abs(g.canopy.omega.y) >= R.spinRate : tricks.spin > 0)) return 'spin';
  // A stall is answered while it holds the wing; once it is reattaching it is on its way out by itself.
  if (g.stall > 0 && g.wingPhase !== 'reattaching' && !tricks?.stalling) return 'stall';
  if (g.tuck > 0) return 'frontal';
  if (g.foldLeft > R.folded || g.foldRight > R.folded) return 'asym';
  return '';
}

// Which side a failure is on: the more folded half, the separated half, the caught tip; 0 for both.
function sideOf(g: FlightState, event: Failure | '') {
  switch (event) {
    case 'asym': return g.foldLeft >= g.foldRight ? -1 : 1;
    case 'spin': return g.physical.sepL >= g.physical.sepR ? -1 : 1;
    case 'cravat': return g.cravatLeft >= g.cravatRight ? -1 : 1;
    // The side whose hand unwinds the lines: right while the pilot is turned left of the wing.
    case 'twist': return g.twist > 0 ? 1 : -1;
    default: return 0;
  }
}

export function createRecoveryGuide() {
  const R = RECOVERY;
  const advice: RecoveryAdvice = { event: '', side: 0, phase: '', left: 0, right: 0, bar: false,
    episode: 0, first: '', since: 0, seen: 0, escalations: 0, saves: 0, saved: { event: '', side: 0, seconds: 0, lost: 0 } };
  let inEpisode = false, startY = 0, firstSide = 0, calm = 0, calmY = 0, phaseSteps = 0, countered = false, pumped = false, pulls = 0;

  function enter(phase: RecoveryPhase) { advice.phase = phase; phaseSteps = 0; }

  /** Forgets every episode: a new flight. */
  function reset() {
    Object.assign(advice, { event: '', side: 0, phase: '', left: 0, right: 0, bar: false, episode: 0, first: '', since: 0, seen: 0,
      escalations: 0, saves: 0 });
    Object.assign(advice.saved, { event: '', side: 0, seconds: 0, lost: 0 });
    inEpisode = false; startY = firstSide = calm = calmY = phaseSteps = pulls = 0; countered = pumped = false;
  }

  // A failure begun, or the wing gone from one failure into another: the first step of its way out.
  function meet(g: FlightState, event: Failure, side: number) {
    if (!inEpisode) {
      inEpisode = true; startY = g.pos.y; firstSide = side; calm = 0;
      advice.episode += 1; advice.first = event; advice.since = 0; advice.seen = 0; advice.escalations = 0;
    }
    const bit = 1 << FAILURES.indexOf(event);
    // Anything new is an escalation, but for the fold a freed tip leaves behind, or the stall a tip is shaken free by.
    const expected = advice.event === 'cravat' && (event === 'asym' || event === 'stall');
    if (advice.seen && !(advice.seen & bit) && !expected) advice.escalations += 1;
    advice.seen |= bit;
    advice.event = event; advice.side = side;
    countered = pumped = false; pulls = 0;
    enter(event === 'asym' || event === 'cravat' ? 'counter' : event === 'stall' ? 'hold' : event === 'deep' ? 'bar' :
      event === 'twist' ? 'unwind' : 'up');
  }

  // The hands for this step of the way out, by the failure and how it is going.
  function hands(g: FlightState) {
    let left = 0, right = 0;
    const side = advice.side, set = (on: number, depth: number) => { if (on < 0) left = depth; else right = depth; };
    switch (advice.event) {
      case 'asym':
        // Stop the turn on the open half first, then pump the folded one, back to the counter between strokes.
        if (advice.phase === 'counter' && phaseSteps >= R.between &&
          (countered || side * g.yawRate < R.turning || phaseSteps >= R.counterMost)) {
          countered = true; enter('pump');
        } else if (advice.phase === 'pump' && phaseSteps >= R.stroke) enter('counter');
        if (advice.phase === 'counter') set(-side, R.counter); else set(side, R.deep);
        break;
      case 'frontal':
        // Hands up for it to open; a wing that wants it gets one stroke of both hands if it stays shut.
        if (advice.phase === 'up' && !pumped && phaseSteps >= R.frontalWait && g.tuck > R.frontalShut &&
          (wingTable(g.physical.wing).feel?.recovery?.frontalPump ?? 0) > 0) {
          pumped = true; enter('pump');
        } else if (advice.phase === 'pump' && (phaseSteps >= R.frontalStroke || g.tuck <= R.frontalShut)) enter('up');
        if (advice.phase === 'pump') left = right = R.both;
        break;
      case 'stall':
        // Hold it deep until the swing settles, then let go at once; once it is coming back, hands stay up.
        if (g.wingPhase === 'reattaching') { if (advice.phase !== 'up') enter('up'); }
        else if (advice.phase === 'hold' && (Math.abs(g.pitch) < R.settledPitch && Math.abs(g.pitchRate) < R.settledRate ||
          phaseSteps >= R.settleMost)) enter('release');
        if (advice.phase === 'hold') left = right = R.full;
        break;
      case 'spin':
        // Hands up at once: the half flies again as soon as its hand lets it.
        break;
      case 'deep':
        // Hands up and the speed bar: the flow is flown back onto it.
        advice.left = advice.right = 0; advice.bar = true;
        return;
      case 'cravat':
        // Stop the turn on the open half, then pull the caught side long and deep; twice, and if the tip is
        // still caught, stall the whole wing to shake it free and let go at once.
        if (advice.phase === 'counter' && phaseSteps >= R.between && (countered || side * g.yawRate < R.turning || phaseSteps >= R.counterMost)) {
          countered = true; pulls += 1; enter(pulls > R.pulls ? 'hold' : 'pull');
        } else if (advice.phase === 'pull' && phaseSteps >= R.pull) enter('counter');
        if (advice.phase === 'counter') set(-side, R.counter);
        else if (advice.phase === 'pull') set(side, R.deep);
        else left = right = R.full;
        break;
      case 'twist':
        // Hands up but for the side that unwinds the lines: its light pull turns the pilot back round.
        set(side, R.counter);
        break;
      default:
        // Out of it, or between two: catch the dive with both hands while the wing is well ahead and
        // going, then roll it level on the high side.
        if (g.pitch < R.catchPitch && g.pitchRate < -R.catchRate) { if (advice.phase !== 'catch') enter('catch'); left = right = R.both; }
        else if (Math.abs(g.bank) > (advice.phase === 'level' ? R.levelBank / 2 : R.levelBank)) {
          if (advice.phase !== 'level') enter('level');
          set(g.bank > 0 ? -1 : 1, R.counter);
        } else if (advice.phase !== 'up') enter('up');
    }
    advice.left = left; advice.right = right; advice.bar = false;
  }

  /**
   * One fixed step (a sixtieth of a second) of `g`, after it has flown, and what a trick watch saw of it
   * (`tricks`) where one is flown: what the wing is in, and the hands for the next step.
   */
  function step(g: FlightState, tricks?: Readonly<TrickSight> | null) {
    const event = classify(g, inEpisode, tricks);
    if (event) {
      calm = 0;
      const side = sideOf(g, event);
      if (!inEpisode || event !== advice.event || side !== advice.side) meet(g, event, side);
    } else if (inEpisode) {
      if (advice.event) { advice.event = ''; advice.side = 0; enter('up'); }
      const steady = (g.wingPhase === 'flying' || g.wingPhase === 'exit-surge') && Math.abs(g.pitch) < R.calmPitch &&
        Math.abs(g.bank) < R.levelBank && Math.abs(g.yawRate) < R.calmYaw;
      if (steady && calm === 0) calmY = g.pos.y;
      calm = steady ? calm + 1 : 0;
      // Saved as of when it came steady: the seconds and metres it cost do not count the calm that confirms it.
      if (calm >= R.calm) {
        inEpisode = false; advice.saves += 1;
        Object.assign(advice.saved, { event: advice.first, side: firstSide, seconds: (advice.since - calm + 1) / HZ, lost: startY - calmY });
        advice.since = 0; advice.phase = '';
      }
    }
    if (inEpisode) advice.since += 1;
    phaseSteps += 1;
    if (inEpisode) hands(g); else { advice.left = advice.right = 0; advice.bar = false; }
    return advice;
  }

  return { advice, step, reset, get trouble() { return inEpisode; } };
}
