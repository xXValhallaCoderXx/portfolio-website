import test from 'node:test';
import assert from 'node:assert/strict';
import { BRAKE_METER, STALL_EFFECTS, brakeMeter, stallEffects } from './stall-effects.js';
import { BRAKE, STALL, createFlight, stepFlight } from './flight.js';

const STEP = 1 / 60;
const NONE = { left: 0, right: 0, luff: 0, shake: 0 };
const wing = (fields) => ({ ...createFlight(), ...fields });

test('nothing of a stall reaches the backdrop, a landing, the launch fade, a finished run or the missing page', () => {
  const stalled = wing({ stall: 2, stallSide: 1, stallLoad: 1 });
  for (const mode of ['intro', 'landed', 'launching', 'cloudbase-ended', 'lost']) {
    assert.deepEqual(stallEffects(mode, stalled, { left: 9, right: 9, luff: 9, shake: 9 }), NONE);
  }
  // And in the air, a wing with nothing going on is left alone.
  assert.deepEqual(stallEffects('flying', wing({}), {}), NONE);
  assert.deepEqual(stallEffects('cloudbase', wing({}), {}), NONE);
});

test('a straight stall folds a little of both halves, a spin folds the inside half hard and leaves the other open', () => {
  const straight = stallEffects('flying', wing({ stall: 1.2, stallSide: 0 }), {});
  assert.deepEqual([straight.left, straight.right], [STALL_EFFECTS.fold, STALL_EFFECTS.fold]);
  const right = stallEffects('cloudbase', wing({ stall: 2, stallSide: 1 }), {});
  assert.deepEqual([right.left, right.right], [0, STALL_EFFECTS.spin]);
  const left = stallEffects('cloudbase', wing({ stall: 2, stallSide: -1 }), {});
  assert.deepEqual([left.left, left.right], [STALL_EFFECTS.spin, 0]);
  // Falling, the camera shakes; in the surge the wing flies again and it stops.
  assert.equal(right.shake, STALL_EFFECTS.shake);
  assert.equal(stallEffects('flying', wing({ stall: STALL.surge - 0.01, stallSide: 1 }), {}).shake, 0);
});

test('the wing opens again before control returns, and on a real stall it is open as the hands come back', () => {
  assert.equal(stallEffects('flying', wing({ stall: STALL_EFFECTS.reopen + 0.01, stallSide: 1 }), {}).right, STALL_EFFECTS.spin);
  assert.equal(stallEffects('flying', wing({ stall: STALL_EFFECTS.reopen, stallSide: 1 }), {}).right, 0);
  // Hold a deep brake in a turn until it spins, then let go: the fold is gone a third of a second
  // and more before the wing answers the hands again.
  const g = createFlight();
  const controls = { turn: 1, brake: true, bar: false, locked: false, harsh: true, linger: false, climb: null };
  const air = { lift: 0, sink: 0, windX: 0, windZ: 0, calm: true, rough: 0, clearance: Infinity };
  const out = {};
  let opened = null;
  let back = null;
  for (let t = 0; t < 30 && back === null; t += STEP) {
    const was = g.stall;
    if (was > 0) controls.brake = false;
    stepFlight(g, controls, air, STEP);
    stallEffects('cloudbase', g, out);
    if (was > 0 && out.right === 0 && opened === null) opened = t;
    if (was > 0 && g.stall === 0) back = t;
  }
  assert.ok(opened !== null && back !== null);
  assert.ok(back - opened >= STALL_EFFECTS.reopen / STALL.letGo - STEP, `opened ${(back - opened).toFixed(2)} s before control returned`);
});

test('the cloth starts to flutter as the stall load builds, and flutters hardest while stalled', () => {
  const luff = (load, stall = 0) => stallEffects('flying', wing({ stallLoad: load, stall }), {}).luff;
  assert.equal(luff(STALL_EFFECTS.luff[0]), 0);
  assert.ok(luff(0.6) > 0.2 && luff(0.6) < 0.8);
  assert.equal(luff(STALL_EFFECTS.luff[1]), 1);
  assert.equal(luff(0, 0.2), 1);
  let last = 0;
  for (let load = 0; load <= 1; load += 0.01) {
    assert.ok(luff(load) >= last - 1e-12);
    last = luff(load);
  }
});

