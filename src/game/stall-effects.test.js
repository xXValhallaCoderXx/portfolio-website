import test from 'node:test';
import assert from 'node:assert/strict';
import { BRAKE_METER, STALL_EFFECTS, brakeMeter, deepBrakeReached, stallEffects } from './stall-effects.js';
import { BRAKE, STALL, createFlight, stepFlight } from './flight.js';

const STEP = 1 / 60;
const NONE = { left: 0, right: 0, luff: 0, shake: 0, tuck: 0 };
const wing = (fields) => ({ ...createFlight(), ...fields });

test('nothing of a stall reaches the backdrop, a landing, the launch fade, a finished run or the missing page', () => {
  const stalled = wing({ stall: 2, stallSide: 1, stallLoad: 1 });
  for (const mode of ['intro', 'landed', 'launching', 'cloudbase-ended', 'lost']) {
    assert.deepEqual(stallEffects(mode, stalled, { left: 9, right: 9, luff: 9, shake: 9, tuck: 9 }), NONE);
    assert.deepEqual(stallEffects(mode, wing({ pitch: -0.8, tuck: 0.5 }), {}), NONE, 'nor of a surge or a tuck');
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

test('the fold eases out as measured stall severity falls', () => {
  assert.equal(stallEffects('flying', wing({ stall: STALL_EFFECTS.reopen + 0.01, stallSide: 1 }), {}).right, STALL_EFFECTS.spin);
  assert.equal(stallEffects('flying', wing({ stall: STALL_EFFECTS.reopen, stallSide: 1 }), {}).right, 0);
  assert.equal(stallEffects('flying', wing({ stall: 0, stallLoad: 0 }), {}).luff, 0);
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
  assert.equal(brakeMeter(0.9, BRAKE_METER.near - 0.01, 0, out).state, 'deep');
  assert.equal(brakeMeter(0.9, BRAKE_METER.near, 0, out).state, 'near');
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

test('holding the working brake keeps a repeatable depth and does not secretly deepen', () => {
  const g = createFlight();
  const controls = { turn: 0, brake: true };
  const air = { windX: 0, windY: 0, windZ: 0 };
  const out = {};
  for (let n = 0; n < 20 * 60; n++) {
    stepFlight(g, controls, air, STEP);
    brakeMeter(g.brake, g.stallLoad, g.stall, out);
    assert.equal(out.state, 'light');
    assert.equal(g.stall, 0);
  }
  assert.ok(g.brake >= 0.34 && g.brake < 0.44);
});

test('explicit deep intent is recognized near its eased target without changing actual fill or warning precedence', () => {
  const intent = { deepBrake: true, brakeTarget: BRAKE.shelf };
  const approaching = intent.brakeTarget - BRAKE_METER.deepTolerance - 0.001;
  assert.equal(deepBrakeReached(approaching, intent), false);
  assert.equal(brakeMeter(approaching, 0, 0, {}, 0, intent).state, 'light');
  const reached = intent.brakeTarget - BRAKE_METER.deepTolerance / 2;
  assert.equal(deepBrakeReached(reached, intent), true);
  const actual = brakeMeter(reached, 0, 0, {}, 0, intent);
  assert.equal(actual.state, 'deep');
  assert.equal(actual.fill, brakeMeter(reached, 0, 0, {}).fill, 'classification never rounds up the actual meter fill');
  assert.equal(brakeMeter(reached, BRAKE_METER.near, 0, {}, 0, intent).state, 'near');
  assert.equal(brakeMeter(reached, 0, 1, {}, 0.5, intent).state, 'stalled');
  assert.equal(brakeMeter(reached, 0, 0, {}, 0.5, intent).state, 'ears');
  assert.equal(deepBrakeReached(reached, { ...intent, deepBrake: false }), false);
  assert.equal(brakeMeter(reached, 0, 0, {}, 0, { ...intent, deepBrake: false }).state, 'light');
  const g = createFlight({ x: 0, y: 1000, z: 0 });
  let held = 0;
  for (let tick = 0; tick < 90; tick++) {
    stepFlight(g, { brake: true, deepBrake: true }, {}, STEP);
    held = deepBrakeReached(g.brake, g) ? held + STEP : 0;
  }
  assert.ok(g.brake < g.brakeTarget, 'actual easing still approaches the deep target from below');
  assert.ok(held > 0.4, 'the physical deep-hold timer can advance without ever overshooting its target');
  assert.equal(brakeMeter(g.brake, g.stallLoad, g.stall, {}, g.ears, g).state, 'deep');
  stepFlight(g, { brake: true }, {}, STEP);
  assert.equal(deepBrakeReached(g.brake, g), false, 'returning to working intent ends the deep hold immediately');
});

test('the cloth flutters with the load it is given, so where a wing cannot stall nothing warns of one', () => {
  const loaded = wing({ stallLoad: 0.9 });
  assert.ok(stallEffects('flying', loaded, {}).luff > 0.8, 'by default, the wing\'s own load');
  assert.equal(stallEffects('flying', loaded, {}, 0).luff, 0);
  assert.equal(stallEffects('cloudbase', loaded, {}, loaded.stallLoad).luff, stallEffects('cloudbase', loaded, {}).luff);
  // A stall itself still flutters hardest, whatever the load.
  assert.equal(stallEffects('cloudbase', wing({ stall: 1 }), {}, 0).luff, 1);
});

test('a tuck folds the leading edge and jolts the pilot, less than a stall, and a swinging wing is left to swing as it is', () => {
  const surging = stallEffects('cloudbase', wing({ pitch: -0.9, pitchRate: -1 }), {});
  assert.deepEqual(surging, NONE);
  const tucked = stallEffects('cloudbase', wing({ tuck: 0.5 }), {});
  assert.equal(tucked.tuck, 1);
  assert.ok(tucked.shake > 0 && tucked.shake < STALL_EFFECTS.shake, `${tucked.shake} rad of shake`);
  // A falling stall shakes as hard as ever, tuck or none.
  const both = stallEffects('cloudbase', wing({ tuck: 0.5, stall: 1 }), {});
  assert.equal(both.shake, STALL_EFFECTS.shake);
});

test('the meter shows the ears as their own state, filling as they fold in, and a stall still outranks them', () => {
  const out = {};
  assert.deepEqual(brakeMeter(0, 0, 0, out, 0.4), { fill: 0.4, red: 0, state: 'ears' });
  assert.deepEqual(brakeMeter(0, 0, 0, out, 1), { fill: 1, red: 0, state: 'ears' });
  // A stall outranks the ears, as it outranks the brake.
  assert.equal(brakeMeter(0.4, 1, 1, out, 1).state, 'stalled');
  // Without them the meter is the brake's, as it always was.
  assert.deepEqual(brakeMeter(0.4, 0.2, 0, {}, 0), brakeMeter(0.4, 0.2, 0, {}));
});

test('a tip collapse folds the half that unloaded, jolting the pilot as a tuck does', () => {
  for (const side of [-1, 1]) {
    const tipped = stallEffects('cloudbase', wing({ tip: 0.5, tipSide: side }), {});
    assert.deepEqual([tipped.left, tipped.right], side < 0 ? [STALL_EFFECTS.tip, 0] : [0, STALL_EFFECTS.tip]);
    assert.equal(tipped.shake, STALL_EFFECTS.tuck);
  }
  // Over in a moment: nothing of it once the wing has opened.
  assert.deepEqual(stallEffects('cloudbase', wing({ tip: 0, tipSide: 1 }), {}), NONE);
});
