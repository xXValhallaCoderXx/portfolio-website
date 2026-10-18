// Good Lift's meet: the plates a pilot loads onto the bar and the judges who pass or fail each
// lift. It is stepped once a fixed step, after the sky and the wing (run-step.js), and only ever
// reads them, so a run flies exactly the same with the meet as without it (the one thing outside
// it that reads it is a kettlebell, which glances off a pilot holding Algiz). Plates come from full
// circles turned the flock's way in lift (reps), from a line of them laid on the bar's glide from
// a dying lift toward the next flock (a trail), and from a kettlebell that only just missed (a
// close call). Every 150 m of height is a line where three lights judge the lift since the last:
// fewer than two red and the bar is banked into the total, twice over once the horn has sounded.
//
// From 700 m, where Hrungnir starts throwing, there is more iron in the sky: plates riding each gust
// front that reaches the pilot, a plate in the clear air under a storm cloud's base, and after the
// horn one riding up 35 m over the fog. A strike there no longer leaves the bar alone: its plates
// spray off as the wing reopens and sink away for a few seconds, and any flown through goes back
// on. The rune gates at 500 and 1,000 m (meet-runes.js) bless the pilot who flies through one.
//
// There is no clock in here, and no random draw but the meet's own from the run's seed (never the
// sky's generator), so a replayed run lands on the same total.
import { FLIGHT } from './flight.js';
import { CLOUD_POOL, CLOUD_STRIKE, CLOUD_ZONE } from './cloudbase-state.js';
import { BELL_RESULT } from './bells.js';
import { BLESSING, RUNE, createRunes, meetDraw } from './meet-runes.js';
import { RUN_RULES, isJudgedEnding } from './run-rules.js';

// The meet's rules. Every lift starts from the empty `bar` (kg, collars included) and is judged
// at a line every `every` metres of peak height, the first of them (the opener) at 150 m. From
// `horn` seconds into a run, where cloudFogSpeed's surge begins and the fog starts to race,
// Gjallarhorn has sounded and a good lift banks `double` times its weight. A full circle turned
// the flock's way in lift loads `rep` kg and a close call `close` kg (`beast` kg for the Beast's,
// bells.js). The airspace judge shows red after more than `cloud` seconds in cloud during one
// lift. `alive` is the strength (0 to 1) a thermal needs to count as lift, and turning the other
// way faster than `against` (rad/s) undoes a circle in progress. A circle whose mean position was
// within `depth` metres of the core is a rep to depth, and loads `deep` kg instead of `rep`.
// Below `iron` metres of peak (where Hrungnir starts throwing, BELLS.from) the meet is what it
// always was: no plate comes off the trail and a strike leaves the bar alone (but under Tiwaz,
// which the 500 m gates can give).
export const MEET = Object.freeze({
  bar: 25, every: 150, horn: RUN_RULES.horn, double: 2, rep: 2.5, close: 10, beast: 20, cloud: 1.5, alive: 0.3, against: 0.2,
  depth: 7, deep: 5, iron: 700,
});

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
// within `reach` metres in 3-D (BLESSING.reach under Fehu), and every other plate in the sky loads
// the same way. A trail waits `life` seconds to be boarded and lasts `keep` seconds once it has been.
export const TRAIL = Object.freeze({
  dying: 0.35, recent: 4, from: 22, stop: 0.6, long: 60, reach: 6, below: 1.5,
  kg5: Object.freeze([5, 10, 15, 20, 25]), kg6: Object.freeze([5, 10, 10, 15, 20, 25]), life: 20, keep: 15,
});

// Iron on the wind: a gust front due to reach the pilot within `lead` seconds carries `count`
// plates of `kg`, laid on its line across the line through the middle of the lift the pilot is
// riding (or through the pilot, out of lift): one `aside` to either side of it and the rest on
// outward `gap` apart on a seeded side. That is beyond a light-brake circle blown downwind and its
// reach, so a pilot circling where they are meets one by chance about once a run, and one who
// widens the circle for it as the front comes takes it. They ride the front at its own speed and
// follow the pilot's height until the front reaches the pilot; then they keep that height, and go
// once the front is `past` beyond the pilot. Laid 16 m out at 20 kg, TST met 1.6 a run by chance
// (over 800 skies), and on the tests' forty skies banked as much as the collector; here, one a run.
export const WIND = Object.freeze({
  count: 3,                         // plates a front carries
  kg: 15,                           // kg each (a yellow plate)
  lead: 6,                          // s: laid on a front at most this far from reaching the pilot
  aside: 22,                        // m from the lift's middle to the nearest two either side
  gap: 12,                          // m between plates along the front beyond them: two reaches
  past: 20,                         // m a front may run past the pilot before its plates go
});

