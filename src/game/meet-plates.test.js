import test from 'node:test';
import assert from 'node:assert/strict';
import { BAIT, MEET, MEET_POOL, PLATE_KIND, SCATTER, THUNDER, TRAIL, WIND, createMeet } from './meet-state.js';
import { BLESSING, RUNE } from './meet-runes.js';
import { BELL_RESULT, createBells } from './bells.js';
import { createRunWorld, startRun, stepRun } from './run-step.js';
import { TST, createReferencePilot } from './pilots.js';
import { CLOUD_GUST, CLOUD_STRIKE, CLOUD_ZONE, cloudFogSpeed, createCloudbaseRun } from './cloudbase-state.js';

// The plates off the trail: riding the gust fronts, hanging under storm clouds and rising on the
// fog, and a strike's own plates sprayed off the bar, with what the blessings do to loading them.
// The trail itself, the reps, the lines and the lights are pinned in meet-state.test.js.

const STEP = 1 / 60;
// Steps a struck wing stays folded.
const FOLD = Math.ceil(CLOUD_STRIKE.collapse / STEP);
const firstSkies = (count) => Array.from({ length: count }, (_, i) => i + 1);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const reach = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const Z = CLOUD_ZONE;
const of = (kind) => (plate) => plate.live && plate.kind === kind;

// Kettlebells that throw nothing, keeping what the meet reads of real ones.
const quietBells = () => ({ state: { close: 0, glanced: 0, beast: { n: -1, result: BELL_RESULT.pending } }, reset() {}, step() {} });

// A run with the meet on `seed` (and real kettlebells unless told otherwise), flown by the
// reference pilot with `options` until the fog, with `watch(world)` seeing every step.
function flown(seed, options = {}, watch = () => {}, { bells = true } = {}) {
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
  world.meet.step(STEP, world);
  world.fly = (seconds, intent = { turn: 0.4, brake: false, bar: false }) => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) stepRun(world, intent, STEP);
  };
  return world;
}

test('a gust front due to reach a pilot past 550 m carries three plates on its line, 22 m either side of the lift\'s middle and a third 12 m beyond, at the pilot\'s height, once for each band', () => {
  let fronts = 0;
  const sides = new Set();
  for (const seed of firstSkies(6)) {
    let seen = 0;
    flown(seed, TST, (world) => {
      const { meet, sky, g } = world;
      const { state } = meet;
      if (state.fronts === seen) return;
      assert.equal(state.fronts, seen + 1);
      seen = state.fronts;
      fronts += 1;
      const { pilot, gusts, thermals } = sky.state;
      assert.ok(sky.state.peak >= MEET.iron && pilot.gustAhead > 0 && pilot.gustIn <= WIND.lead, `seed ${seed}`);
      const band = gusts[pilot.gustSlot];
      assert.equal(state.carried[pilot.gustSlot], band.born);
      const plates = state.loose.filter((plate) => of(PLATE_KIND.wind)(plate) && plate.born === sky.state.elapsed);
      assert.equal(plates.length, WIND.count);
      // Across the band through the middle of the lift being ridden, measured as the sky measures a lane.
      const lift = pilot.thermal >= 0 ? thermals[pilot.thermal] : g.pos;
      const middle = (lift.z - Z.z) * band.ux - (lift.x - Z.x) * band.uz;
      const offsets = plates.map((plate) => plate.ox - middle).sort((a, b) => a - b);
      const way = offsets[2] > 0 && Math.abs(offsets[2] - offsets[1] - WIND.gap) < 1e-9 ? 1 : -1;
      sides.add(way);
      assert.deepEqual(offsets.map((offset) => Math.round(offset * 1e6) / 1e6),
        way > 0 ? [-WIND.aside, WIND.aside, WIND.aside + WIND.gap] : [-(WIND.aside + WIND.gap), -WIND.aside, WIND.aside]);
      for (const plate of plates) {
        assert.deepEqual([plate.kg, plate.slot, plate.y, plate.still], [WIND.kg, pilot.gustSlot, g.pos.y, false]);
        // On the front itself, where the band has got to.
        assert.ok(Math.abs((plate.x - Z.x) * band.ux + (plate.z - Z.z) * band.uz - band.at) < 1e-9);
      }
    });
  }
  // About four fronts a sky reach the pilot past 550 m, and the third plate goes either way.
  assert.ok(fronts >= 18 && sides.size === 2, `${fronts} fronts`);
});

