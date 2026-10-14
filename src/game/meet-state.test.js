import test from 'node:test';
import assert from 'node:assert/strict';
import { MEET, MEET_POOL, TRAIL, createMeet } from './meet-state.js';
import { createRunWorld, startRun, stepRun } from './run-step.js';
import { createReferencePilot } from './pilots.js';
import { cloudFogSpeed, createCloudbaseRun } from './cloudbase-state.js';
import { FLIGHT, STALL } from './flight.js';

const STEP = 1 / 60;
const TAU = Math.PI * 2;
// The bar's sink on flight.js's sink curve, worked out here on its own: about 2.30 m/s at 16 m/s.
const BAR_SINK = FLIGHT.sink.least +
  (FLIGHT.sink.trim - FLIGHT.sink.least) * ((FLIGHT.speed.bar - FLIGHT.speed.light) / (FLIGHT.speed.trim - FLIGHT.speed.light)) ** 2;
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const reach = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const firstSkies = (count) => Array.from({ length: count }, (_, i) => i + 1);

// Kettlebells that throw nothing: a test counts their close calls by hand.
const quietBells = () => ({ state: { close: 0 }, reset() { this.state.close = 0; }, step() {} });

// A run just started on `seed` with the meet, for tests that set the sky's counters by hand and
// step the meet alone: the sky and the wing stand still while it judges.
function standing(seed = 1) {
  const meet = createMeet();
  const bells = quietBells();
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet, bells }), seed);
  return { meet, state: meet.state, world, bells, sky: world.sky.state, pilot: world.sky.state.pilot };
}

// The reference pilot (pilots.js) flying a run already started on `world`, through the one step
// every run takes, until the run ends (and the meet with it) or `until(world)` says to stop.
// `watch(world)` sees every step.
function flyRun(world, { pilot = {}, until = () => false, watch = () => {} } = {}) {
  const reference = createReferencePilot(pilot);
  const intent = { turn: 0, brake: false, bar: false };
  let reason = null;
  while (!reason && world.sky.state.elapsed < 200 && !until(world)) {
    reference.decide(world, intent);
    reason = stepRun(world, intent, STEP);
    watch(world);
  }
  if (reason) world.meet?.finish(reason, world);
  return { world, meet: world.meet, state: world.meet?.state, reason };
}

// The same on a fresh run on `seed`, with the meet.
const flyMeet = (seed, options = {}) => flyRun(startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet() }), seed), options);

test('an empty bar weighs 25 kg, and the opener is judged on it at 250 m with every light white', () => {
  assert.equal(MEET.bar, 25);
  for (const seed of firstSkies(4)) {
    let crossed = null;
    const { state, world } = flyMeet(seed, {
      until: ({ meet }) => meet.state.count > 0,
      watch: ({ sky, meet }) => {
        // Nothing is judged before the peak reaches the line, and the opener on the step it does.
        if (sky.state.peak < MEET.every) assert.equal(meet.state.count, 0);
        else crossed ??= sky.state.elapsed;
      },
    });
    assert.deepEqual(state.lifts[0], { line: 250, kg: 25, red: 0, good: true, double: false, at: crossed }, `seed ${seed}`);
    assert.deepEqual([state.total, state.bar, state.next, state.count], [25, 0, 500, 1]);
    // The launch column climbs the pilot there in about 15 s, where no raven may strike yet.
    assert.ok(crossed > 10 && crossed < 25, `the opener came ${crossed.toFixed(1)} s in`);
    assert.equal(world.sky.state.pilot.strikes, 0);
  }
});

test('each judge reads only its own counter, and one red light is still a good lift', () => {
  const judges = [
    ['contact', 0b001, ({ pilot }) => { pilot.strikes += 1; }],
    ['control', 0b010, ({ world }) => { world.stalls += 1; }],
    ['airspace', 0b100, ({ pilot }) => { pilot.cloudTime += MEET.cloud + STEP; }],
  ];
  for (const [judge, red, poke] of judges) {
    const run = standing();
    const { meet, state, world, sky, bells } = run;
    bells.state.close = 1;
    sky.elapsed = 14.6;
    poke(run);
    sky.peak = 251;
    meet.step(STEP, world);
    assert.deepEqual(state.lifts[0], { line: 250, kg: 35, red, good: true, double: false, at: 14.6 }, judge);
    assert.equal(state.total, 35);
    // A light judges one lift only: the next starts clean, and with nothing new it is all white.
    sky.peak = 500;
    meet.step(STEP, world);
    assert.deepEqual(state.lifts[1], { line: 500, kg: 25, red: 0, good: true, double: false, at: 14.6 }, judge);
    assert.equal(state.total, 60);
  }
  // The airspace judge wants more than 1.5 s in cloud, counted from the last line.
  const { meet, state, world, sky, pilot } = standing();
  pilot.cloudTime = 4;
  sky.peak = 250;
  meet.step(STEP, world);
  pilot.cloudTime = 4 + MEET.cloud;
  sky.peak = 500;
  meet.step(STEP, world);
  assert.deepEqual(state.lifts.slice(0, 2).map((lift) => lift.red), [0b100, 0]);
});