// Under the thunder: once the pilot has no more than `range` of clear air up to a storm cloud's
// base, one plate of `kg` hangs `below` that base, over a point `inward` from the pilot toward the
// cloud's middle (or at the middle, if nearer). It rides the cloud, at most one to a cloud and one
// at a time, and goes after `life` seconds, as the cloud fades, or once the pilot is `far` from it.
export const THUNDER = Object.freeze({
  kg: 25,                           // kg (a red plate)
  range: 60,                        // m of clear air over the pilot's chest within which it is laid
  below: 3,                         // m under the cloud's base: a pilot level with it is just clear
  inward: 8,                        // m from the pilot toward the cloud's middle
  life: 20,                         // s it hangs there
  far: 120,                         // m, level, from the pilot at which it goes
});

// Fog bait: once the horn has sounded and the fog is within `near` metres under the pilot, a plate
// of `kg` rides `above` metres over the fog, laid `aside` metres to one side of the pilot (a seeded
// side, the other if that is within `edge` of the rim). The fog brings it up to the wing a couple
// of seconds before it comes itself, and there it waits, level with the wing, for those seconds:
// one at a time, the next `again` seconds after one is taken.
export const BAIT = Object.freeze({
  kg: 25,                           // kg (a red plate)
  near: 200,                        // m of fog under the pilot within which it is laid
  above: 35,                        // m over the fog it rides
  aside: 20,                        // m to the pilot's side it is laid
  edge: 15,                         // m inside the rim it is kept
  again: 3,                         // s after one is taken before the next is laid
});

// What a strike does to the bar: what it carried over the empty bar is split into the plates of
// `plates` (kg), largest first, `most` at most (any kg left over is lost). They are held while the
// wing is folded and spray out as it reopens: `from` metres round the pilot, thrown on outward at
// `kick` m/s, which dies away by `drag` a second, drifting with the air where the pilot was, so
// they settle in a ring about a light-brake circle wide round where the wing reopened: circling
// tight there flies back through them. They sink `sink` m/s under the pilot's height and are gone
// `life` seconds after the spray.
export const SCATTER = Object.freeze({
  plates: Object.freeze([25, 20, 15, 10, 5, 2.5]),
  most: 8,                          // plates at most
  from: 6.5,                        // m round the pilot they start: just out of reach
  kick: 1.5,                        // m/s outward as they spray
  drag: 1.5,                        // 1/s: how fast that dies away (1.5 / 1.5: 1 m more out)
  sink: 0.5,                        // m/s they fall away below the pilot
  life: 5.5,                        // s from the spray until they go: before the shield drops, with the fold
});

// What a plate is, for the view to draw it: every plate of a trail is `trail`; the loose ones are
// the rest, and an empty slot of the loose pool is `none`.
export const PLATE_KIND = Object.freeze({ none: 0, trail: 1, wind: 2, thunder: 3, bait: 4, scatter: 5 });

// How many of each thing the meet holds. The pools never grow or shrink, so the view can keep them:
// one trail's plates, and more lift records than the fog leaves time for (it catches even a nonstop
// climb at the launch column's 17 m/s by 3,090 m, which is twelve lines and the mist). The loose
// plates are laid out by kind: a strike's `SCATTER.most` first, then two gust fronts' at once, then
// the one under the thunder and the fog's bait (LOOSE).
export const MEET_POOL = Object.freeze({ plates: 6, lifts: 96, loose: 16 });
const LOOSE = Object.freeze({ scatter: 0, wind: SCATTER.most, thunder: SCATTER.most + 2 * WIND.count, bait: SCATTER.most + 2 * WIND.count + 1 });

