import test from 'node:test';
import assert from 'node:assert/strict';
import { FLIGHT, BRAKE, EARS, FALL, LOOP, PITCH, ROLL, STALL, TIP, TUCK, createFlight, pitchPeak, pitchPhase, releaseFlight, rollPhase, settleFlight, sineRound, stepFlight } from './flight.js';

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

test('the brake is light a fifth of a second after it is pressed, goes deep in about a second over the fjord and lingers under two seconds in a run', () => {
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
  controls.linger = true;
  for (let i = 0; i < 6 * 60; i++) {
    // Held light, eased for a step as it is about to leave the light band.
    controls.brake = g.brake < BRAKE.shelf - 0.02;
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
  assert.ok(straight > 2.5 && straight < 5, `stalled ${straight.toFixed(1)} s after the press`);
  assert.equal(wing.stallSide, 0);
  const [turning, spun] = stallAfter(handsUp({ brake: true, turn: 1 }));
  assert.ok(turning < straight - 0.5, `in a turn ${turning.toFixed(1)} s`);
  assert.equal(spun.stallSide, 1);
  assert.equal(stallAfter(handsUp({ brake: true, turn: -1 }))[1].stallSide, -1);
  // In a run the same hold lasts the linger longer, and then goes just as surely: within about
  // five seconds of the press flying straight, sooner in a turn.
  const [lingering] = stallAfter(handsUp({ brake: true, linger: true, harsh: true, turn: 1 }));
  assert.ok(lingering > BRAKE.linger.run + 1.5 && lingering < BRAKE.linger.run + 3.5, `in a run, turning, ${lingering.toFixed(1)} s`);
  const [run] = stallAfter(handsUp({ brake: true, linger: true, harsh: true }));
  assert.ok(run > 4 && run < 6, `in a run, straight, ${run.toFixed(1)} s`);
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
  // The deep brake stalls the wing within a second or two of the front here; the front takes most of that.
  assert.ok(behind.stalled < calm.stalled - 0.5, `stalled at ${behind.stalled.toFixed(1)} s instead of ${calm.stalled.toFixed(1)} s`);
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
  // The first wind a settled wing meets is where it starts from, however small a change that
  // would have been (this one is well inside what counts as weather), and the next is a gust.
  const g = settleFlight(aloft());
  stepFlight(g, handsUp(), stillAir({ windX: 0.6, windZ: -0.8 }), STEP);
  assert.ok(near(g.speed, 11.5, 1e-9));
  stepFlight(g, handsUp(), stillAir({ windX: 0.6, windZ: -1.6 }), STEP);
  assert.ok(g.speed < 11.5 - 0.7, 'once it has met the air, a change of it is felt');
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

  // A wing stalled by its pilot, taken over by the autopilot: the stall ends on the first step.
  const auto = aloft();
  const self = handsUp({ brake: true, harsh: true, turn: 1 });
  until(auto, self, stillAir(), (wing) => wing.stall > 0);
  assert.ok(auto.stall > 0 && auto.stallSide === 1);
  self.climb = -2;
  stepFlight(auto, self, stillAir(), STEP);
  assert.deepEqual([auto.stall, auto.stallSide, auto.stallLoad], [0, 0, 0]);
  // And flying itself it holds its climb with the hands off, whatever the keys ask.
  self.bar = true;
  self.turn = 0;
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
      controls.ears = random() < 0.2;
      controls.swing = random() < 0.7;
      controls.folds = random() < 0.5;
      controls.safe = random() < 0.2;
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
    assert.ok(g.ears >= 0 && g.ears <= 1 && g.tuck >= 0 && g.tuck <= TUCK.time && g.fallRest >= 0);
    assert.ok(Math.abs(g.pitch) < Math.PI / 2, `the wing swung ${g.pitch.toFixed(2)} rad`);
    assert.ok(Math.abs(g.bank) <= ROLL.limit + 1e-9 && g.tip >= 0 && g.tip <= TIP.time && Math.abs(g.tipSide) <= 1, `banked ${g.bank.toFixed(2)} rad`);
  }
});

test('a wing made safe never stalls, however long and hard the brake is held in a turn, yet still comes down deep', () => {
  const g = aloft();
  const safe = handsUp({ brake: true, turn: 1, harsh: true, linger: true, safe: true });
  let deepest = 0;
  fly(g, safe, stillAir(), 40, () => {
    assert.equal(g.stall, 0);
    deepest = Math.max(deepest, g.brake);
  });
  // The load stops short of the stall, as it does near the ground, and the brake still bites.
  assert.ok(g.stallLoad <= 0.9 + 1e-12 && g.stallLoad > 0.85, `the load stopped at ${g.stallLoad}`);
  assert.equal(deepest, 1);
  assert.ok(g.sink > FLIGHT.sink.deep - 0.5, 'deep brake, the steep way down');
  // The same hands on a wing that is not safe do stall.
  const unsafe = aloft();
  assert.ok(until(unsafe, handsUp({ brake: true, turn: 1, harsh: true, linger: true }), stillAir(), (wing) => wing.stall > 0) < 40);
});

// The air a glider meets flying out of a core: `strong` m/s for `settle` seconds, then falling away
// to nothing over `over` seconds, as it does crossing a hunted core's edge at trim. Returns a
// function for fly()'s `each` that sets it on `air` for the time it is handed.
const outOfLift = (air, { strong = 20, settle = 3, over = 2 } = {}) => (t) => {
  air.lift = t < settle ? strong : Math.max(0, strong * (1 - (t - settle) / over));
};
// A hunted core's lift at full strength, `d` metres from its middle (cloudbase-state.js).
const coreLift = (d) => {
  const t = Math.min(1, Math.max(0, 1 - d / 38));
  return 19.25 * 1.47 * t * t * (3 - 2 * t);
};

test('big ears sink about 6 m/s at 36 km/h, turn a 20 m circle by weight shift alone, and still climb in a strong core', () => {
  const straight = fly(aloft(), handsUp({ ears: true }), stillAir(), 12);
  assert.equal(straight.ears, 1);
  assert.ok(near(straight.speed, FLIGHT.speed.trim - EARS.slow, 1e-3), `${straight.speed} m/s`);
  assert.ok(near(straight.vy, -6.05, 0.01), `${straight.vy} m/s`);
  // 2.6 times the speed bar's sink, and under the deep brake's.
  assert.ok(-straight.vy > 2.5 * 2.3 && -straight.vy < FLIGHT.sink.deep);
  const circling = fly(aloft(), handsUp({ ears: true, turn: 1 }), stillAir(), 12);
  assert.ok(near(circling.yawRate, EARS.turn, 1e-3));
  assert.ok(near(circling.speed / circling.yawRate, 20, 0.05), 'a 20 m circle');
  assert.ok(near(circling.vy, -6.39, 0.01));
  // In a core's 20 m/s it still climbs: the ears fly a pilot out of lift, never out of a core where it stands.
  const climbing = fly(aloft(), handsUp({ ears: true, turn: 1 }), stillAir({ lift: 20 }), 12);
  assert.ok(near(climbing.vy, 13.6, 0.02), `${climbing.vy} m/s`);
});

