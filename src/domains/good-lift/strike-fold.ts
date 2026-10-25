import type { FlightState } from '../flight/models.ts';
// What strikes the wing, and how far it folds it, on a glider whose halves fold
// (wing-folds.js): a raven, one of Hrungnir's kettlebells, the Beast, or a strike from nowhere (one a
// test calls between steps). The sky says where from and by what (cloudbase-state.js strike); the run
// folds the half the strike came from (run-step.js), and the pilot flies it out with the controls in
// hand. Today's rules, and any wing that does not fold a half, keep the scripted fold.

/** Who struck: an index into STRIKE_FOLD. */
export const STRIKER = Object.freeze({ nowhere: 0, raven: 1, bell: 2, beast: 3 });

/** How much of the struck half each striker folds (wing-folds.js's fold, 0 to 1), by STRIKER. */
export const STRIKE_FOLD = Object.freeze([0.55, 0.45, 0.65, 0.85]);

/**
 * The half a strike from (x, z) folds: 1 if it came from the canopy's right of the pilot, −1 from its
 * left, `fallback` from dead ahead or behind. The canopy's right is read off its attitude by
 * arithmetic alone, so a replay folds the same half in every engine.
 */
export function strikeSide(g: FlightState, x: number, z: number, fallback: number) {
  const q = g.canopy.q;
  const rightX = 1 - 2 * (q.y * q.y + q.z * q.z), rightZ = 2 * (q.x * q.z - q.w * q.y);
  const across = (x - g.pos.x) * rightX + (z - g.pos.z) * rightZ;
  return across > 0 ? 1 : across < 0 ? -1 : fallback;
}
