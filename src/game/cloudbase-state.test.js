import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOUD_ZONE, CLOUD_GATE, CLOUD_LAUNCH, CLOUD_WEAR, CLOUD_HUNT, CLOUD_RAVENS, CLOUD_STRIKE, CLOUD_STORM,
  CLOUD_WIND, CLOUD_GUST, CLOUD_POOL, CLOUD_MILESTONES, createCloudbaseRun,
} from './cloudbase-state.js';
import { BRAKE, FLIGHT, createFlight, stepFlight } from './flight.js';
import { createRunWorld, startRun } from './run-step.js';
import { createReferencePilot, flyPilot } from './pilots.js';
import { surfaceAt } from './terrain.js';

const STEP = 1 / 60;
// The lift at the very middle of a hunted thermal at full strength, where its core peaks.
const CORE = CLOUD_HUNT.s * CLOUD_HUNT.peak;
// High above every cloud layer and every thermal's ravens: plain air to test the lift in.
const position = (point = CLOUD_ZONE, y = 5000) => ({ x: point.x, z: point.z, y });
const outside = (y = 5000) => ({ x: CLOUD_ZONE.x + CLOUD_ZONE.r + 60, z: CLOUD_ZONE.z, y });
const advance = (run, seconds, point) => {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) run.step(STEP, point);
};
const between = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const hunted = (run) => run.state.thermals.slice(1);
// Puts one cloud exactly where a test wants it and stops it drifting.
const park = (cloud, x, y, z) => Object.assign(cloud, { ux: 1, uz: 0, speed: 0, along: x - CLOUD_ZONE.x + CLOUD_STORM.span / 2, lane: z - CLOUD_ZONE.z, y });
// The pilot whose chest is exactly where this raven is.
const onto = (raven) => ({ x: raven.x, y: raven.y - CLOUD_STRIKE.rise, z: raven.z });
// What a sample says of the rising and sinking air, leaving the wind to its own tests.
const lifted = ({ lift, sink, liftSide }) => ({ lift, sink, liftSide });
const STILL = { lift: 0, sink: 0, liftSide: 0, windX: 0, windZ: 0, rough: 0 };
// Turns the lift off, so that nothing shelters the breeze being measured.
const becalm = (run) => run.state.thermals.forEach((thermal) => Object.assign(thermal, { live: false, strength: 0 }));
const yawOf = (x, z) => Math.atan2(x, -z);
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
// A point `along` metres down a gust band's line from the zone centre and `aside` to its right.
const inBand = (band, along, aside = 0, y = 700) => ({
  x: CLOUD_ZONE.x + band.ux * along - band.uz * (band.lane + aside), y, z: CLOUD_ZONE.z + band.uz * along + band.ux * (band.lane + aside),
});

test('a run is opt-in, tracks its final peak, and finish pauses every clock', () => {
  const run = createCloudbaseRun();
  run.step(1, position());
  assert.equal(run.state.active, false);
  assert.equal(run.state.elapsed, 0);
  run.reset(80);
  run.step(STEP, position(CLOUD_ZONE, 123));
  assert.equal(run.state.peak, 123);
  run.finish();
  const before = structuredClone(run.state);
  run.step(10, position(CLOUD_LAUNCH));
  assert.deepEqual(run.state, before);
});

test('render sampling does not consume a thermal, move a raven or advance fog', () => {
  const run = createCloudbaseRun();
  run.reset();
  const before = structuredClone(run.state);
  for (let i = 0; i < 120; i++) {
    assert.equal(run.sample(position(CLOUD_LAUNCH)).lift, CLOUD_LAUNCH.s);
    assert.equal(run.sample(position(run.state.thermals[1]), i).lift, CORE);
    run.depthAt(125, 600 + i, 238);
    run.windAt(125 + i, 600 + i, 238, {});
  }
  assert.deepEqual(run.state, before);
});

test('the launch column weakens after occupied turns and never regenerates during the run', () => {
  const run = createCloudbaseRun();
  run.reset();
  advance(run, 16, position(CLOUD_LAUNCH));
  assert.ok(Math.abs(run.sample(position(CLOUD_LAUNCH)).lift - 17) < 1e-8);
  advance(run, 5, position(CLOUD_LAUNCH));
  assert.ok(Math.abs(run.sample(position(CLOUD_LAUNCH)).lift - 8.5) < 1e-8);
  advance(run, 5.1, position(CLOUD_LAUNCH));
  assert.equal(run.sample(position(CLOUD_LAUNCH)).lift, 0);
  advance(run, 20, outside());
  assert.equal(run.sample(position(CLOUD_LAUNCH)).lift, 0);
  assert.equal(run.state.thermals[0].live, false);
});

test('retry clears the whole sky and the pilot without replacing render state', () => {
  const run = createCloudbaseRun();
  const { state } = run;
  const kept = [state.thermals, state.ravens, state.clouds, state.pilot, state.thermals[1], state.ravens[3], state.clouds[7]];
  run.reset(80, 5);
  advance(run, 27, position(state.thermals[1], 700));
  run.strike();
  advance(run, 60, position(state.thermals[2], 1100));
  run.finish();
  run.reset(80);
  assert.equal(run.state, state);
  assert.deepEqual([state.thermals, state.ravens, state.clouds, state.pilot, state.thermals[1], state.ravens[3], state.clouds[7]].map((part, i) => part === kept[i]), kept.map(() => true));
  const fresh = createCloudbaseRun();
  fresh.reset(80);
  assert.deepEqual(run.state, fresh.state);
  assert.equal(run.sample(position(CLOUD_LAUNCH)).lift, 17);
});

test('Cloudbase lift is restricted to its zone and keeps the normal ceiling irrelevant', () => {
  const run = createCloudbaseRun();
  run.reset();
  const edge = { x: CLOUD_ZONE.x + CLOUD_ZONE.r, z: CLOUD_ZONE.z };
  assert.equal(run.inside(edge), true);
  assert.equal(run.inside({ ...edge, x: edge.x + 0.01 }), false);
  assert.deepEqual(lifted(run.sample(position({ ...edge, x: edge.x + 1 }))), { lift: 0, sink: 0, liftSide: 0 });
  assert.equal(run.sample(position(CLOUD_LAUNCH)).lift, 17);
});

test('a hunted core peaks at its middle, so a light-brake circle round it rides 30% more than a hands-up one and a circle off it less, while the launch column stays flat and the wing still feels which side the core is on', () => {
  const run = createCloudbaseRun();
  run.reset(80, 2);
  const thermal = run.state.thermals[1];
  assert.equal(thermal.strength, 1);
  // The air `distance` from the middle, high above every cloud, by default out along the line from
  // the launch column through the middle, away from it, where no other lift reaches.
  const away = Math.atan2(thermal.x - CLOUD_LAUNCH.x, -(thermal.z - CLOUD_LAUNCH.z));
  const at = (distance, angle = away) => run.sample({ x: thermal.x + Math.sin(angle) * distance, y: 5000, z: thermal.z - Math.cos(angle) * distance });
  // A full-rate circle's radius is the wing's airspeed over its turn rate: 14.4 m hands up and 8.2 m
  // on the light brake. Centred on the middle, hands up rides the `s` every circle in the core rode
  // before the cores peaked, the light brake about 25 m/s, 30% more, and 20 m out there is only 13.
  const handsUp = FLIGHT.speed.trim / FLIGHT.turn.trim;
  const light = FLIGHT.speed.light / FLIGHT.turn.light;
  assert.equal(at(0).lift, CORE);
  assert.ok(Math.abs(at(handsUp).lift - CLOUD_HUNT.s) < 0.1, `${at(handsUp).lift.toFixed(2)} m/s round a centred hands-up circle`);
  assert.ok(Math.abs(at(light).lift - 25) < 0.1, `${at(light).lift.toFixed(2)} m/s round a centred light-brake circle`);
  assert.ok(Math.abs(at(light).lift / at(handsUp).lift - 1.3) < 0.01);
  assert.ok(Math.abs(at(20).lift - 13) < 0.1, `${at(20).lift.toFixed(2)} m/s 20 m out`);
  // The same all the way round, and less with every half metre off the middle, to none at the edge.
  for (let k = 1; k < 8; k++) assert.ok(Math.abs(at(light, away + (k * Math.PI) / 4).lift - at(light).lift) < 1e-9);
  for (let distance = 0.5; distance <= thermal.r; distance += 0.5) assert.ok(at(distance).lift < at(distance - 0.5).lift, `${distance} m out`);
  assert.ok(at(thermal.r).lift < 1e-9);
  assert.equal(at(thermal.r + 0.01).lift, 0);
  // The launch column is as it was: flat out to 45% of its radius, half at 72.5% and none at its edge.
  const column = (distance) => run.sample({ x: CLOUD_LAUNCH.x, y: 5000, z: CLOUD_LAUNCH.z + distance }).lift;
  for (const distance of [0, 5, 10, 15]) assert.equal(column(distance), CLOUD_LAUNCH.s);
  assert.ok(Math.abs(column(CLOUD_LAUNCH.r * 0.725) - CLOUD_LAUNCH.s / 2) < 1e-9);
  assert.equal(column(CLOUD_LAUNCH.r), 0);
  // And the wing feels the core's side as before: 10 m east of the middle, heading north the core
  // lies to the left, heading south to the right, a quarter of the radius over, and dead ahead west.
  const side = (yaw) => run.sample({ x: thermal.x + 10, y: 5000, z: thermal.z }, yaw).liftSide;
  assert.ok(Math.abs(side(0) + 10 / thermal.r) < 1e-12);
  assert.ok(Math.abs(side(Math.PI) - 10 / thermal.r) < 1e-12);
  assert.ok(Math.abs(side(-Math.PI / 2)) < 1e-12);
});

test('the gateway departure reaches the first core above the actual east-shore hillside under every sky', () => {
  const run = createCloudbaseRun();
  for (let seed = 1; seed <= 64; seed++) {
    run.reset(CLOUD_GATE.y, seed);
    const point = { x: 85, y: 80, z: 320 };
    let verticalSpeed = 0;
    let minimumClearance = Infinity;
    // Reference trim approach: 11.5 m/s forward, 1.2 m/s sink, with the wing taking 0.4 s to
    // settle into lift. Check the route against real terrain, rather than only testing air in
    // isolation. Normal-flight ground damping must not be added to Cloudbase's dedicated air.
    for (let i = 0; i < 300; i++) {
      const air = run.sample(point, Math.PI / 2);
      verticalSpeed += (air.lift - 1.2 - air.sink - verticalSpeed) / 24;
      point.x += 11.5 / 60;
      point.y += verticalSpeed / 60;
      assert.equal(run.step(STEP, point), null);
      minimumClearance = Math.min(minimumClearance, point.y - surfaceAt(point.x, point.z));
    }
    assert.ok(point.x > CLOUD_LAUNCH.x, 'the pilot passes the launch column centre');
    assert.ok(point.y > 125, 'the launch column establishes a climb');
    assert.ok(minimumClearance > 15, `the approach clears the hillside by ${minimumClearance.toFixed(1)} m`);
    assert.equal(run.state.pilot.strikes, 0);
    assert.equal(run.state.pilot.cloudTime, 0);
  }
});