test('the ears fold in over 0.6 s, open by themselves over 1.5 s once let go, and in a quarter of a second with a touch of the brake, which bites only once they are out', () => {
  const g = aloft();
  const controls = handsUp({ ears: true });
  assert.ok(near(until(g, controls, stillAir(), (wing) => wing.ears === 1), EARS.fold, 1.5 * STEP));
  controls.ears = false;
  assert.ok(near(until(g, controls, stillAir(), (wing) => wing.ears === 0), EARS.open, 1.5 * STEP));
  controls.ears = true;
  fly(g, controls, stillAir(), 1);
  controls.ears = false;
  controls.brake = true;
  let bitAt = -1;
  const opened = until(g, controls, stillAir(), (wing) => {
    if (wing.ears > 0) assert.equal(wing.brake, 0, 'the brake does nothing while the ears are in');
    return wing.ears === 0;
  });
  assert.ok(near(opened, EARS.dab, 1.5 * STEP));
  bitAt = until(g, controls, stillAir(), (wing) => wing.brake >= BRAKE.light);
  assert.ok(near(bitAt, BRAKE.light / BRAKE.take, 2 * STEP), 'then it takes up as ever');
});

test('with the ears in the bar cannot be had, no stall load builds, and a strike, a stall or the autopilot throws them open at once', () => {
  const g = fly(aloft(), handsUp({ ears: true, bar: true }), stillAir(), 3);
  assert.deepEqual([g.ears, g.bar], [1, 0]);
  g.stallLoad = 0.5;
  fly(g, handsUp({ ears: true, turn: 1 }), stillAir({ rough: 1 }), 2);
  assert.ok(g.stallLoad < 0.5, 'the load only drains');
  for (const [what, over] of [['a strike', { locked: true }], ['the autopilot', { climb: 2 }]]) {
    const wing = fly(aloft(), handsUp({ ears: true }), stillAir(), 1);
    stepFlight(wing, handsUp({ ears: true, ...over }), stillAir(), STEP);
    assert.equal(wing.ears, 0, what);
  }
  const stalled = fly(aloft(), handsUp({ ears: true }), stillAir(), 1);
  stalled.stall = 1;
  stepFlight(stalled, handsUp({ ears: true }), stillAir(), STEP);
  assert.equal(stalled.ears, 0, 'a stall');
});

test('a wing never asked for the ears or a swing flies to the last bit the same whether those controls are false or missing', () => {
  const left = aloft();
  const right = aloft();
  const missing = handsUp();
  const off = handsUp({ ears: false, swing: false, folds: false });
  const air = stillAir();
  let seed = 31;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 120 * 60; i++) {
    if (i % 37 === 0) {
      missing.turn = off.turn = Math.floor(random() * 3) - 1;
      missing.brake = off.brake = random() < 0.3;
      missing.bar = off.bar = random() < 0.2;
      missing.harsh = off.harsh = random() < 0.5;
      air.lift = random() * 20;
      air.sink = random() < 0.2 ? 6 : 0;
      air.windX = random() * 4 - 2;
      air.rough = random();
    }
    stepFlight(left, missing, air, STEP);
    stepFlight(right, off, air, STEP);
  }
  assert.deepEqual({ ...left, pos: { ...left.pos } }, { ...right, pos: { ...right.pos } });
  assert.deepEqual([left.ears, left.pitch, left.pitchRate, left.pitchPush, left.tuck], [0, 0, 0, 0, 0]);
});

test('letting go of everything opens the ears and leaves nothing of a swing or a tuck behind', () => {
  const g = fly(aloft(), handsUp({ ears: true }), stillAir(), 1);
  Object.assign(g, { pitch: 0.4, pitchRate: -1, pitchPush: 0.5, tuck: 0.3, fallRest: 1, fallArmed: false, under: 12 });
  releaseFlight(g);
  assert.deepEqual([g.ears, g.pitch, g.pitchRate, g.pitchPush, g.tuck, g.fallRest, g.fallArmed, g.under], [0, 0, 0, 0, 0, 0, true, 0]);
  Object.assign(g, { ears: 1, pitch: -0.3, pitchRate: 0.2, tuck: 0.3 });
  settleFlight(g);
  assert.deepEqual([g.ears, g.pitch, g.pitchRate, g.tuck], [0, 0, 0, 0]);
});

// The swing over the pilot (PITCH). A wing that swings, high in a run where the light brake
// lingers, unless told otherwise; and the degrees its swings are counted in.
const swinging = (over = {}) => handsUp({ swing: true, linger: true, ...over });
const DEG = Math.PI / 180;
// Pitches the wing on purpose, the way it is taught: from a first press, the brake pressed `late`
// seconds after each time the wing swings to its front and let go `late` seconds after each time it
// swings to its back. Stops at a tuck, after `fronts` forward peaks, or after `seconds`, and hands
// back the wing, its controls, the forward peaks in degrees and whether it tucked.
const pitching = (late, { folds = true, seconds = 25, fronts: most = Infinity } = {}) => {
  const g = aloft();
  const controls = swinging({ folds, brake: true });
  const fronts = [];
  let last = 0;
  let timer = -1;
  let want = false;
  for (let i = 0; i < seconds * 60 && fronts.length < most; i++) {
    stepFlight(g, controls, stillAir(), STEP);
    if (g.tuck > 0) return { g, controls, fronts, tucked: true };
    if (last < 0 && g.pitchRate >= 0) {
      fronts.push(-g.pitch / DEG);
      timer = late;
      want = true;
    }
    if (last > 0 && g.pitchRate <= 0) {
      timer = late;
      want = false;
    }
    if (timer >= 0 && (timer -= STEP) < 0) controls.brake = want;
    last = g.pitchRate;
  }
  return { g, controls, fronts, tucked: false };
};
// The reference pilots' catch (pilots.js CATCH): the brake on 0.4 s after the wing starts surging
// toward a peak more than 0.8 rad ahead, held till it swings back. Call once a step, before it.
const catcher = (g, controls) => {
  let surged = 0;
  let catching = false;
  return () => {
    if (catching && g.pitchRate < 0) return;
    catching = false;
    surged = g.pitchRate < 0 && pitchPeak(g) < -0.8 ? surged + 1 : 0;
    controls.brake = catching = surged > 24;
  };
};

test('the wing swings over its pilot every 2.8 s, keeping 0.6 of a free swing each time round', () => {
  const g = aloft();
  const controls = swinging();
  g.pitchRate = -0.6;
  const fronts = [];
  const times = [];
  let last = g.pitchRate;
  for (let i = 1; i <= 12 * 60; i++) {
    stepFlight(g, controls, stillAir(), STEP);
    if (last < 0 && g.pitchRate >= 0) {
      fronts.push(-g.pitch);
      times.push(i * STEP);
    }
    last = g.pitchRate;
  }
  for (let k = 1; k < 4; k++) {
    assert.ok(near(times[k] - times[k - 1], PITCH.period, 0.05), `${(times[k] - times[k - 1]).toFixed(2)} s round`);
    assert.ok(near(fronts[k] / fronts[k - 1], 0.6, 0.03), `${(fronts[k] / fronts[k - 1]).toFixed(2)} of it kept`);
  }
});