test('two red lights or three bank nothing, and the next lift starts on an empty bar', () => {
  for (const red of [0b011, 0b101, 0b110, 0b111]) {
    const { meet, state, world, sky, pilot, bells } = standing();
    bells.state.close = 2;
    meet.step(STEP, world);
    assert.equal(state.bar, 20);
    if (red & 1) pilot.strikes += 2;
    if (red & 2) world.stalls += 1;
    if (red & 4) pilot.cloudTime += 3;
    sky.elapsed = 30;
    sky.peak = 250;
    meet.step(STEP, world);
    assert.deepEqual(state.lifts[0], { line: 250, kg: 45, red, good: false, double: false, at: 30 });
    assert.deepEqual([state.total, state.bar, state.next, state.count], [0, 0, 500, 1]);
    sky.peak = 500;
    meet.step(STEP, world);
    assert.deepEqual(state.lifts[1], { line: 500, kg: 25, red: 0, good: true, double: false, at: 30 });
    assert.equal(state.total, 25);
  }
});

test('once Gjallarhorn has sounded a good lift banks double, and before it once', () => {
  const { meet, state, world, sky, pilot, bells } = standing();
  bells.state.close = 1;
  sky.elapsed = MEET.horn - STEP;
  sky.peak = 250;
  meet.step(STEP, world);
  assert.equal(state.horn, false);
  assert.deepEqual([state.lifts[0].double, state.total], [false, 35]);
  sky.elapsed = MEET.horn;
  meet.step(STEP, world);
  assert.equal(state.horn, true);
  bells.state.close = 2;
  sky.peak = 500;
  meet.step(STEP, world);
  assert.deepEqual(state.lifts[1], { line: 500, kg: 35, red: 0, good: true, double: true, at: MEET.horn });
  assert.equal(state.total, 35 + 2 * 35);
  // Doubled or not, two reds bank nothing.
  pilot.strikes += 1;
  world.stalls += 1;
  sky.peak = 750;
  meet.step(STEP, world);
  assert.deepEqual([state.lifts[2].good, state.lifts[2].double, state.total], [false, true, 105]);
  // Within a step the lines are judged before the horn sounds, as that step ends: a line crossed
  // on the very step the clock reaches 110 s banks once.
  const edge = standing();
  edge.sky.elapsed = MEET.horn;
  edge.sky.peak = 250;
  edge.meet.step(STEP, edge.world);
  assert.deepEqual([edge.state.horn, edge.state.lifts[0].double, edge.state.total], [true, false, 25]);
});

test('the horn sounds exactly where cloudFogSpeed starts to climb 0.95 m/s faster each second', () => {
  // How much faster the fog rises for each second run, just before and just after a moment.
  const before = (t) => (cloudFogSpeed(500, t) - cloudFogSpeed(500, t - 0.001)) / 0.001;
  const after = (t) => (cloudFogSpeed(500, t + 0.001) - cloudFogSpeed(500, t)) / 0.001;
  assert.ok(Math.abs(after(MEET.horn) - before(MEET.horn) - 0.95) < 1e-6);
  // Anywhere else the rate holds steady across the moment.
  for (const t of [MEET.horn - 1, MEET.horn - 0.01, MEET.horn + 0.01, MEET.horn + 1]) {
    assert.ok(Math.abs(after(t) - before(t)) < 1e-6, `${t} s`);
  }
});

test('the fog and a touchdown judge the bar as it stands at ×1 with the same lights, and quitting forfeits it', () => {
  for (const reason of ['fog', 'landed']) {
    const { meet, state, world, sky, pilot, bells } = standing();
    sky.elapsed = 140;
    meet.step(STEP, world);
    assert.equal(state.horn, true);
    bells.state.close = 3;
    meet.step(STEP, world);
    pilot.strikes += 1;
    meet.finish(reason, world);
    // The mist's lift is ×1 even after the horn, and one red light still lets it through.
    assert.deepEqual(state.lifts[0], { line: 0, kg: 55, red: 0b001, good: true, double: false, at: 140 });
    assert.deepEqual([state.total, state.bar, state.count, state.ended], [55, 0, 1, reason]);
    // Only the first ending counts, and the meet steps no further.
    meet.finish(reason, world);
    sky.peak = 1000;
    bells.state.close = 9;
    meet.step(STEP, world);
    assert.deepEqual([state.total, state.bar, state.count, state.close], [55, 0, 1, 3]);
  }
  // Two reds as the run ends drop the bar, as at any line.
  const dropped = standing();
  dropped.bells.state.close = 1;
  dropped.meet.step(STEP, dropped.world);
  dropped.world.stalls += 1;
  dropped.pilot.cloudTime += 2;
  dropped.meet.finish('fog', dropped.world);
  assert.deepEqual([dropped.state.lifts[0].good, dropped.state.lifts[0].red, dropped.state.total], [false, 0b110, 0]);
  // Quitting, or any other ending, judges nothing and banks nothing.
  for (const reason of ['quit', 'travel', undefined]) {
    const { meet, state, world, sky, bells } = standing();
    sky.peak = 250;
    meet.step(STEP, world);
    bells.state.close = 4;
    meet.step(STEP, world);
    meet.finish(reason, world);
    assert.deepEqual([state.total, state.count, state.ended], [25, 1, 'quit'], `${reason}`);
  }
});

