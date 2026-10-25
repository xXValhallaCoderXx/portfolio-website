import test from 'node:test';
import assert from 'node:assert/strict';
import { PHYSICS, RECOVERY_KEYS, registerWing, wingTable, type Recovery } from './flight-physics.ts';
import { createFlight, copyFlight, settleFlight, stepFlight, pitchPhase } from './flight.ts';
import { defineWing, SHARED_KEYS } from './wings.ts';
import { classicScript, flyScript, holdSteady, pair } from '../../test/helpers/flight-lab.ts';
import { GLIDERS, GLIDER_TABLES } from '../good-lift/gliders.ts';

// A copy of the classic numbers under another id: whatever reads tables by wing must fly it exactly
// as the classic wing, and a wing that differs must actually be flown by its own numbers.
registerWing('test-twin', defineWing({}));
registerWing('test-big', defineWing({ area: 33, canopyMass: 30 }));

test('a wing is the whole classic table with its changes, frozen, and only the canopy may change', () => {
  const twin = wingTable('test-twin');
  assert.notEqual(twin, PHYSICS);
  const { feel, ...numbers } = twin;
  assert.deepEqual(numbers, PHYSICS);
  assert.equal(feel, null, 'no feel of its own');
  assert.ok(Object.isFrozen(twin) && Object.isFrozen(twin.aero) && Object.isFrozen(twin.envelope.backflyBrake));
  assert.ok(Array.isArray(twin.envelope.backflyBrake), 'its lists stay lists');
  const big = wingTable('test-big');
  assert.equal(big.area, 33);
  assert.deepEqual(big.aero, PHYSICS.aero, 'a table left unchanged holds the classic numbers');
  assert.ok(Object.isFrozen(big.aero));
  const lifted = defineWing({ aero: { maxLift: 1.3 } });
  assert.notEqual(lifted.aero, PHYSICS.aero);
  assert.deepEqual(lifted.aero, { ...PHYSICS.aero, maxLift: 1.3 });
  assert.deepEqual(Object.keys(lifted), [...Object.keys(PHYSICS), 'feel'], 'the same keys, in the same order, and feel last');
  assert.deepEqual(Object.keys(wingTable('classic')), Object.keys(lifted), 'the classic wing is laid out as every other');
  assert.deepEqual(Object.keys(lifted.aero), Object.keys(PHYSICS.aero));
  for (const key of SHARED_KEYS) assert.throws(() => defineWing({ [key]: 1 } as never), new RegExp(key));
  assert.throws(() => defineWing({ nonsense: 1 } as never), /no nonsense/);
  assert.throws(() => defineWing({ aero: { nonsense: 1 } } as never), /aero\.nonsense/);
  assert.throws(() => defineWing({ area: Number.NaN }), /finite/);
  registerWing('test-twin', defineWing({}));
  assert.throws(() => registerWing('test-twin', defineWing({ area: 30 })), /already/, 'an id names one set of numbers');
  assert.throws(() => wingTable('nobody'), /nobody/);
});

test('a wing with the classic numbers flies bit for bit as the classic wing', () => {
  const classic = flyScript(classicScript());
  const twin = flyScript(classicScript(), { make: pos => createFlight(pos, 'test-twin') });
  assert.equal(twin.g.physical.wing, 'test-twin');
  assert.equal(twin.hash, classic.hash);
});

test('a wing is flown by its own numbers: a larger, heavier canopy trims slower', () => {
  const classic = holdSteady(pair(0), { seconds: 75 });
  const big = holdSteady(pair(0), { seconds: 75, make: pos => createFlight(pos, 'test-big') });
  // V = √(2W / (ρ·S·CL)): more area at much the same weight is a slower trim.
  assert.ok(big.air < classic.air - 0.4, `${big.air} vs ${classic.air}`);
  assert.ok(Math.abs(big.air / classic.air - Math.sqrt((PHYSICS.area / 33) * (87 + 30) / (87 + 26))) < 0.02);
});

test('copies, predictions and settling keep the wing, and settling with no wing named is the classic wing', () => {
  const g = createFlight({ x: 0, y: 2000, z: 0 }, 'test-big');
  for (let i = 0; i < 120; i++) stepFlight(g, pair(0.6, 0), {}, 1 / 60);
  const copy = copyFlight(createFlight({ x: 0, y: 0, z: 0 }), g);
  assert.equal(copy.physical.wing, 'test-big');
  const ahead = copyFlight(createFlight({ x: 0, y: 0, z: 0 }), g);
  for (let i = 0; i < 60; i++) { stepFlight(copy, pair(0.6, 0), {}, 1 / 60); stepFlight(ahead, pair(0.6, 0), {}, 1 / 60); }
  assert.deepEqual(copy.pilot, ahead.pilot, 'a copy flies on as its original does');
  const phase = pitchPhase(g, {});
  assert.ok(Number.isFinite(phase.peak));
  settleFlight(g, undefined, 'test-big');
  assert.equal(g.physical.wing, 'test-big');
  settleFlight(g);
  assert.equal(g.physical.wing, 'classic', 'the fjord, the hero and Training settle the classic wing unless told otherwise');
});

test('a damped wing names the turn its damping fades by', () => {
  const feel = { pitchDamping: 1000, pitchFade: 0.9, tip: 0 };
  assert.throws(() => defineWing({}, { ...feel, turnFade: 0 }), /turnFade/);
  assert.ok(defineWing({}, { ...feel, turnFade: 0.2 }).feel);
  assert.ok(defineWing({}, { ...feel, pitchDamping: 0, turnFade: 0 }).feel, 'an undamped wing has nothing to fade');
});

test('a wing\'s recovery gives every one of its numbers, each in range, with a way out of every failure it allows', () => {
  const { flow, recovery } = GLIDER_TABLES['en-c'].feel!;
  const feel = { pitchDamping: 0, pitchFade: 0.9, turnFade: 0.2, tip: 0, flow };
  const laid = defineWing({}, { ...feel, recovery });
  assert.deepEqual(laid.feel!.recovery, recovery, 'laid out as given');
  assert.deepEqual(Object.keys(laid.feel!.recovery!), RECOVERY_KEYS, 'in the one order every wing has');
  assert.deepEqual(Object.keys(laid.feel!), ['pitchDamping', 'pitchFade', 'turnFade', 'tip', 'flow', 'recovery']);
  assert.equal(defineWing({}, feel).feel!.recovery, null, 'a wing without one has none');
  for (const id of GLIDERS) assert.deepEqual(Object.keys(GLIDER_TABLES[id].feel!.recovery!), RECOVERY_KEYS, `${id} gives them all`);
  assert.throws(() => defineWing({}, { ...feel, flow: null, recovery }), /flow/, 'a fold is felt by its own half\'s flow');
  const short: Record<string, number> = { ...recovery };
  delete short.cravatPull;
  assert.throws(() => defineWing({}, { ...feel, recovery: short as unknown as Recovery }), /every one/);
  const bad = (changes: Partial<Recovery>, pattern: RegExp) =>
    assert.throws(() => defineWing({}, { ...feel, recovery: { ...recovery!, ...changes } }), pattern, JSON.stringify(changes));
  bad({ foldLift: 1.2 }, /foldLift/);
  bad({ refill: -1 }, /negative/);
  bad({ pumpFull: recovery!.pumpFrom }, /pump/);
  bad({ frontalTime: 0 }, /fill again/);
  bad({ cravatPull: 0 }, /cravat/);
  bad({ cravatFloor: recovery!.cravatFold }, /cravat/);
  bad({ creep: 0 }, /deep stall/);
  bad({ twistInertia: 9, twistBind: 0 }, /twist/);
});