test('a front\'s plates ride it at its own speed and keep to the pilot\'s height until it reaches the pilot, then keep theirs, and go once it is 20 m past', () => {
  let followed = 0;
  let kept = 0;
  let gone = 0;
  for (const seed of firstSkies(4)) {
    let last = null;
    flown(seed, TST, (world) => {
      const { state } = world.meet;
      const { gusts } = world.sky.state;
      const { pos } = world.g;
      for (let i = 0; i < state.loose.length; i++) {
        const plate = state.loose[i];
        const was = last?.[i];
        if (plate.live && plate.kind === PLATE_KIND.wind) {
          const band = gusts[plate.slot];
          const ahead = (pos.x - Z.x) * band.ux + (pos.z - Z.z) * band.uz - band.at;
          if (was?.live && was.born === plate.born) {
            // A step on: as far along as the band has travelled, at its own speed.
            const moved = ((plate.x - was.x) * band.ux + (plate.z - was.z) * band.uz) / STEP;
            assert.ok(Math.abs(moved - CLOUD_GUST.speed) < 1e-6, `${moved} m/s`);
          }
          if (!plate.still) {
            // Not yet reached by its front: at the pilot's height.
            assert.ok(ahead > 0);
            assert.equal(plate.y, pos.y);
            followed += 1;
          } else {
            // Reached once, it keeps its height for good, even if the pilot gets ahead again.
            if (was?.still && was.born === plate.born) assert.equal(plate.y, was.y);
            assert.ok(ahead >= -WIND.past);
            kept += 1;
          }
        } else if (was?.live && was.kind === PLATE_KIND.wind && !plate.live) {
          gone += 1;
        }
      }
      last = state.loose.map(({ live, kind, x, y, z, born, still }) => ({ live, kind, x, y, z, born, still }));
    });
  }
  assert.ok(followed > 600 && kept > 100 && gone > 20, `${followed} steps following, ${kept} keeping, ${gone} gone`);
});

test('nearing a storm cloud\'s base past 550 m a pilot gets one plate hung 3 m under it, up to 8 m in from them; it rides the cloud for up to 20 s, and no cloud has a second', () => {
  let laid = 0;
  let rode = 0;
  for (const seed of firstSkies(10)) {
    let wasLive = false;
    const clouds = new Set();
    flown(seed, TST, (world) => {
      const { state } = world.meet;
      const sky = world.sky.state;
      const plate = state.loose.find(of(PLATE_KIND.thunder));
      // One at a time: the thunder's slot is the only place one hangs.
      assert.equal(state.loose.filter(of(PLATE_KIND.thunder)).length, plate ? 1 : 0);
      if (plate && !wasLive) {
        laid += 1;
        assert.ok(!clouds.has(plate.slot), `seed ${seed}: cloud ${plate.slot} had a second`);
        clouds.add(plate.slot);
        assert.ok(state.thundered[plate.slot] && sky.peak >= MEET.iron && sky.pilot.headroom <= THUNDER.range);
        assert.ok(flat(plate, world.g.pos) <= THUNDER.inward + 1e-9 && plate.y > world.g.pos.y);
        assert.equal(plate.kg, THUNDER.kg);
      }
      if (plate) {
        const cloud = sky.clouds[plate.slot];
        // Over its own spot on the cloud, `below` under the cloud's base there.
        assert.deepEqual([plate.x, plate.z], [cloud.x + plate.ox, cloud.z + plate.oz]);
        const lx = (plate.ox * cloud.cos - plate.oz * cloud.sin) / (cloud.rx * cloud.fade);
        const lz = (plate.ox * cloud.sin + plate.oz * cloud.cos) / (cloud.rz * cloud.fade);
        assert.ok(Math.abs(cloud.y - cloud.ry * cloud.fade * Math.sqrt(1 - lx * lx - lz * lz) - THUNDER.below - plate.y) < 1e-9);
        assert.ok(sky.elapsed - plate.born <= THUNDER.life);
        rode += 1;
      }
      wasLive = !!plate;
    });
  }
  assert.ok(laid >= 8 && rode > 300, `${laid} laid, ${rode} steps riding`);
});

