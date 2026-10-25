// A run's air: air a wing can feel. Thermals keep a ring of sinking air round them and a little
// everywhere else, their strongest lift sits upwind of their middle, and how fast the lift grows
// across a wing is handed to the solver (the AirSample's gradX/gradZ), so the tip that meets a
// thermal first is lifted first and turns the wing away from it, as real wings do. And the air is
// never quite still: a field of turbulence, gentle in clear air and in a core, rough at a thermal's
// edge, in the lee, on a gust front and in cloud. Everything is a pure function of the sky's seed,
// its fixed-step clock and where the air is asked for, made of + − × ÷ and integer hashes only, so
// every engine feels the same bumps.
import type { AirFeel } from '../flight/atmosphere.ts';

/** The thermals' shape: see atmosphere.js's AirFeel. */
export const AIR_FEEL: Readonly<AirFeel> = Object.freeze({ ring: 0.1, ringWidth: 0.5, background: 0.15, calm: 0.5, upwind: 0.08,
  low: 450, blend: 100 });

/**
 * The turbulence: `scales` (m) of its two octaves and their `weights`; it changes over `height` m of
 * climb and `evolve` s of time; its sideways gusts are `horizontal` of its up-and-down. Its strength
 * σ (m/s) is the most of `floor` and the context's share: `core` of a thermal's strength (÷5.5) inside
 * one, `edge` at its edge, `rough` of the lee's roughness, `front` of a gust front's blow and `cloud`
 * of cloud depth, never past `cap`. Below `low` m there is none, and it grows in over the next
 * `blend` m, with the thermals' own feel (AIR_FEEL's low and blend): the launch climb stays as easy as ever.
 */
export const TURBULENCE = Object.freeze({
  scales: Object.freeze([18, 7]), weights: Object.freeze([1, 0.5]), height: 30, evolve: 4, horizontal: 0.7,
  floor: 0.12, core: 0.25, edge: 0.7, rough: 2.6, front: 0.6, cloud: 1.2, cap: 1.2,
  low: 450, blend: 100,
});

// One lattice value in [-1, 1] from integer coordinates and a seed: Math.imul mixing only.
function lattice(seed: number, x: number, y: number, z: number) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1) ^ seed;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 2147483647.5 - 1;
}

/** Value noise in [-1, 1] at (x, y, z), smoothly interpolated, with its slope along x and z. */
export interface NoiseSample { value: number; dx: number; dz: number }
export function valueNoise(seed: number, x: number, y: number, z: number, out: NoiseSample) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const gx = 6 * fx * (1 - fx), gz = 6 * fz * (1 - fz);
  const c000 = lattice(seed, ix, iy, iz), c100 = lattice(seed, ix + 1, iy, iz);
  const c010 = lattice(seed, ix, iy + 1, iz), c110 = lattice(seed, ix + 1, iy + 1, iz);
  const c001 = lattice(seed, ix, iy, iz + 1), c101 = lattice(seed, ix + 1, iy, iz + 1);
  const c011 = lattice(seed, ix, iy + 1, iz + 1), c111 = lattice(seed, ix + 1, iy + 1, iz + 1);
  // Along x first, then y, then z, keeping the x and z slopes as they go.
  const a00 = c000 + (c100 - c000) * sx, a10 = c010 + (c110 - c010) * sx;
  const a01 = c001 + (c101 - c001) * sx, a11 = c011 + (c111 - c011) * sx;
  const d00 = (c100 - c000) * gx, d10 = (c110 - c010) * gx, d01 = (c101 - c001) * gx, d11 = (c111 - c011) * gx;
  const b0 = a00 + (a10 - a00) * sy, b1 = a01 + (a11 - a01) * sy;
  const e0 = d00 + (d10 - d00) * sy, e1 = d01 + (d11 - d01) * sy;
  out.value = b0 + (b1 - b0) * sz;
  out.dx = e0 + (e1 - e0) * sz;
  out.dz = (b1 - b0) * gz;
  return out;
}

/** The turbulence at a point: its up-and-down (w), sideways (u along x, v along z) and w's slope. */
export interface Gusting { w: number; u: number; v: number; gradX: number; gradZ: number }
const one: NoiseSample = { value: 0, dx: 0, dz: 0 };

// Two octaves of one channel, skewed so no lattice plane is ever flat, normalised to [-1, 1].
function octaves(seed: number, x: number, y: number, z: number, time: number, channel: number, out: NoiseSample) {
  const T = TURBULENCE;
  let value = 0, dx = 0, dz = 0, total = 0;
  for (let o = 0; o < T.scales.length; o++) {
    const scale = T.scales[o], weight = T.weights[o];
    const X = (x + 0.37 * z) / scale, Z = z / scale, Y = y / T.height + time / T.evolve + 0.37 * o;
    valueNoise(seed ^ Math.imul(1013 * (o + 1) + channel, 0x5bd1e995), X, Y, Z, one);
    value += weight * one.value;
    // Back from the skewed lattice to the world's x and z.
    dx += weight * one.dx / scale;
    dz += weight * (0.37 * one.dx + one.dz) / scale;
    total += weight;
  }
  out.value = value / total; out.dx = dx / total; out.dz = dz / total;
  return out;
}

const channel: NoiseSample = { value: 0, dx: 0, dz: 0 };
/** The gusting of strength `sigma` at (x, y, z) at `time`, the field drifted `driftX, driftZ` with the wind. */
export function turbulenceAt(seed: number, x: number, y: number, z: number, time: number, sigma: number, driftX: number, driftZ: number, out: Gusting) {
  const px = x - driftX, pz = z - driftZ;
  octaves(seed, px, y, pz, time, 1, channel);
  out.w = sigma * channel.value; out.gradX = sigma * channel.dx; out.gradZ = sigma * channel.dz;
  octaves(seed, px, y, pz, time, 2, channel);
  out.u = TURBULENCE.horizontal * sigma * channel.value;
  octaves(seed, px, y, pz, time, 3, channel);
  out.v = TURBULENCE.horizontal * sigma * channel.value;
  return out;
}

/** How rough the air is (σ, m/s) from what is there: a core, an edge, the lee, a gust front, cloud; and height. */
export function roughness(core: number, edge: number, rough: number, front: number, cloud: number, height: number) {
  const T = TURBULENCE;
  const sigma = Math.min(T.cap, Math.max(T.floor, T.core * core, T.edge * edge, T.rough * rough, T.front * front, T.cloud * cloud));
  return sigma * Math.max(0, Math.min(1, (height - T.low) / T.blend));
}