// Circles in thermal `slot` from its middle, 1,010 m up in a sky with no hazards and no wind, so
// nothing but the rule under test stops a rep: a full turn for `seconds`, the flock's way while
// `way(step)` is 1 and against it while it is -1, with `before(world, step)` and `after(world, step)`
// round each step. Returns the meet and how many full circles the wing turned the flock's way there.
function circle(slot, seconds, { way = () => 1, before = () => {}, after = () => {} } = {}) {
  const meet = createMeet();
  const world = startRun(createRunWorld({ sky: createCloudbaseRun({ hazards: false, wind: false }), meet }), 2);
  const { g, sky } = world;
  const thermal = sky.state.thermals[slot];
  Object.assign(g.pos, { x: thermal.x, y: 1010, z: thermal.z });
  const intent = { turn: 0, brake: false, bar: false };
  let turned = 0;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    intent.turn = way(i) * thermal.dir;
    before(world, i);
    assert.equal(stepRun(world, intent, STEP), null);
    if (sky.state.pilot.thermal === slot) turned += g.yawRate * thermal.dir * STEP;
    after(world, i);
  }
  return { state: meet.state, circles: turned / TAU, world };
}

test('a full circle the flock\'s way in a hunted thermal loads 2.5 kg, and the launch column, the wrong way round, a spin and a collapse load nothing', () => {
  // Twelve seconds of a full turn is about one and a half circles, and no line is crossed.
  const rep = circle(1, 12);
  assert.ok(rep.circles > 1.3 && rep.circles < 2, `${rep.circles.toFixed(2)} circles`);
  assert.deepEqual([rep.state.reps, rep.state.bar, rep.state.count], [1, MEET.rep, 4]);
  // The launch column has no flock to turn with.
  const column = circle(0, 12);
  assert.ok(column.circles > 1.3);
  assert.deepEqual([column.state.reps, column.state.bar], [0, 0]);
  // Against the flock nothing counts, and turning back against it undoes a circle in progress:
  // 6 s the flock's way, half a second against (enough to pass `against`) and 6.5 s the flock's
  // way again would make a rep without it.
  const against = circle(1, 12, { way: () => -1 });
  assert.ok(against.circles < -1.3);
  assert.equal(against.state.reps, 0);
  let undone = 0;
  const back = circle(1, 13, {
    way: (i) => (i >= 360 && i < 390 ? -1 : 1),
    after: ({ meet }, i) => {
      if (i === 359) undone = meet.state.turned;
    },
  });
  assert.ok(undone > 4 && back.state.turned < TAU && undone + back.state.turned >= TAU,
    `${undone.toFixed(2)} rad before turning back and ${back.state.turned.toFixed(2)} after`);
  assert.equal(back.state.reps, 0);
  // A wing spinning round the flock's way is not circling, however far it goes.
  const spin = circle(1, 12, {
    before: ({ g, sky }) => {
      g.stall = STALL.harsh.time + STALL.surge;
      g.stallSide = sky.state.thermals[1].dir;
      g.stallHarsh = true;
    },
    after: ({ meet }) => assert.equal(meet.state.turned, 0),
  });
  assert.ok(spin.circles > 2, `${spin.circles.toFixed(2)} circles spinning`);
  assert.equal(spin.state.reps, 0);
  // A collapse loses the circle in progress: struck 6 s in, the wing hooks round the flock's way
  // for 2.4 s, and only what it turns after that counts, short of a circle. Counted through the
  // collapse, or not lost to it, the same flight would have made a rep.
  let hooked = 0;
  const collapse = circle(1, 15.5, {
    before: ({ sky }, i) => {
      if (i === 360) assert.equal(sky.strike(), true);
    },
    after: ({ sky, meet, g }) => {
      if (sky.state.pilot.collapse === 0) return;
      assert.equal(meet.state.turned, 0);
      hooked += g.yawRate * sky.state.thermals[1].dir * STEP;
    },
  });
  assert.ok(hooked > 0.9, `the wing hooked ${hooked.toFixed(2)} rad the flock's way`);
  assert.ok(collapse.state.turned < TAU && collapse.state.turned + hooked >= TAU,
    `${collapse.state.turned.toFixed(2)} rad after the collapse and ${hooked.toFixed(2)} in it`);
  assert.ok(collapse.circles > 1.6);
  assert.equal(collapse.state.reps, 0);
});

test('a new ride starts its own circle, and flying out of a lift and back into it does not', () => {
  const { meet, state, world, sky, pilot } = standing();
  // The wing turning steadily the way the flock of thermal `slot` turns (or in no lift at -1).
  const circle = (slot, seconds) => {
    pilot.thermal = slot;
    world.g.yawRate = (slot > 0 ? sky.thermals[slot].dir : 1) * FLIGHT.turn.trim;
    for (let i = 0; i < seconds * 60; i++) meet.step(STEP, world);
  };
  // 4.8 rad round one flock and 3.2 round the next would make a rep, were the first carried over.
  circle(1, 6);
  circle(2, 4);
  assert.equal(state.reps, 0);
  // Out of the lift a while, the circle waits; back in the same one, it carries on to a rep.
  circle(-1, 1);
  circle(2, 4);
  assert.deepEqual([state.reps, state.bar], [1, MEET.rep]);
});