test('taking up the light brake swings the wing back about 16°, and letting it go after a long hold swings it ahead about as far', () => {
  const g = aloft();
  const controls = swinging({ brake: true });
  let back = 0;
  // Held light a long while, eased for a step as it is about to go deep, as a pilot taps it.
  fly(g, controls, stillAir(), 7.5, () => {
    back = Math.max(back, g.pitch);
    controls.brake = g.brake < BRAKE.shelf - 0.02;
  });
  controls.brake = true;
  assert.ok(near(back / DEG, 16.4, 1), `${(back / DEG).toFixed(1)}° back`);
  assert.ok(g.brake < BRAKE.shelf, 'still the light brake');
  controls.brake = false;
  let ahead = 0;
  fly(g, controls, stillAir(), 3, () => (ahead = Math.min(ahead, g.pitch)));
  assert.ok(near(-ahead / DEG, 16.5, 3), `${(-ahead / DEG).toFixed(1)}° ahead`);
});

test('letting go of a deep brake surges the wing past its line, where it tucks; braked within 0.4 s it peaks under 45°', () => {
  const deepThen = () => {
    const g = aloft();
    const controls = swinging({ brake: true, linger: false, folds: true });
    fly(g, controls, stillAir(), 1.4);
    assert.equal(g.brake, 1);
    controls.brake = false;
    return [g, controls];
  };
  const [left, alone] = deepThen();
  const tucked = until(left, alone, stillAir(), (wing) => wing.tuck > 0, 3);
  assert.ok(tucked > 0.6 && tucked < 0.9, `tucked ${tucked.toFixed(2)} s after the let-go`);
  for (const [late, under] of [[0.2, 25], [0.4, 45]]) {
    const [g, controls] = deepThen();
    let most = 0;
    // Braked from `late` on while the wing still goes forward, and let go once it swings back.
    fly(g, controls, stillAir(), 4, (t) => {
      controls.brake = t >= late && g.pitchRate < 0;
      most = Math.min(most, g.pitch);
      assert.equal(g.tuck, 0, `braked ${late} s in`);
    });
    assert.ok(-most / DEG < under, `braked ${late} s in, it peaked ${(-most / DEG).toFixed(1)}° ahead`);
  }
});

test('flying out of a core surges the wing: left alone it tucks, braked 0.4 s into the surge it does not, and a light brake already held checks it', () => {
  const out = (controls, drive) => {
    const g = aloft();
    const air = stillAir();
    const lift = outOfLift(air);
    let tuckedAt = Infinity;
    let most = 0;
    const each = drive?.(g, controls);
    fly(g, controls, air, 8, (t) => {
      lift(t);
      each?.(t);
      most = Math.min(most, g.pitch);
      if (g.tuck > 0 && tuckedAt === Infinity) tuckedAt = t;
    });
    return { tuckedAt, most: -most / DEG };
  };
  const alone = out(swinging({ folds: true }));
  assert.ok(alone.tuckedAt > 3 && alone.tuckedAt < 6, `tucked ${alone.tuckedAt.toFixed(2)} s in`);
  const caught = out(swinging({ folds: true }), catcher);
  assert.equal(caught.tuckedAt, Infinity, 'caught');
  assert.ok(caught.most < 50, `it peaked ${caught.most.toFixed(1)}° ahead`);
  // Circling on the light brake as the lift goes: the brake already biting holds the wing.
  const braked = out(swinging({ folds: true, brake: true }));
  assert.equal(braked.tuckedAt, Infinity);
  assert.ok(braked.most < 15, `it surged ${braked.most.toFixed(1)}°`);
});

test('a harsh stall ends in a surge to catch: a brake held through the stall must be let go and pressed again', () => {
  const stallThen = (onStall) => {
    const g = aloft();
    const controls = swinging({ brake: true, harsh: true, linger: false, folds: true });
    until(g, controls, stillAir(), (wing) => wing.stall > 0);
    onStall(controls);
    until(g, controls, stillAir(), (wing) => wing.stall === 0);
    return [g, controls];
  };
  // Held through the stall, the brake has no grip as it flies again, and the surge tucks it.
  const [held, keep] = stallThen(() => {});
  assert.equal(held.grip, false);
  assert.ok(until(held, keep, stillAir(), (wing) => wing.tuck > 0, 2) < 2, 'it tucks');
  // Let go in the stall and pressed again as it flies: the surge is caught.
  const [freed, ask] = stallThen((controls) => (controls.brake = false));
  ask.brake = true;
  let most = 0;
  fly(freed, ask, stillAir(), 3, () => {
    if (freed.pitchRate > 0) ask.brake = false;
    most = Math.min(most, freed.pitch);
    assert.equal(freed.tuck, 0);
  });
  assert.ok(-most / DEG < 30, `it surged ${(-most / DEG).toFixed(1)}°`);
});

test('a circle up to 14 m off a core never tucks the wing, hands up or braked', () => {
  // Circles round a point 14 m from a core's middle, in the core's own lift, each begun already
  // turning as it will go on turning: hands up (a 14.4 m circle, out to 28.4 m from the middle) and
  // on the light brake (8.2 m).
  for (const brake of [false, true]) {
    const g = aloft();
    g.speed = brake ? FLIGHT.speed.light : FLIGHT.speed.trim;
    g.yawRate = brake ? FLIGHT.turn.light : FLIGHT.turn.trim;
    g.brake = brake ? BRAKE.light : 0;
    Object.assign(g.pos, { x: 14 - g.speed / g.yawRate, z: 0 });
    const circling = swinging({ folds: true, turn: 1, brake });
    const at = stillAir();
    let least = Infinity;
    fly(g, circling, at, 60, () => {
      at.lift = coreLift(Math.hypot(g.pos.x, g.pos.z));
      if (g.brake > BRAKE.shelf - 0.01) circling.brake = false;
      else if (brake && !circling.brake && g.brake === 0) circling.brake = true;
      least = Math.min(least, at.lift);
      assert.equal(g.tuck, 0, brake ? 'braked' : 'hands up');
    });
    // Hands up the swing carries the lap a little wider, to about 3 m/s, but the lift falls away
    // there too gently to surge the wing; braked, it stays well inside.
    assert.ok(least > (brake ? FALL.floor : 3), `the lap's weakest lift was ${least.toFixed(1)} m/s`);
  }
});

test('one fall of the air surges the wing once, and no fall comes within the rest after the last', () => {
  const g = aloft();
  const controls = swinging();
  const air = stillAir({ lift: 20 });
  fly(g, controls, air, 3);
  let surges = 0;
  let rest = g.fallRest;
  const count = () => {
    if (g.fallRest > rest) surges += 1;
    rest = g.fallRest;
  };
  // A sharp fall, the air back for half a second, and another within the rest.
  air.lift = 0;
  fly(g, controls, air, 0.5, count);
  air.lift = 20;
  fly(g, controls, air, 0.5, count);
  air.lift = 0;
  fly(g, controls, air, 0.4, count);
  count();
  assert.equal(surges, 1);
  // After the rest, a fresh fall surges it again.
  air.lift = 20;
  fly(g, controls, air, 2, count);
  air.lift = 0;
  fly(g, controls, air, 0.5, count);
  count();
  assert.equal(surges, 2);
});

