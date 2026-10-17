import test from 'node:test';
import assert from 'node:assert/strict';
import { BLESSING, GATE, GATES, RUNE, RUNE_NAME, RUNE_SIGN, createRunes, meetDraw } from './meet-runes.js';
import { createMeet } from './meet-state.js';
import { createBells } from './bells.js';
import { RUN, createRunWorld, startRun, stepRun } from './run-step.js';
import { TST, createReferencePilot } from './pilots.js';
import { settleFlight } from './flight.js';
import { CLOUD_GATE, CLOUD_ZONE, createCloudbaseRun } from './cloudbase-state.js';

const STEP = 1 / 60;
const TAU = Math.PI * 2;
const firstSkies = (count) => Array.from({ length: count }, (_, i) => i + 1);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// A run with the meet and the kettlebells on `seed`, flown by the reference pilot with `options`
// until the fog, with `watch(world)` seeing every step.
function flown(seed, options = {}, watch = () => {}) {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells() }), seed);
  const pilot = createReferencePilot(options);
  const intent = { turn: 0, brake: false, bar: false };
  let reason = null;
  while (!reason) {
    pilot.decide(world, intent);
    reason = stepRun(world, intent, STEP);
    watch(world);
  }
  return world;
}

// A run just started on `seed` with the meet, the 500 m stones raised by hand round thermal 1 with
// the glider parked in its middle, 400 m up: only the meet is stepped from here, with the glider
// put where a test wants it.
function raised(seed = 3) {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet() }), seed);
  const { sky, g, meet } = world;
  const thermal = sky.state.thermals[1];
  sky.state.pilot.thermal = 1;
  Object.assign(g.pos, { x: thermal.x, y: GATES.lines[0] - GATES.ahead, z: thermal.z });
  sky.state.peak = g.pos.y;
  meet.step(STEP, world);
  const runes = meet.state.runes;
  assert.equal(runes.line, GATES.lines[0]);
  // Puts the glider at `to` without flying there (no path is crossed), and moves it to `to` in one
  // step of the meet, from wherever it was.
  const put = (to) => {
    Object.assign(g.pos, to);
    Object.assign(runes.was, to);
  };
  const fly = (to) => {
    Object.assign(g.pos, to);
    sky.state.elapsed += STEP;
    sky.state.peak = Math.max(sky.state.peak, g.pos.y);
    meet.step(STEP, world);
  };
  // A point in stone `i`'s own frame: `across` metres through its opening along its facing, `aside`
  // along its width and `up` over its middle.
  const at = (i, across, aside = 0, up = 0) => {
    const stone = runes.gates[i];
    return { x: stone.x + stone.nx * across - stone.nz * aside, y: stone.y + up, z: stone.z + stone.nz * across + stone.nx * aside };
  };
  return { world, runes, put, fly, at, thermal };
}

test('waiting gates drift with their thermal generation and never jump to a reborn core', () => {
  const { world, runes, thermal } = raised();
  const before = runes.gates.map(({ x, z }) => ({ x, z }));
  thermal.x += 7;
  thermal.z -= 3;
  world.meet.step(STEP, world);
  for (let i = 0; i < before.length; i++) {
    assert.equal(runes.gates[i].x, before[i].x + 7);
    assert.equal(runes.gates[i].z, before[i].z - 3);
  }
  const held = runes.gates.map(({ x, z }) => ({ x, z }));
  thermal.generation = (thermal.generation ?? 0) + 1;
  thermal.x += 80;
  world.meet.step(STEP, world);
  assert.deepEqual(runes.gates.map(({ x, z }) => ({ x, z })), held);
});

test('gates rise thirty metres before each milestone and face the current thermal core', () => {
  for (const seed of firstSkies(6)) {
    const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet() }), seed);
    const { sky, g, meet } = world;
    sky.state.pilot.thermal = 1;
    const core = sky.state.thermals[1];
    for (let k = 0; k < GATES.lines.length; k++) {
      const line = GATES.lines[k];
      Object.assign(g.pos, { x: core.x, y: line - GATES.ahead, z: core.z });
      sky.state.peak = line - GATES.ahead - 0.01;
      meet.step(STEP, world);
      assert.equal(meet.state.runes.raised, k);
      sky.state.peak += 0.01;
      meet.step(STEP, world);
      const runes = meet.state.runes;
      assert.equal(runes.raised, k + 1);
      assert.equal(runes.line, line);
      for (const gate of runes.gates) {
        assert.equal(gate.y, line);
        assert.equal(gate.state, GATE.waiting);
        assert.ok(Math.abs(flat(gate, core) - GATES.ring) < 1e-9);
        assert.ok(Math.abs(Math.hypot(gate.nx, gate.nz) - 1) < 1e-12);
      }
    }
  }
});

