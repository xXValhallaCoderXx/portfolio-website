import type { FlightState } from '../../../domains/flight/models.ts';
// What a stall, or a stall coming, does to the wing and the camera, and what the brake meter shows.
// Kept free of 3D and page code, like run-effects.js beside it, so that the rule that matters can
// be tested: none of it reaches the hero backdrop, a landing or the 404 scene, which fly the same
// wing.
import { BRAKE, STALL } from '../../../domains/flight/flight.ts';
import { WING } from '../../../domains/flight/wing-envelope.ts';
import { wingTable } from '../../../domains/flight/flight-physics.ts';
import { FOLDED, halfGate, halfLatch, halfStall } from '../../../domains/flight/wing-folds.ts';

// `fold` is how far both halves of the wing fold in a symmetric stall. It clears below the
// normalized `reopen` stall severity. `luff` is the stall load over which the cloth starts to
// flutter, all of it by the end. `shake` is radians of camera shake while the wing is falling.
// `tuck` is radians of camera shake while the leading edge is folded: a jolt, under a stall's.
// `half` is how far a half stalled by itself folds back (a spin, a SAT, a helicopter's inner half),
// and `halfLuff` how hard its cloth flutters.
// A glider's half folded by a collapse (wing-folds.js) is drawn that far folded, its cloth fluttering
// `foldLuff` of it and the pilot shaken `foldShake` radians at the most.
export const STALL_EFFECTS = Object.freeze({ fold: 0.45, backflyFold: 0.18, reopen: 0.35, luff: Object.freeze([0.35, 0.95]), shake: 0.012, tuck: 0.006,
  half: 0.55, halfLuff: 0.8, foldLuff: 0.7, foldShake: 0.008 });

// The meter is one track. The take-up of the brake fills its first `takeUp`; the light brake's
// working travel fills the next `band` (40% of it); deliberate deep travel fills the rest.
// From `near` of stall load the meter and the button turn red.
export const BRAKE_METER = Object.freeze({ takeUp: 0.1, band: 0.4, near: 0.6, deepTolerance: 0.01 });