test('after the horn, once the fog is within 200 m under the pilot, a plate rides 35 m over the fog 20 m to one side of the pilot and waits level with the wing; the next comes 3 s after one is taken', () => {
  let laid = 0;
  let waited = 0;
  for (const seed of firstSkies(8)) {
    let wasLive = false;
    flown(seed, TST, (world) => {
      const { state } = world.meet;
      const sky = world.sky.state;
      const { pos, yaw } = world.g;
      const plate = state.loose.find(of(PLATE_KIND.bait));
      if (plate && !wasLive) {
        laid += 1;
        assert.ok(state.horn && pos.y - sky.fogHeight <= BAIT.near && sky.peak >= MEET.iron);
        // Square off the wing's heading, `aside` to one side (or pulled in to stay off the rim).
        const across = (plate.x - pos.x) * Math.cos(yaw) + (plate.z - pos.z) * Math.sin(yaw);
        const along = (plate.x - pos.x) * Math.sin(yaw) - (plate.z - pos.z) * Math.cos(yaw);
        assert.ok(Math.abs(along) < 1e-9 && Math.abs(Math.abs(across) - BAIT.aside) < 1e-9, `seed ${seed}`);
        assert.equal(plate.kg, BAIT.kg);
      }
      if (plate) {
        assert.equal(plate.y, Math.min(sky.fogHeight + BAIT.above, pos.y));
        if (plate.y === pos.y) waited += 1;
      }
      wasLive = !!plate;
    });
  }
  assert.ok(laid >= 8 && waited > 20, `${laid} laid, ${waited} steps waiting level with the wing`);
  // Taken by hand: the next comes 3 s on, to the other side or the same as the seed draws it.
  const world = calm(4, 700);
  const { meet, sky, g } = world;
  sky.state.elapsed = MEET.horn + 1;
  meet.state.horn = true;
  sky.state.fogHeight = g.pos.y - BAIT.near;
  world.fly(STEP);
  const bait = meet.state.loose.find(of(PLATE_KIND.bait));
  assert.ok(bait && bait.y === sky.state.fogHeight + BAIT.above);
  Object.assign(g.pos, { x: bait.x, y: bait.y, z: bait.z });
  world.fly(STEP);
  const taken = sky.state.elapsed;
  assert.deepEqual([meet.state.bait, meet.state.bar, meet.state.baitDue, meet.state.baits], [1, BAIT.kg, taken + BAIT.again, 1]);
  assert.ok(!meet.state.loose.some(of(PLATE_KIND.bait)));
  // Back up where the fog is still well under the wing: none for 3 s, then the next.
  const above = () => { g.pos.y = sky.state.fogHeight + BAIT.near - 10; };
  for (let i = 0; i < Math.round(BAIT.again / STEP) - 1; i++) {
    above();
    world.fly(STEP);
    assert.ok(!meet.state.loose.some(of(PLATE_KIND.bait)), `${i} steps on`);
  }
  // The run's clock is a sum of steps: give it two to come round.
  for (let i = 0; i < 2; i++) {
    above();
    world.fly(STEP);
  }
  assert.equal(meet.state.baits, 2);
  // The fog's speed by then, for the record: past 25 m/s two minutes in.
  assert.ok(cloudFogSpeed(500, 120) > 15);
});

