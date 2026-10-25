import type { RunWorld } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BAIT, MEET, MEET_POOL, PLATE_KIND, SCATTER, THUNDER, TRAIL, WIND, createMeet } from './meet-state.ts';
import { BLESSING, RUNE } from './meet-runes.ts';
import { BELL_RESULT, createBells } from './bells.ts';
import { createRunWorld, startRun, stepRun } from './run-step.ts';
import { TST, createReferencePilot } from './pilots.ts';
import { CLOUD_GUST, CLOUD_STRIKE, CLOUD_ZONE, createCloudbaseRun } from './cloudbase-state.ts';
import { wingFolded } from '../flight/flight.ts';

// The plates off the trail: riding the gust fronts, hanging under storm clouds and rising on the
// fog, and a strike's own plates sprayed off the bar, with what the blessings do to loading them.
// The trail itself, the reps, the lines and the lights are pinned in meet-state.test.js.

const STEP = 1 / 60;
// Steps a struck wing may stay folded before these tests give up on it: the scripted fold's own
// time, which a glider's half refilling by itself (wing-folds.js) comes well inside.
const FOLD = Math.ceil(CLOUD_STRIKE.collapse / STEP);
const firstSkies = (count: number) => Array.from({ length: count }, (_, i) => i + 1);
const flat = (a: { x: number; z: number; }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const reach = (a: { x: number; y: number; z: number; }, b: { x: number; y: number; z: number; }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const Z = CLOUD_ZONE;
const of = (kind: number) => (plate: ReturnType<typeof createMeet>['state']['loose'][number]) => plate.live && plate.kind === kind;

// Kettlebells that throw nothing, keeping what the meet reads of real ones.
const quietBells = () => ({ state: createBells().state, reset() {}, step() {} });

// A run with the meet on `seed` (and real kettlebells unless told otherwise), flown by the
// reference pilot with `options` until the fog, with `watch(world)` seeing every step.
function flown(seed: number, options: Parameters<typeof createReferencePilot>[0] = {}, watch: (world: RunWorld) => void = () => {}, { bells = true } = {}) {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: bells ? createBells() : null }), seed);
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

// A calm sky (no hazards, no wind) on `seed` with the meet and quiet kettlebells, the glider parked
// at `y` in the middle of the zone with the peak there and the lines under it already judged, and
// the run stepped as a whole: the sky, the wing and the meet, holding `intent`.
function calm(seed = 4, y = 700) {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun({ hazards: false, wind: false }), meet: createMeet(), bells: quietBells() }), seed);
  Object.assign(world.g.pos, { x: Z.x, y, z: Z.z });
  world.sky.state.peak = y;
  world.meet!.step(STEP, world);
  const fly = (seconds: number, intent = { turn: 0.4, brake: false, bar: false }) => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) stepRun(world, intent, STEP);
  };
  return Object.assign(world, { fly });
}

// Advance the meet with an explicit weather observation, keeping hazard placement independent
// of whether a reference pilot happened to climb above the late-game threshold in one seed.
function tick(world: RunWorld, seconds = STEP) {
  world.sky.state.elapsed += seconds;
  world.meet!.step(seconds, world);
}
function frontWorld(seed = 4) {
  const world = calm(seed);
  const sky = world.sky.state;
  Object.assign(sky.pilot, { gustSlot: 0, gustAhead: 30, gustIn: 3, thermal: -1 });
  Object.assign(sky.gusts[0], { ux: 1, uz: 0, at: -30, strength: 1, born: 12 });
  tick(world);
  return world;
}
function thunderWorld(seed = 4) {
  const world = calm(seed);
  const sky = world.sky.state, { pos } = world.g;
  for (const cloud of sky.clouds) cloud.fade = 0;
  Object.assign(sky.clouds[0], { x: pos.x + 20, y: pos.y + 60, z: pos.z, rx: 120, ry: 30, rz: 80, cos: 1, sin: 0, fade: 1 });
  Object.assign(sky.pilot, { cloud: 0, headroom: 30 });
  tick(world);
  return world;
}