test('fixed-step runs are deterministic regardless of render sample frequency', () => {
  const a = createCloudbaseRun();
  const b = createCloudbaseRun();
  a.reset(80, 7);
  b.reset(80, 7);
  for (let i = 0; i < 3600; i++) {
    const slot = 1 + (Math.floor(i / 600) % 2);
    const point = position(a.state.thermals[slot], 500 + i * 0.1);
    a.step(STEP, point);
    for (let j = 0; j < i % 3; j++) b.sample(point, 0.4);
    b.step(STEP, position(b.state.thermals[slot], 500 + i * 0.1));
  }
  assert.deepEqual(a.state, b.state);
});

test('rising fog catches even an uninterrupted maximum climb before three minutes', () => {
  const run = createCloudbaseRun();
  run.reset();
  let reason = null;
  let seconds = 0;
  for (let i = 1; i <= 180 * 60 && !reason; i++) {
    seconds = i / 60;
    reason = run.step(STEP, position(CLOUD_ZONE, 80 + seconds * 17));
  }
  assert.equal(reason, 'fog');
  assert.ok(seconds < 180);
  assert.equal(run.state.active, false);
  assert.ok(Math.abs(run.state.peak - (80 + seconds * 17)) < 1e-8);
});

test('fog catches at its surface tolerance and does not lose the last altitude sample', () => {
  const run = createCloudbaseRun();
  run.reset(0);
  assert.equal(run.step(STEP, position(CLOUD_ZONE, 3)), 'fog');
  assert.equal(run.state.peak, 3);
  assert.equal(run.state.active, false);
});

test('the same seed lays out the same sky and a different seed lays out another', () => {
  const a = createCloudbaseRun();
  const b = createCloudbaseRun();
  const c = createCloudbaseRun();
  a.reset(80, 42);
  b.reset(80, 42);
  c.reset(80, 43);
  assert.deepEqual(a.state, b.state);
  assert.notDeepEqual(a.state.thermals, c.state.thermals);
  assert.notDeepEqual(a.state.clouds, c.state.clouds);
  assert.equal(CLOUD_STORM.counts.reduce((sum, count) => sum + count, 0), CLOUD_POOL.clouds);
  assert.equal(CLOUD_STORM.counts.length, CLOUD_STORM.layers.length);
  assert.equal(a.state.ravens.length, CLOUD_RAVENS.flock * (CLOUD_POOL.thermals - 1));
});

test('every hunted site keeps its margin, its distance from the launch column and from the other site, and each move is a real hop', () => {
  const run = createCloudbaseRun();
  let moves = 0;
  const turns = new Set();
  for (let seed = 1; seed <= 16; seed++) {
    run.reset(80, seed);
    const moving = [false, false, false];
    const dirs = run.state.thermals.map((thermal) => thermal.dir);
    dirs.slice(1).forEach((dir) => turns.add(dir));
    for (let i = 0; i < 170 * 60; i++) {
      // Ride whichever hunted thermal is rising, to wear each one out in turn.
      const target = hunted(run).find((thermal) => thermal.live) ?? CLOUD_ZONE;
      run.step(STEP, position(target));
      const [, first, second] = run.state.thermals;
      assert.ok(between(first, second) >= CLOUD_HUNT.separation - 1e-9);
      for (const [slot, thermal] of [[1, first], [2, second]]) {
        assert.ok(between(thermal, CLOUD_ZONE) <= CLOUD_ZONE.r - CLOUD_HUNT.margin + 1e-9);
        assert.ok(between(thermal, CLOUD_LAUNCH) >= CLOUD_HUNT.launchClear - 1e-9);
        if (thermal.move > 0 && !moving[slot]) {
          moves++;
          assert.ok(Math.hypot(thermal.x - thermal.fromX, thermal.z - thermal.fromZ) >= CLOUD_HUNT.hop - 1e-9);
        }
        moving[slot] = thermal.move > 0;
        assert.equal(thermal.dir, dirs[slot], 'a flock turns the same way wherever it goes');
      }
    }
  }
  assert.ok(moves >= 16 * 4, `${moves} moves seen`);
  assert.deepEqual([...turns].sort(), [-1, 1], 'flocks turn either way');
});

test('a relocated thermal gives no lift until its ravens arrive, then blooms', () => {
  const run = createCloudbaseRun();
  run.reset(80, 2);
  const thermal = run.state.thermals[1];
  const old = { x: thermal.x, z: thermal.z };
  advance(run, CLOUD_WEAR.dead + 0.1, position(old));
  assert.ok(thermal.move > 0);
  assert.equal(thermal.live, false);
  assert.ok(between(thermal, old) >= CLOUD_HUNT.hop - 1e-9);
  assert.equal(run.sample(position(old)).lift, 0);
  let flying = 0;
  while (thermal.move > 0) {
    assert.equal(run.sample(position(thermal)).lift, 0);
    run.step(STEP, outside());
    flying += STEP;
  }
  assert.ok(flying > 5 && flying < 20, `the flock flew for ${flying.toFixed(1)} s`);
  assert.equal(thermal.live, true);
  assert.equal(run.sample(position(thermal)).lift, 0);
  advance(run, CLOUD_HUNT.bloom + 0.1, outside());
  assert.ok(Math.abs(run.sample(position(thermal)).lift - CORE) < 1e-8);
});

test('a thermal that has begun to fade burns out even after the pilot leaves', () => {
  const run = createCloudbaseRun();
  run.reset(80, 3);
  const thermal = run.state.thermals[1];
  const site = { x: thermal.x, z: thermal.z };
  advance(run, CLOUD_WEAR.full + 1, position(site));
  assert.equal(thermal.move, 0);
  advance(run, CLOUD_WEAR.dead - CLOUD_WEAR.full, outside());
  assert.ok(between(thermal, site) >= CLOUD_HUNT.hop - 1e-9);
});

test('two half-used thermals still age out instead of waiting for each other for ever', () => {
  const run = createCloudbaseRun();
  run.reset(80, 4);
  const sites = hunted(run).map((thermal) => ({ x: thermal.x, z: thermal.z }));
  advance(run, 8, position(sites[0]));
  advance(run, 8, position(sites[1]));
  advance(run, 150, outside());
  hunted(run).forEach((thermal, i) => assert.ok(between(thermal, sites[i]) > 1, `thermal ${i + 1} moved on`));
});

test('an unused thermal ages out and moves, but never leaves the sky without good lift', () => {
  const run = createCloudbaseRun();
  for (let seed = 1; seed <= 8; seed++) {
    run.reset(80, seed);
    const sites = hunted(run).map((thermal) => ({ x: thermal.x, z: thermal.z }));
    for (let i = 0; i < 240 * 60; i++) {
      run.step(STEP, outside(1e6));
      assert.ok(hunted(run).some((thermal) => thermal.live && thermal.strength >= 0.5));
    }
    hunted(run).forEach((thermal, i) => assert.ok(between(thermal, sites[i]) > 1));
  }
});

test('ravens stay in their orbit band around settled lift and inside the stack around the pilot', () => {
  const run = createCloudbaseRun();
  run.reset(80, 6);
  for (let i = 0; i < 40 * 60; i++) {
    const altitude = 300 + i * 0.2;
    run.step(STEP, outside(altitude));
    const low = Math.max(altitude - CLOUD_RAVENS.below, CLOUD_RAVENS.floor, run.state.fogHeight + 12);
    for (const raven of run.state.ravens) {
      const thermal = run.state.thermals[raven.thermal];
      assert.ok(raven.y >= low - 1e-9 && raven.y <= low + CLOUD_RAVENS.stack + 1e-9);
      assert.ok(raven.fade >= 0 && raven.fade <= 1);
      if (thermal.move > 0) continue;
      const reach = between(raven, thermal);
      assert.ok(reach >= CLOUD_RAVENS.orbit[0] - 1e-6 && reach <= CLOUD_RAVENS.orbit[1] + 1e-6);
      // Beak along the circle, the way the flock turns, and the inside wing down.
      const along = Math.atan2(raven.x - thermal.x, -(raven.z - thermal.z)) + (thermal.dir * Math.PI) / 2;
      assert.ok(Math.cos(raven.heading - along) > 0.999);
      assert.equal(Math.sign(raven.bank), thermal.dir);
    }
  }
});

test('the ladder of ravens climbs at half the lift of its thermal', () => {
  const run = createCloudbaseRun();
  run.reset(80, 6);
  const thermal = run.state.thermals[1];
  const from = thermal.rise;
  advance(run, 5, outside());
  assert.equal(thermal.strength, 1);
  assert.ok(Math.abs(thermal.rise - from - CLOUD_RAVENS.climb * CLOUD_HUNT.s * 5) < 1e-6);
});

test('a raven strike collapses the wing, cuts lift, adds the collapse sink and starts the shield', () => {
  const run = createCloudbaseRun();
  run.reset(300, 8);
  run.step(STEP, outside(300));
  const raven = run.state.ravens.find((candidate) => candidate.hot);
  assert.ok(raven);
  const flock = run.state.thermals[raven.thermal];
  run.step(STEP, onto(raven));
  const { pilot } = run.state;
  assert.equal(pilot.strikes, 1);
  assert.equal(pilot.collapse, CLOUD_STRIKE.collapse);
  assert.equal(pilot.shield, CLOUD_STRIKE.shield);
  assert.equal(flock.scatter, CLOUD_STRIKE.shield);
  assert.deepEqual(lifted(run.sample(position(flock, 300))), { lift: 0, sink: CLOUD_STRIKE.sink, liftSide: 0 });
  assert.equal(run.sample(outside(300)).sink, CLOUD_STRIKE.sink);
  advance(run, CLOUD_STRIKE.collapse + STEP, outside(300));
  assert.equal(pilot.collapse, 0);
  assert.ok(pilot.shield > 0);
  assert.equal(run.sample(position(flock, 300)).lift, CORE);
});

