import test from 'node:test';
import assert from 'node:assert/strict';
import { BELLS, BELL_PHASE, BELL_POOL, BELL_RESULT, createBells } from './bells.js';
import { RUN, createRunWorld, startRun, stepRun } from './run-step.js';
import { createReferencePilot } from './pilots.js';
import { CLOUD_STRIKE, CLOUD_ZONE, createCloudbaseRun } from './cloudbase-state.js';
import { FLIGHT, stepFlight } from './flight.js';
import { surfaceAt } from './terrain.js';

const STEP = RUN.step;
const firstSkies = (count) => Array.from({ length: count }, (_, i) => i + 1);
const wing = (g) => ({ ...g, pos: { ...g.pos } });

// A run's world on the sky laid out from `seed`, with a fresh set of kettlebells or none.
function runWorld(seed, { bells = createBells(), hazards = true, wind = true } = {}) {
  return startRun(createRunWorld({ sky: createCloudbaseRun({ hazards, wind }), bells }), seed);
}

// Flies `pilot` through a started run until it ends or `limit` seconds have gone, calling
// `each(world, intent)` after every step. Returns how the run ended.
function fly(world, pilot, { limit = 200, each = null } = {}) {
  const intent = { turn: 0, brake: false, bar: false };
  let reason = null;
  while (!reason && world.sky.state.elapsed < limit) {
    pilot.decide(world, intent);
    reason = stepRun(world, intent, STEP);
    each?.(world, intent);
  }
  return reason;
}

// The reference pilot (pilots.js) with one reflex: `react` seconds into a kettlebell's warning it
// changes what it is doing, as the hint tells a player to. Circling off the bar it pushes the bar
// and keeps turning; flying straight or on the bar it turns hard the other way, picked once for
// each bell so that it does not dither back to straight.
function dodger(react, options = {}) {
  const pilot = createReferencePilot(options);
  let away = 1;
  let pickedFor = -1;
  return {
    decide(world, intent) {
      pilot.decide(world, intent);
      const { state } = world.bells;
      if (state.warning < 0) return intent;
      const bell = state.bells[state.warning];
      if (world.sky.state.elapsed - bell.at < react) return intent;
      if (bell.circling) {
        intent.bar = true;
        intent.brake = false;
      } else {
        if (pickedFor !== bell.at) [pickedFor, away] = [bell.at, -(Math.sign(world.g.yawRate) || 1)];
        intent.turn = away;
      }
      return intent;
    },
  };
}

// Flies a run and keeps every kettlebell it throws as it was the moment it was thrown (when, at
// what peak, when the next was then due, and the bell itself), with the run time the pilot first
// reached 550 m and when the first throw was then due, and how the run ended. `each` sees every
// step as well.
function flyThrows(world, pilot, { each = null, ...options } = {}) {
  const throws = [];
  let reached = null;
  let firstDue = null;
  const reason = fly(world, pilot, {
    ...options,
    each(w, intent) {
      const { state } = w.bells;
      if (reached === null && w.sky.state.peak >= BELLS.from) [reached, firstDue] = [w.sky.state.elapsed, state.due];
      if (state.thrown > throws.length) {
        throws.push({ at: w.sky.state.elapsed, peak: w.sky.state.peak, due: state.due, bell: { ...state.bells[state.warning] } });
      }
      each?.(w, intent);
    },
  });
  return { throws, reached, firstDue, reason };
}

// The kettlebells on their own, with nothing else moving: a calm sky laid out from `seed` but never
// stepped, its clock and its pilot moved on by hand, and the glider parked level at trim at
// (x, y, z) facing `yaw`, with its peak where it is. What the bells read is what the test set.
function aloft(seed, { x = CLOUD_ZONE.x, y = 700, z = CLOUD_ZONE.z, yaw = 0, hazards = false } = {}) {
  const world = runWorld(seed, { hazards, wind: false });
  Object.assign(world.g.pos, { x, y, z });
  world.g.yaw = yaw;
  world.sky.state.peak = y;
  // With hazards on, the clouds are put out of the way, and the ravens were laid out low enough
  // that none can strike: the test brings in exactly what it wants.
  if (hazards) for (const cloud of world.sky.state.clouds) cloud.fade = 0;
  return world;
}

// Moves a held sky's clock on by `seconds` in fixed steps, stepping only the kettlebells, with
// `hold(world)` putting back whatever the test wants before each step.
function wait(world, seconds, hold = null) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    hold?.(world);
    world.sky.state.elapsed += STEP;
    world.bells.step(STEP, world);
  }
}

// Seconds of a held sky until the next throw, or Infinity if none comes within `limit`.
function untilThrown(world, limit = 10, hold = null) {
  const before = world.bells.state.thrown;
  for (let i = 1; i <= Math.round(limit / STEP); i++) {
    wait(world, STEP, hold);
    if (world.bells.state.thrown > before) return i * STEP;
  }
  return Infinity;
}

// Sends the kettlebell a held sky has in the air straight down `offset` metres east of the parked
// glider, so the nearest it comes across is the offset itself, and lets it fall past with `hold`
// as in `wait`. Returns the bell.
function sendDown(world, offset, hold = null) {
  const { state } = world.bells;
  const bell = state.bells[state.warning];
  const { pos } = world.g;
  Object.assign(bell, { aimX: pos.x + offset, aimY: pos.y, aimZ: pos.z, fromX: pos.x + offset, fromY: pos.y + BELLS.drop, fromZ: pos.z });
  wait(world, BELLS.lead + BELLS.fall, hold);
  return bell;
}

