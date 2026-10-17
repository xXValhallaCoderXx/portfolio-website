// One fixed step of a Good Lift run: the wing and the sky, and the meet's kettlebells and judges
// once they are given one. The game, the tests, the replays of a run and the world board's
// function (functions/), which checks a run before it ranks it, all step it here, in this one
// order, so a run flown in a browser can be flown again anywhere else and come out the same. Kept
// free of 3D and page code: the ground it touches down on is ground.js's, not terrain.js's.
import { FLIGHT, createFlight, settleFlight, stepFlight } from './flight.js';
import { CLOUD_GATE, CLOUD_RAVENS, CLOUD_STRIKE, CLOUD_ZONE } from './cloudbase-state.js';
import { surfaceAt } from './ground.js';
import { createSwingWatch } from './swing-watch.js';
import { RUN_RULES } from './run-rules.js';

// Seconds a run is stepped by, everywhere. Touching down within `ground` metres of the surface
// ends a run, ring or not.
export const RUN = Object.freeze({ ...RUN_RULES, ground: 1.4 });

// The barogram the meet sheet draws: the glider's height, the fog's and the total, sampled as the
// run starts and then every `every` fixed steps (once a run second), so sample i is second i. There
// is room for every second through the ten-minute deadline.
export const TRACE = Object.freeze({ every: 60, length: RUN.seconds + 1 });

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * Everything one run needs, made once and reused for every run after it. `sky` is a
 * createCloudbaseRun(); `g`, `controls` and `air` may be handed in so the game draws the very
 * objects the run steps. `bells` and `meet` are the Good Lift layer, or null to fly the bare sky,
 * and `style` (meet-style.js) scores the run's tricks, or null to leave them unscored.
 *
 *   watch   what the wing's swings are doing (swing-watch.js), stepped with the wing
 *   hook    which way a folded wing hooks round: the way it was turning when it was struck
 *   struck  strikes already answered with a hook
 *   stalls  stalls begun this run
 *   tucks   front tucks this run: surges left uncaught past the wing's line
 *   tips    tip collapses this run: wingovers swung past the wing's limit
 *   pump    the brake held into the fold so far (s) and the pumps it has had (`held`, `n`)
 *   steps   fixed steps flown this run
 *   intent  what stepBits last asked of the wing ({ turn, brake, deepBrake, bar, ears }): one object, reused
 *   trace   the barogram: `alt`, `fog` and `total` (m, m, kg) for each second flown, `n` of them
 */
export function createRunWorld({
  sky,
  g = createFlight({ x: CLOUD_GATE.x, y: CLOUD_GATE.y, z: CLOUD_GATE.z }),
  controls = { turn: 0, brake: false, deepBrake: false, bar: false, ears: false, locked: false, harsh: false, linger: true, swing: false, folds: false, steered: false, safe: false, climb: null },
  air = { lift: 0, sink: 0, windX: 0, windY: 0, windZ: 0, hazardSink: 0, calm: false, rough: 0, clearance: Infinity,
    ridge: 0, lee: 0, thermal: 0, crestHeight: 0, ambientX: 0, ambientZ: 0 },
  bells = null,
  meet = null,
  style = null,
} = {}) {
  return {
    sky, g, controls, air, bells, meet, style,
    watch: createSwingWatch(),
    forces: { lift: 0, sink: 0, liftSide: 0, windX: 0, windY: 0, windZ: 0, hazardSink: 0, rough: 0,
      ridge: 0, lee: 0, thermal: 0, crestHeight: 0, ambientX: 0, ambientZ: 0 },
    hook: 1,
    struck: 0,
    stalls: 0,
    tucks: 0,
    tips: 0,
    pump: { held: 0, n: 0 },
    steps: 0,
    ended: '',
    intent: { turn: 0, brake: false, deepBrake: false, bar: false, ears: false },
    trace: {
      alt: new Float32Array(TRACE.length), fog: new Float32Array(TRACE.length), total: new Float32Array(TRACE.length), n: 0,
    },
  };
}

// Writes the barogram's next sample, while there is room for it. It only reads the run.
function sample(world) {
  const { trace } = world;
  if (trace.n >= trace.alt.length) return;
  trace.alt[trace.n] = world.g.pos.y;
  trace.fog[trace.n] = world.sky.state.fogHeight;
  trace.total[trace.n] = world.meet ? world.meet.state.total : 0;
  trace.n += 1;
}