test('a strike reaches exactly as far as the cylinder around the pilot and no further', () => {
  // A step too short for anything to move, with the pilot offset from a raven that can strike.
  const struckAt = (aside, above) => {
    const run = createCloudbaseRun();
    run.reset(300, 8);
    run.step(STEP, outside(300));
    const raven = run.state.ravens.find((candidate) => candidate.hot);
    run.step(1e-6, { x: raven.x + aside, y: raven.y - CLOUD_STRIKE.rise - above, z: raven.z });
    return run.state.pilot.strikes;
  };
  assert.equal(struckAt(CLOUD_STRIKE.radius - 0.05, 0), 1);
  assert.equal(struckAt(CLOUD_STRIKE.radius + 0.05, 0), 0);
  assert.equal(struckAt(0, CLOUD_STRIKE.half - 0.05), 1);
  assert.equal(struckAt(0, CLOUD_STRIKE.half + 0.05), 0);
  assert.equal(struckAt(0, -CLOUD_STRIKE.half + 0.05), 1);
  assert.equal(struckAt(0, -CLOUD_STRIKE.half - 0.05), 0);
});

test('a struck flock scatters, settles and can strike again once the shield is gone', () => {
  const run = createCloudbaseRun();
  run.reset(300, 8);
  run.step(STEP, outside(300));
  const first = run.state.ravens.find((candidate) => candidate.hot);
  const flock = run.state.thermals[first.thermal];
  run.step(STEP, onto(first));
  assert.equal(run.state.pilot.strikes, 1);
  assert.ok(run.state.ravens.filter((raven) => raven.thermal === first.thermal).every((raven) => !raven.hot));
  // Scattered birds are flung wide of their orbits, and come back.
  advance(run, 1, outside(300));
  assert.ok(run.state.ravens.some((raven) => raven.thermal === first.thermal && between(raven, flock) > CLOUD_RAVENS.orbit[1] + 1));
  let waited = 0;
  while ((run.state.pilot.shield > 0 || flock.scatter > 0) && waited++ < 600) run.step(STEP, outside(300));
  assert.ok(waited < 600);
  run.step(STEP, outside(300));
  const again = run.state.ravens.find((raven) => raven.thermal === first.thermal && raven.hot);
  assert.ok(again, 'the flock is armed again');
  run.step(STEP, onto(again));
  assert.equal(run.state.pilot.strikes, 2);
});

test('a second raven cannot strike while the shield lasts', () => {
  const run = createCloudbaseRun();
  run.reset(300, 8);
  run.step(STEP, outside(300));
  const first = run.state.ravens.find((candidate) => candidate.hot);
  run.step(STEP, onto(first));
  assert.equal(run.state.pilot.strikes, 1);
  // Sit on a bird of the other flock, which was not scattered, for almost the whole shield.
  const second = run.state.ravens.find((candidate) => candidate.thermal !== first.thermal && candidate.rung === 2);
  for (let i = 0; i < (CLOUD_STRIKE.shield - 0.5) * 60; i++) run.step(STEP, onto(second));
  assert.equal(run.state.pilot.strikes, 1);
  assert.equal(run.strike(), false);
  for (let i = 0; i < 60 && run.state.pilot.strikes === 1; i++) run.step(STEP, onto(second));
  assert.equal(run.state.pilot.strikes, 2);
});

test('the lowest point within five seconds of a strike in a full core is about sixty metres down', () => {
  const run = createCloudbaseRun();
  run.reset(300);
  const point = position(CLOUD_LAUNCH, 300);
  let verticalSpeed = 0;
  // The reference wing circling in the core: trim sink plus the sink of a full-rate turn.
  const fly = (seconds) => {
    let lowest = point.y;
    for (let i = 0; i < seconds * 60; i++) {
      const air = run.sample(point, 0);
      verticalSpeed += (air.lift - 1.2 - 0.64 - air.sink - verticalSpeed) * Math.min(1, STEP * 2.5);
      point.y += verticalSpeed * STEP;
      run.step(STEP, point);
      lowest = Math.min(lowest, point.y);
    }
    return lowest;
  };
  fly(3);
  assert.ok(verticalSpeed > 15);
  const from = point.y;
  assert.equal(run.strike(), true);
  const drop = from - fly(5);
  assert.ok(drop > 48 && drop < 62, `the strike cost ${drop.toFixed(1)} m`);
  assert.ok(verticalSpeed > 10, 'and the climb is under way again');
});

test('ravens in transit, newly arrived, scattered, fading in or low over the hill cannot strike', () => {
  const run = createCloudbaseRun();
  run.reset(80, 9);
  const check = () => {
    for (const raven of run.state.ravens) {
      const thermal = run.state.thermals[raven.thermal];
      const safe = thermal.move > 0 || !thermal.live || thermal.age < CLOUD_RAVENS.settle || thermal.scatter > 0 || raven.fade < 1 || run.state.pilot.y < CLOUD_RAVENS.grace;
      if (safe) assert.equal(raven.hot, false);
      if (raven.threat) assert.equal(raven.hot, true);
    }
  };
  // Low over the launch hill nothing is armed, whatever is overhead.
  for (let i = 0; i < 10 * 60; i++) {
    run.step(STEP, position(run.state.thermals[1], 120 + i * 0.2));
    check();
    if (run.state.pilot.y < CLOUD_RAVENS.grace) assert.ok(run.state.ravens.every((raven) => !raven.hot));
  }
  // Wear one thermal out so that its flock leaves, arrives and settles, with a strike on the way.
  let sawTransit = false;
  let sawArrival = false;
  for (let i = 0; i < 80 * 60; i++) {
    const thermal = run.state.thermals[1];
    run.step(STEP, position(thermal.live ? thermal : CLOUD_ZONE, 400));
    if (i === 600) run.strike(0);
    sawTransit ||= thermal.move > 0;
    sawArrival ||= sawTransit && thermal.live && thermal.age < CLOUD_RAVENS.settle;
    check();
  }
  assert.ok(sawTransit && sawArrival);
  // And the flag is what counts: sitting on a full-sized bird below the grace height does nothing.
  run.reset(220, 8);
  run.step(STEP, outside(220));
  const low = run.state.ravens.find((raven) => raven.fade >= 1 && onto(raven).y < CLOUD_RAVENS.grace - 5);
  assert.ok(low);
  let sat = 0;
  while (onto(low).y < CLOUD_RAVENS.grace && sat < 60) {
    run.step(STEP, onto(low));
    sat++;
  }
  assert.ok(sat >= 20, `sat on the bird for ${sat} steps`);
  assert.equal(run.state.pilot.strikes, 0);
});

test('a raven close above the pilot is a threat and one already passed is not', () => {
  const run = createCloudbaseRun();
  run.reset(300, 8);
  run.step(STEP, outside(300));
  const raven = run.state.ravens.find((candidate) => candidate.hot);
  const under = onto(raven);
  run.step(STEP, { ...under, y: under.y - 15 });
  assert.equal(raven.threat, true);
  assert.equal(run.state.pilot.danger, 1);
  assert.equal(run.state.pilot.strikes, 0);
  run.step(STEP, { ...onto(raven), y: onto(raven).y + 15 });
  assert.equal(raven.threat, false);
  assert.equal(run.state.pilot.danger, 0);
  run.step(STEP, { ...onto(raven), x: onto(raven).x + CLOUD_STRIKE.warn.reach + 1, y: onto(raven).y - 15 });
  assert.equal(raven.threat, false);
  // Level with the pilot, or a little below, it can still strike from the side: still marked.
  const beside = CLOUD_STRIKE.radius + 1;
  run.step(STEP, { ...onto(raven), x: onto(raven).x + beside, y: onto(raven).y + CLOUD_STRIKE.half - 1 });
  assert.equal(raven.threat, true);
  assert.equal(run.state.pilot.strikes, 0);
  run.step(STEP, { ...onto(raven), x: onto(raven).x + beside, y: onto(raven).y + CLOUD_STRIKE.half + 1 });
  assert.equal(raven.threat, false);
});

test('a pilot inside a cloud cannot be struck, and the lift a cloud is capping does not wear', () => {
  const run = createCloudbaseRun();
  run.reset(300, 8);
  run.step(STEP, outside(300));
  const raven = run.state.ravens.find((candidate) => candidate.hot);
  const thermal = run.state.thermals[raven.thermal];
  const cloud = run.state.clouds[0];
  // A cloud brought down over the whole thermal, far below where any is laid out.
  park(cloud, thermal.x, raven.y, thermal.z);
  for (let i = 0; i < 3 * 60; i++) {
    park(cloud, thermal.x, raven.y, thermal.z);
    run.step(STEP, onto(raven));
    assert.ok(run.state.pilot.cloud > CLOUD_STRIKE.cover);
  }
  assert.equal(run.state.pilot.strikes, 0);
  assert.equal(thermal.wear, 0);
  assert.ok(Math.abs(run.state.pilot.cloudTime - 3) < 1e-6);
  park(cloud, thermal.x, 5000, thermal.z);
  run.step(STEP, onto(raven));
  assert.equal(run.state.pilot.strikes, 1);
  assert.ok(thermal.wear > 0);
});