test('above700m a due gust front carries three plates on its line, once per band, on either seeded side', () => {
  const sides = new Set();
  for (let seed = 1; seed <= 24; seed++) {
    const world = frontWorld(seed), state = world.meet!.state;
    const band = world.sky.state.gusts[0];
    const plates = state.loose.filter(of(PLATE_KIND.wind));
    assert.equal(state.fronts, 1);
    assert.equal(state.carried[0], band.born);
    assert.equal(plates.length, WIND.count);
    const offsets = plates.map((plate) => plate.ox).sort((a: number, b: number) => a - b);
    const way = offsets[offsets.length - 1] > WIND.aside ? 1 : -1;
    sides.add(way);
    assert.deepEqual(offsets, way > 0 ? [-WIND.aside, WIND.aside, WIND.aside + WIND.gap] : [-WIND.aside - WIND.gap, -WIND.aside, WIND.aside]);
    for (const plate of plates) {
      assert.deepEqual([plate.kg, plate.slot, plate.y, plate.still], [WIND.kg, 0, world.g.pos.y, false]);
      assert.ok(Math.abs((plate.x - Z.x) * band.ux + (plate.z - Z.z) * band.uz - band.at) < 1e-9);
    }
    tick(world);
    assert.equal(state.fronts, 1);
    band.born++;
    tick(world);
    assert.equal(state.fronts, 2);
    assert.equal(state.loose.filter(of(PLATE_KIND.wind)).length, WIND.count, 'the retired band is cleared before replacement');
  }
  assert.equal(sides.size, 2);
});

test('front plates advect at the band speed, follow pilot height until crossing and expire20m behind', () => {
  const world = frontWorld(), band = world.sky.state.gusts[0];
  const plates = world.meet!.state.loose.filter(of(PLATE_KIND.wind));
  const before = plates.map((plate) => ({ x: plate.x, z: plate.z }));
  band.at += CLOUD_GUST.speed * STEP;
  world.g.pos.y += 3;
  tick(world);
  for (let i = 0; i < plates.length; i++) {
    assert.ok(Math.abs(flat(plates[i], before[i]) - CLOUD_GUST.speed * STEP) < 1e-9);
    assert.equal(plates[i].y, world.g.pos.y);
    assert.equal(plates[i].still, false);
  }
  band.at = 1;
  tick(world);
  assert.ok(plates.every((plate) => plate.still));
  const heights = plates.map((plate) => plate.y);
  world.g.pos.y += 10;
  band.at += 1;
  tick(world);
  assert.deepEqual(plates.map((plate) => plate.y), heights);
  band.at = WIND.past + 0.01;
  tick(world);
  assert.ok(plates.every((plate) => !plate.live));
});

test('near a storm cloud a plate hangs3m beneath its base, drifts with it, and appears only once per cloud', () => {
  const world = thunderWorld(), sky = world.sky.state, state = world.meet!.state;
  const plate = state.loose.find(of(PLATE_KIND.thunder));
  assert.ok(plate);
  assert.ok(flat(plate, world.g.pos) <= THUNDER.inward + 1e-9);
  assert.ok(plate.y > world.g.pos.y);
  assert.equal(plate.kg, THUNDER.kg);
  assert.equal(state.thundered[0], true);
  const cloud = sky.clouds[0];
  cloud.x += 2; cloud.z += 1;
  tick(world);
  assert.deepEqual([plate.x, plate.z], [cloud.x + plate.ox, cloud.z + plate.oz]);
  const lx = (plate.ox * cloud.cos - plate.oz * cloud.sin) / (cloud.rx * cloud.fade);
  const lz = (plate.ox * cloud.sin + plate.oz * cloud.cos) / (cloud.rz * cloud.fade);
  assert.ok(Math.abs(plate.y - (cloud.y - cloud.ry * cloud.fade * Math.sqrt(1 - lx * lx - lz * lz) - THUNDER.below)) < 1e-9);
  tick(world, THUNDER.life + STEP);
  assert.equal(plate.live, false);
  tick(world);
  assert.ok(!state.loose.some(of(PLATE_KIND.thunder)));
  const faded = thunderWorld();
  faded.sky.state.clouds[0].fade = 0;
  tick(faded);
  assert.ok(!faded.meet!.state.loose.some(of(PLATE_KIND.thunder)));
});

