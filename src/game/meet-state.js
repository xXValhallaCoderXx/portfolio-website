// Good Lift's meet: the plates a pilot loads onto the bar and the judges who pass or fail each
// lift. It is stepped once a fixed step, after the sky and the wing (run-step.js), and only ever
// reads them, so a run flies exactly the same with the meet as without it. Plates come from full
// circles turned the flock's way in lift (reps), from a line of them laid on the bar's glide from
// a dying lift toward the next flock (a trail), and from a kettlebell that only just missed (a
// close call). Every 250 m of height is a line where three lights judge the lift since the last:
// fewer than two red and the bar is banked into the total, twice over once the horn has sounded.
// There is no clock and no random draw in here, so a replayed run lands on the same total.
import { FLIGHT } from './flight.js';

// The meet's rules. Every lift starts from the empty `bar` (kg, collars included) and is judged
// at a line every `every` metres of peak height, the first of them (the opener) at 250 m. From
// `horn` seconds into a run, where cloudFogSpeed's surge begins and the fog starts to race,
// Gjallarhorn has sounded and a good lift banks `double` times its weight. A full circle turned
// the flock's way in lift loads `rep` kg and a close call `close` kg. The airspace judge shows red
// after more than `cloud` seconds in cloud during one lift. `alive` is the strength (0 to 1) a
// thermal needs to count as lift, and turning the other way faster than `against` (rad/s) undoes
// a circle in progress.
export const MEET = Object.freeze({ bar: 25, every: 250, horn: 110, double: 2, rep: 2.5, close: 10, cloud: 1.5, alive: 0.3, against: 0.2 });

// Trails. When the lift being ridden (the launch column or a hunted thermal) relocates, or its
// strength drops under `dying` from at or above it, and the pilot was in it within `recent`
// seconds, one trail is laid for that ride from its centre toward the next flock: the nearest
// settled one still lifting, or failing that the nearest still flying to its new site. The first
// plate is `from` metres out, just beyond a hands-up circle, and the last stops `stop` of the
// target's radius short of its centre, so the plates never clutter either core. A trail `long`
// metres or more from first plate to last carries the six plates of `kg6`, a shorter one the five
// of `kg5` (kg, first to last: the heaviest wait nearest the next lift). The plates lie on the
// bar's glide, the first `below` metres under the pilot, and follow the pilot's height until the
// pilot boards (loads one, or flies 4 m past the first); then they stay put. A plate loads from
// within `reach` metres in 3-D. A trail waits `life` seconds to be boarded and lasts `keep`
// seconds once it has been.
export const TRAIL = Object.freeze({
  dying: 0.35, recent: 4, from: 22, stop: 0.6, long: 60, reach: 6, below: 1.5,
  kg5: Object.freeze([5, 10, 15, 20, 25]), kg6: Object.freeze([5, 10, 10, 15, 20, 25]), life: 20, keep: 15,
});

// How many of each thing the meet holds. The pools never grow or shrink, so the view can keep them:
// one trail's plates, and more lift records than the fog leaves time for (it catches even a nonstop
// climb at the launch column's 17 m/s by 3,090 m, which is twelve lines and the mist).
export const MEET_POOL = Object.freeze({ plates: 6, lifts: 16 });

const TAU = Math.PI * 2;
// The bar's own sink, on flight.js's one sink curve through least sink (at the light-brake speed)
// and trim, worked the way flight.js works it: 2.30 m/s at 16 m/s, a 6.95:1 glide in still air.
// Products rather than `**`, so no browser's power function can move a plate by a bit.
const CURVE = (FLIGHT.sink.trim - FLIGHT.sink.least) / ((FLIGHT.speed.trim - FLIGHT.speed.light) * (FLIGHT.speed.trim - FLIGHT.speed.light));
const BAR_SINK = FLIGHT.sink.least + CURVE * (FLIGHT.speed.bar - FLIGHT.speed.light) * (FLIGHT.speed.bar - FLIGHT.speed.light);

