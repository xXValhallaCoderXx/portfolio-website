import test from 'node:test';
import assert from 'node:assert/strict';
import { BEAST, BELLS, BELL_PHASE, BELL_POOL, BELL_RESULT, createBells } from './bells.js';
import { RUN, createRunWorld, startRun, stepRun } from './run-step.js';
import { RUNE } from './meet-runes.js';
import { CLOUD_STRIKE, CLOUD_ZONE, createCloudbaseRun } from './cloudbase-state.js';
import { copyFlight, createFlight, settleFlight, stepFlight } from './flight.js';
import { surfaceAt } from './terrain.js';

const STEP = RUN.step;
const wing = (g) => copyFlight(createFlight(), g);

// A run's world on the sky laid out from `seed`, with a fresh set of kettlebells or none.
function runWorld(seed, { bells = createBells(), hazards = true, wind = true } = {}) {
  return startRun(createRunWorld({ sky: createCloudbaseRun({ hazards, wind }), bells }), seed);
}

// The kettlebells on their own, with nothing else moving: a calm sky laid out from `seed` but never
// stepped, its clock and its pilot moved on by hand, and the glider parked level at trim at
// (x, y, z) facing `yaw`, with its peak where it is. What the bells read is what the test set.
function aloft(seed, { x = CLOUD_ZONE.x, y = 700, z = CLOUD_ZONE.z, yaw = 0, hazards = false } = {}) {
  const world = runWorld(seed, { hazards, wind: false });
  Object.assign(world.g.pos, { x, y, z });
  world.g.yaw = yaw;
  world.sky.state.peak = y;
  world.sky.state.elapsed = RUN.grace;
  settleFlight(world.g);
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
function untilThrown(world, limit = 20, hold = null) {
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
  wait(world, bell.lead + BELLS.fall + STEP, hold);
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
      lift: forces.lift, sink: forces.sink, windX: forces.windX, windY: forces.windY, windZ: forces.windZ, hazardSink: forces.hazardSink, rough: forces.rough, calm: false,
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
  ...Object.entries(state.beast).map(([key, value]) => [`beast.${key}`, value]),
  ...state.bells.flatMap((bell, i) => Object.entries(bell).filter(([, value]) => typeof value === 'number').map(([key, value]) => [`bells[${i}].${key}`, value])),
];

test('the opening minute and the first700 metres are free of throws, then a seeded10–15 second warning begins', () => {
  const short = aloft(7, { y: BELLS.from - 1 });
  wait(short, 120);
  assert.deepEqual([short.bells.state.thrown, short.bells.state.due], [0, -1]);
  short.sky.state.peak = short.g.pos.y = BELLS.from;
  const waited = untilThrown(short);
  assert.ok(waited >= BELLS.first[0] && waited <= BELLS.first[1] + STEP);
  const delays = [];
  for (let seed = 1; seed <= 16; seed++) {
    const world = aloft(seed);
    delays.push(untilThrown(world));
    assert.ok(delays.at(-1) >= BELLS.first[0] && delays.at(-1) <= BELLS.first[1] + STEP);
  }
  assert.ok(Math.max(...delays) - Math.min(...delays) > 1);
});

test('ordinary throws are75–90 seconds apart, then35–45 seconds after reaching1000 metres', () => {
  const gaps = [];
  for (const y of [BELLS.from, BEAST.from]) {
    for (let seed = 1; seed <= 8; seed++) {
      const world = aloft(seed, { y });
      assert.ok(untilThrown(world) < 20);
      for (let k = 0; k < 3; k++) {
        const bell = world.bells.state.bells[world.bells.state.warning];
        const at = bell.at;
        const range = y >= BELLS.often ? BELLS.oftener : BELLS.every;
        const drawn = world.bells.state.due - at;
        assert.ok(drawn >= range[0] && drawn <= range[1]);
        assert.ok(untilThrown(world, 95) < 95);
        const gap = world.bells.state.bells[world.bells.state.warning].at - at;
        assert.ok(gap >= range[0] - STEP && gap <= range[1] + STEP);
        gaps.push(gap);
      }
    }
  }
  assert.ok(Math.max(...gaps) - Math.min(...gaps) > 15);
});

test('prediction uses an independent physical wing and the complete sampled wind without changing the live world', () => {
  for (const controls of [{ turn: 0 }, { turn: -1, brake: true }, { turn: 0.6, bar: true }, { turn: 1, ears: true },
    { controlMode: 'brakes', leftBrake: .30, rightBrake: .08 }, { controlMode: 'brakes', leftBrake: 0, rightBrake: .30 }]) {
    const world = aloft(4, { y: BEAST.from + 30 });
    Object.assign(world.controls, controls);
    world.sky.sample = (pos, yaw, out) => Object.assign(out, { lift: 3, sink: 0, liftSide: 0.1, windX: 2, windY: 3, windZ: -1, hazardSink: 0, rough: 0.1 });
    const before = structuredClone(world.g);
    assert.ok(untilThrown(world) < 20);
    for (let n = 0; n < 2; n++) {
      const bell = world.bells.state.bells[world.bells.state.warning];
      const ahead = flyAhead(world, bell.lead);
      assert.deepEqual([bell.aimX, bell.aimY, bell.aimZ], [ahead.x, ahead.y, ahead.z]);
      assert.deepEqual(world.g, before);
      if (n === 0) assert.ok(untilThrown(world, 95) < 95);
    }
  }
});

test('a bell forecast releases stale direct input after the pilot returns to keys', () => {
  const world = aloft(4, { y: BEAST.from + 30 });
  world.sky.sample = (_pos, _yaw, out) => Object.assign(out, { lift: 3, sink: 0, liftSide: 0, windX: 0, windY: 3, windZ: 0, rough: 0 });
  Object.assign(world.controls, { controlMode: 'brakes', leftBrake: .30, rightBrake: 0 });
  assert.ok(untilThrown(world) < 20);
  delete world.controls.controlMode; delete world.controls.leftBrake; delete world.controls.rightBrake;
  Object.assign(world.controls, { turn: 1, brake: true });
  assert.ok(untilThrown(world, 95) < 95);
  const bell = world.bells.state.bells[world.bells.state.warning], ahead = flyAhead(world, bell.lead);
  assert.deepEqual([bell.aimX, bell.aimY, bell.aimZ], [ahead.x, ahead.y, ahead.z]);
});

test('the Beast follows an ordinary introduction, is warned3.2 seconds ahead and appears only once', () => {
  const world = aloft(19, { y: BEAST.from });
  assert.ok(untilThrown(world) < 20);
  assert.equal(world.bells.state.bells[world.bells.state.warning].beast, false);
  assert.ok(untilThrown(world, 95) < 95);
  const bell = world.bells.state.bells[world.bells.state.warning];
  assert.deepEqual([bell.beast, bell.kg, bell.lead, world.bells.state.beast.n], [true, BEAST.kg, BEAST.lead, 1]);
  assert.equal(sendDown(world, BELLS.close - 1).result, BELL_RESULT.close);
  assert.equal(world.bells.state.beast.result, BELL_RESULT.close);
  for (let k = 0; k < 3; k++) {
    assert.ok(untilThrown(world, 95) < 95);
    assert.equal(world.bells.state.bells[world.bells.state.warning].beast, false);
  }
});

test('ordinary and Beast trajectories reach the aim after the complete warning and fall for1.5 seconds more', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const world = aloft(seed, { y: BEAST.from });
    assert.ok(untilThrown(world) < 20);
    for (let n = 0; n < 2; n++) {
      const bell = world.bells.state.bells[world.bells.state.warning];
      const scale = bell.lead / BELLS.lead;
      assert.ok(Math.abs(bell.fromY - bell.aimY - BELLS.drop * scale) < 1e-9);
      assert.ok(Math.abs(Math.hypot(bell.fromX - bell.aimX, bell.fromZ - bell.aimZ) - BELLS.side * scale) < 1e-9);
      wait(world, bell.lead);
      assert.ok(Math.hypot(bell.x - bell.aimX, bell.y - bell.aimY, bell.z - bell.aimZ) < 1e-6);
      wait(world, BELLS.fall - STEP * 2);
      assert.notEqual(bell.phase, BELL_PHASE.idle);
      wait(world, STEP * 3);
      assert.equal(bell.phase, BELL_PHASE.idle);
      if (n === 0) assert.ok(untilThrown(world, 95) < 95);
    }
  }
});

