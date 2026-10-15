// The Daily Sky: one sky a day for everyone, the same in every browser, laid out from the UTC day
// and the version of the rules (a new version is a new sky, and a new board). And the sky any other
// address asks for: a new one for practice, or the one a link names.
import { SIM_VERSION } from './sim-version.js';
import { dayOf } from './good-lift-address.js';

// The mixer the sky's own pick() uses (cloudbase-state.js), copied so the sky stays as it is.
function mix32(value) {
  let t = value | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (t ^ (t >>> 14)) >>> 0;
}

/** The seed of a UTC day's Daily Sky under a version of the rules. */
export const seedFor = (day, version = SIM_VERSION) => mix32(Math.imul(day, 0x9e3779b1) ^ Math.imul(version + 1, 0x85ebca6b));

/** A sky's name, as `?sky=` writes it: its seed in eight hex digits. */
export const skyId = (seed) => (seed >>> 0).toString(16).padStart(8, '0');

/** A seed nobody chose, for a practice run. */
export function randomSeed() {
  const one = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(one);
  else one[0] = Math.random() * 0x100000000;
  return one[0];
}

/**
 * The sky `address` (good-lift-address.js) asks for as of `now`: { kind, seed, day }, `day` being
 * the UTC day of a Daily Sky and 0 for any other. Practice draws a new sky every time it is asked.
 * Anything else, a challenge included until its log has been read, is the day's sky.
 */
export function resolveSky(address, now = Date.now(), random = randomSeed) {
  if (address?.kind === 'practice') return { kind: 'practice', seed: random() >>> 0, day: 0 };
  if (address?.kind === 'sky') return { kind: 'sky', seed: address.sky >>> 0, day: 0 };
  const day = dayOf(now);
  return { kind: 'daily', seed: seedFor(day), day };
}