test('after the300s horn bait rides35m above nearby fog, waits at wing height and returns3s after loading', () => {
  const world = calm(), { meet, sky, g } = world;
  sky.state.elapsed = MEET.horn - 1;
  sky.state.fogHeight = g.pos.y - BAIT.near;
  tick(world);
  assert.ok(!meet!.state.loose.some(of(PLATE_KIND.bait)));
  sky.state.elapsed = MEET.horn;
  tick(world);
  tick(world);
  const bait = meet!.state.loose.find(of(PLATE_KIND.bait));
  assert.ok(bait);
  assert.equal(bait.y, sky.state.fogHeight + BAIT.above);
  assert.ok(Math.abs(flat(bait, g.pos) - BAIT.aside) < 1e-9);
  sky.state.fogHeight = g.pos.y - 10;
  tick(world);
  assert.equal(bait.y, g.pos.y);
  Object.assign(g.pos, { x: bait.x, z: bait.z });
  tick(world);
  const taken = sky.state.elapsed;
  assert.deepEqual([meet!.state.bait, meet!.state.bar, meet!.state.baitDue, meet!.state.baits], [1, BAIT.kg, taken + BAIT.again, 1]);
  assert.ok(!meet!.state.loose.some(of(PLATE_KIND.bait)));
  tick(world, BAIT.again - STEP);
  assert.ok(!meet!.state.loose.some(of(PLATE_KIND.bait)));
  tick(world, 2 * STEP);
  assert.equal(meet!.state.baits, 2);
});

test('a strike past 700 m splits the bar into standard plates, largest first and eight at most, holds them while the wing is folded and sprays them round the pilot as it reopens, to sink away under it for 5.5 s', () => {
  for (const [bar, plates] of [[152.5, [25, 25, 25, 25, 25, 25, 2.5]], [62.5, [25, 25, 10, 2.5]], [47.5, [25, 20, 2.5]], [300, [25, 25, 25, 25, 25, 25, 25, 25]]] as [number, number[]][]) {
    const world = calm();
    const { meet, sky, g } = world;
    meet!.state.bar = bar;
    world.fly(STEP);
    assert.equal(sky.strike(), true);
    world.fly(STEP);
    const held = meet!.state.loose.slice(0, SCATTER.most);
    assert.deepEqual(held.filter((plate) => plate.held).map((plate) => plate.kg), plates, `${bar} kg`);
    assert.ok(held.every((plate) => !plate.live && (plate.held ? plate.kind === PLATE_KIND.scatter : plate.kind === PLATE_KIND.none)));
    assert.deepEqual([meet!.state.bar, meet!.state.lost, meet!.state.spray.held, meet!.state.scattered], [0, bar - plates.reduce((a, b) => a + b, 0), true, 0]);
    // Held while the wing is folded, sprayed the step it reopens. A loop that waited on the fold
    // alone would never end if the wing never reopened, so it waits the fold's time and no longer.
    for (let i = 0; i <= FOLD && (sky.state.pilot.collapse > 0 || wingFolded(g)); i++) {
      assert.ok(held.every((plate) => !plate.live));
      world.fly(STEP);
    }
    assert.ok(sky.state.pilot.collapse === 0 && !wingFolded(g), 'the wing reopened');
    const sprayed = held.filter((plate) => plate.live);
    assert.equal(sprayed.length, plates.length);
    assert.deepEqual([meet!.state.scattered, meet!.state.spray.held, meet!.state.spray.at], [plates.length, false, sky.state.elapsed]);
    // `from` round the pilot, and already a step on its way out.
    const bearings = sprayed.map((plate) => {
      assert.ok(Math.abs(flat(plate, g.pos) - SCATTER.from - SCATTER.kick * STEP) < 1e-6 && plate.y === g.pos.y);
      return Math.atan2(plate.x - g.pos.x, -(plate.z - g.pos.z));
    }).sort((a: number, b: number) => a - b);
    // Evenly round the pilot.
    for (let i = 1; i < bearings.length; i++) assert.ok(Math.abs(bearings[i] - bearings[i - 1] - (2 * Math.PI) / bearings.length) < 1e-6);
    // Out a metre more in the still air and sinking half a metre a second under the pilot, then gone.
    const middle = { x: g.pos.x, z: g.pos.z };
    const out = sprayed.map((plate) => flat(plate, middle));
    world.fly(SCATTER.life - STEP, { turn: 0, brake: false, bar: false });
    for (const [i, plate] of sprayed.entries()) {
      if (!plate.live) continue;
      const moved = flat(plate, middle) - out[i];
      assert.ok(moved > 0.9 * SCATTER.kick / SCATTER.drag && moved < SCATTER.kick / SCATTER.drag + 1e-6, `${moved} m further out`);
      assert.ok(Math.abs(plate.y - (g.pos.y - SCATTER.sink * (sky.state.elapsed - plate.born))) < 1e-9);
    }
    world.fly(2 * STEP);
    assert.ok(held.every((plate) => !plate.live));
  }
});