test('a cloud cuts lift and adds sink by depth and does nothing outside its shell', () => {
  const run = createCloudbaseRun();
  run.reset(80, 10);
  const thermal = run.state.thermals[1];
  const cloud = run.state.clouds[0];
  park(cloud, thermal.x, 700, thermal.z);
  run.step(STEP, outside());
  const chest = (y) => ({ x: thermal.x, y: y - CLOUD_STRIKE.rise, z: thermal.z });
  assert.equal(cloud.fade, 1);
  assert.deepEqual(lifted(run.sample(chest(700))), { lift: 0, sink: CLOUD_STORM.sink, liftSide: 0 });
  assert.equal(run.depthAt(thermal.x, 700, thermal.z), 1);
  // 6% of the way in from the underside: a fifth of the edge, which already takes a quarter of the lift.
  const shallow = run.sample(chest(700 - cloud.ry * 0.94));
  const depth = 0.2 * 0.2 * (3 - 2 * 0.2);
  assert.ok(Math.abs(shallow.lift - CORE * (1 - depth * CLOUD_STORM.cap)) < 1e-6);
  assert.ok(Math.abs(shallow.sink - CLOUD_STORM.sink * depth) < 1e-6);
  // Lift is gone well before the heart of the cloud, so a capped pilot tops out near its base.
  assert.equal(run.sample(chest(700 - cloud.ry * 0.8)).lift, 0);
  assert.deepEqual(lifted(run.sample(chest(700 - cloud.ry - 1))), { lift: CORE, sink: 0, liftSide: 0 });
  run.step(STEP, chest(700 - cloud.ry - 30));
  assert.ok(Math.abs(run.state.pilot.headroom - 30) < 1e-6);
  run.step(STEP, outside(700));
  assert.equal(run.state.pilot.headroom, 999);
  // The hazard is turned with the cloud: a quarter of a turn's half, and its long axis points
  // between east and north, not between east and south.
  Object.assign(cloud, { rx: 40, ry: 20, rz: 20, turn: Math.PI / 4, cos: Math.SQRT1_2, sin: Math.SQRT1_2 });
  const far = 0.9 * 40 * Math.SQRT1_2;
  assert.ok(run.depthAt(thermal.x + far, 700, thermal.z - far) > 0);
  assert.equal(run.depthAt(thermal.x + far, 700, thermal.z + far), 0);
  // A cloud pulls down wherever it is, though there is no lift to cut outside the zone.
  const beyond = outside(700 - CLOUD_STRIKE.rise);
  park(cloud, beyond.x, 700, beyond.z);
  run.step(STEP, outside());
  assert.deepEqual(lifted(run.sample(beyond)), { lift: 0, sink: CLOUD_STORM.sink, liftSide: 0 });
  const calm = createCloudbaseRun({ hazards: false });
  calm.reset(80, 10);
  park(calm.state.clouds[0], calm.state.thermals[1].x, 700, calm.state.thermals[1].z);
  calm.step(STEP, outside());
  assert.equal(calm.sample(chest(700)).lift, CORE);
});

test('no cloud hazard lies within 70 m below a milestone or below the cloud floor, and clouds come round outside the zone', () => {
  const run = createCloudbaseRun();
  // Each cloud rides its layer's wind in a straight line, and is only ever moved back to the
  // start of its lane while there is nothing of it to see.
  run.reset(80, 5);
  run.step(STEP, outside(1e6));
  const before = run.state.clouds.map((cloud) => ({ x: cloud.x, z: cloud.z, fade: cloud.fade }));
  let wraps = 0;
  for (let i = 0; i < 800; i++) {
    run.step(0.25, outside(1e6));
    run.state.clouds.forEach((cloud, n) => {
      const moved = Math.hypot(cloud.x - before[n].x, cloud.z - before[n].z);
      if (moved > 100) {
        wraps++;
        assert.ok(cloud.fade < 0.05 && before[n].fade < 0.05, 'a cloud came round while it could be seen');
      } else {
        assert.ok(Math.abs(moved - cloud.speed * 0.25) < 1e-6);
        assert.ok(Math.abs((cloud.x - before[n].x) * cloud.uz - (cloud.z - before[n].z) * cloud.ux) < 1e-6, 'along the wind');
      }
      Object.assign(before[n], { x: cloud.x, z: cloud.z, fade: cloud.fade });
    });
  }
  assert.ok(wraps > 20, `${wraps} clouds came round`);
  for (let seed = 1; seed <= 64; seed++) {
    run.reset(80, seed);
    for (let second = 0; second < 150; second += 10) {
      // Clouds drift by the clock alone, so one long step moves them as far as many short ones.
      run.step(second ? 10 : STEP, outside(1e6));
      for (const cloud of run.state.clouds) {
        assert.ok(cloud.y - cloud.ry >= CLOUD_STORM.floor - 1e-9);
        for (const milestone of CLOUD_MILESTONES) assert.ok(cloud.y - cloud.ry >= milestone || cloud.y + cloud.ry <= milestone - 70);
        // Anything less than fully grown is clear of the zone, hull and all.
        if (cloud.fade < 1) assert.ok(between(cloud, CLOUD_ZONE) - cloud.rx > CLOUD_ZONE.r);
      }
    }
  }
});

test('the launch climb meets no cloud and no raven under any sky', () => {
  const run = createCloudbaseRun();
  for (let seed = 1; seed <= 64; seed++) {
    run.reset(80, seed);
    for (let i = 0; i < 26 * 60; i++) {
      // A sloppy circle in the launch column, out to its very edge.
      const angle = i * 0.8 * STEP;
      const reach = (CLOUD_LAUNCH.r * (i % 600)) / 600;
      run.step(STEP, { x: CLOUD_LAUNCH.x + Math.sin(angle) * reach, y: 80 + i * 0.25, z: CLOUD_LAUNCH.z - Math.cos(angle) * reach });
      assert.equal(run.state.pilot.danger, 0);
    }
    assert.equal(run.state.pilot.strikes, 0);
    assert.equal(run.state.pilot.cloudTime, 0);
  }
});

test('every pooled number stays finite, and no pool changes length or contents', () => {
  const run = createCloudbaseRun();
  const { state } = run;
  const parts = [...state.thermals, ...state.ravens, ...state.clouds, ...state.wind, ...state.gusts, state.pilot];
  const finite = () => {
    assert.ok(Number.isFinite(state.gustDue) && Number.isFinite(state.gustCount));
    for (const part of parts) {
      for (const [key, value] of Object.entries(part)) {
        if (typeof value === 'number' && key !== 'life') assert.ok(Number.isFinite(value), `${key} is ${value}`);
      }
    }
  };
  for (let seed = 1; seed <= 64; seed++) {
    run.reset(80, seed);
    finite();
    for (let i = 0; i < 60 * 60; i++) {
      const thermal = state.thermals[1 + (seed % 2)];
      run.step(STEP, position(thermal.live ? thermal : CLOUD_ZONE, 300 + i * 0.3));
      if (i % 60 === 0) finite();
    }
  }
  assert.deepEqual([state.thermals.length, state.ravens.length, state.clouds.length, state.gusts.length], [CLOUD_POOL.thermals, CLOUD_POOL.ravens, CLOUD_POOL.clouds, CLOUD_POOL.gusts]);
  assert.equal(state.wind.length, CLOUD_STORM.layers.length);
  assert.deepEqual([...state.thermals, ...state.ravens, ...state.clouds, ...state.wind, ...state.gusts, state.pilot].map((part, i) => part === parts[i]), parts.map(() => true));
});

test('finishing a run clears the collapse, the cloud and the thermal the pilot was in, and keeps the score', () => {
  const run = createCloudbaseRun();
  run.reset(300, 8);
  const thermal = run.state.thermals[1];
  park(run.state.clouds[0], thermal.x, 300 + CLOUD_STRIKE.rise, thermal.z);
  advance(run, 2, position(thermal, 300));
  park(run.state.clouds[0], thermal.x, 5000, thermal.z);
  // A gust on its way to the pilot as well.
  run.gust(0);
  run.step(STEP, position(thermal, 300));
  run.strike();
  const { pilot } = run.state;
  assert.equal(pilot.thermal, 1);
  assert.ok(pilot.collapse > 0 && pilot.cloudTime > 1.9);
  assert.ok(pilot.gustAhead < 999 && pilot.gustIn < 99 && pilot.gustSlot >= 0);
  assert.notDeepEqual(run.windAt(thermal.x, 300, thermal.z, {}), { x: 0, z: 0, front: 0, rough: 0 });
  run.finish();
  assert.deepEqual({ ...pilot }, {
    x: thermal.x, y: 300, z: thermal.z, collapse: 0, shield: 0, cloud: 0, cloudTime: pilot.cloudTime, strikes: 1, thermal: -1,
    danger: 0, headroom: pilot.headroom, gustAhead: 999, gustIn: 99, gustSlot: -1,
  });
  assert.ok(run.state.ravens.every((raven) => !raven.threat));
  assert.equal(run.strike(), false);
  // With the run over the air is dead still: no lift, no wind, and nothing for the streaks.
  assert.deepEqual(run.sample(position(CLOUD_LAUNCH)), STILL);
  assert.deepEqual(run.windAt(thermal.x, 300, thermal.z, { x: 4, z: 4, front: 1, rough: 1 }), { x: 0, z: 0, front: 0, rough: 0 });
});

test('reopen brings a fold back sooner, never past open, and does nothing to an open wing or an ended run', () => {
  const run = createCloudbaseRun({ hazards: false });
  run.reset(700, 3);
  const { pilot } = run.state;
  assert.equal(run.reopen(CLOUD_STRIKE.pump.cut), false, 'an open wing');
  assert.equal(run.strike(), true);
  const shield = pilot.shield;
  assert.equal(run.reopen(CLOUD_STRIKE.pump.cut), true);
  assert.ok(Math.abs(pilot.collapse - (CLOUD_STRIKE.collapse - CLOUD_STRIKE.pump.cut)) < 1e-12);
  assert.equal(pilot.shield, shield, 'the shield stays up as it was');
  for (const nothing of [0, -1, Number.NaN]) assert.equal(run.reopen(nothing), false);
  assert.equal(run.reopen(10), true);
  assert.equal(pilot.collapse, 0, 'never past open');
  assert.equal(run.reopen(CLOUD_STRIKE.pump.cut), false);
  // Once the run is over nothing is reopened.
  const ended = createCloudbaseRun({ hazards: false });
  ended.reset(700, 3);
  ended.strike();
  ended.finish();
  assert.equal(ended.reopen(CLOUD_STRIKE.pump.cut), false);
});

test('a sample can be written into the caller\'s own object, and carries the wind and the gust on the tail', () => {
  const run = createCloudbaseRun();
  const out = { lift: 9, sink: 9, liftSide: 9, windX: 9, windZ: 9, rough: 9 };
  assert.equal(run.sample(position(), 0, out), out);
  assert.deepEqual(out, STILL);
  run.reset(80, 3);
  const point = position(run.state.thermals[1], 700);
  assert.equal(run.sample(point, 0.4, out), out);
  assert.deepEqual(out, run.sample(point, 0.4));
  assert.deepEqual(Object.keys(out), Object.keys(STILL));
  assert.equal(out.lift, CORE);
  assert.ok(Math.hypot(out.windX, out.windZ) > 0.5);
  assert.equal(out.rough, 0);
});

