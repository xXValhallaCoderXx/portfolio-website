import type { FlightInput, FlightState } from '../flight/models.ts';
import type { CloudbaseRun, RunWorld } from './models.ts';
export interface Bell { phase: number; at: number; lead: number; beast: boolean; fromX: number; fromY: number; fromZ: number; aimX: number; aimY: number; aimZ: number; x: number; y: number; z: number; kg: number; near: number; result: number; circling: boolean }
export interface BellsState {seed: number; due: number; clear: number; retry: number; thrown: number; hits: number; close: number; dodged: number; glanced: number; warning: number; beast: {n: number; result: number}; bells: Bell[]}
// Hrungnir's kettlebells. From 700 m up the giant throws one at a time at the place the glider
// will be 2.4 seconds later if the pilot holds what they are doing, and that is the warning: a
// grunt from his side, a red ring where it will come down and a chevron if the ring is off the
// screen. Holding on is a hit; changing what you are doing (pushing the bar in a circle, turning
// off a straight line) takes you out from under it. A hit folds the wing exactly as a raven does,
// through the sky's own strike, and a miss within 9 m is a close call, which the meet pays for.
// A throw waits for a quiet moment: never while the pilot is struck, in cloud, under a raven, in
// a stall, about to meet a gust front or near the rim, so a kettlebell is never one more thing on
// top of a moment the pilot is already fighting.
//
// Once an ordinary bell has introduced the warning, the first throw past 1,000 m is the Beast: his
// 48 kg bell, with a longer warning and aimed as far ahead again, and a close call by it is worth
// more. A pilot holding Algiz's blessing (meet-runes.js) has the next bell that would hit glance
// off instead, which spends the blessing.
//
// Pure, like the sky it is thrown in: no 3D, no page, no clock and no randomness but its own
// draws from the run's seed (never the sky's generator), and nothing allocated once it is made.
// It is stepped only through run-step.js, after the sky, and the only thing it ever changes
// outside itself is the strike a hit calls. It reads the meet only for the blessing it holds.
import { copyFlight, createFlight, stepFlight } from '../flight/flight.ts';
import { CLOUD_DEFAULT_SEED, CLOUD_STRIKE, CLOUD_ZONE, encounterInterval } from './cloudbase-state.ts';
import { RUN } from './run-step.ts';
import { surfaceAt } from '../flight/ground.ts';
import { RUNE } from './meet-runes.ts';
import { RUN_RULES } from './run-rules.ts';

export const BELLS = Object.freeze({
  from: 700,                        // m of peak before the first throw
  first: Object.freeze([10, 15]),   // s after first reaching `from` until the first throw
  every: Object.freeze([75, 90]),   // s from one throw to the next at the opening height
  often: 1000,                      // m of peak past which the throws come `oftener`
  oftener: Object.freeze([35, 45]), // s from one throw to the next up there
  lead: 2.4,                        // s from the throw, and its warning, to the bell reaching the aim
  drop: 96,                         // m above the aim it falls from
  side: 26,                         // m beside the aim it falls from: 41 m/s, 15° off the vertical
  fall: 1.5,                        // s it keeps falling past the aim, for the view
  quiet: 2,                         // s every block must have stayed away before a throw
  gust: 6,                          // s: no throw with a gust front due to arrive sooner than this
  raven: 12,                        // m across: no aim this close to a raven that can strike at its height
  edge: 15,                         // m: no throw with the pilot, or the aim, this close to the zone's rim
  close: 9,                         // m across: a miss closer than this is a close call
  turning: 0.3,                     // rad/s: turning faster than this, off the bar, the pilot is circling
  retry: 0.25,                      // s before an aim that was refused is tried again
  kg: Object.freeze([16, 24, 32]),  // the bells' weights, for their look and sound only
});
export const BELL_POOL = 2;

