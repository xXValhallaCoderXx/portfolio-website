import test from 'node:test';
import assert from 'node:assert/strict';
import { FLIGHT, BRAKE, STALL, createFlight, releaseFlight, settleFlight, stepFlight } from './flight.js';

const STEP = 1 / 60;
const HIGH = 5000;
const stillAir = (over = {}) => ({ lift: 0, sink: 0, windX: 0, windZ: 0, calm: false, rough: 0, clearance: Infinity, ...over });
const handsUp = (over = {}) => ({ turn: 0, brake: false, bar: false, locked: false, harsh: false, linger: false, climb: null, ...over });
const aloft = () => createFlight({ x: 0, y: HIGH, z: 0 });
const fly = (g, controls, air, seconds, each) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    each?.(i * STEP);
    stepFlight(g, controls, air, STEP);
  }
  return g;
};
// Flies until `done` says so, and says how long that took (or Infinity if it never did).
const until = (g, controls, air, done, limit = 60) => {
  for (let i = 1; i <= limit * 60; i++) {
    stepFlight(g, controls, air, STEP);
    if (done(g)) return i * STEP;
  }
  return Infinity;
};
const near = (value, target, margin) => Math.abs(value - target) <= margin;

test('with the brake and the bar untouched the wing flies as it always has', () => {
  const g = fly(aloft(), handsUp(), stillAir(), 10);
  assert.ok(near(g.speed, 11.5, 1e-9) && near(g.vy, -1.2, 1e-6));
  assert.ok(near(g.pos.z, -115, 1e-6), 'north at trim speed');
  const circling = fly(aloft(), handsUp({ turn: 1 }), stillAir(), 12);
  assert.ok(near(circling.yawRate, 0.8, 1e-6));
  assert.ok(near(circling.speed / circling.yawRate, 14.375, 1e-3), 'a 14.4 m circle');
  assert.ok(near(circling.vy, -1.84, 1e-3) && near(circling.bank, 0.6, 1e-3));
});

test('random steering, lift and drift match the flight the game used to carry, to the last bit', () => {
  // The lines game.js had before the model moved here, kept as the reference.
  const old = { pos: { x: 0, y: HIGH, z: 0 }, yaw: 0, yawRate: 0, bank: 0, speed: 11.5, sink: 1.2, vy: 0 };
  const g = aloft();
  const controls = handsUp();
  const air = stillAir({ calm: true });
  let seed = 20261014;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 120 * 60; i++) {
    if (i % 41 === 0) {
      controls.turn = Math.floor(random() * 3) - 1;
      air.lift = random() * 18;
      air.sink = random() < 0.2 ? 6 : 0;
      air.windX = random() - 0.5;
      air.windZ = random() - 0.5;
    }
    stepFlight(g, controls, air, STEP);
    old.yawRate += (controls.turn * 0.8 - old.yawRate) * Math.min(1, STEP * 3.2);
    old.yaw += old.yawRate * STEP;
    old.bank += (old.yawRate * 0.75 - old.bank) * Math.min(1, STEP * 4);
    old.speed += (11.5 - old.speed) * Math.min(1, STEP * 1.6);
    old.sink += (1.2 - old.sink) * Math.min(1, STEP * 1.6);
    old.vy += (air.lift - (old.sink + Math.abs(old.yawRate) * 0.8 + air.sink) - old.vy) * Math.min(1, STEP * 2.5);
    old.pos.x += (Math.sin(old.yaw) * old.speed + air.windX) * STEP;
    old.pos.z += (-Math.cos(old.yaw) * old.speed + air.windZ) * STEP;
    old.pos.y += old.vy * STEP;
  }
  assert.deepEqual([g.pos.x, g.pos.y, g.pos.z, g.yaw, g.bank, g.vy], [old.pos.x, old.pos.y, old.pos.z, old.yaw, old.bank, old.vy]);
  assert.equal(g.stallLoad, 0);
});

