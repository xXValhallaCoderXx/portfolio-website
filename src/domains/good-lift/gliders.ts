// Good Lift's gliders: five wings, from the forgiving EN-A everyone starts on to the acro wing, each
// the classic wing (flight-physics.js's PHYSICS) with its canopy and its air changed (wings.js), so
// each flies by the very same solver. They differ where real classes do: not much at trim, but in
// how far the bar takes them, how much the brakes help them climb, how they roll, how long they swing
// fore and aft, how early they stall and how much energy they keep for tricks. Registered as this
// module loads, so a run, its replay, the bots, Training and the board's function can fly any of
// them; the page and the fjord never load it and fly the classic wing.
import { PHYSICS, registerWing } from '../flight/flight-physics.ts';
import { defineWing } from '../flight/wings.ts';
import { FLIGHT } from '../flight/flight.ts';
import type { CoachWing } from '../coaching/coach-wing.ts';
import { TRAINING_LESSONS, TRAINING_LESSON_INFO, type TrainingLessonId } from '../coaching/training-catalog.ts';
import { GLIDERS, GLIDER_NAMES, isGlider, type GliderId } from './glider-ids.ts';

// Their names, kept where a log, a board row or the page can read them without loading the gliders.
export { GLIDERS, GLIDER_NAMES, isGlider, type GliderId };

// How each half's flow goes (flight-physics.js's SideFlow). A latch at physical travel 0.54 is a hand
// at 0.9 (Shift's full pull), and a release under 0.516 one let back to 0.86 (Q/E's 0.82): a Q/E pull
// never stalls a half, and letting go of Shift lets it fly again. The A and the B never stall a half
// (local 0) but stall as a plate; the C and the D only when slow (under 10.1 m/s, some way under their trim); the acro wing at any
// speed, its halves quickest to go and its damping the first to give way.
const SHARED_FLOW = { latch: 0.54, release: 0.516, stallAngle: 0.45, brakeStart: 0.4, attachAngle: 0.25, attachSpeed: 3,
  plateNormal: 1.2, plateShape: 2, plateDrag: 0.1, plateStart: 0.2, platePressure: 0.1, plateCup: 3 };
const DOCILE = Object.freeze({ ...SHARED_FLOW, local: 0, maxSpeed: 0, brakeIncidence: 1.2, separateTime: 0.16, attachTime: 0.25,
  hysteresis: 0.05, plateBrake: 0.6, yawRelease: 0.5, pitchRelease: 0, rollDamp: 0, reliefRelease: 0.5 });
const SPORT = { ...SHARED_FLOW, local: 1, maxSpeed: 10.1, brakeIncidence: 1.45, separateTime: 0.12, attachTime: 0.3,
  hysteresis: 0.08, plateBrake: 0.9, yawRelease: 0.8, pitchRelease: 0.5, rollDamp: 5, reliefRelease: 1 };
// The D's stalled half fills again more slowly: its spin's exit is softer for it.
const SPORT_C = Object.freeze(SPORT), SPORT_D = Object.freeze({ ...SPORT, attachTime: 1 });
const ACRO = Object.freeze({ ...SHARED_FLOW, local: 1, maxSpeed: 0, brakeIncidence: 1.6, separateTime: 0.35, attachTime: 0.35,
  hysteresis: 0.1, plateBrake: 1.2, yawRelease: 1, pitchRelease: 1, rollDamp: 5, reliefRelease: 1 });