test('the meter fills from the left with the brake, the light brake taking a good part of its track', () => {
  const out = {};
  assert.equal(brakeMeter(0, 0, 0, out).fill, 0);
  assert.equal(out.state, '');
  assert.ok(Math.abs(brakeMeter(BRAKE.light, 0, 0, out).fill - BRAKE_METER.takeUp) < 1e-12);
  assert.equal(out.state, 'light');
  assert.ok(Math.abs(brakeMeter(BRAKE.shelf, 0, 0, out).fill - (BRAKE_METER.takeUp + BRAKE_METER.band)) < 1e-12);
  assert.equal(brakeMeter(1, 0, 0, out).fill, 1);
  assert.equal(out.state, 'deep');
  // The light band is 40% of the track, and the fill never steps or goes backwards.
  assert.equal(BRAKE_METER.band, 0.4);
  let last = 0;
  for (let depth = 0; depth <= 1.0001; depth += 0.001) {
    const { fill } = brakeMeter(Math.min(1, depth), 0, 0, out);
    assert.ok(fill >= last - 1e-12 && fill - last < 0.012, `a step at depth ${depth.toFixed(3)}`);
    last = fill;
  }
});

test('the light brake warns before it goes deep, and the stall load turns the meter red', () => {
  const out = {};
  const band = BRAKE.shelf - BRAKE.light;
  assert.equal(brakeMeter(BRAKE.light + band * 0.7, 0, 0, out).state, 'light');
  assert.equal(brakeMeter(BRAKE.light + band * 0.8, 0, 0, out).state, 'late');
  assert.equal(brakeMeter(BRAKE.shelf + 0.01, 0, 0, out).state, 'deep');
  assert.equal(brakeMeter(0.8, BRAKE_METER.near - 0.01, 0, out).state, 'deep');
  assert.equal(brakeMeter(0.8, BRAKE_METER.near, 0, out).state, 'near');
  assert.equal(brakeMeter(0, 0, 1.5, out).state, 'stalled');
  // Let go with load still on the wing: the meter stays up until the load has drained.
  assert.equal(brakeMeter(0, 0.3, 0, out).state, 'light');
});

test('the red grows in from the right with the load and meets the fill exactly as the wing stalls, at any depth', () => {
  const out = {};
  for (let depth = 0; depth <= 1; depth += 0.05) {
    brakeMeter(depth, 0, 0, out);
    assert.equal(out.red, 0);
    brakeMeter(depth, 0.5, 0, out);
    assert.ok(Math.abs(out.red - 0.5 * (1 - out.fill)) < 1e-12);
    brakeMeter(depth, 1, 0, out);
    assert.ok(Math.abs(out.fill + out.red - 1) < 1e-12, 'full load: red meets the fill');
    brakeMeter(depth, 0.2, 2, out);
    assert.ok(Math.abs(out.fill + out.red - 1) < 1e-12, 'stalled: the whole gap is red');
  }
});

test('held on in a run, the meter goes light, late, deep, near and stalled in that order', () => {
  const g = createFlight();
  const controls = { turn: 1, brake: true, bar: false, locked: false, harsh: true, linger: true, climb: null };
  const air = { lift: 0, sink: 0, windX: 0, windZ: 0, calm: true, rough: 0, clearance: Infinity };
  const out = {};
  const seen = [];
  for (let t = 0; t < 20 && g.stall === 0; t += STEP) {
    stepFlight(g, controls, air, STEP);
    brakeMeter(g.brake, g.stallLoad, g.stall, out);
    if (seen.at(-1) !== out.state) seen.push(out.state);
  }
  assert.deepEqual(seen, ['light', 'late', 'deep', 'near', 'stalled']);
});

test('the cloth flutters with the load it is given, so where a wing cannot stall nothing warns of one', () => {
  const loaded = wing({ stallLoad: 0.9 });
  assert.ok(stallEffects('flying', loaded, {}).luff > 0.8, 'by default, the wing\'s own load');
  assert.equal(stallEffects('flying', loaded, {}, 0).luff, 0);
  assert.equal(stallEffects('cloudbase', loaded, {}, loaded.stallLoad).luff, stallEffects('cloudbase', loaded, {}).luff);
  // A stall itself still flutters hardest, whatever the load.
  assert.equal(stallEffects('cloudbase', wing({ stall: 1 }), {}, 0).luff, 1);
});
