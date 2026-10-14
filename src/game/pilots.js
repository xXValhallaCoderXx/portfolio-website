// The reference pilot: a simple, fixed way of flying a run, used by the tests to pin the game's
// balance and, flown on the day's sky, as a rival to beat. It flies to the nearest good lift and
// circles in its core, turning the way that thermal's ravens turn (or against them), and never
// reacts to a raven, a cloud or a gust. Two reflexes can be added for Good Lift's meet: one for
// Hrungnir's kettlebells and one for the plates a dying lift leaves on the way to the next. It
// bounds what a player can do; it is not a player.
import { BRAKE } from './flight.js';
import { RUN, finishRun, stepRun } from './run-step.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

// TST, the test pilot: the light brake eased, turning with each flock, and changing what it is
// doing 0.4 s into every kettlebell's warning. It is the dodger good-lift.test.js pins the meet's
// balance on, so the bot a player races on the day's sky is the pilot the tests fly.
export const TST = Object.freeze({ withFlock: true, brake: 'eased', react: 0.4 });

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
 * on the bar, as the hint says, and goes back to the lift once no plate is left ahead.
 *
 * `decide(world, intent)` writes what it asks of the wing this step into `intent`. Without the
 * kettlebells and the meet in the world, or without `react` and `collect`, it flies exactly as
 * it always has.
 */
export function createReferencePilot({ withFlock = true, brake = 'none', react = null, collect = false } = {}) {
  // A light-braked wing turns inside 9 m; hands up it needs 14.
  const radius = brake === 'none' ? 14 : 9;
  let deepFor = 0;
  let tap = 0;
  // Which way it turns off a kettlebell's line: picked once for each warning, when it reacts, and
  // held until the bell has passed (0 until then). Picked afresh every step, it would undo its own
  // turn as soon as the wing answered and dither about straight: hit a quarter to a third of the
  // time, against under one bell in a hundred.
  let away = 0;

  // The next plate still ahead on the trail, flown straight at on the bar. A plate the pilot has
  // already passed along the trail is left behind: turning back for it would cost the rest.
  function follow(world, intent) {
    const trail = world.meet?.state.trail;
    if (!trail?.live) return;
    const { pos, yaw } = world.g;
    const along = (pos.x - trail.x) * trail.ux + (pos.z - trail.z) * trail.uz;
    for (let i = 0; i < trail.plates.length; i++) {
      const plate = trail.plates[i];
      if (!plate.live || (plate.x - trail.x) * trail.ux + (plate.z - trail.z) * trail.uz < along) continue;
      intent.turn = clamp(wrapAngle(Math.atan2(plate.x - pos.x, -(plate.z - pos.z)) - yaw) * 2.5, -1, 1);
      intent.brake = false;
      intent.bar = true;
      return;
    }
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
      // The reflexes come after the lift is chosen, and a kettlebell overrides a plate.
      if (collect) follow(world, intent);
      if (react !== null) dodge(world, intent);
      return intent;
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
  return { peak: state.peak, strikes: state.pilot.strikes, stalls: world.stalls, seconds: state.elapsed, cloud: state.pilot.cloudTime, reason };
}