test('drifting the other way slower than 0.2 rad/s keeps the circle in progress, and turning back any faster loses it', () => {
  const { meet, state, world, sky, pilot } = standing();
  const thermal = sky.thermals[2];
  assert.ok(thermal.strength >= MEET.alive);
  // The wing turning at `rate` (rad/s, the flock's way when positive) in thermal 2 for `seconds`.
  const turn = (rate, seconds) => {
    pilot.thermal = 2;
    world.g.yawRate = rate * thermal.dir;
    for (let i = 0; i < Math.round(seconds * 60); i++) meet.step(STEP, world);
  };
  // 4 rad the flock's way, a second of each slow drift back (as rough air rocks a wing), then 2.4
  // rad more: one rep, which the drift did not undo.
  turn(FLIGHT.turn.trim, 5);
  const before = state.turned;
  for (const rate of [-0.1, -(MEET.against - 0.01)]) {
    turn(rate, 1);
    assert.equal(state.turned, before, `${rate} rad/s back`);
  }
  turn(FLIGHT.turn.trim, 3);
  assert.deepEqual([state.reps, state.bar], [1, MEET.rep]);
  // Another circle, turned back for a single step a little faster than `against`, starts over:
  // the same 2.4 rad after it make no rep.
  turn(FLIGHT.turn.trim, 5);
  turn(-(MEET.against + 0.01), STEP);
  assert.equal(state.turned, 0);
  turn(FLIGHT.turn.trim, 3);
  assert.deepEqual([state.reps, state.bar], [1, MEET.rep]);
});

test('a trail is laid when the lift ridden drops under 0.35 or moves on, toward a settled flock before one still flying in, and only once', () => {
  // The sky of seed 1 arranged by hand, with only the meet stepped: `ride(slot)` is a step in that
  // lift (or in none, at -1), and `site(slot, x, z)` puts a thermal's lift there, settled.
  const arrange = () => {
    const run = standing();
    const { meet, world, sky, pilot } = run;
    run.ride = (slot, seconds = STEP) => {
      pilot.thermal = slot;
      for (let t = 0; t < seconds; t += STEP) {
        sky.elapsed += STEP;
        meet.step(STEP, world);
      }
    };
    run.site = (slot, x, z, strength = 1) => Object.assign(sky.thermals[slot], { x, z, fromX: x, fromZ: z, move: 0, live: true, strength });
    // `moveOn(slot)` sends a thermal's flock off to a new site 80 m east, as the sky relocates one.
    run.moveOn = (slot) => {
      const thermal = sky.thermals[slot];
      Object.assign(thermal, { fromX: thermal.x, fromZ: thermal.z, x: thermal.x + 80, move: 6, live: false, strength: 0 });
    };
    // Thermal 2 in the middle of the sky and thermal 1 100 m west of it.
    run.site(1, 25, 238);
    run.site(2, 125, 238);
    return run;
  };
  // Dropping under 0.35 lays the trail from the lift ridden toward the other flock, once.
  let run = arrange();
  run.ride(2);
  run.sky.thermals[2].strength = 0.34;
  run.ride(2);
  assert.deepEqual([run.state.trails, run.state.trail.target, run.state.trail.x, run.state.trail.z], [1, 1, 125, 238]);
  run.ride(2, 2);
  run.moveOn(2);
  run.ride(-1);
  assert.equal(run.state.trails, 1);
  // A lift still blooming, or a spent one flown back into, has not dropped, even straight after a
  // ride in a strong one: no trail until it has itself been seen at 0.35 or more. First a thermal
  // still blooming after the other flock's strong lift, then the spent launch column after one.
  run = arrange();
  run.ride(1, 1);
  run.sky.thermals[2].strength = 0.2;
  run.ride(2, 1);
  assert.equal(run.state.trails, 0);
  run.sky.thermals[2].strength = 0.36;
  run.ride(2);
  run.sky.thermals[2].strength = 0.34;
  run.ride(2);
  assert.deepEqual([run.state.trails, run.state.trail.x, run.state.trail.target], [1, 125, 1]);
  run = arrange();
  run.ride(2, 1);
  run.sky.thermals[0].strength = 0.3;
  run.ride(0, 1);
  assert.equal(run.state.trails, 0);
  run.sky.thermals[0].strength = 0.36;
  run.ride(0);
  run.sky.thermals[0].strength = 0.34;
  run.ride(0);
  assert.equal(run.state.trails, 1);
  // A lift that moves on lays its trail, even one never seen strong. The flock settled 100 m off
  // is led to before the ridden lift's own, flying to its site 80 m off.
  run = arrange();
  run.sky.thermals[2].strength = 0.2;
  run.ride(2);
  run.moveOn(2);
  run.ride(-1);
  assert.deepEqual([run.state.trails, run.state.trail.target], [1, 1]);
  // With no settled flock, the one still flying in is followed.
  run = arrange();
  run.ride(2);
  run.sky.thermals[1].strength = 0.2;
  run.moveOn(2);
  run.ride(-1);
  assert.deepEqual([run.state.trails, run.state.trail.target], [1, 2]);
  // Of two settled flocks, the nearer: here from the launch column, 90 m west and 70 m east.
  run = arrange();
  run.site(1, 35, 320);
  run.site(2, 195, 320);
  run.ride(0);
  run.sky.thermals[0].strength = 0.34;
  run.ride(0);
  assert.deepEqual([run.state.trails, run.state.trail.target], [1, 2]);
  // With no flock to lead to yet, it waits for one, but only while the ride is recent.
  for (const [away, laid] of [[TRAIL.recent - 0.1, 1], [TRAIL.recent + 0.1, 0]]) {
    run = arrange();
    run.ride(2);
    run.sky.thermals[1].strength = 0.2;
    run.sky.thermals[2].strength = 0.3;
    run.ride(2);
    run.ride(-1, away);
    assert.equal(run.state.trails, 0);
    run.sky.thermals[1].strength = 0.5;
    run.ride(-1);
    assert.equal(run.state.trails, laid, `${away} s after the ride`);
  }
});