test('pitching in time builds the swing to 45° by the third pump and, kept up, tucks the wing; late by a second it never builds', () => {
  const timed = pitching(0.2);
  assert.ok(timed.tucked, 'kept up, it tucks');
  const [first, second, third] = timed.fronts;
  assert.ok(first > 20 && second > first + 10 && third >= 45, `forward peaks ${timed.fronts.map((f) => f.toFixed(0)).join(', ')}°`);
  // A little late still builds, if less; nearly a second late, never.
  assert.ok(pitching(0.45).tucked);
  const late = pitching(0.9, { seconds: 20 });
  assert.equal(late.tucked, false);
  assert.ok(Math.max(...late.fronts) < 25, `late, it never passed ${Math.max(...late.fronts).toFixed(0)}°`);
});

test('braking as the wing swings forward calms a pitched swing within 4 s; left alone it swings on, and braking as it swings back makes it bigger', () => {
  const settle = (drive) => {
    const { g, controls } = pitching(0.2, { fronts: 3 });
    controls.brake = false;
    let calmAt = Infinity;
    let back = 0;
    for (let i = 1; i <= 12 * 60; i++) {
      drive(g, controls);
      stepFlight(g, controls, stillAir(), STEP);
      back = Math.max(back, g.pitch);
      if (calmAt === Infinity && Math.abs(g.pitch) < 4 * DEG && Math.abs(g.pitchRate) < 0.3) calmAt = i * STEP;
    }
    return { calmAt, back: back / DEG };
  };
  const caught = settle((g, controls) => (controls.brake = g.pitch < 0 && g.pitchRate < 0));
  const alone = settle(() => {});
  const wrong = settle((g, controls) => (controls.brake = g.pitchRate > 0 && g.pitch > -0.2));
  assert.ok(caught.calmAt < 4, `calm ${caught.calmAt.toFixed(2)} s on`);
  assert.ok(alone.calmAt > 8, `left alone, calm ${alone.calmAt.toFixed(2)} s on`);
  assert.ok(wrong.back > alone.back + 8, `braked as it swung back it went ${wrong.back.toFixed(1)}° back, left alone ${alone.back.toFixed(1)}°`);
});

test('where the wing cannot fold, a swing past its line is stopped short and never runs away', () => {
  const g = aloft();
  const controls = swinging({ brake: true, linger: false });
  fly(g, controls, stillAir(), 1.4);
  controls.brake = false;
  let most = 0;
  fly(g, controls, stillAir(), 4, () => (most = Math.min(most, g.pitch)));
  assert.equal(g.tuck, 0);
  assert.ok(-most > PITCH.line && -most < PITCH.line + 0.15, `stopped ${(-most / DEG).toFixed(1)}° ahead`);
  // Pitched on and on over the fjord, where every long hold is a deep let-go.
  const fjord = pitching(0.2, { folds: false, seconds: 30 });
  assert.equal(fjord.tucked, false);
  assert.ok(Math.max(...fjord.fronts) < 70, `never past ${Math.max(...fjord.fronts).toFixed(1)}°`);
});

test('swung ahead the wing gathers airspeed and swung back it gives it up, and no way of working the brake loses less height than the steady light brake', () => {
  const g = aloft();
  g.pitchRate = -1.5;
  let fast = 0;
  let slow = Infinity;
  fly(g, swinging(), stillAir(), 3, () => {
    if (g.pitch < -0.3) fast = Math.max(fast, g.speed);
    if (g.pitch > 0.3) slow = Math.min(slow, g.speed);
  });
  assert.ok(fast > FLIGHT.speed.trim + 0.4 && slow < FLIGHT.speed.trim - 0.2, `${slow.toFixed(2)} to ${fast.toFixed(2)} m/s`);
  const lost = (drive) => {
    const wing = aloft();
    const controls = swinging();
    fly(wing, controls, stillAir(), 60, (t) => drive(controls, t, wing));
    return HIGH - wing.pos.y;
  };
  const steadyLight = lost((controls, t, wing) => (controls.brake = wing.brake < BRAKE.shelf - 0.02));
  const patterns = [0.6, 1, 1.4, 2, 2.8, 4].map((period) => lost((controls, t) => (controls.brake = t % period < period / 2)));
  for (const pumped of patterns) assert.ok(pumped >= steadyLight - 0.5, `${pumped.toFixed(1)} m against ${steadyLight.toFixed(1)} m`);
  assert.ok(near(steadyLight, 58.2, 0.5));
});

test('a wing swung far back on the light brake builds stall load that the same brake never builds upright, and a safe wing never stalls', () => {
  // On the light brake, eased for a step whenever it is about to go deep.
  const load = (pitch, over = {}) => {
    const g = aloft();
    const controls = swinging({ brake: true, ...over });
    const light = () => (controls.brake = g.brake < BRAKE.shelf - 0.02);
    fly(g, controls, stillAir(), 3, light);
    g.pitch = pitch;
    let most = 0;
    fly(g, controls, stillAir(), 1.5, () => {
      light();
      most = Math.max(most, g.stallLoad);
    });
    return most;
  };
  assert.ok(load(1) > 0.03, `${load(1).toFixed(3)} swung back`);
  assert.equal(load(0), 0);
  const safe = aloft();
  const controls = swinging({ brake: true, safe: true, harsh: true });
  fly(safe, controls, stillAir(), 30, (t) => {
    if (t % 1.4 < STEP) safe.pitch = 1;
    assert.equal(safe.stall, 0);
  });
});

test('a raven strike, the autopilot and a falling stall take the swing over', () => {
  for (const over of [{ locked: true }, { climb: 1 }]) {
    const g = aloft();
    Object.assign(g, { pitch: -0.6, pitchRate: -1, pitchPush: -0.5 });
    stepFlight(g, swinging({ folds: true, ...over }), stillAir(), STEP);
    assert.deepEqual([g.pitch, g.pitchRate, g.pitchPush], [0, 0, 0], JSON.stringify(over));
  }
  // Falling, the wing hangs back behind the pilot, whatever it was doing.
  const g = aloft();
  const controls = swinging({ brake: true, harsh: true, linger: false });
  until(g, controls, stillAir(), (wing) => wing.stall > 0);
  g.pitchRate = -1;
  fly(g, controls, stillAir(), 1.5);
  assert.ok(g.stall > STALL.surge && near(g.pitch, PITCH.stall, 0.1), `${(g.pitch / DEG).toFixed(1)}° back`);
});