/** Lays out the sky from `seed` and puts the glider at the gate, level and settled at trim. */
export function startRun(world, seed) {
  const { sky, g, trace } = world;
  sky.reset(CLOUD_GATE.y, seed);
  g.pos.x = CLOUD_GATE.x;
  g.pos.y = CLOUD_GATE.y;
  g.pos.z = CLOUD_GATE.z;
  g.yaw = CLOUD_GATE.yaw;
  settleFlight(g);
  // Reference controls and shared presentation can read air before the first step. Never carry
  // a previous run's wind into that first decision or it will differ from a fresh server replay.
  Object.assign(world.air, { lift: 0, sink: 0, windX: 0, windY: 0, windZ: 0, hazardSink: 0, rough: 0, calm: false, clearance: Infinity,
    ridge: 0, lee: 0, thermal: 0, crestHeight: 0, ambientX: 0, ambientZ: 0 });
  Object.assign(world.forces, { lift: 0, sink: 0, liftSide: 0, windX: 0, windY: 0, windZ: 0, hazardSink: 0, rough: 0,
    ridge: 0, lee: 0, thermal: 0, crestHeight: 0, ambientX: 0, ambientZ: 0 });
  Object.assign(world.controls, { turn: 0, brake: false, deepBrake: false, bar: false, ears: false, locked: false, harsh: false, linger: true, swing: false, folds: false, steered: false, safe: false, climb: null });
  world.hook = 1;
  world.struck = world.stalls = world.tucks = world.tips = world.steps = 0;
  world.ended = '';
  world.pump.held = world.pump.n = 0;
  world.intent.turn = 0;
  world.intent.brake = world.intent.deepBrake = world.intent.bar = world.intent.ears = false;
  world.bells?.reset(seed);
  world.meet?.reset();
  world.watch.reset();
  world.style?.reset();
  // Nothing of the last run's climb is left behind the first sample of this one: the run at rest.
  trace.alt.fill(0);
  trace.fog.fill(0);
  trace.total.fill(0);
  trace.n = 0;
  sample(world);
  return world;
}

/**
 * Flies one step of `dt` seconds with the pilot asking for `intent` ({ turn from -1 to 1, brake,
 * deepBrake, bar, ears }). Returns 'fog', 'landed' or 'time' when the run ends on this step, and null while it goes on.
 */