// How each glider's halves fold and fill again, and what goes wrong when one is flown badly
// (flight-physics.js's Recovery), as the classes are certified: the A refills a collapse by itself
// before it has turned a quarter, the B before half; the C wants pumping, and the D and the acro wing
// keep turning until they get it, catch a tip in the lines when the turn is not stopped first, and do
// not fly out of a deep stall on their own. Every glider but the A can be stalled deep; only the acro
// wing twists its lines. Hands are physical travel: a pump counts from 0.25 of a hand to all of it past
// 0.55, a cravat's pull from 0.75, a front collapse opened at 0.45 or deeper stalls deep, none of them
// on a device's mark.
const SHARED_RECOVERY = { foldArm: 0.4, refillSpeed: 8, pumpFrom: 0.15, pumpFull: 0.33, pumpSlack: 0.06, cravatDepth: 0.45, deepHand: 0.27 };
const NO_LOAD = { loadLatch: 0, loadStall: 0, loadSpeed: 0 }, NO_TUCK = { tuck: 0, tuckAngle: 0, tuckMax: 0 };
const NO_CRAVAT = { cravatFold: 0, cravatRate: 0, cravatFloor: 0, cravatDrag: 0, cravatPull: 0, cravatStall: 0 };
const NO_DEEP = { deep: 0, deepHands: 0, deepBar: 0, creep: 0 };
const NO_TWIST = { twistInertia: 0, twistStiff: 0, twistDamp: 0, twistBind: 0, twistBand: 0, twistFriction: 0, twistLoss: 0, twistKick: 0 };
const RECOVERY_A = Object.freeze({ ...SHARED_RECOVERY, ...NO_LOAD, ...NO_TUCK, ...NO_CRAVAT, ...NO_DEEP, ...NO_TWIST,
  foldLift: 0.40, foldDrag: 0.04, refill: 0.8, pump: 2.4, frontalTime: 0.35, frontalHeld: 0.6, frontalPump: 0 });
const RECOVERY_B = Object.freeze({ ...SHARED_RECOVERY, ...NO_LOAD, ...NO_TUCK, ...NO_CRAVAT, ...NO_TWIST,
  foldLift: 0.45, foldDrag: 0.05, refill: 0.4, pump: 2.4, frontalTime: 0.45, frontalHeld: 0.7, frontalPump: 0,
  deep: 0.55, deepHands: 0.35, deepBar: 1.4, creep: 1.0 });
const RECOVERY_C = Object.freeze({ ...SHARED_RECOVERY, ...NO_TWIST,
  foldLift: 0.50, foldDrag: 0.06, refill: 0.04, pump: 2.0, loadLatch: 0.12, loadStall: 0.34, loadSpeed: 0.6, tuck: 3, tuckAngle: 0.06, tuckMax: 0.55,
  frontalTime: 0.7, frontalHeld: 0.8, frontalPump: 1.5,
  cravatFold: 0.6, cravatRate: 0.75, cravatFloor: 0.25, cravatDrag: 0.05, cravatPull: 0.9, cravatStall: 0.5,
  deep: 0.65, deepHands: 0.12, deepBar: 1.2, creep: 0.8 });
const RECOVERY_D = Object.freeze({ ...SHARED_RECOVERY, ...NO_TWIST,
  foldLift: 0.55, foldDrag: 0.07, refill: 0.03, pump: 1.6, loadLatch: 0.12, loadStall: 0.34, loadSpeed: 0.6, tuck: 4, tuckAngle: 0.05, tuckMax: 0.6,
  frontalTime: 1.0, frontalHeld: 0.9, frontalPump: 1.5,
  cravatFold: 0.5, cravatRate: 1.0, cravatFloor: 0.3, cravatDrag: 0.06, cravatPull: 1.2, cravatStall: 0.5,
  deep: 0.75, deepHands: 0, deepBar: 1.0, creep: 0.6 });
const RECOVERY_ACRO = Object.freeze({ ...SHARED_RECOVERY,
  foldLift: 0.55, foldDrag: 0.08, refill: 0.03, pump: 1.6, loadLatch: 0.12, loadStall: 0.34, loadSpeed: 0, tuck: 4, tuckAngle: 0.08, tuckMax: 0.65,
  frontalTime: 0.9, frontalHeld: 0.9, frontalPump: 1.5,
  cravatFold: 0.5, cravatRate: 1.1, cravatFloor: 0.3, cravatDrag: 0.07, cravatPull: 1.0, cravatStall: 0.4,
  deep: 0.75, deepHands: 0, deepBar: 0.9, creep: 0.6,
  twistInertia: 9, twistStiff: 45, twistDamp: 7, twistBind: 1.9, twistBand: 0.4, twistFriction: 12, twistLoss: 0.7, twistKick: 15 });