test('the brake is light a fifth of a second after it is pressed, goes deep in about a second over the fjord and lingers eight seconds in a run', () => {
  const reach = (controls, depth) => until(aloft(), controls, stillAir(), (g) => g.brake >= depth);
  assert.ok(near(reach(handsUp({ brake: true }), BRAKE.light), 0.2, 0.02));
  assert.ok(near(reach(handsUp({ brake: true }), BRAKE.shelf), 0.2 + BRAKE.linger.fjord, 0.05));
  assert.ok(reach(handsUp({ brake: true }), 1) < 1.5);
  assert.ok(near(reach(handsUp({ brake: true, linger: true }), BRAKE.light), 0.2, 0.02));
  assert.ok(near(reach(handsUp({ brake: true, linger: true }), BRAKE.shelf), 0.2 + BRAKE.linger.run, 0.05));
  // Steering makes no difference to how long it lingers.
  assert.ok(near(reach(handsUp({ brake: true, linger: true, turn: 1 }), BRAKE.shelf), 0.2 + BRAKE.linger.run, 0.05));
});

test('let go, even for a moment, a deep brake is back to a light one and its linger starts again', () => {
  const g = fly(aloft(), handsUp({ brake: true }), stillAir(), 2);
  assert.equal(g.brake, 1);
  fly(g, handsUp(), stillAir(), 0.07);
  assert.ok(g.brake < BRAKE.light, `depth ${g.brake.toFixed(2)} after a 70 ms tap`);
  const again = until(g, handsUp({ brake: true, linger: true }), stillAir(), (wing) => wing.brake >= BRAKE.shelf);
  assert.ok(again > BRAKE.linger.run - 0.2, 'the whole light band is there again');
  fly(g, handsUp(), stillAir(), 0.5);
  assert.equal(g.brake, 0);
});

test('light brake slows the wing to where it sinks least and tightens a full turn from 14 m to 8 m', () => {
  const controls = handsUp({ turn: 1, linger: true });
  const g = aloft();
  // Held, with a breath whenever it is about to leave the light band.
  fly(g, controls, stillAir(), 20, () => { controls.brake = g.brake < BRAKE.shelf - 0.02; });
  assert.ok(near(g.speed, FLIGHT.speed.light, 0.15) && near(g.sink, FLIGHT.sink.least, 0.02));
  assert.ok(near(g.yawRate, FLIGHT.turn.light, 0.02));
  const radius = g.speed / g.yawRate;
  assert.ok(radius > 7.5 && radius < 9, `an ${radius.toFixed(1)} m circle`);
  assert.ok(-g.vy < 1.84, 'and it sinks less than the same turn with hands up');
  assert.equal(g.stallLoad, 0, 'with no load, however long it is flown like this');
});

test('deep brake comes down steeper than one in one, slowly, and still turns', () => {
  const g = fly(aloft(), handsUp({ brake: true }), stillAir(), 4);
  assert.ok(near(g.speed, FLIGHT.speed.deep, 0.1) && near(-g.vy, FLIGHT.sink.deep, 0.2));
  assert.ok(-g.vy > g.speed);
  const turning = fly(aloft(), handsUp({ brake: true, turn: -1 }), stillAir(), 3);
  assert.ok(near(turning.yawRate, -FLIGHT.turn.deep, 0.02));
});

test('the speed bar gives a faster, sinkier, wider glide, and the brake takes over from it', () => {
  const g = fly(aloft(), handsUp({ bar: true, turn: 1 }), stillAir(), 8);
  assert.equal(g.bar, 1);
  assert.ok(near(g.speed, 16, 0.05) && near(g.sink, 2.3, 0.01) && near(g.yawRate, 0.6, 0.01));
  fly(g, handsUp({ bar: true, brake: true }), stillAir(), 1);
  assert.equal(g.bar, 0);
  assert.ok(g.brake > BRAKE.light && g.speed < 11.5);
});

test('sink follows one curve from the light brake through trim to the bar, with no step between them', () => {
  const g = aloft();
  const controls = handsUp({ bar: true });
  let last = fly(g, controls, stillAir(), 6).sink;
  controls.bar = false;
  controls.brake = true;
  controls.linger = true;
  for (let i = 0; i < 6 * 60; i++) {
    stepFlight(g, controls, stillAir(), STEP);
    assert.ok(Math.abs(g.sink - last) < 0.1, 'sink never jumps');
    last = g.sink;
  }
  assert.ok(near(g.sink, FLIGHT.sink.least, 0.02));
});

