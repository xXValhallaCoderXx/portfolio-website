// The reference pilot: a simple, fixed way of flying a run, used by the tests to pin the game's
// balance and, flown on the day's sky, as a rival to beat. It flies to the nearest good lift and
// circles in its core, turning the way that thermal's ravens turn (or against them), and never
// reacts to a raven, a cloud or a gust. Reflexes can be added for Good Lift's meet: one for
// Hrungnir's kettlebells, one for the trail of plates, one for the rune gates and one for the
// plates a strike sprays off the bar. It bounds what a player can do; it is not a player.
import { FLIGHT, pitchPeak } from './flight.js';
import { RUN, finishRun, stepRun } from './run-step.js';
import { PLATE_KIND } from './meet-state.js';
import { GATE, GATES, RUNE } from './meet-runes.js';
import { inputBits } from './recorder.js';
import { cloudThermalRemaining } from './cloudbase-state.js';
import { createFlightCoach } from './flight-coach.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

// TST, the test pilot: the light brake eased, turning with each flock, and changing what it is
// doing 0.4 s into every kettlebell's warning. It is the dodger good-lift.test.js pins the meet's
// balance on, so the bot a player races on the day's sky is the pilot the tests fly. It chases no
// plate and seeks no gate.
export const TST = Object.freeze({ withFlock: true, brake: 'eased', react: 0.4 });

/** A canonical keyboard trace: short left/right holds approximate the pilot's continuous ask. */
export function createReferenceKeys(options = TST, { hold = 9, chord = false } = {}) {
  if (!Number.isInteger(hold) || hold < 1) throw new RangeError('key hold must be a positive number of fixed steps');
  const pilot = createReferencePilot(options);
  const intent = { turn: 0, brake: false, deepBrake: false, bar: false, ears: false };
  const held = { left: false, right: false, brake: false, deepBrake: false, bar: false, ears: false };
  let side = 0;
  let on = 0;
  return (world) => {
    pilot.decide(world, intent);
    const phase = world.steps % hold;
    if (phase === 0) {
      side = Math.sign(intent.turn);
      on = Math.round(Math.abs(intent.turn) * hold);
    }
    const turn = phase < on ? side : 0;
    held.left = turn < 0;
    held.right = turn > 0;
    held.brake = !!intent.brake;
    held.deepBrake = !!intent.deepBrake;
    held.ears = !!intent.ears;
    held.bar = !!intent.bar;
    if (chord && held.bar && turn === 0 && !held.brake && !held.ears) {
      held.left = held.right = true;
      held.bar = false;
    }
    return inputBits(held);
  };
}

// How every reference pilot catches its own wing, as the hints tell a player to: once the wing is
// surging toward a peak more than `surge` rad ahead (pitchPeak), the brake on `react` seconds later
// and held till the wing swings back; and a fold, a strike's or a front collapse, pumped open twice,
// each pump held `hold` seconds and let go for `gap` before the next (CLOUD_STRIKE.pump, TUCK.pump).
// Counted in whole steps, from the step the surge set in or the wing folded.
export const CATCH = Object.freeze({ react: 0.4, surge: 0.8, hold: 0.35, gap: 0.1 });

// How a gate-taker times its dash out of its climb to a rune stone and back.
//   ahead    rad: how far off its nose a stone may be for it to set off for it
//   carry    how much of its climb the wing keeps on the way out: it sets off when its height, with
//            that share of its climb over the flight out, would put it at or over the line and at
//            least `low` metres under the opening's top, and comes back on the light brake to
//            within `home` metres of the middle the stones stand round
export const DASH = Object.freeze({ ahead: 0.8, carry: 1, low: 4, home: 12 });

// A gate-seeking collector prefers the reach and double-loading blessings.
export const WORTH_RUNES = Object.freeze([RUNE.fehu, RUNE.tiwaz]);

/**
 * A deterministic soaring pilot. `brake: 'none'` uses hands-up circles; the other legacy labels
 * all hold the same common brake. `react` is the delay before dodging a kettlebell (null ignores
 * it). `collect`, `gates` and `recover` add plate, rune and scatter detours.
 *
 * `tricks` requests a physical move at `from` metres: alternating turns for `swaps` wingover
 * peaks, an energetic inversion for `loops`, or brake cycles for `pumps`. Recovery always follows
 * the observed wing; no maneuver enters through a key threshold or scripted angle.
 */