// An independent look ahead, written out the way run-step.js flies a step and sharing nothing with
// the kettlebells: the wing as it is now, on the controls it holds now, in the air the sky has now.
// `ground: false` leaves out the ground under it, as a look ahead that forgot it would.
function flyAhead(world, seconds, { ground = true } = {}) {
  const { sky } = world;
  const g = wing(world.g);
  const controls = { ...world.controls };
  const air = {};
  const forces = {};
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    sky.sample(g.pos, g.yaw, forces);
    Object.assign(air, {
      lift: forces.lift, sink: forces.sink, windX: forces.windX, windZ: forces.windZ, rough: forces.rough, calm: false,
      clearance: ground ? g.pos.y - surfaceAt(g.pos.x, g.pos.z) : Infinity,
    });
    g.lift = forces.lift;
    g.liftSide = forces.liftSide;
    stepFlight(g, controls, air, STEP);
  }
  return g.pos;
}

// Every number in a set of kettlebells, with where it is kept.
const numbers = (state) => [
  ...Object.entries(state).filter(([, value]) => typeof value === 'number'),
  ...state.bells.flatMap((bell, i) => Object.entries(bell).filter(([, value]) => typeof value === 'number').map(([key, value]) => [`bells[${i}].${key}`, value])),
];

test('nothing is thrown before the pilot first reaches 550 m, and the first kettlebell follows 3 to 6 s after', () => {
  // Parked a metre short of it for a minute nothing comes; from 550 m exactly the giant starts.
  const short = aloft(7, { y: BELLS.from - 1 });
  wait(short, 60);
  assert.deepEqual([short.bells.state.thrown, short.bells.state.due], [0, -1]);
  short.sky.state.peak = short.g.pos.y = BELLS.from;
  const waited = untilThrown(short);
  assert.ok(waited >= BELLS.first[0] && waited <= BELLS.first[1] + STEP, `the first came ${waited.toFixed(2)} s after`);
  // Climbing there on calm skies, where nothing else can hold a throw back.
  const delays = firstSkies(8).map((seed) => {
    const { throws, reached } = flyThrows(runWorld(seed, { hazards: false, wind: false }), createReferencePilot());
    assert.ok(throws.length >= 2, `seed ${seed}: ${throws.length} thrown`);
    assert.ok(throws.every((thrown) => thrown.peak >= BELLS.from));
    const delay = throws[0].at - reached;
    assert.ok(delay >= BELLS.first[0] && delay <= BELLS.first[1] + STEP, `seed ${seed}: the first came ${delay.toFixed(2)} s after 550 m`);
    return delay;
  });
  assert.ok(Math.max(...delays) - Math.min(...delays) > 1, 'the wait differs from sky to sky');
});

test('kettlebells come every 16 to 22 s, and every 10 to 14 s once the pilot has passed 1,000 m', () => {
  // On calm skies nothing holds a throw back but the shield after a hit, which is over before the
  // next is due: a throw, its hit 2.2 s later, 8 s of shield and 2 quiet make 12.2 s.
  const gaps = { every: [], oftener: [] };
  for (const seed of firstSkies(10)) {
    const { throws } = flyThrows(runWorld(seed, { hazards: false, wind: false }), createReferencePilot());
    for (let i = 1; i < throws.length; i++) {
      const high = throws[i - 1].peak >= BELLS.often;
      const [least, most] = high ? BELLS.oftener : BELLS.every;
      const gap = throws[i].at - throws[i - 1].at;
      assert.ok(gap >= least - 1e-9 && gap <= most + STEP + 1e-9, `seed ${seed}: ${gap.toFixed(2)} s between throws ${i} and ${i + 1}`);
      // The next is due a drawn gap after each throw, in the range for how high the pilot has been.
      const drawn = throws[i - 1].due - throws[i - 1].at;
      assert.ok(drawn >= least && drawn <= most);
      gaps[high ? 'oftener' : 'every'].push(gap);
    }
  }
  assert.ok(gaps.every.length >= 10 && gaps.oftener.length >= 5, `${gaps.every.length} gaps low down, ${gaps.oftener.length} high`);
  assert.ok(Math.max(...gaps.every) - Math.min(...gaps.every) > 3, 'the gaps are drawn, not fixed');
});