test('pulling the brake at trim lifts the vario for a moment, and working the brake or the bar never gains height', () => {
  const g = fly(aloft(), handsUp(), stillAir(), 3);
  fly(g, handsUp({ brake: true, linger: true }), stillAir(), 0.6);
  assert.ok(g.vy > -0.5, `vario ${g.vy.toFixed(2)} as the speed comes off`);
  const lost = (drive) => {
    const wing = aloft();
    const controls = handsUp({ linger: true });
    fly(wing, controls, stillAir(), 60, (t) => drive(controls, t, wing));
    return HIGH - wing.pos.y;
  };
  const steadyLight = lost((controls, t, wing) => { controls.brake = wing.brake < BRAKE.shelf - 0.02; });
  const pumpingBrake = lost((controls, t) => { controls.brake = t % 2 < 1; });
  const pumpingBar = lost((controls, t) => { controls.bar = t % 2 < 1; });
  assert.ok(steadyLight < 72, 'light brake is the floatiest way to fly');
  assert.ok(pumpingBrake >= steadyLight - 0.5 && pumpingBar > 72, `${pumpingBrake.toFixed(1)} and ${pumpingBar.toFixed(1)} m against ${steadyLight.toFixed(1)} m`);
});

test('a deep brake held on stalls the wing in a few seconds, sooner in a turn and then as a spin toward the inside wing', () => {
  const stallAfter = (controls) => {
    const g = aloft();
    return [until(g, controls, stillAir(), (wing) => wing.stall > 0), g];
  };
  const [straight, wing] = stallAfter(handsUp({ brake: true }));
  assert.ok(straight > 5 && straight < 10, `stalled ${straight.toFixed(1)} s after the press`);
  assert.equal(wing.stallSide, 0);
  const [turning, spun] = stallAfter(handsUp({ brake: true, turn: 1 }));
  assert.ok(turning < straight - 1.5, `in a turn ${turning.toFixed(1)} s`);
  assert.equal(spun.stallSide, 1);
  assert.equal(stallAfter(handsUp({ brake: true, turn: -1 }))[1].stallSide, -1);
  // In a run the same hold lasts the linger longer, and then goes just as surely.
  const [lingering] = stallAfter(handsUp({ brake: true, linger: true, harsh: true, turn: 1 }));
  assert.ok(lingering > BRAKE.linger.run + 2 && lingering < BRAKE.linger.run + 6);
});

test('letting go just before the stall saves the wing, and the load only drains once it is flying again', () => {
  const g = aloft();
  until(g, handsUp({ brake: true }), stillAir(), (wing) => wing.stallLoad >= 0.97);
  assert.equal(g.stall, 0);
  const load = g.stallLoad;
  stepFlight(g, handsUp(), stillAir(), STEP);
  assert.equal(g.stallLoad, load, 'the fill stops with the key, but a wing still this slow sheds nothing');
  assert.ok(g.speed < STALL.safe);
  fly(g, handsUp(), stillAir(), 3);
  assert.equal(g.stall, 0);
  assert.equal(g.stallLoad, 0);
});