test('rune offerings are seeded independently of flying and cover every blessing and ordering', () => {
  const left = new Set(), orders = new Set();
  for (const seed of firstSkies(64)) {
    const one = raised(seed), other = raised(seed);
    const offered = one.runes.gates.map((gate) => gate.rune);
    assert.deepEqual(offered, other.runes.gates.map((gate) => gate.rune));
    assert.equal(new Set(offered).size, 3);
    left.add([1, 2, 3, 4].find((rune) => !offered.includes(rune)));
    orders.add(offered.join(''));
  }
  assert.equal(left.size, 4);
  assert.ok(orders.size >= 12);
  assert.deepEqual([RUNE_SIGN, RUNE_NAME].map((names) => names.length), [5, 5]);
});

test('flying through a stone\'s opening, either way, takes its blessing and crumbles the other two; beside it, over it, under it or turning back short of it takes nothing', () => {
  const { wide, tall } = GATES;
  // From 2 m before the stone's plane to 2 m past it, at `aside` and `up` in its frame.
  const through = (aside, up, back = false) => {
    const run = raised();
    const { put, fly, at } = run;
    put(at(0, back ? 2 : -2, aside, up));
    fly(at(0, back ? -2 : 2, aside, up));
    return run;
  };
  for (const [aside, up, back] of [[0, 0, false], [0, 0, true], [wide - 0.1, tall - 0.1, false], [-(wide - 0.1), -(tall - 0.1), true]]) {
    const { runes, world } = through(aside, up, back);
    const [taken, ...rest] = runes.gates;
    assert.deepEqual([taken.state, taken.ended], [GATE.taken, world.sky.state.elapsed], `${aside} m aside, ${up} m up`);
    assert.ok(rest.every((stone) => stone.state === GATE.crumbled && stone.ended === world.sky.state.elapsed));
    assert.deepEqual(runes.blessing, { rune: taken.rune, since: world.sky.state.elapsed, line: GATES.lines[0] });
    assert.deepEqual([runes.taken, runes.runes], [1, 1 << (taken.rune - 1)]);
  }
  for (const [aside, up] of [[wide + 0.1, 0], [-(wide + 0.1), 0], [0, tall + 0.1], [0, -(tall + 0.1)]]) {
    const { runes } = through(aside, up);
    assert.ok(runes.gates.every((stone) => stone.state === GATE.waiting), `${aside} m aside, ${up} m up`);
    assert.deepEqual([runes.blessing.rune, runes.taken], [RUNE.none, 0]);
  }
  // Up to just short of its plane and back the way it came: not through it.
  const short = raised();
  short.put(short.at(0, -2));
  short.fly(short.at(0, -0.1));
  short.fly(short.at(0, -0.1, 3));
  short.fly(short.at(0, -2));
  assert.equal(short.runes.taken, 0);
});

test('stones still waiting crumble once the peak is 30 m over them, or 30 s after they were raised, and as the run ends; a blessing taken is kept', () => {
  // Climbing in the middle of the lift, never through a stone.
  const climb = raised();
  const middle = (y) => ({ x: climb.thermal.x, y, z: climb.thermal.z });
  climb.fly(middle(GATES.lines[0] + GATES.past - 0.5));
  assert.ok(climb.runes.gates.every((stone) => stone.state === GATE.waiting));
  climb.fly(middle(GATES.lines[0] + GATES.past));
  assert.ok(climb.runes.gates.every((stone) => stone.state === GATE.crumbled));
  // Waiting at the middle under the line.
  const wait = raised();
  const { at } = wait.runes.gates[0];
  const low = { x: wait.thermal.x, y: 450, z: wait.thermal.z };
  wait.world.sky.state.elapsed = at + GATES.wait - STEP;
  wait.fly(low);
  assert.ok(wait.runes.gates.every((stone) => stone.state === GATE.waiting));
  wait.fly(low);
  wait.fly(low);
  assert.ok(wait.runes.gates.every((stone) => stone.state === GATE.crumbled));
  // The run ends with them waiting: nothing is left to fly through, and nothing is blessed.
  const ending = raised();
  ending.world.meet.finish('fog', ending.world);
  assert.ok(ending.runes.gates.every((stone) => stone.state === GATE.crumbled));
  assert.equal(ending.runes.blessing.rune, RUNE.none);
  // One taken: the run's end leaves the blessing as it was.
  const kept = raised();
  kept.put(kept.at(1, -2));
  kept.fly(kept.at(1, 2));
  const blessing = { ...kept.runes.blessing };
  kept.world.meet.finish('fog', kept.world);
  assert.deepEqual(kept.runes.blessing, blessing);
  assert.notEqual(blessing.rune, RUNE.none);
});

