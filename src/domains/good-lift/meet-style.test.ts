import test from 'node:test';
import assert from 'node:assert/strict';
import { createStyle, STYLE } from './meet-style.ts';
function fixture() {
  const style = createStyle();
  const watch = { clock: 0, moves: 0, moveKind: 0, moveBand: 0, moveSize: 0, breaks: 0, broke: 0, calm: 0 };
  const world = { watch: { state: watch }, controls: { steered: false } };
  const step = () => { watch.clock += 1 / 60; style.step(1 / 60, world); };
  const move = (kind = 2, band = 2) => { Object.assign(watch, { moves: watch.moves + 1, moveKind: kind, moveBand: band, moveSize: 1, calm: 0 }); step(); };
  const recover = () => { watch.clock += STYLE.settle; watch.calm = STYLE.settle; step(); };
  return { style, watch, world, step, move, recover };
}
test('one completed move banks only after stable recovery', () => {
  const f = fixture(); f.move();
  assert.equal(f.style.state.pending, 20); assert.equal(f.style.state.total, 0);
  f.watch.calm = STYLE.settle - 0.01; f.step(); assert.equal(f.style.state.total, 0);
  f.recover(); assert.equal(f.style.state.total, 20); assert.equal(f.style.state.landed, 1);
  f.step(); assert.equal(f.style.state.total, 20, 'no repeat banking');
});
test('linked moves multiply pending points without counting runup peaks', () => {
  const f = fixture(); f.move(); f.move(); f.move(3, 4);
  assert.equal(f.style.state.pending, 20 + 20 + 90 + 10);
  f.recover(); assert.equal(f.style.state.total, 140);
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
  const { createFlight, stepFlight } = await import('../flight/flight.ts');
  const { createSwingWatch } = await import('../coaching/swing-watch.ts');
  const { createReferencePilot } = await import('./pilots.ts');
  for (const kind of [1, 2]) {
    const g = createFlight({ x: 0, y: 1000, z: 0 });
    const watch = createSwingWatch();
    const style = createStyle();
    const controls = { turn: 0, brake: false, deepBrake: false, bar: false, ears: false };
    const sky = { state: { elapsed: 0, pilot: { collapse: 0 }, thermals: [] }, inside: () => true };
    const world = { g, watch, controls, style, sky, air: {}, steps: 0 };
    const pilot = createReferencePilot({ tricks: { from: 0, ...(kind === 1 ? { pumps: 2 } : { swaps: 2 }) }, catches: false });
    let completed = false;
    for (let n = 0; n < 2400 && style.state.total === 0; n++) {
      completed ||= watch.state.moves > 0;
      // The reference pilot uses safe shaping pulls and observed coach phases. The obsolete
      // three-second deep holds would now deliberately enter the new full-stall envelope.
      pilot.decide(world, controls);
      stepFlight(g, controls, {});
      watch.step(1 / 60, g, false, controls);
      style.step(1 / 60, world);
      world.steps++; sky.state.elapsed = world.steps / 60;
      assert.equal(watch.state.breaks, 0, 'the maneuver and recovery stay under control');
      if (!completed) assert.equal(style.state.total, 0, 'an unfinished move banks nothing');
    }
    assert.equal(watch.state.moveKind, kind);
    assert.equal(watch.state.moves, 1, 'one complete move');
    assert.equal(style.state.landed, 1);
    assert.ok(style.state.total > 0);
    assert.ok(watch.state.calm >= STYLE.settle - 1e-9);
    assert.ok(g.pos.y < 1000, 'the maneuver pays for its energy in altitude');
  }
});

