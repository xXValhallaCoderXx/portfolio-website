// The reference pilot: a simple, fixed way of flying a run, used by the tests to pin the game's
// balance and, flown on the day's sky, as a rival to beat. It flies to the nearest good lift and
// circles in its core, turning the way that thermal's ravens turn (or against them), and never
// reacts to a raven, a cloud or a gust. Reflexes can be added for Good Lift's meet: one for
// Hrungnir's kettlebells, one for the trail of plates, one for the rune gates and one for the
// plates a strike sprays off the bar. It bounds what a player can do; it is not a player.
import { BRAKE, FLIGHT, pitchPeak } from './flight.js';
import { RUN, finishRun, stepRun } from './run-step.js';
import { PLATE_KIND } from './meet-state.js';
import { GATE, GATES, RUNE } from './meet-runes.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

// TST, the test pilot: the light brake eased, turning with each flock, and changing what it is
// doing 0.4 s into every kettlebell's warning. It is the dodger good-lift.test.js pins the meet's
// balance on, so the bot a player races on the day's sky is the pilot the tests fly. It chases no
// plate and seeks no gate.
export const TST = Object.freeze({ withFlock: true, brake: 'eased', react: 0.4 });

// How every reference pilot catches its own wing, as the hints tell a player to: once the wing is
// surging toward a peak more than `surge` rad ahead (pitchPeak), the brake on `react` seconds later
// and held till the wing swings back; and a fold pumped open twice, each pump held `hold` seconds
// and let go for `gap` before the next (CLOUD_STRIKE.pump). Counted in whole steps, from the step
// the surge set in or the wing folded.
export const CATCH = Object.freeze({ react: 0.4, surge: 0.8, hold: 0.35, gap: 0.1 });

// How a gate-taker times its dash out of its climb to a rune stone and back.
//   ahead    rad: how far off its nose a stone may be for it to set off for it
//   carry    how much of its climb the wing keeps on the way out: it sets off when its height, with
//            that share of its climb over the flight out, would put it at or over the line and at
//            least `low` metres under the opening's top, and comes back on the light brake to
//            within `home` metres of the middle the stones stand round
export const DASH = Object.freeze({ ahead: 0.8, carry: 1, low: 4, home: 12 });

// The runes worth a dash to a pilot that flies as TST does: Fehu and Tiwaz. Algiz turns aside a
// bell that changing what it does 0.4 s into the warning dodges anyway, and Ansuz's motes are for
// a player's eyes, worth nothing to a pilot that steers by the thermals' own numbers. Every dash
// costs about the same climb, a tenth of a pass of 1,000 m for each stone taken (over 800 skies TST
// dashing for any stone took 597 and passed on 577 skies to TST's 640), so the rune decides whether
// it pays. Over those skies TST dashing for one rune's stone alone banked a mean 13 ± 3 kg a run
// more than TST for Fehu's, 4 ± 2 more for Tiwaz's, and 4 ± 2 less for Algiz's or for Ansuz's; for
// Fehu's or Tiwaz's, 16 ± 3 more. The collector banked 5 ± 3 kg a run more dashing for Fehu's or
// Tiwaz's than for those and Algiz's, and 28 ± 5 more than for none.
export const WORTH_RUNES = Object.freeze([RUNE.fehu, RUNE.tiwaz]);

// The plates off the trail are left to chance by the collector, as by TST: to a pilot that climbs
// as these do, none is worth going out of the way for. Measured for the collector over 800 skies,
// each reflex against flying through the plates only by chance (a mean TOTAL a run, ± its standard
// error over the skies): going for any plate it could meet within 0.6 s, flying straight (a gust
// front's, one under a cloud, or its own sprayed ones), met hardly more of them (1.14 a run off the
// fronts against 1.12) and banked no more (0 ± 4 kg); going for the fog's bait once the fog would
// bring it up within 6 s caught it on a third of skies more (0.35 a run against 0.03) and banked
// 1 ± 2 kg less, the detours that missed it costing more than the catches won; and circling back
// through its own sprayed plates (`recover`) caught half a plate more a run (1.35 against 0.84) but
// banked 10 ± 3 kg less, and passed 1,000 m on 55 skies fewer. Circling back only for a heavy bar
// (25 kg or more sprayed) within 20 m of the lift's middle still cost 1 ± 2 kg.

