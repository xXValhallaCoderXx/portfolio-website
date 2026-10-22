import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectAcroGuide } from './direct-acro-guide.ts';
import { createFlight } from '../flight/flight.ts';
import { createSwingWatch } from './swing-watch.ts';
import { actionMessage } from './coach-actions.ts';

function frame() {
  const g = createFlight({ x: 0, y: 1100, z: 0 }), watch = createSwingWatch().state;
  watch.clock = 1; watch.calm = 1;
  return { g, watch, input: { controlMode: 'brakes' as const, leftBrake: 0, rightBrake: 0 } };
}

test('Spiral 360 requests a deliberate reachable deep turn and reports only observed course arc', () => {
  const guide = createDirectAcroGuide(), f = frame(); guide.reset(-1);
  let message = guide.step('spiral', f);
  assert.deepEqual(message.brakeTargets, { left: .82, right: 0, tolerance: .07 });
  assert.equal(message.progress, 0);
  f.g.bank = -1.2; f.watch.clock++;
  message = guide.step('spiral', f); assert.equal(message.progress, 0, 'bank is not course rotation');
  f.watch.spiralArc = Math.PI; f.watch.clock++;
  message = guide.step('spiral', f); assert.equal(message.progress, .5);
  assert.equal(actionMessage(message, { controlMode: 'brakes', leftBrake: .82, rightBrake: 0 }).accepted, true);
  guide.recover(); f.g.pitch = 0; f.watch.calm = .5;
  message = guide.step('spiral', f);
  assert.deepEqual(message.brakeTargets, { left: 0, right: 0, tolerance: .07 });
  assert.match(message.detail!, /three steady seconds/);
});

test('wingover waits beyond an ordinary neutral-start bank and reverses on qualified return motion', () => {
  const guide = createDirectAcroGuide(), f = frame(); guide.step('wingover', f);
  Object.assign(f.watch, { clock: 2, topAt: 2, topSide: 1, top: .79 });
  Object.assign(f.g, { bank: .79, rollRate: -.02 });
  let message = guide.step('wingover', f);
  assert.equal(message.brakeTargets?.right, .82); assert.notEqual(message.phase, 'reverse');
  Object.assign(f.watch, { clock: 3, topAt: 3, top: 1.2 });
  Object.assign(f.g, { bank: 1.19, rollRate: -.05 });
  message = guide.step('wingover', f);
  assert.equal(message.phase, 'reverse'); assert.equal(message.brakeTargets?.left, .82);
  f.input.leftBrake = .82; f.watch.clock += .2;
  assert.equal(guide.step('wingover', f).phase, 'reverse', 'the reversal remains readable after acknowledgement');
});

test('a settled recovery consistently requests hands up while a real forward swing still requests a catch', () => {
  const guide = createDirectAcroGuide(), f = frame(); guide.recover();
  f.g.pitch = -.06; f.watch.calm = .5;
  let message = guide.step('pitch', f);
  assert.equal(message.action, 'release-all'); assert.equal(message.brakeTargets?.left, 0);
  f.g.pitch = -.3; f.watch.calm = 0; f.watch.clock++;
  message = guide.step('pitch', f);
  assert.equal(message.action, 'brake'); assert.equal(message.brakeTargets?.left, .6);
});
