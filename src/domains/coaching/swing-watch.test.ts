import type { FlightInput } from '../flight/models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BANDS, SPIRAL, bandOf, createSwingWatch } from './swing-watch.ts';
import { createFlight } from '../flight/flight.ts';
const DEG = Math.PI / 180;
const dt = 1 / 60;
function fixture() {
  const watch = createSwingWatch();
  const g = { bank: 0, rollRate: 0, pitch: 0, pitchRate: 0, turn: 0, loop: 0, loops: 0, tuck: 0, stall: 0, ears: 0 };
  const controls: FlightInput = { turn: 0, brake: false, steered: false };
  const step = () => watch.step(dt, g, false, controls);
  function leg(to: number, frames: number, turn: number) {
    const from = g.bank;
    controls.turn = turn;
    g.turn = turn;
    for (let n = 1; n <= frames; n++) {
      const bank = from + (to * DEG - from) * n / frames;
      g.rollRate = (bank - g.bank) / dt;
      g.bank = bank;
      step();
    }
  }
  function cycle() { leg(60, 60, 1); leg(59, 1, -1); leg(-65, 100, -1); leg(-64, 1, 1); }
  return { watch, g, controls, step, leg, cycle };
}
test('amplitude bands distinguish ordinary turns from deliberate maneuver motion', () => {
  assert.equal(bandOf(BANDS.roll, 40 * DEG), 0);
  assert.equal(bandOf(BANDS.roll, 60 * DEG), 2);
  assert.equal(bandOf(BANDS.roll, 90 * DEG), 4);
});
test('direct input hysteresis ignores tiny turn jitter and partial one-hand pitch releases', () => {
  const f = fixture();
  Object.assign(f.controls, { controlMode: 'brakes', leftBrake: .1, rightBrake: 0 });
  f.step();
  const unchanged = f.watch.state.swappedAt;
  for (let tick = 0; tick < 30; tick++) {
    f.controls.leftBrake = tick % 2 ? .061 : .059;
    f.controls.rightBrake = .06; f.step();
  }
  assert.equal(f.watch.state.swappedAt, unchanged);
  f.controls.leftBrake = f.controls.rightBrake = .3; f.step();
  const pressedAt = f.watch.state.brakeAt;
  for (let tick = 0; tick < 30; tick++) {
    f.controls.leftBrake = tick % 2 ? .061 : .059;
    f.controls.rightBrake = .3; f.step();
  }
  assert.equal(f.watch.state.brakeAt, pressedAt, 'one hand still down cannot create a pitch-release timing edge');
  f.controls.leftBrake = f.controls.rightBrake = 0; f.step();
  assert.ok(f.watch.state.brakeAt > pressedAt);
  assert.equal(f.watch.state.timed, 0); assert.equal(f.watch.state.moves, 0);
});
test('a complete alternating wingover cycle emits one move, without recrediting its runup', () => {
  const { watch, cycle, leg } = fixture();
  cycle();
  assert.equal(watch.state.moves, 1);
  assert.equal(watch.state.moveKind, 2);
  assert.equal(watch.state.moveBand, 2);
  leg(70, 100, 1); leg(69, 1, -1);
  assert.equal(watch.state.moves, 1, 'one extra top is not another complete cycle');
  leg(-75, 100, -1); leg(-74, 1, 1);
  assert.equal(watch.state.moves, 2);
});
test('ordinary reversals and uncommanded air motion are not completed maneuvers', () => {
  const ordinary = fixture();
  ordinary.leg(35, 60, 1); ordinary.leg(34, 1, -1); ordinary.leg(-38, 60, -1); ordinary.leg(-37, 1, 1);
  assert.equal(ordinary.watch.state.moves, 0);
  const air = fixture();
  air.leg(65, 60, 0); air.leg(64, 1, 0); air.leg(-65, 60, 0); air.leg(-64, 1, 0);
  assert.equal(air.watch.state.moves, 0);
  air.g.loops = 1; air.step();
  assert.equal(air.watch.state.moves, 0, 'uncommanded orbit is motion without player credit');
});
test('automatic boundary correction cannot earn timing or style', () => {
  const f = fixture(); f.controls.steered = true; f.cycle();
  assert.equal(f.watch.state.moves, 0);
  assert.equal(f.watch.state.timed, 0);
  f.g.loops = 1; f.step();
  assert.equal(f.watch.state.moves, 0);
});
test('rotating the canopy alone is not an inversion; an observed completed orbit is', () => {
  const f = fixture(); f.g.loop = 1; f.controls.turn = 1;
  for (let n = 0; n < 120; n++) { f.g.bank += 0.1; f.step(); }
  assert.equal(f.watch.state.moves, 0);
  f.g.loops = 1; f.g.loop = 0; f.step(); f.step();
  assert.equal(f.watch.state.moves, 1);
  assert.equal(f.watch.state.moveKind, 3);
});
test('recovery requires low angular motion as well as level bank', () => {
  const f = fixture(); f.g.rollRate = 1;
  for (let n = 0; n < 120; n++) f.step();
  assert.equal(f.watch.state.calm, 0);
  f.g.rollRate = 0;
  for (let n = 0; n < 61; n++) f.step();
  assert.ok(f.watch.state.calm >= 1);
  f.g.tuck = 1; f.step();
  assert.equal(f.watch.state.calm, 0);
  assert.equal(f.watch.state.breaks, 1);
  f.step(); assert.equal(f.watch.state.breaks, 1);
  f.watch.reset(); assert.equal(f.watch.state.moves, 0); assert.equal(f.watch.state.breaks, 0);
});