/**
 * `brake` is what its hands do while it circles: 'none' keeps them up, 'eased' holds the light
 * brake and lets go for a fifth of a second just before it would go deep, 'late' does that two
 * seconds after it has, and 'held' never lets go.
 *
 * `react` is how many seconds into a kettlebell's warning it changes what it is doing, the way
 * the hint tells a player to (null: it never does). Circling off the bar, it pushes the bar and
 * keeps circling; flying straight or already on the bar, it turns hard, against any turn it was
 * making. The bell says which it was doing when it was thrown, as it does for the hint.
 *
 * `collect`, while the meet has a trail of plates laid from a dying lift, flies it plate by plate
 * on the bar, as the hint says, and goes back to the lift once no plate is left ahead. Any plate
 * off the trail it meets only by chance (above).
 *
 * `gates` flies through a rune stone at each height: any stone (`true`), or only one whose rune is
 * in a list of RUNE numbers, whichever such stone comes first nearly ahead, dashing out of its
 * climb when it will get there over the line and inside the opening, and back. A collector takes
 * Fehu's or Tiwaz's (WORTH_RUNES) unless told otherwise.
 *
 * `recover` circles back through its own plates as a strike sprays them, turning hard on the light
 * brake for the nearest while they last, which sweeps the tight circle that flies back through
 * them: the way to catch them back, though not one that pays this pilot (above).
 *
 * `catches`, on for every pilot unless told otherwise, catches a surging wing with the brake and
 * pumps a fold open (CATCH) over whatever else it was doing: the wing comes first. Told not to, it
 * flies as a player who knows none of it.
 *
 * `tricks` flies one trick, once, as soon as the wing is `from` metres up: `{ swaps, from }` holds a
 * turn a moment and then reverses it as each swing tops out (the swing watch's tops), `swaps` times,
 * for a set of wingovers; `{ pumps, from }`, circling on as it was, lets go of the brake and presses
 * it, and then pitches the wing, pressing a fifth of a second after each forward peak and letting go
 * a fifth after each back one, until it has peaked ahead `pumps` times, and then catches it, braking
 * while it swings forward. Then it flies on until the set has landed (or been lost) and goes back to
 * flying as before. Over everything else while it lasts, but for pumping a fold, and for catching a
 * surge once it is done pumping.
 *
 * `decide(world, intent)` writes what it asks of the wing this step into `intent`. Without the
 * kettlebells and the meet in the world, or without `react`, `collect`, `gates` and `recover`, it
 * flies exactly as it always has, but for catching its wing.
 */
