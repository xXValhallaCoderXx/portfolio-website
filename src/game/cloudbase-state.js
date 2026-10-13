// Cloudbase's clock, air, ravens and storm clouds are independent of rendering. All distances are
// metres, all rates are metres/second and all angles are radians; only step() advances the run,
// so opening the map really pauses it. A run is laid out from its seed alone: the same seed and
// the same flight always give the same sky.
export const CLOUD_ZONE = Object.freeze({ x: 125, z: 238, r: 135 });
export const CLOUD_GATE = Object.freeze({ x: 85, y: 80, z: 320, yaw: Math.PI / 2 });
export const CLOUD_DEFAULT_SEED = 1;
export const CLOUD_MILESTONES = Object.freeze([500, 1000, 1500]);

// How many of each thing a run holds. The pools never grow or shrink, so the view can keep them.
// Slot 0 of the thermals is the launch column; the other two are hunted, each with its own flock.
export const CLOUD_POOL = Object.freeze({ thermals: 3, ravens: 10, clouds: 33 });

// The launch column lifts the pilot clear of the east-shore hillside. `s` is m/s across the core.
export const CLOUD_LAUNCH = Object.freeze({ x: 125, z: 320, r: 34, s: 17 });
// Seconds flown inside a thermal: full strength until `full`, gone at `dead`.
export const CLOUD_WEAR = Object.freeze({ full: 16, dead: 26 });

// Hunted thermals: hidden, two at a time, found by the ravens circling in them. `margin` keeps a
// whole column inside the zone, `separation` is between the two sites, `hop` between a thermal's
// old site and its next, and `launchClear` keeps the flocks out of the launch climb. A thermal
// lives `life` seconds, taking `bloom` to start and `fade` to die of old age.
export const CLOUD_HUNT = Object.freeze({
  r: 38, s: 18, margin: 42, separation: 85, hop: 80, launchClear: 62, tries: 24, rimSteps: 120,
  life: [50, 66], bloom: 4, fade: 8,
});

// Ravens ride each hunted thermal as a ladder of `flock` birds, `stack` metres tall, repeated up
// the whole column. Only the copy around the pilot exists: from `below` under the pilot upward,
// never lower than `floor`, shrinking to nothing within `edge` of either end. The ladder climbs
// at `climb` times the thermal's lift, so a climbing pilot overtakes the birds slowly. Nothing
// can strike below `grace`. Orbits are `orbit` metres wide at `speed`; a flock moves on at `cruise`,
// each bird leaving `lag` seconds after the one before and tucking in by `tuck` on the way.
export const CLOUD_RAVENS = Object.freeze({
  flock: 5, stack: 120, below: 40, floor: 200, edge: 14, grace: 260,
  orbit: [9, 21], speed: 9.5, climb: 0.5, bank: 0.5, cruise: 13, lag: 0.35, tuck: 0.75, settle: 2,
});

// A strike is a raven inside a cylinder around the point `rise` above the pilot: `radius` wide and
// `half` up and down, which takes in the lines and the middle of the wing. The wing stays folded
// for `collapse` seconds with `sink` added, and nothing can strike again until `shield` runs out;
// the struck flock scatters `scatter` metres wide for as long. Cloud deeper than `cover` hides the
// pilot from the birds. `warn` marks the bird about to cross the pilot's path from above.
export const CLOUD_STRIKE = Object.freeze({
  radius: 4.6, rise: 3, half: 4.5, collapse: 2.4, sink: 26, shield: 8, scatter: 12, cover: 0.15,
  warn: Object.freeze({ above: 25, reach: 8 }),
});