test('each kettlebell is aimed where the glider would be 2.4 s later if the pilot held what it was doing, to the last bit', () => {
  // Full skies, with lift, wind, gusts and cloud in the air the look ahead flies through, and a
  // pilot that holds the light brake, so the controls held include more than the turn.
  let aimed = 0;
  let braked = 0;
  for (const seed of firstSkies(6)) {
    const world = runWorld(seed);
    let seen = 0;
    fly(world, createReferencePilot({ brake: 'eased' }), {
      each(w) {
        const { state } = w.bells;
        if (state.thrown === seen) return;
        seen = state.thrown;
        const bell = state.bells[state.warning];
        const ahead = flyAhead(w, BELLS.lead);
        assert.deepEqual([bell.aimX, bell.aimY, bell.aimZ], [ahead.x, ahead.y, ahead.z], `seed ${seed}, throw ${seen}`);
        // About as far ahead as 2.4 s of flying takes it.
        const reach = Math.hypot(bell.aimX - w.g.pos.x, bell.aimZ - w.g.pos.z);
        assert.ok(reach > 10 && reach < 45, `the aim was ${reach.toFixed(1)} m away`);
        assert.equal(bell.circling, Math.abs(w.g.yawRate) > BELLS.turning && w.g.bar < 0.5);
        aimed++;
        if (w.controls.brake) braked++;
      },
    });
  }
  assert.ok(aimed >= 15 && braked >= 3, `${aimed} aims checked, ${braked} with the brake held`);
  // Even the ground counts, as it does in a run: a slow wing held on a deep brake 19 m up, where
  // a gentle stall cannot begin, is aimed at as a wing that does not stall.
  const low = aloft(2, { y: surfaceAt(CLOUD_ZONE.x, CLOUD_ZONE.z) + 19 });
  low.sky.state.peak = 700;
  Object.assign(low.g, { speed: FLIGHT.speed.deep, brake: 0.9, stallLoad: 0.97 });
  low.controls.brake = true;
  assert.ok(untilThrown(low) < 10);
  const bell = low.bells.state.bells[low.bells.state.warning];
  const ahead = flyAhead(low, BELLS.lead);
  assert.deepEqual([bell.aimX, bell.aimY, bell.aimZ], [ahead.x, ahead.y, ahead.z]);
  const stalled = flyAhead(low, BELLS.lead, { ground: false });
  assert.ok(Math.abs(stalled.y - ahead.y) > 1, 'without the ground the wing would have stalled');
});

test('the warning says whether the pilot was circling off the bar when the bell was thrown, for the hint to say what to change', () => {
  // Turning rate (rad/s) and how far the bar was on, as the bell was thrown.
  for (const [yawRate, bar, circling] of [[0.6, 0, true], [-0.6, 0, true], [0.6, 0.4, true], [BELLS.turning - 0.05, 0, false], [0.6, 1, false], [0, 0, false]]) {
    const world = aloft(9);
    Object.assign(world.g, { yawRate, bar });
    assert.ok(untilThrown(world) < 10);
    assert.equal(world.bells.state.bells[world.bells.state.warning].circling, circling, `${yawRate} rad/s, bar ${bar}`);
  }
});

test('each sky\'s kettlebells are the ones it has always thrown: the same first wait, weights, sides and gaps', () => {
  // Measured from these rules with the glider parked at 700 m in the middle of a calm sky: the wait
  // before the first throw (s), then each throw's weight (kg), the side it falls from (as a heading
  // it falls along, in radians) and the gap drawn after it (s). Replaying a run depends on every
  // one of them, so none may change without a new SIM_VERSION.
  const GOLDEN = [
    [1, 5.586064953356981, [[32, -0.1885215159464185, 21.496458339039236], [24, 1.7438528397961535, 19.08541062660515],
      [16, -1.1215076122079606, 21.282741426490254], [32, 0.6745923300611545, 19.444299370981753]]],
    [2, 3.8827028959058225, [[32, -1.3690414440827785, 18.06277090869844], [24, -0.6618729537109329, 16.85568733187392],
      [16, 2.842086088064862, 16.50701821455732], [16, 3.0470436846628695, 21.78551290091128]]],
    [0xdeadbeef, 5.577188690425828, [[24, -0.560520745698937, 20.460545922163874], [24, 0.9457476207445459, 17.96753920614719],
      [32, -0.2566952554048818, 17.211114000994712], [24, -2.0999227261647233, 20.25352866481989]]],
  ];
  const near = (value, wanted, what) => assert.ok(Math.abs(value - wanted) < 1e-9, `${what}: ${value} is not ${wanted}`);
  for (const [seed, first, throws] of GOLDEN) {
    const world = aloft(seed);
    wait(world, STEP);
    const { state } = world.bells;
    near(state.due - world.sky.state.elapsed, first, `seed ${seed}'s first wait`);
    throws.forEach(([kg, side, gap], k) => {
      assert.ok(untilThrown(world, 30) < 30);
      const bell = state.bells[state.warning];
      assert.equal(bell.kg, kg);
      near(Math.atan2(bell.aimX - bell.fromX, -(bell.aimZ - bell.fromZ)), side, `seed ${seed}, bell ${k + 1}'s side`);
      near(state.due - bell.at, gap, `seed ${seed}, the gap after bell ${k + 1}`);
    });
  }
});