test('each cloud layer has one wind of 2 to 4 m/s, within a short turn of the layer below, and its clouds ride exactly that wind', () => {
  const run = createCloudbaseRun();
  let widest = 0;
  for (let seed = 1; seed <= 48; seed++) {
    run.reset(80, seed);
    let n = 0;
    CLOUD_STORM.layers.forEach((y, layer) => {
      const level = run.state.wind[layer];
      const speed = Math.hypot(level.x, level.z);
      assert.equal(level.y, y);
      assert.ok(speed >= CLOUD_STORM.wind[0] && speed <= CLOUD_STORM.wind[1]);
      if (layer > 0) {
        const below = run.state.wind[layer - 1];
        const turned = Math.abs(wrapAngle(yawOf(level.x, level.z) - yawOf(below.x, below.z)));
        assert.ok(turned <= CLOUD_WIND.walk + 1e-9);
        widest = Math.max(widest, turned);
      }
      for (let i = 0; i < CLOUD_STORM.counts[layer]; i++, n++) {
        const cloud = run.state.clouds[n];
        assert.ok(Math.abs(cloud.ux * cloud.speed - level.x) < 1e-12 && Math.abs(cloud.uz * cloud.speed - level.z) < 1e-12);
      }
    });
    assert.equal(n, CLOUD_POOL.clouds);
    // Over the whole climb the wind does come round: the top layer is rarely where the bottom was.
  }
  assert.ok(widest > CLOUD_WIND.walk * 0.9);
});

test('laying out the wind moved no thermal, raven or cloud of any sky', () => {
  // Measured before the wind was added: the generator's counter after the layout, and one number
  // from each pool. Only the way the clouds above the first layer drift was meant to change.
  const before = [
    [1, -1989753406, 214.77566837188158, 148.88020504824243, 167.10676052607596, 3.4311366709231748],
    [7, -853964454, 128.81871790712313, 239.4251724459985, 316.9571200106293, 2.2429778629510935],
    [42, -1357917695, 148.0165180624817, 286.7758947711689, 371.0048396605998, 4.9231728398756465],
  ];
  const run = createCloudbaseRun();
  for (const [seed, counter, x, z, along, angle] of before) {
    run.reset(80, seed);
    const { state } = run;
    assert.equal(state.rng, counter);
    assert.deepEqual([state.thermals[1].x, state.thermals[2].z, state.clouds[20].along, state.ravens[7].angle], [x, z, along, angle]);
  }
});

test('the breeze turns evenly between layers, is the lowest layer\'s below it, and the launch hill keeps it off', () => {
  const run = createCloudbaseRun();
  run.reset(80, 3);
  becalm(run);
  const at = (y) => run.windAt(CLOUD_ZONE.x, y, CLOUD_ZONE.z, {});
  const levels = run.state.wind;
  const near = (wind, x, z) => assert.ok(Math.abs(wind.x - x) < 1e-12 && Math.abs(wind.z - z) < 1e-12, `${wind.x}, ${wind.z} is not ${x}, ${z}`);
  levels.forEach((level) => near(at(level.y), level.x, level.z));
  for (let i = 0; i < levels.length - 1; i++) {
    const [low, high] = [levels[i], levels[i + 1]];
    near(at((low.y + high.y) / 2), (low.x + high.x) / 2, (low.z + high.z) / 2);
    near(at(low.y + (high.y - low.y) / 4), low.x + (high.x - low.x) / 4, low.z + (high.z - low.z) / 4);
  }
  const [first, top] = [levels[0], levels[levels.length - 1]];
  near(at(5000), top.x, top.z);
  near(at(400), first.x, first.z);
  near(at(CLOUD_WIND.lee[1]), first.x, first.z);
  // Half-way up the lee half of it gets through, and at the gate and low in the launch column none.
  near(at((CLOUD_WIND.lee[0] + CLOUD_WIND.lee[1]) / 2), first.x / 2, first.z / 2);
  for (const y of [CLOUD_WIND.lee[0], CLOUD_GATE.y, 0]) assert.deepEqual(at(y), { x: 0, z: 0, front: 0, rough: 0 });
  const low = at(150);
  assert.ok(Math.hypot(low.x, low.z) > 0 && Math.hypot(low.x, low.z) < 0.2 * Math.hypot(first.x, first.z));
});

test('rising air shelters the pilot from two thirds of the breeze, whatever a cloud or a folded wing does to the lift', () => {
  const run = createCloudbaseRun();
  run.reset(300, 8);
  run.step(STEP, outside(300));
  const thermal = run.state.thermals[1];
  const top = run.state.wind[run.state.wind.length - 1];
  const open = 1 - CLOUD_WIND.shelter;
  const felt = (distance, y = 5000) => run.sample({ x: thermal.x, y, z: thermal.z + distance }, 0);
  const near = (air, share) => assert.ok(Math.abs(air.windX - top.x * share) < 1e-9 && Math.abs(air.windZ - top.z * share) < 1e-9, `${air.windX}, ${air.windZ}`);
  assert.equal(thermal.strength, 1);
  near(felt(0), open);
  // The full strength of the core reaches 45% of the way out; by the edge the wind is all back.
  near(felt(thermal.r * 0.44), open);
  near(felt(thermal.r), 1);
  const part = felt(thermal.r * 0.725);
  near(part, 1 - CLOUD_WIND.shelter * 0.5);
  // A pilot sliding out of the core feels the wind come back steadily, never in a step.
  let last = open;
  for (let distance = 0; distance <= thermal.r + 5; distance += 0.5) {
    const share = Math.hypot(felt(distance).windX, felt(distance).windZ) / Math.hypot(top.x, top.z);
    assert.ok(share >= last - 1e-9 && share - last < 0.03);
    last = share;
  }
  assert.ok(Math.abs(last - 1) < 1e-9);
  // A weaker thermal shelters less.
  thermal.strength = 0.5;
  near(felt(0), 1 - CLOUD_WIND.shelter * 0.5);
  thermal.strength = 1;
  // A cloud over the core takes the lift and leaves the shelter: the air there is still rising.
  park(run.state.clouds[0], thermal.x, 700, thermal.z);
  run.step(STEP, outside(300));
  const capped = run.sample({ x: thermal.x, y: 700 - CLOUD_STRIKE.rise, z: thermal.z }, 0);
  assert.equal(capped.lift, 0);
  const here = run.windAt(thermal.x, 700 - CLOUD_STRIKE.rise, thermal.z, {});
  becalm(run);
  const bare = run.windAt(thermal.x, 700 - CLOUD_STRIKE.rise, thermal.z, {});
  assert.ok(Math.abs(capped.windX - bare.x * open) < 1e-9 && Math.abs(capped.windZ - bare.z * open) < 1e-9);
  assert.ok(Math.abs(here.x - capped.windX) < 1e-12 && Math.abs(here.z - capped.windZ) < 1e-12, 'what is drawn is what is felt');
  // And so does a folded wing.
  const struck = createCloudbaseRun();
  struck.reset(300, 8);
  struck.step(STEP, outside(300));
  const core = position(struck.state.thermals[1]);
  const flying = struck.sample(core, 0);
  assert.equal(struck.strike(), true);
  const folded = struck.sample(core, 0);
  assert.equal(folded.lift, 0);
  assert.deepEqual([folded.windX, folded.windZ], [flying.windX, flying.windZ]);
});

test('beyond the zone the wind may carry the pilot along its edge or back in, never further out', () => {
  const run = createCloudbaseRun();
  for (const seed of [2, 5, 9]) {
    run.reset(80, seed);
    const top = run.state.wind[run.state.wind.length - 1];
    for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
      const ox = Math.sin(angle);
      const oz = -Math.cos(angle);
      const at = (reach) => run.windAt(CLOUD_ZONE.x + ox * reach, 5000, CLOUD_ZONE.z + oz * reach, {});
      const outward = (wind) => wind.x * ox + wind.z * oz;
      const across = (wind) => wind.x * oz - wind.z * ox;
      const blowing = top.x * ox + top.z * oz;
      // On the edge itself the wind is whole.
      assert.ok(Math.abs(at(CLOUD_ZONE.r).x - top.x) < 1e-12 && Math.abs(at(CLOUD_ZONE.r).z - top.z) < 1e-12);
      for (const beyond of [CLOUD_WIND.edge, CLOUD_WIND.edge + 40, 400]) {
        const wind = at(CLOUD_ZONE.r + beyond);
        assert.ok(outward(wind) <= 1e-12);
        // What it does along the edge, and any of it that blows back in, is left alone.
        assert.ok(Math.abs(across(wind) - (top.x * oz - top.z * ox)) < 1e-12);
        assert.ok(Math.abs(outward(wind) - Math.min(0, blowing)) < 1e-12);
      }
      const half = at(CLOUD_ZONE.r + CLOUD_WIND.edge / 2);
      assert.ok(Math.abs(outward(half) - (blowing > 0 ? blowing / 2 : blowing)) < 1e-12);
    }
  }
});

test('with the wind off the air is still and no gust ever sets off, and everything else is the same sky', () => {
  const still = createCloudbaseRun({ wind: false });
  const windy = createCloudbaseRun();
  still.reset(80, 5);
  windy.reset(80, 5);
  still.gust(0);
  for (let i = 0; i < 90 * 60; i++) {
    const point = position(windy.state.thermals[1 + (Math.floor(i / 900) % 2)], 300 + i * 0.2);
    still.step(STEP, point);
    windy.step(STEP, point);
    if (i % 30) continue;
    const air = still.sample(point, i);
    assert.deepEqual([air.windX, air.windZ, air.rough], [0, 0, 0]);
    assert.deepEqual(still.windAt(point.x + 40, point.y, point.z, {}), { x: 0, z: 0, front: 0, rough: 0 });
    assert.deepEqual(lifted(air), lifted(windy.sample(point, i)));
  }
  assert.ok(still.state.gusts.every((band) => band.strength === 0));
  assert.equal(still.state.gustCount, 0);
  assert.deepEqual([still.state.pilot.gustAhead, still.state.pilot.gustIn], [999, 99]);
  assert.ok(windy.state.gustCount >= 3);
  for (const pool of ['thermals', 'ravens', 'clouds', 'wind']) assert.deepEqual(still.state[pool], windy.state[pool]);
  assert.equal(still.state.fogHeight, windy.state.fogHeight);
});

