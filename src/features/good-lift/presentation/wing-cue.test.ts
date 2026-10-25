import test from 'node:test';
import assert from 'node:assert/strict';
import { WING_CUE, createWingCue, eventName, placeCue, stepKeys, type CueAdvice } from './wing-cue.ts';
import { keyboardBrakes } from '../../../domains/flight/brake-input.ts';
import { FAILURES } from '../../../domains/flight/wing-folds.ts';

const advice = (changes: Partial<CueAdvice> = {}): CueAdvice =>
  ({ event: '', side: 0, left: 0, right: 0, bar: false, saves: 0, saved: { seconds: 0, lost: 0 }, ...changes });

test('a failure is named on every glider; the A and the B are told its fix and the key for its step, a touch screen no key', () => {
  const cue = createWingCue(() => 0);
  assert.equal(cue.observe(advice({ event: 'asym', side: -1, right: 0.3 }), undefined, 'fix'), 'event');
  assert.deepEqual(cue.show('fix', 'keyboard'), { kind: 'event', name: 'LEFT COLLAPSE', fix: 'BRAKE RIGHT · PUMP LEFT', keys: 'D' });
  assert.deepEqual(cue.show('fix', 'touch'), { kind: 'event', name: 'LEFT COLLAPSE', fix: 'BRAKE RIGHT · PUMP LEFT', keys: '' });
  assert.deepEqual(cue.target('fix'), { left: 0, right: 0.3 }, 'the handles light the step instead');
  assert.equal(cue.observe(advice({ event: 'asym', side: -1, left: 0.82 }), undefined, 'fix'), 'step', 'the next step ticks');
  assert.equal(cue.show('fix').keys, 'Q');
  assert.deepEqual(cue.show('name'), { kind: 'event', name: 'LEFT COLLAPSE', fix: '', keys: '' });
  assert.equal(cue.target('name'), null);
  assert.equal(cue.observe(advice({ event: 'asym', side: -1, right: 0.3 }), undefined, 'name'), null, 'a C+ glider hears no step');
});

test('a C, a D or the acro wing is told only what happened: no hands, no brakes, no bar', () => {
  const cue = createWingCue(() => 0);
  for (const event of FAILURES) for (const side of [-1, 1]) {
    cue.observe(advice({ event, side, left: 0.82, bar: event === 'deep' }), undefined, 'name');
    const said = cue.words('name');
    assert.ok(said.length > 0, event);
    assert.doesNotMatch(said, /BRAKE|PUMP|PULL|HANDS|RELEASE|BAR|UNWIND|CATCH/, said);
    assert.equal(said, eventName(event, side));
  }
});

test('SAVED says what it cost for a while, after the failure; a failure outranks it, and it outranks SOFT', () => {
  let clock = 0;
  const cue = createWingCue(() => clock);
  cue.observe(advice({ event: 'frontal' }));
  assert.equal(cue.observe(advice({ saves: 1, saved: { seconds: 1.64, lost: 23.6 } })), 'saved');
  assert.deepEqual(cue.show(), { kind: 'saved', name: 'SAVED · 1.6 s · −24 m', fix: '', keys: '' });
  cue.observe(advice({ saves: 2, saved: { seconds: 0.8, lost: -3 } }));
  assert.equal(cue.show().name, 'SAVED · 0.8 s', 'no metres said where none were lost');
  cue.observe(advice({ saves: 3, saved: { seconds: 1.64, lost: 23.6 } }));
  cue.observe(advice({ saves: 1 }), { left: 0, right: 0.7 });
  assert.equal(cue.show().kind, 'saved', 'SAVED over SOFT');
  assert.equal(cue.observe(advice({ event: 'spin', side: 1, saves: 1 }), { left: 0, right: 0.7 }), 'event');
  assert.equal(cue.show().name, 'SPIN ▸', 'a failure over both');
  cue.observe(advice({ saves: 1 }), { left: 0, right: 0.7 });
  clock += WING_CUE.saved + 1;
  assert.equal(cue.show().name, '▸ SOFT');
  cue.reset(advice({ saves: 1 }));
  assert.equal(cue.observe(advice({ saves: 1 })), null, 'a reset starts from where the guide is');
});

test('SOFT says which half has gone soft, its name only, once heard, until it is well clear', () => {
  const cue = createWingCue(() => 0);
  assert.equal(cue.observe(advice(), { left: 0, right: 0.4 }), null, 'not near enough');
  assert.equal(cue.observe(advice(), { left: 0, right: 0.6 }), 'soft');
  assert.equal(cue.show().name, '▸ SOFT');
  assert.equal(cue.observe(advice(), { left: 0, right: 0.35 }), null, 'held until well clear');
  assert.equal(cue.observe(advice(), { left: 0, right: 0.2 }), null);
  assert.equal(cue.show().name, '');
  assert.equal(cue.observe(advice(), { left: 0.7, right: 0.2 }), 'soft');
  assert.equal(cue.show().name, 'SOFT ◂');
});

test('every key the cue names gives the hands it names (brake-input.js)', () => {
  const keyOf: Record<string, string[]> = { A: ['KeyA'], D: ['KeyD'], Q: ['KeyQ'], E: ['KeyE'], S: ['KeyS'], 'SHIFT + S': ['ShiftLeft', 'KeyS'], 'HANDS UP': [] };
  for (const [left, right] of [[0, 0], [0.3, 0], [0, 0.3], [0.82, 0], [0, 0.82], [0.6, 0.6], [1, 1]]) {
    const keys = stepKeys(left, right, false);
    assert.deepEqual(keyboardBrakes(new Set(keyOf[keys])), { leftBrake: left, rightBrake: right }, keys);
  }
  assert.equal(stepKeys(0, 0, true), '↑');
});

test('the cue stands over the pilot inside the screen, or docks under the readouts', () => {
  const screen = { width: 800, height: 600 }, size = { width: 200, height: 30 }, out = { x: 0, y: 0 };
  assert.deepEqual(placeCue(400, 300, true, false, screen, size, 40, out), { x: 300, y: 300 - WING_CUE.up - 30 });
  assert.deepEqual(placeCue(10, 300, true, false, screen, size, 40, out), { x: WING_CUE.margin, y: 178 });
  assert.deepEqual(placeCue(400, 60, true, false, screen, size, 40, out), { x: 300, y: 40 + WING_CUE.below }, 'never over the readouts');
  assert.deepEqual(placeCue(400, 300, true, true, screen, size, 40, out), { x: 300, y: 48 });
  assert.deepEqual(placeCue(400, 300, false, false, screen, size, 40, out), { x: 300, y: 48 }, 'with the pilot off the screen, docked');
});
