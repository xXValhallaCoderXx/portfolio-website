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
// it is back at `light` and at `release` after that, so letting go for 70 ms returns even a full
// brake to a light one and starts its linger again.
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

// Big ears: the outer cells of both tips pulled down and in by their lines, a steep way down that
// cannot stall. Folded all the way they add `sink` and take `slow` off the airspeed, and the wing
// turns at only `turn`, by weight shift, however the hands were set. They come in over `fold`
// seconds while held and open by themselves over `open` once let go, or in `dab` with a touch of
// the brake, which bites only once they are out: the brake is off the wing while they are in, so
// no stall can build. Measured in a run: straight they come down at 6.05 m/s and 10 m/s, 2.6 times
// the speed bar's sink and still under the deep brake's 7, and in a core's 20 m/s they climb 13.6,
// so they are the way to fly out of lift and sink, never a way out of a core where it stands.
export const EARS = Object.freeze({ sink: 5, slow: 1.5, turn: 0.5, fold: 0.6, open: 1.5, dab: 0.25 });

// The wing swings fore and aft over the pilot, a pendulum of `period` seconds that keeps 0.6 of a
// free swing each period, so a swing pumped in time grows. `pitch` is how far the lines lean from
// upright, positive with the wing behind the pilot. What swings it is the brake changing, not
// airspeed: taking up the light brake owes the swing a push back of `push.brake` rad/s and letting
// it go the same ahead, so a quick press is already the whole push and the run's long linger never
// comes into it; a deep brake pushes `push.deep` times as hard, but only as it is let go (pulled, it
// would rock the wing to no purpose), and the bar comes on with `push.bar` of a push ahead. Pushes
// are paid out as fast as the airspeed follows the brake, so a surge is a moment building, never a
// kick, and there is time to catch it. The air falling away (FALL) owes `push.fall` ahead, half of
// that with the light brake bitten (`braced`), and a harsh stall flying again `push.refly`; and the
// air itself rocks the wing by `air` for each m/s it falls or builds.
//
// The brake held while the wing is ahead and still going damps it by `check` for a whole light
// brake: that is the catch, braking as it surges. Braked as it swings back instead, the push adds to
// the swing: that is pitching. Ahead it gains airspeed and behind it gives it up (`coupling`, through
// FLIGHT.swap like any change of speed), so no way of working the brake gains height. Crossing `line`
// ahead while still surging, `held` further with the light brake bitten, the leading edge tucks
// (TUCK), where the wing can fold; anywhere else, and behind it at `back`, a swing past the mark is
// stopped by `stop`. Swung more than `lean` behind, the wing flies `aoa` m/s slower than its airspeed
// for each further radian, so a pumped-back wing on the brake can stall. The ears damp it (`ears`),
// and a falling wing hangs `stall` behind. `share` is how much of a push still owed pitchPeak counts.
export const PITCH = Object.freeze({
  period: 2.8, damping: 0.08,
  push: Object.freeze({ brake: 1.1, deep: 3, bar: 0.6, fall: 4.3, braced: 0.5, refly: 3.6 }),
  air: 0.05, check: 7, ears: 3, stall: 0.35, coupling: 3, line: 1.0, held: 0.3, back: 1.0, stop: 12, lean: 0.52, aoa: 4, share: 0.6,
});

// The air falling away under the wing, as it does flying out of a core or up into the sink at a
// storm cloud's base, surges it. `under` is the air it has been flying in (lift less sink, followed
// `feel` seconds behind); a fall of `drop` from that, to `floor` or less, surges it, once, and again
// only once the air has stopped falling (under half of `drop`) and `rest` seconds have gone. The floor
// keeps a circle out of it: a lap 14 m off a core on the light brake never falls below about 10 m/s,
// and hands up, swinging a little wider, to about 3 m/s too gently to count (2.4 m/s of fall where it
// is under the floor); every way out of lift ends near 0.
export const FALL = Object.freeze({ feel: 0.5, drop: 2.5, floor: 4, rest: 1.5 });