export function createReferencePilot({
  withFlock = true, brake = 'none', react = null, collect = false, gates = collect ? WORTH_RUNES : false, recover = false, catches = true,
  tricks = null,
} = {}) {
  // Aim within the new wing's practical turning radius, with wind compensation below.
  const radius = brake === 'none' ? 25 : 18;
  let followed = 0;
  let followedGeneration = -1;
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
  // Intentional reference maneuvers use the same observed cues a player sees. Their only
  // authority is the controls emitted below; all motion and rewards remain physical.
  const trickCoach = createFlightCoach();
  const trick = { phase: 0, at: 0, armedAt: 0, movesAt: 0, loopsAt: 0, topsAt: 0, frontsAt: 0, landed: 0, lost: 0,
    following: false, pending: null, applyAt: 0,
    hands: { left: false, right: false, brake: false, deepBrake: false, bar: false, ears: false } };
  const lead = Math.round(CATCH.react / RUN.step);
  const hold = Math.round(CATCH.hold / RUN.step);
  const gap = Math.round(CATCH.gap / RUN.step);

  // Steers straight at a point, hands up and off the bar.
  function steer(world, intent, x, z) {
    const { pos } = world.g;
    const yaw = world.g.track ?? world.g.yaw;
    intent.turn = clamp(wrapAngle(Math.atan2(x - pos.x, -(z - pos.z)) - yaw) * 2.5, -1, 1);
    intent.brake = false;
    intent.bar = false;
  }

  // The next plate still ahead on the trail, flown straight at on the bar. A plate the pilot has
  // already passed along the trail is left behind: turning back for it would cost the rest.
  function follow(world, intent) {
    const trail = world.meet?.state.trail;
    if (!trail?.live) return false;
    const { pos } = world.g;
    const yaw = world.g.track ?? world.g.yaw;
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
    const { pos } = world.g;
    const yaw = world.g.track ?? world.g.yaw;
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

  // First release ordinary navigation and wait for a genuinely steady rig. A short deliberate
  // deep pull then opens acro authority. Wingover/pitch corrections follow real semantic cues
  // with 0.2s reaction; inversion entry is a reproducible input trace, never a prescribed orbit.
  function trickWing(world, intent) {
    const { g, watch, style } = world, w = watch.state, elapsed = world.sky.state.elapsed;
    if (trick.phase === 4) return false;
    if (trick.phase === 0) {
      if (g.pos.y < tricks.from || world.sky.state.pilot.collapse > 0 || g.stall > 0) return false;
      trick.phase = 1; trick.at = elapsed;
      trick.movesAt = w.moves; trick.loopsAt = g.loops;
      trick.topsAt = w.tops; trick.frontsAt = w.fronts;
      trick.landed = style?.state.landed ?? 0; trick.lost = style?.state.lost ?? 0;
      trickCoach.reset();
    }
    if (style && style.state.landed > trick.landed) {
      const more = tricks.loops ? g.loops - trick.loopsAt < tricks.loops :
        tricks.swaps ? w.tops - trick.topsAt < tricks.swaps : w.fronts - trick.frontsAt < tricks.pumps;
      if (more) {
        trick.phase = 1; trick.following = false; trick.pending = null;
        trick.landed = style.state.landed; trick.movesAt = w.moves; trickCoach.reset();
      } else { trick.phase = 4; return false; }
    }
    if (elapsed - trick.at > 100 || (style && style.state.lost > trick.lost)) {
      trick.phase = 4; return false;
    }
    const h = trick.hands;
    if (trick.phase === 1) {
      Object.assign(h, { left: false, right: false, brake: false, deepBrake: false, bar: false });
      if (w.calm >= 1 && Math.abs(g.bank) < 0.175) {
        trick.phase = tricks.loops ? 5 : 2; trick.armedAt = world.steps;
      }
    }
    const ticks = world.steps - trick.armedAt;
    if (trick.phase === 5) {
      const entry = ticks < 580;
      h.left = entry && ticks >= 285; h.right = entry && ticks < 285;
      h.deepBrake = ticks < 12; h.brake = h.deepBrake || !entry && g.pitch < 0;
      h.bar = entry;
      // Additional requested orbits start only after a real complete recovery, with fresh input.
      if (g.loops > trick.loopsAt && g.loops - trick.loopsAt < tricks.loops && w.calm >= 1) trick.armedAt = world.steps;
      if (g.loops - trick.loopsAt >= tricks.loops && !style && w.calm >= 1) { trick.phase = 4; return false; }
    } else if (trick.phase === 2) {
      const kind = tricks.swaps ? 'wingover' : 'pitch';
      const message = trickCoach.step(RUN.step, { g, watch: w, style: style?.state, input: h,
        clearance: world.air.clearance ?? Infinity,
        fogClearance: Number.isFinite(world.sky.state.fogHeight) ? g.pos.y - world.sky.state.fogHeight : Infinity, eligible: true });
      if (message?.context === kind) trick.following = true;
      if (trick.pending && world.steps >= trick.applyAt) {
        const m = trick.pending;
        for (const key of m.release) h[key] = false;
        if (m.release.includes('brake')) h.deepBrake = false;
        for (const key of m.hold) h[key] = true;
        if (m.hold.includes('brake')) h.deepBrake = m.brakeDepth === 'deep';
        trick.pending = null;
      }
      if (!trick.following) {
        const turn = kind === 'wingover' ? ticks < 270 ? 1 : -1 : 0;
        h.left = turn < 0; h.right = turn > 0;
        h.deepBrake = kind === 'wingover' ? ticks < 12 : Math.floor(ticks / 180) % 2 === 0;
        h.brake = h.deepBrake; h.bar = false;
      } else if (!trick.pending && message && (message.hold.some(key => !h[key]) ||
          message.release.some(key => h[key]) || message.hold.includes('brake') && h.deepBrake !== (message.brakeDepth === 'deep'))) {
        trick.pending = message; trick.applyAt = world.steps + 12;
      }
      if (!style && w.moves > trick.movesAt && w.calm >= 1) { trick.phase = 4; return false; }
    }
    intent.turn = Number(h.right) - Number(h.left);
    intent.brake = h.brake; intent.deepBrake = h.deepBrake; intent.bar = h.bar;
    return true;
  }

  // Catches its own wing: the brake `react` seconds into a surge, held till it swings back, and two
  // pumps into a fold, a strike's or a front collapse's alike.
  function catchWing(world, intent) {
    const { g } = world;
    if (world.sky.state.pilot.collapse > 0 || g.tuck > 0) {
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
      intent.deepBrake = false;
      const { sky, g } = world;
      const { state } = sky;
      let target = null;
      let nearest = Infinity;
      const previous = state.thermals[followed];
      const available = (thermal, distance) => thermal.live && thermal.strength >= 0.35 &&
        (thermal === state.thermals[0] || cloudThermalRemaining(thermal) >= Math.max(25, distance / Math.max(8, g.speed) + 15));
      if (previous && available(previous, Math.hypot(previous.x - g.pos.x, previous.z - g.pos.z)) &&
          (followedGeneration < 0 || previous.generation === followedGeneration)) {
        target = previous;
        nearest = Math.hypot(previous.x - g.pos.x, previous.z - g.pos.z);
      }
      if (!target) for (const thermal of state.thermals) {
        const distance = Math.hypot(thermal.x - g.pos.x, thermal.z - g.pos.z);
        if (available(thermal, distance) && distance < nearest) [target, nearest] = [thermal, distance];
      }
      // Keep a safe circle while the next cells bloom rather than leaving straight through the
      // arena edge when every candidate is temporarily too old to reach.
      if (!target && previous && previous.generation === followedGeneration) {
        target = previous;
        nearest = Math.hypot(previous.x - g.pos.x, previous.z - g.pos.z);
      }
      if (target) {
        followed = state.thermals.indexOf(target);
        followedGeneration = target.generation;
      }
      let turn = 0;
      if (target) {
        const dir = target === state.thermals[0] ? 1 : withFlock ? target.dir : -target.dir;
        // Follow a point ahead on a core-relative circle, allowing the wing time to bank. Rate
        // damping prevents alternating overcorrections as the pilot enters a drifting cell.
        const angle = Math.atan2(g.pos.x - target.x, -(g.pos.z - target.z)) + dir * 0.8;
        const x = target.x + (target.vx || 0) + Math.sin(angle) * radius - (world.air.windX || 0) * 1.5;
        const z = target.z + (target.vz || 0) - Math.cos(angle) * radius - (world.air.windZ || 0) * 1.5;
        const want = Math.atan2(x - g.pos.x, -(z - g.pos.z));
        turn = clamp(wrapAngle(want - (g.track ?? g.yaw)) * 1.2 - g.yawRate, -1, 1);
      }
      intent.turn = turn;
      intent.brake = brake !== 'none' && target !== null &&
        (target === state.thermals[0] || nearest <= target.r * 1.5) && sky.inside(g.pos);
      intent.bar = false;
      // The reflexes come after the lift is chosen: a gate it has set off for, then its own sprayed
      // plates, the trail, and a kettlebell over them all.
      if (!(gates && gate(world, intent)) && !(recover && circleBack(world, intent)) && collect) follow(world, intent);
      if (react !== null) dodge(world, intent);
      // Pumping a swing on purpose, it lets it surge: the catch comes once the pumps are done.
      const maneuver = tricks && trickWing(world, intent);
      if (catches && !maneuver) catchWing(world, intent);
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
export function flyPilot(world, pilot, { limit = RUN.seconds } = {}) {
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