// Storm clouds drift through in layers, more of them higher up, and none just under a milestone.
// `long` is the length of a cloud's hazard and `shape` its height and depth as fractions of that,
// stretched by `tall` and `deep`. Each layer has one wind; clouds ride it in lanes up to `lane`
// either side of the zone centre and come round again every `span` metres, growing and dissolving
// over the last `seam`. Depth inside a cloud builds over the outer `edge` of its hazard; lift is
// gone by a depth of 1 / `cap`, and `sink` is added at the heart. No hazard dips below `floor`.
export const CLOUD_STORM = Object.freeze({
  layers: Object.freeze([580, 730, 870, 1060, 1180, 1290, 1380, 1560, 1670, 1770]),
  counts: Object.freeze([2, 2, 3, 3, 3, 4, 4, 4, 4, 4]),
  floor: 530, jitter: 24, long: [66, 107], tall: [0.85, 1.2], deep: [0.85, 1.2],
  shape: Object.freeze({ y: 0.563, z: 0.741 }), edge: 0.3, cap: 2.5, sink: 6, wind: [2.5, 5], lane: 100, span: 440, seam: 30,
});

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ease = (value) => value * value * (3 - 2 * value);
const mix = (from, to, amount) => from + (to - from) * amount;
const wrap = (value, span) => ((value % span) + span) % span;
const profile = (distance, radius) => ease(clamp((radius - distance) / (radius * 0.55), 0, 1));
export const cloudThermalStrength = (wear) => ease(clamp((CLOUD_WEAR.dead - wear) / (CLOUD_WEAR.dead - CLOUD_WEAR.full), 0, 1));
export const cloudFogSpeed = (fogHeight, elapsed) => 1.2 + 0.002 * fogHeight + 0.035 * elapsed + 0.95 * Math.max(elapsed - 110, 0);