test('a dying ride lays five or six plates toward the next flock on the bar\'s glide, outside both cores', () => {
  const wind = { x: 0, z: 0, front: 0, rough: 0 };
  // The lift the pilot was last in, seen from the sky alone.
  let ridden = null;
  const laid = { trails: 0, five: 0, six: 0, flying: 0 };
  flyMeet(1, {
    watch: ({ sky, g, meet }) => {
      const { state } = meet;
      const { thermals, pilot } = sky.state;
      if (state.trails > laid.trails) {
        laid.trails = state.trails;
        const { trail } = state;
        const plates = trail.plates.filter((plate) => plate.live);
        assert.deepEqual([trail.x, trail.z], [ridden.x, ridden.z], 'from the lift last ridden');
        // Toward a settled flock still lifting, the nearer of two; a flock still flying in only
        // when there is no such flock.
        const target = thermals[trail.target];
        const settled = (thermal, i) => i > 0 && i !== ridden.slot && thermal.live && thermal.move === 0 && thermal.strength >= MEET.alive;
        if (target.move > 0) {
          laid.flying += 1;
          assert.ok(trail.target > 0 && !thermals.some(settled));
        } else {
          assert.ok(settled(target, trail.target));
          thermals.forEach((other, i) => assert.ok(!settled(other, i) || flat(target, ridden) <= flat(other, ridden)));
        }
        // Evenly spaced on the line between the two centres, from 22 m out of the dying lift (a
        // hands-up circle is 14 m) to 0.6 of the target's radius short of its centre.
        const distance = flat(target, ridden);
        const ux = (target.x - ridden.x) / distance;
        const uz = (target.z - ridden.z) / distance;
        const along = plates.map((plate) => (plate.x - ridden.x) * ux + (plate.z - ridden.z) * uz);
        const span = along.at(-1) - along[0];
        assert.ok(Math.abs(along[0] - TRAIL.from) < 1e-9);
        assert.ok(Math.abs(distance - along.at(-1) - TRAIL.stop * target.r) < 1e-9);
        plates.forEach((plate, i) => {
          assert.ok(Math.abs((plate.x - ridden.x) * uz - (plate.z - ridden.z) * ux) < 1e-9);
          assert.ok(Math.abs(along[i] - along[0] - (i * span) / (plates.length - 1)) < 1e-9);
          assert.ok(flat(plate, ridden) >= TRAIL.from - 1e-9 && flat(plate, target) >= TRAIL.stop * target.r - 1e-9);
        });
        // Six plates on a trail of 60 m or more, five on a shorter one, the heaviest last.
        assert.deepEqual(plates.map((plate) => plate.kg), span >= TRAIL.long ? [...TRAIL.kg6] : [...TRAIL.kg5]);
        laid[plates.length === 6 ? 'six' : 'five'] += 1;
        // The first hangs 1.5 m under the pilot and the rest fall away on the bar's glide over the
        // ground, in the wind across the middle of the trail at the pilot's height.
        assert.equal(plates[0].y, g.pos.y - TRAIL.below);
        const middle = (along[0] + along.at(-1)) / 2;
        sky.windAt(ridden.x + ux * middle, g.pos.y, ridden.z + uz * middle, wind);
        const slope = BAR_SINK / Math.max(6, FLIGHT.speed.bar + wind.x * ux + wind.z * uz);
        for (let i = 1; i < plates.length; i++) {
          assert.ok(Math.abs((plates[0].y - plates[i].y) / (along[i] - along[0]) - slope) < 1e-9);
        }
      }
      if (pilot.thermal >= 0) ridden = { slot: pilot.thermal, x: thermals[pilot.thermal].x, z: thermals[pilot.thermal].z };
    },
  });
  // On this sky: from the launch column, toward a flock still flying in, and five- and six-plate
  // trails between the hunted thermals.
  assert.deepEqual(laid, { trails: 4, five: 1, six: 3, flying: 1 });
  // In still air the bar glides about 6.95:1.
  assert.ok(Math.abs(FLIGHT.speed.bar / BAR_SINK - 6.95) < 0.01);
});

test('a trail follows the pilot\'s height until it is boarded, then stays put', () => {
  const followed = { steps: 0, low: Infinity, high: -Infinity };
  const held = { steps: 0, low: Infinity, high: -Infinity };
  let frozen = null;
  flyMeet(1, {
    until: ({ meet }) => meet.state.trails > 1,
    watch: ({ g, meet }) => {
      const { trail, trails } = meet.state;
      if (trails !== 1 || !trail.live) return;
      if (trail.boarded < 0) {
        trail.plates.forEach((plate, i) => {
          if (plate.live) assert.equal(plate.y, g.pos.y - TRAIL.below - i * trail.gap * trail.slope);
        });
        followed.steps += 1;
        followed.low = Math.min(followed.low, g.pos.y);
        followed.high = Math.max(followed.high, g.pos.y);
      } else {
        frozen ??= trail.plates.map((plate) => plate.y);
        trail.plates.forEach((plate, i) => assert.equal(plate.y, frozen[i]));
        held.steps += 1;
        held.low = Math.min(held.low, g.pos.y);
        held.high = Math.max(held.high, g.pos.y);
      }
    },
  });
  // The pilot climbed and sank by metres both while the trail followed and after it was boarded.
  assert.ok(followed.steps > 60 && followed.high - followed.low > 1, `followed ${followed.steps} steps over ${(followed.high - followed.low).toFixed(1)} m`);
  assert.ok(held.steps > 60 && held.high - held.low > 3, `held ${held.steps} steps over ${(held.high - held.low).toFixed(1)} m`);
});