test('reopened ears allow manual recovery despite a tiny actuator remainder', () => {
  const f = fixture(); f.g.ears = 0.5; f.step();
  assert.equal(f.watch.state.broke, 5);
  f.g.ears = 0.001;
  for (let n = 0; n < 61; n++) f.step();
  assert.ok(f.watch.state.calm >= 1);
});

function spiralFixture(side = 1) {
  const watch = createSwingWatch(), g = createFlight({ x: 0, y: 1000, z: 0 });
  const controls: FlightInput = { controlMode: 'brakes', leftBrake: side < 0 ? .82 : 0, rightBrake: side > 0 ? .82 : 0 };
  g.bank = side * 60 * DEG;
  let course = 0;
  function step(rate = side * .8) {
    course += rate * dt;
    g.track = Math.atan2(Math.sin(course), Math.cos(course));
    g.pilot.vel.x = 9 * Math.sin(course) + g.windX;
    g.pilot.vel.z = -9 * Math.cos(course) + g.windZ;
    watch.step(dt, g, false, controls);
  }
  function fly(seconds: number, rate = side * .8) {
    for (let tick = 0; tick < Math.ceil(seconds / dt); tick++) step(rate);
  }
  return { watch, g, controls, step, fly };
}

for (const side of [-1, 1]) test(`spiral observes a full actual course rotation, side ${side}, once per physical entry`, () => {
  const f = spiralFixture(side);
  f.fly(4);
  assert.equal(f.watch.state.moves, 0, 'a partial circle is not 360 degrees');
  assert.ok(f.watch.state.spiralArc > 2 && f.watch.state.spiralArc < SPIRAL.arc);
  f.fly(5);
  assert.equal(f.watch.state.moves, 1);
  assert.equal(f.watch.state.moveKind, 4);
  assert.equal(f.watch.state.spirals, 1);
  assert.equal(f.watch.state.quality, 1, 'a spiral cannot inherit a prior precision grade');
  f.fly(20);
  assert.equal(f.watch.state.moves, 1, 'holding the same spiral cannot repeatedly farm circles');
  f.g.bank = side * 44 * DEG; f.fly(.2);
  f.g.bank = side * 60 * DEG; f.fly(10);
  assert.equal(f.watch.state.moves, 1, 'a short threshold dip cannot freshly arm the spiral');
  f.g.bank = side * 44 * DEG; f.fly(.6);
  f.g.bank = side * 60 * DEG; f.fly(9);
  assert.equal(f.watch.state.moves, 2, 'a real exit and new steep entry can count again');
});

