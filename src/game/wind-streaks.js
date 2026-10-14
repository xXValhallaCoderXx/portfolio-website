import * as THREE from 'three';
import { CLOUD_GUST, CLOUD_POOL, CLOUD_WIND, CLOUD_ZONE } from './cloudbase-state.js';

// The wind made visible. Faint streaks of air fill a box that travels with the pilot, each a comet
// whose bright head points the way the air is going. In a Cloudbase run each gust band crossing the
// zone is also a curtain of long, bright streaks, with one faint line along its leading edge. Like
// the air rushing past in the 404 scene (lost.js) they are 1 px lines that the game's glow thickens.
// This module only draws: the wind is whatever `windAt` the game hands over on each update, the
// run's or the fjord's breeze (approach.js). Distances are metres, speeds metres/second, times
// seconds, and brightness runs from 0 to 1 before the glow, which starts at 0.3.
export const WIND_STREAKS = Object.freeze({
  // Streaks in the box around the pilot, and more kept for the gust fronts.
  count: 140, front: 60,
  // The box: metres across (x), tall (y) and along (z), with `above` metres of its height over the
  // pilot. A streak fades out as either end comes within `margin` of the half-box of a face, so the
  // field has no hard edge; that is longer than half the longest streak, so no lit one pokes out.
  box: Object.freeze([180, 65, 180]), above: 45, margin: 0.15,
  // How many times as fast as the air where the pilot is the whole field travels. The pilot is
  // carried by that same air, so at 1 a circling pilot would see none of it go by; a little faster
  // shows the wind as a slow stream across a circle. From a glider doing 11.5 m/s most of what
  // moves on screen is the glider itself, so the direction is read from each streak's shape.
  flow: 1.5,
  // Metres of streak per m/s of wind, and the shortest and longest. A streak is dark under `still`
  // m/s and fully lit by twice that, so a dead calm draws nothing.
  stretch: 3, length: Object.freeze([3, 26]), still: 0.3,
  // Brightness at the head: `glow[0]` plus `glow[1]` per m/s of breeze, which keeps the strongest
  // breeze of a run (4 m/s, 0.38) under the glow's threshold, and `gust` inside a gust band, which
  // blooms. The pale air colour is 0.77 bright by the glow's measure and the gust's 0.92.
  glow: Object.freeze([0.2, 0.045]), gust: 0.85,
  // Each streak dims by up to `twinkle` of itself and back, at `shimmer` radians a second.
  twinkle: 0.35, shimmer: Object.freeze([0.5, 1.3]),
  // Fades, each from dark at the first number to whole at the second: metres from the camera, and
  // metres from the line of sight between the camera and the middle of the glider, `rise` above the
  // pilot (so that no streak slices across the wing in view). Under the floor the game gives (the
  // fog in a run, the water over the fjord) streaks are dark, and they come in over `floor` metres.
  near: Object.freeze([8, 20]), clear: Object.freeze([2.5, 8]), rise: 3, floor: 12,
  // A gust band's own streaks: `frontLength` metres long, hung in a curtain from `curtain[0]` metres
  // below the pilot to `curtain[1]` above, and shown out to `window` metres to either side of the
  // point on the front abeam the pilot. One moving from one band to another fades out and in again
  // over `swap` seconds, so a band coming or going never makes a curtain jump.
  frontLength: Object.freeze([16, 26]), curtain: Object.freeze([30, 60]), window: Object.freeze([100, 120]), swap: 0.5,
  // The line along each front's leading edge: `drop` metres under the pilot, at `glow`.
  lead: Object.freeze({ drop: 6, glow: 0.3 }),
  // A streak's wind is looked up once every `resample` frames, and all of it afresh once the pilot
  // has moved more than `jump` metres between updates (put somewhere else).
  resample: 4, jump: 40,
  // Under reduced motion: this share of the streaks, travelling `flow` times as fast as the air.
  calm: Object.freeze({ share: 0.6, flow: 1 }),
  // How much brighter everything is drawn once the game has dropped its glow.
  unbloomed: 1.6,
  // The 404 scene's pale air, and the whiter air of a gust. Never amber or red: in this game those
  // mean lift and danger.
  colour: 0xbfe9ff, gustColour: 0xeaf8ff,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothstep = (from, to, value) => {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};
// `value` brought into 0 .. span, or into -span / 2 .. span / 2, by whole spans.
const wrap = (value, span) => value - span * Math.floor(value / span);
const wrapCentred = (value, span) => value - span * Math.floor(value / span + 0.5);
// The launch hill's lee as the run has it: no gust under the first height, all of it by the second.
const leeAt = (y) => smoothstep(CLOUD_WIND.lee[0], CLOUD_WIND.lee[1], y);

// Roberts' R3 sequence: the n-th point of an even spread through the unit cube, never close to an
// earlier one, so that the first few streaks (all the fjord shows) are as evenly spread as the lot.
const R3 = Object.freeze([0.8191725133961644, 0.671043606703789, 0.5497004779019701]);
const spread = (n, axis) => (0.5 + R3[axis] * (n + 1)) % 1;

// Random numbers from 0 to 1, the same on every visit: the generator the terrain scatters with.
function dice(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One set of streaks, added to `scene` and drawn at render order `order`: the game passes
 * ORDER.aboveFog from cloudbase.js, so that they are drawn after the run's fog, which would
 * otherwise paint over them. `calm` is for a visitor who asks for reduced motion: fewer streaks, no
 * twinkle, and a field that moves with the air. Everything is made here, once, and belongs to this
 * set alone, so a second game (a React remount) gets a second set.
 */
export function createWindStreaks({ scene, order = 0, calm = false }) {
  const W = WIND_STREAKS;
  const G = CLOUD_GUST;
  const Z = CLOUD_ZONE;
  const STEADY = W.count;
  const FRONT = W.front;
  const SLOTS = CLOUD_POOL.gusts;
  // The steady streaks come first in the buffers, then the gust fronts', then one leading edge per
  // gust slot. Each is one segment: two points of three numbers, tail first.
  const LEADS = STEADY + FRONT;
  const SEGMENTS = LEADS + SLOTS;
  const [boxX, boxY, boxZ] = W.box;
  const below = boxY - W.above;
  const curtain = W.curtain[0] + W.curtain[1];
  // How far in from each face of the box, and from the top and foot of a curtain, a streak fades.
  const edgeX = (W.margin * boxX) / 2;
  const edgeY = (W.margin * boxY) / 2;
  const edgeZ = (W.margin * boxZ) / 2;
  const edgeCurtain = (W.margin * curtain) / 2;
  // A front's streak is centred at least this far behind the front and in front of the band's back,
  // so that even the longest one lies wholly in the band; across, it keeps off the band's soft edge.
  const reach = W.frontLength[1] / 2 + 1;
  const across = G.half - G.soft / 2;
  const flow = calm ? W.calm.flow : W.flow;
  const twinkle = calm ? 0 : W.twinkle;

  const positions = new Float32Array(SEGMENTS * 6);
  const colours = new Float32Array(SEGMENTS * 6);
  const places = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const tints = new THREE.BufferAttribute(colours, 3).setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', places);
  geometry.setAttribute('color', tints);
  // Additive, so a dark tail adds nothing and a streak never darkens what is behind it. Not fogged:
  // a gust's curtain has to be seen from across the zone.
  const material = new THREE.LineBasicMaterial({
    vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = 'wind-streaks';
  // The points are moved by rewriting the buffer, so their bounds are never right.
  lines.frustumCulled = false;
  lines.renderOrder = order;
  lines.visible = false;
  scene.add(lines);

  // The air's colour, and how far each channel of a gust's whiter colour is from it.
  const air = new THREE.Color(W.colour);
  const gust = new THREE.Color(W.gustColour);
  const [paleR, paleG, paleB] = [air.r, air.g, air.b];
  const [whiterR, whiterG, whiterB] = [gust.r - air.r, gust.g - air.g, gust.b - air.b];
  const [nearIn, nearOut] = W.near;
  const [clearIn, clearOut] = W.clear;

  // Each streak's fixed seeds: where it sits in its box (or in its band), 0 to 1 on each axis, and
  // the phase and rate of its twinkle.
  const seeds = new Float32Array((STEADY + FRONT) * 3);
  const phase = new Float32Array(STEADY + FRONT);
  const shimmer = new Float32Array(STEADY + FRONT);
  const roll = dice(0x57a1d);
  for (let i = 0; i < STEADY + FRONT; i++) {
    const n = i < STEADY ? i : i - STEADY;
    for (let axis = 0; axis < 3; axis++) seeds[i * 3 + axis] = spread(n, axis);
    phase[i] = roll() * Math.PI * 2;
    shimmer[i] = W.shimmer[0] + (W.shimmer[1] - W.shimmer[0]) * roll();
  }
  // How far the air has carried the steady field, east and south, kept within one box. The field
  // moves as one, by the wind where the pilot is. Carried each by the wind at its own place, the
  // streaks would crowd wherever the air slows (behind a band, past the zone's edge, by a windsock)
  // and nothing would ever spread them out again. Each still lies, stretches and shines with the
  // wind at its own place.
  let driftX = 0;
  let driftZ = 0;
  // The wind each streak last looked up: east, south and how much of a gust band is there.
  const wind = new Float32Array((STEADY + FRONT) * 3);
  // How bright each streak's head is to be, before it is dimmed near the camera (see tint).
  const light = new Float32Array(STEADY + FRONT);
  // Which gust slot each front streak is drawn on (-1 for none), the birth time of the band it was
  // given (a slot can be taken over by a new band), and how far it has faded in, 0 to 1. Each one
  // goes to whichever live band it scores highest for, so a band coming or going only moves the
  // streaks that were or will be its own, and live bands share them out about evenly.
  const owner = new Int8Array(FRONT).fill(-1);
  const born = new Float64Array(FRONT);
  const fade = new Float32Array(FRONT);
  const score = new Float32Array(FRONT * SLOTS);
  for (let i = 0; i < score.length; i++) score[i] = roll();

  // The camera, the line of sight from it to the middle of the glider (as a run and its length
  // squared), and that line's middle and half its length, set on each update.
  const sight = new Float64Array(11);
  const probe = { x: 0, z: 0, front: 0, rough: 0 };
  let clock = 0;
  let frame = 0;
  // How many steady streaks were in use at the last update: one coming into use has no wind yet.
  let used = 0;
  let awake = false;
  let disposed = false;
  let lastX = 0;
  let lastY = 0;
  let lastZ = 0;

  function look(pos, eye) {
    sight[0] = eye.x;
    sight[1] = eye.y;
    sight[2] = eye.z;
    sight[3] = pos.x - eye.x;
    sight[4] = pos.y + W.rise - eye.y;
    sight[5] = pos.z - eye.z;
    sight[6] = sight[3] * sight[3] + sight[4] * sight[4] + sight[5] * sight[5];
    sight[7] = eye.x + sight[3] / 2;
    sight[8] = eye.y + sight[4] / 2;
    sight[9] = eye.z + sight[5] / 2;
    sight[10] = Math.sqrt(sight[6]) / 2;
  }

  // Whether a streak centred on (x, y, z), `half` metres to either side, reaches anywhere near the
  // camera or the line of sight. Very few do, and only they need measuring exactly.
  function inView(x, y, z, half) {
    const ex = x - sight[0];
    const ey = y - sight[1];
    const ez = z - sight[2];
    const mx = x - sight[7];
    const my = y - sight[8];
    const mz = z - sight[9];
    const eye = nearOut + half;
    const line = sight[10] + clearOut + half;
    return ex * ex + ey * ey + ez * ez < eye * eye || mx * mx + my * my + mz * mz < line * line;
  }

  // How much of its light a level segment keeps, starting at (ax, ay, az) and running (dx, 0, dz),
  // for how near it comes to the camera and to the line of sight. The second is the nearest
  // approach of two segments, as in Ericson's Real-Time Collision Detection (5.1.9).
  function unseen(ax, ay, az, dx, dz) {
    const rx = ax - sight[0];
    const ry = ay - sight[1];
    const rz = az - sight[2];
    const a = dx * dx + dz * dz;
    const c = dx * rx + dz * rz;
    let s = a > 1e-9 ? clamp(-c / a, 0, 1) : 0;
    let qx = rx + dx * s;
    let qz = rz + dz * s;
    const eye = Math.sqrt(qx * qx + ry * ry + qz * qz);
    const e = sight[6];
    let t = 0;
    if (e > 1e-9) {
      const f = sight[3] * rx + sight[4] * ry + sight[5] * rz;
      if (a <= 1e-9) {
        s = 0;
        t = clamp(f / e, 0, 1);
      } else {
        const b = dx * sight[3] + dz * sight[5];
        const denom = a * e - b * b;
        s = denom > 1e-9 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
        t = (b * s + f) / e;
        if (t < 0) {
          t = 0;
          s = clamp(-c / a, 0, 1);
        } else if (t > 1) {
          t = 1;
          s = clamp((b - c) / a, 0, 1);
        }
      }
    }
    qx = rx + dx * s - sight[3] * t;
    const qy = ry - sight[4] * t;
    qz = rz + dz * s - sight[5] * t;
    return smoothstep(nearIn, nearOut, eye) * smoothstep(clearIn, clearOut, Math.sqrt(qx * qx + qy * qy + qz * qz));
  }

  // Looks up the wind where streak `i` is now, for this frame and the next few. The run counts a
  // band as wholly there however deep in the launch hill's lee, where its wind is cut as the
  // breeze's is; a band is drawn only as strong as the wind it brings, or a band blowing half a
  // metre a second low on the hill would show as white, blooming streaks.
  function sample(windAt, i, x, y, z) {
    probe.front = 0;
    windAt(x, y, z, probe);
    const k = i * 3;
    wind[k] = probe.x;
    wind[k + 1] = probe.z;
    wind[k + 2] = probe.front * leeAt(y);
  }

  // How bright streak `i`'s twinkle has it at the moment, 1 at most.
  const shine = (i) => (twinkle ? 1 - twinkle * (0.5 + 0.5 * Math.sin(clock * shimmer[i] + phase[i])) : 1);

  // Puts streak (or leading edge) `i` out: no length, no light.
  function hide(i, pos) {
    const p = i * 6;
    positions[p] = positions[p + 3] = pos.x;
    positions[p + 1] = positions[p + 4] = pos.y;
    positions[p + 2] = positions[p + 5] = pos.z;
    colours.fill(0, p, p + 6);
    if (i < LEADS) light[i] = 0;
  }

  // Lights streak `i` where its pass put it: a dark tail, so that it reads as a comet heading
  // downwind, and a head `light[i]` bright, whiter in a gust (a front's own streaks are always the
  // gust's colour). Wherever it comes near the camera or crosses the line of sight to the glider it
  // is dimmed. Only its number is handed over, so that a frame's two hundred calls cost no memory.
  function tint(i) {
    const p = i * 6;
    let glow = light[i];
    if (glow > 0) {
      const tx = positions[p];
      const y = positions[p + 1];
      const tz = positions[p + 2];
      const dx = positions[p + 3] - tx;
      const dz = positions[p + 5] - tz;
      if (inView(tx + dx / 2, y, tz + dz / 2, Math.sqrt(dx * dx + dz * dz) / 2)) glow *= unseen(tx, y, tz, dx, dz);
    }
    const whiten = i < STEADY ? wind[i * 3 + 2] : 1;
    colours[p] = colours[p + 1] = colours[p + 2] = 0;
    colours[p + 3] = glow * (paleR + whiterR * whiten);
    colours[p + 4] = glow * (paleG + whiterG * whiten);
    colours[p + 5] = glow * (paleB + whiterB * whiten);
  }

  // The steady field. Each streak's place wraps around the pilot within the box, as the 404 scene's
  // air does in one dimension, so the field never runs out and never thins; it stays put in the
  // world as the pilot flies through it, and only the wind moves it, all of it together (driftX).
  function drawSteady(dt, pos, windAt, share, fresh, base, boost) {
    const moving = dt > 0;
    const shown = STEADY * share;
    const count = Math.min(STEADY, Math.ceil(shown));
    const before = used;
    used = count;
    for (let i = count; i < STEADY; i++) hide(i, pos);
    for (let i = 0; i < count; i++) {
      const weight = Math.min(1, shown - i);
      const k = i * 3;
      const dx = wrapCentred(seeds[k] * boxX + driftX - pos.x, boxX);
      const up = wrap(seeds[k + 1] * boxY - (pos.y - below), boxY);
      const dz = wrapCentred(seeds[k + 2] * boxZ + driftZ - pos.z, boxZ);
      const x = pos.x + dx;
      const y = pos.y - below + up;
      const z = pos.z + dz;
      if (fresh || i >= before || (moving && (i + frame) % W.resample === 0)) sample(windAt, i, x, y, z);
      const speed = Math.sqrt(wind[k] * wind[k] + wind[k + 1] * wind[k + 1]);
      const ux = speed > 0 ? wind[k] / speed : 0;
      const uz = speed > 0 ? wind[k + 1] / speed : 0;
      const half = clamp(W.stretch * speed, W.length[0], W.length[1]) / 2;
      let glow = speed > W.still ? weight * smoothstep(W.still, 2 * W.still, speed) : 0;
      if (glow > 0) {
        const breeze = W.glow[0] + W.glow[1] * speed;
        glow *= (breeze + (W.gust - breeze) * wind[k + 2]) * shine(i) * boost
          * smoothstep(0, edgeX, boxX / 2 - Math.abs(dx) - Math.abs(ux) * half)
          * smoothstep(0, edgeZ, boxZ / 2 - Math.abs(dz) - Math.abs(uz) * half)
          * smoothstep(0, edgeY, Math.min(up, boxY - up))
          * smoothstep(base, base + W.floor, y);
      }
      const p = i * 6;
      positions[p] = x - ux * half;
      positions[p + 1] = positions[p + 4] = y;
      positions[p + 2] = z - uz * half;
      positions[p + 3] = x + ux * half;
      positions[p + 5] = z + uz * half;
      light[i] = glow;
    }
  }

  // Gust fronts. A band's streaks ride with it, fixed in its own frame: across it, in from its soft
  // edges, and from just behind its front to well short of its back, crowded toward the front so
  // that the curtain is thickest at its leading edge. Up and down they wrap around the pilot in a
  // curtain, which stays put in height as the pilot climbs through it.
  function drawFronts(dt, pos, windAt, gusts, share, fresh, base, boost) {
    const moving = dt > 0;
    const live = gusts ? Math.min(SLOTS, gusts.length) : 0;
    const wanted = FRONT * share;
    for (let j = 0; j < FRONT; j++) {
      const i = STEADY + j;
      let want = -1;
      if (j < wanted) {
        for (let s = 0; s < live; s++) {
          if (gusts[s].strength > 0 && (want < 0 || score[j * SLOTS + s] > score[j * SLOTS + want])) want = s;
        }
      }
      let on = owner[j];
      // A band that has blown through, or whose slot a new band has taken, takes its streaks with it.
      if (on >= 0 && (on >= live || gusts[on].strength === 0 || gusts[on].born !== born[j])) {
        on = owner[j] = -1;
        fade[j] = 0;
      }
      let moved = false;
      if (on !== want) {
        if (on >= 0 && moving) fade[j] = Math.max(0, fade[j] - dt / W.swap);
        if (on < 0 || fade[j] === 0) {
          on = owner[j] = want;
          fade[j] = 0;
          if (on >= 0) born[j] = gusts[on].born;
          moved = true;
        }
      } else if (on >= 0 && moving) fade[j] = Math.min(1, fade[j] + dt / W.swap);
      if (on < 0) {
        hide(i, pos);
        continue;
      }
      const band = gusts[on];
      const k = i * 3;
      const behind = reach + (G.depth - 2 * reach) * seeds[k] * seeds[k];
      const aside = band.lane + (2 * seeds[k + 1] - 1) * across;
      const along = band.at - behind;
      const x = Z.x + band.ux * along - band.uz * aside;
      const z = Z.z + band.uz * along + band.ux * aside;
      const up = wrap(seeds[k + 2] * curtain - (pos.y - W.curtain[0]), curtain);
      const y = pos.y - W.curtain[0] + up;
      if (fresh || moved || (moving && (i + frame) % W.resample === 0)) sample(windAt, i, x, y, z);
      const speed = Math.sqrt(wind[k] * wind[k] + wind[k + 1] * wind[k + 1]);
      const ux = speed > 0 ? wind[k] / speed : 0;
      const uz = speed > 0 ? wind[k + 1] / speed : 0;
      const half = clamp(W.stretch * speed, W.frontLength[0], W.frontLength[1]) / 2;
      // How far the pilot is to the right of the zone centre, measured across this band.
      const abeam = (pos.z - Z.z) * band.ux - (pos.x - Z.x) * band.uz;
      let glow = speed > W.still ? W.gust * wind[k + 2] * fade[j] * smoothstep(W.still, 2 * W.still, speed) : 0;
      // The run drops a band once all of it is as far beyond the zone as it started short of it; its
      // streaks have faded out over the last stretch by then, so none is seen to vanish.
      if (glow > 0) {
        glow *= shine(i) * boost
          * (1 - smoothstep(W.window[0], W.window[1], Math.abs(aside - abeam)))
          * (1 - smoothstep(G.start - G.depth, G.start, along))
          * smoothstep(0, edgeCurtain, Math.min(up, curtain - up))
          * smoothstep(base, base + W.floor, y);
      }
      const p = i * 6;
      positions[p] = x - ux * half;
      positions[p + 1] = positions[p + 4] = y;
      positions[p + 2] = z - uz * half;
      positions[p + 3] = x + ux * half;
      positions[p + 5] = z + uz * half;
      light[i] = glow;
    }
  }

  // Each live front's leading edge: where its front line crosses the zone, as wide as the band, a
  // few metres under the pilot. It is what shows a band coming, even on a phone.
  function drawLeads(pos, gusts, level, base, boost) {
    const live = gusts ? Math.min(SLOTS, gusts.length) : 0;
    for (let s = 0; s < SLOTS; s++) {
      const i = LEADS + s;
      const band = s < live && gusts[s].strength > 0 ? gusts[s] : null;
      const chord = band ? Z.r * Z.r - band.at * band.at : 0;
      const from = chord > 0 ? Math.max(-Math.sqrt(chord), band.lane - G.half) : 0;
      const to = chord > 0 ? Math.min(Math.sqrt(chord), band.lane + G.half) : 0;
      if (!(to > from)) {
        hide(i, pos);
        continue;
      }
      const p = i * 6;
      const y = Math.max(pos.y - W.lead.drop, base);
      const x0 = Z.x + band.ux * band.at - band.uz * from;
      const z0 = Z.z + band.uz * band.at + band.ux * from;
      const x1 = Z.x + band.ux * band.at - band.uz * to;
      const z1 = Z.z + band.uz * band.at + band.ux * to;
      positions[p] = x0;
      positions[p + 1] = positions[p + 4] = y;
      positions[p + 2] = z0;
      positions[p + 3] = x1;
      positions[p + 5] = z1;
      const glow = W.lead.glow * Math.min(1, level) * leeAt(y) * boost * unseen(x0, y, z0, x1 - x0, z1 - z0);
      colours[p] = colours[p + 3] = glow * paleR;
      colours[p + 1] = colours[p + 4] = glow * paleG;
      colours[p + 2] = colours[p + 5] = glow * paleB;
    }
  }

  /**
   * Draws the air for this frame. Nothing is allocated here.
   *
   *   dt         seconds since the last frame; 0 while the map or the debug hold pauses the flight,
   *              and then nothing moves and the picture holds
   *   pos, eye   the pilot and the camera ({ x, y, z } or THREE.Vector3)
   *   windAt     (x, y, z, out) writes out.x, out.z (m/s over the ground) and out.front (0 to 1):
   *              the run's windAt, or fjordBreeze over the fjord
   *   level      1 in a run, 0.35 over the fjord (that share of the streaks), 0 anywhere else, which
   *              hides them and does no work at all
   *   floor      the height under which streaks fade out: the fog + 3 in a run, 3 over the fjord
   *   gusts      the run's gust bands (state.gusts), or null where there are none
   *   bright     true once the game has dropped its glow, to make up for it
   */
  function update(dt, pos, eye, windAt, level, floor, gusts, bright) {
    if (disposed) return;
    if (!(level > 0)) {
      // Left blank as well as hidden, so that nothing of this picture is there to be seen.
      if (awake) {
        lines.visible = false;
        colours.fill(0);
        tints.needsUpdate = true;
        awake = false;
      }
      return;
    }
    const step = dt > 0 ? dt : 0;
    // Waking up, or put somewhere else, every streak needs its wind looked up where it is now.
    const fresh = !awake || Math.abs(pos.x - lastX) > W.jump || Math.abs(pos.y - lastY) > W.jump || Math.abs(pos.z - lastZ) > W.jump;
    if (step > 0) {
      clock += step;
      frame += 1;
      // The steady field rides on the air where the pilot is, `flow` times as fast as it blows.
      windAt(pos.x, pos.y, pos.z, probe);
      driftX = wrap(driftX + probe.x * flow * step, boxX);
      driftZ = wrap(driftZ + probe.z * flow * step, boxZ);
    }
    awake = true;
    lastX = pos.x;
    lastY = pos.y;
    lastZ = pos.z;
    lines.visible = true;
    look(pos, eye);
    const share = Math.min(1, level) * (calm ? W.calm.share : 1);
    // With no floor given, nothing is cut off.
    const base = Number.isFinite(floor) ? floor : -1e9;
    const boost = bright ? W.unbloomed : 1;
    drawSteady(step, pos, windAt, share, fresh, base, boost);
    drawFronts(step, pos, windAt, gusts, share, fresh, base, boost);
    for (let i = 0; i < LEADS; i++) tint(i);
    drawLeads(pos, gusts, level, base, boost);
    places.needsUpdate = true;
    tints.needsUpdate = true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    lines.removeFromParent();
    geometry.dispose();
    material.dispose();
  }

  return { lines, update, dispose };
}