test('a front from behind takes airspeed off a braked wing and tips it into the stall, while a steady wind does nothing', () => {
  // The wing flies north on a deep brake; then the wind picks up from behind over half a second.
  const fronted = (windToZ, rough) => {
    const g = aloft();
    const controls = handsUp({ brake: true });
    const air = stillAir();
    fly(g, controls, air, 3);
    const speed = g.speed;
    let slowest = speed;
    const stalled = until(g, controls, air, (wing) => {
      air.windZ += (windToZ - air.windZ) * 0.06;
      air.rough = rough;
      slowest = Math.min(slowest, wing.speed);
      return wing.stall > 0;
    }, 30);
    return { stalled: stalled + 3, dip: speed - slowest };
  };
  const calm = fronted(0, 0);
  const behind = fronted(-5, 1); // north is -z: this wind blows the way the wing is going
  const ahead = fronted(5, 0);
  assert.ok(behind.dip > 0.5, `the gust took ${behind.dip.toFixed(2)} m/s`);
  assert.ok(behind.stalled < calm.stalled - 1.5, `stalled at ${behind.stalled.toFixed(1)} s instead of ${calm.stalled.toFixed(1)} s`);
  assert.ok(ahead.stalled >= calm.stalled, 'a gust on the nose never brings the stall forward');

  // A wind that is simply there, however strong, and a circle flown in it, are not felt.
  const g = aloft();
  const controls = handsUp({ turn: 1, linger: true });
  const air = stillAir({ windX: 4, windZ: -3 });
  fly(g, controls, air, 30, () => { controls.brake = g.brake < BRAKE.shelf - 0.02; });
  assert.ok(near(g.speed, FLIGHT.speed.light, 0.15));
  assert.equal(g.stallLoad, 0);
  assert.ok(g.pos.x > 100, 'though it carries the pilot away');
});

test('a drift marked calm, a wing that is put somewhere else and a wing with its hands up feel no gust', () => {
  const kicked = (air, controls, change) => {
    const g = fly(aloft(), controls, air, 3);
    const before = g.speed;
    change(air);
    stepFlight(g, controls, air, STEP);
    return Math.abs(g.speed - before);
  };
  const jump = (air) => { air.windZ = -1; };
  assert.ok(kicked(stillAir(), handsUp(), jump) > 0.9, 'a real change of wind is felt at once');
  assert.ok(kicked(stillAir({ calm: true }), handsUp(), jump) < 1e-9);
  assert.ok(kicked(stillAir(), handsUp(), (air) => { air.windZ = -(STALL.jump + 0.5); }) < 1e-9, 'too big to be weather');
  assert.ok(kicked(stillAir(), handsUp({ locked: true }), jump) < 1e-9);
  assert.ok(kicked(stillAir(), handsUp({ climb: -1 }), jump) < 1e-9);
  // The first wind a settled wing meets is where it starts from.
  const g = settleFlight(aloft());
  stepFlight(g, handsUp(), stillAir({ windX: 3, windZ: -4 }), STEP);
  assert.ok(near(g.speed, 11.5, 1e-9));
  // And nothing loads a wing whose brake is not on.
  const free = fly(aloft(), handsUp({ turn: 1 }), stillAir({ rough: 1 }), 20);
  assert.equal(free.stallLoad, 0);
});

test('a forgiving stall is short and cheap, a harsh one costs about as much as a raven strike, and letting go shortens both', () => {
  const stall = (harsh, held, lift = 0, turn = 0) => {
    const g = aloft();
    const controls = handsUp({ brake: true, harsh, turn });
    const air = stillAir({ lift });
    until(g, controls, air, (wing) => wing.stall > 0);
    const from = g.pos.y;
    const heading = g.yaw;
    controls.brake = held;
    const seconds = until(g, controls, air, (wing) => wing.stall === 0);
    return { seconds, lost: from - g.pos.y, swung: Math.abs(g.yaw - heading), g };
  };
  const gentle = stall(false, true);
  assert.ok(near(gentle.seconds, STALL.forgiving.time + STALL.surge, 0.05));
  assert.ok(gentle.lost > 6 && gentle.lost < 16, `a forgiving stall cost ${gentle.lost.toFixed(1)} m`);
  const hard = stall(true, true);
  assert.ok(near(hard.seconds, STALL.harsh.time + STALL.surge, 0.05));
  assert.ok(hard.lost > 50 && hard.lost < 70, `a harsh stall cost ${hard.lost.toFixed(1)} m`);
  const inLift = stall(true, true, 19.5);
  assert.ok(inLift.lost > 40 && inLift.lost < 62, `and ${inLift.lost.toFixed(1)} m in a strong core, where a raven strike costs about 54`);
  const eased = stall(true, false);
  assert.ok(eased.seconds < hard.seconds * 0.72 && eased.lost < hard.lost - 15);
  // Straight, the heading holds; in a spin it swings well round toward the inside wing.
  assert.ok(hard.swung < 0.05);
  const spun = stall(true, true, 0, 1);
  assert.ok(spun.swung > 1.5 && spun.g.yaw > 0);
  assert.equal(spun.g.stallSide, 0, 'and it is over');
  assert.equal(spun.g.stallLoad, 0);
});

