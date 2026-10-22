import type { FlightInput } from '../flight/models.ts';
export interface StyleWorld {
  watch: { state: { moves: number; breaks: number; broke: number; calm: number; clock: number; moveBand: number; moveKind: number; moveSize: number } };
  controls?: FlightInput;
}

// Style: the points a Good Lift run earns for its tricks, beside the lifting and never part of it.
// Its kilograms, the board and the medals are the meet's alone; style is the pilot's own flourish,
// shown in the readouts and on the sheet. It is scored from the swing watch (swing-watch.js), which
// only reads the wing, and it writes nothing back to the world, so a run flies and lifts the same
// with it or without it, and a replay scores the same style as the run it replays.
//
// Only completed physical maneuvers from swing-watch enter a pending set. One wingover cycle,
// shaped pitch-and-catch or inversion can bank on its own after stable recovery. Linking increases
// the multiplier without recounting runup peaks. A failure loses pending points; banked points
// survive. Ears, assistance and an unfinished end cannot bank a move.

export const STYLE = Object.freeze({
  // Points for each element by the band it reached, 1 to 4, and for each loop round.
  points: Object.freeze([10, 20, 30, 50]),
  loop: 60,
  spiral: 20,
  variety: 10,
  // Halves of the multiplier for the n-th element linked in a row, the last for every one after.
  chain: Object.freeze([2, 2, 3, 4, 5, 6]),
  // Elements a set needs to land, and to be a set in hand at all: shown, and lost if broken off.
  least: 1,
  inHand: 1,
  // Seconds level and calm that land a set.
  settle: 3,
  rearm: 1,
  // Forward peaks in a row that make a swing a pitched one, and tops on alternate sides that make
  // wingovers.
  pitched: 3,
  linked: 2,
});

const DEG = Math.PI / 180;

/** A bounded receipt: the count covers the whole combo, the sequence its latest three moves. */
export interface StyleCombo {
  points: number; base: number; variety: number; moves: number; mask: number; sequence: number[];
}
const emptyCombo = (): StyleCombo => ({ points: 0, base: 0, variety: 0, moves: 0, mask: 0, sequence: [] });

/**
 * The style of one run, made once and reset for every run. `state` is plain numbers:
 *
 *   total                 points landed this run
 *   pending, elements     points and elements in the set in hand
 *   links                 elements linked in a row, for the multiplier
 *   rolls, loops          wingovers and loops in the set in hand, and its deepest pitch (rad)
 *   deepest
 *   last                  1 for a pitch element, 2 for a wingover, 3 for a loop: the latest's kind
 *   landed, lost          sets landed and lost so far
 *   said                  points of the last set landed, or lost
 *   wingovers, mostLoops  the most wingovers, and loops, in a set landed
 *   pitch                 the deepest forward peak of a pitched swing in a set landed, whole degrees
 *   armed                 whether elements count: not after a break until the wing is calm again
 */