// A wing that surges past its line tucks its leading edge under for `time` seconds, `sink` the
// faster down, with the hands off it and its heading held.
export const TUCK = Object.freeze({ time: 0.8, sink: 12 });

// The swing side to side: wingovers. A turn's bank comes in as it always has, eased (`lean`), but
// `share` of it swings as a pendulum of `period` seconds that keeps 0.73 of itself each half-swing,
// pushed by the turn asked for as it changes. A turn held settles exactly where it always did; a
// turn reversed as the swing peaks, again and again, builds it, the way a wingover is flown: 45° of
// bank from one reversal, 60° by the third, 75° by the sixth. Mashing faster, or slower, builds
// nothing. Past `steep` the bank turns the wing harder than it was asked to, by `turn` times the
// turn that much bank stands for in a steady circle. The swing borrows airspeed at its top and pays
// it back at its bottom, `speed` m/s for each square radian of it, all of it (`swap`) traded with
// height, so it climbs and slows at the top and dives at the bottom, and its roll costs `drag` m/s
// of sink for each (rad/s)² of it: no wingover gains height. Past `limit` the outer wing unloads;
// where the wing can fold it tips (TIP), and anywhere else the bank stops there.
export const ROLL = Object.freeze({ share: 0.3, period: 2.37, damping: 0.1, limit: 1.361, steep: 0.873, turn: 2, speed: 2, swap: 1, drag: 0.3 });

// A tip collapse: the outer wing, unloaded at the top of a wingover too steep, folds. For `time`
// seconds the hands are off the wing and it hooks toward the folded half at `yaw`, `sink` the
// faster down. No stall: the wing is flying.
export const TIP = Object.freeze({ time: 1, yaw: 1.2, sink: 14 });

const PITCH_W = (2 * Math.PI) / PITCH.period;
const ROLL_W = (2 * Math.PI) / ROLL.period;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smooth = (from, to, value) => {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};
// The sine of a swing, by its series to the fifth power: within 0.13% out to 1.3 rad, and plain
// arithmetic, which every engine rounds alike, where Math.sin may differ in its last bit between a
// browser and the server that flies its run again.
const sine = (x) => x * (1 - ((x * x) / 6) * (1 - (x * x) / 20));

// Sink for an airspeed, on the one curve through least sink and trim; and what the deep brake
// adds on top of it, which rides on how far the hands are down and not on the airspeed.
const CURVE = (FLIGHT.sink.trim - FLIGHT.sink.least) / (FLIGHT.speed.trim - FLIGHT.speed.light) ** 2;
const sinkAt = (speed) => FLIGHT.sink.least + CURVE * (speed - FLIGHT.speed.light) ** 2;
const MUSH = FLIGHT.sink.deep - sinkAt(FLIGHT.speed.deep);

/**
 * A glider at trim, level and still. `pos` is kept as it is given, so the game can hand over the
 * vector it already draws with.
 *
 *   pos, yaw, yawRate, bank   where it is and which way it is turning, and its bank as drawn
 *   lean, roll, rollRate      the bank a turn eases in, the swing of a wingover beyond it, and how
 *                             fast that swing rolls
 *   rollRest, rollSpeed       where the swing hangs for the turn asked, and the airspeed it lends
 *   tip, tipSide              seconds left of a tip collapse, and the folded half (-1 left, 1 right)
 *   speed, sink, vy           airspeed, the wing's own sink (before the turn and the air), climb
 *   turn                      the turn really flown, -1 to 1
 *   lift, liftSide            the air it is in, written by whoever samples the air
 *   brake, bar                how far the brake is down and the speed bar is on, 0 to 1
 *   stallLoad                 how near the stall is, 0 to 1
 *   stall, stallSide          seconds of stall left (the surge included), and -1 or 1 in a spin
 *   stallHarsh                whether the stall in progress is the costly kind
 *   grip                      false after a harsh stall until the brake is let go
 *   windX, windZ, felt        the wind at the last step, and whether there has been one
 *   ears                      how far the big ears are in, 0 to 1
 *   pitch, pitchRate          how far the wing has swung behind the pilot (negative: ahead), and how
 *                             fast it is swinging
 *   pitchPush                 rad/s of push the swing is still owed
 *   under                     the air the wing has been flying in (lift less sink), a fall's measure
 *   tuck                      seconds left of a tuck
 *   fallRest, fallArmed       seconds before another fall of the air may surge the wing, and
 *                             whether the air has stopped falling since the last
 */