test('the 1,000 m stones are raised around the lift as the pilot nears 1,000 m, and the blessing taken there replaces the 500 m one', () => {
  const run = raised(5);
  const { runes, put, fly, at, world, thermal } = run;
  put(at(2, -2));
  fly(at(2, 2));
  const first = runes.blessing.rune;
  // On up to 900 m in the same lift, and through the new set's first stone.
  put({ x: thermal.x, y: 800, z: thermal.z });
  fly({ x: thermal.x, y: GATES.lines[1] - GATES.ahead, z: thermal.z });
  assert.deepEqual([runes.line, runes.raised], [GATES.lines[1], 2]);
  assert.ok(runes.gates.every((stone) => stone.state === GATE.waiting && stone.y === GATES.lines[1]));
  put(at(0, -2));
  fly(at(0, 2));
  assert.deepEqual(runes.blessing, { rune: runes.gates[0].rune, since: world.sky.state.elapsed, line: GATES.lines[1] });
  assert.equal(runes.taken, 2);
  assert.equal(runes.runes, (1 << (first - 1)) | (1 << (runes.gates[0].rune - 1)));
  // There are no more sets to raise.
  fly({ ...thermal, y: 2000 });
  assert.equal(runes.raised, GATES.lines.length);
});

test('Algiz is spent by the kettlebell it turns aside: the meet lets it go on the step the bell glances off, and the next bell hits', () => {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun({ hazards: false, wind: false }), meet: createMeet(), bells: createBells() }), 23);
  const { sky, g, meet, bells } = world;
  // Parked at 700 m in the middle of a calm sky, past both sets of stones, holding Algiz.
  Object.assign(g.pos, { x: CLOUD_ZONE.x, y: 700, z: CLOUD_ZONE.z });
  sky.state.peak = 700;
  sky.state.elapsed = RUN.grace + 1;
  settleFlight(g);
  Object.assign(meet.state.runes, { raised: 1 });
  Object.assign(meet.state.runes.blessing, { rune: RUNE.algiz, since: 0, line: 500 });
  // The meet and the kettlebells stepped with the sky's clock alone moving, each bell sent straight
  // down onto the glider once thrown.
  const hold = () => {
    const settled = bells.state.glanced + bells.state.hits;
    for (let i = 0; i < 90 * 60; i++) {
      sky.state.elapsed += STEP;
      bells.step(STEP, world);
      meet.step(STEP, world);
      const { warning, bells: pool } = bells.state;
      if (warning >= 0) {
        Object.assign(pool[warning], { aimX: g.pos.x, aimY: g.pos.y, aimZ: g.pos.z, fromX: g.pos.x, fromY: g.pos.y + 96, fromZ: g.pos.z });
      }
      if (bells.state.glanced + bells.state.hits > settled && pool.every((bell) => bell.phase === 0)) return;
    }
  };
  hold();
  assert.deepEqual([bells.state.glanced, bells.state.hits, sky.state.pilot.strikes], [1, 0, 0]);
  assert.equal(meet.state.runes.blessing.rune, RUNE.none);
  assert.equal(meet.state.runes.spent, 1);
  hold();
  assert.deepEqual([bells.state.glanced, bells.state.hits, sky.state.pilot.strikes], [1, 1, 1]);
});

test('the meet\'s draws are its own: the same seed and number always give the same draw, and neither the sky\'s nor the kettlebells\' stream gives it', () => {
  assert.equal(meetDraw(7, 3), meetDraw(7, 3));
  const draws = Array.from({ length: 2000 }, (_, n) => meetDraw(12345, n));
  assert.ok(draws.every((value) => value >= 0 && value < 1));
  // Spread evenly enough over 0 to 1: every tenth has between 7% and 13% of them.
  for (let tenth = 0; tenth < 10; tenth++) {
    const share = draws.filter((value) => Math.floor(value * 10) === tenth).length / draws.length;
    assert.ok(share > 0.07 && share < 0.13, `${share} in tenth ${tenth}`);
  }
  // The sky's pick() and the bells' draw() are the same mixer with other multipliers.
  const mixer = (multiplier) => (seed, n) => {
    let t = (seed ^ Math.imul(n + 1, multiplier)) | 0;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (const other of [mixer(0x9e3779b1), mixer(0x85ebca6b)]) {
    assert.ok(draws.filter((value, n) => value === other(12345, n)).length === 0);
  }
  // Fehu's reach is twice a plate's, and Tiwaz doubles.
  assert.deepEqual([BLESSING.reach, BLESSING.double], [12, 2]);
  assert.equal(createRunes().state.was.x, CLOUD_GATE.x);
});
