import type { AirSample, AtmosphereSample, ThermalSource, Vector2, Vector3 } from '../flight/models.ts';
import type { WeatherField } from '../flight/atmosphere.ts';
import type { CloudWeather } from '../flight/cloud-weather.ts';
import type { CloudbaseOptions, SkyState, SkyThermal, WindLayer } from './sky.types.ts';
type SkyAirOutput = AirSample & Partial<Vector3>;
// Cloudbase's clock, air, wind, ravens and storm clouds are independent of rendering. All
// distances are metres, all rates are metres/second and all angles are radians; only step()
// advances the run, so opening the map really pauses it. A run is laid out from its seed alone:
// the same seed and the same flight always give the same sky.
import { sampleAtmosphere, thermalProfile } from '../flight/atmosphere.ts';
import { CLOUD_WEATHER, cloudWeatherAt } from '../flight/cloud-weather.ts';
import { THERMAL_FLOW, createThermalFlowState, resetThermalFlow, stepThermalFlow } from '../flight/thermal-flow.ts';
export { CLOUD_WEATHER } from '../flight/cloud-weather.ts';
export { THERMAL_FLOW as CLOUD_RAVEN_FLOW } from '../flight/thermal-flow.ts';

export const CLOUD_ZONE = Object.freeze({ x: 0, z: 80, r: 320 });
// Enter beyond the stone arch with room to cross to either windward cliff.
export const CLOUD_GATE = Object.freeze({ x: 85, y: 100, z: 280, yaw: 0 });
export const CLOUD_DEFAULT_SEED = 1;
export const CLOUD_MILESTONES = Object.freeze([500, 1000, 1500]);

// How many of each thing a run holds. The pools never grow or shrink, so the view can keep them.
// Slot 0 of the thermals is the launch column; the other four are hunted, each with its own flock.
export const CLOUD_POOL = Object.freeze({ thermals: 5, ravens: 20, clouds: 33, gusts: 4 });

// The anchored launch source stands over the safe northward valley departure. `s` is m/s across the core.
export const CLOUD_LAUNCH = Object.freeze({ x: 100, z: 285, r: 60, s: 5.5 });
export const CLOUD_OPENING = Object.freeze({ height: 450, blend: 45, r: 80, second: Object.freeze({ x: 60, z: 170 }) });
// Draw an interval once, when an opportunity is scheduled. Learning progress never enters the sky.
export const CLOUD_ENCOUNTERS = Object.freeze({
  raven: Object.freeze({ from: 500, first: Object.freeze([45, 60]), every: Object.freeze([60, 90]), high: Object.freeze([25, 40]), warning: 1, window: 3 }),
  gust: Object.freeze({ from: 500, first: Object.freeze([30, 45]), every: Object.freeze([90, 120]), high: Object.freeze([40, 60]) }),
});
export function encounterInterval(schedule: Readonly<{ from: 500; first: readonly number[]; every: readonly number[]; high: readonly number[]; }>|{ from: 700; every: readonly number[]; high: readonly number[]; }, peak: number, draw: number) {
  const amount = Math.max(0, Math.min(1, (peak - schedule.from) / (1000 - schedule.from)));
  const lo = schedule.every[0] + (schedule.high[0] - schedule.every[0]) * amount;
  const hi = schedule.every[1] + (schedule.high[1] - schedule.every[1]) * amount;
  return lo + (hi - lo) * draw;
}
// Seconds flown inside a thermal: full strength until `full`, gone at `dead`.
export const CLOUD_WEAR = Object.freeze({ full: 75, dead: 110 });

// Four drifting cells give time to centre, climb and choose the next source. They fade before
// changing wind could carry a live core outside the arena. Peak values are environmental m/s.
export const CLOUD_HUNT = Object.freeze({
  r: 60, s: 5.5, margin: 85, separation: 110, hop: 60, launchClear: 100, tries: 128, rimSteps: 360,
  life: [90, 120], bloom: 5, fade: 12, core: 0.7, peak: 1, drift: 270,
});

// Ravens ride each hunted thermal as a ladder of `flock` birds, `stack` metres tall, repeated up
// the whole column. Only the copy around the pilot exists: from `below` under the pilot upward,
// never lower than `floor`, shrinking to nothing within `edge` of either end. The ladder climbs
// at `climb` times the thermal's lift, so a climbing pilot overtakes the birds slowly. Nothing
// can strike below `grace`. Orbits are `orbit` metres wide at `speed`; a flock moves on at `cruise`,
// each bird leaving `lag` seconds after the one before and tucking in by `tuck` on the way.
export const CLOUD_RAVENS = Object.freeze({
  flock: 5, stack: 120, below: 40, floor: 200, edge: 14, grace: 500, quiet: 60,
  orbit: [9, 21], speed: 9.5, climb: 0.5, bank: 0.5, cruise: 13, lag: 0.35, tuck: 0.75, settle: 2,
});

// A strike is a raven inside a cylinder around the point `rise` above the pilot: `radius` wide and
// `half` up and down, which takes in the lines and the middle of the wing. The wing stays folded
// for `collapse` seconds with `sink` added, and nothing can strike again until `shield` runs out;
// the struck flock scatters `scatter` metres wide for as long. Cloud deeper than `cover` hides the
// pilot from the birds. `warn` marks the bird about to cross the pilot's path from above.
//
// A folded wing is pumped open: the brake held `pump.hold` seconds and let go takes `pump.cut`
// seconds off the fold, `pump.most` times at most (run-step.js counts them). Taps shorter than the
// hold, and a brake held through, do nothing: two long, deep pumps are what reopens a real wing.
// Pumped twice, a fold in a core costs 31 m at its lowest instead of 55.
export const CLOUD_STRIKE = Object.freeze({
  radius: 4.6, rise: 3, half: 4.5, collapse: 2.4, sink: 8, shield: 12, scatter: 12, cover: 0.15,
  warn: Object.freeze({ above: 25, reach: 8 }),
  pump: Object.freeze({ hold: 0.3, cut: 0.4, most: 2 }),
});

