import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOUD_ZONE, CLOUD_GATE, CLOUD_LAUNCH, CLOUD_WEAR, CLOUD_HUNT, CLOUD_RAVENS, CLOUD_STRIKE, CLOUD_STORM,
  CLOUD_POOL, CLOUD_MILESTONES, createCloudbaseRun,
} from './cloudbase-state.js';
import { surfaceAt } from './terrain.js';

const STEP = 1 / 60;
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
    assert.equal(run.sample(position(run.state.thermals[1]), i).lift, CLOUD_HUNT.s);
    run.depthAt(125, 600 + i, 238);
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
  assert.deepEqual(run.sample(position({ ...edge, x: edge.x + 1 })), { lift: 0, sink: 0, liftSide: 0 });
  assert.equal(run.sample(position(CLOUD_LAUNCH)).lift, 17);
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
  assert.ok(Math.abs(run.sample(position(thermal)).lift - CLOUD_HUNT.s) < 1e-8);
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
  assert.deepEqual(run.sample(position(flock, 300)), { lift: 0, sink: CLOUD_STRIKE.sink, liftSide: 0 });
  assert.equal(run.sample(outside(300)).sink, CLOUD_STRIKE.sink);
  advance(run, CLOUD_STRIKE.collapse + STEP, outside(300));
  assert.equal(pilot.collapse, 0);
  assert.ok(pilot.shield > 0);
  assert.equal(run.sample(position(flock, 300)).lift, CLOUD_HUNT.s);
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
  assert.deepEqual(run.sample(chest(700)), { lift: 0, sink: CLOUD_STORM.sink, liftSide: 0 });
  assert.equal(run.depthAt(thermal.x, 700, thermal.z), 1);
  // 6% of the way in from the underside: a fifth of the edge, which already takes a quarter of the lift.
  const shallow = run.sample(chest(700 - cloud.ry * 0.94));
  const depth = 0.2 * 0.2 * (3 - 2 * 0.2);
  assert.ok(Math.abs(shallow.lift - CLOUD_HUNT.s * (1 - depth * CLOUD_STORM.cap)) < 1e-6);
  assert.ok(Math.abs(shallow.sink - CLOUD_STORM.sink * depth) < 1e-6);
  // Lift is gone well before the heart of the cloud, so a capped pilot tops out near its base.
  assert.equal(run.sample(chest(700 - cloud.ry * 0.8)).lift, 0);
  assert.deepEqual(run.sample(chest(700 - cloud.ry - 1)), { lift: CLOUD_HUNT.s, sink: 0, liftSide: 0 });
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
  assert.deepEqual(run.sample(beyond), { lift: 0, sink: CLOUD_STORM.sink, liftSide: 0 });
  const calm = createCloudbaseRun({ hazards: false });
  calm.reset(80, 10);
  park(calm.state.clouds[0], calm.state.thermals[1].x, 700, calm.state.thermals[1].z);
  calm.step(STEP, outside());
  assert.equal(calm.sample(chest(700)).lift, CLOUD_HUNT.s);
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
  const parts = [...state.thermals, ...state.ravens, ...state.clouds, state.pilot];
  const finite = () => {
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
  assert.deepEqual([state.thermals.length, state.ravens.length, state.clouds.length], [CLOUD_POOL.thermals, CLOUD_POOL.ravens, CLOUD_POOL.clouds]);
  assert.deepEqual([...state.thermals, ...state.ravens, ...state.clouds, state.pilot].map((part, i) => part === parts[i]), parts.map(() => true));
});

test('finishing a run clears the collapse, the cloud and the thermal the pilot was in, and keeps the score', () => {
  const run = createCloudbaseRun();
  run.reset(300, 8);
  const thermal = run.state.thermals[1];
  park(run.state.clouds[0], thermal.x, 300 + CLOUD_STRIKE.rise, thermal.z);
  advance(run, 2, position(thermal, 300));
  park(run.state.clouds[0], thermal.x, 5000, thermal.z);
  run.step(STEP, position(thermal, 300));
  run.strike();
  const { pilot } = run.state;
  assert.equal(pilot.thermal, 1);
  assert.ok(pilot.collapse > 0 && pilot.cloudTime > 1.9);
  run.finish();
  assert.deepEqual({ ...pilot, y: 0 }, { y: 0, collapse: 0, shield: 0, cloud: 0, cloudTime: pilot.cloudTime, strikes: 1, thermal: -1, danger: 0, headroom: pilot.headroom });
  assert.ok(run.state.ravens.every((raven) => !raven.threat));
  assert.equal(run.strike(), false);
  assert.deepEqual(run.sample(position(CLOUD_LAUNCH)), { lift: 0, sink: 0, liftSide: 0 });
});