export function createFlight(pos = { x: 0, y: 0, z: 0 }) {
  return {
    pos, yaw: 0, yawRate: 0, bank: 0, speed: FLIGHT.speed.trim, sink: FLIGHT.sink.trim, vy: 0, turn: 0, lift: 0, liftSide: 0,
    brake: 0, bar: 0, stallLoad: 0, stall: 0, stallSide: 0, stallHarsh: false, grip: true, windX: 0, windZ: 0, felt: false,
    ears: 0, pitch: 0, pitchRate: 0, pitchPush: 0, under: 0, tuck: 0, fallRest: 0, fallArmed: true,
    lean: 0, roll: 0, rollRate: 0, rollRest: 0, rollSpeed: 0, tip: 0, tipSide: 0,
  };
}

/**
 * Lets go of everything: hands up, bar off, ears out, nothing stalled, swinging, tucked or tipped.
 * Heading, bank and speed stay: a wingover's swing is left as the bank it has, to ease out.
 */
export function releaseFlight(g) {
  g.brake = g.bar = g.stallLoad = g.stall = g.stallSide = 0;
  g.ears = g.pitch = g.pitchRate = g.pitchPush = g.under = g.tuck = g.fallRest = 0;
  g.lean = g.bank;
  g.roll = g.rollRate = g.rollRest = g.rollSpeed = g.tip = g.tipSide = 0;
  g.fallArmed = true;
  g.stallHarsh = false;
  g.grip = true;
  // The next wind it meets is where it starts from, not a gust.
  g.felt = false;
  return g;
}

