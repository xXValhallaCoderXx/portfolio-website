// What a stall, or a stall coming, does to the wing and the camera, and what the brake meter shows.
// Kept free of 3D and page code, like run-effects.js beside it, so that the rule that matters can
// be tested: none of it reaches the hero backdrop, a landing or the 404 scene, which fly the same
// wing.
import { BRAKE, STALL } from './flight.js';

// `fold` is how far each half of the wing folds in a straight stall, and `spin` how far the inside
// half folds in a spin (the other half stays open). The fold clears below the
// normalized `reopen` stall severity. `luff` is the stall load over which the cloth starts to
// flutter, all of it by the end. `shake` is radians of camera shake while the wing is falling.
// `tuck` is radians of camera shake while the wing is tucked or tipped: a jolt, under a stall's.
// `tip` is how far the half that unloaded folds in a tip collapse, at the top of a wingover too steep.
export const STALL_EFFECTS = Object.freeze({ fold: 0.45, spin: 0.85, reopen: 0.35, luff: Object.freeze([0.35, 0.95]), shake: 0.012, tuck: 0.006, tip: 0.75 });

// The meter is one track. The take-up of the brake fills its first `takeUp`; the light brake's
// linger creeps across the next `band` (40% of it, so a light brake can be read at a glance);
// the deep brake fills the rest. The ▼ button warns in amber for the last `late` of the band.
// From `near` of stall load the meter and the button turn red.
export const BRAKE_METER = Object.freeze({ takeUp: 0.1, band: 0.4, late: 0.25, near: 0.6, deepTolerance: 0.01 });

// Brake travel approaches its target asymptotically. Recognize an explicit deep command once
// the actual travel is within one percentage point; a normal hold never becomes deep by time.
export function deepBrakeReached(depth, intent) {
  return !!intent?.deepBrake && Number.isFinite(intent.brakeTarget) && intent.brakeTarget > BRAKE.light &&
    depth >= intent.brakeTarget - BRAKE_METER.deepTolerance;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothstep = (from, to, value) => {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Writes into `out` where each effect should be heading for the glider `flight` (as flight.js
 * keeps it): `left` and `right`, how far each half of the wing is folded (0 to 1), `luff`, how
 * hard the cloth flutters (0 to 1), `shake`, radians of camera shake, and `tuck`, how far its
 * leading edge is tucked under (0 to 1). A tip collapse folds the half it took (`tipSide`). The
 * wing's swings over the pilot are flight.js's own pitch and bank, drawn as they are. Outside the two kinds of flying everything is zero and `flight` is not read.
 * `load` is the aerodynamic stall severity the flutter warns of in either flight mode.
 */
export function stallEffects(mode, flight, out, load = flight?.stallLoad ?? 0) {
  out.left = out.right = out.luff = out.shake = out.tuck = 0;
  if (mode !== 'flying' && mode !== 'cloudbase') return out;
  const E = STALL_EFFECTS;
  if (flight.stall > E.reopen) {
    // A straight stall folds a little of both halves; a spin folds the inside one hard.
    if (flight.stallSide > 0) out.right = E.spin;
    else if (flight.stallSide < 0) out.left = E.spin;
    else out.left = out.right = E.fold;
  }
  out.luff = flight.stall > 0 ? 1 : smoothstep(E.luff[0], E.luff[1], load);
  if (flight.stall > STALL.surge) out.shake = E.shake;
  // A tuck folds the leading edge under and shakes the pilot a little, less than a stall; a tip
  // collapse folds the half that unloaded, with the same jolt.
  if (flight.tuck > 0) {
    out.tuck = 1;
    out.shake = Math.max(out.shake, E.tuck);
  }
  if (flight.tip > 0) {
    if (flight.tipSide > 0) out.right = Math.max(out.right, E.tip);
    else out.left = Math.max(out.left, E.tip);
    out.shake = Math.max(out.shake, E.tuck);
  }
  return out;
}

/**
 * Writes what the brake meter shows into `out`: `fill` and `red`, each a share of the track, and
 * `state`, one of '' (nothing to show), 'light', 'late' (the light brake about to go deep), 'deep',
 * 'near' (the stall is close), 'stalled' and 'ears' (the big ears in, filling as they fold).
 * `depth` and `load` are flight.js's brake and stallLoad, 0 to 1; `stall` is its normalized aerodynamic stall
 * severity and `ears` how far the ears are in. The fill grows from the left with the brake, or the ears;
 * the red grows in from the right with the load and meets the fill as the wing stalls. A stall
 * outranks the ears, and the ears the brake. When to brake a swing is the swing gauge's to show.
 */
export function brakeMeter(depth, load, stall, out, ears = 0, intent = null) {
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
  else if (deepBrakeReached(depth, intent) || (!intent && depth > BRAKE.shelf)) out.state = 'deep';
  else if (!intent && depth >= BRAKE.light + (1 - M.late) * (BRAKE.shelf - BRAKE.light)) out.state = 'late';
  else if (depth > 0.01 || load > 0.01) out.state = 'light';
  else out.state = '';
  return out;
}