/**
 * The meet, made once and reset for every run. `step(dt, world)` follows a run world (run-step.js)
 * one fixed step at a time, reading its sky, wing, stall count and kettlebells and writing only its
 * own state; `finish(reason, world)` judges what is left on the bar when the run ends ('fog' or
 * 'landed' judge it at ×1, anything else forfeits it). Everything in `state` is a plain number,
 * boolean or string in pools that never change, so the view can keep them and a meet can be copied
 * and compared:
 *
 *   total                         kg banked by good lifts, a multiple of 2.5
 *   bar                           kg loaded since the last line, the empty bar not included
 *   next                          m: the height of the next line
 *   count                         lifts judged; the first MEET_POOL.lifts are kept in `lifts`
 *   lifts[]                       { line (m, or 0 for the bar judged as the run ends), kg (the
 *                                 bar lifted, empty bar included), red (bit 0 contact, bit 1
 *                                 control, bit 2 airspace), good, double, at (run seconds) }
 *   horn                          Gjallarhorn has sounded and good lifts bank double
 *   reps, trails, close, plates   circles loaded, trails laid, close calls, plates loaded
 *   since                         strikes, stalls and seconds in cloud at the last line
 *   turned                        rad turned the flock's way toward the next rep
 *   ride                          the lift last ridden: `n` rides so far, thermal `slot` (-1 for
 *                                 none yet), the site `x, z` it was ridden at, `seen`, when the
 *                                 pilot was last in it, and `strong`, whether it was seen at or
 *                                 above TRAIL.dying (so it can be seen to drop under it)
 *   trail                         the trail laid for ride `ride`, while `live`: from `x, z` along
 *                                 `ux, uz` toward thermal `target`, a plate every `gap` metres,
 *                                 `slope` metres lower for each metre on; laid at `born` and boarded
 *                                 at `boarded` (run seconds, -1 until then). Its `plates[]` are
 *                                 { x, y, z, kg, live }
 *   ended                         '' while the run goes on, then 'fog', 'landed' or 'quit'
 */