test('loading a plate boards its trail there and then, however far short of the first plate the pilot is, and the plates left stay where they were', () => {
  const { world, meet, state } = flyMeet(1, { until: ({ meet }) => meet.state.trails > 0 });
  const { trail } = state;
  const { sky } = world;
  assert.equal(trail.boarded, -1);
  // The meet stepped a second later each time, with the glider put by hand `along` metres down
  // the trail at height `y`; the sky stands still but for its clock.
  const at = (along, y) => {
    sky.state.elapsed += 1;
    meet.step(STEP, { ...world, g: { pos: { x: trail.x + trail.ux * along, y, z: trail.z + trail.uz * along }, yawRate: 0, stall: 0 } });
  };
  const live = () => trail.plates.filter((plate) => plate.live).length;
  const laid = live();
  // 5 m short of the first plate, far from the 4 m past it that boards a trail flown by, that
  // plate (hung 1.5 m under the pilot) is within reach, and only it.
  const [first, ...rest] = trail.plates;
  at(TRAIL.from - 5, 600);
  assert.deepEqual([first.live, live(), state.plates, state.bar], [false, laid - 1, 1, first.kg]);
  const loaded = sky.state.elapsed;
  assert.equal(trail.boarded, loaded);
  // From then on the plates left stay at the heights they had, however the pilot climbs or sinks.
  const kept = rest.map((plate) => plate.y);
  for (const y of [640, 560, 600]) {
    at(0, y);
    assert.deepEqual(rest.map((plate) => plate.y), kept, `${y} m`);
  }
  assert.ok(trail.live && trail.boarded === loaded && live() === laid - 1);
});

test('a plate loads onto the bar once, from within 6 m in 3-D and no further, and a trail does not wait for ever', () => {
  const { world, meet, state } = flyMeet(1, { until: ({ meet }) => meet.state.trails > 0 });
  const { trail } = state;
  const { sky } = world;
  // The meet stepped with the glider put at a point by hand, the sky standing still.
  const at = (x, y, z) => meet.step(STEP, { ...world, g: { pos: { x, y, z }, yawRate: 0, stall: 0 } });
  const across = { x: -trail.uz, z: trail.ux };
  const born = trail.born;
  // Flown 4 m past the first plate, 40 m to its side, the pilot has boarded without loading any.
  const past = TRAIL.from + 4.01;
  at(trail.x + trail.ux * past + across.x * 40, world.g.pos.y, trail.z + trail.uz * past + across.z * 40);
  assert.ok(trail.boarded === born && trail.live);
  assert.deepEqual([state.plates, state.bar], [0, 0]);
  // Just over 6 m above a plate is out of reach; just under loads it, once.
  const plate = trail.plates[2];
  at(plate.x, plate.y + 6.01, plate.z);
  assert.deepEqual([plate.live, state.plates, state.bar], [true, 0, 0]);
  at(plate.x, plate.y + 5.99, plate.z);
  assert.deepEqual([plate.live, state.plates, state.bar], [false, 1, plate.kg]);
  at(plate.x, plate.y, plate.z);
  assert.deepEqual([state.plates, state.bar], [1, plate.kg]);
  // And the same to the side of one.
  const next = trail.plates[3];
  at(next.x + across.x * 6.01, next.y, next.z + across.z * 6.01);
  assert.equal(next.live, true);
  at(next.x + across.x * 5.99, next.y, next.z + across.z * 5.99);
  const loaded = plate.kg + next.kg;
  assert.deepEqual([next.live, state.plates, state.bar], [false, 2, loaded]);
  // Once boarded, a trail lasts 15 s; the plates left on it go, and none of them is loaded.
  sky.state.elapsed = born + TRAIL.keep - 1e-9;
  at(trail.x, world.g.pos.y, trail.z);
  assert.equal(trail.live, true);
  sky.state.elapsed = born + TRAIL.keep + STEP;
  at(trail.x, world.g.pos.y, trail.z);
  assert.ok(!trail.live && trail.plates.every((each) => !each.live));
  assert.deepEqual([state.plates, state.bar], [2, loaded]);
  // Never boarded, the same trail would have waited 20 s.
  const waiting = flyMeet(1, { until: ({ meet }) => meet.state.trails > 0 });
  const left = waiting.state.trail;
  const wait = (seconds) => {
    waiting.world.sky.state.elapsed = left.born + seconds;
    waiting.meet.step(STEP, { ...waiting.world, g: { pos: { x: left.x, y: 500, z: left.z }, yawRate: 0, stall: 0 } });
  };
  wait(TRAIL.life - 1e-9);
  assert.ok(left.live && left.boarded < 0 && left.plates[0].y === 500 - TRAIL.below);
  wait(TRAIL.life + STEP);
  assert.ok(!left.live && left.plates.every((each) => !each.live));
});