test('a scattered plate flown through within reach goes back on the bar; below 700 m a strike leaves the bar alone, and under Tiwaz it loses the whole bar', () => {
  const world = calm();
  const { meet, sky, g } = world;
  meet!.state.bar = 60;
  world.fly(STEP);
  sky.strike();
  // Flown on until the wing has reopened and the plates have sprayed, which is within the fold's own
  // time: a few steps past it, a meet that never sprays fails here rather than flying on for ever.
  world.fly(STEP);
  for (let i = 0; i <= FOLD + 2 && (sky.state.pilot.collapse > 0 || wingFolded(g) || meet!.state.spray.held); i++) world.fly(STEP);
  assert.deepEqual([sky.state.pilot.collapse, meet!.state.spray.held], [0, false], 'sprayed as the wing reopened');
  const [first, second] = meet!.state.loose.filter(of(PLATE_KIND.scatter));
  assert.deepEqual([first.kg, second.kg, meet!.state.bar], [25, 25, 0]);
  // They hang at the pilot's own height, a little under it, so reach is level: put by hand on one,
  // and then just out of reach of the other, outward from where they sprayed.
  const sprayedAt = { x: g.pos.x, z: g.pos.z };
  Object.assign(g.pos, { x: first.x, z: first.z });
  meet!.step(STEP, world);
  assert.deepEqual([first.live, meet!.state.bar, meet!.state.recovered, meet!.state.plates], [false, 25, 1, 1]);
  const out = flat(second, sprayedAt);
  const away = (out + TRAIL.reach + 0.2) / out;
  Object.assign(g.pos, { x: sprayedAt.x + (second.x - sprayedAt.x) * away, z: sprayedAt.z + (second.z - sprayedAt.z) * away });
  meet!.step(STEP, world);
  assert.deepEqual([second.live, meet!.state.bar, meet!.state.recovered], [true, 25, 1]);
  assert.ok(reach(second, g.pos) > TRAIL.reach);
  // Under 700 m the bar keeps what it had, as before version 3.
  const low = calm(4, 520);
  low.meet!.state.bar = 60;
  low.fly(STEP);
  low.sky.strike();
  low.fly(3);
  assert.deepEqual([low.meet!.state.bar, low.meet!.state.scattered, low.meet!.state.lost], [60, 0, 0]);
  assert.ok(!low.meet!.state.loose.some((plate) => plate.live || plate.held));
  // Holding Tiwaz the whole bar goes, at any height, and nothing is sprayed.
  for (const y of [520, 800]) {
    const tiwaz = calm(4, y);
    tiwaz.meet!.state.runes.blessing.rune = RUNE.tiwaz;
    tiwaz.meet!.state.bar = 90;
    tiwaz.fly(STEP);
    tiwaz.sky.strike();
    tiwaz.fly(3);
    assert.deepEqual([tiwaz.meet!.state.bar, tiwaz.meet!.state.lost, tiwaz.meet!.state.scattered], [0, 90, 0], `${y} m`);
  }
});


test('under Fehu every plate loads from within 12 m, and under Tiwaz everything loaded counts twice', () => {
  // A trail plate 9 m off and a sprayed one 11 m off (at the pilot's height, standing still in the
  // air): out of reach without Fehu, within it with.
  for (const rune of [RUNE.none, RUNE.fehu]) {
    const world = calm();
    const { meet, sky, g } = world;
    meet!.state.runes.blessing.rune = rune;
    Object.assign(meet!.state.trail, { live: true, born: sky.state.elapsed, boarded: sky.state.elapsed });
    Object.assign(meet!.state.trail.plates[0], { x: g.pos.x + 9, y: g.pos.y, z: g.pos.z, kg: 20, live: true });
    Object.assign(meet!.state.loose[0], { kind: PLATE_KIND.scatter, kg: 25, live: true, x: g.pos.x, y: g.pos.y, z: g.pos.z - 11, born: sky.state.elapsed });
    meet!.step(STEP, world);
    assert.equal(meet!.state.bar, rune === RUNE.fehu ? 20 + 25 : 0, `rune ${rune}`);
    assert.ok(BLESSING.reach > 11 && TRAIL.reach < 9);
  }
  // Tiwaz: a close call, a plate and a rep all count twice.
  const world = calm();
  const { meet, g, bells } = world;
  meet!.state.runes.blessing.rune = RUNE.tiwaz;
  bells!.state.close = 1;
  Object.assign(meet!.state.trail, { live: true, born: 0, boarded: 0 });
  Object.assign(meet!.state.trail.plates[0], { x: g.pos.x, y: g.pos.y, z: g.pos.z, kg: 15, live: true });
  meet!.step(STEP, world);
  assert.equal(meet!.state.bar, 2 * (MEET.close + 15));
  assert.equal(meet!.state.bar % 2.5, 0);
});


