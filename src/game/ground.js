// The ground, as numbers: how high the land stands at any point of the fjord and of the sky beyond
// the arch, with the arch's crag and each landing zone's plateau cut into it. No 3D code and none of
// the page's words, so a run, which touches down on this ground (run-step.js) and has kettlebells
// thrown over it (bells.js), can be flown wherever three.js is not: in the tests, and in the world
// board's function (functions/), which replays every run sent to it before it ranks it.
// terrain.js builds the fjord's scenery on it and hands these very functions on to the page.
//
// The numbers here are part of how a run flies (sim-version.test.js fingerprints the ground and the
// plateaus), so changing any of them needs a new SIM_VERSION.

// The arch stands across the eastward departure from launch. The corridor bounds its glowing
// opening; entry checks its full stone depth with a small margin for the suspended pilot.
// These entry bounds do not change the terrain or the scored rune gates inside Good Lift.
export const GATEWAY = {
  x: 85, z: 320, baseY: 52, size: 60, rotationY: Math.PI / 2,
  corridor: { minZ: 309, maxZ: 331, minY: 61, maxY: 97 },
  entry: { halfDepth: 11.4, margin: 2 },
};

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;

function hash(ix, iz) {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Smooth noise from 0 to 1 over the ground: what the land is made of, and its snow line follows. */
export function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x, z) {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    value += amp * valueNoise(x * freq, z * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return value;
}

// The fjord is a meandering channel running south to north.
export const centerX = (z) => 46 * Math.sin(z * 0.011) + 22 * Math.sin(z * 0.026 + 1.3);
const halfWidth = (z) => 42 + 12 * Math.sin(z * 0.019 + 0.5);
/** The x of a point `off` metres inland from the fjord's shore at `z`: `side` +1 east, -1 west, 0 mid-fjord. */
export const shore = (z, side, off) => centerX(z) + side * (halfWidth(z) + off);

function rawHeight(x, z) {
  const d = Math.abs(x - centerX(z));
  const t = smoothstep(halfWidth(z) - 10, halfWidth(z) + 190, d);
  let h = -9 + Math.pow(t, 1.25) * 185;
  h += (fbm(x * 0.018, z * 0.018) - 0.47) * (10 + 95 * t);
  h += (fbm(x * 0.07 + 40, z * 0.07) - 0.47) * (2 + 10 * t);
  h += smoothstep(-340, -440, z) * 130; // the head of the fjord closes in the north
  h = mix(h, -9, smoothstep(350, 445, z)); // and it opens to the sea in the south
  h = mix(h, -9, smoothstep(268, 318, Math.abs(x))); // the massif falls back into the sea at its edges
  return mix(h, -9, smoothstep(-425, -449, z));
}

// Where each place to land is cut into the ground as a flat plateau, one per page section: `side`
// picks the shore (+1 east, -1 west, 0 mid-fjord), `off` is metres inland and `r` the plateau's
// radius. A plateau stands at the height of the land it is cut from, between 7 and 70 m, unless it
// is given its own `h`. terrain.js's ZONES are these, with each section's label and name.
export const PLATEAUS = Object.freeze([
  { id: 'about', z: 170, side: 1, off: 44, r: 26 },
  { id: 'projects', z: -10, side: -1, off: 46, r: 26 },
  { id: 'experience', z: -190, side: 1, off: 80, r: 24 },
  { id: 'contact', z: -300, side: 0, off: 0, r: 22, h: 7 },
].map((zone) => {
  const x = shore(zone.z, zone.side, zone.off);
  const h = zone.h ?? Math.min(70, Math.max(7, rawHeight(x, zone.z)));
  return Object.freeze({ ...zone, x, h });
}));

// Terrain height with a flat plateau cut for each landing zone.
export function heightAt(x, z) {
  let h = rawHeight(x, z);
  const crag = Math.hypot((x - GATEWAY.x) / 23, (z - GATEWAY.z) / 60);
  if (crag < 1.45) h = Math.max(h, mix(GATEWAY.baseY, -9, smoothstep(0.75, 1.45, crag)));
  for (const zone of PLATEAUS) {
    const dist = Math.hypot(x - zone.x, z - zone.z);
    if (zone.id === 'contact') {
      // Keep the full landing area flat, then drop quickly to water outside the island.
      if (dist < zone.r * 2.2) h = mix(zone.h, -9, smoothstep(zone.r, zone.r + 8, dist));
    } else if (dist < zone.r * 2.2) h = mix(zone.h, h, smoothstep(zone.r, zone.r * 2.2, dist));
  }
  return h;
}

/** The surface under a point: the land, or the water where the land is under it. */
export const surfaceAt = (x, z) => Math.max(0, heightAt(x, z));
