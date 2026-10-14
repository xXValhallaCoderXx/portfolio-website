// How the glider flies: heading, bank, airspeed, sink, the brake, the speed bar and the stall.
// Kept free of 3D and page code so the whole of it can be flown in a test. All distances are
// metres, times seconds, speeds metres/second, angles radians and turn rates radians/second.
// Yaw 0 faces north (-z) and grows clockwise, so a positive yaw rate is a right turn.
//
// With the brake and the bar untouched and no wind, this is exactly the flight the game has
// always had: about 41 km/h and a 9.6:1 glide at trim, close to a real wing.

const GRAVITY = 9.81;

export const FLIGHT = Object.freeze({
  // Airspeed: hands up, full speed bar, light brake (where the wing sinks least), deep brake, and
  // what a stalled wing keeps.
  speed: Object.freeze({ trim: 11.5, bar: 16, light: 8.6, deep: 6.5, stall: 3 }),
  // Sink follows airspeed on one curve through `least` (at the light-brake speed) and `trim`, which
  // also gives 2.3 on the bar. `deep` is the sink at full brake: a mushing, near-vertical descent.
  // `turn` is the extra sink per rad/s of turn at trim speed.
  sink: Object.freeze({ least: 1.0, trim: 1.2, deep: 7.0, turn: 0.8 }),
  // The turn rate full steering gives in each state. `hook` is the share of a full turn a wing
  // folded by a raven keeps, hooking round the way it was already going.
  turn: Object.freeze({ trim: 0.8, bar: 0.6, light: 1.05, deep: 0.65, hook: 0.6 }),
  // How quickly each thing settles, per second. `stall` is airspeed falling away in a stall and
  // `bar` how fast the speed bar comes on and off.
  ease: Object.freeze({ yaw: 3.2, bank: 4, speed: 1.6, climb: 2.5, stall: 4, bar: 4 }),
  // Bank shown per rad/s of turn at trim speed.
  bank: 0.75,
  // The share of airspeed given up that comes back as height, and is paid again to regain it: a
  // small lift as the brake goes on, and no height to be had from pumping it.
  swap: 0.5,
});

// One brake, deeper the longer it is held. Depth runs 0 to 1: it is taken up to `light` at
// `take` per second, lingers on the way to `shelf` (for `linger.run` seconds in a Cloudbase run,
// where the light brake is a tool for circling tight, and `linger.fjord` otherwise, where the
// brake is mostly the way down), then is pulled deep at `pull`. Let go, it falls at `dump` until
// it is back at `light` and at `release` after that, so the briefest tap returns a deep brake to
// a light one and starts its linger again.
export const BRAKE = Object.freeze({
  light: 0.35, shelf: 0.5, take: 1.75, linger: Object.freeze({ fjord: 0.6, run: 8 }), pull: 1.0, release: 2.5, dump: 10,
});