test('each close call the kettlebells count adds 10 kg to the bar, on the step they count it', () => {
  const { meet, state, world, bells } = standing();
  meet.step(STEP, world);
  assert.deepEqual([state.bar, state.close], [0, 0]);
  bells.state.close = 1;
  meet.step(STEP, world);
  assert.deepEqual([state.bar, state.close], [MEET.close, 1]);
  meet.step(STEP, world);
  assert.deepEqual([state.bar, state.close], [10, 1]);
  bells.state.close = 3;
  meet.step(STEP, world);
  assert.deepEqual([state.bar, state.close], [30, 3]);
  // Through the run's own step, kettlebells that count a close call 5 s in: the meet takes it on
  // the same step, while the pilot circles the launch column with nothing else to load.
  const thrower = {
    state: { close: 0 },
    reset() { this.state.close = 0; },
    step(dt, { sky }) { if (sky.state.elapsed >= 5) this.state.close = 1; },
  };
  let bar = 0;
  const { state: met } = flyRun(startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: thrower }), 1), {
    until: ({ sky }) => sky.state.elapsed >= 10,
    watch: ({ sky, meet }) => {
      assert.equal(meet.state.bar - bar, sky.state.elapsed >= 5 && bar === 0 ? MEET.close : 0);
      bar = meet.state.bar;
    },
  });
  assert.deepEqual([met.bar, met.close], [10, 1]);
});

test('a run flies exactly the same with the meet as without it', () => {
  const fly = (meet) => flyRun(startRun(createRunWorld({ sky: createCloudbaseRun(), meet }), 2), { pilot: { brake: 'eased' } });
  const plain = fly(null).world;
  const met = fly(createMeet());
  assert.deepEqual(met.world.sky.state, plain.sky.state);
  assert.deepEqual({ ...met.world.g, pos: { ...met.world.g.pos } }, { ...plain.g, pos: { ...plain.g.pos } });
  for (const part of ['controls', 'air', 'forces', 'hook', 'struck', 'stalls', 'steps']) assert.deepEqual(met.world[part], plain[part], part);
  // And the meet had plenty to do: lines judged, reps turned, trails laid and plates loaded.
  const { state } = met;
  assert.equal(met.reason, 'fog');
  assert.ok(state.count >= 5 && state.reps >= 2 && state.trails >= 3 && state.plates >= 3 && state.total > 200,
    JSON.stringify({ count: state.count, reps: state.reps, trails: state.trails, plates: state.plates, total: state.total }));
});

test('the pools keep their length and identity run after run, and hold only plain data', () => {
  const meet = createMeet();
  const { state } = meet;
  const parts = () => [state.lifts, state.since, state.ride, state.trail, state.trail.plates, ...state.lifts, ...state.trail.plates];
  const kept = parts();
  const world = createRunWorld({ sky: createCloudbaseRun(), meet });
  for (const seed of firstSkies(8)) {
    flyRun(startRun(world, seed));
    assert.equal(meet.state, state);
    assert.deepEqual([state.lifts.length, state.trail.plates.length], [MEET_POOL.lifts, MEET_POOL.plates]);
    assert.ok(parts().every((part, i) => part === kept[i]), `seed ${seed}`);
    assert.deepEqual(structuredClone(state), state);
    assert.ok(state.count >= 3 && state.count <= MEET_POOL.lifts && state.ended === 'fog');
    // Nothing of a trail is left to fly through once the run has ended.
    assert.ok(!state.trail.live && state.trail.plates.every((plate) => !plate.live));
  }
  // Reset, it is a new meet again.
  meet.reset();
  assert.deepEqual(state, createMeet().state);
});

test('the same sky and the same flying give the same meet, whatever it judged before', () => {
  const fresh = flyMeet(5, { pilot: { brake: 'eased' } }).state;
  // A meet that has flown another sky and been left in a mess starts the same run from scratch.
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet() }), 9);
  flyRun(world, { until: ({ sky }) => sky.state.elapsed > 70 });
  Object.assign(world.meet.state, { total: 1234.5, bar: 40, next: 750, horn: true, turned: 3, ended: 'quit' });
  Object.assign(world.meet.state.trail, { live: true, ride: 99, boarded: 12 });
  world.meet.state.lifts[7].kg = 999;
  world.meet.state.trail.plates[5].live = true;
  const used = flyRun(startRun(world, 5), { pilot: { brake: 'eased' } }).state;
  assert.deepEqual(used, fresh);
  assert.ok(fresh.count >= 4 && fresh.trails >= 3);
});

// What every step of a run must show of the meet, whoever flies it: a rep lands only for a circle
// the flock's way in a hunted thermal still lifting, with the wing flying; a plate is loaded only
// from within reach of the glider; and each line is judged on the step the peak reaches it.
function obeysTheRules() {
  let last = null;
  return ({ sky, g, meet }) => {
    const { state } = meet;
    const { pilot, thermals, peak } = sky.state;
    if (last) {
      if (state.reps > last.reps) {
        const thermal = thermals[pilot.thermal];
        assert.equal(state.reps, last.reps + 1);
        assert.ok(pilot.thermal > 0 && thermal.strength >= MEET.alive, 'a rep in a hunted thermal still lifting');
        assert.ok(pilot.collapse === 0 && g.stall === 0, 'a rep with the wing flying');
        assert.ok(g.yawRate * thermal.dir > 0, 'a rep turning the flock\'s way');
      }
      if (state.trails === last.trails) {
        const loaded = state.trail.plates.filter((plate, i) => last.live[i] && !plate.live);
        if (state.plates > last.plates) {
          assert.equal(loaded.length, state.plates - last.plates);
          for (const plate of loaded) assert.ok(reach(plate, g.pos) <= TRAIL.reach, 'a plate from within reach');
        }
      }
      if (state.count > last.count) assert.ok(state.lifts[state.count - 1].line <= peak && peak < state.next);
    }
    last = { reps: state.reps, plates: state.plates, trails: state.trails, count: state.count, live: state.trail.plates.map((plate) => plate.live) };
    assert.ok(peak < state.next, 'every line reached is judged');
  };
}

