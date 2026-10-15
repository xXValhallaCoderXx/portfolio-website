// Good Lift's rune gates. As a climbing pilot nears 500 m, and again 1,000 m, three rune stones are
// raised at that height around the lift they are climbing in, each an opening that faces the
// middle of it and offers one blessing. Flying through one (the arch's own crossing test,
// gateway.js) takes its blessing and the other two crumble; climbing well past them, or leaving
// them waiting too long, crumbles all three. Taking one means a dash out of the core and back, a
// few seconds in weaker lift, which costs some of the climb: a choice, never a trap.
//
// One blessing is held at a time, and the 1,000 m gate's replaces the 500 m one:
//   ᚠ Fehu    every plate loads from much further off (meet-state.js)
//   ᛉ Algiz   the next kettlebell that would hit glances off instead, and the blessing is spent
//             (bells.js)
//   ᚨ Ansuz   the thermals' motes are seen twice as far: for the view alone, the sim only keeps it
//   ᛏ Tiwaz   everything loaded counts double, but a strike loses the whole bar (meet-state.js)
//
// Pure: no 3D, no page, no clock, and no randomness but its own draws from the run's seed, never
// the sky's generator, so every sky is the same with the gates as without them. Nothing is
// allocated once it is made. The meet steps it (meet-state.js) and reads the blessing it holds.
import { crossesGateway } from './gateway.js';
import { CLOUD_GATE } from './cloudbase-state.js';

// The runes a gate can offer, and none. Their order is part of what a seed means.
export const RUNE = Object.freeze({ none: 0, fehu: 1, algiz: 2, ansuz: 3, tiwaz: 4 });
// Each rune's letter and name, by its number, for the view and the sheet.
export const RUNE_SIGN = Object.freeze(['', 'ᚠ', 'ᛉ', 'ᚨ', 'ᛏ']);
export const RUNE_NAME = Object.freeze(['', 'Fehu', 'Algiz', 'Ansuz', 'Tiwaz']);

// What a gate is doing: not raised, `waiting` to be flown through, `taken`, or `crumbled`
// (another was taken, the pilot climbed past or the wait ran out).
export const GATE = Object.freeze({ idle: 0, waiting: 1, taken: 2, crumbled: 3 });

// The gates. At each of `lines`, once the peak has come within `ahead` of it, `count` stones are
// raised at that height, `ring` out from the middle of the lift the pilot is climbing in (or from
// the pilot, out of lift), evenly round it from a seeded bearing, each facing that middle. Each
// opening reaches `wide` to either side of its middle and `tall` above and below it. The stones
// wait `wait` seconds from being raised, or until the peak is `past` over them, then crumble.
// Nearer the middle a dash costs less (on calm skies, 15 s after taking a stone a pilot was a median
// 38 m under one who stayed, with the stones 16 m out, and 83 m with them 22 m out), but a
// light-brake circle blown downwind reaches 18 m: 16 m out TST flew through a stone by chance on one
// sky in eight of 800, here on 54 of them (43 at the 1,000 m set, 44 in lift). A blessing it never
// sought changes nothing of how TST flies, but it moved its TOTAL on 21 of those skies, 19 of them
// up, by up to 140 kg (Tiwaz's doubling): 1.3 kg a run over the 800, on the rival a player races.
export const GATES = Object.freeze({
  lines: Object.freeze([500, 1000]), // m: the heights the gates are raised at, the lines' own
  ahead: 100,                       // m of peak under a line at which its gates are raised
  count: 3,                         // stones a line
  ring: 22,                         // m from the lift's middle: past its ravens and a circle blown downwind
  wide: 6,                          // m of opening to either side of a stone's middle
  tall: 20,                         // m of opening above and below it: two seconds of a 20 m/s climb
  wait: 30,                         // s from being raised before the stones crumble
  past: 30,                         // m of peak over the stones at which they crumble
});

