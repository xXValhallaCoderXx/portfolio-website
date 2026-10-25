import type { FlightState } from '../../../domains/flight/models.ts';
import type { BrakeMeter } from './stall-effects.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BRAKE_METER, STALL_EFFECTS, brakeMeter, deepBrakeReached, softBrakes, stallEffects } from './stall-effects.ts';
import { BRAKE, createFlight, stepFlight } from '../../../domains/flight/flight.ts';
// Good Lift's gliders, whose halves stall on their own (a test may fly the game's wings).
import '../../../domains/good-lift/gliders.ts';

const STEP = 1 / 60;
const NONE = { left: 0, right: 0, luff: 0, shake: 0, tuck: 0, cravatLeft: 0, cravatRight: 0, twist: 0 };
const wing = (fields: Partial<FlightState>) => ({ ...createFlight(), ...fields });

test('nothing of a stall reaches the backdrop, a landing, the launch fade, a finished run or the missing page', () => {
  const stalled = wing({ stall: 2, stallLoad: 1 });
  for (const mode of ['intro', 'landed', 'launching', 'cloudbase-ended', 'lost']) {
    assert.deepEqual(stallEffects(mode, stalled, { left: 9, right: 9, luff: 9, shake: 9, tuck: 9 }), NONE);
    assert.deepEqual(stallEffects(mode, wing({ pitch: -0.8, tuck: 0.5 }), {}), NONE, 'nor of a surge or a tuck');
  }
  // And in the air, a wing with nothing going on is left alone.
  assert.deepEqual(stallEffects('flying', wing({}), {}), NONE);
  assert.deepEqual(stallEffects('cloudbase', wing({}), {}), NONE);
});


test('the fold eases out as measured stall severity falls', () => {
  assert.equal(stallEffects('flying', wing({ stall: STALL_EFFECTS.reopen + 0.01 }), {}).right, STALL_EFFECTS.fold * (STALL_EFFECTS.reopen + 0.01));
  assert.equal(stallEffects('flying', wing({ stall: STALL_EFFECTS.reopen }), {}).right, 0);
  assert.equal(stallEffects('flying', wing({ stall: 0, stallLoad: 0 }), {}).luff, 0);
});

test('the cloth starts to flutter as the stall load builds, and flutters hardest while stalled', () => {
  const luff = (load: number, stall = 0) => stallEffects('flying', wing({ stallLoad: load, stall }), {}).luff;
  assert.equal(luff(STALL_EFFECTS.luff[0]), 0);
  assert.ok(luff(0.6) > 0.2 && luff(0.6) < 0.8);
  assert.equal(luff(STALL_EFFECTS.luff[1]), 1);
  assert.equal(luff(0, 0.2), 0.2);
  let last = 0;
  for (let load = 0; load <= 1; load += 0.01) {
    assert.ok(luff(load) >= last - 1e-12);
    last = luff(load);
  }
});