const TAU = Math.PI * 2;
const { trail: TRAIL_PLATE, wind: WIND_PLATE, thunder: THUNDER_PLATE, bait: BAIT_PLATE, scatter: SCATTER_PLATE, none: NO_PLATE } = PLATE_KIND;
// The bar's own sink, on flight.js's one sink curve through least sink (at the light-brake speed)
// and trim, worked the way flight.js works it: 2.30 m/s at 16 m/s, a 6.95:1 glide in still air.
// Products rather than `**`, so no browser's power function can move a plate by a bit.
const CURVE = (FLIGHT.sink.trim - FLIGHT.sink.least) / ((FLIGHT.speed.trim - FLIGHT.speed.light) * (FLIGHT.speed.trim - FLIGHT.speed.light));
const BAR_SINK = FLIGHT.sink.least + CURVE * (FLIGHT.speed.bar - FLIGHT.speed.light) * (FLIGHT.speed.bar - FLIGHT.speed.light);

/**
 * The meet, made once and reset for every run. `step(dt, world)` follows a run world (run-step.js)
 * one fixed step at a time, reading its sky, wing, stall count and kettlebells and writing only its
 * own state; `finish(reason, world)` judges what is left on the bar when the run ends ('fog' or
 * 'landed' and 'time' judge it at ×1, anything else forfeits it). Everything in `state` is a plain number,
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
 *   reps, trails, close, plates   circles loaded, trails laid, close calls, plates loaded (from a
 *                                 trail or loose, a scattered plate loaded back included)
 *   deep                          of those reps, the ones to depth (centred within MEET.depth of
 *                                 the core), which loaded MEET.deep kg rather than MEET.rep
 *   beastClose                    whether the Beast's close call has been paid (MEET.beast kg)
 *   since                         strikes, stalls and seconds in cloud at the last line
 *   turned                        rad turned the flock's way toward the next rep
 *   lap                           where that circle has gone: the glider's core-relative `x, z` summed over the
 *                                 `n` steps it has turned the flock's way, whose mean judges depth
 *   ride                          the lift last ridden: `n` rides so far, thermal `slot` (-1 for
 *                                 none yet), the site `x, z` it was ridden at, `seen`, when the
 *                                 pilot was last in it, and `strong`, whether it was seen at or
 *                                 above TRAIL.dying (so it can be seen to drop under it)
 *   trail                         the trail laid for ride `ride`, while `live`: from `x, z` along
 *                                 `ux, uz` toward thermal `target`, a plate every `gap` metres,
 *                                 `slope` metres lower for each metre on; laid at `born` and boarded
 *                                 at `boarded` (run seconds, -1 until then). Its `plates[]` are
 *                                 { kind, x, y, z, kg, live }, `kind` always PLATE_KIND.trail
 *   loose[MEET_POOL.loose]        every plate off the trail: { kind (PLATE_KIND), kg, live, x, y, z
 *                                 (m), born (run seconds it was laid or sprayed), slot (the gust
 *                                 band or cloud it rides, else -1), ox, oz (where on it: a wind
 *                                 plate's place along its front as `ox`, a thunder plate's offset
 *                                 from its cloud's middle), vx, vz (a scattered plate's own way
 *                                 through the air, m/s), still (a wind plate the front has carried
 *                                 past the pilot, keeping its height), held (a scattered plate
 *                                 waiting for the wing to reopen) }. Slots 0-7 are a strike's,
 *                                 8-13 two gust fronts', 14 the thunder's and 15 the fog's bait
 *   carried[CLOUD_POOL.gusts]     for each gust band, the run second it set off if its front has
 *                                 carried plates, else -1
 *   thundered[CLOUD_POOL.clouds]  whether each cloud has had its plate this run
 *   spray                         the strike's plates: `held` while they wait for the wing to
 *                                 reopen, `n` sprays so far, `at` (run seconds of the last), and
 *                                 `wx, wz` the air's drift it rides (m/s)
 *   baits, baitDue                baits laid so far, and the run second from which the next may be
 *   struck                        strikes the meet has answered
 *   fronts                        gust fronts that carried plates
 *   wind, thunder, bait           plates loaded off a front, from under a cloud and over the fog
 *   scattered, recovered          plates a strike sprayed off the bar, and those loaded back
 *   lost                          kg a strike took off the bar for good: past the plates it is split
 *                                 into, or the whole bar under Tiwaz (plates sprayed and not caught
 *                                 are not counted here)
 *   runes                         the rune gates and the blessing held (meet-runes.js)
 *   ended                         '' while the run goes on, then 'fog', 'landed', 'time' or 'quit'
 */
