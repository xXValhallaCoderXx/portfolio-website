import test from 'node:test';
import assert from 'node:assert/strict';
import type { CoachFields } from '../../../domains/coaching/models.ts';
import type { FlightInput } from '../../../domains/flight/models.ts';
import { keyboardBrakes } from '../../../domains/flight/brake-input.ts';
import { createTrainingSession } from '../../../domains/good-lift/training-session.ts';
import { actionMessage } from '../../../domains/coaching/coach-actions.ts';
import { brakeByte } from '../../../domains/flight/brake-controls.ts';
import { createTrainingInputFeedback } from './training-input-feedback.ts';

const message = (left = .3, right = 0, phase = 'turn-first'): CoachFields => ({
  state: 'lesson', lessonId: 'steering', phase, action: 'left', brakeTargets: { left, right, tolerance: .07 },
});
function fixture() {
  const feedback = createTrainingInputFeedback();
  let clock = 0;
  const step = (input: FlightInput, demand: CoachFields | null = message(), dt = .02, extra = {}) => {
    clock += dt;
    return { ...feedback.step({ lesson: 'steering', status: 'flying', message: demand, input, clock, ...extra }) };
  };
  const settle = (input: FlightInput, demand = message(), ticks = 6) => Array.from({ length: ticks }, () => step(input, demand));
  return { feedback, step, settle };
}

test('mouse and touch positions bing once after reaching both canonical hand targets', () => {
  const f = fixture();
  assert.match(f.step({ leftBrake: .15 }).label, /BRAKE POSITION · 50% of target/);
  assert.equal(f.step({ leftBrake: .3, rightBrake: .15 }).status, 'ease', 'the opposite hand must also match');
  const target = Object.freeze({ controlMode: 'brakes' as const, leftBrake: .30, rightBrake: 0 });
  const frames = f.settle(target);
  assert.equal(frames.filter(frame => frame.bing).length, 1);
  assert.equal(frames.at(-1)!.status, 'hold'); assert.match(frames.at(-1)!.label, /^HOLD HERE/);
  assert.equal(f.settle(target, message(), 150).filter(frame => frame.bing).length, 0, 'a held target stays quiet');
  assert.deepEqual(target, { controlMode: 'brakes', leftBrake: .30, rightBrake: 0 }, 'feedback never writes input');
});

test('keyboard A, D, Q, E and Space receive the same position feedback', () => {
  for (const [codes, left, right] of [
    [['KeyA'], .3, 0], [['KeyD'], 0, .3], [['KeyQ'], .82, 0], [['KeyE'], 0, .82], [['Space'], .6, .6],
  ] as const) {
    const f = fixture(), input = keyboardBrakes(new Set(codes));
    const frames = f.settle(input, message(left, right));
    assert.equal(frames.at(-1)!.status, 'hold', codes.join('+'));
    assert.equal(frames.filter(frame => frame.bing).length, 1, codes.join('+'));
  }
  const f = fixture();
  const fullPull = keyboardBrakes(new Set(['KeyA', 'ShiftLeft']));
  assert.match(f.step(fullPull).label, /^EASE OFF/, 'an over-deep keyboard pull warns immediately');
  assert.equal(f.settle(fullPull).some(frame => frame.bing), false);
});

test('a released opposite hand must be at or below the canonical .04 release threshold', () => {
  for (const opposite of [.05, .06, .07]) for (const mirror of [false, true]) {
    const f = fixture(), demand = mirror ? message(0, .3) : message(.3, 0);
    const input = mirror ? { leftBrake: opposite, rightBrake: .3 } : { leftBrake: .3, rightBrake: opposite };
    const frames = f.settle(input, demand);
    assert.equal(frames.at(-1)!.status, 'ease');
    assert.equal(frames.some(frame => frame.bing), false, `opposite hand at ${opposite} is still pulled`);
  }
  for (const opposite of [0, .02, .04]) {
    const frames = fixture().settle({ leftBrake: .3, rightBrake: opposite });
    assert.equal(frames.at(-1)!.status, 'hold'); assert.equal(frames.filter(frame => frame.bing).length, 1);
  }
});

test('settled feedback acceptance agrees with the canonical coach across mirrored brake-position grids', () => {
  const depths = [0, .02, .04, .05, .06, .07, .15, .23, .24, .30, .36, .37, .38, .53, .54, .60, .67, .68, .75, .82, .89, .90, 1];
  for (const [left, right] of [[.3, 0], [0, .3], [.82, 0], [0, .82], [.6, .6]]) {
    const demand = message(left, right);
    for (const leftBrake of depths) for (const rightBrake of depths) {
      const input = { controlMode: 'brakes' as const, leftBrake: brakeByte(leftBrake) / 255, rightBrake: brakeByte(rightBrake) / 255 };
      const expected = actionMessage(demand, input).accepted;
      const frames = fixture().settle(input, demand);
      assert.equal(frames.at(-1)!.status === 'hold', expected, `target ${left}/${right}; input ${input.leftBrake}/${input.rightBrake}`);
      assert.equal(frames.some(frame => frame.bing), expected);
    }
  }
});