// Storm clouds drift through in layers, more of them higher up, and none just under a milestone.
// `long` is the length of a cloud's hazard and `shape` its height and depth as fractions of that,
// stretched by `tall` and `deep`. Each layer has one wind; clouds ride it in lanes up to `lane`
// either side of the zone centre and come round again every `span` metres, growing and dissolving
// over the last `seam`. Depth inside a cloud builds over the outer `edge` of its hazard; lift is
// gone by a depth of 1 / `cap`, and `sink` is added at the heart. No hazard dips below `floor`.
export const CLOUD_STORM = Object.freeze({
  layers: Object.freeze([560, 680, 800, 930, 1060, 1190, 1320, 1460, 1580, 1700]),
  counts: Object.freeze([1, 2, 3, 3, 4, 4, 4, 4, 4, 4]),
  floor: 500, jitter: 24, long: [66, 107], tall: [0.85, 1.2], deep: [0.85, 1.2],
  shape: Object.freeze({ y: 0.563, z: 0.741 }), edge: 0.3, cap: 2.5, sink: 3, wind: CLOUD_WEATHER.speed, lane: 240, span: 840, seam: 30,
});

// Modest seeded shear turns the ambient wind between cloud layers. Terrain, rather than an
// absolute-altitude switch, determines windward lift and shelter.
export const CLOUD_WIND = Object.freeze({ walk: 0.15 });

// Gusts cross the zone as straight bands that can be seen coming. The first sets off between
// `first` seconds and after that one every `every`. A band starts `start` upwind of the zone
// centre, on a line up to `lane` to either side of it, and travels at `speed` the way it blows,
// which is within `spread` of the breeze where the pilot is. It blows at `strength`, rising over
// its first `rise` and dying away over its last `fall` of `depth`, and is `half` wide to each
// side, softening over the outer `soft`.
export const CLOUD_GUST = Object.freeze({
  first: CLOUD_ENCOUNTERS.gust.first, every: CLOUD_ENCOUNTERS.gust.every, start: 410, speed: 10, strength: Object.freeze([0.8, 1.8]),
  spread: 0.35, depth: 55, rise: 12, fall: 30, half: 100, soft: 30, lane: 160,
});

// What the streaks need of this sky to draw its gust bands (wind-streaks.js): the zone they cross,
// the bands' own shape and the launch hill's lee.
export const RUN_SKY = Object.freeze({ zone: CLOUD_ZONE, gust: CLOUD_GUST });

const TAU = Math.PI * 2;
const EMPTY_THERMALS = Object.freeze([]);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const ease = (value: number) => value * value * (3 - 2 * value);
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;
const wrap = (value: number, span: number) => ((value % span) + span) % span;
// Lift across a column, 0 to 1: flat in the middle, fading over the outer share `fade` of it.
const profile = (distance: number, radius: number, fade = 0.55) => thermalProfile(distance, radius, fade);
export const cloudThermalStrength = (wear: number) => ease(clamp((CLOUD_WEAR.dead - wear) / (CLOUD_WEAR.dead - CLOUD_WEAR.full), 0, 1));
export const cloudFogSpeed = (fogHeight: number, elapsed: number) => 0.25 + 0.001 * elapsed + 0.08 * Math.max(elapsed - 300, 0);
// Advice must account for an early boundary fade without changing a cell's seeded lifetime.
export const cloudThermalRemaining = (thermal: Pick<ThermalSource, 'age' | 'life' | 'edgeFade'> = {}) => Math.max(0, Math.min(
  (thermal.life ?? Infinity) - (thermal.age ?? 0), thermal.edgeFade! >= 0 ? thermal.edgeFade! : Infinity,
));

/**
 * `hazards: false` flies the same sky with harmless ravens and no cloud, and `wind: false` flies it
 * in still air, for tests and tuning. `fixedWind: {x,z}` pins every ambient layer for repeatable
 * direction tests; wind:false overrides it. Neither option changes the wing's controls.
 */