// The Beast: the first throw once the peak has reached `from` is Hrungnir's own `kg` bell, once a
// run. Its warning is `lead` seconds, and its aim flies the held controls as far ahead; it falls
// from above and beside that aim along the same slant as any bell, as much further out as its
// lead is longer, so it comes down no faster than the others and only from higher.
export const BEAST = Object.freeze({
  from: 1000,                       // m of peak at or past which the next throw is the Beast
  lead: 3.2,                        // s from its throw, and its warning, to it reaching the aim
  kg: 48,                           // its weight, for its look and sound
});

// What a bell is doing, and how its fall came out. A bell is `warning` from the throw until it
// has hit or passed the pilot, then falls `away` for the view, then is idle again. One that came
// within a strike's reach of a pilot holding Algiz `glanced` off instead of hitting.
export const BELL_PHASE = Object.freeze({ idle: 0, warning: 1, away: 2 });
export const BELL_RESULT = Object.freeze({ pending: 0, hit: 1, close: 2, dodged: 3, shielded: 4, hidden: 5, glanced: 6 });

const { idle: IDLE, warning: WARNING, away: AWAY } = BELL_PHASE;
const { pending: PENDING, hit: HIT, close: CLOSE, dodged: DODGED, shielded: SHIELDED, hidden: HIDDEN, glanced: GLANCED } = BELL_RESULT;
const TAU = Math.PI * 2;
// Steps the aim is flown ahead: each bell's lead in the run's own fixed steps.
const LOOK = Math.round(BELLS.lead / RUN.step);
const BEAST_LOOK = Math.round(BEAST.lead / RUN.step);
// How near a bell came to the pilot before it has been anywhere near: far beyond any call.
const FAR = 999;
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

