// Good Lift's tricks: what each move is called and worth, how the trick watch (trick-watch.js)
// knows one from the flight, which moves link into which by name, and how a combo is scored
// (meet-combo.js). Numbers only, frozen, so a run is judged the same everywhere and a fingerprint
// can pin them. Angles are kept as the cosines the watch compares (cos of a tilt from the vertical,
// as literals: cos 50° is 0.642788), times as whole fixed steps (60 a second), so nothing here
// needs a sine to be read. Coefficients are ×100, after the FAI aerobatics code where it has one.

/** Move ids. 0 is none; the order is the trick book's. */
export const MOVE = Object.freeze({
  none: 0, pitch: 1, wingover: 2, spiral: 3, asym: 4, sat: 5, heli: 6, loop: 7, stall: 8, tailslide: 9,
});
export type MoveId = typeof MOVE[keyof typeof MOVE];
export const MOVE_COUNT = 10;
export const MOVE_NAMES = Object.freeze(['', 'PITCH CATCH', 'WINGOVERS', 'SPIRAL DIVE', 'ASYM SPIRAL', 'SAT', 'HELICOPTER', 'LOOP',
  'FULL STALL', 'TAIL SLIDE']);

/** Why a combo ended without banking: a bail loses it, a drop clears it unscored. */
export const BREAK = Object.freeze({ none: 0, tuck: 1, stall: 3, strike: 4, ears: 5, assisted: 6, spin: 7, fold: 8, twist: 9 });
export const isBail = (reason: number) => reason === BREAK.tuck || reason === BREAK.stall || reason === BREAK.strike || reason === BREAK.spin ||
  reason === BREAK.fold || reason === BREAK.twist;

/**
 * Each move's coefficient (c, ×100) and the four grade bands its best moment can reach. A band's
 * measure depends on the move: the lower top of a wingover pair (deg), a spiral's best second of load
 * (g ×100), a loop's peak load (g ×100), a stall's caught surge (deg, smaller is better), a SAT's
 * mean rotation (rad/s ×100) and a helicopter's flatness (the mean cosine of its tilt ×1000: 35°,
 * 26°, 18° and 10°).
 */
export const TRICKS = Object.freeze([
  Object.freeze({ c: 0, bands: Object.freeze([0, 0, 0, 0]) }),
  Object.freeze({ c: 75, bands: Object.freeze([20, 30, 40, 50]) }),
  Object.freeze({ c: 135, bands: Object.freeze([50, 60, 70, 80]) }),
  Object.freeze({ c: 100, bands: Object.freeze([200, 250, 300, 350]) }),
  Object.freeze({ c: 135, bands: Object.freeze([200, 250, 300, 350]) }),
  Object.freeze({ c: 125, bands: Object.freeze([200, 260, 320, 380]) }),
  Object.freeze({ c: 170, bands: Object.freeze([819, 899, 951, 985]) }),
  Object.freeze({ c: 150, bands: Object.freeze([300, 400, 500, 600]) }),
  Object.freeze({ c: 85, bands: Object.freeze([75, 60, 45, 30]) }),
  Object.freeze({ c: 100, bands: Object.freeze([75, 60, 45, 30]) }),
]);

/**
 * How the watch reads the flight (trick-watch.js). Tilts are the canopy's up axis from the vertical;
 * `up*` are their cosines. Loads are g; times are fixed steps.
 *
 *   top         a wingover top counts from this tilt (or `firstTop` for the first of a set) up to
 *               `maxTop` (135°: a wing swung further is going over the top), its pair within
 *               `gap` steps, and on the other side; `topBands` grade the shallower top
 *               of a pair at 50°, 60°, 70° and 80°
 *   spiral      a spiral holds at least `tilt`, `load` g and the pilot under the canopy, and is
 *               confirmed after `confirm` rad of air course; every 2π after is a unit
 *   asym        a spiral confirmed within `asymAfter` steps of a top on its side of `asymTop` or more
 *   stall       both hands at `hands` or deeper within `even` of each other, stalled for `hold`
 *               steps, caught by both hands at `release` or less and flying again within `exit`
 *   tailslide   backflying for `backfly` steps of a full stall
 *   neutral     tilt under `neutralTilt`, the swing fore and aft within `neutralPitch` (rad) and load
 *               within `neutralLoad`: the energy has settled; `neutral` steps of it end a flow
 *   settled     tilt under `settleTilt`, load within `settleLoad` (filtered over `filter` steps), the
 *               swing fore and aft within `settlePitch` (rad) and roll and pitch rates under
 *               `settleRate`: `settle` steps bank (a steady thermal turn is settled)
 *   rotations   one half separated (and the other not) with the canopy turning on itself:
 *   sat         one flown out of a spiral (or a SAT or a helicopter) that ended within `satAfter`
 *               steps, turning at `satRate` rad/s or more with the pilot swung out (the line at
 *               least as far from hanging as cos `satLine`) and pilot and wing going opposite ways
 *               round an axis between them, for `satHold` steps; unsettled after `satSettle` it is a spin
 *   heli        one eased out of a deliberate full stall: turning at `heliRate` or more, flat
 *               (`heliTilt`), its inner tip flying backwards and its outer forwards, for `heliHold` steps
 *   spin        any other turning at `spinRate` or more for `spinHold` steps: a bail; saved once
 *               both halves fly and the wing has flown calmly for `saved` steps
 *   clock       the load is averaged over `loadWindow` steps; a spiral's conditions may lapse
 *               `spiralGrace` steps (a gust, a twitch) before it is over, and a rotation's, which
 *               wobble more as they settle, `rotationGrace`; a move that links by no name flows from
 *               a wingover's energy within `flowWindow` steps of the wing last swinging steep (45° or
 *               more); the hands read as one side pulling once more than `handSide` apart; the swing
 *               watch's move `swingPitch` is a pitch; and a full stall eased straight into a
 *               helicopter, which has no surge to grade, is graded `heliCatch`, as a middling catch
 */