export function createCloudbaseRun({ hazards = true, wind = true, fixedWind = null }: CloudbaseOptions = {}) {
  if (fixedWind && (!Number.isFinite(fixedWind.x) || !Number.isFinite(fixedWind.z))) throw new RangeError('invalid fixed ambient wind');
  const Z = CLOUD_ZONE;
  const L = CLOUD_LAUNCH;
  const H = CLOUD_HUNT;
  const R = CLOUD_RAVENS;
  const K = CLOUD_STRIKE;
  const S = CLOUD_STORM;
  const W = CLOUD_WIND;
  const G = CLOUD_GUST;
  // Keep this object, its pools and everything in them stable for the render loop; consumers only
  // read them. Everything is a plain number or boolean, so a run can be copied and compared.
  const state: SkyState = {
    seed: CLOUD_DEFAULT_SEED,
    rng: 0,
    elapsed: 0,
    fogHeight: 0,
    peak: 0,
    openingAt: -1,
    active: false,
    windEnabled: wind,
    ambientX: 0, ambientZ: 0,
    weather: {} as CloudWeather,
    // `x, z` is where the lift is, or where it is going while its flock is still flying there
    // from `fromX, fromZ` (`move` seconds left of `moveTime`). `strength` is what the air and the
    // view use, from 0 to 1. `dir` is the way its ravens turn: 1 is a right-hand circle.
    thermals: Array.from({ length: CLOUD_POOL.thermals }, (_, i) => ({
      x: L.x, z: L.z, r: i ? H.r : L.r, s: i ? H.s : L.s, wear: 0, age: 0, life: Infinity, strength: 0, live: false,
      move: 0, moveTime: 0, fromX: L.x, fromZ: L.z, dir: 1, rise: 0, scatter: 0,
      generation: 0, vx: 0, vz: 0, fade: i ? H.core : 0.55, edgeFade: -1,
    })),
    // `heading` reads like the pilot's yaw and `bank` is positive with the right wing down. `flap`
    // is effort, from soaring (0) to flying hard (1); `fade` is how much of the bird is there.
    ravens: Array.from({ length: CLOUD_POOL.ravens }, (_, i) => ({
      x: 0, y: 0, z: 0, heading: 0, bank: 0, flap: 0, fade: 0, hot: false, threat: false,
      thermal: 1 + Math.floor(i / R.flock), rung: i % R.flock, radius: R.orbit[0], rate: 0, angle: 0,
    })),
    // `x, y, z` is the centre of the hazard and `rx, ry, rz` its radii along the cloud's own axes,
    // which are turned by `turn` about the vertical. `fade` scales the hazard and its picture.
    clouds: Array.from({ length: CLOUD_POOL.clouds }, () => ({
      x: 0, y: 0, z: 0, rx: 1, ry: 1, rz: 1, turn: 0, cos: 1, sin: 0, fade: 0, lane: 0, along: 0, ux: 0, uz: -1, speed: 0,
      layer: 0, vx: 0, vz: 0,
    })),
    // The breeze at each cloud layer's height: how fast it blows toward the east (x) and the south (z).
    wind: Array.from({ length: S.layers.length }, (_, i) => ({ y: S.layers[i], x: 0, z: 0, shear: 0, scale: 1 })),
    // Gust bands on their way across. `strength` 0 is an empty slot. A band blows and travels
    // along `ux, uz`; its front is `at` metres past the zone centre along that line and its middle
    // `lane` to the side of it. `born` is the run time it set off.
    gusts: Array.from({ length: CLOUD_POOL.gusts }, () => ({ strength: 0, ux: 0, uz: -1, born: 0, lane: 0, at: 0 })),
    gustDue: 0,
    gustCount: 0,
    ravenDue: -1, ravenCount: 0, ravenAttack: -1, ravenAt: -Infinity,
    flow: createThermalFlowState(CLOUD_POOL.thermals),
    // `x, y, z` is where the pilot was at the last step. `collapse` and `shield` count down in
    // seconds. `cloud` is depth inside a cloud from 0 to 1, `thermal` the slot the pilot is in (or
    // -1), `danger` 1 while a raven is about to cross, and `headroom` the clear air up to a cloud
    // base overhead (999 under open sky). `gustAhead` is the metres between the pilot and the
    // next gust front that will reach them (0 inside a band, 999 when none is coming), `gustIn`
    // the seconds until it does at the speed it is closing (99 when none) and `gustSlot` which of
    // the bands that is (-1 when none).
    pilot: {
      x: CLOUD_GATE.x, y: CLOUD_GATE.y, z: CLOUD_GATE.z, collapse: 0, shield: 0, cloud: 0, cloudTime: 0, strikes: 0, thermal: -1,
      danger: 0, headroom: 999, gustAhead: 999, gustIn: 99, gustSlot: -1,
    },
  };
  const felt = { x: 0, y: 0, z: 0, front: 0, rough: 0 };
  const point = { x: 0, y: 0, z: 0 };
  const weather: WeatherField = { windX: 0, windZ: 0, thermals: state.thermals };

  // The same generator the terrain scatters its forest with, kept as a bare counter in the state
  // so that a copied run carries on exactly where the original would.
  function rand() {
    state.rng = (state.rng + 0x6d2b79f5) | 0;
    let t = Math.imul(state.rng ^ (state.rng >>> 15), 1 | state.rng);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Draws that leave the generator alone: the wind and the gusts take theirs from the seed and a
  // number, so adding them moved no thermal, raven or cloud of any sky.
  function pick(n: number) {
    let t = (state.seed ^ Math.imul(n + 1, 0x9e3779b1)) | 0;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function inside(pos: Vector2) {
    return Math.hypot(pos.x - Z.x, pos.z - Z.z) <= Z.r;
  }

  function updateLayer(level: WindLayer) {
    if (!wind || fixedWind) {
      level.x = wind && fixedWind ? fixedWind.x : 0;
      level.z = wind && fixedWind ? fixedWind.z : 0;
    } else {
      const heading = state.weather.heading + level.shear;
      const speed = clamp(state.weather.speed * level.scale, CLOUD_WEATHER.speed[0], CLOUD_WEATHER.speed[1]);
      level.x = Math.sin(heading) * speed; level.z = -Math.cos(heading) * speed;
    }
  }

  function updateWeather() {
    cloudWeatherAt(state.seed, state.elapsed, state.weather, fixedWind, wind);
    for (let i = 0; i < state.wind.length; i++) updateLayer(state.wind[i]);
    state.ambientX = state.wind[0].x; state.ambientZ = state.wind[0].z;
  }

  // The ambient breeze at a height, before local terrain and thermals: each layer's own at
  // that layer, turning evenly between neighbours, and the lowest layer's below it.
  function layerWind(y: number, out: Partial<Vector2>): Vector2 {
    const levels = state.wind;
    let i = 0;
    while (i < levels.length - 2 && y >= levels[i + 1].y) i++;
    const amount = clamp((y - levels[i].y) / (levels[i + 1].y - levels[i].y), 0, 1);
    out.x = mix(levels[i].x, levels[i + 1].x, amount);
    out.z = mix(levels[i].z, levels[i + 1].z, amount);
    return out as AtmosphereSample & Vector3;
  }

  // One environmental field for the wing, the streaks and the clouds. Bird strikes are wing
  // damage and remain a separate sink penalty; they never change the air drawn around the pilot.
  function airAt(x: number, y: number, z: number, hx: number, hz: number, out: SkyAirOutput): AtmosphereSample & Vector3 {
    point.x = x; point.y = y; point.z = z;
    out.front = 0;
    layerWind(y, out);
    weather.windX = wind && state.active ? out.x! : 0;
    weather.windZ = wind && state.active ? out.z! : 0;
    const ambientX = weather.windX!, ambientZ = weather.windZ!;
    weather.thermals = state.active && inside(point) ? state.thermals : EMPTY_THERMALS;
    let front = 0, gustRough = 0;
    const dx = x - Z.x, dz = z - Z.z;
    if (wind && state.active && y >= CLOUD_ENCOUNTERS.gust.from) for (let i = 0; i < state.gusts.length; i++) {
      const band = state.gusts[i];
      if (band.strength === 0) continue;
      const ahead = dx * band.ux + dz * band.uz - band.at;
      const aside = Math.abs(dz * band.ux - dx * band.uz - band.lane);
      if (ahead >= 0 || ahead <= -G.depth || aside >= G.half) continue;
      const blow = ease(clamp(-ahead / G.rise, 0, 1)) * ease(clamp((ahead + G.depth) / G.fall, 0, 1)) *
        (1 - ease(clamp((aside - (G.half - G.soft)) / G.soft, 0, 1)));
      weather.windX! += band.ux * band.strength * blow;
      weather.windZ! += band.uz * band.strength * blow;
      front = Math.max(front, blow);
      gustRough = Math.max(gustRough, blow * 0.35);
    }
    sampleAtmosphere(point, weather, out);
    out.ambientX = ambientX; out.ambientZ = ambientZ;
    out.front = front; out.rough = Math.max(out.rough!, gustRough);
    if (!state.active) out.windX = out.windY = out.windZ = out.lift = out.sink = out.rough = 0;
    const depth = state.active && y >= S.floor ? depthAt(x, y + K.rise, z) : 0;
    out.windY = Math.min(0, out.windY!) + Math.max(0, out.windY!) * (1 - Math.min(1, depth * S.cap)) - S.sink * depth;
    out.lift = Math.max(0, out.windY!); out.sink = Math.max(0, -out.windY!);
    out.x = out.windX; out.y = out.windY; out.z = out.windZ;
    return out as AtmosphereSample & Vector3;
  }

  function windAt(x: number, y: number, z: number, out: SkyAirOutput = {}) { return airAt(x, y, z, 0, 0, out); }

  // Sets a gust band off across the zone. The scheduled ones blow within a spread of the breeze
  // where the pilot is; gust() below sets one off by hand.
  function launch(born: number, heading: number, lane: number, strength: number) {
    let slot = state.gusts[0];
    for (let i = 0; i < state.gusts.length; i++) {
      const band = state.gusts[i];
      // An empty slot if there is one, or else the band furthest on its way out.
      if (band.strength === 0) { slot = band; break; }
      if (band.at > slot.at) slot = band;
    }
    slot.ux = Math.sin(heading);
    slot.uz = -Math.cos(heading);
    slot.born = born;
    slot.lane = lane;
    slot.strength = strength;
    slot.at = -G.start + G.speed * (state.elapsed - born);
  }

  /** Sets a gust off now along `heading` (as a yaw), `lane` metres aside of the zone centre. For tests and tuning. */
  function gust(heading: number, lane = 0, strength: number = G.strength[1]) {
    if (wind && state.active) launch(state.elapsed, heading, lane, strength);
  }

  // Moves the gust bands on, sets off any that are due, and works out which front the pilot
  // should be warned of. `vx, vz` is how fast the pilot is moving over the ground.
  function blowGusts(pos: Vector3, vx: number, vz: number) {
    const pilot = state.pilot;
    pilot.gustAhead = 999;
    pilot.gustIn = 99;
    pilot.gustSlot = -1;
    if (!wind) return;
    for (let i = 0; i < state.gusts.length; i++) {
      const band = state.gusts[i];
      if (band.strength === 0) continue;
      band.at = -G.start + G.speed * (state.elapsed - band.born);
      if (band.at - G.depth > G.start) band.strength = 0;
    }
    // Set off by the clock, not by the step that happens to notice: a long step launches every
    // band it has passed, each already as far along as it should be.
    if (state.gustDue < 0 && state.peak >= CLOUD_ENCOUNTERS.gust.from)
      state.gustDue = state.elapsed + mix(G.first[0], G.first[1], pick(4));
    while (state.gustDue >= 0 && state.elapsed >= state.gustDue) {
      const count = state.gustCount;
      layerWind(Number.isFinite(pos.y) ? pos.y : CLOUD_GATE.y, felt);
      const heading = Math.atan2(felt.x, -felt.z) + (pick(100 + 4 * count) * 2 - 1) * G.spread;
      if (pos.y >= CLOUD_ENCOUNTERS.gust.from)
        launch(state.gustDue, heading, (pick(102 + 4 * count) * 2 - 1) * G.lane, mix(G.strength[0], G.strength[1], pick(101 + 4 * count)));
      state.gustDue += encounterInterval(CLOUD_ENCOUNTERS.gust, state.peak, pick(103 + 4 * count));
      state.gustCount = count + 1;
    }
    const dx = pos.x - Z.x;
    const dz = pos.z - Z.z;
    if (pos.y < CLOUD_ENCOUNTERS.gust.from) return;
    for (let i = 0; i < state.gusts.length; i++) {
      const band = state.gusts[i];
      if (band.strength === 0 || Math.abs(dz * band.ux - dx * band.uz - band.lane) >= G.half) continue;
      const ahead = dx * band.ux + dz * band.uz - band.at;
      if (ahead <= -G.depth) continue;
      if (ahead <= 0) {
        pilot.gustAhead = pilot.gustIn = 0;
        pilot.gustSlot = i;
        continue;
      }
      // A front only arrives if it is gaining on the pilot.
      const closing = G.speed - (vx * band.ux + vz * band.uz);
      if (closing <= 0.5 || ahead >= pilot.gustAhead) continue;
      pilot.gustAhead = ahead;
      pilot.gustIn = Math.min(99, ahead / closing);
      pilot.gustSlot = i;
    }
  }

  // Births start upwind with enough room for the entire boundary fade. A changing breeze has
  // no straight endpoint forecast: runtime fading keeps the live centre inside the safe radius.
  function pickSite(i: number, first: boolean) {
    const slot = state.thermals[i];
    const reach = Z.r - H.margin - (H.drift / slot.life) * H.fade - 2;
    const speed = Math.sqrt(slot.vx * slot.vx + slot.vz * slot.vz);
    const ux = speed > 0 ? slot.vx / speed : 0, uz = speed > 0 ? slot.vz / speed : -1;
    let chosenX: number = Z.x, chosenZ: number = Z.z, best = -Infinity;
    for (let n = 0; n < H.tries * 8; n++) {
      const along = -reach + rand() * reach;
      const across = (2 * rand() - 1) * reach;
      const x = Z.x + ux * along - uz * across;
      const z = Z.z + uz * along + ux * across;
      let slack = reach - Math.hypot(x - Z.x, z - Z.z);
      slack = Math.min(slack, Math.hypot(x - L.x, z - L.z) - H.launchClear);
      if (!first) slack = Math.min(slack, Math.hypot(x - slot.fromX, z - slot.fromZ) - H.hop);
      for (let j = 1; j < state.thermals.length; j++) {
        if (j === i || (first && j >= i)) continue;
        const other = state.thermals[j];
        if (!other.live && other.generation === 0) continue;
        slack = Math.min(slack, Math.hypot(x - other.x, z - other.z) - H.separation);
      }
      if (slack > best) { best = slack; chosenX = x; chosenZ = z; }
      if (slack >= 0) break;
    }
    if (best < 0) return false;
    slot.x = chosenX; slot.z = chosenZ;
    return true;
  }

  const strengthOf = (thermal: SkyThermal, hunted: boolean) => !hunted ? cloudThermalStrength(thermal.wear) :
    ease(clamp(thermal.age / H.bloom, 0, 1)) * cloudThermalStrength(thermal.wear) * ease(clamp((thermal.life - thermal.age) / H.fade, 0, 1)) *
      (thermal.edgeFade < 0 ? 1 : ease(clamp(thermal.edgeFade / H.fade, 0, 1)));

  function cellVelocity(thermal: SkyThermal) {
    const base = state.wind[0], speed = Math.hypot(base.x, base.z);
    const scale = speed > 0 ? Math.min(1, H.drift / (thermal.life * speed)) : 0;
    thermal.vx = base.x * scale; thermal.vz = base.z * scale;
  }

  function prepareCell(i: number, first: boolean) {
    const thermal = state.thermals[i];
    // Strong wind changes drift speed, never the seeded time available to climb a source.
    thermal.life = mix(H.life[0], H.life[1], rand());
    thermal.edgeFade = -1;
    cellVelocity(thermal);
    if (!pickSite(i, first)) return false;
    thermal.generation += 1;
    return true;
  }

  function relocate(i: number) {
    const thermal = state.thermals[i];
    thermal.fromX = thermal.x; thermal.fromZ = thermal.z;
    if (!prepareCell(i, false)) {
      thermal.live = false; thermal.strength = 0; thermal.move = thermal.moveTime = 1; thermal.waiting = true;
      return;
    }
    thermal.waiting = false;
    thermal.moveTime = thermal.move = Math.hypot(thermal.x - thermal.fromX, thermal.z - thermal.fromZ) / R.cruise + R.lag * (R.flock - 1);
    thermal.live = false;
    thermal.strength = thermal.wear = thermal.age = 0;
  }

  function layoutClouds() {
    let n = 0;
    let shear = 0;
    for (let layer = 0; layer < S.layers.length; layer++) {
      const offset = (rand() * 2 - 1) * W.walk, scale = mix(0.9, 1.1, rand());
      shear = layer === 0 ? 0 : shear + offset;
      const level = state.wind[layer];
      level.shear = shear; level.scale = layer === 0 ? 1 : scale;
      updateLayer(level);
      const speed = Math.hypot(level.x, level.z);
      const ux = speed > 0 ? level.x / speed : 0, uz = speed > 0 ? level.z / speed : -1;
      const count = S.counts[layer];
      for (let i = 0; i < count; i++, n++) {
        const cloud = state.clouds[n];
        const long = mix(S.long[0], S.long[1], rand());
        cloud.rx = 0.5 * long;
        cloud.ry = 0.5 * long * S.shape.y * mix(S.tall[0], S.tall[1], rand());
        cloud.rz = 0.5 * long * S.shape.z * mix(S.deep[0], S.deep[1], rand());
        cloud.turn = rand() * TAU;
        cloud.cos = Math.cos(cloud.turn);
        cloud.sin = Math.sin(cloud.turn);
        cloud.layer = layer;
        cloud.ux = ux;
        cloud.uz = uz;
        cloud.speed = speed;
        cloud.vx = level.x; cloud.vz = level.z;
        // Lanes are staggered across the wind; clouds in one layer may still merge.
        cloud.lane = -S.lane + ((i + 0.15 + 0.7 * rand()) * 2 * S.lane) / count;
        cloud.along = rand() * S.span;
        const along = cloud.along - S.span / 2;
        cloud.x = Z.x + ux * along - uz * cloud.lane;
        cloud.z = Z.z + uz * along + ux * cloud.lane;
        cloud.y = Math.max(S.layers[layer] + (rand() - 0.5) * S.jitter, S.floor + cloud.ry);
      }
    }
  }

  // Integrate current wind, rather than rotating a position computed from wind × elapsed.
  // Both wraps lie beyond the arena; a cloud is invisible before it changes sides.
  function driftClouds(dt = 0) {
    for (let i = 0; i < state.clouds.length; i++) {
      const cloud = state.clouds[i];
      const level = state.wind[cloud.layer];
      cloud.vx = level.x; cloud.vz = level.z;
      cloud.speed = Math.hypot(level.x, level.z);
      cloud.ux = cloud.speed > 0 ? level.x / cloud.speed : 0;
      cloud.uz = cloud.speed > 0 ? level.z / cloud.speed : -1;
      const x = wrap(cloud.x - Z.x + level.x * dt + S.span / 2, S.span) - S.span / 2;
      const z = wrap(cloud.z - Z.z + level.z * dt + S.span / 2, S.span) - S.span / 2;
      cloud.x = Z.x + x; cloud.z = Z.z + z;
      cloud.fade = ease(clamp((S.span / 2 - Math.abs(x)) / S.seam, 0, 1)) *
        ease(clamp((S.span / 2 - Math.abs(z)) / S.seam, 0, 1));
    }
  }

  // How deep a point is inside cloud, from 0 at a hazard's surface to 1 well inside it.
  function depthAt(x: number, y: number, z: number) {
    let deepest = 0;
    if (!hazards || y < S.floor) return deepest;
    for (let i = 0; i < state.clouds.length; i++) {
      const cloud = state.clouds[i];
      if (cloud.fade < 0.05) continue;
      const dy = (y - cloud.y) / (cloud.ry * cloud.fade);
      if (dy <= -1 || dy >= 1) continue;
      const dx = x - cloud.x;
      const dz = z - cloud.z;
      const lx = (dx * cloud.cos - dz * cloud.sin) / (cloud.rx * cloud.fade);
      const lz = (dx * cloud.sin + dz * cloud.cos) / (cloud.rz * cloud.fade);
      const reach = Math.sqrt(lx * lx + dy * dy + lz * lz);
      if (reach < 1) deepest = Math.max(deepest, ease(clamp((1 - reach) / S.edge, 0, 1)));
    }
    return deepest;
  }

  // Clear air straight up from a point to the underside of the nearest cloud overhead.
  function headroomAt(x: number, y: number, z: number) {
    let room = 999;
    if (!hazards) return room;
    for (let i = 0; i < state.clouds.length; i++) {
      const cloud = state.clouds[i];
      if (cloud.fade < 0.05 || cloud.y < y) continue;
      const dx = x - cloud.x;
      const dz = z - cloud.z;
      const lx = (dx * cloud.cos - dz * cloud.sin) / (cloud.rx * cloud.fade);
      const lz = (dx * cloud.sin + dz * cloud.cos) / (cloud.rz * cloud.fade);
      const flat = lx * lx + lz * lz;
      if (flat < 1) room = Math.min(room, Math.max(0, cloud.y - cloud.ry * cloud.fade * Math.sqrt(1 - flat) - y));
    }
    return room;
  }

  // Moves every raven along by `dt`, for a pilot at `altitude`. Called with no time to place them.
  function flyRavens(dt: number, altitude: number) {
    const low = Math.max(altitude - R.below, R.floor, state.fogHeight + 12);
    const lagAll = R.lag * (R.flock - 1);
    for (let i = 0; i < state.ravens.length; i++) {
      const raven = state.ravens[i];
      const thermal = state.thermals[raven.thermal];
      const moving = thermal.move > 0;
      // Each bird's own journey from the old site to the new, 0 to 1, starting a little after the
      // bird before it. Mid-flight the flock draws in to a stream; a struck flock bursts apart.
      const way = moving ? clamp((thermal.moveTime - thermal.move - R.lag * raven.rung) / Math.max(1e-3, thermal.moveTime - lagAll), 0, 1) : 1;
      const eased = ease(way);
      const hump = Math.sin(Math.PI * way);
      const scare = thermal.scatter > 0 ? ease(Math.min(1, thermal.scatter / 1.5)) * ease(Math.min(1, (K.shield - thermal.scatter) / 0.4)) : 0;
      raven.angle += thermal.dir * raven.rate * dt;
      const reach = raven.radius * (1 - R.tuck * hump) + K.scatter * scare;
      const x = mix(thermal.fromX, thermal.x, eased) + Math.sin(raven.angle) * reach;
      const z = mix(thermal.fromZ, thermal.z, eased) - Math.cos(raven.angle) * reach;
      raven.heading = dt > 0 && (x !== raven.x || z !== raven.z) ? Math.atan2(x - raven.x, -(z - raven.z)) : raven.angle + (thermal.dir * Math.PI) / 2;
      raven.x = x;
      raven.z = z;
      // The ladder is the same at every height, a `stack` apart; the pilot's altitude only picks
      // which copy is here. Birds shrink away toward either end, so the join is never seen.
      raven.y = low + wrap(thermal.rise + (raven.rung * R.stack) / R.flock - low, R.stack);
      raven.fade = ease(clamp(Math.min(raven.y - low, low + R.stack - raven.y) / R.edge, 0, 1));
      raven.hot = hazards && i === state.ravenAttack && state.elapsed - state.ravenAt >= CLOUD_ENCOUNTERS.raven.warning &&
        state.elapsed - state.ravenAt < CLOUD_ENCOUNTERS.raven.warning + CLOUD_ENCOUNTERS.raven.window &&
        !moving && thermal.live && thermal.scatter === 0 && raven.fade >= 1 && altitude >= R.grace;
      raven.bank = thermal.dir * R.bank * (1 - 0.8 * hump);
      // Effort follows what the bird is doing a moment late, so a flock never changes its wingbeat
      // all at once as it leaves or lands.
      const effort = clamp(Math.max(hump, scare, thermal.live ? 1 - thermal.strength : 0), 0, 1);
      raven.flap = dt > 0 ? raven.flap + (effort - raven.flap) * Math.min(1, dt * 4) : effort;
    }
  }

  function reset(startAltitude: number = CLOUD_GATE.y, seed: number = CLOUD_DEFAULT_SEED) {
    state.seed = seed >>> 0;
    state.rng = state.seed | 0;
    state.elapsed = state.fogHeight = 0;
    state.openingAt = -1;
    state.ravenDue = -1; state.ravenCount = 0; state.ravenAttack = -1; state.ravenAt = -Infinity;
    resetThermalFlow(state.flow);
    updateWeather();
    state.peak = Number.isFinite(startAltitude) ? Math.max(0, startAltitude) : CLOUD_GATE.y;
    state.active = true;
    const pilot = state.pilot;
    pilot.x = CLOUD_GATE.x;
    pilot.y = state.peak;
    pilot.z = CLOUD_GATE.z;
    pilot.collapse = pilot.shield = pilot.cloud = pilot.cloudTime = pilot.strikes = pilot.danger = 0;
    pilot.thermal = pilot.gustSlot = -1;
    pilot.headroom = pilot.gustAhead = 999;
    pilot.gustIn = 99;
    for (let i = 0; i < state.gusts.length; i++) {
      const band = state.gusts[i];
      band.strength = band.ux = band.born = band.lane = band.at = 0;
      band.uz = -1;
    }
    state.gustCount = 0;
    state.gustDue = -1;
    const column = state.thermals[0];
    column.x = column.fromX = L.x;
    column.z = column.fromZ = L.z;
    column.wear = column.age = column.move = column.moveTime = column.rise = column.scatter = 0;
    column.life = Infinity;
    column.strength = 1;
    column.live = true;
    column.dir = 1;
    column.generation = 1; column.vx = column.vz = 0; column.edgeFade = -1;
    column.r = CLOUD_OPENING.r;
    for (const thermal of state.thermals.slice(1)) { thermal.generation = 0; thermal.live = false; }
    layoutClouds();
    state.ambientX = state.wind[0].x; state.ambientZ = state.wind[0].z;
    // Retry the whole initial layout when a greedy placement paints the last cell into a corner.
    let placed = false;
    for (let attempt = 0; attempt < 256 && !placed; attempt++) {
      placed = true;
      for (let i = 1; i < state.thermals.length; i++) {
        const thermal = state.thermals[i];
        thermal.generation = 0; thermal.live = false;
        if (i === 1) {
          thermal.life = mix(H.life[0], H.life[1], rand());
          thermal.x = CLOUD_OPENING.second.x; thermal.z = CLOUD_OPENING.second.z;
          thermal.r = CLOUD_OPENING.r; thermal.generation = 1;
          thermal.vx = thermal.vz = 0; thermal.edgeFade = -1;
        } else {
          thermal.r = H.r;
          if (!prepareCell(i, true)) { placed = false; break; }
        }
        thermal.fromX = thermal.x; thermal.fromZ = thermal.z;
        thermal.age = H.bloom;
        thermal.wear = thermal.move = thermal.moveTime = thermal.scatter = 0;
        thermal.waiting = false;
        thermal.live = true;
        const drawnDir = rand() < 0.5 ? 1 : -1;
        // Teach one safe direction through the opening transfer. Consume the same seeded
        // draw so later flocks, cell positions and weather retain their independent layout.
        thermal.dir = i === 1 ? -(Math.sign(state.ambientX) || -1) : drawnDir;
        thermal.rise = rand() * R.stack;
        thermal.strength = strengthOf(thermal, true);
        if (i === 1) { thermal.age = 0; thermal.strength = 1; }
      }
    }
    if (!placed) throw new Error('This seeded sky has no safe thermal layout');
    for (let i = 0; i < state.ravens.length; i++) {
      const raven = state.ravens[i];
      raven.radius = mix(R.orbit[0], R.orbit[1], (raven.rung * 0.618034 + rand()) % 1);
      raven.rate = R.speed / raven.radius;
      raven.angle = rand() * TAU;
      raven.x = raven.z = raven.flap = 0;
      raven.threat = false;
    }
    driftClouds();
    flyRavens(0, pilot.y);
  }

  function finish() {
    state.active = false;
    // Nothing of the last moment may outlive the run: the flight carries on after it.
    const pilot = state.pilot;
    pilot.collapse = pilot.shield = pilot.cloud = pilot.danger = 0;
    pilot.thermal = pilot.gustSlot = -1;
    pilot.gustAhead = 999;
    pilot.gustIn = 99;
    for (let i = 0; i < state.ravens.length; i++) state.ravens[i].threat = false;
  }

  /** Folds the wing. `index` is the raven that did it, whose flock scatters; -1 strikes from nowhere. */
  function strike(index = -1) {
    const pilot = state.pilot;
    if (!state.active || pilot.shield > 0) return false;
    pilot.collapse = K.collapse;
    pilot.shield = K.shield;
    pilot.strikes += 1;
    for (let i = 0; i < state.ravens.length; i++) {
      const raven = state.ravens[i];
      raven.threat = false;
      if (index >= 0 && raven.thermal === state.ravens[index].thermal) raven.hot = false;
    }
    pilot.danger = 0;
    if (index >= 0) state.thermals[state.ravens[index].thermal].scatter = K.shield;
    return true;
  }

  /** Brings a folded wing open `seconds` sooner (a pump of the brake); never past open. The shield stays. */
  function reopen(seconds: number) {
    const pilot = state.pilot;
    if (!state.active || !(pilot.collapse > 0) || !(seconds > 0)) return false;
    pilot.collapse = Math.max(0, pilot.collapse - seconds);
    return true;
  }

  // Optional physical eligibility comes from the shared run step, never the coach or lessons.
  function step(dt: number, pos: Vector3, context?: {flowEligible?: boolean}): string | null {
    if (!state.active || !Number.isFinite(dt) || dt <= 0) return null;
    state.elapsed += dt;
    updateWeather();
    // Movement is stepped by the caller before this clock, so the final climb counts as well.
    if (Number.isFinite(pos.y)) state.peak = Math.max(state.peak, pos.y);
    if (state.openingAt < 0 && state.peak >= CLOUD_OPENING.height) {
      state.openingAt = state.elapsed;
      for (let i = 0; i < 2; i++) {
        const t = state.thermals[i];
        t.age = t.wear = 0; t.edgeFade = -1;
      }
    }
    const opening = state.openingAt < 0 ? 0 : ease(clamp((state.elapsed - state.openingAt) / CLOUD_OPENING.blend, 0, 1));
    state.fogHeight += cloudFogSpeed(state.fogHeight, state.elapsed) * dt;
    const pilot = state.pilot;
    // How fast the pilot is moving, from where they were a step ago; a leap is not a speed.
    let vx = (pos.x - pilot.x) / dt;
    let vz = (pos.z - pilot.z) / dt;
    if (!(Math.hypot(vx, vz) < 40)) vx = vz = 0;
    pilot.x = pos.x;
    pilot.y = pos.y;
    pilot.z = pos.z;
    pilot.collapse = Math.max(0, pilot.collapse - dt);
    pilot.shield = Math.max(0, pilot.shield - dt);

    blowGusts(pos, vx, vz);
    driftClouds(dt);
    const chest = pos.y + K.rise;
    pilot.cloud = pos.y >= S.floor ? depthAt(pos.x, chest, pos.z) : 0;
    pilot.headroom = headroomAt(pos.x, chest, pos.z);
    if (pilot.cloud > 0) pilot.cloudTime += dt;

    const within = inside(pos);
    pilot.thermal = -1;
    for (let i = 0; i < state.thermals.length; i++) {
      const thermal = state.thermals[i];
      if (i < 2) thermal.r = mix(CLOUD_OPENING.r, i ? H.r : L.r, opening);
      if (thermal.move > 0) {
        thermal.move = Math.max(0, thermal.move - dt);
        thermal.scatter = Math.max(0, thermal.scatter - dt);
        if (thermal.move === 0 && thermal.waiting) { relocate(i); continue; }
        if (thermal.move === 0) {
          // The last raven is in: the lift starts here now.
          thermal.live = true;
          thermal.fromX = thermal.x;
          thermal.fromZ = thermal.z;
        }
        continue;
      }
      if (!thermal.live) continue;
      const here = within && Math.hypot(pos.x - thermal.x, pos.z - thermal.z) < thermal.r;
      if (here) pilot.thermal = i;
      if (i < 2 && state.openingAt < 0) {
        thermal.vx = thermal.vz = thermal.wear = thermal.age = 0;
        thermal.strength = 1;
        if (i) thermal.rise += R.climb * thermal.s * dt;
        continue;
      }
      if (i > 0) {
        cellVelocity(thermal);
        if (i === 1) { thermal.vx *= opening; thermal.vz *= opening; }
        const maximumSpeed = H.drift / thermal.life;
        if (thermal.edgeFade < 0 && Math.hypot(thermal.x - Z.x, thermal.z - Z.z) + maximumSpeed * dt >=
          Z.r - H.margin - maximumSpeed * H.fade) thermal.edgeFade = H.fade;
        thermal.x += thermal.vx * dt; thermal.z += thermal.vz * dt;
        thermal.age += dt;
        if (thermal.edgeFade >= 0) thermal.edgeFade = Math.max(0, thermal.edgeFade - dt);
      }
      // Lift is used up by flying in it, though not while a cloud is holding the pilot down. A
      // hunted thermal that has begun to weaken burns out by itself, so none is left as a decoy.
      if ((here && pilot.cloud === 0) || (i > 0 && thermal.wear >= CLOUD_WEAR.full)) thermal.wear = Math.min(CLOUD_WEAR.dead, thermal.wear + dt);
      thermal.strength = i < 2 ? mix(1, strengthOf(thermal, i > 0), opening) : strengthOf(thermal, true);
      if (i > 0) {
        thermal.rise += R.climb * thermal.s * thermal.strength * dt;
        thermal.scatter = Math.max(0, thermal.scatter - dt);
        if (thermal.wear >= CLOUD_WEAR.dead || thermal.age >= thermal.life || thermal.edgeFade === 0) {
          relocate(i);
          // Its `x, z` is already somewhere else: the pilot is not in it any more.
          if (pilot.thermal === i) pilot.thermal = -1;
        }
      } else if (thermal.strength === 0) thermal.live = false;
    }

    stepThermalFlow(state.flow, dt, pos, state.thermals, vx, vz,
      context?.flowEligible !== false && within && pilot.collapse === 0 && pilot.shield === 0 && pilot.cloud < K.cover);
    const encounter = CLOUD_ENCOUNTERS.raven;
    if (hazards && state.ravenDue < 0 && state.peak >= encounter.from)
      state.ravenDue = state.elapsed + mix(encounter.first[0], encounter.first[1], pick(7000));
    if (state.elapsed - state.ravenAt >= encounter.warning + encounter.window || pos.y < encounter.from || pilot.shield > 0)
      state.ravenAttack = -1;
    // Spend a seeded interval faster only during sustained opposing traffic. Warning and
    // collision windows still use real elapsed time, including their full one-second lead.
    if (hazards && pos.y >= encounter.from && state.ravenDue >= 0 && state.ravenAttack < 0 &&
        state.flow.pressure && state.flow.sense < 0)
      state.ravenDue -= dt * (THERMAL_FLOW.pressureRate - 1);
    if (state.ravenDue >= 0 && state.elapsed >= state.ravenDue) {
      // A missed or unsafe opportunity is spent too; never retry it on every frame.
      state.ravenAttack = -1;
      if (pos.y >= encounter.from && pilot.shield === 0 && pilot.cloud < K.cover) {
        let nearest = Infinity;
        for (let i = 0; i < state.ravens.length; i++) {
          const bird = state.ravens[i], t = state.thermals[bird.thermal];
          const reach = Math.hypot(bird.x - pos.x, bird.z - pos.z);
          if (t.live && !t.move && !t.scatter && reach < nearest) { nearest = reach; state.ravenAttack = i; }
        }
        state.ravenAt = state.elapsed;
      }
      state.ravenDue = state.elapsed + encounterInterval(encounter, state.peak, pick(7001 + state.ravenCount++));
    }
    flyRavens(dt, pos.y);
    const exposed = pilot.shield === 0 && pilot.cloud < K.cover;
    let striker = -1;
    pilot.danger = 0;
    for (let i = 0; i < state.ravens.length; i++) {
      const raven = state.ravens[i];
      const above = raven.y - chest;
      const flat = Math.hypot(raven.x - pos.x, raven.z - pos.z);
      // Marked from well above until it is below the reach of a strike, not just until it is level.
      raven.threat = exposed && i === state.ravenAttack && pos.y >= encounter.from &&
        state.elapsed - state.ravenAt < encounter.warning + encounter.window;
      if (raven.threat) pilot.danger = 1;
      if (striker < 0 && exposed && raven.hot && Math.abs(above) < K.half && flat < K.radius) striker = i;
    }
    if (striker >= 0) strike(striker);

    if (pos.y <= state.fogHeight + 3) {
      finish();
      return 'fog';
    }
    return null;
  }

  /**
   * The air where the pilot is, heading `yaw`. `windX, windZ` is its own movement, breeze and gusts
   * together, and `rough` how much of a gust band is on the glider's tail, from 0 to 1. Pass `out`
   * to have the answer written into an object of the caller's instead of a new one.
   */
  function sample(pos: Vector3, yaw = 0, out: SkyAirOutput = {}): AirSample {
    airAt(pos.x, pos.y, pos.z, Math.sin(yaw), -Math.cos(yaw), out);
    out.hazardSink = state.active && state.pilot.collapse > 0 ? K.sink : 0;
    let side = 0, rising = 0;
    for (let i = 0; i < state.thermals.length; i++) {
      const t = state.thermals[i];
      if (!t.live || !inside(pos)) continue;
      const lift = t.s * t.strength * profile(Math.hypot(pos.x - t.x, pos.z - t.z), t.r, t.fade);
      const right = (t.x - pos.x) * Math.cos(yaw) + (t.z - pos.z) * Math.sin(yaw);
      side += lift * right / t.r; rising += lift;
    }
    out.liftSide = rising > 0 ? clamp(side / rising, -1, 1) : 0;
    return out as AtmosphereSample & Vector3;
  }

  return { reset, step, sample, inside, depthAt, windAt, gust, strike, reopen, finish, get state() { return state; } };
}