test('a front-collapsed wing is the air\'s for 1.6 s: the hands and steering do nothing, it holds its heading and comes down about 29 m more', () => {
  const g = aloft();
  const twin = aloft();
  g.pitchRate = twin.pitchRate = -2.8;
  const controls = swinging({ folds: true });
  until(g, controls, stillAir(), (wing) => wing.tuck > 0, 2);
  assert.equal(g.tuck, TUCK.time);
  const heading = g.yaw;
  const asked = swinging({ folds: true, brake: true, turn: 1 });
  const from = g.pos.y;
  fly(g, asked, stillAir(), TUCK.time - STEP, () => assert.equal(g.brake, 0, 'the brake does nothing'));
  assert.ok(Math.abs(g.yaw - heading) < 1e-9 && g.yawRate === 0, 'the heading held');
  fly(g, controls, stillAir(), 4);
  // The same time flown by a wing that never tucked, from rest at trim.
  const plain = fly(aloft(), swinging(), stillAir(), TUCK.time - STEP + 4);
  const extra = from - g.pos.y - (HIGH - plain.pos.y);
  assert.ok(near(extra, TUCK.sink * TUCK.time, 1.5), `the tuck cost ${extra.toFixed(1)} m more`);
});

test('a front collapse is pumped open: each brake held 0.3 s and let go opens it 0.4 s sooner, twice at most, and a shorter hold is no pump', () => {
  const lasted = (pattern) => {
    const g = aloft();
    g.pitchRate = -2.8;
    const controls = swinging({ folds: true });
    until(g, controls, stillAir(), (wing) => wing.tuck > 0, 2);
    let t = 0;
    const open = until(g, controls, stillAir(), (wing) => {
      t += STEP;
      controls.brake = pattern(t);
      return wing.tuck === 0;
    }, 3);
    return [open, g.tuckPumps];
  };
  const [alone] = lasted(() => false);
  // Held 0.35 s and let go for 0.1, as the reference pilots pump (CATCH).
  const [pumped, pumps] = lasted((t) => t % 0.45 < 0.35);
  const [short, none] = lasted((t) => t % 0.3 < 0.2);
  assert.ok(near(alone, TUCK.time, 2 * STEP), `left alone it opened after ${alone.toFixed(2)} s`);
  assert.equal(pumps, TUCK.pump.most);
  assert.ok(near(pumped, TUCK.time - TUCK.pump.most * TUCK.pump.cut, 2 * STEP), `pumped, after ${pumped.toFixed(2)} s`);
  assert.equal(none, 0, 'held too short, it is no pump');
  assert.ok(near(short, TUCK.time, 2 * STEP));
});

test('with the ears in nothing tucks, and they damp the swing', () => {
  const surge = (ears) => {
    const g = aloft();
    g.ears = ears ? 1 : 0;
    g.pitchRate = -2.8;
    let most = 0;
    let tucked = false;
    fly(g, swinging({ folds: true, ears }), stillAir(), 3, () => {
      most = Math.min(most, g.pitch);
      tucked ||= g.tuck > 0;
    });
    return { most: -most / DEG, tucked };
  };
  assert.equal(surge(false).tucked, true);
  const eared = surge(true);
  assert.equal(eared.tucked, false);
  assert.ok(eared.most < 50, `${eared.most.toFixed(1)}° ahead with the ears in`);
});

test('pitchPeak says which way a swing will turn and about how far, counting the push still owed', () => {
  const g = aloft();
  const controls = swinging();
  g.pitch = -0.1;
  g.pitchRate = -1.2;
  const said = pitchPeak(g);
  const [peak] = (() => {
    let last = g.pitchRate;
    for (let i = 0; i < 180; i++) {
      stepFlight(g, controls, stillAir(), STEP);
      if (Math.sign(g.pitchRate) !== Math.sign(last)) return [g.pitch];
      last = g.pitchRate;
    }
    return [NaN];
  })();
  assert.ok(said < 0 && peak < 0 && near(said, peak, 0.12), `said ${said.toFixed(3)}, turned at ${peak.toFixed(3)}`);
  // A push still owed carries it further than its swing alone.
  const pushed = aloft();
  Object.assign(pushed, { pitch: -0.1, pitchRate: -1.2, pitchPush: -0.5 });
  assert.ok(pitchPeak(pushed) < said);
  assert.ok(pitchPeak(Object.assign(aloft(), { pitch: 0.1, pitchRate: 0.5 })) > 0, 'going back, it turns behind');
});

// The swing side to side (ROLL): wingovers. Holds a full turn for 20 s, then reverses it whenever
// the drawn bank stops rolling, `late` seconds after that (a whole number of steps), until `swaps`
// tops have gone by or the wing tips. Hands back the wing, its controls, the bank at each top in
// degrees and whether it tipped.
const wingovers = (late = 0, { folds = false, swaps = 10, over = {} } = {}) => {
  const g = aloft();
  const controls = swinging({ turn: 1, folds, ...over });
  fly(g, controls, stillAir(), 20);
  controls.turn = -1;
  const tops = [];
  let last = g.bank;
  let rolling = 0;
  let wait = -1;
  for (let i = 0; i < 60 * 30 && tops.length < swaps; i++) {
    stepFlight(g, controls, stillAir(), STEP);
    if (g.tip > 0) return { g, controls, tops, tipped: true };
    const rate = g.bank - last;
    if (rolling * rate < 0 && Math.abs(g.bank) > 0.3) {
      tops.push(Math.abs(g.bank) / DEG);
      wait = Math.round(late / STEP);
    }
    if (wait === 0) controls.turn = g.bank > 0 ? -1 : 1;
    if (wait >= 0) wait -= 1;
    if (rate !== 0) rolling = rate;
    last = g.bank;
  }
  return { g, controls, tops, tipped: false };
};

test('with the swing on, a held turn settles exactly where it always has, at trim, on the bar and with the ears', () => {
  for (const over of [{}, { bar: true }, { ears: true }]) {
    const on = fly(aloft(), swinging({ turn: 1, ...over }), stillAir(), 60);
    const off = fly(aloft(), handsUp({ turn: 1, linger: true, ...over }), stillAir(), 60);
    const what = JSON.stringify(over);
    assert.ok(near(on.speed / on.yawRate, off.speed / off.yawRate, 1e-5), `${what}: a ${(on.speed / on.yawRate).toFixed(6)} m circle`);
    assert.ok(near(on.vy, off.vy, 1e-5), `${what}: ${on.vy.toFixed(6)} m/s`);
    assert.ok(near(on.bank, off.bank, 1e-6) && Math.abs(on.roll) < 1e-6, `${what}: bank ${on.bank.toFixed(6)}`);
  }
  // The trim circle as it always was: 14.375 m, 1.84 m/s down, banked 0.6.
  const trim = fly(aloft(), swinging({ turn: 1 }), stillAir(), 60);
  assert.ok(near(trim.speed / trim.yawRate, 14.375, 1e-4) && near(trim.vy, -1.84, 1e-4) && near(trim.bank, 0.6, 1e-4));
});

test('one reversal of a held turn swings the bank to 45°, and left alone the swing keeps about 0.73 of itself each half-swing', () => {
  const g = aloft();
  const controls = swinging({ turn: 1 });
  fly(g, controls, stillAir(), 20);
  controls.turn = -1;
  let most = 0;
  fly(g, controls, stillAir(), 2.5, () => (most = Math.min(most, g.bank)));
  assert.ok(near(-most / DEG, 45, 1.5), `${(-most / DEG).toFixed(1)}°`);
  // A swing set going with the turn held steady: its tops either side of where it hangs.
  const free = aloft();
  free.rollRate = 1.2;
  const tops = [];
  let last = free.bank;
  let rolling = 0;
  fly(free, swinging(), stillAir(), 6, () => {
    const rate = free.bank - last;
    if (rolling * rate < 0) tops.push(Math.abs(free.bank));
    if (rate !== 0) rolling = rate;
    last = free.bank;
  });
  for (let k = 1; k < 4; k++) assert.ok(near(tops[k] / tops[k - 1], 0.73, 0.04), `${(tops[k] / tops[k - 1]).toFixed(2)} kept`);
});