test('the first gust sets off between 20 and 33 seconds in and another every 16 to 26, by the clock and not by the step', () => {
  const run = createCloudbaseRun();
  const coarse = createCloudbaseRun();
  const firsts = new Set();
  for (let seed = 1; seed <= 24; seed++) {
    run.reset(80, seed);
    coarse.reset(80, seed);
    const births = [];
    // Far above the fog, which would end the run and stop the clock.
    for (let i = 0; i < 150 * 60; i++) {
      const count = run.state.gustCount;
      run.step(STEP, outside(1e6));
      if (run.state.gustCount > count) births.push(run.state.elapsed);
      assert.ok(run.state.gustCount - count <= 1);
      assert.ok(run.state.gusts.filter((band) => band.strength > 0).length <= 3, 'a slot is always free');
    }
    assert.ok(births[0] >= CLOUD_GUST.first[0] && births[0] <= CLOUD_GUST.first[1] + STEP);
    firsts.add(Math.round(births[0]));
    for (let i = 1; i < births.length; i++) {
      const gap = births[i] - births[i - 1];
      assert.ok(gap >= CLOUD_GUST.every[0] - STEP && gap <= CLOUD_GUST.every[1] + STEP, `a gap of ${gap.toFixed(2)} s`);
    }
    assert.ok(births.length >= 5 && births.length <= 9, `${births.length} gusts in two and a half minutes`);
    // The same run in quarter-second steps, and then one of nine seconds that passes a birth
    // whole: every band is where the fine run has it.
    for (let i = 0; i < 4 * 141; i++) coarse.step(0.25, outside(1e6));
    coarse.step(9, outside(1e6));
    assert.equal(run.state.active && coarse.state.active, true);
    assert.equal(coarse.state.gustCount, run.state.gustCount);
    assert.ok(Math.abs(coarse.state.gustDue - run.state.gustDue) < 1e-9);
    // Which slot a band took may differ; the bands themselves may not.
    const live = (state) => state.gusts.filter((band) => band.strength > 0).sort((a, b) => a.born - b.born);
    assert.equal(live(coarse.state).length, live(run.state).length);
    assert.ok(live(run.state).length >= 1);
    live(run.state).forEach((band, i) => {
      const other = live(coarse.state)[i];
      for (const key of ['strength', 'ux', 'uz', 'lane', 'born']) assert.ok(Math.abs(other[key] - band[key]) < 1e-9, key);
      assert.ok(Math.abs(other.at - band.at) < 1e-6);
    });
  }
  assert.ok(firsts.size >= 8, 'the first gust comes at a different moment in different skies');
});

test('a scheduled gust blows within a short turn of the breeze where the pilot is, at 3 to 5.5 m/s, on a lane across the zone', () => {
  const run = createCloudbaseRun();
  const lanes = [];
  for (let seed = 1; seed <= 32; seed++) {
    run.reset(80, seed);
    const altitude = 500 + seed * 35;
    // The breeze at that height, read while no band is in the sky to add to it.
    becalm(run);
    const breeze = run.windAt(CLOUD_ZONE.x, altitude, CLOUD_ZONE.z, {});
    let seen = 0;
    for (let i = 0; i < 80 * 60; i++) {
      const count = run.state.gustCount;
      run.step(STEP, outside(altitude));
      if (run.state.gustCount === count) continue;
      seen++;
      const band = run.state.gusts.reduce((newest, candidate) => (candidate.strength > 0 && candidate.born > newest.born ? candidate : newest), { born: -1 });
      assert.ok(Math.abs(wrapAngle(yawOf(band.ux, band.uz) - yawOf(breeze.x, breeze.z))) <= CLOUD_GUST.spread + 1e-9);
      assert.ok(Math.abs(Math.hypot(band.ux, band.uz) - 1) < 1e-12);
      assert.ok(band.strength >= CLOUD_GUST.strength[0] && band.strength <= CLOUD_GUST.strength[1]);
      assert.ok(Math.abs(band.lane) <= CLOUD_GUST.lane);
      assert.ok(band.at >= -CLOUD_GUST.start && band.at < -CLOUD_GUST.start + CLOUD_GUST.speed * STEP * 1.01);
      lanes.push(band.lane);
    }
    assert.ok(seen >= 2);
  }
  assert.ok(Math.min(...lanes) < -CLOUD_GUST.lane / 2 && Math.max(...lanes) > CLOUD_GUST.lane / 2);
});

test('a gust is a straight band that crosses the zone at its own speed, blowing the way it goes, and then is gone', () => {
  const run = createCloudbaseRun();
  run.reset(80, 2);
  becalm(run);
  run.step(STEP, outside(700));
  // The breeze at that height before any band is in the sky, to take away from what is measured
  // inside one. With the lift off it is the same all over the zone.
  const breeze = run.windAt(CLOUD_ZONE.x, 700, CLOUD_ZONE.z, {});
  assert.ok(Math.hypot(breeze.x, breeze.z) >= CLOUD_STORM.wind[0] - 1e-9);
  run.gust(0.6, 10, 5);
  const band = run.state.gusts.find((candidate) => candidate.strength > 0);
  assert.deepEqual([band.ux, band.uz, band.lane, band.strength, band.at], [Math.sin(0.6), -Math.cos(0.6), 10, 5, -CLOUD_GUST.start]);
  // Long enough for the whole band to be inside the zone, where no wind is cut at the edge.
  const flown = 21.25;
  advance(run, flown, outside(700));
  assert.ok(Math.abs(band.at - (-CLOUD_GUST.start + CLOUD_GUST.speed * flown)) < 1e-9);
  assert.deepEqual([band.ux, band.uz, band.lane], [Math.sin(0.6), -Math.cos(0.6), 10]);
  const blow = (behind, aside = 0, y = 700) => {
    const point = inBand(band, band.at - behind, aside, y);
    assert.equal(run.inside(point), true);
    const wind = run.windAt(point.x, point.y, point.z, {});
    const extra = Math.hypot(wind.x - breeze.x, wind.z - breeze.z);
    // Whatever the band adds is along its own line, and `front` says how much of it is here.
    assert.ok(Math.abs((wind.x - breeze.x) * band.uz - (wind.z - breeze.z) * band.ux) < 1e-9);
    assert.ok((wind.x - breeze.x) * band.ux + (wind.z - breeze.z) * band.uz >= -1e-12);
    assert.ok(Math.abs(extra - 5 * wind.front) < 1e-9);
    return wind.front;
  };
  const near = (value, wanted) => assert.ok(Math.abs(value - wanted) < 1e-9, `${value} is not ${wanted}`);
  // Nothing ahead of the front; all of it once 6 m in; fading over the last 30 m of its 55.
  near(blow(-0.01), 0);
  near(blow(-40), 0);
  near(blow(CLOUD_GUST.rise / 2), 0.5);
  near(blow(CLOUD_GUST.rise), 1);
  near(blow(CLOUD_GUST.depth - CLOUD_GUST.fall), 1);
  near(blow(CLOUD_GUST.depth - CLOUD_GUST.fall / 2), 0.5);
  near(blow(CLOUD_GUST.depth), 0);
  near(blow(CLOUD_GUST.depth + 20), 0);
  // 160 m wide, the outer 30 m each side softening, and the same on both sides of its lane.
  for (const side of [-1, 1]) {
    near(blow(10, side * (CLOUD_GUST.half - CLOUD_GUST.soft)), 1);
    near(blow(10, side * (CLOUD_GUST.half - CLOUD_GUST.soft / 2)), 0.5);
    near(blow(10, side * CLOUD_GUST.half), 0);
    near(blow(10, side * (CLOUD_GUST.half + 30)), 0);
  }
  // The launch hill's lee takes the gust with the breeze: half of both half-way up it.
  const mid = (CLOUD_WIND.lee[0] + CLOUD_WIND.lee[1]) / 2;
  const point = inBand(band, band.at - 10, 0, mid);
  const low = run.windAt(point.x, point.y, point.z, {});
  const [first] = run.state.wind;
  assert.equal(low.front, 1);
  assert.ok(Math.abs(low.x - (first.x + band.ux * 5) / 2) < 1e-9 && Math.abs(low.z - (first.z + band.uz * 5) / 2) < 1e-9);
  // It dies once the whole of it is as far beyond the zone as it started short of it.
  const life = (2 * CLOUD_GUST.start + CLOUD_GUST.depth) / CLOUD_GUST.speed;
  advance(run, life - flown - 0.5, outside(700));
  assert.equal(band.strength, 5);
  advance(run, 1, outside(700));
  assert.equal(band.strength, 0);
});

test('only a gust on the tail is rough: one on the nose or the beam is not, and the lee softens it', () => {
  const run = createCloudbaseRun();
  run.reset(80, 2);
  becalm(run);
  run.step(STEP, outside(700));
  const heading = -1.1;
  run.gust(heading, 0, 4);
  advance(run, 12, outside(700));
  const band = run.state.gusts.find((candidate) => candidate.strength > 0);
  const inside = inBand(band, band.at - 10);
  const rough = (yaw, point = inside) => run.sample(point, yaw).rough;
  assert.ok(Math.abs(rough(heading) - 1) < 1e-9, 'flying with the gust it is all on the tail');
  assert.ok(Math.abs(rough(heading + Math.PI / 3) - 0.5) < 1e-9);
  assert.ok(rough(heading + Math.PI / 2) < 1e-9);
  assert.equal(rough(heading + Math.PI), 0);
  assert.equal(rough(heading + 2.5), 0);
  // Less of the band, less of the roughness; outside it, none.
  assert.ok(Math.abs(rough(heading, inBand(band, band.at - CLOUD_GUST.rise / 2)) - 0.5) < 1e-9);
  assert.equal(rough(heading, inBand(band, band.at + 5)), 0);
  assert.equal(rough(heading, inBand(band, band.at - 10, CLOUD_GUST.half + 1)), 0);
  const mid = (CLOUD_WIND.lee[0] + CLOUD_WIND.lee[1]) / 2;
  assert.ok(Math.abs(rough(heading, inBand(band, band.at - 10, 0, mid)) - 0.5) < 1e-9);
  assert.equal(rough(heading, inBand(band, band.at - 10, 0, CLOUD_WIND.lee[0])), 0);
  // The steady breeze is never rough, however hard it blows on the tail.
  const clear = run.sample(inBand(band, band.at + 60), heading);
  assert.ok(Math.hypot(clear.windX, clear.windZ) > 1.5);
  assert.equal(clear.rough, 0);
});

