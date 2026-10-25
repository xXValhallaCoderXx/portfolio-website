import type { createSwingWatch } from '../../../domains/coaching/swing-watch.ts';
/** Mutable display cache owned by one flight session, never by the solver. */
export function createFlightEffects() {
  return {
    fold: 0, veil: 0, veilShown: 0, shake: 0, gaze: 0, want: { fold: 0, veil: 0, shake: 0, gaze: 0 }, floor: -Infinity, stop: 0,
    foldLeft: 0, foldRight: 0, luff: 0, stall: { left: 0, right: 0, luff: 0, shake: 0, tuck: 0, cravatLeft: 0, cravatRight: 0, twist: 0 }, stalled: false,
    tuck: 0, heave: 0,
    // Each tip caught in its lines as drawn, and the pilot turned under twisted lines (radians).
    cravatLeft: 0, cravatRight: 0, twist: 0,
    // The wing's own failures already heard (flight-session.js hearWing): a half folded (its side),
    // a tip caught, the lines twisted.
    wingHeard: { fold: 0, cravat: false, twist: false },
    // The jolt of a fold (radians of shake), dying away; and how near each half is to stalling by itself.
    jolt: 0, soft: { left: 0, right: 0 },
    meter: { fill: 0, red: 0, state: '' }, meterShown: { fill: -1, red: -1, state: null as string | null },
    // The swing gauge (swing-gauge.js) and what of it was last written to the page; the catches and
    // the swings through the bottom already heard.
    gauge: { on: false, left: 0, mode: 'pitch', cue: 0, coming: 0, soon: 1, x: 0, y: 0, band: 0, near: false, round: 0, loopable: false, safe: true },
    // The prompt by the wing as last written, and the hands on time: until when it says so, and how.
    cueShown: { coming: -1, live: null, ring: -1, x: NaN, y: NaN, good: null, loopable: false },
    good: { until: -Infinity, word: '' },
    // When on this flight over the fjord a trick was first flown (-1 for not yet).
    gaugeShown: { on: null, x: null, y: null, mode: null, cue: null, told: null, band: null, near: null, safe: null, round: null },
    heard: { catches: 0, pitch: 0, roll: 0, timed: 0, pumps: 0, folded: false, frontal: false, pumped: 0, loops: undefined as number | undefined, watch: undefined as ReturnType<typeof createSwingWatch>['state'] | undefined },
    // Round a loop: the bank the wing went into it with, which the pilot's pose keeps while it goes
    // round (the rig itself rolls with the loop), and whether one was going round last frame.
    loopBank: 0,
    looping: false,
    // The picture's tilt as last eased.
    tilt: 0,
  };
}
export type FlightEffects = ReturnType<typeof createFlightEffects>;