test('nothing the pilot does reaches a stalled wing, and what kind of stall it is was settled as it began', () => {
  const g = aloft();
  const controls = handsUp({ brake: true, harsh: true });
  until(g, controls, stillAir(), (wing) => wing.stall > 0);
  assert.equal(g.stallHarsh, true);
  const left = g.stall;
  // Dropping out of the harsh air mid-stall changes nothing about this one.
  controls.harsh = false;
  controls.turn = 1;
  controls.bar = true;
  fly(g, controls, stillAir(), 1);
  assert.ok(near(g.stall, left - 1, 0.05) && g.stallHarsh);
  assert.ok(Math.abs(g.yawRate) < 0.02 && g.turn === 0 && g.bar === 0 && g.brake === 0);
  assert.ok(g.vy < -15, 'still falling like a harsh stall');
});

test('after a harsh stall the brake stays off until it has been let go, and after a forgiving one it comes straight back', () => {
  const recover = (harsh) => {
    const g = aloft();
    const controls = handsUp({ brake: true, harsh });
    until(g, controls, stillAir(), (wing) => wing.stall > 0);
    until(g, controls, stillAir(), (wing) => wing.stall === 0);
    fly(g, controls, stillAir(), 1);
    return [g, controls];
  };
  const [held, controls] = recover(true);
  assert.equal(held.brake, 0, 'the held key does nothing');
  controls.brake = false;
  stepFlight(held, controls, stillAir(), STEP);
  controls.brake = true;
  fly(held, controls, stillAir(), 0.5);
  assert.ok(held.brake >= BRAKE.light, 'pressed afresh, it bites');
  assert.ok(recover(false)[0].brake >= BRAKE.light, 'a visitor holding the brake down to a ring keeps descending');
});

test('a raven strike lets the brake and the bar go and ends a stall, and so does the glider flying itself', () => {
  const g = aloft();
  const controls = handsUp({ brake: true, harsh: true, turn: 1 });
  until(g, controls, stillAir(), (wing) => wing.stall > 0);
  controls.locked = true;
  controls.turn = FLIGHT.turn.hook;
  stepFlight(g, controls, stillAir(), STEP);
  assert.deepEqual([g.stall, g.stallSide, g.stallLoad], [0, 0, 0]);
  fly(g, controls, stillAir(), 3);
  assert.equal(g.brake, 0);
  assert.ok(near(g.yawRate, FLIGHT.turn.hook * FLIGHT.turn.trim, 0.01) && near(g.speed, 11.5, 0.2), 'it flies the hook at trim');
  assert.equal(g.turn, FLIGHT.turn.hook);

  const auto = aloft();
  const self = handsUp({ brake: true, bar: true, climb: -2 });
  fly(auto, self, stillAir({ lift: 9, windZ: -6 }), 20);
  assert.ok(near(auto.vy, -2, 0.05), 'it holds the climb it is given');
  assert.deepEqual([auto.brake, auto.bar, auto.stallLoad, auto.stall], [0, 0, 0, 0]);
});

test('near the ground a forgiving stall cannot begin: the meter stops short and the wing just mushes', () => {
  const g = aloft();
  const controls = handsUp({ brake: true });
  const air = stillAir({ clearance: STALL.forgiving.floor - 1 });
  fly(g, controls, air, 20);
  assert.equal(g.stall, 0);
  assert.equal(g.stallLoad, 0.9);
  assert.ok(near(-g.vy, FLIGHT.sink.deep, 0.2));
  // With room below, the same wing goes.
  air.clearance = STALL.forgiving.floor + 1;
  assert.ok(until(g, controls, air, (wing) => wing.stall > 0) < 1);
  // A harsh stall has no such floor.
  const high = aloft();
  assert.ok(until(high, handsUp({ brake: true, harsh: true }), stillAir({ clearance: 1 }), (wing) => wing.stall > 0) < 10);
});