/** `hazards: false` flies the same sky with harmless ravens and no cloud, for tests and tuning. */
export function createCloudbaseRun({ hazards = true } = {}) {
  const Z = CLOUD_ZONE;
  const L = CLOUD_LAUNCH;
  const H = CLOUD_HUNT;
  const R = CLOUD_RAVENS;
  const K = CLOUD_STRIKE;
  const S = CLOUD_STORM;
  // Keep this object, its pools and everything in them stable for the render loop; consumers only
  // read them. Everything is a plain number or boolean, so a run can be copied and compared.
  const state = {
    seed: CLOUD_DEFAULT_SEED,
    rng: 0,
    elapsed: 0,
    fogHeight: 0,
    peak: 0,
    active: false,
    // `x, z` is where the lift is, or where it is going while its flock is still flying there
    // from `fromX, fromZ` (`move` seconds left of `moveTime`). `strength` is what the air and the
    // view use, from 0 to 1. `dir` is the way its ravens turn: 1 is a right-hand circle.
    thermals: Array.from({ length: CLOUD_POOL.thermals }, (_, i) => ({
      x: L.x, z: L.z, r: i ? H.r : L.r, s: i ? H.s : L.s, wear: 0, age: 0, life: Infinity, strength: 0, live: false,
      move: 0, moveTime: 0, fromX: L.x, fromZ: L.z, dir: 1, rise: 0, scatter: 0,
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
    })),
    // `collapse` and `shield` count down in seconds. `cloud` is depth inside a cloud from 0 to 1,
    // `thermal` the slot the pilot is in (or -1), `danger` 1 while a raven is about to cross, and
    // `headroom` the clear air up to a cloud base overhead (999 under open sky).
    pilot: { y: CLOUD_GATE.y, collapse: 0, shield: 0, cloud: 0, cloudTime: 0, strikes: 0, thermal: -1, danger: 0, headroom: 999 },
  };

  // The same generator the terrain scatters its forest with, kept as a bare counter in the state
  // so that a copied run carries on exactly where the original would.
  function rand() {
    state.rng = (state.rng + 0x6d2b79f5) | 0;
    let t = Math.imul(state.rng ^ (state.rng >>> 15), 1 | state.rng);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function inside(pos) {
    return Math.hypot(pos.x - Z.x, pos.z - Z.z) <= Z.r;
  }

  // How far a candidate site is from breaking a rule, in metres; zero or more means it fits.
  function slackAt(i, x, z, first, otherPlaced) {
    const slot = state.thermals[i];
    const other = state.thermals[3 - i];
    let slack = Math.hypot(x - L.x, z - L.z) - H.launchClear;
    if (otherPlaced) slack = Math.min(slack, Math.hypot(x - other.x, z - other.z) - H.separation);
    if (!first) slack = Math.min(slack, Math.hypot(x - slot.fromX, z - slot.fromZ) - H.hop);
    return slack;
  }

  function pickSite(i, first, otherPlaced) {
    const reach = Z.r - H.margin;
    let bestX = Z.x;
    let bestZ = Z.z;
    let best = -Infinity;
    for (let n = 0; n < H.tries && best < 0; n++) {
      const radius = reach * Math.sqrt(rand());
      const angle = rand() * TAU;
      const x = Z.x + Math.sin(angle) * radius;
      const z = Z.z + Math.cos(angle) * radius;
      const slack = slackAt(i, x, z, first, otherPlaced);
      if (slack > best) [bestX, bestZ, best] = [x, z, slack];
    }
    if (best < 0) {
      // Somewhere on the rim always fits these distances: do not widen them without checking.
      const start = rand() * TAU;
      for (let n = 0; n < H.rimSteps && best < 0; n++) {
        const angle = start + (n * TAU) / H.rimSteps;
        const x = Z.x + Math.sin(angle) * reach;
        const z = Z.z + Math.cos(angle) * reach;
        const slack = slackAt(i, x, z, first, otherPlaced);
        if (slack > best) [bestX, bestZ, best] = [x, z, slack];
      }
    }
    state.thermals[i].x = bestX;
    state.thermals[i].z = bestZ;
  }

  const strengthOf = (thermal, hunted) => !hunted ? cloudThermalStrength(thermal.wear) :
    ease(clamp(thermal.age / H.bloom, 0, 1)) * cloudThermalStrength(thermal.wear) * ease(clamp((thermal.life - thermal.age) / H.fade, 0, 1));

  // A spent thermal starts again somewhere else, and its ravens set off for the new place at once.
  function relocate(i) {
    const thermal = state.thermals[i];
    thermal.fromX = thermal.x;
    thermal.fromZ = thermal.z;
    pickSite(i, false, true);
    thermal.moveTime = thermal.move = Math.hypot(thermal.x - thermal.fromX, thermal.z - thermal.fromZ) / R.cruise + R.lag * (R.flock - 1);
    thermal.live = false;
    // A flock still scattered from a strike keeps settling on the way; snapping it back would
    // jump every bird by metres in a single step.
    thermal.strength = thermal.wear = thermal.age = 0;
    thermal.life = mix(H.life[0], H.life[1], rand());
  }

  function layoutClouds() {
    let n = 0;
    for (let layer = 0; layer < S.layers.length; layer++) {
      const heading = rand() * TAU;
      const speed = mix(S.wind[0], S.wind[1], rand());
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
        cloud.ux = Math.sin(heading);
        cloud.uz = -Math.cos(heading);
        cloud.speed = speed;
        // Lanes are staggered across the wind; clouds in one layer may still merge.
        cloud.lane = -S.lane + ((i + 0.15 + 0.7 * rand()) * 2 * S.lane) / count;
        cloud.along = rand() * S.span;
        cloud.y = Math.max(S.layers[layer] + (rand() - 0.5) * S.jitter, S.floor + cloud.ry);
      }
    }
  }

  // Where every cloud is now: a straight drift along its layer's wind, coming round again far
  // enough outside the zone that a cloud is never seen to appear or vanish over the pilot.
  function driftClouds() {
    for (let i = 0; i < state.clouds.length; i++) {
      const cloud = state.clouds[i];
      const along = wrap(cloud.along + cloud.speed * state.elapsed, S.span) - S.span / 2;
      cloud.x = Z.x + cloud.ux * along - cloud.uz * cloud.lane;
      cloud.z = Z.z + cloud.uz * along + cloud.ux * cloud.lane;
      cloud.fade = ease(clamp((S.span / 2 - Math.abs(along)) / S.seam, 0, 1));
    }
  }

  // How deep a point is inside cloud, from 0 at a hazard's surface to 1 well inside it.
  function depthAt(x, y, z) {
    let deepest = 0;
    if (!hazards) return deepest;
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
  function headroomAt(x, y, z) {
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
  function flyRavens(dt, altitude) {
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
      raven.hot = hazards && !moving && thermal.live && thermal.age >= R.settle && thermal.scatter === 0 && raven.fade >= 1 && altitude >= R.grace;
      raven.bank = thermal.dir * R.bank * (1 - 0.8 * hump);
      // Effort follows what the bird is doing a moment late, so a flock never changes its wingbeat
      // all at once as it leaves or lands.
      const effort = clamp(Math.max(hump, scare, thermal.live ? 1 - thermal.strength : 0), 0, 1);
      raven.flap = dt > 0 ? raven.flap + (effort - raven.flap) * Math.min(1, dt * 4) : effort;
    }
  }

  function reset(startAltitude = CLOUD_GATE.y, seed = CLOUD_DEFAULT_SEED) {
    state.seed = seed >>> 0;
    state.rng = state.seed | 0;
    state.elapsed = state.fogHeight = 0;
    state.peak = Number.isFinite(startAltitude) ? Math.max(0, startAltitude) : CLOUD_GATE.y;
    state.active = true;
    const pilot = state.pilot;
    pilot.y = state.peak;
    pilot.collapse = pilot.shield = pilot.cloud = pilot.cloudTime = pilot.strikes = pilot.danger = 0;
    pilot.thermal = -1;
    pilot.headroom = 999;
    const launch = state.thermals[0];
    launch.x = launch.fromX = L.x;
    launch.z = launch.fromZ = L.z;
    launch.wear = launch.age = launch.move = launch.moveTime = launch.rise = launch.scatter = 0;
    launch.life = Infinity;
    launch.strength = 1;
    launch.live = true;
    launch.dir = 1;
    // The order of these draws is part of what a seed means.
    for (let i = 1; i < state.thermals.length; i++) {
      const thermal = state.thermals[i];
      pickSite(i, true, i === 2);
      thermal.fromX = thermal.x;
      thermal.fromZ = thermal.z;
      // Both are already rising when the run starts, so the first ravens are in the sky at once.
      thermal.age = H.bloom;
      thermal.wear = thermal.move = thermal.moveTime = thermal.scatter = 0;
      thermal.life = mix(H.life[0], H.life[1], rand());
      thermal.live = true;
      thermal.dir = rand() < 0.5 ? 1 : -1;
      thermal.rise = rand() * R.stack;
      thermal.strength = strengthOf(thermal, true);
    }
    for (let i = 0; i < state.ravens.length; i++) {
      const raven = state.ravens[i];
      raven.radius = mix(R.orbit[0], R.orbit[1], (raven.rung * 0.618034 + rand()) % 1);
      raven.rate = R.speed / raven.radius;
      raven.angle = rand() * TAU;
      raven.x = raven.z = raven.flap = 0;
      raven.threat = false;
    }
    layoutClouds();
    driftClouds();
    flyRavens(0, pilot.y);
  }

  function finish() {
    state.active = false;
    // Nothing of the last moment may outlive the run: the flight carries on after it.
    const pilot = state.pilot;
    pilot.collapse = pilot.shield = pilot.cloud = pilot.danger = 0;
    pilot.thermal = -1;
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

  function step(dt, pos) {
    if (!state.active || !Number.isFinite(dt) || dt <= 0) return null;
    state.elapsed += dt;
    // Movement is stepped by the caller before this clock, so the final climb counts as well.
    if (Number.isFinite(pos.y)) state.peak = Math.max(state.peak, pos.y);
    state.fogHeight += cloudFogSpeed(state.fogHeight, state.elapsed) * dt;
    const pilot = state.pilot;
    pilot.y = pos.y;
    pilot.collapse = Math.max(0, pilot.collapse - dt);
    pilot.shield = Math.max(0, pilot.shield - dt);

    driftClouds();
    const chest = pos.y + K.rise;
    pilot.cloud = depthAt(pos.x, chest, pos.z);
    pilot.headroom = headroomAt(pos.x, chest, pos.z);
    if (pilot.cloud > 0) pilot.cloudTime += dt;

    const within = inside(pos);
    pilot.thermal = -1;
    for (let i = 0; i < state.thermals.length; i++) {
      const thermal = state.thermals[i];
      if (thermal.move > 0) {
        thermal.move = Math.max(0, thermal.move - dt);
        thermal.scatter = Math.max(0, thermal.scatter - dt);
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
      if (i > 0) {
        // A thermal only grows old while the other one is still good, so the sky is never left
        // without lift. Once it has started to fade, it finishes.
        const other = state.thermals[3 - i];
        const spare = other.move === 0 && other.age >= H.bloom && other.age <= other.life - H.fade && other.wear < CLOUD_WEAR.full;
        const brink = thermal.life - H.fade;
        if (spare || thermal.age > brink || thermal.age + dt <= brink) thermal.age += dt;
      }
      // Lift is used up by flying in it, though not while a cloud is holding the pilot down. A
      // hunted thermal that has begun to weaken burns out by itself, so none is left as a decoy.
      if ((here && pilot.cloud === 0) || (i > 0 && thermal.wear >= CLOUD_WEAR.full)) thermal.wear = Math.min(CLOUD_WEAR.dead, thermal.wear + dt);
      thermal.strength = strengthOf(thermal, i > 0);
      if (i > 0) {
        thermal.rise += R.climb * thermal.s * thermal.strength * dt;
        thermal.scatter = Math.max(0, thermal.scatter - dt);
        if (thermal.wear >= CLOUD_WEAR.dead || thermal.age >= thermal.life) {
          relocate(i);
          // Its `x, z` is already somewhere else: the pilot is not in it any more.
          if (pilot.thermal === i) pilot.thermal = -1;
        }
      } else if (thermal.strength === 0) thermal.live = false;
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
      raven.threat = exposed && raven.hot && above >= -K.half && above <= K.warn.above && flat < K.warn.reach;
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

  function sample(pos, yaw = 0) {
    if (!state.active) return { lift: 0, sink: 0, liftSide: 0 };
    const collapsed = state.pilot.collapse > 0;
    const depth = depthAt(pos.x, pos.y + K.rise, pos.z);
    // A folded wing and a storm cloud pull down wherever they are; lift only exists in the zone.
    const sink = S.sink * depth + (collapsed ? K.sink : 0);
    if (!inside(pos)) return { lift: 0, sink, liftSide: 0 };
    let lift = 0;
    let side = 0;
    for (let i = 0; i < state.thermals.length; i++) {
      const thermal = state.thermals[i];
      if (!thermal.live || thermal.strength === 0) continue;
      const rising = thermal.s * thermal.strength * profile(Math.hypot(pos.x - thermal.x, pos.z - thermal.z), thermal.r);
      const right = (thermal.x - pos.x) * Math.cos(yaw) + (thermal.z - pos.z) * Math.sin(yaw);
      lift += rising;
      side += (rising * right) / thermal.r;
    }
    const open = collapsed ? 0 : 1 - Math.min(1, depth * S.cap);
    return { lift: lift * open, sink, liftSide: lift > 0 ? clamp(side / lift, -1, 1) : 0 };
  }

  return { reset, step, sample, inside, depthAt, strike, finish, get state() { return state; } };
}