test('a strike past 550 m splits the bar into standard plates, largest first and eight at most, holds them while the wing is folded and sprays them round the pilot as it reopens, to sink away under it for 5.5 s', () => {
  for (const [bar, plates] of [[152.5, [25, 25, 25, 25, 25, 25, 2.5]], [62.5, [25, 25, 10, 2.5]], [47.5, [25, 20, 2.5]], [300, [25, 25, 25, 25, 25, 25, 25, 25]]]) {
    const world = calm();
    const { meet, sky, g } = world;
    meet.state.bar = bar;
    world.fly(STEP);
    assert.equal(sky.strike(), true);
    world.fly(STEP);
    const held = meet.state.loose.slice(0, SCATTER.most);
    assert.deepEqual(held.filter((plate) => plate.held).map((plate) => plate.kg), plates, `${bar} kg`);
    assert.ok(held.every((plate) => !plate.live && (plate.held ? plate.kind === PLATE_KIND.scatter : plate.kind === PLATE_KIND.none)));
    assert.deepEqual([meet.state.bar, meet.state.lost, meet.state.spray.held, meet.state.scattered], [0, bar - plates.reduce((a, b) => a + b, 0), true, 0]);
    // Held while the wing is folded, sprayed the step it reopens. The fold lasts its own time and no
    // longer: a loop that waited on it alone would never end if the wing never reopened.
    for (let i = 0; i <= FOLD && sky.state.pilot.collapse > 0; i++) {
      assert.ok(held.every((plate) => !plate.live));
      world.fly(STEP);
    }
    assert.equal(sky.state.pilot.collapse, 0, 'the wing reopened');
    const sprayed = held.filter((plate) => plate.live);
    assert.equal(sprayed.length, plates.length);
    assert.deepEqual([meet.state.scattered, meet.state.spray.held, meet.state.spray.at], [plates.length, false, sky.state.elapsed]);
    // `from` round the pilot, and already a step on its way out.
    const bearings = sprayed.map((plate) => {
      assert.ok(Math.abs(flat(plate, g.pos) - SCATTER.from - SCATTER.kick * STEP) < 1e-6 && plate.y === g.pos.y);
      return Math.atan2(plate.x - g.pos.x, -(plate.z - g.pos.z));
    }).sort((a, b) => a - b);
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

test('a scattered plate flown through within reach goes back on the bar; below 550 m a strike leaves the bar alone, and under Tiwaz it loses the whole bar', () => {
  const world = calm();
  const { meet, sky, g } = world;
  meet.state.bar = 60;
  world.fly(STEP);
  sky.strike();
  // Flown on until the wing has reopened and the plates have sprayed, which is the fold's own time:
  // a few steps past it, a meet that never sprays fails here rather than flying on for ever.
  for (let i = 0; i <= FOLD + 2 && (sky.state.pilot.collapse > 0 || meet.state.spray.held); i++) world.fly(STEP);
  assert.deepEqual([sky.state.pilot.collapse, meet.state.spray.held], [0, false], 'sprayed as the wing reopened');
  const [first, second] = meet.state.loose.filter(of(PLATE_KIND.scatter));
  assert.deepEqual([first.kg, second.kg, meet.state.bar], [25, 25, 0]);
  // They hang at the pilot's own height, a little under it, so reach is level: put by hand on one,
  // and then just out of reach of the other, outward from where they sprayed.
  const sprayedAt = { x: g.pos.x, z: g.pos.z };
  Object.assign(g.pos, { x: first.x, z: first.z });
  meet.step(STEP, world);
  assert.deepEqual([first.live, meet.state.bar, meet.state.recovered, meet.state.plates], [false, 25, 1, 1]);
  const out = flat(second, sprayedAt);
  const away = (out + TRAIL.reach + 0.2) / out;
  Object.assign(g.pos, { x: sprayedAt.x + (second.x - sprayedAt.x) * away, z: sprayedAt.z + (second.z - sprayedAt.z) * away });
  meet.step(STEP, world);
  assert.deepEqual([second.live, meet.state.bar, meet.state.recovered], [true, 25, 1]);
  assert.ok(reach(second, g.pos) > TRAIL.reach);
  // Under 550 m the bar keeps what it had, as before version 3.
  const low = calm(4, 520);
  low.meet.state.bar = 60;
  low.fly(STEP);
  low.sky.strike();
  low.fly(3);
  assert.deepEqual([low.meet.state.bar, low.meet.state.scattered, low.meet.state.lost], [60, 0, 0]);
  assert.ok(!low.meet.state.loose.some((plate) => plate.live || plate.held));
  // Holding Tiwaz the whole bar goes, at any height, and nothing is sprayed.
  for (const y of [520, 800]) {
    const tiwaz = calm(4, y);
    tiwaz.meet.state.runes.blessing.rune = RUNE.tiwaz;
    tiwaz.meet.state.bar = 90;
    tiwaz.fly(STEP);
    tiwaz.sky.strike();
    tiwaz.fly(3);
    assert.deepEqual([tiwaz.meet.state.bar, tiwaz.meet.state.lost, tiwaz.meet.state.scattered], [0, 90, 0], `${y} m`);
  }
});

test('under Fehu every plate loads from within 12 m, and under Tiwaz everything loaded counts twice', () => {
  // A trail plate 9 m off and a sprayed one 11 m off (at the pilot's height, standing still in the
  // air): out of reach without Fehu, within it with.
  for (const rune of [RUNE.none, RUNE.fehu]) {
    const world = calm();
    const { meet, sky, g } = world;
    meet.state.runes.blessing.rune = rune;
    Object.assign(meet.state.trail, { live: true, born: sky.state.elapsed, boarded: sky.state.elapsed });
    Object.assign(meet.state.trail.plates[0], { x: g.pos.x + 9, y: g.pos.y, z: g.pos.z, kg: 20, live: true });
    Object.assign(meet.state.loose[0], { kind: PLATE_KIND.scatter, kg: 25, live: true, x: g.pos.x, y: g.pos.y, z: g.pos.z - 11, born: sky.state.elapsed });
    meet.step(STEP, world);
    assert.equal(meet.state.bar, rune === RUNE.fehu ? 20 + 25 : 0, `rune ${rune}`);
    assert.ok(BLESSING.reach > 11 && TRAIL.reach < 9);
  }
  // Tiwaz: a close call, a plate and a rep all count twice.
  const world = calm();
  const { meet, g, bells } = world;
  meet.state.runes.blessing.rune = RUNE.tiwaz;
  bells.state.close = 1;
  Object.assign(meet.state.trail, { live: true, born: 0, boarded: 0 });
  Object.assign(meet.state.trail.plates[0], { x: g.pos.x, y: g.pos.y, z: g.pos.z, kg: 15, live: true });
  meet.step(STEP, world);
  assert.equal(meet.state.bar, 2 * (MEET.close + 15));
  assert.equal(meet.state.bar % 2.5, 0);
});

test('the Beast\'s close call loads 20 kg, once, and every other close call 10 kg', () => {
  const world = calm();
  const { meet, bells } = world;
  bells.state.close = 1;
  meet.step(STEP, world);
  assert.equal(meet.state.bar, MEET.close);
  bells.state.close = 2;
  bells.state.beast.result = BELL_RESULT.close;
  meet.step(STEP, world);
  assert.deepEqual([meet.state.bar, meet.state.beastClose], [MEET.close + MEET.beast, true]);
  bells.state.close = 3;
  meet.step(STEP, world);
  assert.equal(meet.state.bar, 2 * MEET.close + MEET.beast);
  assert.deepEqual([MEET.beast, MEET.close], [20, 10]);
});

test('nothing new happens below 550 m but the 500 m gates: no plate off the trail, no strike costs the bar, and no new counter moves, whoever flies', () => {
  let checked = 0;
  for (const seed of firstSkies(8)) {
    for (const options of [TST, { ...TST, collect: true }, { brake: 'eased' }, { ...TST, gates: true }]) {
      let bar = 0;
      let strikes = 0;
      let count = 0;
      flown(seed, options, (world) => {
        const { state } = world.meet;
        const sky = world.sky.state;
        if (sky.peak >= MEET.iron) return;
        checked += 1;
        assert.ok(state.loose.every((plate) => !plate.live && !plate.held), `seed ${seed}`);
        assert.deepEqual([state.fronts, state.wind, state.thunder, state.bait, state.scattered, state.recovered], [0, 0, 0, 0, 0, 0]);
        assert.equal(world.bells.state.thrown, 0);
        // A strike leaves the bar as it was (a line judged the same step empties it, as ever),
        // unless Tiwaz, from the 500 m gates, was taken.
        if (sky.pilot.strikes > strikes && state.count === count && state.runes.blessing.rune !== RUNE.tiwaz) {
          assert.ok(state.bar >= bar, `seed ${seed}: the bar went from ${bar} to ${state.bar}`);
        }
        strikes = sky.pilot.strikes;
        count = state.count;
        bar = state.bar;
        // The stones are the only thing new, raised at 400 m for the 500 m line.
        if (state.runes.raised > 0) assert.ok(sky.peak >= 400 && state.runes.line === 500);
      });
    }
  }
  assert.ok(checked > 32 * 40 * 60 * 0.4, `${checked} steps under 550 m`);
});

test('the loose plates keep to their slots: a strike\'s first, then two fronts\', then the thunder\'s and the bait\'s, and every plate on a trail is a trail plate', () => {
  const kinds = new Set();
  for (const seed of firstSkies(6)) {
    flown(seed, { ...TST, collect: true }, (world) => {
      const { loose, trail } = world.meet.state;
      assert.ok(trail.plates.every((plate) => plate.kind === PLATE_KIND.trail));
      assert.equal(loose.length, MEET_POOL.loose);
      loose.forEach((plate, i) => {
        if (plate.kind === PLATE_KIND.none) return;
        kinds.add(plate.kind);
        const want = i < SCATTER.most ? PLATE_KIND.scatter : i < SCATTER.most + 2 * WIND.count ? PLATE_KIND.wind : i === MEET_POOL.loose - 2 ? PLATE_KIND.thunder : PLATE_KIND.bait;
        assert.equal(plate.kind, want, `slot ${i}`);
      });
    });
  }
  assert.deepEqual([...kinds].sort(), [PLATE_KIND.wind, PLATE_KIND.thunder, PLATE_KIND.bait, PLATE_KIND.scatter].sort());
  assert.equal(PLATE_KIND.trail, 1);
});