/**
 * Each glider's changes to the classic wing. The spread comes from splitting a similar best glide
 * differently between parasitic and induced drag: the A has more of the first, so its brakes help it
 * climb and its bar is short; the D more of the second, so it keeps its glide on the bar. The canopy's
 * pitch damping (feel) settles the A's swing in seconds and leaves the acro wing lively.
 */
export const GLIDER_TABLES = Object.freeze({
  'en-a': defineWing({
    area: 30, span: 10.95, chord: 2.74, canopyMass: 28.5, inertia: { x: 28, y: 105, z: 105 },
    dragZero: 0.033, induced: 0.089, angularDamping: { y: 170 },
    aero: { barIncidence: 0.055, brakeLift: 1.0, brakeDrag: 0.12, rollRelief: 0.65, earsLift: 0.30, earsDrag: 0.18 },
    directBrakes: { differentialDrag: 0.16, dihedral: 2.4, deepStart: 0.60, deepDifferentialLift: 0.60 },
    envelope: { stallAngle: 0.52, brakeIncidence: 1.0 },
  }, { pitchDamping: 5000, pitchFade: 0.866025, turnFade: 0.2, tip: 0.12, flow: DOCILE, recovery: RECOVERY_A }),
  'en-b': defineWing({
    dragZero: 0.028, induced: 0.093, angularDamping: { y: 170 },
    aero: { barIncidence: 0.062, brakeLift: 1.0, brakeDrag: 0.14, earsDrag: 0.21 },
    directBrakes: { differentialDrag: 0.14 },
  }, { pitchDamping: 3500, pitchFade: 0.866025, turnFade: 0.2, tip: 0.15, flow: DOCILE, recovery: RECOVERY_B }),
  'en-c': defineWing({
    area: 26, span: 10.94, chord: 2.38, canopyMass: 25, inertia: { x: 23, y: 86, z: 86 },
    dragZero: 0.021, induced: 0.10, angularDamping: { y: 170 },
    aero: { barIncidence: 0.073, brakeLift: 0.95, brakeDrag: 0.16 },
    directBrakes: { differentialDrag: 0.13, dihedral: 2.4, deepStart: 0.71, deepDifferentialLift: 0.60 },
    envelope: { stallAngle: 0.44, brakeIncidence: 1.8 },
  }, { pitchDamping: 3000, pitchFade: 0.866025, turnFade: 0.2, tip: 0.18, flow: SPORT_C, recovery: RECOVERY_C }),
  'en-d': defineWing({
    area: 24.5, span: 11.07, chord: 2.21, canopyMass: 23.5, inertia: { x: 21, y: 80, z: 80 },
    dragZero: 0.016, induced: 0.108,
    aero: { barIncidence: 0.08, brakeLift: 0.9, brakeDrag: 0.18, earsDrag: 0.27 },
    directBrakes: { differentialDrag: 0.11, dihedral: 2.2, deepStart: 0.74, deepDifferentialLift: 0.75 },
    envelope: { stallAngle: 0.42, brakeIncidence: 2.6 },
  }, { pitchDamping: 3000, pitchFade: 0.866025, turnFade: 0.2, tip: 0.22, flow: SPORT_D, recovery: RECOVERY_D }),
  'acro': defineWing({
    area: 21, span: 8.9, chord: 2.36, canopyMass: 20, inertia: { x: 18, y: 55, z: 55 },
    dragZero: 0.028, induced: 0.112, angularDamping: { y: 110 },
    aero: { barIncidence: 0.02, pressureTrim: 0.13, brakeLift: 0.8, brakeDrag: 0.2, earsDrag: 0.27 },
    directBrakes: { differentialDrag: 0.145, deepStart: 0.70, deepDifferentialLift: 0.80 },
    envelope: { stallAngle: 0.40, brakeIncidence: 3.0 },
  }, { pitchDamping: 2000, pitchFade: 0.866025, turnFade: 0.2, tip: 0.25, flow: ACRO, recovery: RECOVERY_ACRO }),
});