export function createMeet() {
  const state = {
    total: 0,
    bar: 0,
    next: MEET.every,
    count: 0,
    lifts: Array.from({ length: MEET_POOL.lifts }, () => ({ line: 0, kg: 0, red: 0, good: false, double: false, at: 0 })),
    horn: false,
    reps: 0,
    trails: 0,
    close: 0,
    plates: 0,
    since: { strikes: 0, stalls: 0, cloud: 0 },
    turned: 0,
    ride: { n: 0, slot: -1, x: 0, z: 0, seen: 0, strong: false },
    trail: {
      live: false, ride: 0, target: 0, x: 0, z: 0, ux: 0, uz: 0, gap: 0, slope: 0, born: 0, boarded: -1,
      plates: Array.from({ length: MEET_POOL.plates }, () => ({ x: 0, y: 0, z: 0, kg: 0, live: false })),
    },
    ended: '',
  };
  // The wind across a trail being laid, written by the sky (windAt) into this one object.
  const wind = { x: 0, z: 0, front: 0, rough: 0 };

  function clearTrail() {
    const { trail } = state;
    trail.live = false;
    for (let i = 0; i < trail.plates.length; i++) {
      const plate = trail.plates[i];
      plate.x = plate.y = plate.z = plate.kg = 0;
      plate.live = false;
    }
  }

  function reset() {
    state.total = state.bar = state.count = 0;
    state.next = MEET.every;
    for (let i = 0; i < state.lifts.length; i++) {
      const lift = state.lifts[i];
      lift.line = lift.kg = lift.red = lift.at = 0;
      lift.good = lift.double = false;
    }
    state.horn = false;
    state.reps = state.trails = state.close = state.plates = 0;
    state.since.strikes = state.since.stalls = state.since.cloud = 0;
    state.turned = 0;
    const { ride, trail } = state;
    ride.n = ride.x = ride.z = ride.seen = 0;
    ride.slot = -1;
    ride.strong = false;
    clearTrail();
    trail.ride = trail.target = trail.x = trail.z = trail.ux = trail.uz = trail.gap = trail.slope = trail.born = 0;
    trail.boarded = -1;
    state.ended = '';
  }

  // The three lights on the lift since the last line, then the call: two or more red drop the bar,
  // one is still a good lift. Either way the next lift starts from an empty bar.
  function judge(world, line, doubled) {
    const { pilot, elapsed } = world.sky.state;
    const { since } = state;
    const red = (pilot.strikes > since.strikes ? 1 : 0) | (world.stalls > since.stalls ? 2 : 0) |
      (pilot.cloudTime - since.cloud > MEET.cloud ? 4 : 0);
    // At most one bit set.
    const good = (red & (red - 1)) === 0;
    const kg = state.bar + MEET.bar;
    if (good) state.total += doubled ? kg * MEET.double : kg;
    if (state.count < state.lifts.length) {
      const lift = state.lifts[state.count];
      lift.line = line;
      lift.kg = kg;
      lift.red = red;
      lift.good = good;
      lift.double = doubled;
      lift.at = elapsed;
    }
    state.count += 1;
    state.bar = 0;
    since.strikes = pilot.strikes;
    since.stalls = world.stalls;
    since.cloud = pilot.cloudTime;
  }

  // Lays the trail for the ride that is ending, if there is a flock to lead to and room for it.
  // Otherwise it is tried again next step, for as long as the ride is still recent.
  function lay(world) {
    const { thermals, elapsed } = world.sky.state;
    const { ride, trail } = state;
    let target = 0;
    let nearest = Infinity;
    let settled = false;
    for (let i = 1; i < thermals.length; i++) {
      const thermal = thermals[i];
      // The dying lift itself is no target until it has moved on; then its flock is one to follow.
      const ready = i !== ride.slot && thermal.live && thermal.move === 0 && thermal.strength >= MEET.alive;
      if (!ready && !(thermal.move > 0)) continue;
      if (settled && !ready) continue;
      const dx = thermal.x - ride.x;
      const dz = thermal.z - ride.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if ((ready && !settled) || distance < nearest) {
        target = i;
        nearest = distance;
        settled = ready;
      }
    }
    if (target === 0) return;
    const goal = thermals[target];
    // From the first plate to the last. Two sites are 80 m apart or more, which leaves 35 m at
    // the least; under 10 m a trail would be a heap.
    const span = nearest - TRAIL.stop * goal.r - TRAIL.from;
    if (span < 10) return;
    const weights = span >= TRAIL.long ? TRAIL.kg6 : TRAIL.kg5;
    const ux = (goal.x - ride.x) / nearest;
    const uz = (goal.z - ride.z) / nearest;
    // The bar's glide over the ground along the trail, in the wind at its middle at the pilot's
    // height: flatter with the wind behind, steeper into it, and never steeper than the glide at
    // 6 m/s over the ground (no breeze and gust together come near that headwind).
    const middle = TRAIL.from + span / 2;
    world.sky.windAt(ride.x + ux * middle, world.g.pos.y, ride.z + uz * middle, wind);
    const ground = Math.max(6, FLIGHT.speed.bar + wind.x * ux + wind.z * uz);
    trail.live = true;
    trail.ride = ride.n;
    trail.target = target;
    trail.x = ride.x;
    trail.z = ride.z;
    trail.ux = ux;
    trail.uz = uz;
    trail.gap = span / (weights.length - 1);
    trail.slope = BAR_SINK / ground;
    trail.born = elapsed;
    trail.boarded = -1;
    const y = world.g.pos.y;
    for (let i = 0; i < trail.plates.length; i++) {
      const plate = trail.plates[i];
      if (i < weights.length) {
        const along = TRAIL.from + i * trail.gap;
        plate.x = ride.x + ux * along;
        plate.y = y - TRAIL.below - i * trail.gap * trail.slope;
        plate.z = ride.z + uz * along;
        plate.kg = weights[i];
        plate.live = true;
      } else {
        plate.x = plate.y = plate.z = plate.kg = 0;
        plate.live = false;
      }
    }
    state.trails += 1;
  }

  // A live trail for one step: it times out, follows the pilot's height until boarded, and gives
  // up any plate the glider comes within reach of.
  function tend(world) {
    const { pos } = world.g;
    const { elapsed } = world.sky.state;
    const { trail } = state;
    const { plates } = trail;
    if (trail.boarded >= 0 ? elapsed - trail.boarded > TRAIL.keep : elapsed - trail.born > TRAIL.life) {
      clearTrail();
      return;
    }
    if (trail.boarded < 0) {
      // Still hanging on the glide from just under the pilot, wherever the pilot has climbed to.
      for (let i = 0; i < plates.length; i++) {
        if (plates[i].live) plates[i].y = pos.y - TRAIL.below - i * trail.gap * trail.slope;
      }
      // 4 m past the first plate along the trail, the pilot is on the way, loaded or not.
      if ((pos.x - trail.x) * trail.ux + (pos.z - trail.z) * trail.uz >= TRAIL.from + 4) trail.boarded = elapsed;
    }
    let left = 0;
    for (let i = 0; i < plates.length; i++) {
      const plate = plates[i];
      if (!plate.live) continue;
      const dx = plate.x - pos.x;
      const dy = plate.y - pos.y;
      const dz = plate.z - pos.z;
      if (dx * dx + dy * dy + dz * dz <= TRAIL.reach * TRAIL.reach) {
        plate.live = false;
        state.bar += plate.kg;
        state.plates += 1;
        if (trail.boarded < 0) trail.boarded = elapsed;
      } else {
        left += 1;
      }
    }
    if (left === 0) trail.live = false;
  }

  function step(dt, world) {
    if (state.ended !== '' || !(dt > 0)) return;
    const sky = world.sky.state;
    const { pilot, thermals, elapsed } = sky;
    const { g } = world;
    const { ride, trail } = state;

    // The ride: whichever lift the pilot is in. A thermal at a new site is a new ride, even one
    // that has hopped to the same x to the metre, and a new ride starts its own circle.
    const slot = pilot.thermal;
    if (slot >= 0) {
      const thermal = thermals[slot];
      if (slot !== ride.slot || thermal.x !== ride.x || thermal.z !== ride.z) {
        ride.n += 1;
        ride.slot = slot;
        ride.x = thermal.x;
        ride.z = thermal.z;
        ride.strong = false;
        state.turned = 0;
      }
      if (thermal.strength >= TRAIL.dying) ride.strong = true;
      ride.seen = elapsed;
    }

    // Reps: the wing's own turning, counted the flock's way in a hunted thermal that still lifts.
    // A collapse or a stall (a spin with it) loses the circle in progress, and so does turning the
    // other way; the launch column has no flock to turn with.
    if (pilot.collapse > 0 || g.stall > 0) {
      state.turned = 0;
    } else if (slot > 0 && thermals[slot].strength >= MEET.alive) {
      const way = g.yawRate * thermals[slot].dir;
      if (way < -MEET.against) {
        state.turned = 0;
      } else if (way > 0) {
        state.turned += way * dt;
        if (state.turned >= TAU) {
          state.turned -= TAU;
          state.reps += 1;
          state.bar += MEET.rep;
        }
      }
    }

    // Trails: one for each ride that ends while still recent, by its lift moving on or dropping
    // under `dying`. A thermal still blooming has not dropped, and nor has a spent launch column
    // flown back into. None is laid once the sky has ended.
    if (sky.active && ride.n > 0 && trail.ride !== ride.n && elapsed - ride.seen <= TRAIL.recent) {
      const thermal = thermals[ride.slot];
      const moved = thermal.x !== ride.x || thermal.z !== ride.z;
      if (moved || (ride.strong && thermal.strength < TRAIL.dying)) lay(world);
    }
    if (trail.live) tend(world);

    // Close calls, as the kettlebells count them.
    const bells = world.bells;
    if (bells && bells.state.close > state.close) {
      state.bar += (bells.state.close - state.close) * MEET.close;
      state.close = bells.state.close;
    }

    // Lines: every one the peak has reached is judged, on the bar as it stands.
    while (sky.peak >= state.next) {
      judge(world, state.next, state.horn);
      state.next += MEET.every;
    }

    if (elapsed >= MEET.horn) state.horn = true;
  }

  /**
   * Ends the meet with the run. The fog and a touchdown judge the bar as it stands at ×1, with the
   * same lights, as lift `line` 0; quitting (or any other ending) forfeits it. Only the first call
   * counts, and nothing of the trail is left to fly through.
   */
  function finish(reason, world) {
    if (state.ended !== '') return;
    const judged = reason === 'fog' || reason === 'landed';
    state.ended = judged ? reason : 'quit';
    if (judged) judge(world, 0, false);
    clearTrail();
  }

  return { reset, step, finish, get state() { return state; } };
}