test('a gust is in the sky more than six seconds before it reaches the zone, and the pilot is told how far off its front is', () => {
  const run = createCloudbaseRun();
  const { pilot } = run.state;
  const heading = 0.4;
  const begin = (point) => {
    run.reset(80, 2);
    run.step(STEP, point);
    assert.deepEqual([pilot.gustAhead, pilot.gustIn], [999, 99]);
    run.gust(heading, 0, 4);
    return run.state.gusts.find((candidate) => candidate.strength > 0);
  };
  // Hanging at the upwind edge of the zone, on the band's own line: the first place it can reach.
  let band = begin(outside(700));
  const rim = inBand(band, -CLOUD_ZONE.r);
  run.step(STEP, rim);
  run.step(STEP, rim);
  assert.ok(Math.abs(pilot.gustAhead - (CLOUD_GUST.start - CLOUD_ZONE.r - CLOUD_GUST.speed * 2 * STEP)) < 1e-6);
  assert.ok(pilot.gustIn > 6 && Math.abs(pilot.gustIn - pilot.gustAhead / CLOUD_GUST.speed) < 1e-9);
  let waited = 0;
  while (pilot.gustAhead > 0 && waited < 20 * 60) {
    const said = pilot.gustIn;
    run.step(STEP, rim);
    waited++;
    // The count runs down with the clock, and the air is still calm until it reaches nought.
    if (pilot.gustAhead > 0) {
      assert.ok(Math.abs(said - pilot.gustIn - STEP) < 1e-9);
      assert.equal(run.windAt(rim.x, rim.y, rim.z, {}).front, 0);
    }
  }
  assert.ok(waited / 60 > 6 && waited / 60 < 7, `the front took ${(waited / 60).toFixed(2)} s to arrive`);
  assert.deepEqual([pilot.gustAhead, pilot.gustIn], [0, 0]);
  run.step(STEP, rim);
  assert.ok(run.windAt(rim.x, rim.y, rim.z, {}).front > 0);
  // Inside the band it reads nought, and once the band has gone by there is nothing coming.
  advance(run, (CLOUD_GUST.depth - 1) / CLOUD_GUST.speed - 2 * STEP, rim);
  assert.equal(pilot.gustAhead, 0);
  advance(run, 0.2, rim);
  assert.deepEqual([pilot.gustAhead, pilot.gustIn], [999, 99]);

  // A pilot flying to meet it is told sooner than one hanging still, and one running from it
  // at the band's own speed is not told at all: it never arrives.
  const fly = (speed) => {
    band = begin(outside(700));
    const point = inBand(band, 0);
    run.step(STEP, point);
    for (let i = 0; i < 30; i++) {
      point.x += band.ux * speed * STEP;
      point.z += band.uz * speed * STEP;
      run.step(STEP, point);
    }
    return [pilot.gustAhead, pilot.gustIn];
  };
  const [aheadStill, inStill] = fly(0);
  const [aheadMeeting, inMeeting] = fly(-11.5);
  assert.ok(Math.abs(inStill - aheadStill / CLOUD_GUST.speed) < 1e-6);
  assert.ok(Math.abs(inMeeting - aheadMeeting / (CLOUD_GUST.speed + 11.5)) < 1e-6);
  assert.ok(inMeeting < inStill * 0.55);
  assert.deepEqual(fly(CLOUD_GUST.speed), [999, 99]);
  assert.deepEqual(fly(16), [999, 99]);
  // Off to the side of the band there is nothing to be told of.
  band = begin(outside(700));
  const wide = inBand(band, 0, CLOUD_GUST.half + 5);
  run.step(STEP, wide);
  run.step(STEP, wide);
  assert.deepEqual([pilot.gustAhead, pilot.gustIn], [999, 99]);
  // And of two fronts on the way, it is the nearer one.
  band = begin(outside(700));
  const centre = inBand(band, 0);
  advance(run, 5, centre);
  run.gust(heading + 0.2, 0, 4);
  run.step(STEP, centre);
  assert.equal(run.state.gusts[pilot.gustSlot], band);
  assert.equal(run.state.gusts.filter((candidate) => candidate.strength > 0).length, 2);
  assert.ok(Math.abs(pilot.gustAhead - (CLOUD_GUST.start - CLOUD_GUST.speed * (5 + STEP))) < 1e-6);
  // A band off the zone's middle line is told of across its own width, on either side of its lane.
  const aside = (offset) => {
    run.reset(80, 2);
    run.step(STEP, outside(700));
    run.gust(heading, 40, 4);
    const lane = run.state.gusts.find((candidate) => candidate.strength > 0);
    const point = inBand(lane, 0, offset);
    run.step(STEP, point);
    run.step(STEP, point);
    return { lane, slot: pilot.gustSlot, told: pilot.gustAhead < 999 };
  };
  for (const offset of [70, -70, 0]) {
    const seen = aside(offset);
    assert.equal(seen.told, true, `${offset} m to the side of a band on a 40 m lane`);
    assert.equal(run.state.gusts[seen.slot], seen.lane);
  }
  for (const offset of [CLOUD_GUST.half + 5, -(CLOUD_GUST.half + 5)]) {
    assert.equal(aside(offset).told, false, `${offset} m to the side is clear of it`);
    assert.deepEqual([pilot.gustAhead, pilot.gustIn, pilot.gustSlot], [999, 99, -1]);
  }
});

// A reference pilot on the game's own flight model, in the run's own air and wind (pilots.js),
// flown through the one step every run takes (run-step.js). `brake` is what its hands do while
// it circles: 'none', 'eased' (light, let go just before it would go deep), 'late' or 'held'.
function flyReference(run, seed, options = {}) {
  return flyPilot(startRun(createRunWorld({ sky: run }), seed), createReferencePilot(options));
}

const passing = (flights, altitude) => flights.filter((flight) => flight.peak >= altitude).length;
const total = (flights, key) => flights.reduce((sum, flight) => sum + flight[key], 0);
const firstSkies = (count) => Array.from({ length: count }, (_, i) => i + 1);

// Measured over 80 skies (seeds 1 to 40 and 1001 to 1040) under SIM_VERSION 1, 2, then 4: peak min /
// median / max; the share passing 500, 1,000 and 1,500 m; strikes and stalls a run. Turning at
// random, each lift's way is a coin toss made once for its site (not measured again under 4).
//   hands up, no hazards           1   1092 / 1531 / 1770 m   100 / 100 / 63%   0     0
//                                  2    983 / 1254 / 1565 m   100 /  99 /  1%   0     0
//                                  4    983 / 1254 / 1565 m   100 /  99 /  1%   0     0
//   hands up, with the flock       1    815 / 1338 / 1765 m   100 /  94 / 19%   0.8   0
//                                  2    619 / 1106 / 1381 m   100 /  70 /  0%   1.0   0
//                                  4    713 / 1126 / 1468 m   100 /  75 /  0%   1.1   0
//   hands up, turning at random    1    500 / 1175 / 1698 m    99 /  76 /  8%   1.8   0
//                                  2    403 /  965 / 1341 m    99 /  41 /  0%   2.1   0
//   hands up, against the flock    1    616 / 1056 / 1496 m   100 /  61 /  0%   2.7   0
//                                  2    366 /  801 / 1208 m    96 /  16 /  0%   3.2   0
//                                  4    561 /  924 / 1271 m   100 /  34 /  0%   3.2   0
//   light brake, no hazards        1   1292 / 1731 / 2008 m   100 / 100 / 93%   0     0
//                                  2   1163 / 1766 / 2073 m   100 / 100 / 90%   0     0
//                                  4   1163 / 1766 / 2073 m   100 / 100 / 90%   0     0
//   light brake, with the flock    1    883 / 1329 / 1749 m   100 /  96 / 20%   1.8   0
//                                  2    625 / 1358 / 1938 m   100 /  94 / 28%   1.8   0
//                                  4    836 / 1411 / 1938 m   100 /  96 / 40%   1.8   0
//   eased 2 s late, with the flock 1    616 / 1262 / 1638 m   100 /  86 /  8%   1.8   0
//                                  2    835 / 1254 / 1800 m   100 /  86 / 14%   1.8   0
//                                  4    918 / 1313 / 1800 m   100 /  96 / 21%   1.8   0
//   never eased, with the flock    1    721 / 1023 / 1368 m   100 /  51 /  0%   1.9   3.7
//                                  2    640 / 1027 / 1359 m   100 /  54 /  0%   2.0   3.8
//                                  4    668 / 1113 / 1385 m   100 /  68 /  0%   1.9   4.0
// Version 3 left every row as version 2 had it, to the run: it added only the meet's plates, gates
// and Beast, which no pilot here meets, and the sky flies exactly as it did (run-step.test.js's
// goldens of these pilots came out the same to the bit). Version 4 left the rows with no hazards as
// they were, to the run (no fold to pump, and no cloud base to dive into), and lifted the others: a
// fold pumped open costs a third less height, and with every pilot catching its wing, no tuck came
// in any of these 560 runs.
// Version 2's hunted cores peak at their middle. A light-brake circle round it rides 30% more than
// a hands-up one, which gets what the whole core gave before, so the light brake climbs as high as
// it did or a little higher, while hands up, the way a new player circles, comes down 210 to 280 m
// at the median and passes 1,500 m on hardly a sky, hazards or none. That cost is meant
// (CLOUD_HUNT.peak), so where the tests below pin how high the sky lets a pilot climb, they fly the
// light brake eased on time, as TST does (pilots.js).
// Under version 1 the light brake climbed faster and held the core against the wind, and its
// tighter circle met more birds: over 400 skies it passed 1,500 m in 23% of runs against 14% with
// hands up. Before there was any wind, with the hidden lift at 18 m/s, the first two rows were
// 1176 / 1543 / 1756 m (67% past 1,500 m) and 740 / 1343 / 1644 m (95 / 14%). The same wind on
// that lift gave 19% and 3%, which is what CLOUD_HUNT.s is set to pay back.
// The tests below catch a large shift in any of these; the margins leave room to retune.
test('a reference pilot who turns with each flock usually passes 1,000 m, the hazards are what hold it under 1,500 m, and the fog ends every run inside three minutes', () => {
  // On the light brake eased on time (see above): hands up, the peaked cores of SIM_VERSION 2 hold
  // it under 1,500 m on 39 of these 40 skies with no hazards at all, so the hazards could not be
  // what holds it there.
  const pilot = { brake: 'eased' };
  const withFlock = firstSkies(30).map((seed) => flyReference(createCloudbaseRun(), seed, pilot));
  const against = firstSkies(20).map((seed) => flyReference(createCloudbaseRun(), seed, { ...pilot, withFlock: false }));
  // The sky with no hazards is flown over more seeds.
  const calm = firstSkies(40).map((seed) => flyReference(createCloudbaseRun({ hazards: false }), seed, pilot));
  for (const flight of [...withFlock, ...against, ...calm]) {
    assert.equal(flight.reason, 'fog');
    assert.ok(flight.seconds < 180);
    assert.equal(flight.stalls, 0, 'eased on time, the wing never stalls');
  }
  for (const flight of [...withFlock, ...calm]) assert.ok(flight.peak >= 400, `a run peaked at ${flight.peak.toFixed(0)} m`);
  assert.ok(calm.every((flight) => flight.strikes === 0 && flight.cloud === 0));
  // On these seeds: 35 of the 40 with no hazards pass 1,500 m; with the flock 28 of 30 pass
  // 1,000 m and 11 pass 1,500 m, with 28 strikes in the first 20 against 79 when turning against it
  // (under SIM_VERSION 2 and 3: 27 and 7 of 30, and 26 strikes against 71). Hands up, under 2, they
  // were 1 of 40; 22 and none of 30; 21 strikes against 55. Under SIM_VERSION 1, when this flew hands
  // up: 28 of 40; 29 and 10 of 30; 13 strikes against 58.
  assert.ok(passing(calm, 1500) >= 18, `${passing(calm, 1500)} of 40 runs with no hazards passed 1,500 m`);
  assert.ok(passing(withFlock, 1000) >= 22, `${passing(withFlock, 1000)} of 30 runs with the flock passed 1,000 m`);
  assert.ok(passing(withFlock, 1500) <= 17, `${passing(withFlock, 1500)} of 30 runs with the flock passed 1,500 m`);
  assert.ok(passing(withFlock, 1500) / 30 < passing(calm, 1500) / 40);
  const struck = total(withFlock.slice(0, 20), 'strikes');
  assert.ok(total(against, 'strikes') > struck * 1.5, `${total(against, 'strikes')} strikes against the flock, ${struck} with it`);
});