/** Puts the wing level at `speed` with nothing going on: the start of a flight. */
export function settleFlight(g, speed = FLIGHT.speed.trim) {
  releaseFlight(g);
  g.yawRate = g.bank = g.lean = g.vy = g.turn = 0;
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
 *   ears     the big ears are held in (a Good Lift run); the brake's first work is letting them go
 *   locked   something else has the wing (a raven strike): the pilot's hands do nothing
 *   harsh    a stall here costs real height (high in a Cloudbase run)
 *   linger   the light brake is held long (a Cloudbase run)
 *   swing    the wing swings over the pilot, fore and aft as the brake and the air push it and side
 *            to side as the turn does (a Good Lift run and the fjord); left out, it never swings
 *   folds    the wing can fold itself here: a surge past its line tucks it and a wingover past its
 *            limit tips it (high in a Good Lift run); left out, a swing past either is only stopped
 *   safe     the wing cannot stall here (over the fjord): the load stops short of it, as it
 *            does near the ground
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
  // Only a wing in the pilot's own hands swings: a raven strike or the autopilot takes it over.
  const swing = !!controls.swing && !controls.locked && !auto;
  // One disaster at a time: a raven strike or the autopilot ends a stall, a tuck and a tip.
  if (g.stall > 0 && (controls.locked || auto)) g.stall = g.stallSide = g.stallLoad = 0;
  if (controls.locked || auto) g.tuck = g.tip = 0;
  const wasStalled = g.stall > 0;
  // What kind of stall it is was settled as it began.
  const fall = g.stallHarsh ? STALL.harsh : STALL.forgiving;
  if (wasStalled) g.stall = Math.max(0, g.stall - dt * (controls.brake ? 1 : STALL.letGo));
  const stalled = g.stall > 0;
  const falling = g.stall > STALL.surge;
  if (wasStalled && !stalled) g.stallSide = g.stallLoad = 0;
  if (!controls.brake) g.grip = true;
  // A tucked or tipped wing is the air's until it opens again.
  const tucked = g.tuck > 0;
  if (tucked) g.tuck = Math.max(0, g.tuck - dt);
  const tipped = g.tip > 0;
  if (tipped) g.tip = Math.max(0, g.tip - dt);
  // Whether the pilot's hands reach the wing at all, and whether the brake bites: not until the
  // ears are out, its first work being to let them go.
  const hands = !wasStalled && !controls.locked && !auto && !tucked && !tipped;
  const pulling = hands && controls.brake && g.grip && g.ears === 0;

  // The air the wing has been flying in, and how far it has just fallen away from that. The first
  // air after a release is where it starts from, as with the wind.
  const net = air.lift - air.sink;
  const drop = g.felt ? g.under - net : 0;
  g.under = g.felt ? g.under + (net - g.under) * Math.min(1, dt / FALL.feel) : net;
  if (drop < FALL.drop / 2) g.fallArmed = true;
  g.fallRest = Math.max(0, g.fallRest - dt);
  // The brake and the bar as they were, for the push their changing gives the swing.
  const brakeWas = g.brake;
  const barWas = g.bar;

  if (pulling) {
    // Each stage stops at its own mark, so a quick take-up never eats into the linger after it.
    const linger = (BRAKE.shelf - BRAKE.light) / (controls.linger ? BRAKE.linger.run : BRAKE.linger.fjord);
    if (g.brake < BRAKE.light) g.brake = Math.min(BRAKE.light, g.brake + BRAKE.take * dt);
    else if (g.brake < BRAKE.shelf) g.brake = Math.min(BRAKE.shelf, g.brake + linger * dt);
    else g.brake = Math.min(1, g.brake + BRAKE.pull * dt);
  } else {
    g.brake = Math.max(0, g.brake - (g.brake > BRAKE.light ? BRAKE.dump : BRAKE.release) * dt);
  }
  // The ears come in while asked for with the hands on the wing and the brake off it, and open once
  // let go: slowly by themselves, quickly with a touch of the brake, and at once whenever the wing
  // is not the pilot's (a stall, a strike, a tuck, the autopilot).
  if (!hands) g.ears = 0;
  else if (controls.ears && !controls.brake) g.ears = Math.min(1, g.ears + dt / EARS.fold);
  else if (g.ears > 0) g.ears = Math.max(0, g.ears - dt / (controls.brake ? EARS.dab : EARS.open));
  const barWant = hands && controls.bar && !controls.brake && !controls.ears ? 1 : 0;
  g.bar = clamp(g.bar + clamp(barWant - g.bar, -FLIGHT.ease.bar * dt, FLIGHT.ease.bar * dt), 0, 1);
  // How much of the light brake is on, and how much of the deep.
  const light = clamp(g.brake / BRAKE.light, 0, 1);
  const deep = smooth(BRAKE.shelf, 1, g.brake);

  if (swing) {
    if (hands) {
      // The brake taken up pushes the wing back and let go pushes it ahead; a deep brake only as
      // it is let go; the bar ahead as it comes on.
      const lightWas = clamp(brakeWas / BRAKE.light, 0, 1);
      const deepWas = smooth(BRAKE.shelf, 1, brakeWas);
      g.pitchPush += PITCH.push.brake * (light - lightWas + PITCH.push.deep * Math.min(0, deep - deepWas) - PITCH.push.bar * (g.bar - barWas));
      // The air falling away surges it, half as hard against a light brake already biting.
      if (g.fallArmed && g.fallRest === 0 && drop >= FALL.drop && net <= FALL.floor && g.ears === 0) {
        g.fallArmed = false;
        g.fallRest = FALL.rest;
        g.pitchPush -= PITCH.push.fall * (1 - PITCH.push.braced * (pulling ? light : 0));
      }
    }
    // A harsh stall flying again surges it, whatever the hands are doing.
    if (wasStalled && !stalled && g.stallHarsh) g.pitchPush -= PITCH.push.refly;
    const give = g.pitchPush * Math.min(1, dt * FLIGHT.ease.speed);
    g.pitchPush -= give;
    const line = PITCH.line + PITCH.held * (pulling ? light : 0);
    if (falling || tucked) {
      // A falling wing hangs back, and a tucked one comes back over the pilot, neither swinging.
      g.pitchPush = 0;
      g.pitchRate += (PITCH_W * PITCH_W * ((falling ? PITCH.stall : 0) - g.pitch) - 2 * PITCH_W * g.pitchRate) * dt;
    } else {
      // The brake held as the wing surges checks it: the catch. Past its line, or the stop behind,
      // a swing still going is stopped short.
      let damp = 2 * PITCH.damping * PITCH_W + PITCH.ears * g.ears;
      if (pulling && g.pitch < 0 && g.pitchRate < 0) damp += PITCH.check * light;
      if (g.pitch * g.pitchRate > 0 && (g.pitch < 0 ? -g.pitch > line : g.pitch > PITCH.back)) damp += PITCH.stop;
      g.pitchRate += (-PITCH_W * PITCH_W * g.pitch - damp * g.pitchRate - (hands ? PITCH.air * drop : 0)) * dt + give;
    }
    g.pitch += g.pitchRate * dt;
    // Surged past its line where it can fold, the leading edge tucks under.
    if (controls.folds && hands && g.ears === 0 && g.pitch < -line && g.pitchRate < 0) {
      g.tuck = TUCK.time;
      g.pitchRate = g.pitchPush = 0;
    }
  } else {
    g.pitch = g.pitchRate = g.pitchPush = 0;
  }

  let turnMax = hands
    ? FLIGHT.turn.trim + (FLIGHT.turn.light - FLIGHT.turn.trim) * light + (FLIGHT.turn.deep - FLIGHT.turn.light) * deep +
      (FLIGHT.turn.bar - FLIGHT.turn.trim) * g.bar
    : FLIGHT.turn.trim;
  // With the ears in the wing turns by weight shift alone.
  if (g.ears > 0) turnMax += (EARS.turn - turnMax) * g.ears;
  // A falling wing turns by itself or not at all; in the surge, and tucked, it only holds its
  // heading; tipped, it hooks toward its folded half.
  g.turn = falling ? g.stallSide : stalled || tucked || tipped ? 0 : controls.turn;
  const yawWant = falling ? g.stallSide * fall.yaw : tipped ? g.tipSide * TIP.yaw : stalled || tucked ? 0 : controls.turn * turnMax;
  g.yawRate += (yawWant - g.yawRate) * Math.min(1, dt * FLIGHT.ease.yaw);
  // The airspeed the wingover's swing lends this step, and the sink its roll costs.
  let lent = 0;
  let drag = 0;
  if (swing) {
    // The bank a turn eases in as it always has, and the swing on top of it: `share` of that bank
    // hangs as a pendulum, and the turn asked for sets where it hangs, so changing the turn pushes
    // it. Everything beyond the eased bank turns, trades and drags; a held turn has none of it.
    const scale = FLIGHT.bank * (Math.max(g.speed, FLIGHT.speed.stall) / FLIGHT.speed.trim);
    const at = g.roll + ROLL.share * g.lean;
    g.lean += (g.yawRate * scale - g.lean) * Math.min(1, dt * FLIGHT.ease.bank);
    g.rollRest = ROLL.share * yawWant * scale;
    g.rollRate += (ROLL_W * ROLL_W * (g.rollRest - at) - 2 * (tipped ? 1 : ROLL.damping) * ROLL_W * g.rollRate) * dt;
    let bank = (1 - ROLL.share) * g.lean + at + g.rollRate * dt;
    if (Math.abs(bank) > ROLL.limit) {
      // Past the limit the outer wing unloads: where the wing can fold it tips, and the bank stops.
      const side = Math.sign(bank);
      if (controls.folds && !controls.safe && hands) {
        g.tip = TIP.time;
        g.tipSide = -side;
      }
      bank = side * ROLL.limit;
      if (g.rollRate * side > 0) g.rollRate = 0;
    }
    const roll = bank - g.lean;
    const rate = (roll - g.roll) / dt;
    g.roll = roll;
    g.bank = bank;
    g.yaw += (g.yawRate + (ROLL.turn * Math.sign(bank) * Math.max(0, Math.abs(bank) - ROLL.steep)) / scale) * dt;
    lent = ROLL.speed * ((rate * rate) / (ROLL_W * ROLL_W) - roll * (2 * g.lean + roll));
    drag = ROLL.drag * rate * rate;
  } else {
    g.yaw += g.yawRate * dt;
    g.bank += (g.yawRate * FLIGHT.bank * (g.speed / FLIGHT.speed.trim) - g.bank) * Math.min(1, dt * FLIGHT.ease.bank);
    g.lean = g.bank;
    g.roll = g.rollRate = g.rollRest = 0;
  }

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

  let speedWant = falling
    ? FLIGHT.speed.stall
    : FLIGHT.speed.trim + (FLIGHT.speed.bar - FLIGHT.speed.trim) * g.bar - (FLIGHT.speed.trim - FLIGHT.speed.light) * light -
      (FLIGHT.speed.light - FLIGHT.speed.deep) * deep;
  if (g.ears > 0) speedWant -= EARS.slow * g.ears;
  // The gust's own jump is the air's doing, so it is no part of the speed traded for height below.
  // Nor is the airspeed a wingover's swing lent last step: the wing's own speed eases without it,
  // and the swing's is laid on top again.
  const lentWas = g.rollSpeed;
  const before = Math.max(0, (swing ? g.speed - lentWas : g.speed) - gust);
  g.speed = before + (speedWant - before) * Math.min(1, dt * (falling ? FLIGHT.ease.stall : FLIGHT.ease.speed));
  // Swung ahead the wing dives and gathers speed, swung behind it zooms and gives it up.
  if (swing && !falling) g.speed = Math.max(0, g.speed - PITCH.coupling * sine(g.pitch) * dt);
  // The wing's own speed, which the polar and the turn read; the swing's is all traded with height.
  const own = g.speed;
  let swap;
  if (swing) {
    g.speed = own + lent;
    swap = (falling ? 0 : (-FLIGHT.swap * (g.speed / GRAVITY) * (own - before)) / dt) - (ROLL.swap * (g.speed / GRAVITY) * (lent - lentWas)) / dt;
  } else {
    swap = falling ? 0 : (-FLIGHT.swap * (g.speed / GRAVITY) * (g.speed - before)) / dt;
  }
  g.rollSpeed = lent;

  g.sink = sinkAt(Math.max(own, FLIGHT.speed.deep)) + MUSH * deep * deep;
  if (g.ears > 0) g.sink += EARS.sink * g.ears;
  let sink = g.sink + Math.abs(g.yawRate) * FLIGHT.sink.turn * (own / FLIGHT.speed.trim) + air.sink;
  if (swing) sink += drag;
  if (falling) sink += fall.sink;
  if (tucked) sink += TUCK.sink;
  if (tipped) sink += TIP.sink;

  if (stalled) {
    // The meter empties as the wing comes back.
    g.stallLoad = Math.min(g.stallLoad, g.stall / (fall.time + STALL.surge));
  } else {
    let felt = g.speed - STALL.arm * Math.abs(g.yawRate) - STALL.rough * air.rough;
    // Swung far back, the wing meets the air steeper than its airspeed says.
    if (swing && g.pitch > PITCH.lean) felt -= PITCH.aoa * (g.pitch - PITCH.lean);
    if (pulling && felt < STALL.safe) {
      g.stallLoad += STALL.fill * light * clamp((STALL.safe - felt) / (STALL.safe - STALL.slow), 0, STALL.cap) * dt;
    } else if (felt >= STALL.safe) {
      // Letting go is not enough by itself: the load only goes once the wing is flying again.
      g.stallLoad -= STALL.drain * dt;
    }
    const kind = controls.harsh ? STALL.harsh : STALL.forgiving;
    const room = !controls.safe && (air.clearance ?? Infinity) >= kind.floor;
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

/**
 * Where the wing's swing will next turn (rad: positive behind the pilot, negative ahead), taking in
 * the part of a push still owed that will show by then, and leaving out the damping. A swing going
 * forward turns ahead, one going back turns behind. Plain arithmetic, so every engine agrees.
 */
export function pitchPeak(g) {
  const rate = (g.pitchRate + PITCH.share * g.pitchPush) / PITCH_W;
  const size = Math.sqrt(g.pitch * g.pitch + rate * rate);
  return rate < 0 ? -size : size;
}

/**
 * When the wing's swing fore and aft next turns, if nothing more is done to it: writes into `out`
 * `toPeak`, the seconds until then (Infinity if not within `horizon`), `peak`, where it will be (rad,
 * positive behind), and `toLine`, the seconds until it would cross `line` ahead on the way (Infinity
 * if it will not). Flies the free swing ahead a step at a time, with the push still owed paid out as
 * stepFlight pays it, at the damping of a wing with nothing on it: plain arithmetic, and nothing
 * made. For the gauge and its prompts; it changes nothing.
 */
export function pitchPhase(g, out, line = PITCH.line, horizon = 2) {
  let pitch = g.pitch;
  let rate = g.pitchRate;
  let push = g.pitchPush;
  out.toPeak = out.toLine = Infinity;
  out.peak = pitch;
  const dt = 1 / 60;
  const pay = Math.min(1, dt * FLIGHT.ease.speed);
  const way = Math.sign(rate + PITCH.share * push) || Math.sign(-pitch) || 1;
  for (let i = 1; i <= horizon / dt; i++) {
    const give = push * pay;
    push -= give;
    rate += (-PITCH_W * PITCH_W * pitch - 2 * PITCH.damping * PITCH_W * rate) * dt + give;
    pitch += rate * dt;
    if (out.toLine === Infinity && pitch < -line && rate < 0) out.toLine = i * dt;
    if (Math.sign(rate) === -way) {
      out.toPeak = i * dt;
      out.peak = pitch;
      return out;
    }
  }
  return out;
}

/**
 * When the bank a wingover swings through next stops rolling, and where, if the turn asked now is
 * held: writes into `out` `toPeak`, the seconds until then (Infinity if it will not within
 * `horizon`), `bank`, the bank it will have then (rad, positive to the right), and `size`, how far
 * the swing goes either side of where it hangs. Flies the turn, the eased bank and the swing ahead
 * a step at a time, as stepFlight does, at the airspeed the wing has now: plain arithmetic, and
 * nothing made. For the gauge and the cues; it changes nothing.
 */
export function rollPhase(g, out, horizon = 1.5) {
  const scale = FLIGHT.bank * (Math.max(g.speed, FLIGHT.speed.stall) / FLIGHT.speed.trim);
  // The turn asked, as the swing's resting place says it.
  const want = g.rollRest / (ROLL.share * scale);
  let yawRate = g.yawRate;
  let lean = g.lean;
  let at = g.roll + ROLL.share * g.lean;
  let rate = g.rollRate;
  const fromRest = at - g.rollRest;
  const across = (rate + ROLL.damping * ROLL_W * fromRest) / ROLL_W;
  out.size = Math.sqrt(fromRest * fromRest + across * across);
  out.toPeak = Infinity;
  out.bank = g.bank;
  let last = g.bank;
  let way = 0;
  const dt = 1 / 60;
  for (let i = 1; i <= horizon / dt; i++) {
    yawRate += (want - yawRate) * Math.min(1, dt * FLIGHT.ease.yaw);
    lean += (yawRate * scale - lean) * Math.min(1, dt * FLIGHT.ease.bank);
    rate += (ROLL_W * ROLL_W * (g.rollRest - at) - 2 * ROLL.damping * ROLL_W * rate) * dt;
    at += rate * dt;
    const bank = (1 - ROLL.share) * lean + at;
    // A swing too small to see is no swing: a held turn's last trace never comes to a top.
    const turning = Math.abs(bank - last) < 1e-6 ? 0 : Math.sign(bank - last);
    if (way === 0) way = turning;
    else if (turning !== 0 && turning !== way) {
      out.toPeak = (i - 1) * dt;
      out.bank = last;
      return out;
    }
    last = bank;
  }
  return out;
}