test('a bell hit calls the same strike as a raven, once, and grants the same fold and shield', () => {
  const world = aloft(21);
  const twin = aloft(21);
  assert.ok(untilThrown(world) < 20);
  const before = world.sky.state.pilot.strikes;
  assert.equal(sendDown(world, 0).result, BELL_RESULT.hit);
  assert.equal(twin.sky.strike(-1), true);
  twin.sky.state.elapsed = world.sky.state.elapsed;
  assert.deepEqual(world.sky.state, twin.sky.state);
  assert.equal(world.sky.state.pilot.strikes, before + 1);
  wait(world, 10);
  assert.equal(world.sky.state.pilot.strikes, before + 1);
});

test('cloud hides the wing and an existing shield prevents a second strike', () => {
  for (const [cloud, shield, result] of [[CLOUD_STRIKE.cover, 0, BELL_RESULT.hidden], [CLOUD_STRIKE.cover - 0.01, 0, BELL_RESULT.hit], [0, 1, BELL_RESULT.shielded]]) {
    const world = aloft(13);
    assert.ok(untilThrown(world) < 20);
    const bell = sendDown(world, 0, () => Object.assign(world.sky.state.pilot, { cloud, shield }));
    assert.equal(bell.result, result);
    assert.equal(world.bells.state.hits, +(result === BELL_RESULT.hit));
  }
});