test('debounce, rearming hysteresis and cooldown prevent crossing or jitter from chattering', () => {
  const f = fixture(), correct = { leftBrake: .3 }, outside = { leftBrake: .5 };
  f.step(outside);
  assert.equal(f.step(correct).bing, false); assert.equal(f.step(correct).bing, false);
  f.step(outside);
  const first = f.settle(correct);
  assert.equal(first.filter(frame => frame.bing).length, 1, 'a brief target crossing does not ring');
  const jitter = Array.from({ length: 20 }, (_, i) => f.step({ leftBrake: i % 2 ? .3 : .38 }));
  assert.equal(jitter.some(frame => frame.bing), false, 'boundary noise cannot rearm the audible cue');
  f.settle(outside, message(), 8);
  assert.equal(f.settle(correct).some(frame => frame.bing), false, 'reentry inside cooldown stays quiet');
  f.settle(outside, message(), 50);
  assert.equal(f.settle(correct).filter(frame => frame.bing).length, 1, 'a deliberate correction can ring again');
});

test('neutral, other lessons, completed runs and warnings never emit target feedback', () => {
  const f = fixture();
  for (const [demand, extra] of [
    [message(0, 0), {}], [message(), { lesson: 'thermal' }], [message(), { status: 'complete' }],
    [{ ...message(), warning: true }, {}], [{ ...message(), urgent: true }, {}], [null, {}],
  ] as [CoachFields | null, object][]) {
    for (let tick = 0; tick < 10; tick++) {
      const state = f.step({ leftBrake: .3 }, demand, .02, extra);
      assert.equal(state.status, 'idle'); assert.equal(state.label, ''); assert.equal(state.bing, false);
    }
  }
  assert.equal(f.settle({ leftBrake: .3, bar: true }).some(frame => frame.bing), false);
  assert.equal(f.settle({ leftBrake: .3, ears: true }).some(frame => frame.bing), false);
});

test('phase, retry clocks and explicit lifecycle resets discard previous acceptance', () => {
  const f = fixture();
  assert.equal(f.settle({ leftBrake: .3 }).filter(frame => frame.bing).length, 1);
  assert.equal(f.step({ rightBrake: .3 }, message(0, .3, 'turn-second')).status, 'pull', 'new phase needs fresh target dwell');
  f.settle({ rightBrake: .3 }, message(0, .3, 'turn-second'));
  const replayed = f.feedback.step({ lesson: 'steering', status: 'flying', message: message(), input: { leftBrake: .3 }, clock: 0 });
  assert.equal(replayed.status, 'pull'); assert.equal(replayed.bing, false, 'retry clock reset never reuses dwell');
  f.feedback.reset();
  assert.equal(f.feedback.state.status, 'idle'); assert.equal(f.feedback.state.label, '');
  assert.equal(f.feedback.step({ lesson: 'steering', status: 'flying', message: message(), input: { leftBrake: .3 }, clock: 2 }).bing, false);
});

test('repeated presentation reads and duplicate simulation timestamps cannot advance feedback', () => {
  const f = fixture(); f.step({ leftBrake: .3 });
  for (let n = 0; n < 100; n++) {
    const before = { ...f.feedback.state };
    assert.equal(f.feedback.state.status, 'pull'); assert.deepEqual(f.feedback.state, before);
    assert.equal(f.feedback.step({ lesson: 'steering', status: 'flying', message: message(), input: { leftBrake: .3 }, clock: .02 }).bing, false);
  }
});

test('real mirrored Steering lessons cue each requested pull and retain identical physical results', () => {
  function fly(side: number, withFeedback: boolean) {
    const training = createTrainingSession(), feedback = createTrainingInputFeedback();
    training.begin('steering', side);
    let input: FlightInput = {}, pending: { at: number; input: FlightInput } | null = null;
    const sounds: string[] = [];
    for (let tick = 0; tick < 100 * 60 && training.state.status === 'flying'; tick++) {
      if (pending && tick >= pending.at) { input = pending.input; pending = null; }
      const demand = training.step(1 / 60, input);
      if (withFeedback) {
        const cue = feedback.step({ lesson: training.state.lesson, status: training.state.status,
          message: demand, input: training.controls, clock: training.state.elapsed });
        if (cue.bing) sounds.push(demand!.phase!);
      }
      const next = { leftBrake: demand?.brakeTargets?.left ?? 0, rightBrake: demand?.brakeTargets?.right ?? 0 };
      if (!pending && (next.leftBrake !== input.leftBrake || next.rightBrake !== input.rightBrake))
        pending = { at: tick + 19, input: next };
    }
    return { training, sounds };
  }
  for (const side of [-1, 1]) {
    const baseline = fly(side, false), observed = fly(side, true);
    assert.equal(observed.training.state.status, 'complete');
    assert.deepEqual(observed.sounds, ['turn-first', 'turn-second', 'turn-sharp', 'brake']);
    assert.deepEqual(observed.training.state, baseline.training.state);
    assert.deepEqual(observed.training.g, baseline.training.g, 'feedback changes no physical state');
    assert.deepEqual(observed.training.watch.state, baseline.training.watch.state);
    assert.equal(observed.training.style.state.total, 0);
  }
});