// The stall. The wing lets go when its slower half runs out of airspeed: `felt` is the airspeed
// less `arm` for each rad/s of turn (the inside wing flies slower) and less `rough` in a gust
// from behind. While the brake is held and `felt` is under `safe` the load fills, at `fill` per
// second when `felt` is down at `slow` and at most `cap` times that; it only drains, at `drain`,
// once the wing is flying again. `rough` must stay under the margin a light-braked circle has
// (8.6 - 1.05 - 7.2 = 0.35), so that a gust alone never loads a light brake.
//
// At a full load the wing stalls for `time` seconds and then surges for `surge` more before the
// controls come back; with the brake let go all of it runs `letGo` times faster. Turning harder
// than `spin`, the inside wing goes first and the glider spins toward it at `yaw`. A stall adds
// `sink` and, where it is harsh, loses the share `cut` of any lift. A forgiving stall cannot
// begin with less than `floor` of air below, so it is never a trap near the ground.
//
// A change of wind bigger than `jump` in one step is the glider being put somewhere else, not a
// gust, and is not felt.
export const STALL = Object.freeze({
  arm: 1.0, safe: 7.2, slow: 6.5, rough: 0.3, cap: 2.5, fill: 0.2, drain: 0.5, spin: 0.35, surge: 0.5, letGo: 1.5, jump: 1.5,
  forgiving: Object.freeze({ time: 0.9, sink: 8, yaw: 1.2, cut: 0, floor: 20 }),
  harsh: Object.freeze({ time: 2.4, sink: 24, yaw: 1.2, cut: 1, floor: 0 }),
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smooth = (from, to, value) => {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};

// Sink for an airspeed, on the one curve through least sink and trim; and what the deep brake
// adds on top of it, which rides on how far the hands are down and not on the airspeed.
const CURVE = (FLIGHT.sink.trim - FLIGHT.sink.least) / (FLIGHT.speed.trim - FLIGHT.speed.light) ** 2;
const sinkAt = (speed) => FLIGHT.sink.least + CURVE * (speed - FLIGHT.speed.light) ** 2;
const MUSH = FLIGHT.sink.deep - sinkAt(FLIGHT.speed.deep);

/**
 * A glider at trim, level and still. `pos` is kept as it is given, so the game can hand over the
 * vector it already draws with.
 *
 *   pos, yaw, yawRate, bank   where it is and which way it is turning
 *   speed, sink, vy           airspeed, the wing's own sink (before the turn and the air), climb
 *   turn                      the turn really flown, -1 to 1
 *   lift, liftSide            the air it is in, written by whoever samples the air
 *   brake, bar                how far the brake is down and the speed bar is on, 0 to 1
 *   stallLoad                 how near the stall is, 0 to 1
 *   stall, stallSide          seconds of stall left (the surge included), and -1 or 1 in a spin
 *   stallHarsh                whether the stall in progress is the costly kind
 *   grip                      false after a harsh stall until the brake is let go
 *   windX, windZ, felt        the wind at the last step, and whether there has been one
 */
export function createFlight(pos = { x: 0, y: 0, z: 0 }) {
  return {
    pos, yaw: 0, yawRate: 0, bank: 0, speed: FLIGHT.speed.trim, sink: FLIGHT.sink.trim, vy: 0, turn: 0, lift: 0, liftSide: 0,
    brake: 0, bar: 0, stallLoad: 0, stall: 0, stallSide: 0, stallHarsh: false, grip: true, windX: 0, windZ: 0, felt: false,
  };
}

/** Lets go of everything: hands up, bar off, nothing stalled or about to. Attitude and speed stay. */
export function releaseFlight(g) {
  g.brake = g.bar = g.stallLoad = g.stall = g.stallSide = 0;
  g.stallHarsh = false;
  g.grip = true;
  // The next wind it meets is where it starts from, not a gust.
  g.felt = false;
  return g;
}

/** Puts the wing level at `speed` with nothing going on: the start of a flight. */
export function settleFlight(g, speed = FLIGHT.speed.trim) {
  releaseFlight(g);
  g.yawRate = g.bank = g.vy = g.turn = 0;
  g.speed = speed;
  g.sink = FLIGHT.sink.trim;
  return g;
}

/**
 * Flies the glider for `dt` seconds.
 *
 * controls
 *   turn     -1 (left) to 1 (right), whoever it comes from: keys, the autopilot, the edge of the map
 *   brake    the brake is held
 *   bar      the speed bar is held; the brake wins over it
 *   locked   something else has the wing (a raven strike): the pilot's hands do nothing
 *   harsh    a stall here costs real height (high in a Cloudbase run)
 *   linger   the light brake is held long (a Cloudbase run)
 *   climb    a climb rate to hold instead of flying the air, or null; set, the glider is flying
 *            itself: no brake, no bar, no stall
 *
 * air
 *   lift, sink     rising air and any extra sink where the pilot is
 *   windX, windZ   the air's own movement over the ground, which carries the pilot
 *   calm           that movement is a steady drift: carry the pilot and feel no gust from it
 *   rough          a gust on the tail, 0 to 1
 *   clearance      air under the pilot (leave it out for plenty)
 */
export function stepFlight(g, controls, air, dt) {
  const auto = controls.climb != null;
  // One disaster at a time: a raven strike or the autopilot ends a stall.
  if (g.stall > 0 && (controls.locked || auto)) g.stall = g.stallSide = g.stallLoad = 0;
  const wasStalled = g.stall > 0;
  // What kind of stall it is was settled as it began.
  const fall = g.stallHarsh ? STALL.harsh : STALL.forgiving;
  if (wasStalled) g.stall = Math.max(0, g.stall - dt * (controls.brake ? 1 : STALL.letGo));
  const stalled = g.stall > 0;
  const falling = g.stall > STALL.surge;
  if (wasStalled && !stalled) g.stallSide = g.stallLoad = 0;
  if (!controls.brake) g.grip = true;
  // Whether the pilot's hands reach the wing at all.
  const hands = !wasStalled && !controls.locked && !auto;
  const pulling = hands && controls.brake && g.grip;

  if (pulling) {
    // Each stage stops at its own mark, so a quick take-up never eats into the linger after it.
    const linger = (BRAKE.shelf - BRAKE.light) / (controls.linger ? BRAKE.linger.run : BRAKE.linger.fjord);
    if (g.brake < BRAKE.light) g.brake = Math.min(BRAKE.light, g.brake + BRAKE.take * dt);
    else if (g.brake < BRAKE.shelf) g.brake = Math.min(BRAKE.shelf, g.brake + linger * dt);
    else g.brake = Math.min(1, g.brake + BRAKE.pull * dt);
  } else {
    g.brake = Math.max(0, g.brake - (g.brake > BRAKE.light ? BRAKE.dump : BRAKE.release) * dt);
  }
  const barWant = hands && controls.bar && !controls.brake ? 1 : 0;
  g.bar = clamp(g.bar + clamp(barWant - g.bar, -FLIGHT.ease.bar * dt, FLIGHT.ease.bar * dt), 0, 1);
  // How much of the light brake is on, and how much of the deep.
  const light = clamp(g.brake / BRAKE.light, 0, 1);
  const deep = smooth(BRAKE.shelf, 1, g.brake);

  const turnMax = hands
    ? FLIGHT.turn.trim + (FLIGHT.turn.light - FLIGHT.turn.trim) * light + (FLIGHT.turn.deep - FLIGHT.turn.light) * deep +
      (FLIGHT.turn.bar - FLIGHT.turn.trim) * g.bar
    : FLIGHT.turn.trim;
  // A falling wing turns by itself or not at all; in the surge it only holds its heading.
  g.turn = falling ? g.stallSide : stalled ? 0 : controls.turn;
  const yawWant = falling ? g.stallSide * fall.yaw : stalled ? 0 : controls.turn * turnMax;
  g.yawRate += (yawWant - g.yawRate) * Math.min(1, dt * FLIGHT.ease.yaw);
  g.yaw += g.yawRate * dt;
  g.bank += (g.yawRate * FLIGHT.bank * (g.speed / FLIGHT.speed.trim) - g.bank) * Math.min(1, dt * FLIGHT.ease.bank);

  // A gust is the wind changing under a wing that keeps its way: what the wind gains along the
  // heading, the wing loses in airspeed until it has caught up. A steady wind is not felt at all.
  let gust = 0;
  if (g.felt && !air.calm && !controls.locked && !auto && !falling) {
    const dx = air.windX - g.windX;
    const dz = air.windZ - g.windZ;
    if (Math.hypot(dx, dz) <= STALL.jump) gust = dx * Math.sin(g.yaw) - dz * Math.cos(g.yaw);
  }
  g.windX = air.windX;
  g.windZ = air.windZ;
  g.felt = true;

  const speedWant = falling
    ? FLIGHT.speed.stall
    : FLIGHT.speed.trim + (FLIGHT.speed.bar - FLIGHT.speed.trim) * g.bar - (FLIGHT.speed.trim - FLIGHT.speed.light) * light -
      (FLIGHT.speed.light - FLIGHT.speed.deep) * deep;
  // The gust's own jump is the air's doing, so it is no part of the speed traded for height below.
  const before = Math.max(0, g.speed - gust);
  g.speed = before + (speedWant - before) * Math.min(1, dt * (falling ? FLIGHT.ease.stall : FLIGHT.ease.speed));
  const swap = falling ? 0 : (-FLIGHT.swap * (g.speed / GRAVITY) * (g.speed - before)) / dt;

  g.sink = sinkAt(Math.max(g.speed, FLIGHT.speed.deep)) + MUSH * deep * deep;
  let sink = g.sink + Math.abs(g.yawRate) * FLIGHT.sink.turn * (g.speed / FLIGHT.speed.trim) + air.sink;
  if (falling) sink += fall.sink;

  if (stalled) {
    // The meter empties as the wing comes back.
    g.stallLoad = Math.min(g.stallLoad, g.stall / (fall.time + STALL.surge));
  } else {
    const felt = g.speed - STALL.arm * Math.abs(g.yawRate) - STALL.rough * air.rough;
    if (pulling && felt < STALL.safe) {
      g.stallLoad += STALL.fill * light * clamp((STALL.safe - felt) / (STALL.safe - STALL.slow), 0, STALL.cap) * dt;
    } else if (felt >= STALL.safe) {
      // Letting go is not enough by itself: the load only goes once the wing is flying again.
      g.stallLoad -= STALL.drain * dt;
    }
    const kind = controls.harsh ? STALL.harsh : STALL.forgiving;
    const room = (air.clearance ?? Infinity) >= kind.floor;
    g.stallLoad = clamp(g.stallLoad, 0, room ? 1 : 0.9);
    if (g.stallLoad >= 1) {
      g.stallHarsh = !!controls.harsh;
      g.stall = kind.time + STALL.surge;
      g.stallSide = Math.abs(g.yawRate) > STALL.spin ? Math.sign(g.yawRate) : 0;
      // Whoever held the brake into a costly stall has to let go of it before it bites again.
      if (g.stallHarsh) g.grip = false;
    }
  }

  const lift = air.lift * (falling ? 1 - fall.cut : 1);
  g.vy += ((auto ? controls.climb : lift - sink + swap) - g.vy) * Math.min(1, dt * FLIGHT.ease.climb);
  g.pos.x += (Math.sin(g.yaw) * g.speed + air.windX) * dt;
  g.pos.z += (-Math.cos(g.yaw) * g.speed + air.windZ) * dt;
  g.pos.y += g.vy * dt;
  return g;
}
