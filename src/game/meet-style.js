// Style: the points a Good Lift run earns for its tricks, beside the lifting and never part of it.
// Its kilograms, the board and the medals are the meet's alone; style is the pilot's own flourish,
// shown in the readouts and on the sheet. It is scored from the swing watch (swing-watch.js), which
// only reads the wing, and it writes nothing back to the world, so a run flies and lifts the same
// with it or without it, and a replay scores the same style as the run it replays.
//
// A trick is a set of elements: the forward peaks of a swing being pitched bigger, or the tops of
// linked wingovers. A swing counts as pitched once `pitched` forward peaks in a row have held or
// grown (the watch's `building`), and wingovers once `linked` tops have come on alternate sides
// (its `chain`); the peaks that made it one then count too. Ordinary flying hardly ever does either:
// a brake let go, a dodge or a fall of the air swings the wing once, and then it dies away. Each
// element scores by the band it reaches (BANDS), more the more are linked in a row (`chain`, in
// halves: link n scores x1, x1, x1.5, x2, x2.5, then x3 for every one after). Pitching and wingovers
// link into one set. The set lands, and its points count, once the wing has flown level and calm
// for `settle` seconds with at least `least` elements in it: for a pitched swing the catch is the
// landing. A lone element is no set in hand yet (a dodge turned back can make one): a set is from
// `inHand` elements. A tuck, a tip, a stall or a strike loses the set in hand, and nothing counts
// again until the wing has flown level and calm; the ears drop it unscored; a run that ends mid-set
// lands none of it. And style only counts where a trick can go wrong: where the wing can fold (above the
// ravens' grace height), never below it.
import { BANDS, bandOf } from './swing-watch.js';

export const STYLE = Object.freeze({
  // Points for each element by the band it reached, 1 to 4.
  points: Object.freeze([10, 20, 30, 50]),
  // Halves of the multiplier for the n-th element linked in a row, the last for every one after.
  chain: Object.freeze([2, 2, 3, 4, 5, 6]),
  // Elements a set needs to land, and to be a set in hand at all: shown, and lost if broken off.
  least: 3,
  inHand: 2,
  // Seconds level and calm that land a set.
  settle: 1,
  // Forward peaks in a row that make a swing a pitched one, and tops on alternate sides that make
  // wingovers.
  pitched: 3,
  linked: 2,
});

const DEG = Math.PI / 180;

/**
 * The style of one run, made once and reset for every run. `state` is plain numbers:
 *
 *   total                 points landed this run
 *   pending, elements     points and elements in the set in hand
 *   links                 elements linked in a row, for the multiplier
 *   rolls, deepest        wingovers in the set in hand, and its deepest pitch (rad)
 *   last                  1 for a pitch element, 2 for a wingover: the latest element's kind
 *   landed, lost          sets landed and lost so far
 *   said                  points of the last set landed, or lost
 *   wingovers             the most wingovers in a set landed
 *   pitch                 the deepest forward peak of a pitched swing in a set landed, whole degrees
 *   unscored              elements flown where style does not count (below the grace height)
 *   armed                 whether elements count: not after a break until the wing is calm again
 */
export function createStyle() {
  const state = {
    total: 0, pending: 0, elements: 0, links: 0, rolls: 0, deepest: 0, last: 0, landed: 0, lost: 0, said: 0, wingovers: 0, pitch: 0, unscored: 0,
    armed: true,
  };
  // The watch's counts last step, the forward peaks of the swing being built before the last (to
  // count them once it is a pitched one), and the top before the last, to tell what is new.
  const seen = { fronts: 0, tops: 0, breaks: 0, front: 0, before: 0, top: 0 };

  function clear() {
    state.pending = state.elements = state.links = state.rolls = state.deepest = state.last = 0;
  }

  function reset() {
    clear();
    state.total = state.landed = state.lost = state.said = state.wingovers = state.pitch = state.unscored = 0;
    state.armed = true;
    seen.fronts = seen.tops = seen.breaks = seen.front = seen.before = seen.top = 0;
  }

  // An element reaching `band` (0 for none): it scores, linked to the ones before it, or, short of
  // the first band, starts the links over.
  function element(band, kind, size, counts) {
    if (!state.armed) return;
    if (!counts) {
      state.unscored += 1;
      return;
    }
    if (band === 0) {
      state.links = 0;
      return;
    }
    state.links += 1;
    state.elements += 1;
    state.pending += (STYLE.points[band - 1] * STYLE.chain[Math.min(state.links, STYLE.chain.length) - 1]) / 2;
    state.last = kind;
    if (kind === 2) state.rolls += 1;
    else state.deepest = Math.max(state.deepest, size);
  }

  /** One step of `dt` seconds of the run in `world` (run-step.js), after its watch has stepped. */
  function step(dt, world) {
    const watch = world.watch.state;
    const counts = !!world.controls.folds;
    // Something broke the trick off: the set in hand is lost, or, for the ears, dropped unscored,
    // and nothing counts again until the wing is level and calm. A lone element is only dropped.
    if (watch.breaks > seen.breaks) {
      seen.breaks = watch.breaks;
      if (state.elements >= STYLE.inHand && watch.broke !== 5) {
        state.lost += 1;
        state.said = state.pending;
      }
      clear();
      state.armed = false;
    }
    if (!state.armed && watch.calm >= STYLE.settle) state.armed = true;
    // A forward peak of a swing being pitched bigger. The peaks that made it a pitched one count
    // too, as the one that does comes.
    if (watch.fronts > seen.fronts) {
      seen.fronts = watch.fronts;
      if (watch.building === STYLE.pitched) {
        element(bandOf(BANDS.pitch, seen.before), 1, seen.before, counts);
        element(bandOf(BANDS.pitch, seen.front), 1, seen.front, counts);
      }
      if (watch.building >= STYLE.pitched) element(bandOf(BANDS.pitch, watch.front), 1, watch.front, counts);
      seen.before = seen.front;
      seen.front = watch.front;
    }
    // The top of a wingover linked to the one before. The top that began the chain counts too, as
    // the one that links it comes.
    if (watch.tops > seen.tops) {
      seen.tops = watch.tops;
      if (watch.chain === STYLE.linked) element(bandOf(BANDS.roll, seen.top), 2, seen.top, counts);
      if (watch.chain >= STYLE.linked) element(bandOf(BANDS.roll, watch.top), 2, watch.top, counts);
      seen.top = watch.top;
    }
    // Level and calm: the set lands, if it has enough in it.
    if (state.elements > 0 && watch.calm >= STYLE.settle) {
      if (state.elements >= STYLE.least) {
        state.total += state.pending;
        state.landed += 1;
        state.said = state.pending;
        state.wingovers = Math.max(state.wingovers, state.rolls);
        state.pitch = Math.max(state.pitch, Math.round(state.deepest / DEG));
      }
      clear();
    }
  }

  /** The run is over: a set still in hand lands none of it. */
  function finish() {
    clear();
  }

  return { reset, step, finish, get state() { return state; } };
}
