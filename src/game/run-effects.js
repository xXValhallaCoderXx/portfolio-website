// What a Cloudbase run does to the wing, the picture and the camera at this moment. Kept free of
// 3D and page code so that the one rule that matters here can be tested: none of it may outlive
// the run, because the same wing flies on over the fjord, behind the page and into the 404 scene.

// `reopen` is how many seconds before control returns the wing starts to open again. `climb` is
// the climb rate (m/s) at which the camera looks fully up, and `fog` the clearance above the fog
// (m) over which that look comes in, so the fog is never tilted out of sight when it is close.
// `shake` and `tremble` are radians: a struck wing, and the rough air inside a cloud.
export const RUN_EFFECTS = Object.freeze({ reopen: 0.5, climb: 14, fog: Object.freeze([12, 50]), shake: 0.022, tremble: 0.004 });

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothstep = (from, to, value) => {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Writes into `out` where each effect should be heading: `fold` (the wing, 0 or 1), `veil` (the
 * grey of a cloud, 0 to 1), `shake` (radians) and `gaze` (how far the camera looks up, 0 to 1).
 * `pilot` is the run's pilot state, `eyeDepth` how deep in cloud the camera itself is. Outside a
 * run everything is zero and `pilot` is not read.
 */
export function runEffects(mode, pilot, verticalSpeed, fogClearance, eyeDepth, out) {
  out.fold = out.veil = out.shake = out.gaze = 0;
  if (mode !== 'cloudbase') return out;
  out.fold = pilot.collapse > RUN_EFFECTS.reopen ? 1 : 0;
  out.veil = Math.max(pilot.cloud, eyeDepth);
  out.shake = RUN_EFFECTS.shake * clamp(pilot.collapse / 1.5, 0, 1) ** 2 + RUN_EFFECTS.tremble * pilot.cloud;
  out.gaze = clamp(verticalSpeed / RUN_EFFECTS.climb, 0, 1) * smoothstep(RUN_EFFECTS.fog[0], RUN_EFFECTS.fog[1], fogClearance);
  return out;
}