export const DETECT = Object.freeze({
  top: 0.642788, firstTop: 0.707107, maxTop: -0.707107, gap: 390,
  topBands: Object.freeze([0.642788, 0.5, 0.34202, 0.173648]),
  spiralTilt: 0.5, spiralLoad: 1.5, confirm: Math.PI, unit: 2 * Math.PI,
  asymTop: 0.173648, asymAfter: 90, asymTilt: 0.258819,
  hands: 0.85, even: 0.15, hold: 120, release: 0.2, exit: 600, backfly: 300,
  neutralTilt: 0.906308, neutralPitch: 0.20944, neutralLoad: Object.freeze([0.8, 1.3]), neutral: 15,
  settleTilt: 0.766044, settlePitch: 0.20944, settleLoad: Object.freeze([0.8, 1.4]), settleRate: 0.3, filter: 60, settle: 180,
  rearm: 60, spinRate: 1.2, spinHold: 48, saved: 30,
  satAfter: 90, satRate: 2, satLine: 0.906308, satHold: 30, satSettle: 240,
  heliRate: 1.5, heliTilt: 0.819152, heliHold: 60,
  loadWindow: 60, spiralGrace: 15, rotationGrace: 45, flowWindow: 120, handSide: 0.15, swingPitch: 1, heliCatch: 60,
});

/**
 * Named links: a move into another (`from` → `to`) within `window` steps of the last one ending, at
 * coefficient `c` (×100) when that beats the move's own (the FAI's combination coefficients).
 */
export const LINKS = Object.freeze([
  Object.freeze({ id: 1, name: 'WING-SPIRAL', from: Object.freeze([MOVE.wingover]), to: Object.freeze([MOVE.spiral, MOVE.asym]), window: 120, c: 0 }),
  Object.freeze({ id: 2, name: 'SPIRAL EXIT', from: Object.freeze([MOVE.spiral, MOVE.asym]), to: Object.freeze([MOVE.wingover]), window: 120, c: 0 }),
  Object.freeze({ id: 3, name: 'SAT ENTRY', from: Object.freeze([MOVE.spiral, MOVE.asym]), to: Object.freeze([MOVE.sat]), window: 90, c: 0 }),
  Object.freeze({ id: 4, name: 'SAT EXIT', from: Object.freeze([MOVE.sat]), to: Object.freeze([MOVE.spiral, MOVE.asym]), window: 300, c: 0 }),
  Object.freeze({ id: 5, name: 'RHYTHMIC', from: Object.freeze([MOVE.sat]), to: Object.freeze([MOVE.sat]), window: 60, c: 195 }),
  Object.freeze({ id: 6, name: 'SAT-HELI', from: Object.freeze([MOVE.sat]), to: Object.freeze([MOVE.heli]), window: 180, c: 185 }),
  Object.freeze({ id: 7, name: 'HELI-SAT', from: Object.freeze([MOVE.heli]), to: Object.freeze([MOVE.sat]), window: 180, c: 185 }),
  Object.freeze({ id: 8, name: 'HELI SWITCH', from: Object.freeze([MOVE.heli]), to: Object.freeze([MOVE.heli]), window: 120, c: 180 }),
  Object.freeze({ id: 9, name: 'STALL-HELI', from: Object.freeze([MOVE.stall, MOVE.tailslide]), to: Object.freeze([MOVE.heli]), window: 120, c: 0 }),
  Object.freeze({ id: 10, name: 'OVER THE TOP', from: Object.freeze([MOVE.wingover]), to: Object.freeze([MOVE.loop]), window: 60, c: 0 }),
  Object.freeze({ id: 11, name: 'LOOP EXIT', from: Object.freeze([MOVE.loop]), to: Object.freeze([MOVE.wingover]), window: 120, c: 0 }),
  Object.freeze({ id: 12, name: 'PITCH-ROLL', from: Object.freeze([MOVE.pitch]), to: Object.freeze([MOVE.wingover]), window: 150, c: 0 }),
]);
export const LINK_COUNT = LINKS.length + 1;

/**
 * Scoring, integers only. A move's value is 5·round(base·c·grade·units·repeat / divisor), a
 * multiple of 5; a combo pays round5(Σ value × multiplier), the multiplier in halves:
 *
 *   grade        ×100 for bands 1 to 4 reached
 *   units        ×100 for 1, 2, 3, … 6 or more units of one move
 *   repeat       ×100 for the 1st, 2nd, 3rd, 4th or later time a move is flown to the same side in a combo
 *   again        ×100 for the 1st … 5th or later time the very same combo is banked in a run
 *   multiplier   starts at `start` halves, one more for each new move, each named link's first use
 *                and each flow; at most `perMove` halves per different move, and `most` in all
 */
export const COMBO = Object.freeze({
  base: 10, divisor: 1e8,
  grade: Object.freeze([60, 80, 100, 120]),
  units: Object.freeze([100, 150, 180, 200, 210, 220]),
  repeat: Object.freeze([100, 87, 76, 0]),
  again: Object.freeze([100, 75, 50, 25, 0]),
  start: 2, perMove: 2, most: 10,
});