// A reference pilot with the game's own flight model: it flies to the nearest good lift and
// circles in its core, turning the way that thermal's ravens turn (or against them), and never
// reacts to a raven or a cloud. It bounds what a player can do; it is not a player.
function flyReference(run, seed, { withFlock = true } = {}) {
  run.reset(CLOUD_GATE.y, seed);
  const { state } = run;
  const pos = { x: CLOUD_GATE.x, y: CLOUD_GATE.y, z: CLOUD_GATE.z };
  const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  let yaw = CLOUD_GATE.yaw;
  let yawRate = 0;
  let verticalSpeed = 0;
  let hook = 1;
  let reason = null;
  while (!reason && state.elapsed < 200) {
    let target = null;
    let nearest = Infinity;
    for (const thermal of state.thermals) {
      const distance = between(thermal, pos);
      if (thermal.live && thermal.strength >= 0.3 && distance < nearest) [target, nearest] = [thermal, distance];
    }
    let turn = 0;
    if (target) {
      const bearing = Math.atan2(target.x - pos.x, -(target.z - pos.z));
      const dir = target === state.thermals[0] ? 1 : withFlock ? target.dir : -target.dir;
      // Head straight in, then hold a circle of about 14 m by aiming along it and a little inward.
      const want = nearest > 30 ? bearing : bearing - dir * (Math.PI / 2) * clamp(1 - (nearest - 14) / 28, 0, 1.4);
      turn = clamp(wrapAngle(want - yaw) * 2.5, -1, 1);
    }
    if (state.pilot.collapse > 0) turn = hook * 0.6;
    if (!run.inside(pos)) turn = clamp(wrapAngle(Math.atan2(CLOUD_ZONE.x - pos.x, -(CLOUD_ZONE.z - pos.z)) - yaw) * 2, -1, 1);
    yawRate += (turn * 0.8 - yawRate) * Math.min(1, STEP * 3.2);
    yaw += yawRate * STEP;
    const air = run.sample(pos, yaw);
    verticalSpeed += (air.lift - 1.2 - Math.abs(yawRate) * 0.8 - air.sink - verticalSpeed) * Math.min(1, STEP * 2.5);
    pos.x += Math.sin(yaw) * 11.5 * STEP;
    pos.z -= Math.cos(yaw) * 11.5 * STEP;
    pos.y += verticalSpeed * STEP;
    if (pos.y - surfaceAt(pos.x, pos.z) <= 1.4) reason = 'landed';
    const strikes = state.pilot.strikes;
    reason ??= run.step(STEP, pos);
    if (state.pilot.strikes > strikes) hook = Math.sign(yawRate) || 1;
  }
  return { peak: state.peak, strikes: state.pilot.strikes, seconds: state.elapsed, cloud: state.pilot.cloudTime, reason };
}

// Measured over 120 other skies with these rules (peak min / median / max; share passing 500,
// 1,000 and 1,500 m; strikes a run):
//   no hazards             1205 / 1571 / 1788 m   100 / 100 / 68%   0
//   turns with the flock    885 / 1309 / 1653 m   100 /  97 / 16%   1.0
//   turns at random         609 / 1177 / 1675 m   100 /  82 /  8%   2.1
//   turns against it        609 / 1065 / 1599 m   100 /  64 /  2%   3.0
// The test below catches a large shift in any of these; the margins leave room to retune.
test('a reference pilot who turns with each flock usually passes 1,000 m, the hazards are what hold it under 1,500 m, and the fog ends every run inside three minutes', () => {
  const count = (flights, altitude) => flights.filter((flight) => flight.peak >= altitude).length;
  const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
  const withFlock = seeds.map((seed) => flyReference(createCloudbaseRun(), seed));
  const against = seeds.map((seed) => flyReference(createCloudbaseRun(), seed, { withFlock: false }));
  // The calm sky is flown over more seeds: passing 1,500 m there is close to a coin toss.
  const calm = Array.from({ length: 60 }, (_, i) => flyReference(createCloudbaseRun({ hazards: false }), i + 1));
  for (const flight of [...withFlock, ...against, ...calm]) {
    assert.equal(flight.reason, 'fog');
    assert.ok(flight.seconds < 180);
  }
  for (const flight of [...withFlock, ...calm]) assert.ok(flight.peak >= 400, `a run peaked at ${flight.peak.toFixed(0)} m`);
  assert.ok(calm.every((flight) => flight.strikes === 0 && flight.cloud === 0));
  // On these seeds: with the flock 19 of 20 pass 1,000 m and 2 pass 1,500 m, with 21 strikes
  // against 64 when turning against it.
  assert.ok(count(calm, 1500) >= 26, `${count(calm, 1500)} of 60 calm runs passed 1,500 m`);
  assert.ok(count(withFlock, 1000) >= 14, `${count(withFlock, 1000)} of 20 runs with the flock passed 1,000 m`);
  assert.ok(count(withFlock, 1500) <= 8, `${count(withFlock, 1500)} of 20 runs with the flock passed 1,500 m`);
  const strikes = (flights) => flights.reduce((sum, flight) => sum + flight.strikes, 0);
  assert.ok(strikes(against) > strikes(withFlock) * 1.5, `${strikes(against)} strikes against the flock, ${strikes(withFlock)} with it`);
});