test('the meter fills from the left with the brake, the light brake taking a good part of its track', () => {
  const out: Partial<BrakeMeter> = {};
  assert.equal(brakeMeter(0, 0, 0, out).fill, 0);
  assert.equal(out.state, '');
  assert.ok(Math.abs(brakeMeter(BRAKE.light, 0, 0, out).fill - BRAKE_METER.takeUp) < 1e-12);
  assert.equal(out.state, 'light');
  assert.ok(Math.abs(brakeMeter(BRAKE.shelf, 0, 0, out).fill - (BRAKE_METER.takeUp + BRAKE_METER.band)) < 1e-12);
  assert.equal(brakeMeter(1, 0, 0, out, 0, {deepBrake:true,brakeTarget:BRAKE.shelf}).fill, 1);
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

test('normal intent never escalates by depth alone, and stall load turns the meter red', () => {
  const out: Partial<BrakeMeter> = {};
  const band = BRAKE.shelf - BRAKE.light;
  assert.equal(brakeMeter(BRAKE.light + band * 0.7, 0, 0, out).state, 'light');
  assert.equal(brakeMeter(BRAKE.light + band * 0.8, 0, 0, out, 0, {deepBrake:false,brakeTarget:BRAKE.light}).state, 'light');
  assert.equal(brakeMeter(BRAKE.shelf + 0.01, 0, 0, out, 0, {deepBrake:true,brakeTarget:BRAKE.shelf}).state, 'deep');
  assert.equal(brakeMeter(0.9, BRAKE_METER.near - 0.01, 0, out, 0, {deepBrake:true,brakeTarget:BRAKE.shelf}).state, 'deep');
  assert.equal(brakeMeter(0.9, BRAKE_METER.near, 0, out).state, 'near');
  assert.equal(brakeMeter(0, 0, 1.5, out).state, 'stalled');
  // Let go with load still on the wing: the meter stays up until the load has drained.
  assert.equal(brakeMeter(0, 0.3, 0, out).state, 'light');
});

test('the red grows in from the right with the load and meets the fill exactly as the wing stalls, at any depth', () => {
  const out: Partial<BrakeMeter> = {};
  for (let depth = 0; depth <= 1; depth += 0.05) {
    brakeMeter(depth, 0, 0, out);
    assert.equal(out.red, 0);
    brakeMeter(depth, 0.5, 0, out);
    assert.ok(Math.abs(out.red - 0.5 * (1 - out.fill!)) < 1e-12);
    brakeMeter(depth, 1, 0, out);
    assert.ok(Math.abs(out.fill! + out.red - 1) < 1e-12, 'full load: red meets the fill');
    brakeMeter(depth, 0.2, 2, out);
    assert.ok(Math.abs(out.fill! + out.red - 1) < 1e-12, 'stalled: the whole gap is red');
  }
});

test('holding the working brake keeps a repeatable depth and does not secretly deepen', () => {
  const g = createFlight();
  const controls = { turn: 0, brake: true };
  const air = { windX: 0, windY: 0, windZ: 0 };
  const out: Partial<BrakeMeter> = {};
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
  assert.equal(tucked.tuck, 0.5);
  assert.ok(tucked.shake > 0 && tucked.shake < STALL_EFFECTS.shake, `${tucked.shake} rad of shake`);
  // A falling stall shakes as hard as ever, tuck or none.
  const both = stallEffects('cloudbase', wing({ tuck: 0.5, stall: 1 }), {});
  assert.equal(both.shake, STALL_EFFECTS.shake);
});

test('the meter shows the ears as their own state, filling as they fold in, and a stall still outranks them', () => {
  const out: Partial<BrakeMeter> = {};
  assert.deepEqual(brakeMeter(0, 0, 0, out, 0.4), { fill: 0.4, red: 0, state: 'ears' });
  assert.deepEqual(brakeMeter(0, 0, 0, out, 1), { fill: 1, red: 0, state: 'ears' });
  // A stall outranks the ears, as it outranks the brake.
  assert.equal(brakeMeter(0.4, 1, 1, out, 1).state, 'stalled');
  // Without them the meter is the brake's, as it always was.
  assert.deepEqual(brakeMeter(0.4, 0.2, 0, {}, 0), brakeMeter(0.4, 0.2, 0, {}));
});

test('a half stalled by itself folds back on its own side and flutters, in a run as over the fjord', () => {
  const half = (sepL: number, sepR: number) => { const g = createFlight(); Object.assign(g.physical, { sepL, sepR }); return g; };
  for (const mode of ['flying', 'cloudbase', 'training']) {
    const left = stallEffects(mode, half(1, 0), {});
    assert.equal(left.left, STALL_EFFECTS.half);
    assert.equal(left.right, 0);
    assert.equal(left.luff, STALL_EFFECTS.halfLuff);
    assert.equal(stallEffects(mode, half(0, 0.5), {}).right, STALL_EFFECTS.half * 0.5);
  }
  assert.deepEqual(stallEffects('intro', half(1, 1), {}), NONE, 'nothing of it reaches the backdrop');
});

test('a glider\'s half folded by a collapse is drawn folded on its own side, fluttering; a caught tip and twisted lines as they are', () => {
  for (const mode of ['flying', 'cloudbase', 'training']) {
    const g = createFlight({ x: 0, y: 3000, z: 0 }, 'en-c');
    Object.assign(g, { foldLeft: 0.6, cravatRight: 1, twist: -2.1 });
    const drawn = stallEffects(mode, g, {});
    assert.equal(drawn.left, 0.6); assert.equal(drawn.right, 0);
    assert.equal(drawn.luff, STALL_EFFECTS.foldLuff * 0.6);
    assert.equal(drawn.shake, STALL_EFFECTS.foldShake * 0.6);
    assert.equal(drawn.cravatRight, 1); assert.equal(drawn.cravatLeft, 0);
    assert.equal(drawn.twist, -2.1);
    Object.assign(g, { foldLeft: 0.04 });
    assert.equal(stallEffects(mode, g, {}).left, 0, 'a fold too small to fly on less is not drawn');
  }
  const g = createFlight({ x: 0, y: 3000, z: 0 }, 'en-c');
  Object.assign(g, { foldLeft: 0.6, cravatRight: 1, twist: 1 });
  assert.deepEqual(stallEffects('intro', g, {}), NONE, 'nothing of it reaches the backdrop');
  assert.deepEqual(stallEffects('flying', createFlight(), {}), NONE, 'the classic wing never has any');
});

test('SOFT warns of a half about to stall by itself, before it goes, and never for both hands pulled together', () => {
  const hands = (left: number, right: number) => ({ controlMode: 'brakes' as const, leftBrake: left, rightBrake: right });
  // Flies `before` s with `start`, then ramps the right hand from 0.6 to 1 over 2 s (the left held at
  // `left`, or with it when `even`): when SOFT first reaches 0.5, when the right half lets go, the most it said.
  const fly = (wing: string, start: number, left: number, even = false) => {
    const g = createFlight({ x: 0, y: 3000, z: 0 }, wing), out = { left: 0, right: 0 };
    for (let i = 0; i < 8 * 60; i++) stepFlight(g, hands(start, start), {}, 1 / 60);
    let soft = -1, gone = -1, most = 0;
    for (let i = 0; i < 4 * 60; i++) {
      const right = Math.min(1, 0.6 + 0.4 * i / 120);
      stepFlight(g, hands(even ? right : left, right), {}, 1 / 60);
      softBrakes('cloudbase', g, out);
      most = Math.max(most, out.left, out.right);
      if (soft < 0 && out.right >= 0.5) soft = i;
      if (gone < 0 && g.physical.sepR > 0.5) gone = i;
    }
    return { soft, gone, most };
  };
  const acro = fly('acro', 0, 0);
  assert.ok(acro.soft >= 0 && acro.gone - acro.soft >= 15, `the acro: SOFT at step ${acro.soft}, the half gone at ${acro.gone}`);
  for (const wing of ['en-c', 'en-d']) assert.ok(fly(wing, 0.6, 0.6).soft >= 0, `${wing}: slow, one hand deep`);
  for (const wing of ['en-c', 'en-d', 'acro']) {
    const together = fly(wing, 0.6, 0.6, true);
    assert.ok(together.gone >= 0, `${wing}: both halves stall`);
    assert.equal(together.most, 0, `${wing}: a full stall asked for is no SOFT`);
  }
  for (const wing of ['en-a', 'en-b', 'classic']) for (const [start, left] of [[0, 0], [0.6, 0.6]])
    assert.equal(fly(wing, start, left).most, 0, `${wing}: its halves never stall alone`);
});