// What the blessings do. Fehu loads every plate from within `reach`; Tiwaz loads each plate
// `double` times over; Ansuz shows the thermals' motes `sparks` times as far off (the view's; the key
// keeps the name it shipped with, as the rules' fingerprint reads it).
export const BLESSING = Object.freeze({
  reach: 12,                        // m, in 3-D, from which a plate loads under Fehu (6 without)
  double: 2,                        // times each plate counts under Tiwaz
  sparks: 2,                        // times as far the thermals' motes are seen under Ansuz
});

const TAU = Math.PI * 2;
const { none: NONE, algiz: ALGIZ } = RUNE;
const { idle: IDLE, waiting: WAITING, taken: TAKEN, crumbled: CRUMBLED } = GATE;

// Draws that leave the sky's generator and the kettlebells' alone: the same mixer with a
// multiplier of the meet's own, so every sky and every bell is the same with the meet as without
// it. Each draw has its own number: the gates for line k draw 1 + 4k for the rune left out, 2 + 4k
// for the order the other three stand in and 3 + 4k for the bearing of the first; the k-th fog
// bait 100 + k for its side, the k-th strike's spray 200 + k for its bearing, and the k-th gust
// front to carry plates 300 + k for the side its third plate goes on (meet-state.js).
export function meetDraw(seed, n) {
  let t = (seed ^ Math.imul(n + 1, 0xc2b2ae35)) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// The six orders three things can stand in, as which of them comes first, second and third.
const ORDERS = Object.freeze([[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]].map(Object.freeze));

/**
 * The gates and the blessing, made once and reset for every run; the meet holds its state as its
 * own `runes`. `step(dt, world)` follows the run (run-step.js) after the sky and the kettlebells,
 * reading them and the glider and writing only this state; `finish(world)` crumbles whatever
 * still waits.
 *
 *   raised       sets of gates raised so far: the next to raise is GATES.lines[raised]
 *   line         m: the line the gates now in the pool were raised for, or 0 before the first
 *   gates[GATES.count]
 *     x, y, z    the middle of the stone's opening
 *     nx, nz     which way the opening faces, level (a unit vector out from the lift's middle)
 *     rune       the blessing it offers (RUNE)
 *     state      GATE: idle, waiting, taken or crumbled
 *     at         run seconds it was raised
 *     ended      run seconds it was taken or crumbled, or -1 while it is idle or waiting
 *   blessing     the blessing held: `rune` (RUNE.none for none), `since` (run seconds it was taken,
 *                spent or replaced) and `line` (m, the gates it came from; 0 for none)
 *   taken        gates flown through this run
 *   runes        each rune taken this run, as bit (rune - 1)
 *   spent        Algiz blessings spent: the kettlebells' glances, as last counted
 *   was          where the glider was at the last step: a gate is taken by the path between
 */
export function createRunes() {
  const G = GATES;
  const state = {
    raised: 0,
    line: 0,
    gates: Array.from({ length: G.count }, () => ({ x: 0, y: 0, z: 0, nx: 0, nz: 1, rune: NONE, state: IDLE, at: 0, ended: -1 })),
    blessing: { rune: NONE, since: 0, line: 0 },
    taken: 0,
    runes: 0,
    spent: 0,
    was: { x: CLOUD_GATE.x, y: CLOUD_GATE.y, z: CLOUD_GATE.z },
  };
  // The crossing test's own pieces, filled in for each stone: the path in the stone's frame (its
  // facing as x, its width as z) and the opening as the arch's corridor at x = 0.
  const from = { x: 0, y: 0, z: 0 };
  const to = { x: 0, y: 0, z: 0 };
  const opening = { x: 0, corridor: { minY: 0, maxY: 0, minZ: -G.wide, maxZ: G.wide } };

  function reset() {
    state.raised = state.line = 0;
    for (let i = 0; i < state.gates.length; i++) {
      const gate = state.gates[i];
      gate.x = gate.y = gate.z = gate.nx = gate.at = 0;
      gate.nz = 1;
      gate.rune = NONE;
      gate.state = IDLE;
      gate.ended = -1;
    }
    state.blessing.rune = NONE;
    state.blessing.since = state.blessing.line = 0;
    state.taken = state.runes = state.spent = 0;
    state.was.x = CLOUD_GATE.x;
    state.was.y = CLOUD_GATE.y;
    state.was.z = CLOUD_GATE.z;
  }

  // Raises the stones for the next line round the lift the pilot is in, three of the four runes
  // in a seeded order from a seeded bearing.
  function raise(world) {
    const sky = world.sky.state;
    const { pos } = world.g;
    const k = state.raised;
    const slot = sky.pilot.thermal;
    const cx = slot >= 0 ? sky.thermals[slot].x : pos.x;
    const cz = slot >= 0 ? sky.thermals[slot].z : pos.z;
    const out = 1 + Math.floor(meetDraw(sky.seed, 1 + 4 * k) * 4);
    const order = ORDERS[Math.floor(meetDraw(sky.seed, 2 + 4 * k) * ORDERS.length)];
    const bearing = meetDraw(sky.seed, 3 + 4 * k) * TAU;
    state.line = G.lines[k];
    state.raised = k + 1;
    for (let i = 0; i < state.gates.length; i++) {
      const gate = state.gates[i];
      const angle = bearing + (i * TAU) / state.gates.length;
      // The i-th of the three runes left after the one left out, in the drawn order.
      const pick = order[i] + 1;
      gate.rune = pick >= out ? pick + 1 : pick;
      // Out along `angle` from the middle, its opening facing back along that line to the middle.
      gate.x = cx + Math.sin(angle) * G.ring;
      gate.y = state.line;
      gate.z = cz - Math.cos(angle) * G.ring;
      gate.nx = Math.sin(angle);
      gate.nz = -Math.cos(angle);
      gate.state = WAITING;
      gate.at = sky.elapsed;
      gate.ended = -1;
    }
  }

  // Whether the glider's path this step went through a stone's opening, either way.
  function through(gate, pos) {
    const tx = -gate.nz;
    const tz = gate.nx;
    const ax = state.was.x - gate.x;
    const az = state.was.z - gate.z;
    const bx = pos.x - gate.x;
    const bz = pos.z - gate.z;
    from.x = ax * gate.nx + az * gate.nz;
    from.y = state.was.y;
    from.z = ax * tx + az * tz;
    to.x = bx * gate.nx + bz * gate.nz;
    to.y = pos.y;
    to.z = bx * tx + bz * tz;
    opening.corridor.minY = gate.y - G.tall;
    opening.corridor.maxY = gate.y + G.tall;
    return crossesGateway(from, to, opening);
  }

  function crumble(now) {
    for (let i = 0; i < state.gates.length; i++) {
      const gate = state.gates[i];
      if (gate.state !== WAITING) continue;
      gate.state = CRUMBLED;
      gate.ended = now;
    }
  }

  function step(dt, world) {
    const sky = world.sky.state;
    const { pos } = world.g;
    const now = sky.elapsed;
    const { blessing } = state;
    // Algiz is spent by the bell it turned aside, which the kettlebells count as they settle it.
    const bells = world.bells;
    if (bells && bells.state.glanced > state.spent) {
      state.spent = bells.state.glanced;
      if (blessing.rune === ALGIZ) {
        blessing.rune = NONE;
        blessing.since = now;
      }
    }
    if (sky.active && state.raised < G.lines.length && sky.peak >= G.lines[state.raised] - G.ahead) raise(world);
    let waiting = false;
    for (let i = 0; i < state.gates.length; i++) {
      const gate = state.gates[i];
      if (gate.state !== WAITING) continue;
      if (through(gate, pos)) {
        gate.state = TAKEN;
        gate.ended = now;
        blessing.rune = gate.rune;
        blessing.since = now;
        blessing.line = state.line;
        state.taken += 1;
        state.runes |= 1 << (gate.rune - 1);
        crumble(now);
        break;
      }
      waiting = true;
    }
    if (waiting && (now - state.gates[0].at > G.wait || sky.peak >= state.line + G.past)) crumble(now);
    state.was.x = pos.x;
    state.was.y = pos.y;
    state.was.z = pos.z;
  }

  /** The run has ended: nothing is left waiting to be flown through. The blessing stays as it was. */
  function finish(world) {
    crumble(world.sky.state.elapsed);
  }

  return { reset, step, finish, get state() { return state; } };
}