for (const id of GLIDERS) registerWing(id, GLIDER_TABLES[id]);

/**
 * How each wing flies in still air, for whatever plans with it rather than flies it: the bots' dashes,
 * the glide ring, the coach. Measured from the solver (gliders.test.js holds them to it), never what
 * the wing is made to do. m/s: trim, full bar and both brakes at working depth (0.6); sink at trim,
 * on the bar and the least any pair of equal brakes gives.
 */
export interface Nominal { speed: { trim: number; bar: number; light: number }; sink: { least: number; trim: number; bar: number } }
const nominal = (trim: number, bar: number, light: number, least: number, sink: number, barSink: number): Nominal =>
  Object.freeze({ speed: Object.freeze({ trim, bar, light }), sink: Object.freeze({ least, trim: sink, bar: barSink }) });
export const GLIDER_NOMINAL = Object.freeze({
  'en-a': nominal(11.0, 13.15, 8.3, 1.15, 1.35, 1.87),
  'en-b': nominal(11.47, 14.22, 8.58, 1.18, 1.34, 1.96),
  'en-c': nominal(11.86, 15.72, 8.86, 1.18, 1.27, 2.05),
  'en-d': nominal(12.22, 17.16, 9.14, 1.19, 1.24, 2.14),
  'acro': nominal(12.03, 12.75, 9.5, 1.48, 1.55, 1.66),
});
// The classic wing's, from FLIGHT where it says, and measured for its bar sink, which FLIGHT does not.
const CLASSIC = nominal(FLIGHT.speed.trim, FLIGHT.speed.bar, FLIGHT.speed.light, FLIGHT.sink.least, FLIGHT.sink.trim, 2.14);

/** The nominal flight of the wing registered as `id`: a glider's, or the classic wing's. */
export const nominalFor = (id: string): Nominal => isGlider(id) ? GLIDER_NOMINAL[id] : CLASSIC;

/**
 * How a reference pilot (pilots.js) plans with a wing: the speed it reckons a dash at (trim, m/s),
 * and the circles it aims for hands up and on the brake (m). The classic wing's are 25 and 21; a
 * glider's are those scaled by how wide its own circles are on the pilot's controls (gliders.test.js
 * measures them), so each bot circles a core as tightly as its wing allows.
 */
export interface PilotPlan { trim: number; circle: number; braked: number }
const plan = (trim: number, circle: number, braked: number): PilotPlan => Object.freeze({ trim, circle, braked });
const CLASSIC_PLAN = plan(FLIGHT.speed.trim, 25, 21);
export const GLIDER_PLAN = Object.freeze({
  'en-a': plan(11.0, 23.9, 16.5),
  'en-b': plan(11.47, 25, 17.95),
  'en-c': plan(11.86, 26.5, 18.8),
  'en-d': plan(12.22, 27.5, 19.9),
  'acro': plan(12.03, 25.5, 21),
});
/** How a pilot plans with the wing registered as `id`: a glider's, or the classic wing's. */
export const planFor = (id: string): PilotPlan => isGlider(id) ? GLIDER_PLAN[id] : CLASSIC_PLAN;

