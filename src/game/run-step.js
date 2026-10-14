// One fixed step of a Good Lift run: the wing and the sky, and the meet's kettlebells and judges
// once they are given one. The game, the tests, the replays of a run and (one day) a server
// that checks a submitted run all step it here, in this one order, so a run flown in a browser
// can be flown again anywhere else and come out the same. Kept free of 3D and page code.
import { FLIGHT, createFlight, settleFlight, stepFlight } from './flight.js';
import { CLOUD_GATE, CLOUD_RAVENS, CLOUD_ZONE } from './cloudbase-state.js';
import { surfaceAt } from './terrain.js';

// Seconds a run is stepped by, everywhere. Touching down within `ground` metres of the surface
// ends a run, ring or not.
export const RUN = Object.freeze({ step: 1 / 60, ground: 1.4 });

// The barogram the meet sheet draws: the glider's height, the fog's and the total, sampled as the
// run starts and then every `every` fixed steps (once a run second), so sample i is second i. There
// is room for `length` samples, four minutes: longer than the fog lets any run last.
export const TRACE = Object.freeze({ every: 60, length: 241 });

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * Everything one run needs, made once and reused for every run after it. `sky` is a
 * createCloudbaseRun(); `g`, `controls` and `air` may be handed in so the game draws the very
 * objects the run steps. `bells` and `meet` are the Good Lift layer, or null to fly the bare sky.
 *
 *   hook    which way a folded wing hooks round: the way it was turning when it was struck
 *   struck  strikes already answered with a hook
 *   stalls  stalls begun this run
 *   steps   fixed steps flown this run
 *   intent  what stepBits last asked of the wing ({ turn, brake, bar }): one object, reused
 *   trace   the barogram: `alt`, `fog` and `total` (m, m, kg) for each second flown, `n` of them
 */
export function createRunWorld({
  sky,
  g = createFlight({ x: CLOUD_GATE.x, y: CLOUD_GATE.y, z: CLOUD_GATE.z }),
  controls = { turn: 0, brake: false, bar: false, locked: false, harsh: false, linger: true, safe: false, climb: null },
  air = { lift: 0, sink: 0, windX: 0, windZ: 0, calm: false, rough: 0, clearance: Infinity },
  bells = null,
  meet = null,
} = {}) {
  return {
    sky, g, controls, air, bells, meet,
    forces: { lift: 0, sink: 0, liftSide: 0, windX: 0, windZ: 0, rough: 0 },
    hook: 1,
    struck: 0,
    stalls: 0,
    steps: 0,
    intent: { turn: 0, brake: false, bar: false },
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
  world.hook = 1;
  world.struck = world.stalls = world.steps = 0;
  world.intent.turn = 0;
  world.intent.brake = world.intent.bar = false;
  world.bells?.reset(seed);
  world.meet?.reset();
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
 * bar }). Returns 'fog' or 'landed' when the run ends on this step, and null while it goes on.
 */
export function stepRun(world, intent, dt = RUN.step) {
  const { sky, g, controls, air, forces } = world;
  const pilot = sky.state.pilot;
  // A folded wing keeps hooking round the way it was going and takes no steering; past the edge
  // of the sky the wind turns the glider back in, whatever else is happening.
  const collapsed = pilot.collapse > 0;
  let turn = intent.turn;
  if (collapsed) turn = world.hook * FLIGHT.turn.hook;
  if (!sky.inside(g.pos)) turn = clamp(wrapAngle(Math.atan2(CLOUD_ZONE.x - g.pos.x, -(CLOUD_ZONE.z - g.pos.z)) - g.yaw) * 2, -1, 1);
  controls.turn = turn;
  controls.brake = !!intent.brake;
  controls.bar = !!intent.bar;
  controls.locked = collapsed;
  // A stall only costs real height above the ravens' grace height; low over the launch hill it
  // is the gentle kind. The brake lingers light here, for circling tight.
  controls.harsh = g.pos.y >= CLOUD_RAVENS.grace;
  controls.linger = true;
  controls.safe = false;
  controls.climb = null;

  sky.sample(g.pos, g.yaw, forces);
  air.lift = forces.lift;
  air.sink = forces.sink;
  air.windX = forces.windX;
  air.windZ = forces.windZ;
  air.rough = forces.rough;
  air.calm = false;
  air.clearance = g.pos.y - surfaceAt(g.pos.x, g.pos.z);
  g.lift = forces.lift;
  g.liftSide = forces.liftSide;

  const stalled = g.stall > 0;
  stepFlight(g, controls, air, dt);
  if (g.stall > 0 && !stalled) world.stalls += 1;
  if (g.pos.y - surfaceAt(g.pos.x, g.pos.z) <= RUN.ground) return 'landed';

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
  world.steps += 1;
  if (world.steps % TRACE.every === 0) sample(world);
  return ended;
}

/**
 * Flies one fixed step with the pilot's four controls as `bits`: 1 left, 2 right, 4 brake and 8 the
 * speed bar (recorder.js's INPUT). Both ways at once is the speed bar, held straight: on a touch
 * screen it is the only way to the bar, and on keys it is the same, so the run a log replays never
 * depends on the device it was flown on. This is the one way live play and replays fly a run; the
 * reference pilots, which steer by degrees, call stepRun. Returns what stepRun returns.
 */
export function stepBits(world, bits) {
  const { intent } = world;
  const left = (bits & 1) !== 0;
  const right = (bits & 2) !== 0;
  const both = left && right;
  intent.turn = both ? 0 : (right ? 1 : 0) - (left ? 1 : 0);
  intent.brake = (bits & 4) !== 0;
  intent.bar = both || (bits & 8) !== 0;
  return stepRun(world, intent, RUN.step);
}

/**
 * Ends a run for `reason`: the meet judges what is left on the bar if the fog or a touchdown ended
 * it ('fog', 'landed') and forfeits it for anything else, and then the sky stops. Live play and a
 * replay both end a run here, so a replayed run is judged as the live one was. Only the first
 * ending counts.
 */
export function finishRun(world, reason) {
  world.meet?.finish(reason, world);
  world.sky.finish();
  return world;
}
