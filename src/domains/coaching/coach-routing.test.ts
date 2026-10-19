import type { CoachFields } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { interruptsLift, resolveCoachMessage } from './coach-routing.ts';

const lift: CoachFields = Object.freeze({ state: 'lift', activity: 'thermalling', context: 'thermal', phase: 'centre',
  action: 'left', title: 'HOLD LEFT', hold: ['left', 'brake'], release: ['right', 'bar'] });
const warning = Object.freeze({ context: 'FOG CLOSE', detail: 'Keep climbing above the fog.' });
const notice = Object.freeze({ title: 'WIND SHIFT', detail: 'Wind now blows east.' });

test('travel stays quiet even when wind or optional plates become news', () => {
  assert.equal(resolveCoachMessage(null, { notice }), null);
  assert.equal(resolveCoachMessage(null, { notice: { title: 'OPTIONAL PLATES', detail: 'Collect bonus kg.' } }), null);

});

test('warning-only safety remains visible while travel is otherwise quiet', () => {
  const message = resolveCoachMessage(null, { warning, notice });
  assert.equal(message!.state, 'hazard'); assert.equal(message!.warning, true);
  assert.equal(message!.title, 'FOG CLOSE'); assert.equal(message!.detail, warning.detail);
  assert.deepEqual(message!.hold, []); assert.deepEqual(message!.release, []);
});

test('warnings and news do not replace an established activity or its action', () => {
  const message = resolveCoachMessage(lift, { warning, notice });
  assert.equal(message!.activity, 'thermalling'); assert.equal(message!.context, lift.context);
  assert.equal(message!.title, lift.title); assert.equal(message!.warningLabel, 'FOG CLOSE');
  assert.equal(message!.feedback, warning.detail); assert.equal(lift.feedback, undefined);
  assert.match(resolveCoachMessage(lift, { notice })!.feedback!, /^WIND SHIFT/);
  assert.equal(resolveCoachMessage({ ...lift, feedback: 'MOVE BANKED' }, { notice })!.feedback, 'MOVE BANKED');
});

test('reactive moves keep their own reward and instruction without opening an ambient notice', () => {
  const trick = { ...lift, activity: undefined, state: 'timing', context: 'wingover', feedback: 'PRECISE TIMING' };
  assert.equal(resolveCoachMessage(trick, { notice }), trick);
  assert.equal(interruptsLift(trick), true);
  for (const state of ['recover', 'descent', 'building'] as const) assert.equal(interruptsLift({ state }), true);
  assert.equal(interruptsLift(lift), false); assert.equal(interruptsLift({ state: 'hazard' }), false);
});



test('ridge transfer readiness takes precedence over optional plates while wind warnings remain visible', () => {
  const ridge = { ...lift, activity: 'ridge-soaring', transfer: { ready: false, missingHeight: 25 },
    detail: 'Build about 25 m more height along this ridge before crossing to a thermal.' };
  const plates = { state: 'plates', title: 'OPTIONAL PLATES', detail: 'Collect bonus kg.' };
  assert.deepEqual(resolveCoachMessage(ridge, { notice: plates }), ridge);
  assert.match(resolveCoachMessage(ridge, { notice })!.feedback!, /^WIND SHIFT/);
  const urgent = resolveCoachMessage(ridge, { notice: plates, warning });
  assert.equal(urgent!.warning, true); assert.equal(urgent!.warningLabel, warning.context);
  assert.equal(urgent!.detail, ridge.detail);
});