test('reversing the turn as each swing peaks builds the bank to 60° by the third reversal and 75° by the sixth; 0.2 s late still builds most of the way', () => {
  const timed = wingovers(0);
  const [first, , third, , , sixth] = timed.tops;
  assert.ok(near(first, 45, 1.5) && third >= 60 && sixth >= 74, `tops ${timed.tops.map((top) => top.toFixed(0)).join(', ')}°`);
  assert.ok(Math.max(...timed.tops) <= ROLL.limit / DEG + 1e-9, 'never past the limit');
  const late = wingovers(0.2);
  assert.ok(late.tops[5] >= 65, `0.2 s late: ${late.tops.map((top) => top.toFixed(0)).join(', ')}°`);
});

test('mashing the turn faster than once a second never banks the wing past 40°, and only the swing\'s own beat builds it', () => {
  const most = (every) => {
    const g = aloft();
    const controls = swinging({ turn: 1 });
    let banked = 0;
    fly(g, controls, stillAir(), 30, (t) => {
      controls.turn = Math.floor(t / every) % 2 ? -1 : 1;
      banked = Math.max(banked, Math.abs(g.bank));
    });
    return banked / DEG;
  };
  for (const every of [0.2, 0.4, 0.7, 0.9]) assert.ok(most(every) < 40, `every ${every} s: ${most(every).toFixed(1)}°`);
  assert.ok(most(ROLL.period / 2) > 70, 'a reversal every half-swing builds it to the limit');
});

test('steering a wingover back toward level settles it in about 4 s, where let swing it takes 10', () => {
  const settle = (steer) => {
    const { g, controls } = wingovers(0, { swaps: 4 });
    for (let i = 1; i <= 15 * 60; i++) {
      controls.turn = steer(g);
      stepFlight(g, controls, stillAir(), STEP);
      if (Math.abs(g.bank) < 10 * DEG && Math.abs(g.roll) < 0.05 && Math.abs(g.rollRate) < 0.1 && Math.abs(g.yawRate) < 0.2) return i * STEP;
    }
    return Infinity;
  };
  const alone = settle(() => 0);
  const steered = settle((g) => -Math.sign(g.bank));
  assert.ok(steered < 5 && alone > 8, `steered toward level, level in ${steered.toFixed(2)} s; let swing, ${alone.toFixed(2)} s`);
});

test('a wingover slows and climbs at its top and dives fast at its bottom, and past 50° the bank turns the wing harder than asked', () => {
  const g = aloft();
  const controls = swinging({ turn: 1 });
  fly(g, controls, stillAir(), 20);
  controls.turn = -1;
  const tops = [];
  const bottoms = [];
  let turnedPast = 0;
  let last = g.bank;
  let rolling = 0;
  while (tops.length < 6) {
    const yaw = g.yaw;
    stepFlight(g, controls, stillAir(), STEP);
    // Turned further than the turn alone would carry it, where the bank is past 50°.
    if (Math.abs(g.bank) > ROLL.steep + 0.05) turnedPast = Math.max(turnedPast, Math.abs(g.yaw - yaw) / STEP - Math.abs(g.yawRate));
    const rate = g.bank - last;
    if (rolling * rate < 0 && Math.abs(g.bank) > 0.3) {
      tops.push({ speed: g.speed, vy: g.vy });
      controls.turn = g.bank > 0 ? -1 : 1;
    }
    if (last * g.bank < 0) bottoms.push({ speed: g.speed, vy: g.vy });
    if (rate !== 0) rolling = rate;
    last = g.bank;
  }
  const [top, bottom] = [tops.at(-1), bottoms.at(-1)];
  assert.ok(top.speed < bottom.speed - 3, `${top.speed.toFixed(1)} m/s at the top, ${bottom.speed.toFixed(1)} at the bottom`);
  assert.ok(top.vy > bottom.vy + 3, `${top.vy.toFixed(1)} m/s at the top, ${bottom.vy.toFixed(1)} at the bottom`);
  assert.ok(turnedPast > 0.1, `${turnedPast.toFixed(2)} rad/s more than asked`);
});

test('a minute of wingovers comes down further than a minute straight or circling, and no way of working the turn ends higher, counting speed as height', () => {
  const lost = (drive, seconds = 60) => {
    const g = aloft();
    const controls = swinging({ turn: 1 });
    fly(g, controls, stillAir(), 20);
    const from = g.pos.y + (g.speed * g.speed) / (2 * 9.81);
    fly(g, controls, stillAir(), seconds, (t) => drive(controls, t, g));
    return from - (g.pos.y + (g.speed * g.speed) / (2 * 9.81));
  };
  const circling = lost(() => {});
  const straight = lost((controls) => (controls.turn = 0));
  let rolling = 0;
  let last = 0;
  const timed = lost((controls, t, g) => {
    const rate = g.bank - last;
    if (rolling * rate < 0 && Math.abs(g.bank) > 0.3) controls.turn = g.bank > 0 ? -1 : 1;
    if (rate !== 0) rolling = rate;
    last = g.bank;
  });
  assert.ok(timed > straight + 60 && timed > circling + 30, `wingovers ${timed.toFixed(1)} m, straight ${straight.toFixed(1)}, circling ${circling.toFixed(1)}`);
  for (const every of [0.5, 0.9, 1.18, 1.5, 2.5, 4]) {
    const worked = lost((controls, t) => (controls.turn = Math.floor(t / every) % 2 ? -1 : 1));
    assert.ok(worked >= Math.min(straight, circling) - 0.5, `reversing every ${every} s lost ${worked.toFixed(1)} m`);
  }
});

test('over the fjord or low in a run a wingover tops out at the limit; high in a run the outer wing tips, with no stall', () => {
  const safe = wingovers(0, { swaps: 14 });
  assert.equal(safe.tipped, false);
  assert.ok(Math.max(...safe.tops) <= ROLL.limit / DEG + 1e-9);
  const high = wingovers(0, { folds: true, swaps: 14 });
  assert.ok(high.tipped, `tops ${high.tops.map((top) => top.toFixed(0)).join(', ')}°`);
  assert.equal(high.g.stall, 0);
  // Folds over the fjord never tip a wing that is safe.
  assert.equal(wingovers(0, { folds: true, swaps: 14, over: { safe: true } }).tipped, false);
});

