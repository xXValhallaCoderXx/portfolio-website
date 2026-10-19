import test from 'node:test';
import assert from 'node:assert/strict';
import { BANDS, bandOf, createSwingWatch } from './swing-watch.js';
const DEG = Math.PI / 180;
const dt = 1 / 60;
function fixture() {
  const watch = createSwingWatch();
  const g = { bank: 0, rollRate: 0, pitch: 0, pitchRate: 0, turn: 0, loop: 0, loops: 0, tuck: 0, stall: 0, ears: 0 };
  const controls = { turn: 0, brake: false, steered: false };
  const step = () => watch.step(dt, g, false, controls);
  function leg(to, frames, turn) {
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