test('from where the ring hint appears, holding the brake comes down inside the ring from more heights than the old dive did', () => {
  // 60 m out from a 24 m ring, flying at its centre, the control held all the way down. A landing
  // counts the first time the pilot is inside the ring and under 9 m; touching down outside it
  // (1.4 m) is a miss. The dive is the old Space key: trim flight with 6.5 m/s of sink added.
  const lands = (height, dive) => {
    const g = createFlight({ x: 0, y: height, z: 60 });
    const controls = handsUp({ brake: !dive });
    const air = stillAir({ sink: dive ? 6.5 : 0 });
    for (let i = 0; i < 60 * 60; i++) {
      air.clearance = g.pos.y;
      stepFlight(g, controls, air, STEP);
      if (Math.hypot(g.pos.x, g.pos.z) < 24 && g.pos.y < 9) return true;
      if (g.pos.y <= 1.4) return false;
    }
    return false;
  };
  const heights = Array.from({ length: 61 }, (_, i) => 20 + i);
  const brake = heights.filter((height) => lands(height, false)).length;
  const dive = heights.filter((height) => lands(height, true)).length;
  assert.ok(brake >= dive, `the brake lands from ${brake} of ${heights.length} heights, the dive from ${dive}`);
  assert.ok(brake >= 40);
});

test('settling puts the wing back at trim with nothing going on, and releasing only lets go of the controls', () => {
  const g = aloft();
  const controls = handsUp({ brake: true, harsh: true, turn: 1 });
  until(g, controls, stillAir({ windX: 3 }), (wing) => wing.stall > 0);
  const { yaw, yawRate, speed } = g;
  assert.equal(releaseFlight(g), g);
  assert.deepEqual([g.brake, g.bar, g.stallLoad, g.stall, g.stallSide, g.stallHarsh, g.grip, g.felt], [0, 0, 0, 0, 0, false, true, false]);
  assert.deepEqual([g.yaw, g.yawRate, g.speed], [yaw, yawRate, speed]);
  settleFlight(g);
  assert.deepEqual([g.yawRate, g.bank, g.vy, g.speed, g.sink, g.turn], [0, 0, 0, FLIGHT.speed.trim, FLIGHT.sink.trim, 0]);
  assert.equal(settleFlight(g, 0).speed, 0);
  const pos = { x: 1, y: 2, z: 3 };
  assert.equal(createFlight(pos).pos, pos, 'the game keeps the vector it draws with');
});

test('every number stays finite and inside its range through an hour of random controls and air', () => {
  const g = aloft();
  const controls = handsUp();
  const air = stillAir();
  let seed = 7;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 60 * 60 * 60; i++) {
    if (i % 23 === 0) {
      controls.turn = random() * 2 - 1;
      controls.brake = random() < 0.5;
      controls.bar = random() < 0.2;
      controls.locked = random() < 0.03;
      controls.harsh = random() < 0.5;
      controls.linger = random() < 0.5;
      controls.climb = random() < 0.05 ? random() * 12 - 6 : null;
      air.lift = random() * 20;
      air.sink = random() * 8;
      air.windX = random() * 12 - 6;
      air.windZ = random() * 12 - 6;
      air.rough = random();
      air.calm = random() < 0.2;
      air.clearance = random() * 400;
    }
    stepFlight(g, controls, air, STEP);
    if (i % 600) continue;
    for (const [key, value] of Object.entries(g)) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key} is ${value}`);
    }
    assert.ok(Number.isFinite(g.pos.x + g.pos.y + g.pos.z));
    assert.ok(g.brake >= 0 && g.brake <= 1 && g.bar >= 0 && g.bar <= 1 && g.stallLoad >= 0 && g.stallLoad <= 1);
    assert.ok(g.speed >= 0 && g.speed < 30 && g.stall >= 0 && Math.abs(g.stallSide) <= 1);
  }
});