test('one warning and a bounded finite pool remain deterministic across seeded throws and reset', () => {
  function sequence(seed, bells = createBells()) {
    const world = aloft(seed, { y: BEAST.from });
    bells.reset(seed);
    world.bells = bells;
    const pool = [bells.state.bells, ...bells.state.bells];
    const throws = [];
    for (let n = 0; n < 12; n++) {
      assert.ok(untilThrown(world, 95) < 95);
      assert.equal(bells.state.bells.filter((bell) => bell.phase !== BELL_PHASE.idle).length, 1);
      throws.push(structuredClone(bells.state.bells[bells.state.warning]));
      for (const [key, value] of numbers(bells.state)) assert.ok(Number.isFinite(value), key);
    }
    assert.equal(bells.state.bells.length, BELL_POOL);
    assert.deepEqual([bells.state.bells, ...bells.state.bells].map((part, i) => part === pool[i]), pool.map(() => true));
    return { throws, state: structuredClone(bells.state) };
  }
  const bells = createBells();
  const first = sequence(6, bells);
  assert.deepEqual(sequence(6), first);
  sequence(9, bells);
  assert.deepEqual(sequence(6, bells), first);
  assert.notDeepEqual(sequence(5), first);
});

test('finished skies and invalid time steps leave all kettlebells unchanged', () => {
  const world = aloft(6);
  assert.ok(untilThrown(world) < 20);
  const before = structuredClone(world.bells.state);
  for (const dt of [0, -1, NaN, Infinity]) world.bells.step(dt, world);
  assert.deepEqual(world.bells.state, before);
  world.sky.finish('time');
  wait(world, 120);
  assert.deepEqual(world.bells.state, before);
});

test('the warning says whether the pilot was circling off the bar when the bell was thrown, for the hint to say what to change', () => {
  // Turning rate (rad/s) and how far the bar was on, as the bell was thrown.
  for (const [yawRate, bar, circling] of [[0.6, 0, true], [-0.6, 0, true], [0.6, 0.4, true], [BELLS.turning - 0.05, 0, false], [0.6, 1, false], [0, 0, false]]) {
    const world = aloft(9);
    Object.assign(world.g, { yawRate, bar });
    assert.ok(untilThrown(world) < 20);
    assert.equal(world.bells.state.bells[world.bells.state.warning].circling, circling, `${yawRate} rad/s, bar ${bar}`);
  }
});