// How the coach reckons with each glider (coach-wing.js): its nominal speeds and sink, and the classic
// wing's planned turn (FLIGHT.turn.trim) scaled by how fast the glider turns on one hand at 0.5
// against the classic wing (gliders.test.js measures it).
const coach = (id: GliderId, turnRate: number): Readonly<CoachWing> => {
  const { speed, sink } = GLIDER_NOMINAL[id];
  return Object.freeze({ trimSpeed: speed.trim, barSpeed: speed.bar, lightSpeed: speed.light, trimSink: sink.trim, turnRate });
};
export const GLIDER_COACH = Object.freeze({
  'en-a': coach('en-a', 0.41), 'en-b': coach('en-b', 0.479), 'en-c': coach('en-c', 0.546), 'en-d': coach('en-d', 0.553), 'acro': coach('acro', 0.567),
});
/** How the coach reckons with the wing registered as `id`: a glider's, or null for the classic wing's own. */
export const coachWingFor = (id: string): Readonly<CoachWing> | null => isGlider(id) ? GLIDER_COACH[id] : null;

/**
 * How much a run tells a pilot of a failure (wing-cue.js): on the forgiving gliders, the A and the B,
 * its fix as well as its name; on the C, the D and the acro wing only its name, the fix being learned
 * in Training. The classic wing is told nothing new (null).
 */
export const GLIDER_GUIDANCE = Object.freeze({ 'en-a': 'fix', 'en-b': 'fix', 'en-c': 'name', 'en-d': 'name', 'acro': 'name' } as const);
export const guidanceFor = (id: string) => isGlider(id) ? GLIDER_GUIDANCE[id] : null;

/** The wing a run is flown on: the glider worn, or the first, should the kit name none. */
export const flownWing = (worn: string): GliderId => isGlider(worn) ? worn : GLIDERS[0];

/** How much longer (span) and deeper (chord) the canopy of `id` is than the classic wing's, for drawing it. */
export function lookFor(id: string) {
  const table = isGlider(id) ? GLIDER_TABLES[id] : PHYSICS;
  return { span: table.span / PHYSICS.span, chord: table.chord / PHYSICS.chord };
}

/**
 * How each glider handles, for the hangar: m/s it climbs circling a run thermal (hands at 0.5 and
 * 0.2), degrees a second it turns on one hand at 0.3, seconds its pitch takes to settle within 1°
 * after both hands pulse to 0.6, and seconds both hands pulled full take to stall it (Infinity: it
 * never stalls). Measured from the solver (gliders.test.js holds them to it).
 */
export interface Handling { climb: number; turn: number; settle: number; stall: number }
const handling = (climb: number, turn: number, settle: number, stall: number): Handling => Object.freeze({ climb, turn, settle, stall });
export const GLIDER_HANDLING = Object.freeze({
  'en-a': handling(3.5, 17.2, 13.1, Infinity),
  'en-b': handling(3.46, 18.9, 18.4, 2.83),
  'en-c': handling(3.27, 20.7, 23.9, 2.2),
  'en-d': handling(3.09, 25.4, 25.3, 0.65),
  'acro': handling(2.46, 27.1, 22.1, 0.57),
});

// The hangar's bars, each 0 to 1 over a fixed range: the glide ratio at trim, the climb, the turn on
// one light hand, and forgiveness, half how soon the pitch settles and half how slowly a full pull
// stalls the wing (a wing that never stalls, all of that half).
const BARS = Object.freeze({ glide: Object.freeze([7, 10.5]), climb: Object.freeze([2, 4]), turn: Object.freeze([14, 30]),
  settle: Object.freeze([30, 10]), stall: 3 });
const share = (value: number, [from, to]: readonly number[]) => Math.min(1, Math.max(0, (value - from) / (to - from)));

/**
 * A glider as the hangar shows it: its four bars (0 to 1), whether it can be stalled in full (and so
 * slid on its tail), and which rotations its halves can take it into (canRotate).
 */