export function createMeet() {
  const runes = createRunes();
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
    beastClose: false,
    since: { strikes: 0, stalls: 0, cloud: 0 },
    turned: 0,
    deep: 0,
    lap: { x: 0, z: 0, n: 0 },
    ride: { n: 0, slot: -1, generation: -1, x: 0, z: 0, seen: 0, strong: false },
    trail: {
      live: false, ride: 0, target: 0, x: 0, z: 0, ux: 0, uz: 0, gap: 0, slope: 0, born: 0, boarded: -1,
      plates: Array.from({ length: MEET_POOL.plates }, () => ({ kind: TRAIL_PLATE, x: 0, y: 0, z: 0, kg: 0, live: false })),
    },
    loose: Array.from({ length: MEET_POOL.loose }, () => ({
      kind: NO_PLATE, kg: 0, live: false, x: 0, y: 0, z: 0, born: 0, slot: -1, ox: 0, oz: 0, vx: 0, vz: 0, still: false, held: false,
    })),
    carried: Array.from({ length: CLOUD_POOL.gusts }, () => -1),
    thundered: Array.from({ length: CLOUD_POOL.clouds }, () => false),
    spray: { held: false, n: 0, at: 0, wx: 0, wz: 0 },
    baits: 0,
    baitDue: 0,
    struck: 0,
    fronts: 0,
    wind: 0,
    thunder: 0,
    bait: 0,
    scattered: 0,
    recovered: 0,
    lost: 0,
    runes: runes.state,
    ended: '',
  };
  // The wind across a trail being laid, or where a strike's plates spray, written by the sky
  // (windAt) into this one object.
  const wind = { x: 0, z: 0, front: 0, rough: 0 };
  const Z = CLOUD_ZONE;

  function clearTrail() {
    const { trail } = state;
    trail.live = false;
    for (let i = 0; i < trail.plates.length; i++) {
      const plate = trail.plates[i];
      plate.x = plate.y = plate.z = plate.kg = 0;
      plate.live = false;
    }
  }

  function clearPlate(plate) {
    plate.kind = NO_PLATE;
    plate.kg = plate.x = plate.y = plate.z = plate.born = plate.ox = plate.oz = plate.vx = plate.vz = 0;
    plate.slot = -1;
    plate.live = plate.still = plate.held = false;
  }

  function clearLoose() {
    for (let i = 0; i < state.loose.length; i++) clearPlate(state.loose[i]);
    state.spray.held = false;
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
    state.beastClose = false;
    state.since.strikes = state.since.stalls = state.since.cloud = 0;
    state.turned = state.deep = 0;
    state.lap.x = state.lap.z = state.lap.n = 0;
    const { ride, trail, spray } = state;
    ride.n = ride.x = ride.z = ride.seen = 0;
    ride.slot = -1;
    ride.generation = -1;
    ride.strong = false;
    clearTrail();
    trail.ride = trail.target = trail.x = trail.z = trail.ux = trail.uz = trail.gap = trail.slope = trail.born = 0;
    trail.boarded = -1;
    clearLoose();
    state.carried.fill(-1);
    state.thundered.fill(false);
    spray.n = spray.at = spray.wx = spray.wz = 0;
    state.baits = state.baitDue = state.struck = 0;
    state.fronts = state.wind = state.thunder = state.bait = state.scattered = state.recovered = state.lost = 0;
    runes.reset();
    state.ended = '';
  }

  // Puts `kg` on the bar: twice over under Tiwaz.
  function load(kg) {
    state.bar += state.runes.blessing.rune === RUNE.tiwaz ? kg * BLESSING.double : kg;
  }

  // How near a plate must be to load, in 3-D: much further under Fehu.
  const reachNow = () => (state.runes.blessing.rune === RUNE.fehu ? BLESSING.reach : TRAIL.reach);

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
  // up any plate the glider comes within `reach` of.
  function tend(world, reach) {
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
      if (dx * dx + dy * dy + dz * dz <= reach * reach) {
        plate.live = false;
        load(plate.kg);
        state.plates += 1;
        if (trail.boarded < 0) trail.boarded = elapsed;
      } else {
        left += 1;
      }
    }
    if (left === 0) trail.live = false;
  }

  // A strike past MEET.iron: under Tiwaz the whole bar is lost; otherwise it is split into
  // standard plates, largest first, held off the bar until the wing reopens (any kg past the
  // plates the pool holds is lost). Whatever a strike before it left flying is gone by now (a
  // strike's shield outlasts the collapse and the plates' life together), and goes regardless.
  function strike() {
    if (state.runes.blessing.rune === RUNE.tiwaz) {
      state.lost += state.bar;
      state.bar = 0;
      return;
    }
    let kg = state.bar;
    let n = 0;
    for (let i = LOOSE.scatter; i < LOOSE.wind; i++) clearPlate(state.loose[i]);
    for (let size = 0; size < SCATTER.plates.length && n < SCATTER.most; size++) {
      const weight = SCATTER.plates[size];
      while (kg >= weight && n < SCATTER.most) {
        const plate = state.loose[LOOSE.scatter + n];
        plate.kind = SCATTER_PLATE;
        plate.kg = weight;
        plate.held = true;
        kg -= weight;
        n += 1;
      }
    }
    state.lost += kg;
    state.bar = 0;
    state.spray.held = n > 0;
  }

  // The wing has reopened: the strike's plates spray out round the pilot, evenly from a seeded
  // bearing, each thrown outward through the air the pilot is in.
  function spray(world) {
    const sky = world.sky.state;
    const { pos } = world.g;
    const { spray: out } = state;
    let n = 0;
    while (n < SCATTER.most && state.loose[LOOSE.scatter + n].held) n += 1;
    const bearing = meetDraw(sky.seed, 200 + out.n) * TAU;
    world.sky.windAt(pos.x, pos.y, pos.z, wind);
    out.held = false;
    out.n += 1;
    out.at = sky.elapsed;
    out.wx = wind.x;
    out.wz = wind.z;
    for (let i = 0; i < n; i++) {
      const plate = state.loose[LOOSE.scatter + i];
      const angle = bearing + (i * TAU) / n;
      const sx = Math.sin(angle);
      const sz = -Math.cos(angle);
      plate.x = pos.x + sx * SCATTER.from;
      plate.y = pos.y;
      plate.z = pos.z + sz * SCATTER.from;
      plate.vx = sx * SCATTER.kick;
      plate.vz = sz * SCATTER.kick;
      plate.born = sky.elapsed;
      plate.held = false;
      plate.live = true;
    }
    state.scattered += n;
  }

  // A gust front due to reach the pilot soon carries its plates, laid on its line either side of
  // the lift the pilot is riding (or of the pilot, out of lift), once for each band.
  function front(world) {
    const sky = world.sky.state;
    const { pilot, gusts, thermals, elapsed } = sky;
    const slot = pilot.gustSlot;
    if (slot < 0 || pilot.gustAhead <= 0 || pilot.gustIn > WIND.lead) return;
    const band = gusts[slot];
    if (band.strength === 0 || state.carried[slot] === band.born) return;
    // A reused weather slot is a new front. Its predecessor's plates must not jump onto it.
    for (let i = LOOSE.wind; i < LOOSE.thunder; i++) {
      const plate = state.loose[i];
      if (plate.live && plate.slot === slot) clearPlate(plate);
    }
    state.carried[slot] = band.born;
    const { pos } = world.g;
    // The line across the band through the middle of the lift, measured as the sky measures a
    // band's lane, and the side the third plate goes on, beyond the second.
    const lift = pilot.thermal >= 0 ? thermals[pilot.thermal] : null;
    const x = lift ? lift.x : pos.x;
    const z = lift ? lift.z : pos.z;
    const side = (z - Z.z) * band.ux - (x - Z.x) * band.uz;
    const way = meetDraw(sky.seed, 300 + state.fronts) < 0.5 ? -1 : 1;
    let laid = 0;
    for (let i = LOOSE.wind; i < LOOSE.thunder && laid < WIND.count; i++) {
      const plate = state.loose[i];
      if (plate.live) continue;
      clearPlate(plate);
      plate.kind = WIND_PLATE;
      plate.kg = WIND.kg;
      plate.slot = slot;
      // One `aside` to either side, then on outward `gap` apart on the drawn side.
      plate.ox = side + (laid === 0 ? -way : way) * (WIND.aside + Math.max(0, laid - 1) * WIND.gap);
      plate.y = pos.y;
      plate.born = elapsed;
      plate.live = true;
      ride(plate, band, pos);
      laid += 1;
    }
    if (laid > 0) state.fronts += 1;
  }

  // Where a wind plate is on its front now, and whether the front has gone past the pilot with
  // it. Returns false once the front is `past` beyond the pilot.
  function ride(plate, band, pos) {
    plate.x = Z.x + band.at * band.ux - plate.ox * band.uz;
    plate.z = Z.z + band.at * band.uz + plate.ox * band.ux;
    const ahead = (pos.x - Z.x) * band.ux + (pos.z - Z.z) * band.uz - band.at;
    if (!plate.still) {
      if (ahead > 0) plate.y = pos.y;
      else plate.still = true;
    }
    return ahead >= -WIND.past;
  }

  // Clear air straight up from the pilot's chest to the nearest cloud base overhead, as the sky
  // works it out (headroomAt): which cloud that is, or -1.
  function overhead(sky, x, chest, z) {
    let room = Infinity;
    let found = -1;
    for (let i = 0; i < sky.clouds.length; i++) {
      const cloud = sky.clouds[i];
      if (cloud.fade < 0.05 || cloud.y < chest) continue;
      const dx = x - cloud.x;
      const dz = z - cloud.z;
      const lx = (dx * cloud.cos - dz * cloud.sin) / (cloud.rx * cloud.fade);
      const lz = (dx * cloud.sin + dz * cloud.cos) / (cloud.rz * cloud.fade);
      const flat = lx * lx + lz * lz;
      if (flat >= 1) continue;
      const gap = cloud.y - cloud.ry * cloud.fade * Math.sqrt(1 - flat) - chest;
      if (gap < room) {
        room = gap;
        found = i;
      }
    }
    return found;
  }

  // Where a cloud's base is over a point `ox, oz` from its middle, as a height; -Infinity if the
  // point is not under it, or the cloud has all but faded.
  function base(cloud, ox, oz) {
    if (cloud.fade < 0.05) return -Infinity;
    const lx = (ox * cloud.cos - oz * cloud.sin) / (cloud.rx * cloud.fade);
    const lz = (ox * cloud.sin + oz * cloud.cos) / (cloud.rz * cloud.fade);
    const flat = lx * lx + lz * lz;
    return flat < 1 ? cloud.y - cloud.ry * cloud.fade * Math.sqrt(1 - flat) : -Infinity;
  }

  // A pilot climbing toward a storm cloud's base that has had no plate yet gets one hung under it.
  function thunder(world) {
    const sky = world.sky.state;
    const { pilot } = sky;
    if (pilot.headroom > THUNDER.range || pilot.cloud > 0) return;
    const { pos } = world.g;
    const slot = overhead(sky, pos.x, pos.y + CLOUD_STRIKE.rise, pos.z);
    if (slot < 0 || state.thundered[slot]) return;
    const cloud = sky.clouds[slot];
    const dx = cloud.x - pos.x;
    const dz = cloud.z - pos.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const step = distance > THUNDER.inward ? THUNDER.inward / distance : 1;
    const ox = pos.x + dx * step - cloud.x;
    const oz = pos.z + dz * step - cloud.z;
    const under = base(cloud, ox, oz);
    if (under - THUNDER.below <= pos.y) return;
    state.thundered[slot] = true;
    const plate = state.loose[LOOSE.thunder];
    clearPlate(plate);
    plate.kind = THUNDER_PLATE;
    plate.kg = THUNDER.kg;
    plate.slot = slot;
    plate.ox = ox;
    plate.oz = oz;
    plate.x = cloud.x + ox;
    plate.y = under - THUNDER.below;
    plate.z = cloud.z + oz;
    plate.born = sky.elapsed;
    plate.live = true;
  }

  // The fog's bait, laid to one side of the pilot and kept inside the sky.
  function bait(world) {
    const sky = world.sky.state;
    const { pos, yaw } = world.g;
    let side = meetDraw(sky.seed, 100 + state.baits) < 0.5 ? -1 : 1;
    const reach = Z.r - BAIT.edge;
    for (let tries = 0; tries < 2; tries++) {
      const x = pos.x + Math.cos(yaw) * BAIT.aside * side;
      const z = pos.z + Math.sin(yaw) * BAIT.aside * side;
      const dx = x - Z.x;
      const dz = z - Z.z;
      if (dx * dx + dz * dz <= reach * reach || tries === 1) {
        const plate = state.loose[LOOSE.bait];
        clearPlate(plate);
        plate.kind = BAIT_PLATE;
        plate.kg = BAIT.kg;
        // Pulled in to the edge of the sky if neither side is inside it.
        const out = Math.sqrt(dx * dx + dz * dz);
        const pull = out > reach ? reach / out : 1;
        plate.x = Z.x + dx * pull;
        plate.y = Math.min(sky.fogHeight + BAIT.above, pos.y);
        plate.z = Z.z + dz * pull;
        plate.born = sky.elapsed;
        plate.live = true;
        state.baits += 1;
        return;
      }
      side = -side;
    }
  }

  // The loose plates for one step: each moves with what it rides and goes when its time is up,
  // and any the glider is within `reach` of is loaded.
  function tendLoose(world, dt, reach) {
    const sky = world.sky.state;
    const { pos } = world.g;
    const { elapsed } = sky;
    for (let i = 0; i < state.loose.length; i++) {
      const plate = state.loose[i];
      if (!plate.live) continue;
      let keep = true;
      if (plate.kind === WIND_PLATE) {
        const band = sky.gusts[plate.slot];
        keep = band.strength > 0 && band.born === state.carried[plate.slot] && ride(plate, band, pos);
      } else if (plate.kind === THUNDER_PLATE) {
        const cloud = sky.clouds[plate.slot];
        const under = base(cloud, plate.ox, plate.oz);
        plate.x = cloud.x + plate.ox;
        plate.y = under - THUNDER.below;
        plate.z = cloud.z + plate.oz;
        const dx = plate.x - pos.x;
        const dz = plate.z - pos.z;
        keep = under > -Infinity && elapsed - plate.born <= THUNDER.life && dx * dx + dz * dz <= THUNDER.far * THUNDER.far;
      } else if (plate.kind === BAIT_PLATE) {
        plate.y = Math.min(sky.fogHeight + BAIT.above, pos.y);
      } else if (plate.kind === SCATTER_PLATE) {
        const age = elapsed - plate.born;
        keep = age <= SCATTER.life;
        plate.x += (plate.vx + state.spray.wx) * dt;
        plate.z += (plate.vz + state.spray.wz) * dt;
        plate.vx -= plate.vx * SCATTER.drag * dt;
        plate.vz -= plate.vz * SCATTER.drag * dt;
        plate.y = pos.y - SCATTER.sink * age;
      }
      if (!keep) {
        clearPlate(plate);
        continue;
      }
      const dx = plate.x - pos.x;
      const dy = plate.y - pos.y;
      const dz = plate.z - pos.z;
      if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
      load(plate.kg);
      state.plates += 1;
      if (plate.kind === WIND_PLATE) state.wind += 1;
      else if (plate.kind === THUNDER_PLATE) state.thunder += 1;
      else if (plate.kind === BAIT_PLATE) {
        state.bait += 1;
        state.baitDue = elapsed + BAIT.again;
      } else state.recovered += 1;
      clearPlate(plate);
    }
  }

  function step(dt, world) {
    if (state.ended !== '' || !(dt > 0)) return;
    const sky = world.sky.state;
    const { pilot, thermals, elapsed } = sky;
    const { g } = world;
    const { ride, trail } = state;
    const iron = sky.peak >= MEET.iron;
    const reach = reachNow();

    // A strike since the last step, by a raven or a kettlebell: past MEET.iron it takes the bar's
    // plates with it (the contact light is the judge's, as ever).
    if (pilot.strikes > state.struck) {
      state.struck = pilot.strikes;
      if (state.bar > 0 && (iron || state.runes.blessing.rune === RUNE.tiwaz)) strike();
    }

    // The ride: whichever lift the pilot is in. A thermal at a new site is a new ride, even one
    // that has hopped to the same x to the metre, and a new ride starts its own circle.
    const slot = pilot.thermal;
    if (slot >= 0) {
      const thermal = thermals[slot];
      if (slot !== ride.slot || (thermal.generation ?? 0) !== ride.generation) {
        ride.n += 1;
        ride.slot = slot;
        ride.generation = thermal.generation ?? 0;
        ride.strong = false;
        state.turned = state.lap.x = state.lap.z = state.lap.n = 0;
      }
      ride.x = thermal.x;
      ride.z = thermal.z;
      if (thermal.strength >= TRAIL.dying) ride.strong = true;
      ride.seen = elapsed;
    }

    // Reps: the wing's own turning, counted the flock's way in a hunted thermal that still lifts.
    // A collapse, a stall (a spin with it), a front tuck or a tip collapse loses the circle in
    // progress, and so does turning the other way; the launch column has no flock to turn with.
    // A rep is judged for depth on where the circle went while it turned: centred on the core
    // (its mean position within `depth`), it loads the heavier plate.
    const { lap } = state;
    if (pilot.collapse > 0 || g.stall > 0 || g.tuck > 0) {
      state.turned = lap.x = lap.z = lap.n = 0;
    } else if (slot > 0 && thermals[slot].strength >= MEET.alive) {
      const thermal = thermals[slot];
      const way = g.yawRate * thermal.dir;
      if (way < -MEET.against) {
        state.turned = lap.x = lap.z = lap.n = 0;
      } else if (way > 0) {
        state.turned += way * dt;
        // Measure the circle in the moving air mass rather than against a fixed map point.
        lap.x += g.pos.x - thermal.x;
        lap.z += g.pos.z - thermal.z;
        lap.n += 1;
        if (state.turned >= TAU) {
          state.turned -= TAU;
          const dx = lap.x / lap.n;
          const dz = lap.z / lap.n;
          const deep = dx * dx + dz * dz <= MEET.depth * MEET.depth;
          state.reps += 1;
          if (deep) state.deep += 1;
          load(deep ? MEET.deep : MEET.rep);
          lap.x = lap.z = lap.n = 0;
        }
      }
    }

    // Trails: one for each ride that ends while still recent, by its lift moving on or dropping
    // under `dying`. A thermal still blooming has not dropped, and nor has a spent launch column
    // flown back into. None is laid once the sky has ended.
    if (sky.active && ride.n > 0 && trail.ride !== ride.n && elapsed - ride.seen <= TRAIL.recent) {
      const thermal = thermals[ride.slot];
      const moved = (thermal.generation ?? 0) !== ride.generation;
      if (moved || (ride.strong && thermal.strength < TRAIL.dying)) lay(world);
    }
    if (trail.live) tend(world, reach);

    // Close calls, as the kettlebells count them, the Beast's at its own weight.
    const bells = world.bells;
    if (bells && bells.state.close > state.close) {
      let kg = (bells.state.close - state.close) * MEET.close;
      if (!state.beastClose && bells.state.beast.result === BELL_RESULT.close) {
        state.beastClose = true;
        kg += MEET.beast - MEET.close;
      }
      load(kg);
      state.close = bells.state.close;
    }

    // The iron off the trail: a strike's plates spray as the wing reopens; past MEET.iron the
    // fronts, the thunder and (after the horn) the fog lay theirs; and the loose plates move on.
    if (state.spray.held && pilot.collapse === 0) spray(world);
    if (sky.active && iron) {
      front(world);
      if (!state.loose[LOOSE.thunder].live) thunder(world);
      if (state.horn && !state.loose[LOOSE.bait].live && elapsed >= state.baitDue && g.pos.y - sky.fogHeight <= BAIT.near) bait(world);
    }
    tendLoose(world, dt, reach);

    // The rune gates, raised, flown through or crumbled.
    runes.step(dt, world);

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
   * counts, and nothing of the trail, the loose plates or the gates is left to fly through.
   */
  function finish(reason, world) {
    if (state.ended !== '') return;
    const judged = isJudgedEnding(reason);
    state.ended = judged ? reason : 'quit';
    if (judged) judge(world, 0, false);
    clearTrail();
    clearLoose();
    runes.finish(world);
  }

  return { reset, step, finish, get state() { return state; } };
}
