import test from 'node:test';
import assert from 'node:assert/strict';
import { createStyle } from './meet-style.js';
function fixture() {
  const style = createStyle();
  const watch = { clock: 0, moves: 0, moveKind: 0, moveBand: 0, moveSize: 0, breaks: 0, broke: 0, calm: 0 };
  const world = { watch: { state: watch }, controls: { steered: false } };
  const step = () => { watch.clock += 1 / 60; style.step(1 / 60, world); };
  const move = (kind = 2, band = 2) => { Object.assign(watch, { moves: watch.moves + 1, moveKind: kind, moveBand: band, moveSize: 1, calm: 0 }); step(); };
  const recover = () => { watch.calm = 1; step(); };
  return { style, watch, world, step, move, recover };
}
test('one completed move banks only after stable recovery', () => {
  const f = fixture(); f.move();
  assert.equal(f.style.state.pending, 20); assert.equal(f.style.state.total, 0);
  f.watch.calm = 0.99; f.step(); assert.equal(f.style.state.total, 0);
  f.recover(); assert.equal(f.style.state.total, 20); assert.equal(f.style.state.landed, 1);
  f.step(); assert.equal(f.style.state.total, 20, 'no repeat banking');
});
test('linked moves multiply pending points without counting runup peaks', () => {
  const f = fixture(); f.move(); f.move(); f.move(3, 4);
  assert.equal(f.style.state.pending, 20 + 20 + 90);
  f.recover(); assert.equal(f.style.state.total, 130);
  assert.equal(f.style.state.mostLoops, 1);
});
test('keys, raw peaks and isolated bank angles cannot award style', () => {
  const f = fixture(); Object.assign(f.watch, { tops: 20, chain: 20, front: 1, fronts: 10, building: 10, timed: 10 });
  f.step(); f.recover(); assert.equal(f.style.state.total, 0);
});
test('a failure loses pending points; already banked points survive', () => {
  const f = fixture(); f.move(); f.recover(); f.move(3, 4);
  Object.assign(f.watch, { breaks: 1, broke: 1, calm: 0 }); f.step();
  assert.equal(f.style.state.total, 20); assert.equal(f.style.state.pending, 0); assert.equal(f.style.state.lost, 1);
  f.move(); assert.equal(f.style.state.pending, 0, 'must recover before trying again');
  f.recover(); f.move(); assert.equal(f.style.state.pending, 20);
});
test('ears and assistance cannot bank unfinished maneuvers', () => {
  const f = fixture(); f.world.controls.steered = true; f.move(); assert.equal(f.style.state.pending, 0);
  f.world.controls.steered = false; f.move();
  Object.assign(f.watch, { breaks: 1, broke: 5, calm: 0 }); f.step();
  assert.equal(f.style.state.total, 0); assert.equal(f.style.state.pending, 0);
});
test('assisted recovery drops a pending manual move and cannot bank it later', () => {
  const f = fixture(); f.move(); f.recover(); f.move();
  assert.equal(f.style.state.pending, 20);
  f.world.controls.steered = true; f.step();
  assert.equal(f.style.state.pending, 0);
  f.world.controls.steered = false; f.recover();
  assert.equal(f.style.state.total, 20, 'only the earlier manual recovery remains banked');
  f.move(); f.recover(); assert.equal(f.style.state.total, 40);
});
test('ending drops unfinished style and reset clears all event bookkeeping', () => {
  const f = fixture(); f.move(3, 4); f.style.finish(); assert.equal(f.style.state.total, 0); assert.equal(f.style.state.pending, 0);
  f.style.reset(); f.watch.moves = 1; f.step(); f.recover(); assert.equal(f.style.state.total, 60);
});

test('a real standalone wingover and pitch-and-catch bank after physical recovery', async () => {
  const { createFlight, stepFlight } = await import('./flight.js');
  const { createSwingWatch } = await import('./swing-watch.js');
  for (const kind of [1, 2]) {
    const g = createFlight({ x: 0, y: 1000, z: 0 });
    const watch = createSwingWatch();
    const style = createStyle();
    const controls = { turn: 0, brake: false, deepBrake: false, bar: false, ears: false };
    const world = { g, watch, controls };
    let completed = false;
    for (let n = 0; n < 2400 && style.state.total === 0; n++) {
      completed ||= watch.state.moves > 0;
      controls.turn = kind === 2 && !completed ? (Math.floor(n / 270) % 2 ? 1 : -1) : 0;
      // Ordinary recorded holds from the delayed physical coach receipt: deep shaping pulls,
      // release, then a working-depth forward catch. No pose or trajectory is prescribed.
      controls.deepBrake = !completed && (kind === 2 ? n < 12 : n < 180 || n >= 360 && n < 516);
      controls.brake = controls.deepBrake || (completed ? g.pitch < 0 : kind === 1 && n >= 635 && n < 795);
      stepFlight(g, controls, {});
      watch.step(1 / 60, g, false, controls);
      style.step(1 / 60, world);
      assert.equal(watch.state.breaks, 0, 'the maneuver and recovery stay under control');
      if (!completed) assert.equal(style.state.total, 0, 'an unfinished move banks nothing');
    }
    assert.equal(watch.state.moveKind, kind);
    assert.equal(watch.state.moves, 1, 'one complete move');
    assert.equal(style.state.landed, 1);
    assert.ok(style.state.total > 0);
    assert.ok(watch.state.calm >= 1);
    assert.ok(g.pos.y < 1000, 'the maneuver pays for its energy in altitude');
  }
});