export function createStyle() {
  const state = {
    total: 0, pending: 0, elements: 0, links: 0, rolls: 0, loops: 0, deepest: 0, last: 0, landed: 0, lost: 0, said: 0, wingovers: 0,
    mostLoops: 0, pitch: 0, armed: true, bankedAt: -Infinity, lostAt: -Infinity,
    spirals: 0, mostSpirals: 0, base: 0, variety: 0, kindMask: 0, sequence: [] as number[], bankCalm: 0,
    lastCombo: emptyCombo(), bestCombo: emptyCombo(),
  };
  // The watch's counts last step, the forward peaks of the swing being built before the last (to
  // count them once it is a pitched one), and the top before the last, to tell what is new.
  const seen = { moves: 0, breaks: 0 };
  let lastMoveAt = -Infinity;

  function clear() {
    state.pending = state.elements = state.links = state.rolls = state.loops = state.deepest = state.last = 0;
    state.spirals = state.base = state.variety = state.kindMask = state.bankCalm = 0;
    state.sequence = [];
    lastMoveAt = -Infinity;
  }

  function reset() {
    clear();
    state.total = state.landed = state.lost = state.said = state.wingovers = state.mostLoops = state.pitch = 0;
    state.armed = true;
    state.bankedAt = state.lostAt = -Infinity;
    state.mostSpirals = 0;
    state.lastCombo = emptyCombo();
    state.bestCombo = emptyCombo();
    seen.moves = seen.breaks = 0;
  }

  // An element reaching `band` (0 for none): it scores, linked to the ones before it, or, short of
  // the first band, starts the links over. A loop scores its own points, whatever it reached.
  function element(band: number, kind: number, size: number, now: number) {
    if (!state.armed) return;
    if (kind < 1 || kind > 4 || !Number.isInteger(kind)) return;
    if (band === 0 && kind !== 3 && kind !== 4) {
      state.links = 0;
      return;
    }
    state.links += 1;
    state.elements += 1;
    const points = kind === 3 ? STYLE.loop : kind === 4 ? STYLE.spiral : STYLE.points[band - 1];
    state.base += (points * STYLE.chain[Math.min(state.links, STYLE.chain.length) - 1]) / 2;
    const kindBit = 1 << (kind - 1);
    if (state.kindMask !== 0 && !(state.kindMask & kindBit)) state.variety += STYLE.variety;
    state.kindMask |= kindBit;
    state.pending = state.base + state.variety;
    state.sequence = [...state.sequence.slice(-2), kind];
    state.bankCalm = 0;
    lastMoveAt = now;
    state.last = kind;
    if (kind === 2) state.rolls += 1;
    else if (kind === 3) state.loops += 1;
    else if (kind === 4) state.spirals += 1;
    else state.deepest = Math.max(state.deepest, size);
  }

  /** One step of `dt` seconds of the run in `world` (run-step.js), after its watch has stepped. */
  function step(dt: number, world: StyleWorld) {
    const watch = world.watch.state;
    if (world.controls?.steered) {
      clear();
      state.armed = false;
      seen.moves = watch.moves;
      seen.breaks = watch.breaks;
      return;
    }
    // Something broke the trick off: the set in hand is lost, or, for the ears, dropped unscored,
    // and nothing counts again until the wing is level and calm. A lone element is only dropped.
    if (watch.breaks > seen.breaks) {
      seen.breaks = watch.breaks;
      if (state.elements >= STYLE.inHand && watch.broke !== 5 && watch.broke !== 6) {
        state.lost += 1;
        state.lostAt = watch.clock;
        state.said = state.pending;
      }
      clear();
      state.armed = false;
    }
    if (!state.armed && watch.calm >= STYLE.rearm - 1e-9) state.armed = true;
    // The observer emits complete physical maneuvers. A standalone move is worth recovering;
    // peaks and correctly timed inputs alone never score, and the first top is never added twice.
    if (watch.moves > seen.moves) {
      if (!world.controls?.steered) element(watch.moveBand, watch.moveKind, watch.moveSize, watch.clock);
      seen.moves = watch.moves;
    }
    // Level and calm: the set lands, if it has enough in it.
    state.bankCalm = state.elements > 0 ? Math.min(STYLE.settle, watch.calm, Math.max(0, watch.clock - lastMoveAt)) : 0;
    if (state.elements > 0 && state.bankCalm >= STYLE.settle - 1e-9) {
      if (state.elements >= STYLE.least) {
        state.total += state.pending;
        state.landed += 1;
        state.bankedAt = watch.clock;
        state.said = state.pending;
        state.wingovers = Math.max(state.wingovers, state.rolls);
        state.mostLoops = Math.max(state.mostLoops, state.loops);
        state.mostSpirals = Math.max(state.mostSpirals, state.spirals);
        state.pitch = Math.max(state.pitch, Math.round(state.deepest / DEG));
        state.lastCombo = { points: state.pending, base: state.base, variety: state.variety, moves: state.elements,
          mask: state.kindMask, sequence: [...state.sequence] };
        if (state.pending > state.bestCombo.points || state.pending === state.bestCombo.points && state.elements > state.bestCombo.moves)
          state.bestCombo = { ...state.lastCombo, sequence: [...state.lastCombo.sequence] };
      }
      clear();
    }
  }

  /** The run is over: a set still in hand lands none of it. */
  function finish(_reason?: string) {
    clear();
  }

  return { reset, step, finish, get state() { return state; } };
}