test('the first minute is free of throws, and a fast climb still meets an ordinary bell before the Beast', () => {
  const world = aloft(19, { y: BEAST.from + 50 });
  world.sky.state.elapsed = 0;
  wait(world, RUN.grace - STEP);
  assert.equal(world.bells.state.thrown, 0);
  assert.equal(world.bells.state.due, -1);
  assert.ok(untilThrown(world, 20) < 20);
  const first = world.bells.state.bells[world.bells.state.warning];
  assert.equal(first.beast, false);
  assert.ok(first.at >= RUN.grace + BELLS.first[0]);
  assert.ok(untilThrown(world, 70) < 70);
  assert.equal(world.bells.state.bells[world.bells.state.warning].beast, true);
});


test('a bell that would hit a pilot holding Algiz glances off instead: nothing strikes, it is counted, and only a bell that would have hit is turned', () => {
  // The meet's blessing as the kettlebells read it, by hand.
  const warded = (world) => {
    world.meet = { state: { runes: { blessing: { rune: RUNE.algiz } } } };
    return world;
  };
  const glance = warded(aloft(23));
  const before = structuredClone(glance.sky.state);
  assert.ok(untilThrown(glance) < 20);
  const bell = sendDown(glance, 0);
  assert.equal(bell.result, BELL_RESULT.glanced);
  const { thrown, hits, close, dodged, glanced } = glance.bells.state;
  assert.deepEqual({ thrown, hits, close, dodged, glanced }, { thrown: 1, hits: 0, close: 0, dodged: 0, glanced: 1 });
  // The sky is untouched: no strike, no fold, no shield.
  before.elapsed = glance.sky.state.elapsed;
  assert.deepEqual(glance.sky.state, before);
  // A near miss is a close call as ever, a shielded wing is shielded and a hidden one hidden: none of
  // them would have hit, so none glances.
  const near = warded(aloft(23));
  assert.ok(untilThrown(near) < 20);
  assert.equal(sendDown(near, BELLS.close - 1).result, BELL_RESULT.close);
  const shielded = warded(aloft(23));
  assert.ok(untilThrown(shielded) < 20);
  assert.equal(shielded.sky.strike(), true);
  assert.equal(sendDown(shielded, 0).result, BELL_RESULT.shielded);
  const hidden = warded(aloft(23));
  assert.ok(untilThrown(hidden) < 20);
  assert.equal(sendDown(hidden, 0, (world) => { world.sky.state.pilot.cloud = CLOUD_STRIKE.cover; }).result, BELL_RESULT.hidden);
  assert.deepEqual([near.bells.state.glanced, shielded.bells.state.glanced, hidden.bells.state.glanced], [0, 0, 0]);
  // Without the blessing the very same bell hits.
  const bare = aloft(23);
  assert.ok(untilThrown(bare) < 20);
  assert.equal(sendDown(bare, 0).result, BELL_RESULT.hit);
});


test('a kettlebell that misses by under 9 m is a close call, a wider one is a dodge, and neither touches the sky', () => {
  // Sent straight down beside a parked glider, so the nearest it comes across is the offset itself.
  for (const [offset, result] of [[0, 'hit'], [CLOUD_STRIKE.radius - 0.05, 'hit'], [CLOUD_STRIKE.radius + 0.05, 'close'], [BELLS.close - 0.05, 'close'], [BELLS.close + 0.05, 'dodged'], [30, 'dodged']]) {
    const world = aloft(11);
    const before = structuredClone(world.sky.state);
    assert.ok(untilThrown(world) < 20);
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
    assert.ok(untilThrown(world) < 20);
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
    ['a front tuck', (world) => { world.g.tuck = 0.5; }, (world) => { world.g.tuck = 0; }],
    ['a gust front 5.9 s off', (world) => { world.sky.state.pilot.gustIn = BELLS.gust - 0.1; }, (world) => { world.sky.state.pilot.gustIn = BELLS.gust; }],
    ['the rim 14 m away', nearRim(BELLS.edge - 1), nearRim(BELLS.edge + 1)],
  ];
  for (const [what, on, off] of blocks) {
    const world = aloft(5);
    // Long past the time the first throw was due.
    wait(world, 20, on);
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
  assert.ok(untilThrown(second) < 20);
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
    const retries = refusals(world, 20);
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
  settleFlight(rim.g);
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
    assert.equal(refusals(clear, 16).length, 0);
    assert.equal(clear.bells.state.thrown, 1);
  }
});
