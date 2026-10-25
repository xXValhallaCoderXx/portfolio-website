// How the chase camera feels the flight beyond following it (flight-camera.js): the lens widening as
// the wing runs faster than its own trim, the camera falling back as the lines load, and the horizon
// tilting with a quarter of the bank. For whoever asks for less motion all of it stays still. Pure.
//
//   lens, faster   degrees the lens widens at most, reached `faster` m/s over the wing's trim
//   back           metres the camera falls back at most, from `light` g to `heavy` g
//   tilt, most     the share of the bank the horizon tilts by, and the most it tilts (rad)
export const CAMERA_FEEL = Object.freeze({ lens: 8, faster: 9, back: 5, light: 1.3, heavy: 3, tilt: 0.25, most: Math.PI / 18 });

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smoothstep = (from: number, to: number, value: number) => {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Degrees the lens widens for `speed` m/s on a wing trimmed at `trim`. */
export const lensFor = (speed: number, trim: number, calm: boolean) => (calm ? 0 : CAMERA_FEEL.lens * smoothstep(0, CAMERA_FEEL.faster, speed - trim));

/** Metres the camera falls back for a load of `load` g. */
export const pullFor = (load: number, calm: boolean) => (calm ? 0 : CAMERA_FEEL.back * smoothstep(CAMERA_FEEL.light, CAMERA_FEEL.heavy, load));

/** The horizon's tilt (rad) for `bank`: none round a loop, which it holds level, or for less motion. */
export const tiltFor = (bank: number, looping: boolean, calm: boolean) =>
  (calm || looping ? 0 : clamp(-bank * CAMERA_FEEL.tilt, -CAMERA_FEEL.most, CAMERA_FEEL.most));