export function createReferencePilot({
  withFlock = true, brake = 'none', react = null, collect = false, gates = collect ? WORTH_RUNES : false, recover = false, catches = true,
  tricks = null,
} = {}) {
  // The circle it aims for round the middle of the lift: 11 m hands up and 6 m on any brake, inside
  // the 14.4 m and 8.2 m the wing turns at full rate, so that it circles as tight as it can. Aimed
  // at 14 m and 9 m, on the light brake it settled 12 to 15 m out, which cost nothing while a
  // hunted core stood flat out to 17 m. Now that one peaks at its middle (CLOUD_HUNT.peak), a circle
  // out there gets a fifth less lift than one round the middle; aimed tighter, half its circling is
  // within 13 m of it.
  const radius = brake === 'none' ? 11 : 6;
  let deepFor = 0;
  let tap = 0;
  // Which way it turns off a kettlebell's line: picked once for each warning, when it reacts, and
  // held until the bell has passed (0 until then). Picked afresh every step, it would undo its own
  // turn as soon as the wing answered and dither about straight: hit a quarter to a third of the
  // time, against under one bell in a hundred.
  let away = 0;
  // The rune stone it dashes for: the line of the set (made negative once it is done with it),
  // which stone, and how far it has got: 0 waiting for its moment, 1 out to the stone, 2 back. A
  // pilot is made for one run, as its other reflexes are.
  const dash = { line: 0, gate: -1, phase: 0 };
  // Steps the wing has been folded, and its pumps as steps: the first press `lead` steps in, each
  // held `hold` steps and let go for `gap`. Steps a surge that wants catching has been going, and
  // whether the brake is on it, held till the wing swings back.
  let folded = 0;
  let surged = 0;
  let catching = false;
  // The trick: 0 waiting for its height, 1 in a held turn before the first swap, 2 swapping or
  // pumping, 3 catching and flying level till it lands, 4 done; the watch's counts last step, the
  // turn or brake it holds, and a timer for the press or let-go to come.
  const trick = { phase: 0, at: 0, count: 0, tops: 0, fronts: 0, backs: 0, landed: 0, lost: 0, turn: 0, brake: false, wait: -1, want: false };
  const lead = Math.round(CATCH.react / RUN.step);
  const hold = Math.round(CATCH.hold / RUN.step);
  const gap = Math.round(CATCH.gap / RUN.step);

  // Steers straight at a point, hands up and off the bar.
  function steer(world, intent, x, z) {
    const { pos, yaw } = world.g;
    intent.turn = clamp(wrapAngle(Math.atan2(x - pos.x, -(z - pos.z)) - yaw) * 2.5, -1, 1);
    intent.brake = false;
    intent.bar = false;
  }

  // The next plate still ahead on the trail, flown straight at on the bar. A plate the pilot has
  // already passed along the trail is left behind: turning back for it would cost the rest.
  function follow(world, intent) {
    const trail = world.meet?.state.trail;
    if (!trail?.live) return false;
    const { pos, yaw } = world.g;
    const along = (pos.x - trail.x) * trail.ux + (pos.z - trail.z) * trail.uz;
    for (let i = 0; i < trail.plates.length; i++) {
      const plate = trail.plates[i];
      if (!plate.live || (plate.x - trail.x) * trail.ux + (plate.z - trail.z) * trail.uz < along) continue;
      intent.turn = clamp(wrapAngle(Math.atan2(plate.x - pos.x, -(plate.z - pos.z)) - yaw) * 2.5, -1, 1);
      intent.brake = false;
      intent.bar = true;
      return true;
    }
    return false;
  }

  // Its own plates, sprayed round where the wing reopened: it turns hard on the light brake for the
  // nearest, which sweeps the tight circle that flies back through them.
  function circleBack(world, intent) {
    const meet = world.meet?.state;
    if (!meet) return false;
    const { pos, yaw } = world.g;
    let best = Infinity;
    let target = null;
    for (let i = 0; i < meet.loose.length; i++) {
      const plate = meet.loose[i];
      if (!plate.live || plate.kind !== PLATE_KIND.scatter) continue;
      const dx = plate.x - pos.x;
      const dz = plate.z - pos.z;
      const distance = dx * dx + dz * dz;
      if (distance < best) {
        best = distance;
        target = plate;
      }
    }
    if (!target) return false;
    intent.turn = clamp(wrapAngle(Math.atan2(target.x - pos.x, -(target.z - pos.z)) - yaw) * 2.5, -1, 1);
    intent.brake = true;
    intent.bar = false;
    return true;
  }

  // The dash out of its climb through a rune stone. It keeps circling until a stone it would take
  // is nearly ahead and the climb on the way out would bring the wing over the line and into the
  // opening (so the line is never put off for a stone); then it flies straight through the stone,
  // hands up, and straight back to the middle the stones stand round on the light brake, so the
  // turn back is tight. Past the stone beside its opening, or climbed over its top, it gives the
  // set up and comes back the same way. Wanting a rune the set offers, it waits for that stone.
  function gate(world, intent) {
    const runes = world.meet?.state.runes;
    if (!runes || runes.line === 0) return false;
    const { pos, vy, yaw } = world.g;
    const stones = runes.gates;
    // A new set raised: nothing picked yet. A set it is done with is marked by its line made negative.
    if (Math.abs(dash.line) !== runes.line) {
      dash.line = runes.line;
      dash.gate = -1;
      dash.phase = 0;
    }
    if (dash.line < 0) return false;
    if (dash.phase === 1) {
      const stone = stones[dash.gate];
      const off = wrapAngle(Math.atan2(stone.x - pos.x, -(stone.z - pos.z)) - yaw);
      if (stone.state === GATE.waiting && pos.y <= stone.y + GATES.tall && Math.abs(off) <= Math.PI / 2) {
        steer(world, intent, stone.x, stone.z);
        return true;
      }
      dash.phase = 2;
    }
    if (dash.phase === 2) {
      let cx = 0;
      let cz = 0;
      for (let i = 0; i < stones.length; i++) {
        cx += stones[i].x / stones.length;
        cz += stones[i].z / stones.length;
      }
      const dx = cx - pos.x;
      const dz = cz - pos.z;
      if (dx * dx + dz * dz <= DASH.home * DASH.home) {
        dash.line = -runes.line;
        return false;
      }
      steer(world, intent, cx, cz);
      intent.brake = true;
      return true;
    }
    for (let i = 0; i < stones.length; i++) {
      const stone = stones[i];
      // Only a stone with a rune it would take, if it was told which.
      if (stone.state !== GATE.waiting || (Array.isArray(gates) && !gates.includes(stone.rune)) || pos.y > stone.y + GATES.tall) continue;
      const dx = stone.x - pos.x;
      const dz = stone.z - pos.z;
      if (Math.abs(wrapAngle(Math.atan2(dx, -dz) - yaw)) > DASH.ahead) continue;
      const arrive = pos.y + Math.max(0, vy) * (Math.sqrt(dx * dx + dz * dz) / FLIGHT.speed.trim) * DASH.carry;
      if (arrive < stone.y || arrive > stone.y + GATES.tall - DASH.low) continue;
      dash.phase = 1;
      dash.gate = i;
      return gate(world, intent);
    }
    return false;
  }

  // Changes what it is doing `react` seconds into a kettlebell's warning, until the bell has hit
  // or passed. The bar only comes on with the brake let go, so a light-braked circle lets it go.
  function dodge(world, intent) {
    const bells = world.bells?.state;
    if (!bells || bells.warning < 0) {
      away = 0;
      return;
    }
    const bell = bells.bells[bells.warning];
    // The run clock is a sum of fixed steps, so it is given half a step to spare: `react` is then
    // a whole number of steps (0.4 s is the 24th), never one more when the sum rounds just under.
    if (world.sky.state.elapsed - bell.at < react - RUN.step / 2) return;
    if (bell.circling) {
      intent.bar = true;
      intent.brake = false;
    } else {
      if (away === 0) away = -(Math.sign(world.g.yawRate) || 1);
      intent.turn = away;
    }
  }

  // Flies the trick it was told to, once: wingovers by the tops of the swing, or a pitched swing by
  // its peaks, then level till the set lands. Says whether it had the wing this step.
  function trickWing(world, intent) {
    const { g, watch, style } = world;
    const w = watch.state;
    if (trick.phase === 4) return false;
    if (trick.phase === 0) {
      if (g.pos.y < tricks.from || world.sky.state.pilot.collapse > 0 || g.stall > 0) return false;
      trick.phase = 1;
      trick.at = world.sky.state.elapsed;
      trick.turn = tricks.swaps ? 1 : 0;
      trick.brake = false;
      Object.assign(trick, { tops: w.tops, fronts: w.fronts, backs: w.backs, landed: style?.state.landed ?? 0, lost: style?.state.lost ?? 0 });
    }
    const elapsed = world.sky.state.elapsed;
    if (trick.phase === 1) {
      // A turn held long enough to settle into it, then the first swap; or hands up a moment, the
      // brake let go, and then the first press.
      if (tricks.swaps && elapsed - trick.at >= 3) {
        trick.turn = -1;
        trick.phase = 2;
      } else if (tricks.pumps) {
        trick.brake = elapsed - trick.at >= 1;
        if (trick.brake) trick.phase = 2;
      }
    } else if (trick.phase === 2) {
      if (tricks.swaps && w.tops > trick.tops) {
        trick.tops = w.tops;
        trick.count += 1;
        trick.turn = trick.count >= tricks.swaps ? 0 : -w.topSide;
        if (trick.count >= tricks.swaps) trick.phase = 3;
      }
      if (tricks.pumps) {
        if (w.fronts > trick.fronts) {
          trick.fronts = w.fronts;
          trick.count += 1;
          if (trick.count >= tricks.pumps) trick.phase = 3;
          else [trick.wait, trick.want] = [Math.round(0.2 / RUN.step), true];
        }
        if (w.backs > trick.backs) {
          trick.backs = w.backs;
          [trick.wait, trick.want] = [Math.round(0.2 / RUN.step), false];
        }
        if (trick.wait >= 0 && trick.wait-- === 0) trick.brake = trick.want;
      }
    }
    if (trick.phase === 3) {
      // Caught and flown level: the brake on while the wing still swings forward, and hands up.
      if (tricks.swaps) trick.turn = 0;
      trick.brake = !!tricks.pumps && g.pitchRate < 0 && g.pitch < 0;
      const done = style ? style.state.landed > trick.landed || style.state.lost > trick.lost : w.calm >= 1.5;
      if (done || elapsed - trick.at > 40) {
        trick.phase = 4;
        return false;
      }
    }
    // A pitched swing is flown circling on as before; wingovers have the turn to themselves.
    if (tricks.swaps) intent.turn = trick.turn;
    intent.brake = trick.brake;
    intent.bar = false;
    return true;
  }

  // Catches its own wing: the brake `react` seconds into a surge, held till it swings back, and two
  // pumps into a fold.
  function catchWing(world, intent) {
    const { g } = world;
    if (world.sky.state.pilot.collapse > 0) {
      const k = folded - lead;
      folded += 1;
      intent.brake = k >= 0 && k < 2 * (hold + gap) && k % (hold + gap) < hold;
      intent.bar = false;
      surged = 0;
      catching = false;
      return;
    }
    folded = 0;
    if (catching && g.pitchRate < 0 && g.tuck === 0) {
      intent.brake = true;
      intent.bar = false;
      return;
    }
    catching = false;
    surged = g.pitchRate < 0 && pitchPeak(g) < -CATCH.surge ? surged + 1 : 0;
    if (surged > lead) {
      catching = true;
      intent.brake = true;
      intent.bar = false;
    }
  }

  return {
    decide(world, intent) {
      const { sky, g } = world;
      const { state } = sky;
      let target = null;
      let nearest = Infinity;
      for (const thermal of state.thermals) {
        const distance = Math.hypot(thermal.x - g.pos.x, thermal.z - g.pos.z);
        if (thermal.live && thermal.strength >= 0.3 && distance < nearest) [target, nearest] = [thermal, distance];
      }
      let turn = 0;
      if (target) {
        const bearing = Math.atan2(target.x - g.pos.x, -(target.z - g.pos.z));
        const dir = target === state.thermals[0] ? 1 : withFlock ? target.dir : -target.dir;
        // Head straight in, then hold a circle by aiming along it and a little inward.
        const want = nearest > 30 ? bearing : bearing - dir * (Math.PI / 2) * clamp(1 - (nearest - radius) / 28, 0, 1.4);
        turn = clamp(wrapAngle(want - g.yaw) * 2.5, -1, 1);
      }
      deepFor = g.brake >= BRAKE.shelf ? deepFor + RUN.step : 0;
      if (tap <= 0 && ((brake === 'eased' && g.brake > BRAKE.shelf - 0.01) || (brake === 'late' && deepFor >= 2))) tap = 0.2;
      tap -= RUN.step;
      intent.turn = turn;
      intent.brake = brake !== 'none' && target !== null && nearest <= 30 && sky.inside(g.pos) && tap <= 0 && g.stall === 0;
      intent.bar = false;
      // The reflexes come after the lift is chosen: a gate it has set off for, then its own sprayed
      // plates, the trail, and a kettlebell over them all.
      if (!(gates && gate(world, intent)) && !(recover && circleBack(world, intent)) && collect) follow(world, intent);
      if (react !== null) dodge(world, intent);
      // Pumping a swing on purpose, it lets it surge: the catch comes once the pumps are done.
      const pitching = tricks && trickWing(world, intent) && trick.phase === 2 && !!tricks.pumps;
      if (catches && !pitching) catchWing(world, intent);
      return intent;
    },
    /** Whether its hands are on the brake catching a surge, over whatever else it would do. */
    get catching() {
      return catching;
    },
  };
}

/**
 * Flies `pilot` through a run already started on `world` (see startRun) until the run ends or
 * `limit` seconds have gone, and says how it went. A run that ends is finished the way every run
 * is (finishRun): its meet, if it has one, judges what is left on the bar. One cut short by `limit`
 * has not ended, and is left for the caller to fly on or finish.
 */
export function flyPilot(world, pilot, { limit = 200 } = {}) {
  const { state } = world.sky;
  const intent = { turn: 0, brake: false, bar: false };
  let reason = null;
  while (!reason && state.elapsed < limit) {
    pilot.decide(world, intent);
    reason = stepRun(world, intent, RUN.step);
  }
  if (reason) finishRun(world, reason);
  return { peak: state.peak, strikes: state.pilot.strikes, stalls: world.stalls, tucks: world.tucks, tips: world.tips, seconds: state.elapsed, cloud: state.pilot.cloudTime, reason };
}