export function stepRun(world, intent, dt = RUN.step) {
  if (world.ended) return world.ended;
  if (!(dt > 0) || !Number.isFinite(dt) || !world.sky.state.active) return null;
  const { sky, g, controls, air, forces, pump } = world;
  const pilot = sky.state.pilot;
  // A folded wing is pumped open: each time the brake has been held long enough and is let go, the
  // fold is that much shorter, a few times at most. Counted before the fold is read, so a pump that
  // opens the wing gives the hands back on this very step.
  if (pilot.collapse > 0) {
    if (!intent.ears && (intent.brake || intent.deepBrake)) {
      pump.held += dt;
    } else {
      // A hold is a whole number of steps, given half a step to spare as the clock sums them.
      if (pump.held >= CLOUD_STRIKE.pump.hold - dt / 2 && pump.n < CLOUD_STRIKE.pump.most && sky.reopen(CLOUD_STRIKE.pump.cut)) pump.n += 1;
      pump.held = 0;
    }
  } else {
    pump.held = pump.n = 0;
  }
  // A folded wing keeps hooking round the way it was going and takes no steering; past the edge
  // of the sky the wind turns the glider back in, whatever else is happening.
  const collapsed = pilot.collapse > 0;
  const outside = !sky.inside(g.pos);
  let turn = intent.turn;
  if (collapsed) turn = world.hook * FLIGHT.turn.hook;
  if (outside) turn = clamp(wrapAngle(Math.atan2(CLOUD_ZONE.x - g.pos.x, -(CLOUD_ZONE.z - g.pos.z)) - g.yaw) * 2, -1, 1);
  controls.turn = turn;
  controls.ears = !!intent.ears;
  controls.deepBrake = !controls.ears && !!intent.deepBrake;
  controls.brake = !controls.ears && !!(intent.brake || controls.deepBrake);
  // An ineffective held bar cannot change configuration or rollout while the brake wins.
  controls.bar = !controls.brake && !controls.ears && !!intent.bar;
  controls.locked = collapsed;
  // Keep the shared controller's compatibility flags, while the same physical wing flies here
  // and in the portfolio. Assisted boundary recovery cannot earn a maneuver.
  controls.harsh = g.pos.y >= CLOUD_RAVENS.grace;
  controls.swing = true;
  controls.folds = !outside;
  controls.steered = outside;
  controls.linger = true;
  controls.safe = false;
  controls.climb = null;

  sky.sample(g.pos, g.yaw, forces);
  air.lift = forces.lift;
  air.sink = forces.sink;
  air.windX = forces.windX;
  air.windY = forces.windY ?? forces.lift - forces.sink;
  air.windZ = forces.windZ;
  air.hazardSink = forces.hazardSink ?? 0;
  air.rough = forces.rough;
  air.ridge = forces.ridge ?? 0;
  air.lee = forces.lee ?? 0;
  air.thermal = forces.thermal ?? 0;
  air.crestHeight = forces.crestHeight ?? 0;
  air.ambientX = forces.ambientX ?? forces.windX;
  air.ambientZ = forces.ambientZ ?? forces.windZ;
  air.calm = false;
  air.clearance = g.pos.y - surfaceAt(g.pos.x, g.pos.z);
  g.lift = forces.lift;
  g.liftSide = forces.liftSide;

  const stalled = g.stall > 0;
  const tucked = g.tuck > 0;
  const tipped = g.tip > 0;
  stepFlight(g, controls, air, dt);
  if (g.stall > 0 && !stalled) world.stalls += 1;
  if (g.tuck > 0 && !tucked) world.tucks += 1;
  if (g.tip > 0 && !tipped) world.tips += 1;
  world.watch.step(dt, g, pilot.collapse > 0, controls);
  if (g.pos.y - surfaceAt(g.pos.x, g.pos.z) <= RUN.ground) return world.ended = 'landed';

  const ended = sky.step(dt, g.pos);
  if (!ended) world.bells?.step(dt, world);
  // Whatever has struck the wing since it was last answered (a raven, one of the meet's
  // kettlebells, or a strike called between steps) sets which way it hooks: the way the pilot
  // was turning. Checked after every source of strikes, so none hooks the wing the old way.
  if (pilot.strikes > world.struck) {
    world.struck = pilot.strikes;
    world.hook = Math.sign(g.yawRate) || 1;
  }
  world.meet?.step(dt, world);
  world.style?.step(dt, world);
  world.steps += 1;
  if (world.steps % TRACE.every === 0) sample(world);
  if (ended) return world.ended = ended;
  if (world.steps >= RUN.maxSteps) return world.ended = 'time';
  return null;
}

/**
 * Flies one fixed step with the pilot's controls as `bits`: 1 left, 2 right, 4 brake and 8 the
 * speed bar, 16 deep brake, and the brake and the bar together (12) the big ears (recorder.js's INPUT). Both ways
 * at once retains the keyboard's legacy speed-bar chord, held straight. Touch controls have a
 * dedicated bar and ears, and the run a log replays never depends on its device. The
 * ears take the bar's own bit, not that chord: both ways with the brake is still the brake. This is
 * the one way live play and replays fly a run; the reference pilots, which steer by degrees, call
 * stepRun. Returns what stepRun returns.
 */
export function stepBits(world, bits) {
  const { intent } = world;
  const left = (bits & 1) !== 0;
  const right = (bits & 2) !== 0;
  const both = left && right;
  const ears = (bits & 12) === 12;
  intent.turn = both ? 0 : (right ? 1 : 0) - (left ? 1 : 0);
  intent.ears = ears;
  intent.deepBrake = !ears && (bits & 16) !== 0;
  intent.brake = !ears && ((bits & 4) !== 0 || intent.deepBrake);
  intent.bar = !ears && !intent.brake && (both || (bits & 8) !== 0);
  return stepRun(world, intent, RUN.step);
}

/**
 * Ends a run for `reason`: the meet judges what is left on the bar if the fog or a touchdown ended
 * it ('fog', 'landed', 'time') and forfeits it for anything else, and then the sky stops. Live play and a
 * replay both end a run here, so a replayed run is judged as the live one was. Only the first
 * ending counts.
 */
export function finishRun(world, reason) {
  world.ended ||= reason;
  world.meet?.finish(world.ended, world);
  world.style?.finish(world.ended);
  world.sky.finish();
  return world;
}
