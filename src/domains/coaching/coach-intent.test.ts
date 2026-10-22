import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoachIntent } from './coach-intent.ts';
import { actionMessage } from './coach-actions.ts';
import { createFlightCoach } from './flight-coach.ts';
import { createDirectAcroGuide } from './direct-acro-guide.ts';
import { createFlight } from '../flight/flight.ts';
import { createSwingWatch } from './swing-watch.ts';
import { directBrakes } from '../../test/helpers/test-direct-flight.ts';

test('intent acknowledgement uses simulation time and survives copy changes but never an opposite demand', () => {
  const resolver = createCoachIntent(), input = directBrakes(0.3, 0);
  const fields = { state: 'lift', context: 'ridge', action: 'left', targetId: 'ridge', urgency: 'routine' as const };
  const first = resolver.resolve(fields, input, 10)!;
  assert.equal(first.acknowledged, false); assert.equal(first.owner, 'navigation');
  for (let n = 0; n < 50; n++) assert.equal(resolver.resolve(fields, input, 10)!.acknowledged, false);
  const accepted = resolver.resolve({ ...fields, title: 'Keep this pull' }, input, 10.15)!;
  assert.equal(accepted.acknowledged, true); assert.equal(accepted.intentId, first.intentId); assert.equal(accepted.issuedAt, 10);
  assert.equal(resolver.resolve(fields, directBrakes(), 10.3)!.acknowledged, true);
  assert.equal(resolver.resolve(fields, directBrakes(), 10.45)!.acknowledged, false);
  const opposite = resolver.resolve({ ...fields, action: 'right' }, input, 10.46)!;
  assert.notEqual(opposite.intentId, first.intentId); assert.equal(opposite.issuedAt, 10.46);
  assert.equal(opposite.action, 'right'); assert.equal(opposite.accepted, false); assert.equal(opposite.acknowledged, false);
  const safety = resolver.resolve({ state: 'recover', action: 'release-all', urgency: 'immediate' }, input, 10.47)!;
  assert.equal(safety.owner, 'safety'); assert.equal(safety.urgent, true); assert.equal(safety.action, 'release-all');
  assert.equal(resolver.resolve({ ...fields, warning: true }, input, 10.48)!.urgency, 'immediate');
  resolver.reset(); assert.equal(resolver.resolve(fields, input, 0)!.acknowledged, false);
});

test('resolving an already resolved recovery preserves its copy and demands without detail growth', () => {
  const resolver = createCoachIntent(), input = directBrakes();
  let message = actionMessage({ state: 'recover', action: 'brake', brakeDepth: 'working', detail: 'Catch the forward swing.' }, input);
  const expected = { title: message.title, detail: message.detail, hold: message.hold, release: message.release };
  for (let n = 0; n < 60; n++) {
    message = resolver.resolve(message, n > 30 ? directBrakes(0.6) : input, n / 60)!;
    assert.deepEqual({ title: message.title, detail: message.detail, hold: message.hold, release: message.release }, expected);
  }
  assert.equal(message.accepted, true);
});

test('routine copy settles without delaying a different brake pair or starving numeric updates', () => {
  const resolver = createCoachIntent(), input = directBrakes(0.5, 0.2);
  const first = { state: 'lift', context: 'thermal', phase: 'circle', action: 'left', title: 'Circle left', detail: '100 m',
    brakeTargets: { left: 0.5, right: 0.2, tolerance: 0.07 } };
  assert.equal(resolver.resolve(first, input, 0)!.title, 'Circle left');
  for (let n = 1; n < 60; n++) {
    const message = resolver.resolve({ ...first, title: 'Keep left', detail: `${100 - n} m` }, input, n / 60)!;
    assert.equal(message.title, 'Circle left'); assert.equal(message.detail, '100 m');
    assert.deepEqual(message.brakeTargets, first.brakeTargets);
  }
  assert.equal(resolver.resolve({ ...first, title: 'Keep left', detail: '40 m' }, input, 1)!.detail, '40 m');
  resolver.resolve({ ...first, phase: 'hold', title: 'Hold left' }, input, 1.1);
  const settling = resolver.resolve({ ...first, phase: 'hold', title: 'Hold left' }, input, 1.2)!;
  assert.equal(settling.phase, 'hold', 'physical phase metadata is always live');
  assert.equal(settling.title, 'Keep left');
  assert.equal(resolver.resolve({ ...first, phase: 'hold', title: 'Hold left' }, input, 2)!.title, 'Hold left');
  const opposite = resolver.resolve({ ...first, action: 'right', title: 'Pull right now',
    brakeTargets: { left: 0.2, right: 0.5, tolerance: 0.07 } }, input, 2.01)!;
  assert.equal(opposite.title, 'Pull right now'); assert.equal(opposite.action, 'right');
  assert.deepEqual(opposite.brakeTargets, { left: 0.2, right: 0.5, tolerance: 0.07 });
  assert.equal(opposite.accepted, false);
});

test('direct generic recovery holds its request through pitch-zero jitter and responds to a new physical half swing', () => {
  const coach = createFlightCoach(), g = createFlight({ x: 0, y: 1000, z: 0 }), watch = createSwingWatch().state;
  const input = directBrakes();
  const step = (pitch: number) => { watch.clock += 1 / 60; g.pitch = pitch; return coach.step(1 / 60,
    { g, watch, input, forceRecovery: true, clearance: 1000, fogClearance: 1000 }); };
  assert.equal(step(-0.1)!.action, 'brake');
  for (let n = 0; n < 30; n++) assert.equal(step(n % 2 ? -0.04 : 0.04)!.action, 'brake');
  assert.equal(step(0.06)!.action, 'release-brake');
  for (let n = 0; n < 30; n++) assert.equal(step(n % 2 ? -0.04 : 0.04)!.action, 'release-brake');
  g.stall = 1;
  assert.equal(step(-0.01)!.action, 'release-all', 'real separation pre-empts the generic phase immediately');
});

test('reverse copy waits for acknowledgement while its current target remains exact', () => {
  const guide = createDirectAcroGuide(), g = createFlight({ x: 0, y: 1100, z: 0 }), watch = createSwingWatch().state;
  watch.calm = 1; watch.clock = 1;
  const frame = { g, watch, input: directBrakes(), clearance: 1000 };
  guide.step('wingover', frame);
  g.bank = 1.1; watch.frontAt = 2; watch.clock = 2;
  const reverse = guide.step('wingover', frame);
  assert.equal(reverse.phase, 'reverse'); assert.equal(reverse.brakeTargets!.left, 0.82);
  watch.clock = 2.7;
  assert.equal(guide.step('wingover', frame).phase, 'reverse', 'time alone cannot acknowledge an unanswered reversal');
  frame.input = directBrakes(0.82, 0);
  watch.clock = 2.8;
  assert.equal(guide.step('wingover', frame).phase, 'reverse');
  watch.clock = 2.9;
  const hold = guide.step('wingover', frame);
  assert.equal(hold.phase, 'hold'); assert.deepEqual(hold.brakeTargets, reverse.brakeTargets);
});