// Measured over 80 skies (seeds 1 to 40, then 1001 to 1040), with no kettlebells: TOTAL median,
// lines a run (median and range), the share of lines that were no lifts, and then reps, trails,
// plates laid and plates loaded (by flying through them on the way, never on purpose) a run:
//   hands up, with the flock      256 / 235 kg   5 (3-7)   1.5 / 2.1%    3.8 / 3.4   4.8 / 4.7   26 / 26   4.5 / 4.8
//   light brake, eased            238 / 219 kg   5 (3-6)   6.3 / 4.6%    3.2 / 3.6   4.8 / 4.7   26 / 26   5.4 / 4.4
//   hands up, against the flock   175 / 168 kg   4 (2-5)   6.8 / 6.6%    0   / 0     4.5 / 4.6   24 / 25   4.0 / 3.9
//   brake never eased             110 / 120 kg   4 / 3 (2-5) 23 / 23%    0.4 / 0.3   4.7 / 4.7   26 / 26   5.4 / 5.0
// In all 320 runs the opener was judged on the empty bar and banked, white but for the never-eased
// brake's control light (it stalls on the way up), and the fog judged the bar last, at ×1. The
// light brake meets more ravens, which costs it more lifts than its extra height wins.
// The tests below catch a large shift in any of these; the margins leave room to retune.
test('the reference pilots bank more for turning with the flock, lose lifts to a brake never eased, and every sky opens on the empty bar and ends judged by the fog', () => {
  const fly = (pilot, count) => firstSkies(count).map((seed) => flyMeet(seed, { pilot, watch: obeysTheRules() }));
  const withFlock = fly({}, 12);
  const against = fly({ withFlock: false }, 12);
  const held = fly({ brake: 'held' }, 6);
  for (const { state, reason } of [...withFlock, ...against, ...held]) {
    const lifts = state.lifts.slice(0, state.count);
    assert.equal(reason, 'fog');
    // The opener on the empty bar, banked; the lines in order; the fog's lift last, at ×1.
    assert.ok(lifts[0].line === 250 && lifts[0].kg === MEET.bar && lifts[0].good && (lifts[0].red & 0b101) === 0);
    lifts.slice(0, -1).forEach((lift, i) => assert.equal(lift.line, MEET.every * (i + 1)));
    assert.deepEqual([lifts.at(-1).line, lifts.at(-1).double], [0, false]);
    // Doubled only under the horn (it sounds as the step that reaches 110 s ends), and the total
    // is exactly what the good lifts banked.
    for (const lift of lifts.slice(0, -1)) {
      if (lift.at < MEET.horn) assert.equal(lift.double, false);
      if (lift.at > MEET.horn + 2 * STEP) assert.equal(lift.double, true);
    }
    assert.equal(state.total, lifts.reduce((sum, lift) => sum + (lift.good ? lift.kg * (lift.double ? MEET.double : 1) : 0), 0));
    assert.equal(state.total % 2.5, 0);
    assert.ok(state.trails >= 3, `${state.trails} trails`);
  }
  const all = (runs) => runs.flatMap(({ state }) => state.lifts.slice(0, state.count));
  const totals = (runs) => median(runs.map(({ state }) => state.total));
  const dropped = (runs) => all(runs).filter((lift) => !lift.good);
  // On these seeds: medians of 291, 175 and 75 kg; reps 3 to 5 a run with the flock; 2 of 73
  // lifts dropped with the flock, 5 of 58 against it and 11 of 26 with the brake never eased,
  // 10 of those 11 with the control light among the reds.
  assert.ok(withFlock.every(({ state }) => state.reps >= 2), 'every circling run turns reps with the flock');
  assert.ok(against.every(({ state }) => state.reps === 0), 'and none against it');
  assert.ok(totals(withFlock) >= 200 && totals(withFlock) - totals(against) >= 60, `${totals(withFlock)} kg with the flock, ${totals(against)} kg against`);
  assert.ok(totals(withFlock) - totals(held) >= 120, `${totals(held)} kg with the brake never eased`);
  assert.ok(dropped([...withFlock, ...against]).length <= all([...withFlock, ...against]).length / 10);
  const stalled = dropped(held).filter((lift) => lift.red & 0b010).length;
  assert.ok(dropped(held).length >= all(held).length / 4 && stalled >= dropped(held).length * 0.75,
    `${dropped(held).length} of ${all(held).length} lifts dropped, ${stalled} with the control light`);
  // Plates are loaded on the way to the next lift, even by a pilot who never looks for them.
  const loaded = [...withFlock, ...against].reduce((sum, { state }) => sum + state.plates, 0);
  assert.ok(loaded >= 2 * 24, `${loaded} plates loaded in 24 runs`);
});
