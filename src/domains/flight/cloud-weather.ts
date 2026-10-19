import type { Vector2 } from './models.ts';
export interface CloudWeather { cycle: number; transition: number; fromHeading: number; toHeading: number; nextHeading: number; fromSpeed: number; toSpeed: number; nextSpeed: number; heading: number; speed: number; shifting: boolean; progress: number; until: number; side: number; nextSide: number }
// Seeded ambient weather. Callers store this pure answer only on reset or simulation steps.
export const CLOUD_WEATHER = Object.freeze({
  heading: Object.freeze([Math.PI / 3, 4 * Math.PI / 9]),
  speed: Object.freeze([3, 4]), steady: 90, turn: 25,
});
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const pick = (seed: number, n: number) => {
  let t = (seed ^ Math.imul(n + 1, 0x9e3779b1)) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Heading follows the shortest arc through north; a turn never drops the ambient speed. */
export function cloudWeatherAt(seed: number, elapsed: number, out: Partial<CloudWeather>, fixedWind: Vector2 | null = null, enabled = true) {
  const C = CLOUD_WEATHER, span = C.steady + C.turn;
  const cycle = Math.floor(Math.max(0, elapsed) / span), phase = Math.max(0, elapsed) - cycle * span;
  const initial = pick(seed, 900) < 0.5 ? -1 : 1;
  const side = initial * (cycle % 2 ? -1 : 1);
  const from = side * mix(C.heading[0], C.heading[1], pick(seed, 901 + cycle * 2));
  const to = -side * mix(C.heading[0], C.heading[1], pick(seed, 903 + cycle * 2));
  const fromSpeed = mix(C.speed[0], C.speed[1], pick(seed, 902 + cycle * 2));
  const toSpeed = mix(C.speed[0], C.speed[1], pick(seed, 904 + cycle * 2));
  const shifting = phase >= C.steady;
  const progress = shifting ? (phase - C.steady) / C.turn : 0;
  const eased = progress * progress * (3 - 2 * progress);
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  out.cycle = cycle; out.transition = cycle + (shifting ? 1 : 0);
  out.fromHeading = from; out.toHeading = out.nextHeading = to;
  out.fromSpeed = fromSpeed; out.toSpeed = out.nextSpeed = toSpeed;
  out.heading = from + delta * eased; out.speed = mix(fromSpeed, toSpeed, eased);
  out.shifting = shifting; out.progress = progress;
  out.until = shifting ? span - phase : C.steady - phase;
  out.side = Math.sin(out.heading) < 0 ? -1 : 1; out.nextSide = -side;
  if (fixedWind || !enabled) {
    const x = enabled && fixedWind ? fixedWind.x : 0, z = enabled && fixedWind ? fixedWind.z : 0;
    out.heading = out.fromHeading = out.toHeading = out.nextHeading = Math.atan2(x, -z);
    out.speed = out.fromSpeed = out.toSpeed = out.nextSpeed = Math.hypot(x, z);
    out.side = out.nextSide = x === 0 ? 0 : Math.sign(x);
    out.shifting = false; out.progress = 0; out.until = Infinity; out.transition = out.cycle = 0;
  }
  return out as CloudWeather;
}