// Draws that leave the sky's generator alone: the mixer of the sky's pick() with a multiplier of
// its own, so the bells take nothing from the sky and every sky is the same with them as without.
// n = 0 is the first delay; throw k draws 1 + 4k for its bearing, 2 + 4k for the gap after it and
// 3 + 4k for its weight, so an aim that is refused and tried again draws nothing.
function draw(seed: number, n: number) {
  let t = (seed ^ Math.imul(n + 1, 0x85ebca6b)) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * The giant and his kettlebells, made once and reset for every run. `step(dt, world)` takes the
 * run's world (run-step.js) after its sky has been stepped.
 *
 * state (plain numbers and booleans in a fixed pool, safe to copy and compare)
 *   seed                       the run's seed, which every draw comes from
 *   due                        run seconds of the next throw; -1 until the pilot first reaches `from`
 *   clear                      seconds every block has stayed away
 *   retry                      run seconds before which a refused aim is not tried again
 *   thrown, hits, close, dodged  bells thrown this run, and how many hit, nearly hit and missed
 *   glanced                    bells that would have hit and glanced off Algiz instead
 *   warning                    the bell whose warning is showing, or -1
 *   beast                      the Beast: `n`, which throw it was (counting from 0; -1 until it is
 *                              thrown), and `result`, how it came out (BELL_RESULT; pending while
 *                              it falls, and if the run ended first)
 *   bells[BELL_POOL]
 *     phase, result            BELL_PHASE and BELL_RESULT
 *     at                       run seconds it was thrown
 *     lead                     s from the throw to the aim: BELLS.lead, or BEAST.lead for the Beast
 *     beast                    whether it is the Beast
 *     fromX, fromY, fromZ      where it falls from
 *     aimX, aimY, aimZ         where the glider would be `lead` seconds after the throw, held on
 *     x, y, z                  where it is now: on the line from `from` through the aim, and on
 *     kg                       its weight, for the view and the sound
 *     near                     the closest it came across while level with the pilot's wing, in m
 *     circling                 whether the pilot was circling off the bar when it was thrown
 */
export function createBells() {
  const B = BELLS;
  const K = CLOUD_STRIKE;
  const Z = CLOUD_ZONE;
  const state: BellsState = {
    seed: CLOUD_DEFAULT_SEED,
    due: -1,
    clear: 0,
    retry: 0,
    thrown: 0,
    hits: 0,
    close: 0,
    dodged: 0,
    glanced: 0,
    warning: -1,
    beast: { n: -1, result: PENDING },
    bells: Array.from({ length: BELL_POOL }, () => ({
      phase: IDLE, at: 0, lead: B.lead, beast: false, fromX: 0, fromY: 0, fromZ: 0, aimX: 0, aimY: 0, aimZ: 0, x: 0, y: 0, z: 0,
      kg: B.kg[0], near: FAR, result: PENDING, circling: false,
    })),
  };
  // The look-ahead: a wing of the giant's own, flown in the air the sky has now on what the pilot
  // is holding. Its air and forces are its own as well, so nothing of the run's is touched.
  const ahead = createFlight({ x: 0, y: 0, z: 0 });
  const held: FlightInput = { turn: 0, brake: false, bar: false, ears: false, locked: false, climb: null };
  const air = { lift: 0, sink: 0, windX: 0, windY: 0, windZ: 0, hazardSink: 0, calm: false, rough: 0, clearance: Infinity };
  const forces = { lift: 0, sink: 0, liftSide: 0, windX: 0, windY: 0, windZ: 0, hazardSink: 0, rough: 0 };

  function reset(seed: number = CLOUD_DEFAULT_SEED) {
    state.seed = seed >>> 0;
    state.due = -1;
    state.clear = state.retry = 0;
    state.thrown = state.hits = state.close = state.dodged = state.glanced = 0;
    state.warning = -1;
    state.beast.n = -1;
    state.beast.result = PENDING;
    for (let i = 0; i < state.bells.length; i++) {
      const bell = state.bells[i];
      bell.phase = IDLE;
      bell.result = PENDING;
      bell.at = bell.fromX = bell.fromY = bell.fromZ = bell.aimX = bell.aimY = bell.aimZ = bell.x = bell.y = bell.z = 0;
      bell.lead = B.lead;
      bell.beast = false;
      bell.kg = B.kg[0];
      bell.near = FAR;
      bell.circling = false;
    }
  }

  // Where the glider will be `steps` fixed steps from now if the pilot holds what they are doing:
  // the wing copied as it is, ears and all, and flown on step by step the way run-step.js flies it,
  // in the air the sky has now. Only the wing is stepped; the sky stays where it is and is only read.
  // It swings as the wing does, but never tucks: the pilot it is aimed at catches a surge, and
  // would not have the tuck.
  function aim(sky: CloudbaseRun, g: FlightState, controls: FlightInput, steps: number) {
    const pos = ahead.pos;
    copyFlight(ahead, g);
    // Object.assign alone would retain a previous drag's mode after switching back to keys.
    held.controlMode = undefined; held.leftBrake = held.rightBrake = 0;
    Object.assign(held, controls);
    for (let i = 0; i < steps; i++) {
      sky.sample(pos, ahead.yaw, forces);
      air.lift = forces.lift;
      air.sink = forces.sink;
      air.windX = forces.windX;
      air.windY = forces.windY ?? forces.lift - forces.sink;
      air.windZ = forces.windZ;
      air.hazardSink = forces.hazardSink ?? 0;
      air.rough = forces.rough;
      air.calm = false;
      air.clearance = pos.y - surfaceAt(pos.x, pos.z);
      ahead.lift = forces.lift;
      ahead.liftSide = forces.liftSide;
      stepFlight(ahead, held, air, RUN.step);
    }
    return pos;
  }

  // Whether a bell may come down on the glider at this aim: not by the rim, where the wind will
  // turn the glider back in whatever it holds; not in cloud, which would hide the ring; and not
  // where a raven that can strike flies at the height the wing will be, so the two never fall due
  // together. The ravens are where they are now, as everything else in the aim is.
  function fair(sky: CloudbaseRun, x: number, y: number, z: number) {
    const chest = y + K.rise;
    const dx = x - Z.x;
    const dz = z - Z.z;
    if (dx * dx + dz * dz > (Z.r - B.edge) * (Z.r - B.edge)) return false;
    if (sky.depthAt(x, chest, z) > 0) return false;
    const ravens = sky.state.ravens;
    for (let i = 0; i < ravens.length; i++) {
      const raven = ravens[i];
      const above = raven.y - chest;
      if (!raven.hot || above < -K.half || above > K.warn.above) continue;
      const rx = raven.x - x;
      const rz = raven.z - z;
      if (rx * rx + rz * rz < B.raven * B.raven) return false;
    }
    return true;
  }

  // What keeps the giant's hand still: a bell already in the air, a wing struck (or still
  // shielded after it), cloud, a raven about to cross, a stall, a tuck or a tip collapse, a gust
  // front about to arrive, or the rim close by. A swinging wing is thrown at as any other: blocking
  // on it would let a pilot pump the swing, or wingover, and never be thrown at.
  function blocked(sky: CloudbaseRun, g: { pos: { y: number; x: number; z: number; }; stall: number; tuck: number; }) {
    if (g.pos.y < B.from) return true;
    for (let i = 0; i < state.bells.length; i++) if (state.bells[i].phase !== IDLE) return true;
    const pilot = sky.state.pilot;
    if (pilot.shield > 0 || pilot.cloud > 0 || pilot.danger > 0 || pilot.gustIn < B.gust || g.stall > 0 || g.tuck > 0) return true;
    const dx = g.pos.x - Z.x;
    const dz = g.pos.z - Z.z;
    return dx * dx + dz * dz > (Z.r - B.edge) * (Z.r - B.edge);
  }

  // A bell that has come down past the pilot's wing without touching it, or has fallen as far as
  // it ever will: close if it came within `close` while level with the wing, dodged otherwise.
  function passed(bell: { near: number; result: number; }) {
    if (bell.near < B.close) {
      bell.result = CLOSE;
      state.close += 1;
    } else {
      bell.result = DODGED;
      state.dodged += 1;
    }
  }

  // Moves a bell down its line and settles how it came out. It can only meet the pilot while it is
  // level with the wing, in the band a raven strikes in, and it meets them as a raven would: inside
  // the strike's reach it hits, unless cloud hides the pilot or the shield is up. One that would
  // hit a pilot `warded` by Algiz glances off instead, and is counted so the meet can spend it.
  function fall(bell: Bell, sky: CloudbaseRun, g: { pos: { y: number; x: number; z: number; }; }, now: number, warded: boolean) {
    const t = now - bell.at;
    const along = t / bell.lead;
    bell.x = bell.fromX + (bell.aimX - bell.fromX) * along;
    bell.y = bell.fromY + (bell.aimY - bell.fromY) * along;
    bell.z = bell.fromZ + (bell.aimZ - bell.fromZ) * along;
    if (bell.result === PENDING) {
      const above = bell.y - (g.pos.y + K.rise);
      if (Math.abs(above) < K.half) {
        const dx = bell.x - g.pos.x;
        const dz = bell.z - g.pos.z;
        const across = Math.sqrt(dx * dx + dz * dz);
        bell.near = Math.min(bell.near, across);
        if (across < K.radius) {
          if (sky.state.pilot.cloud >= K.cover) bell.result = HIDDEN;
          else if (warded && sky.state.pilot.shield === 0) {
            bell.result = GLANCED;
            state.glanced += 1;
          } else if (sky.strike(-1)) {
            bell.result = HIT;
            state.hits += 1;
          } else bell.result = SHIELDED;
        }
      } else if (above <= -K.half) passed(bell);
    }
    if (t >= bell.lead + B.fall) {
      // Fallen as far as the view follows it; a pilot far below it was never in its way.
      if (bell.result === PENDING) passed(bell);
      bell.phase = IDLE;
    } else if (bell.result !== PENDING) bell.phase = AWAY;
    if (bell.beast) state.beast.result = bell.result;
  }

  // Throws the next bell at where the held controls take the glider, or, if that is no place to
  // throw at, puts the throw off for `retry`. The first throw once the peak has reached BEAST.from
  // is the Beast, aimed as far ahead as its warning is long, and a Beast refused is the Beast still.
  function hurl(world: RunWorld, now: number) {
    const { sky, g } = world;
    const n = state.thrown;
    // Every pilot meets the ordinary warning before the one-off Beast, even after a fast climb.
    const beast = n > 0 && state.beast.n < 0 && sky.state.peak >= BEAST.from;
    const lead = beast ? BEAST.lead : B.lead;
    const pos = aim(sky, g, world.controls, beast ? BEAST_LOOK : LOOK);
    if (!fair(sky, pos.x, pos.y, pos.z)) {
      state.retry = now + B.retry;
      return;
    }
    const bell = state.bells[n % BELL_POOL];
    const bearing = draw(state.seed, 1 + 4 * n) * TAU;
    // How much further out it starts than a bell with the usual lead: 1 for every bell but the Beast.
    const out = lead / B.lead;
    bell.phase = WARNING;
    bell.result = PENDING;
    bell.at = now;
    bell.lead = lead;
    bell.beast = beast;
    bell.aimX = pos.x;
    bell.aimY = pos.y;
    bell.aimZ = pos.z;
    bell.fromX = bell.x = pos.x - Math.sin(bearing) * B.side * out;
    bell.fromY = bell.y = pos.y + B.drop * out;
    bell.fromZ = bell.z = pos.z + Math.cos(bearing) * B.side * out;
    // The Beast's weight is its own; its draw is left unused, so every bell after it is the same.
    bell.kg = beast ? BEAST.kg : B.kg[Math.floor(draw(state.seed, 3 + 4 * n) * B.kg.length)];
    bell.near = FAR;
    bell.circling = Math.abs(g.yawRate) > B.turning && g.bar < 0.5;
    state.due = now + encounterInterval({ from: B.from, every: B.every, high: B.oftener }, sky.state.peak, draw(state.seed, 2 + 4 * n));
    state.thrown = n + 1;
    if (beast) {
      state.beast.n = n;
      state.beast.result = PENDING;
    }
  }

  // One step, after the sky's. The bells in the air fall first, so one that has gone frees the
  // giant's hand this very step; then the quiet is counted, the first throw is set once the pilot
  // has reached `from`, and a throw that is due, quiet and not put off is made.
  function step(dt: number, world: RunWorld) {
    const { sky, g } = world;
    // A run that has ended, or a step that moves no time, leaves everything as it is.
    if (!sky.state.active || !Number.isFinite(dt) || dt <= 0) return;
    const now = sky.state.elapsed;
    // Algiz, as the meet held it after the last step: the next bell that would hit glances off.
    const warded = world.meet ? world.meet.state.runes.blessing.rune === RUNE.algiz : false;
    for (let i = 0; i < state.bells.length; i++) if (state.bells[i].phase !== IDLE) fall(state.bells[i], sky, g, now, warded);
    state.clear = blocked(sky, g) ? 0 : state.clear + dt;
    if (state.due < 0 && now >= RUN_RULES.grace && sky.state.peak >= B.from) state.due = now + mix(B.first[0], B.first[1], draw(state.seed, 0));
    if (now >= RUN_RULES.grace && state.due >= 0 && now >= state.due && now >= state.retry && state.clear >= B.quiet) hurl(world, now);
    state.warning = -1;
    for (let i = 0; i < state.bells.length; i++) {
      if (state.bells[i].phase === WARNING) {
        state.warning = i;
        break;
      }
    }
  }

  return { reset, step, get state() { return state; } };
}