export function gliderCard(id: GliderId) {
  const nominal = GLIDER_NOMINAL[id], flies = GLIDER_HANDLING[id];
  const stall = Number.isFinite(flies.stall) ? Math.min(1, flies.stall / BARS.stall) : 1;
  return {
    glide: share(nominal.speed.trim / nominal.sink.trim, BARS.glide),
    climb: share(flies.climb, BARS.climb),
    agility: share(flies.turn, BARS.turn),
    forgiveness: (share(flies.settle, BARS.settle) + stall) / 2,
    stalls: Number.isFinite(flies.stall),
    ...canRotate(id),
  };
}

/**
 * What a wing can be taken into on one half, read off its own flow: a helicopter wherever a half
 * stalls by itself, a SAT where it does at any speed (out of a spiral's). The classic wing, neither.
 */
export function canRotate(id: string) {
  const flow = isGlider(id) ? GLIDER_TABLES[id].feel?.flow : undefined;
  const halves = !!flow && flow.local > 0;
  return { heli: halves, sat: halves && flow!.maxSpeed === 0 };
}

// The Training lessons a glider is not taught, and why; it is taught every other one (training-
// gliders.test.js flies them all on it). A glider settles its own swing, so the classic wing's pitch
// lesson is not one of its own; the A cannot be fully stalled nor swung over the top; the D's and the
// acro's own loops are still to be taught; none can be taken into a rotation it cannot fly; and none
// is taught a failure it cannot have (wing-folds.js failsBy).
const SETTLES = 'A glider settles its own swing: pitch & catch is the classic wing\'s lesson.';
const LOOP_LATER = 'This glider\'s loop is not taught yet.';
const NO_HELI = 'Needs a glider that can helicopter: the EN-C, the EN-D or the Acro.', NO_SAT = 'Needs the Acro.';
const SPINS_NOT = 'Its halves never stall by themselves: fly an EN-C or higher.';
const CATCHES_NOT = 'It refills too soon to catch a tip: fly an EN-C or higher.', TWISTS_NOT = 'Only the Acro twists its lines.';
export const GLIDER_LESSON_LOCKS: Readonly<Record<GliderId, Readonly<Partial<Record<TrainingLessonId, string>>>>> = Object.freeze({
  'en-a': Object.freeze({ pitch: SETTLES, stall: 'The EN-A cannot be fully stalled: fly an EN-B or higher.',
    loop: 'The EN-A is too damped to swing over the top.', heli: NO_HELI, sat: NO_SAT,
    'deep-stall': 'The EN-A cannot be stalled, so never stalls deep: fly an EN-B or higher.', spin: SPINS_NOT, cravat: CATCHES_NOT, twist: TWISTS_NOT }),
  'en-b': Object.freeze({ pitch: SETTLES, heli: NO_HELI, sat: NO_SAT, spin: SPINS_NOT, cravat: CATCHES_NOT, twist: TWISTS_NOT }),
  'en-c': Object.freeze({ pitch: SETTLES, sat: NO_SAT, twist: TWISTS_NOT }),
  'en-d': Object.freeze({ pitch: SETTLES, loop: LOOP_LATER, sat: NO_SAT, twist: TWISTS_NOT }),
  'acro': Object.freeze({ pitch: SETTLES, loop: LOOP_LATER }),
});

/**
 * What Training offers flying `wing`, lesson by lesson: '' to fly it, why not if it is locked, or
 * null if it is not offered at all (the rotations and the recoveries, on the classic wing, which only
 * gliders fly).
 */
export function lessonOffers(wing: string): Record<TrainingLessonId, string | null> {
  const locks = isGlider(wing) ? GLIDER_LESSON_LOCKS[wing] : null;
  return Object.fromEntries(TRAINING_LESSONS.map(id => {
    const needs = TRAINING_LESSON_INFO[id].needs;
    return [id, locks ? locks[id] ?? '' : needs === 'heli' || needs === 'sat' || needs === 'recovery' ? null : ''];
  })) as Record<TrainingLessonId, string | null>;
}
