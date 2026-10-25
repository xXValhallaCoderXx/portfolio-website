import test from 'node:test';
import assert from 'node:assert/strict';
import type { FlightInput } from '../flight/models.ts';
import { createTrainingSession, TRAINING_LESSONS, isTrickLesson, isRecoveryLesson, type TrainingLessonId } from './training-session.ts';
import { TRICK_LESSONS } from './trick-lessons.ts';
import { GLIDERS, GLIDER_LESSON_LOCKS, lessonOffers } from './gliders.ts';
import { canInduce } from '../flight/flight.ts';

// Training flies the glider worn (good-lift.js createGoodLiftTraining): every lesson a glider is
// taught completes on it, followed by its visible cues at a human reaction, and is judged as the
// glider's runs are, by the trick watch.
const dt = 1 / 60;
function follow(wing: string, lesson: TrainingLessonId, side: number, delay = 0.15) {
  const training = createTrainingSession({ wing: () => wing });
  training.begin(lesson, side);
  let input: FlightInput = { leftBrake: 0, rightBrake: 0 };
  let pending: { at: number; input: FlightInput } | null = null;
  const tricks: { move: number; link: number }[] = [];
  for (let tick = 0, seen = 0; tick < 120 * 60 && training.state.status === 'flying'; tick++) {
    if (pending && tick >= pending.at) { input = pending.input; pending = null; }
    const message = training.step(dt, input);
    if (training.tricks.state.instances > seen) {
      seen = training.tricks.state.instances;
      tricks.push({ move: training.tricks.state.move, link: training.tricks.state.link });
    }
    const next = { leftBrake: message?.brakeTargets?.left ?? 0, rightBrake: message?.brakeTargets?.right ?? 0, bar: !!message?.brakeTargets?.bar };
    if (!pending && (next.leftBrake !== input.leftBrake || next.rightBrake !== input.rightBrake || next.bar !== !!input.bar))
      pending = { at: tick + Math.round(delay / dt) + 1, input: next };
  }
  return { training, tricks };
}

for (const wing of GLIDERS) for (const [index, lesson] of TRAINING_LESSONS.entries()) {
  if (lessonOffers(wing)[lesson] !== '') continue;
  const side = index % 2 ? 1 : -1;
  test(`the ${wing} is taught ${lesson}: followed 0.15 s late to the ${side < 0 ? 'left' : 'right'}, it completes`, () => {
    const { training, tricks } = follow(wing, lesson, side);
    assert.equal(training.g.physical.wing, wing, 'flown on the glider');
    assert.equal(training.state.status, 'complete', JSON.stringify(training.state));
    if (isRecoveryLesson(lesson)) {
      assert.equal(training.recoveryState.saved.seconds > 0, true, 'saved');
      assert.equal(training.g.foldLeft + training.g.foldRight + training.g.cravatLeft + training.g.cravatRight + training.g.deepStall + training.g.twisted, 0);
    } else if (isTrickLesson(lesson)) {
      const { moves, link } = TRICK_LESSONS[lesson];
      assert.ok(tricks.some(trick => moves.includes(trick.move) && (!link || trick.link === link)), JSON.stringify(tricks));
      assert.equal(training.tricks.state.breaks, 0, 'nothing bailed');
    }
    assert.equal(training.g.stall, 0); assert.equal(training.g.tuck, 0);
    assert.equal(training.controls.leftBrake, 0); assert.equal(training.controls.rightBrake, 0);
  });
}

test('what each glider is not taught, and why, and that the classic wing is offered no rotation', () => {
  for (const wing of GLIDERS) {
    const offers = lessonOffers(wing);
    for (const lesson of TRAINING_LESSONS) {
      const lock = GLIDER_LESSON_LOCKS[wing][lesson];
      assert.equal(offers[lesson], lock ?? '', `${wing} ${lesson}`);
      if (lock) assert.ok(lock.length > 10, 'a lock says why');
    }
    assert.equal(offers.steering, '', 'every glider is taught to steer');
    assert.equal(offers.thermal, '', 'and to climb');
  }
  assert.deepEqual(TRAINING_LESSONS.filter(lesson => lessonOffers('en-a')[lesson] === ''),
    ['steering', 'thermal', 'spiral', 'wingover', 'wing-spiral', 'spiral-exit', 'collapse', 'frontal']);
  assert.deepEqual(TRAINING_LESSONS.filter(lesson => lessonOffers('acro')[lesson] !== ''), ['pitch', 'loop']);
  // Every glider is taught the failures it can have (wing-folds.js failsBy), and no other.
  const kinds = { collapse: 'asym', frontal: 'frontal', 'deep-stall': 'deep', spin: 'spin', cravat: 'cravat', twist: 'twist' } as const;
  for (const wing of GLIDERS) for (const [lesson, kind] of Object.entries(kinds))
    assert.equal(lessonOffers(wing)[lesson as TrainingLessonId] === '', canInduce(wing, kind), `${wing} ${lesson}`);
  assert.equal(lessonOffers('en-c').heli, '', 'the C helicopters');
  assert.ok(lessonOffers('en-c').sat, 'but takes no SAT');
  const classic = lessonOffers('classic');
  assert.equal(classic.heli, null); assert.equal(classic.sat, null);
  for (const lesson of ['collapse', 'frontal', 'deep-stall', 'spin', 'cravat', 'twist'] as const) assert.equal(classic[lesson], null, `no ${lesson} on the classic wing`);
  assert.ok(TRAINING_LESSONS.filter(lesson => classic[lesson] !== null).every(lesson => classic[lesson] === ''));
});

test('a glider\'s Next skips the lessons it is not taught, and the classic wing is flown when no glider is named', () => {
  const offers = lessonOffers('en-a');
  const training = createTrainingSession({ wing: () => 'en-a', open: id => offers[id] === '' });
  training.begin('wingover');
  training.next();
  assert.equal(training.state.lesson, 'wing-spiral', 'the stall is passed over');
  training.begin('spiral-exit');
  training.next();
  assert.equal(training.state.lesson, 'collapse', 'the loop and the rotations too, on to the recoveries');
  training.begin('frontal');
  training.next();
  assert.equal(training.state.lesson, 'steering', 'and the failures the A cannot have, round to the first');
  const classic = createTrainingSession();
  classic.begin('spiral');
  assert.equal(classic.g.physical.wing, 'classic');
});