test('a kettlebell falls from 96 m above and 26 m beside its aim, reaches it 2.4 s after its warning begins and falls on for 1.5 s', () => {
  const world = runWorld(3);
  const { state } = world.bells;
  const weights = new Set();
  const bearings = [];
  let followed = 0;
  fly(world, createReferencePilot(), {
    each(w) {
      for (const bell of state.bells) {
        if (bell.phase === BELL_PHASE.idle) continue;
        const t = w.sky.state.elapsed - bell.at;
        if (t === 0) {
          // Just thrown: from straight above the aim's ring and to one side of it.
          assert.equal(bell.fromY - bell.aimY, BELLS.drop);
          assert.ok(Math.abs(Math.hypot(bell.fromX - bell.aimX, bell.fromZ - bell.aimZ) - BELLS.side) < 1e-9);
          assert.deepEqual([bell.x, bell.y, bell.z], [bell.fromX, bell.fromY, bell.fromZ]);
          weights.add(bell.kg);
          bearings.push(Math.atan2(bell.aimX - bell.fromX, -(bell.aimZ - bell.fromZ)));
        }
        // Always on its line, and at the aim when the lead is up.
        const along = t / BELLS.lead;
        for (const axis of ['X', 'Y', 'Z']) {
          const want = bell[`from${axis}`] + (bell[`aim${axis}`] - bell[`from${axis}`]) * along;
          assert.ok(Math.abs(bell[axis.toLowerCase()] - want) < 1e-9);
        }
        if (Math.abs(t - BELLS.lead) < STEP / 2) {
          assert.ok(Math.hypot(bell.x - bell.aimX, bell.y - bell.aimY, bell.z - bell.aimZ) < 1e-6);
          followed++;
        }
        assert.ok(t < BELLS.lead + BELLS.fall, 'it is gone once it has fallen 1.5 s past the aim');
        assert.equal(bell.phase, bell.result === BELL_RESULT.pending ? BELL_PHASE.warning : BELL_PHASE.away);
      }
    },
  });
  // All of them, unless the fog ended the run with one still in the air.
  assert.ok(followed >= 3 && followed >= state.thrown - 1, `${followed} of ${state.thrown} followed to the aim`);
  for (const weight of weights) assert.ok(BELLS.kg.includes(weight));
  // Over the throws of a few runs the bells come from every side and in every weight.
  for (const seed of [4, 5, 6]) {
    const { throws } = flyThrows(runWorld(seed), createReferencePilot());
    for (const { bell } of throws) {
      weights.add(bell.kg);
      bearings.push(Math.atan2(bell.aimX - bell.fromX, -(bell.aimZ - bell.fromZ)));
    }
  }
  assert.equal(weights.size, BELLS.kg.length);
  const quarters = new Set(bearings.map((bearing) => Math.floor(((bearing + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 2))));
  assert.equal(quarters.size, 4);
});

test('a kettlebell hit is exactly the sky\'s own strike from nowhere, and the folded wing then hooks the way the pilot was turning', () => {
  // A pilot circling left at 700 m in the middle of a calm sky, holding exactly what it does, so the
  // first kettlebell finds it; and its twin with no kettlebells, struck by hand at the same moment.
  const circle = { turn: -1, brake: false, bar: false };
  const make = (bells) => {
    const world = runWorld(21, { bells, hazards: false, wind: false });
    Object.assign(world.g.pos, { x: CLOUD_ZONE.x, y: 700, z: CLOUD_ZONE.z });
    return world;
  };
  const struck = make(createBells());
  const twin = make(null);
  for (let i = 0; struck.bells.state.hits === 0 && i < 30 * 60; i++) {
    stepRun(struck, circle, STEP);
    stepRun(twin, circle, STEP);
  }
  assert.deepEqual([struck.bells.state.thrown, struck.bells.state.hits], [1, 1]);
  assert.equal(struck.bells.state.bells[0].result, BELL_RESULT.hit);
  assert.equal(twin.sky.strike(-1), true);
  assert.deepEqual(struck.sky.state, twin.sky.state);
  assert.deepEqual(wing(struck.g), wing(twin.g));
  // The step that struck also answered it: the wing hooks left, the way the pilot was turning, and
  // not the way the run started out (right) as it would if the hook were read before the bell.
  assert.ok(struck.g.yawRate < -0.5);
  assert.deepEqual([struck.hook, struck.struck], [-1, 1]);
  // While folded, a hard right asked of it still hooks left, and the hands do not reach it.
  for (let i = 0; i < 60; i++) stepRun(struck, { turn: 1, brake: true, bar: false }, STEP);
  assert.ok(struck.g.yawRate < 0);
  assert.equal(struck.controls.locked, true);
  assert.equal(struck.g.brake, 0);
});

test('a kettlebell that misses by under 9 m is a close call, a wider one is a dodge, and neither touches the sky', () => {
  // Sent straight down beside a parked glider, so the nearest it comes across is the offset itself.
  for (const [offset, result] of [[0, 'hit'], [CLOUD_STRIKE.radius - 0.05, 'hit'], [CLOUD_STRIKE.radius + 0.05, 'close'], [BELLS.close - 0.05, 'close'], [BELLS.close + 0.05, 'dodged'], [30, 'dodged']]) {
    const world = aloft(11);
    const before = structuredClone(world.sky.state);
    assert.ok(untilThrown(world) < 10);
    const bell = sendDown(world, offset);
    assert.equal(bell.result, BELL_RESULT[result], `${offset} m off`);
    assert.ok(Math.abs(bell.near - offset) < 1e-9);
    const { thrown, hits, close, dodged } = world.bells.state;
    assert.deepEqual({ thrown, hits, close, dodged }, { thrown: 1, hits: +(result === 'hit'), close: +(result === 'close'), dodged: +(result === 'dodged') });
    if (result === 'hit') {
      assert.equal(world.sky.state.pilot.strikes, 1);
    } else {
      // Only the clock this test moved by hand has changed.
      before.elapsed = world.sky.state.elapsed;
      assert.deepEqual(world.sky.state, before);
    }
  }
});

test('a miss is judged by the nearest the kettlebell came across while level with the wing: not where it came level, not where it left, and not where it passed far above', () => {
  // The band level with the wing, CLOUD_STRIKE.half either side of the chest, as the shares of a
  // bell's line where it comes into it and leaves it, falling from 96 m above the glider to it.
  const top = (BELLS.drop - CLOUD_STRIKE.rise - CLOUD_STRIKE.half) / BELLS.drop;
  const bottom = (BELLS.drop - CLOUD_STRIKE.rise + CLOUD_STRIKE.half) / BELLS.drop;
  // Each sent down a slant past the parked glider, as a bell meets a glider flying across its
  // fall: `comes` m across where it comes level with the wing and `leaves` m across where it
  // leaves that level, in a straight line. One going away from the wing passed right over it on
  // the way down, far above it.
  for (const [comes, leaves, result] of [[7, 12, 'close'], [12, 7, 'close'], [10, 15, 'dodged']]) {
    const world = aloft(11);
    const before = structuredClone(world.sky.state);
    assert.ok(untilThrown(world) < 10);
    const { state } = world.bells;
    const bell = state.bells[state.warning];
    const { pos } = world.g;
    const across = (share) => comes + ((leaves - comes) * (share - top)) / (bottom - top);
    Object.assign(bell, { fromX: pos.x + across(0), fromY: pos.y + BELLS.drop, fromZ: pos.z, aimX: pos.x + across(1), aimY: pos.y, aimZ: pos.z });
    // Watched step by step until it has fallen out of the picture: how far across it was on each
    // step it was level with the wing and still undecided, and the nearest it came above that.
    const level = [];
    let above = Infinity;
    while (bell.phase !== BELL_PHASE.idle) {
      const pending = bell.result === BELL_RESULT.pending;
      wait(world, STEP);
      const distance = Math.hypot(bell.x - pos.x, bell.z - pos.z);
      const height = bell.y - (pos.y + CLOUD_STRIKE.rise);
      if (pending && Math.abs(height) < CLOUD_STRIKE.half) level.push(distance);
      else if (pending && height > 0) above = Math.min(above, distance);
    }
    const what = `${comes} m across coming level, ${leaves} m leaving`;
    assert.equal(bell.result, BELL_RESULT[result], what);
    assert.ok(level.length >= 10, `${level.length} steps level with the wing`);
    // It came as near as the nearest step level with the wing, and wider than a close call at one
    // end of that stretch or both, so neither end alone says how near it came.
    assert.ok(Math.abs(bell.near - Math.min(...level)) < 1e-9, what);
    assert.ok(Math.abs(bell.near - Math.min(comes, leaves)) < 0.5, `${bell.near.toFixed(2)} m`);
    assert.ok(Math.max(level[0], level.at(-1)) > BELLS.close, what);
    if (leaves > comes) assert.ok(above < CLOUD_STRIKE.radius, `${above.toFixed(2)} m across, high above the wing`);
    const { thrown, hits, close, dodged } = state;
    assert.deepEqual({ thrown, hits, close, dodged }, { thrown: 1, hits: 0, close: +(result === 'close'), dodged: +(result === 'dodged') });
    before.elapsed = world.sky.state.elapsed;
    assert.deepEqual(world.sky.state, before);
  }
});

test('no kettlebell is thrown while anything blocks it, and one comes once every block has stayed away 2 s', () => {
  // The glider parked `inside` metres in from the rim, east of the middle, facing back in.
  const nearRim = (inside) => (world) => {
    Object.assign(world.g.pos, { x: CLOUD_ZONE.x + CLOUD_ZONE.r - inside, z: CLOUD_ZONE.z });
    world.g.yaw = -Math.PI / 2;
  };
  const blocks = [
    ['the shield after a strike', (world) => { world.sky.state.pilot.shield = 1; }, (world) => { world.sky.state.pilot.shield = 0; }],
    ['cloud, however thin', (world) => { world.sky.state.pilot.cloud = 0.01; }, (world) => { world.sky.state.pilot.cloud = 0; }],
    ['a raven about to cross', (world) => { world.sky.state.pilot.danger = 1; }, (world) => { world.sky.state.pilot.danger = 0; }],
    ['a stall', (world) => { world.g.stall = 1; }, (world) => { world.g.stall = 0; }],
    ['a gust front 5.9 s off', (world) => { world.sky.state.pilot.gustIn = BELLS.gust - 0.1; }, (world) => { world.sky.state.pilot.gustIn = BELLS.gust; }],
    ['the rim 14 m away', nearRim(BELLS.edge - 1), nearRim(BELLS.edge + 1)],
  ];
  for (const [what, on, off] of blocks) {
    const world = aloft(5);
    // Long past the time the first throw was due.
    wait(world, 8, on);
    const { state } = world.bells;
    assert.equal(state.thrown, 0, what);
    assert.ok(state.due > 0 && state.due < world.sky.state.elapsed - 1, `${what}: a throw was due`);
    off(world);
    const waited = untilThrown(world);
    assert.ok(waited >= BELLS.quiet && waited <= BELLS.quiet + 2 * STEP, `${what}: thrown ${waited.toFixed(3)} s after it cleared`);
  }
  // A block that comes back, however briefly, starts the quiet over again.
  const flicker = aloft(5);
  wait(flicker, 8, (world) => { world.sky.state.pilot.danger = Math.round(world.sky.state.elapsed / STEP) % 90 === 0 ? 1 : 0; });
  assert.equal(flicker.bells.state.thrown, 0);
  // A kettlebell still in the air holds the next back until it has fallen out of the picture.
  const second = aloft(5);
  assert.ok(untilThrown(second) < 10);
  second.bells.state.due = second.sky.state.elapsed;
  const waited = untilThrown(second);
  const gone = BELLS.lead + BELLS.fall + BELLS.quiet;
  assert.ok(waited >= gone - STEP && waited <= gone + 2 * STEP, `the next came ${waited.toFixed(3)} s after`);
  assert.equal(second.bells.state.bells[0].result, BELL_RESULT.dodged, 'the parked glider was nowhere near it');
});

test('an aim by the rim, in cloud or by a raven that can strike is refused, and tried again a quarter of a second later', () => {
  // Tries to throw at a held sky for `seconds`, and says when each refused aim was put off until.
  const refusals = (world, seconds) => {
    const retries = [];
    for (let i = 0; i < Math.round(seconds / STEP); i++) {
      wait(world, STEP);
      if (world.bells.state.retry !== (retries.at(-1) ?? 0)) retries.push(world.bells.state.retry);
    }
    return retries;
  };
  // A throw put off and put off again, every quarter of a second, until the way is clear.
  const putOff = (world, what) => {
    const retries = refusals(world, 10);
    assert.equal(world.bells.state.thrown, 0, what);
    assert.ok(retries.length >= 12, `${what}: ${retries.length} refusals`);
    for (let i = 1; i < retries.length; i++) {
      const gap = retries[i] - retries[i - 1];
      assert.ok(gap >= BELLS.retry - 1e-9 && gap <= BELLS.retry + STEP + 1e-9, `${what}: tried again after ${gap.toFixed(3)} s`);
    }
  };

  // Heading out over the rim from 16 m inside it: not blocked, but the aim is over the edge.
  const rim = aloft(5, { x: CLOUD_ZONE.x + CLOUD_ZONE.r - BELLS.edge - 1, yaw: Math.PI / 2 });
  putOff(rim, 'the rim');
  rim.g.yaw = -Math.PI / 2;
  assert.ok(untilThrown(rim, BELLS.retry + STEP) <= BELLS.retry + STEP);

  // A cloud sat on the aim, though not on the pilot.
  const cloudy = aloft(5, { hazards: true });
  const aim = flyAhead(cloudy, BELLS.lead);
  const cloud = cloudy.sky.state.clouds[0];
  Object.assign(cloud, { x: aim.x, y: aim.y + CLOUD_STRIKE.rise, z: aim.z, rx: 12, ry: 12, rz: 12, cos: 1, sin: 0, fade: 1 });
  assert.equal(cloudy.sky.depthAt(cloudy.g.pos.x, cloudy.g.pos.y + CLOUD_STRIKE.rise, cloudy.g.pos.z), 0);
  putOff(cloudy, 'cloud');
  cloud.fade = 0;
  assert.ok(untilThrown(cloudy, BELLS.retry + STEP) <= BELLS.retry + STEP);

  // A raven that can strike, 8 m across from the aim and 10 m above the wing there.
  const ravens = aloft(5, { hazards: true });
  const target = flyAhead(ravens, BELLS.lead);
  const raven = ravens.sky.state.ravens[0];
  const chest = target.y + CLOUD_STRIKE.rise;
  Object.assign(raven, { x: target.x + 8, y: chest + 10, z: target.z, hot: true });
  putOff(ravens, 'a raven');
  // One that high above the wing, or below it, or 13 m across, is no reason to wait.
  raven.y = chest + CLOUD_STRIKE.warn.above + 1;
  assert.ok(untilThrown(ravens, BELLS.retry + STEP) <= BELLS.retry + STEP);
  for (const [dx, dy] of [[8, -CLOUD_STRIKE.half - 1], [BELLS.raven + 1, 10]]) {
    const clear = aloft(5, { hazards: true });
    Object.assign(clear.sky.state.ravens[0], { x: target.x + dx, y: chest + dy, z: target.z, hot: true });
    assert.equal(refusals(clear, 8).length, 0);
    assert.equal(clear.bells.state.thrown, 1);
  }
});

test('only one kettlebell is ever in the air, so only one warning shows at a time', () => {
  for (const seed of firstSkies(8)) {
    for (const pilot of [createReferencePilot(), dodger(0.4, { brake: 'eased' })]) {
      const world = runWorld(seed);
      fly(world, pilot, {
        each(w) {
          const { state } = w.bells;
          const flying = state.bells.filter((bell) => bell.phase !== BELL_PHASE.idle);
          assert.ok(flying.length <= 1);
          const warning = state.bells.findIndex((bell) => bell.phase === BELL_PHASE.warning);
          assert.equal(state.warning, warning);
          if (warning >= 0) assert.equal(state.bells[warning].result, BELL_RESULT.pending);
        },
      });
    }
  }
});

test('a pilot hidden in cloud is never hit, nor one whose wing is already shielded', () => {
  // Straight down onto a parked glider, with the cloud coming in after the throw (the giant never
  // throws at a pilot already in one): as deep as `cover` hides the pilot, and any thinner does not.
  const inCloud = (depth) => (world) => { world.sky.state.pilot.cloud = depth; };
  const hidden = aloft(13);
  assert.ok(untilThrown(hidden) < 10);
  const before = structuredClone(hidden.sky.state);
  assert.equal(sendDown(hidden, 0, inCloud(CLOUD_STRIKE.cover)).result, BELL_RESULT.hidden);
  assert.deepEqual([hidden.bells.state.hits, hidden.bells.state.close, hidden.bells.state.dodged], [0, 0, 0]);
  // Nothing of the sky changed but the clock and the cloud this test moved.
  Object.assign(before, { elapsed: hidden.sky.state.elapsed });
  before.pilot.cloud = CLOUD_STRIKE.cover;
  assert.deepEqual(hidden.sky.state, before);
  const thin = aloft(13);
  assert.ok(untilThrown(thin) < 10);
  assert.equal(sendDown(thin, 0, inCloud(CLOUD_STRIKE.cover - 0.01)).result, BELL_RESULT.hit);
  assert.equal(thin.sky.state.pilot.strikes, 1);
  // A raven's strike during the warning raises the shield, and the bell then cannot fold the wing again.
  const shielded = aloft(13);
  assert.ok(untilThrown(shielded) < 10);
  assert.equal(shielded.sky.strike(), true);
  assert.equal(sendDown(shielded, 0).result, BELL_RESULT.shielded);
  assert.deepEqual([shielded.sky.state.pilot.strikes, shielded.bells.state.hits], [1, 0]);
  // And in whole runs, no hit ever lands on a pilot inside cloud.
  let hits = 0;
  for (const seed of firstSkies(8)) {
    const world = runWorld(seed);
    let seen = 0;
    fly(world, createReferencePilot({ brake: 'eased' }), {
      each(w) {
        if (w.bells.state.hits === seen) return;
        seen = w.bells.state.hits;
        assert.ok(w.sky.state.pilot.cloud < CLOUD_STRIKE.cover);
        hits++;
      },
    });
  }
  assert.ok(hits >= 15, `${hits} hits`);
});

test('a run whose kettlebells all miss is, to the last bit, the run flown without them', () => {
  // The dodger flies each sky with kettlebells; its twin flies the same sky without any, asking
  // exactly what the dodger asked at every step. Every throw, look ahead and near miss of the
  // first must leave the sky, its generator and the wing as the second has them.
  let twins = 0;
  let thrown = 0;
  let close = 0;
  for (const seed of firstSkies(10)) {
    const asked = [];
    const world = runWorld(seed);
    const reason = fly(world, dodger(0.4, { brake: 'eased' }), { each: (w, intent) => asked.push({ ...intent }) });
    if (world.bells.state.hits > 0) continue;
    let i = 0;
    const twin = runWorld(seed, { bells: null });
    const replay = { decide: (w, intent) => Object.assign(intent, asked[i++]) };
    assert.equal(fly(twin, replay), reason);
    assert.equal(i, asked.length);
    assert.deepEqual(twin.sky.state, world.sky.state, `seed ${seed}`);
    assert.deepEqual(wing(twin.g), wing(world.g));
    assert.deepEqual([twin.hook, twin.struck, twin.stalls, twin.steps], [world.hook, world.struck, world.stalls, world.steps]);
    twins++;
    thrown += world.bells.state.thrown;
    close += world.bells.state.close;
  }
  assert.ok(twins >= 8 && thrown >= 30 && close >= 1, `${twins} twins, ${thrown} thrown, ${close} close calls`);
});

test('every number the kettlebells keep stays finite, every bell comes out as near as it came, and the pool never changes', () => {
  const bells = createBells();
  const pool = [bells.state.bells, ...bells.state.bells];
  const finite = (state) => {
    for (const [key, value] of numbers(state)) assert.ok(Number.isFinite(value), `${key} is ${value}`);
  };
  let settled = 0;
  for (const seed of firstSkies(8)) {
    for (const pilot of [createReferencePilot({ brake: 'eased' }), dodger(0.4)]) {
      const world = runWorld(seed, { bells });
      finite(bells.state);
      const came = [0, 0, 0, 0, 0, 0];
      const was = bells.state.bells.map((bell) => bell.result);
      fly(world, pilot, {
        each(w) {
          const { state } = w.bells;
          if (w.steps % 30 === 0) finite(state);
          state.bells.forEach((bell, i) => {
            if (bell.result === was[i]) return;
            was[i] = bell.result;
            if (bell.result === BELL_RESULT.pending) return;
            came[bell.result]++;
            // How each one came out is how near it came while level with the wing.
            if (bell.result === BELL_RESULT.close) assert.ok(bell.near >= CLOUD_STRIKE.radius && bell.near < BELLS.close);
            else if (bell.result === BELL_RESULT.dodged) assert.ok(bell.near >= BELLS.close);
            else assert.ok(bell.near < CLOUD_STRIKE.radius);
          });
        },
      });
      finite(bells.state);
      // The counts are those outcomes, and every bell thrown has one but any the fog cut short.
      const { thrown, hits, close, dodged } = bells.state;
      const done = came.reduce((sum, count) => sum + count, 0);
      assert.deepEqual([came[BELL_RESULT.hit], came[BELL_RESULT.close], came[BELL_RESULT.dodged]], [hits, close, dodged]);
      assert.ok(done <= thrown && thrown - done <= 1);
      settled += done;
    }
  }
  assert.ok(settled >= 60, `${settled} bells settled`);
  assert.equal(bells.state.bells.length, BELL_POOL);
  assert.deepEqual([bells.state.bells, ...bells.state.bells].map((part, i) => part === pool[i]), pool.map(() => true));
});

test('once the fog has ended a run nothing more is thrown, and the kettlebells stay as the run left them', () => {
  const world = runWorld(2);
  assert.equal(fly(world, createReferencePilot()), 'fog');
  const left = structuredClone(world.bells.state);
  assert.ok(left.thrown >= 3);
  // Stepped on regardless for longer than any gap between throws: the finished sky's step says
  // nothing has ended, so the kettlebells are stepped, and must do nothing.
  for (let i = 0; i < 30 * 60; i++) stepRun(world, { turn: 0, brake: false, bar: false }, STEP);
  assert.deepEqual(world.bells.state, left);
});

test('the same seed throws the same kettlebells, a used set throws them as a new one would, and another seed throws others', () => {
  const flown = (seed, bells = createBells()) => {
    const world = runWorld(seed, { bells });
    fly(world, createReferencePilot({ brake: 'eased' }));
    return world;
  };
  const first = flown(4);
  const again = flown(4);
  assert.ok(first.bells.state.thrown >= 3);
  assert.deepEqual(again.bells.state, first.bells.state);
  assert.deepEqual(again.sky.state, first.sky.state);
  // A set that has been through another run and been struck from, reset for this sky.
  const used = createBells();
  flown(9, used);
  assert.ok(used.state.hits > 0);
  assert.deepEqual(flown(4, used).bells.state, first.bells.state);
  assert.notDeepEqual(flown(5).bells.state, first.bells.state);
});

test('what each kettlebell is comes from the seed and its number alone, however the run is flown', () => {
  // The same sky flown two ways: the throws come at other moments and at other aims, but the k-th
  // bell's side, weight and drawn gap are the same, and so is the first one's wait.
  const ways = [createReferencePilot(), dodger(0.4, { brake: 'eased' })].map((pilot) => flyThrows(runWorld(17), pilot));
  const [one, other] = ways;
  const count = Math.min(one.throws.length, other.throws.length);
  assert.ok(count >= 3);
  assert.notDeepEqual(one.throws.map((thrown) => thrown.at), other.throws.map((thrown) => thrown.at));
  assert.ok(Math.abs((one.firstDue - one.reached) - (other.firstDue - other.reached)) < 1e-9);
  for (let k = 0; k < count; k++) {
    const [a, b] = [one.throws[k], other.throws[k]];
    const side = ({ bell }) => [(bell.fromX - bell.aimX) / BELLS.side, (bell.fromZ - bell.aimZ) / BELLS.side];
    side(a).forEach((value, i) => assert.ok(Math.abs(value - side(b)[i]) < 1e-9, `bell ${k + 1}'s side`));
    assert.equal(a.bell.kg, b.bell.kg);
    const share = ({ at, due, peak }) => {
      const [least, most] = peak >= BELLS.often ? BELLS.oftener : BELLS.every;
      return (due - at - least) / (most - least);
    };
    assert.ok(Math.abs(share(a) - share(b)) < 1e-9, `the gap after bell ${k + 1}`);
  }
});

// Measured with these rules over seeds 1-40 and 1001-1040: kettlebells thrown a run, the share
// that hit, and runs of 40 that passed 1,000 m.
//   no kettlebells                                  -            -            39 / 36
//   holding its line, hands up                      4.0 / 3.9    78 / 79%     24 / 22
//   holding its line, light brake eased             3.7 / 4.0    80 / 81%     24 / 23
//   changing what it does 0.4 s in, hands up        4.3 / 4.1    0.6 / 3.1%   34 / 31
//   changing what it does 0.4 s in, brake eased     4.1 / 4.3    0.6 / 0.6%   31 / 38
//   changing what it does 0.6 s in, brake eased     4.2 / 4.3    1.8 / 0.6%   33 / 38
// The first comes a median 6 to 14 s after the pilot reaches 550 m and the rest about every 21 s;
// 54 to 73% are thrown at a circling pilot, aimed a median 27 to 42 degrees off its nose. The pins
// in good-lift.test.js hold the balance; this only holds the promise that dodging works.
test('a pilot who holds its line is hit by most kettlebells, and one who changes what it is doing 0.4 s into the warning hardly ever is', () => {
  const share = (pilot) => {
    let thrown = 0;
    let hits = 0;
    for (const seed of firstSkies(16)) {
      const world = runWorld(seed);
      fly(world, pilot());
      thrown += world.bells.state.thrown;
      hits += world.bells.state.hits;
    }
    return { thrown, share: hits / thrown };
  };
  const holding = share(() => createReferencePilot({ brake: 'eased' }));
  const dodging = share(() => dodger(0.4, { brake: 'eased' }));
  assert.ok(holding.thrown >= 50 && dodging.thrown >= 50);
  assert.ok(holding.share >= 0.6, `${(holding.share * 100).toFixed(1)}% of the bells hit a pilot holding its line`);
  assert.ok(dodging.share <= 0.05, `${(dodging.share * 100).toFixed(1)}% of the bells hit the dodger`);
});