test('the Beast\'s close call loads 20 kg, once, and every other close call 10 kg', () => {
  const world = calm();
  const { meet, bells } = world;
  bells!.state.close = 1;
  meet!.step(STEP, world);
  assert.equal(meet!.state.bar, MEET.close);
  bells!.state.close = 2;
  bells!.state.beast.result = BELL_RESULT.close;
  meet!.step(STEP, world);
  assert.deepEqual([meet!.state.bar, meet!.state.beastClose], [MEET.close + MEET.beast, true]);
  bells!.state.close = 3;
  meet!.step(STEP, world);
  assert.equal(meet!.state.bar, 2 * MEET.close + MEET.beast);
  assert.deepEqual([MEET.beast, MEET.close], [20, 10]);
});


test('nothing new happens below 700 m but the 500 m gates: no plate off the trail, no strike costs the bar, and no new counter moves, whoever flies', () => {
  let checked = 0;
  for (const seed of firstSkies(8)) {
    for (const options of [TST, { ...TST, collect: true }, { brake: 'eased' }, { ...TST, gates: true }]) {
      let bar = 0;
      let strikes = 0;
      let count = 0;
      flown(seed, options, (world) => {
        const { state } = world.meet!;
        const sky = world.sky.state;
        if (sky.peak >= MEET.iron) return;
        checked += 1;
        assert.ok(state.loose.every((plate) => !plate.live && !plate.held), `seed ${seed}`);
        assert.deepEqual([state.fronts, state.wind, state.thunder, state.bait, state.scattered, state.recovered], [0, 0, 0, 0, 0, 0]);
        assert.equal(world.bells!.state.thrown, 0);
        // A strike leaves the bar as it was (a line judged the same step empties it, as ever),
        // unless Tiwaz, from the 500 m gates, was taken.
        if (sky.pilot.strikes > strikes && state.count === count && state.runes.blessing.rune !== RUNE.tiwaz) {
          assert.ok(state.bar >= bar, `seed ${seed}: the bar went from ${bar} to ${state.bar}`);
        }
        strikes = sky.pilot.strikes;
        count = state.count;
        bar = state.bar;
        // The stones are the only thing new, raised at 470 m for the 500 m line.
        if (state.runes.raised > 0) assert.ok(sky.peak >= 470 && state.runes.line === 500);
      });
    }
  }
  assert.ok(checked > 32 * 40 * 60 * 0.4, `${checked} steps under 700 m`);
});


test('dedicated loose-plate slots stay bounded across fronts, storm, fog and scatter', () => {
  const worlds = [frontWorld(), thunderWorld(), calm(), calm()];
  const fog = worlds[2];
  fog.sky.state.elapsed = MEET.horn + 1;
  fog.meet!.state.horn = true;
  fog.sky.state.fogHeight = fog.g.pos.y - 100;
  tick(fog);
  const struck = worlds[3];
  struck.meet!.state.bar = 60;
  struck.sky.state.pilot.strikes++;
  struck.sky.state.pilot.collapse = 1;
  tick(struck);
  const kinds = new Set();
  for (const world of worlds) {
    const { loose, trail } = world.meet!.state;
    assert.equal(loose.length, MEET_POOL.loose);
    assert.ok(trail.plates.every((plate: { kind: number; }) => plate.kind === PLATE_KIND.trail));
    loose.forEach((plate: { kind: unknown; }, i: number) => {
      if (plate.kind === PLATE_KIND.none) return;
      kinds.add(plate.kind);
      const expected = i < SCATTER.most ? PLATE_KIND.scatter : i < SCATTER.most + 2 * WIND.count ? PLATE_KIND.wind : i === MEET_POOL.loose - 2 ? PLATE_KIND.thunder : PLATE_KIND.bait;
      assert.equal(plate.kind, expected, `slot ${i}`);
    });
  }
  assert.deepEqual([...kinds].sort(), [PLATE_KIND.wind, PLATE_KIND.thunder, PLATE_KIND.bait, PLATE_KIND.scatter].sort());
});