test('gentle thermalling, nose rotation, invalid track and reversed partial arcs do not count as spirals', () => {
  for (const bank of [25, 40, 49]) {
    const f = spiralFixture(); f.g.bank = bank * DEG; f.fly(30);
    assert.equal(f.watch.state.moves, 0, `bank ${bank} never enters the deliberate spiral`);
  }
  const shallow = spiralFixture(); shallow.controls.rightBrake = 2 / 3; shallow.fly(30);
  assert.equal(shallow.watch.state.moves, 0, 'ordinary working travel cannot become a scored spiral');
  const nose = spiralFixture();
  for (let tick = 0; tick < 1200; tick++) { nose.g.yaw += .05; nose.step(0); }
  assert.equal(nose.watch.state.moves, 0, 'the canopy nose is not the pilot course');
  const reversed = spiralFixture(); reversed.fly(4); reversed.fly(1, -.8); reversed.fly(4);
  assert.equal(reversed.watch.state.moves, 0, 'reversing discards the partial arc');
  const invalid = spiralFixture(); invalid.fly(4); invalid.step(20); invalid.fly(4);
  assert.equal(invalid.watch.state.moves, 0, 'a discontinuous course cannot bridge two partial turns');
  invalid.g.physical.inverted = true; invalid.fly(20);
  assert.equal(invalid.watch.state.moves, 0, 'an inverted flight is not an upright spiral');
  const slow = spiralFixture();
  for (let tick = 0; tick < 1200; tick++) {
    slow.g.track += .02;
    slow.g.pilot.vel.x = slow.g.pilot.vel.z = 0;
    slow.watch.step(dt, slow.g, false, slow.controls);
  }
  assert.equal(slow.watch.state.moves, 0, 'low-speed track fallback cannot score');
});

test('spiral progress uses air-relative course with crosswind and clears on assistance or damage', () => {
  const f = spiralFixture(); f.g.windX = 30; f.g.windZ = -20; f.fly(9);
  assert.equal(f.watch.state.spirals, 1, 'ground drift does not replace the measured air-relative course');
  const interrupted = spiralFixture(); interrupted.fly(4);
  const clock = interrupted.watch.state.clock;
  interrupted.watch.interrupt(4); interrupted.watch.interrupt(4);
  assert.equal(interrupted.watch.state.clock, clock, 'interrupt never observes an extra step');
  assert.equal(interrupted.watch.state.breaks, 1);
  assert.equal(interrupted.watch.state.spiralArc, 0);
  assert.equal(interrupted.watch.state.calm, 0);
  interrupted.g.tuck = 1; interrupted.step();
  assert.equal(interrupted.watch.state.breaks, 1, 'continuous damage is still one break');
  interrupted.watch.reset();
  assert.equal(interrupted.watch.state.spirals, 0);
  assert.equal(interrupted.watch.state.spiralAt, -Infinity);
  const assisted = spiralFixture(); assisted.fly(4); assisted.controls.steered = true; assisted.fly(10);
  assert.equal(assisted.watch.state.moves, 0);
});

test('a spiral exit top cannot be reused as half of a new wingover', () => {
  const f = spiralFixture(); f.fly(9);
  assert.equal(f.watch.state.moveKind, 4);
  const leg = (to: number, frames: number, side: number) => {
    const from = f.g.bank;
    f.controls.leftBrake = side < 0 ? .82 : 0;
    f.controls.rightBrake = side > 0 ? .82 : 0;
    for (let tick = 1; tick <= frames; tick++) {
      const bank = from + (to * DEG - from) * tick / frames;
      f.g.rollRate = (bank - f.g.bank) / dt;
      f.g.bank = bank; f.step();
    }
  };
  leg(65, 30, 1); leg(64, 1, -1);
  leg(-65, 100, -1); leg(-64, 1, 1);
  assert.equal(f.watch.state.moves, 1, 'the first genuinely new side is only half a wingover cycle');
  leg(65, 100, 1); leg(64, 1, -1);
  assert.equal(f.watch.state.moves, 2);
  assert.equal(f.watch.state.moveKind, 2);
});

test('post-hazard interruption merges same-step break priority without another sample', () => {
  const f = fixture(); f.g.ears = .5; f.step();
  const clock = f.watch.state.clock;
  f.watch.interrupt(4);
  assert.equal(f.watch.state.breaks, 1);
  assert.equal(f.watch.state.broke, 4, 'a damaging strike takes priority over ears on the same step');
  f.watch.interrupt(6); f.watch.interrupt(4);
  assert.equal(f.watch.state.broke, 6, 'assistance retains the existing highest break priority');
  assert.equal(f.watch.state.clock, clock);
  assert.equal(f.watch.state.calm, 0);
});