test('spirals use fixed points and new kinds earn a flat bonus outside the existing multiplier', () => {
  const f = fixture();
  f.move(4, 0);
  assert.equal(f.style.state.pending, 20);
  f.move(2, 1);
  assert.equal(f.style.state.pending, 40, '20 spiral + 10 first-band wingover + 10 new kind');
  f.move(2, 1);
  assert.equal(f.style.state.pending, 55, 'repeated wingover gets its chain multiplier, no second variety bonus');
  f.move(3, 4);
  f.move(1, 1);
  f.move(4, 0);
  assert.equal(f.style.state.variety, 30, 'only the three newly introduced kinds earn variety');
  assert.equal(f.style.state.kindMask, 15);
  assert.equal(f.style.state.elements, 6);
  assert.deepEqual(f.style.state.sequence, [3, 1, 4]);
  const pending = f.style.state.pending, base = f.style.state.base;
  f.recover();
  assert.deepEqual(f.style.state.lastCombo, { points: pending, base, variety: 30, moves: 6, mask: 15, sequence: [3, 1, 4] });
  assert.deepEqual(f.style.state.bestCombo, f.style.state.lastCombo);
  assert.notEqual(f.style.state.bestCombo.sequence, f.style.state.lastCombo.sequence);
  assert.equal(f.style.state.pitch, Math.round(1 * 180 / Math.PI), 'the spiral arc is never counted as pitch depth');
  assert.equal(f.style.state.mostSpirals, 2);
  f.move(1, 1); f.recover();
  assert.equal(f.style.state.lastCombo.moves, 1);
  assert.equal(f.style.state.bestCombo.moves, 6, 'later clearing and smaller banks cannot mutate the best receipt');
  assert.deepEqual(f.style.state.bestCombo.sequence, [3, 1, 4]);
  f.style.reset();
  assert.equal(f.style.state.bestCombo.points, 0);
  assert.deepEqual(f.style.state.sequence, []);
});

test('linking grace restarts after each move and requires three post-move calm seconds', () => {
  const f = fixture();
  f.watch.calm = 10;
  f.move(4, 0);
  f.watch.calm = 10;
  f.step();
  assert.equal(f.style.state.total, 0, 'calm accumulated before the move cannot bank it');
  f.watch.clock += 2;
  f.watch.calm = 2;
  f.step();
  assert.equal(f.style.state.total, 0, 'the player can link another move during the short grace');
  f.move(2, 1);
  assert.equal(f.style.state.pending, 40);
  assert.equal(f.style.state.bankCalm, 0);
  f.watch.clock += 2;
  f.watch.calm = 10;
  f.step();
  assert.equal(f.style.state.total, 0, 'the last move restarts the grace');
  f.recover();
  assert.equal(f.style.state.total, 40);
});

test('break recovery rearms after one second independently of the three-second bank grace', () => {
  const f = fixture(); f.move();
  Object.assign(f.watch, { breaks: 1, broke: 4, calm: 0 }); f.step();
  f.watch.calm = STYLE.rearm - 0.01; f.step();
  assert.equal(f.style.state.armed, false);
  f.watch.calm = STYLE.rearm; f.step();
  assert.equal(f.style.state.armed, true);
  f.move(4, 0);
  assert.equal(f.style.state.pending, 20);
  assert.equal(f.style.state.total, 0);
  f.style.finish(); f.recover();
  assert.equal(f.style.state.total, 0, 'ending during the grace never banks unfinished points');
});

test('three calm seconds bank on the 180th fixed step despite accumulated floating point error', () => {
  const f = fixture(); f.move(4, 0);
  for (let tick = 0; tick < 179; tick++) { f.watch.calm += 1 / 60; f.step(); }
  assert.equal(f.style.state.total, 0);
  f.watch.calm += 1 / 60; f.step();
  assert.equal(f.style.state.total, STYLE.spiral);
});

test('best combo ties prefer more moves and otherwise preserve the earlier bank', () => {
  const f = fixture(); f.move(1, 4); f.recover();
  assert.equal(f.style.state.bestCombo.points, 50);
  f.move(4, 0); f.move(2, 2); f.recover();
  assert.equal(f.style.state.bestCombo.points, 50);
  assert.equal(f.style.state.bestCombo.moves, 2);
  assert.deepEqual(f.style.state.bestCombo.sequence, [4, 2]);
  f.move(2, 2); f.move(4, 0); f.recover();
  assert.deepEqual(f.style.state.lastCombo.sequence, [2, 4]);
  assert.deepEqual(f.style.state.bestCombo.sequence, [4, 2]);
});