test('a tip collapse takes the wing for a second: the hands do nothing, it hooks toward the folded half and comes down further', () => {
  const { g } = wingovers(0, { folds: true, swaps: 14 });
  assert.equal(g.tip, TIP.time);
  const side = g.tipSide;
  assert.equal(side, -Math.sign(g.bank), 'the outer half, the high one, folds');
  const heading = g.yaw;
  const from = g.pos.y;
  fly(g, swinging({ folds: true, brake: true, turn: -side }), stillAir(), TIP.time - STEP, () => assert.equal(g.brake, 0, 'the brake does nothing'));
  assert.ok((g.yaw - heading) * side > 0.25, `hooked ${((g.yaw - heading) * side).toFixed(2)} rad toward the folded half`);
  assert.ok(from - g.pos.y > TIP.sink * TIP.time * 0.6, `${(from - g.pos.y).toFixed(1)} m in the second`);
  stepFlight(g, swinging(), stillAir(), STEP);
  assert.equal(g.tip, 0);
});

test('a raven strike, the autopilot or letting go ends a tip', () => {
  for (const over of [{ locked: true }, { climb: 1 }]) {
    const g = aloft();
    Object.assign(g, { tip: 0.6, tipSide: 1 });
    stepFlight(g, swinging({ folds: true, ...over }), stillAir(), STEP);
    assert.equal(g.tip, 0, JSON.stringify(over));
  }
  const g = aloft();
  Object.assign(g, { tip: 0.6, tipSide: -1, bank: 1.2, lean: 0.5, roll: 0.7, rollRate: 2, rollRest: 0.2, rollSpeed: -2 });
  releaseFlight(g);
  assert.deepEqual([g.tip, g.tipSide, g.roll, g.rollRate, g.rollRest, g.rollSpeed, g.lean, g.bank], [0, 0, 0, 0, 0, 0, 1.2, 1.2]);
  settleFlight(g);
  assert.deepEqual([g.bank, g.lean], [0, 0]);
});

test('rollPhase says when a wingover\'s bank next stops rolling, and how far it will have banked, to within a frame', () => {
  for (const after of [0.05, 0.3, 0.6, 0.85]) {
    const g = aloft();
    const controls = swinging({ turn: 1 });
    fly(g, controls, stillAir(), 20);
    controls.turn = -1;
    fly(g, controls, stillAir(), after);
    const said = rollPhase(g, {});
    let last = g.bank;
    let way = 0;
    let at = Infinity;
    let bank = NaN;
    for (let i = 1; i < 300 && at === Infinity; i++) {
      stepFlight(g, controls, stillAir(), STEP);
      const turning = Math.sign(g.bank - last);
      if (way === 0) way = turning;
      else if (turning !== 0 && turning !== way) [at, bank] = [(i - 1) * STEP, last];
      last = g.bank;
    }
    assert.ok(near(said.toPeak, at, 1.5 * STEP), `${after} s in: said ${said.toPeak.toFixed(3)} s, peaked ${at.toFixed(3)} s`);
    assert.ok(near(said.bank, bank, 2 * DEG), `${after} s in: said ${(said.bank / DEG).toFixed(1)}°, banked ${(bank / DEG).toFixed(1)}°`);
  }
  // A turn held long has all but no swing left in it, and comes to its top where it stands.
  const held = rollPhase(fly(aloft(), swinging({ turn: 1 }), stillAir(), 30), {});
  assert.ok(held.size < 1e-3 && near(held.bank, 0.6, 1e-3), JSON.stringify(held));
});

test('pitchPhase says when a free swing next turns and where, and when it would cross the tuck line on the way, to within a frame', () => {
  for (const [rate, push] of [[-1.2, 0], [-0.6, -1], [0.9, 0]]) {
    const g = aloft();
    Object.assign(g, { pitch: -0.05, pitchRate: rate, pitchPush: push });
    const said = pitchPhase(g, {});
    let crossed = Infinity;
    let at = Infinity;
    let peak = NaN;
    const way = Math.sign(rate + PITCH.share * push);
    for (let i = 1; i < 180 && at === Infinity; i++) {
      stepFlight(g, swinging(), stillAir(), STEP);
      if (crossed === Infinity && g.pitch < -PITCH.line && g.pitchRate < 0) crossed = i * STEP;
      if (Math.sign(g.pitchRate) === -way) [at, peak] = [i * STEP, g.pitch];
    }
    assert.ok(near(said.toPeak, at, 1.5 * STEP), `said ${said.toPeak.toFixed(3)} s, turned ${at.toFixed(3)} s`);
    assert.ok(near(said.peak, peak, 0.03), `said ${said.peak.toFixed(3)}, turned at ${peak.toFixed(3)}`);
    assert.equal(said.toLine === Infinity, crossed === Infinity);
  }
  // A surge that will cross the line is told so, before it peaks.
  const surge = Object.assign(aloft(), { pitch: -0.2, pitchRate: -2.6 });
  const said = pitchPhase(surge, {});
  assert.ok(said.toLine < said.toPeak, JSON.stringify(said));
});

// Wingovers swapped at each top until one tops out past a loop's entry, the brake pressed there,
// and then `press(k, top)` asked what to do at each of the loop's moments (the first top is 1): 'on'
// to press its key there, a number to press that many seconds late, 'skip', or 'wrong' for the other
// key. Flies until the loop is over or `seconds` have gone, and says what came of it.
function looped({ press = () => 'on', folds = true, safe = false, seconds = 24 } = {}) {
  const g = aloft();
  const controls = swinging({ turn: 1, harsh: true, folds, safe });
  fly(g, controls, stillAir(), 20);
  controls.turn = -1;
  let rolling = 0;
  let last = 0;
  let entered = false;
  for (let i = 0; i < 40 * 60 && !entered; i++) {
    stepFlight(g, controls, stillAir(), STEP);
    const rate = g.bank - last;
    if (rolling * rate < 0) {
      if (Math.abs(g.bank) >= LOOP.entry) {
        controls.brake = true;
        stepFlight(g, controls, stillAir(), STEP);
        controls.brake = false;
        entered = true;
      } else controls.turn = g.bank > 0 ? -1 : 1;
    }
    if (rate !== 0) rolling = rate;
    last = g.bank;
  }
  assert.ok(entered && g.loop !== 0, 'the loop began');
  controls.turn = 0;
  const from = g.pos.y;
  const round = [];
  let t = 0;
  let k = 0;
  let next = g.loopNext;
  let due = null;
  let tucked = false;
  let mostLoad = 0;
  while (t < seconds && g.loop !== 0) {
    if (g.loopNext !== next) {
      k += 1;
      const top = Math.round(next / Math.PI) % 2 === 1;
      const what = press(k, top);
      if (what !== 'skip') due = { at: t + (typeof what === 'number' ? what : 0), key: (what === 'wrong') === top ? 'brake' : 'bar' };
      next = g.loopNext;
    }
    controls.brake = controls.bar = false;
    if (due && t >= due.at) controls[due.key] = t < due.at + 0.1;
    const loops = g.loops;
    stepFlight(g, controls, stillAir(), STEP);
    t += STEP;
    if (g.loops > loops) round.push(t);
    tucked ||= g.tuck > 0;
    mostLoad = Math.max(mostLoad, g.stallLoad);
    // Round the loop the wing never swings, and the turn it went in with eases out.
    if (g.loop !== 0) assert.ok(g.pitch === 0 && Math.abs(g.yawRate) < (t < 3 ? 1 : 1e-3), `t ${t.toFixed(2)}: pitch ${g.pitch}, yaw rate ${g.yawRate}`);
  }
  return { g, loops: round.length, each: round.length > 1 ? (round.at(-1) - round[0]) / (round.length - 1) : NaN, lost: from - g.pos.y, t, tucked, mostLoad };
}