// Brake travel approaches its target asymptotically. Recognize an explicit deep command once
// the actual travel is within one percentage point; a normal hold never becomes deep by time.
export function deepBrakeReached(depth: number, intent: Pick<FlightState, 'deepBrake' | 'brakeTarget'> | null) {
  return !!intent?.deepBrake && Number.isFinite(intent.brakeTarget) && intent.brakeTarget > BRAKE.light &&
    depth >= intent.brakeTarget - BRAKE_METER.deepTolerance;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smoothstep = (from: number, to: number, value: number) => {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Writes into `out` where each effect should be heading for the glider `flight` (as flight.js
 * keeps it): `left` and `right`, how far each half of the wing is folded (0 to 1), `luff`, how
 * hard the cloth flutters (0 to 1), `shake`, radians of camera shake, `tuck`, how far its leading
 * edge is tucked under (0 to 1), `cravatLeft` and `cravatRight`, each tip caught in its lines (0 to
 * 1), and `twist`, the pilot turned under the lines (radians, positive to the left). The
 * wing's swings over the pilot are flight.js's own pitch and bank, drawn as they are. Outside the two kinds of flying everything is zero and `flight` is not read.
 * `load` is the aerodynamic stall severity the flutter warns of in either flight mode.
 */
export interface StallVisuals { left: number; right: number; luff: number; shake: number; tuck: number; cravatLeft: number; cravatRight: number; twist: number }
export interface BrakeMeter { fill: number; red: number; state: string }
export function stallEffects(mode: string, flight: FlightState, output: Partial<StallVisuals>, load = flight?.stallLoad ?? 0): StallVisuals {
  const out = output as StallVisuals;
  out.left = out.right = out.luff = out.shake = out.tuck = out.cravatLeft = out.cravatRight = out.twist = 0;
  if (mode !== 'flying' && mode !== 'cloudbase' && mode !== 'training') return out;
  const E = STALL_EFFECTS;
  const backfly = flight.wingPhase === WING.backfly;
  const severity = clamp(flight.stall, 0, 1);
  if (flight.stall > E.reopen) {
    out.left = out.right = backfly ? E.backflyFold : E.fold * severity;
  }
  out.luff = flight.stall > 0 ? backfly ? 0.35 : severity : smoothstep(E.luff[0], E.luff[1], load);
  // A half stalled by itself folds back on its own side, its cloth fluttering. The classic wing has none.
  const { sepL, sepR } = flight.physical;
  if (sepL > 0 || sepR > 0) {
    out.left = Math.max(out.left, E.half * sepL);
    out.right = Math.max(out.right, E.half * sepR);
    out.luff = Math.max(out.luff, E.halfLuff * Math.max(sepL, sepR));
  }
  if (flight.stall > STALL.surge && !backfly) out.shake = E.shake * severity;
  // A frontal fold shakes the pilot a little, less than a stall.
  if (flight.tuck > 0) {
    out.tuck = clamp(flight.tuck, 0, 1);
    out.shake = Math.max(out.shake, E.tuck * out.tuck);
  }
  // A glider's half folded by a collapse (wing-folds.js), a tip caught in its lines and lines twisted:
  // all on the wing as they are, the classic wing never having any.
  const fold = Math.max(flight.foldLeft, flight.foldRight);
  if (fold > FOLDED) {
    out.left = Math.max(out.left, clamp(flight.foldLeft, 0, 1));
    out.right = Math.max(out.right, clamp(flight.foldRight, 0, 1));
    out.luff = Math.max(out.luff, E.foldLuff * clamp(fold, 0, 1));
    out.shake = Math.max(out.shake, E.foldShake * clamp(fold, 0, 1));
  }
  out.cravatLeft = clamp(flight.cravatLeft, 0, 1);
  out.cravatRight = clamp(flight.cravatRight, 0, 1);
  out.twist = flight.twist;
  return out;
}

/**
 * Writes what the brake meter shows into `out`: `fill` and `red`, each a share of the track, and
 * `state`, one of '' (nothing to show), 'light', 'deep',
 * 'near' (the stall is close), 'stalled' and 'ears' (the big ears in, filling as they fold).
 * `depth` and `load` are flight.js's brake and stallLoad, 0 to 1; `stall` is its normalized aerodynamic stall
 * severity and `ears` how far the ears are in. The fill grows from the left with the brake, or the ears;
 * the red grows in from the right with the load and meets the fill as the wing stalls. A stall
 * outranks the ears, and the ears the brake. When to brake a swing is the swing gauge's to show.
 */
export function brakeMeter(depth: number, load: number, stall: number, output: Partial<BrakeMeter>, ears = 0, intent: Pick<FlightState, 'deepBrake' | 'brakeTarget'> | null = null): BrakeMeter {
  const out = output as BrakeMeter;
  if (stall <= 0 && ears > 0) {
    out.fill = clamp(ears, 0, 1);
    out.red = 0;
    out.state = 'ears';
    return out;
  }
  const M = BRAKE_METER;
  if (depth <= BRAKE.light) out.fill = (M.takeUp * depth) / BRAKE.light;
  else if (depth <= BRAKE.shelf) out.fill = M.takeUp + (M.band * (depth - BRAKE.light)) / (BRAKE.shelf - BRAKE.light);
  else out.fill = M.takeUp + M.band + ((1 - M.takeUp - M.band) * (depth - BRAKE.shelf)) / (1 - BRAKE.shelf);
  out.fill = clamp(out.fill, 0, 1);
  out.red = stall > 0 ? 1 - out.fill : clamp(load, 0, 1) * (1 - out.fill);
  if (stall > 0) out.state = 'stalled';
  else if (load >= M.near) out.state = 'near';
  else if (deepBrakeReached(depth, intent)) out.state = 'deep';
  else if (depth > 0.01 || load > 0.01) out.state = 'light';
  else out.state = '';
  return out;
}

// The soft-brakes cue: how far under a half's latch (physical travel) its hand begins to say so,
// which keeps it above Q/E's travel (0.492), how far under its stall the half's flow begins to, how
// far over the speed it stalls at the cue begins (m/s), and how near the hands may be to each other
// (travel) and pull together: a full stall asked for, as the trick watch reads one, in which both
// halves go as one.
export const SOFT_BRAKES = Object.freeze({ hand: 0.045, alpha: 0.08, speed: 0.3, even: 0.15 });

/**
 * How near each half is to stalling by itself, 0 to 1 (`left`, `right`), for the soft-brakes cue: on
 * a wing whose halves stall on their own (its SideFlow, flight-physics.js), as a hand held deep past
 * Q/E's travel brings that half's flow up to its stall, below the speed it stalls at, all three
 * brought nearer for a half carrying the other's fold (wing-folds.js). Nothing on the classic wing or
 * one whose halves never stall alone, nothing on the hands' old controls, nothing while both hands
 * pull together, nothing for a half already gone, and nothing in a stall.
 */
export function softBrakes(mode: string, flight: FlightState, out: { left: number; right: number } = { left: 0, right: 0 }) {
  out.left = out.right = 0;
  if (mode !== 'flying' && mode !== 'cloudbase' && mode !== 'training') return out;
  const s = flight.physical, feel = wingTable(s.wing).feel, flow = feel?.flow, R = feel?.recovery;
  const S = SOFT_BRAKES;
  if (!flow || flow.local <= 0 || flight.stall > 0 || s.controlMode !== 'brakes' || Math.abs(s.leftBrake - s.rightBrake) <= S.even) return out;
  const near = (hand: number, alpha: number, separated: number, other: number) => {
    if (separated > 0.05) return 0;
    const gate = halfGate(flow, R, other), latch = halfLatch(flow, R, other), critical = halfStall(flow, R, other, hand);
    const slow = flow.maxSpeed > 0 ? smoothstep(gate + S.speed, gate, s.flow.forward) : 1;
    return smoothstep(latch - S.hand, latch, hand) * smoothstep(critical - S.alpha, critical, alpha) * slow;
  };
  out.left = near(s.leftBrake, s.sideAlphaL, s.sepL, s.foldR);
  out.right = near(s.rightBrake, s.sideAlphaR, s.sepR, s.foldL);
  return out;
}