test('the wind costs the reference pilot height, and the light brake eased on time wins it back without ever stalling', () => {
  const skies = firstSkies(20);
  const mean = (flights) => total(flights, 'peak') / flights.length;
  const fly = (options, pilot) => skies.map((seed) => flyReference(createCloudbaseRun({ hazards: false, ...options }), seed, pilot));
  const still = fly({ wind: false });
  const windy = fly({});
  const braked = fly({}, { brake: 'eased' });
  // On these seeds the means are 1360 m in still air, 1239 m in the wind and 1789 m on the brake,
  // which beats hands up in all 20 skies (under SIM_VERSION 1: 1684, 1573 and 1756 m, and 19 of 20).
  assert.ok(mean(still) - mean(windy) > 50, `the wind cost ${(mean(still) - mean(windy)).toFixed(0)} m`);
  assert.ok(mean(braked) - mean(windy) > 90, `the light brake won ${(mean(braked) - mean(windy)).toFixed(0)} m`);
  assert.ok(braked.filter((flight, i) => flight.peak > windy[i].peak).length >= 14);
  for (const flight of [...still, ...windy, ...braked]) {
    assert.equal(flight.reason, 'fog');
    assert.equal(flight.stalls, 0);
  }
});

test('among the ravens a brake eased on time or two seconds late does not stall, and one never eased stalls again and again and is clearly worse', () => {
  const skies = firstSkies(20);
  const fly = (pilot) => skies.map((seed) => flyReference(createCloudbaseRun(), seed, pilot));
  const mean = (flights) => total(flights, 'peak') / flights.length;
  const handsUp = fly({});
  const eased = fly({ brake: 'eased' });
  const late = fly({ brake: 'late' });
  const held = fly({ brake: 'held' });
  for (const flight of [...eased, ...late, ...held]) {
    assert.equal(flight.reason, 'fog');
    assert.ok(flight.seconds < 180);
  }
  // On these seeds under SIM_VERSION 4: no stall eased or late; held, 80 stalls in 20 runs and never
  // fewer than two, peaking 371 m under eased on average (1,078 m against 1,449 m) and level with
  // hands up (1,086 m): each harsh stall now ends in a dive it catches, and the folds it meets are
  // pumped open, as everyone's are. Under 2 and 3 it was 460 m under eased and 90 m under hands up
  // (958 m against 1,420 and 1,051 m; over two other sets of seeds, 10 m over hands up and 2 m
  // under, so no pin holds it there); under SIM_VERSION 1, 310 m under eased and 370 m under hands
  // up (1,018 m against 1,331 and 1,386 m).
  assert.equal(total(eased, 'stalls'), 0);
  assert.ok(total(late, 'stalls') <= 2, `${total(late, 'stalls')} stalls easing two seconds late`);
  assert.ok(held.every((flight) => flight.stalls >= 1));
  assert.ok(total(held, 'stalls') >= 40, `${total(held, 'stalls')} stalls with the brake never eased`);
  assert.ok(mean(eased) - mean(held) > 150, `holding the brake cost ${(mean(eased) - mean(held)).toFixed(0)} m against easing it`);
  // Eased on time it is much the better way to fly, even though it meets more birds: its circle
  // round the peaked middle of a core climbs 30% faster than hands up (363 m higher here, 370 m
  // under SIM_VERSION 2; under 1 it was only no worse, 55 m lower).
  assert.ok(mean(eased) - mean(handsUp) > 150, `the light brake eased on time won ${(mean(eased) - mean(handsUp)).toFixed(0)} m`);
  assert.ok(passing(eased, 1000) >= 14, `${passing(eased, 1000)} of 20 runs on the light brake passed 1,000 m`);
});

// A pilot circling in a hunted thermal's core from 700 m, with nothing in the sky but the wind,
// and a gust band set off across that thermal `at` seconds in. `late` is how many seconds the
// brake is left deep before it is eased (0 eases it on time). Returns whether the wing stalled,
// the most the stall load reached, how far off the tail the front was when it arrived (0 square
// on the tail, PI on the nose) and the furthest the pilot got from the middle of the lift.
function circleInGust({ heading = null, at = 0, late = 0, seconds = 40 }) {
  const run = createCloudbaseRun({ hazards: false });
  run.reset(700, 3);
  const thermal = run.state.thermals[1];
  thermal.life = Infinity;
  const g = createFlight({ x: thermal.x + 9, y: 700, z: thermal.z });
  const controls = { turn: 0, brake: false, bar: false, locked: false, harsh: true, linger: true, climb: null };
  const air = { lift: 0, sink: 0, windX: 0, windZ: 0, calm: false, rough: 0, clearance: Infinity };
  const forces = {};
  const probe = {};
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  let deepFor = 0;
  let tap = 0;
  let stalled = false;
  let load = 0;
  let offTail = null;
  let furthest = 0;
  for (let i = 0; i < seconds * 60; i++) {
    // The lift is held as it is, so every trial circles in the same air.
    thermal.wear = 0;
    if (heading !== null && i === Math.round(at * 60)) {
      const ux = Math.sin(heading);
      const uz = -Math.cos(heading);
      run.gust(heading, (thermal.z - CLOUD_ZONE.z) * ux - (thermal.x - CLOUD_ZONE.x) * uz);
    }
    const distance = between(thermal, g.pos);
    const bearing = Math.atan2(thermal.x - g.pos.x, -(thermal.z - g.pos.z));
    const want = bearing - thermal.dir * (Math.PI / 2) * clamp(1 - (distance - 9) / 28, 0, 1.4);
    controls.turn = clamp(wrapAngle(want - g.yaw) * 2.5, -1, 1);
    deepFor = g.brake >= BRAKE.shelf ? deepFor + STEP : 0;
    if (tap <= 0 && (late > 0 ? deepFor >= late : g.brake > BRAKE.shelf - 0.01)) tap = 0.2;
    tap -= STEP;
    controls.brake = tap <= 0 && g.stall === 0;
    run.sample(g.pos, g.yaw, forces);
    air.lift = forces.lift;
    air.sink = forces.sink;
    air.windX = forces.windX;
    air.windZ = forces.windZ;
    air.rough = forces.rough;
    if (offTail === null && heading !== null && run.windAt(g.pos.x, g.pos.y, g.pos.z, probe).front > 0) offTail = Math.abs(wrapAngle(g.yaw - heading));
    stepFlight(g, controls, air, STEP);
    stalled ||= g.stall > 0;
    load = Math.max(load, g.stallLoad);
    // Counted once the circle is established.
    if (i > 600) furthest = Math.max(furthest, between(thermal, g.pos));
    run.step(STEP, g.pos);
  }
  assert.equal(run.state.active, true);
  return { stalled, load, offTail, furthest };
}

test('a circle on the light brake rides out every gust, and a brake left deep is tipped into a stall by a front on the tail far more often than by one on the nose', () => {
  const headings = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4 + 0.2);
  const times = Array.from({ length: 12 }, (_, i) => i);
  const trials = (late) => headings.flatMap((heading) => times.map((at) => circleInGust({ heading, at, late })));
  // Eased on time the gusts load the wing (measured: up to a little over half) and never stall it.
  const light = trials(0);
  assert.ok(light.every((trial) => trial.offTail !== null), 'every band reaches the pilot');
  assert.ok(light.every((trial) => !trial.stalled));
  assert.ok(Math.max(...light.map((trial) => trial.load)) < 0.85);
  assert.ok(Math.max(...light.map((trial) => trial.load)) > 0.15, 'a gust on a light brake does register');
  // With no gust the circle holds the core and loads nothing. A band is not sheltered by the
  // lift as the breeze is: it carries the pilot off the core as it passes (measured: 4 m further
  // out for the usual gust and 23 m for the worst), though never out of reach of the lift.
  const quiet = circleInGust({ late: 0 });
  assert.equal(quiet.load, 0);
  assert.ok(quiet.furthest < 17, `the quiet circle strayed ${quiet.furthest.toFixed(1)} m from the core`);
  const carried = Math.max(...light.map((trial) => trial.furthest));
  assert.ok(carried > quiet.furthest + 10 && carried < 60, `the worst gust carried the pilot ${carried.toFixed(0)} m from the core`);
  // Left deep for three seconds a circle, the wing gets close without any gust and never there.
  const control = circleInGust({ late: 3 });
  assert.equal(control.stalled, false);
  assert.ok(control.load > 0.4 && control.load < 0.95, `the load reached ${control.load.toFixed(2)} with no gust`);
  const deep = trials(3);
  const share = (group) => group.filter((trial) => trial.stalled).length / Math.max(1, group.length);
  const onTail = deep.filter((trial) => trial.offTail < Math.PI / 3);
  const onNose = deep.filter((trial) => trial.offTail > (2 * Math.PI) / 3);
  assert.ok(onTail.length >= 8 && onNose.length >= 8);
  assert.ok(share(deep) > 0.1, `${Math.round(share(deep) * 100)}% of the gusts stalled a deep brake`);
  assert.ok(share(onTail) > share(onNose) + 0.15, `${Math.round(share(onTail) * 100)}% from behind, ${Math.round(share(onNose) * 100)}% from ahead`);
});