test('a wingover banked past 66° rolls on over its top with the brake pressed there, and goes round for as long as ▲ over the wing and ▼ under it come on time', () => {
  const { loops, each, lost, t, mostLoad, g } = looped();
  assert.ok(loops >= 9 && t >= 24 - 1e-9, `${loops} loops in ${t.toFixed(1)} s`);
  assert.ok(near(each, 2.4, 0.2), `${each.toFixed(2)} s a loop`);
  assert.ok(near(lost / loops, 32, 4), `${(lost / loops).toFixed(1)} m a loop`);
  assert.equal(mostLoad, 0, 'with no stall load');
  assert.ok(g.loopTimed >= 2 * loops, `${g.loopTimed} presses on time`);
  // A press as late as 0.25 s still counts.
  assert.ok(looped({ press: () => 0.25 }).loops >= 9);
  // No brake, no loop: the same wingover never goes over the top.
  const g2 = aloft();
  const controls = swinging({ turn: 1, harsh: true, folds: true });
  fly(g2, controls, stillAir(), 20);
  controls.turn = -1;
  fly(g2, controls, stillAir(), 10);
  assert.ok(g2.loop === 0 && Math.abs(g2.bank) <= ROLL.limit + 1e-9);
});

test('a press skipped rolls the loop out cleanly into a wingover\'s swing, and a wrong one collapses the wing where it can fold and only rolls it out over the fjord', () => {
  for (const k of [3, 4]) {
    const skipped = looped({ press: (n) => (n === k ? 'skip' : 'on') });
    assert.ok(skipped.loops <= 2 && skipped.g.loop === 0 && !skipped.tucked, `skipping moment ${k}: ${skipped.loops} loops`);
    assert.ok(Math.abs(skipped.g.bank) <= ROLL.limit + 1e-9, 'handed back within a wingover\'s bank');
  }
  const botched = looped({ press: (n) => (n === 3 ? 'wrong' : 'on') });
  assert.ok(botched.tucked && botched.g.loop === 0, 'a front collapse where the wing can fold');
  const safe = looped({ press: (n) => (n === 3 ? 'wrong' : 'on'), folds: false });
  assert.ok(!safe.tucked && safe.g.loop === 0, 'only rolled out over the fjord');
  // Never pressed at all, the entry alone carries it round once.
  assert.ok(looped({ press: () => 'skip' }).loops <= 1);
});

test('the hand-back to the wingover\'s swing is continuous, and the swing then fades', () => {
  const { g } = looped({ press: (n) => (n === 3 ? 'skip' : 'on') });
  const controls = swinging({ harsh: true, folds: true });
  let last = g.bank;
  let jump = 0;
  fly(g, controls, stillAir(), 8, () => {
    jump = Math.max(jump, Math.abs(g.bank - last));
    last = g.bank;
  });
  assert.ok(jump < 0.15, `the bank moved at most ${jump.toFixed(3)} rad a step`);
  assert.ok(Math.abs(g.bank) < 0.2 && g.loop === 0, `settled at ${(g.bank / DEG).toFixed(1)}°`);
});

// The wingovers looped() flies, swapped at each top until one tops out past a loop's entry, with the
// brake pressed for 0.05 s from `brakeAt` seconds in, the wing surging there if `surge`: when that
// top's bank passed the entry and fell back from it, whether a loop began, and the wing and its
// controls as they were left.
function steepWingovers(brakeAt = Infinity, surge = false) {
  const g = aloft();
  const controls = swinging({ turn: 1, harsh: true, folds: true });
  fly(g, controls, stillAir(), 20);
  controls.turn = -1;
  let rolling = 0;
  let last = 0;
  let up = NaN;
  let down = NaN;
  for (let i = 0; i < 40 * 60 && g.loop === 0 && !(i * STEP > brakeAt + LOOP.early + 0.1); i++) {
    const t = i * STEP;
    controls.brake = t >= brakeAt && t < brakeAt + 0.05;
    if (surge && controls.brake && t < brakeAt + STEP / 2) {
      g.pitch = -0.3;
      g.pitchRate = -2;
    }
    stepFlight(g, controls, stillAir(), STEP);
    if (Number.isNaN(up) && Math.abs(g.bank) >= LOOP.entry) up = t + STEP;
    if (!Number.isNaN(up) && Number.isNaN(down) && Math.abs(g.bank) < LOOP.entry) down = t + STEP;
    const rate = g.bank - last;
    if (rolling * rate < 0 && Math.abs(g.bank) < LOOP.entry && Number.isNaN(up)) controls.turn = g.bank > 0 ? -1 : 1;
    if (rate !== 0) rolling = rate;
    last = g.bank;
  }
  return { up, down, looped: g.loop !== 0, g, controls };
}

test('a tap of the brake loops a wingover from 0.12 s before its bank passes 66° until 0.2 s after it falls back, the window a swap there counts in', () => {
  const { up, down, looped: flown } = steepWingovers();
  assert.ok(!flown && down - up > 0.1, `past 66° from ${up.toFixed(2)} s to ${down.toFixed(2)} s`);
  for (const [at, loops] of [[up - 0.2, false], [up - 0.1, true], [up, true], [down, true], [down + 0.15, true], [down + 0.25, false]]) {
    assert.equal(steepWingovers(at).looped, loops, `tapped ${(at - up).toFixed(2)} s from passing 66°, ${(at - down).toFixed(2)} s from falling back`);
  }
});

test('round a loop the heading holds whatever the turn asked, unless the edge of the map is turning the glider back', () => {
  const { up } = steepWingovers();
  const swung = (turn, steered) => {
    const { g, controls } = steepWingovers(up);
    Object.assign(controls, { turn, steered });
    const yaw = g.yaw;
    fly(g, controls, stillAir(), 1.5);
    assert.ok(g.loop !== 0 && !g.loopOut, 'still going round');
    return g.yaw - yaw;
  };
  // The pilot's turn does nothing: only the turn it went in with, easing out, moves the heading.
  assert.equal(swung(1, false), swung(0, false));
  assert.ok(Math.abs(swung(0, false)) < 0.3);
  // The edge's turns it back the way it asks, round and round as it goes.
  assert.ok(swung(1, true) - swung(0, false) > 0.5, `${swung(1, true).toFixed(2)} rad`);
});

test('the brake pressed at a steep top as the wing surges is its catch, and loops nothing', () => {
  const { up } = steepWingovers();
  assert.ok(steepWingovers(up).looped, 'calm, the press loops it');
  assert.ok(!steepWingovers(up, true).looped, 'surging, it catches the surge');
});

test('the sine of any angle is plain arithmetic within 1e-5 of the true one, all the way round and beyond', () => {
  for (let x = -20; x <= 20; x += 0.01) assert.ok(Math.abs(sineRound(x) - Math.sin(x)) < 1e-5, `at ${x.toFixed(2)}`);
});
