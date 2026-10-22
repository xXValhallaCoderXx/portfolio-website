import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrainingSession, TRAINING, TRAINING_LESSONS, type LessonId } from './training-session.ts';
import { TRICK_LESSONS } from './trick-lessons.ts';
import { createFlight, stepFlight } from '../flight/flight.ts';
import { brakeByte, summarizeControls } from '../flight/brake-controls.ts';
import type { FlightInput } from '../flight/models.ts';
import { emptyStore } from '../progression/good-lift-store.ts';
import { clearStore, learnTrickLesson, readStore, writeStore } from '../../adapters/browser/good-lift-storage.service.ts';

const dt = 1 / 60;
function follow(lesson: LessonId, side = 1, delay = 0, onLearned: (id: LessonId) => void = () => {}) {
  const training = createTrainingSession({ onLearned });
  training.begin(lesson, side);
  let input: FlightInput = { leftBrake: 0, rightBrake: 0 };
  let pending: { at: number; input: FlightInput } | null = null;
  const phases = new Set<string>(), moves = new Set<number>();
  for (let tick = 0; tick < 90 * 60 && training.state.status === 'flying'; tick++) {
    if (pending && tick >= pending.at) { input = pending.input; pending = null; }
    const message = training.step(dt, input);
    if (message?.phase) phases.add(message.phase);
    if (training.watch.state.moves > 0) moves.add(training.watch.state.moveKind);
    const target = message?.brakeTargets;
    const next = { leftBrake: target?.left ?? 0, rightBrake: target?.right ?? 0 };
    if (!pending && (next.leftBrake !== input.leftBrake || next.rightBrake !== input.rightBrake))
      pending = { at: tick + Math.round(delay / dt) + 1, input: next };
  }
  return { training, phases, moves };
}

for (const lesson of TRAINING_LESSONS) for (const side of [-1, 1]) for (const delay of [0, .15, .3])
  test(`selected ${lesson}, side ${side}, ${delay}s response: observed move and three-second recovery`, () => {
    const learned: LessonId[] = [];
    const { training, phases, moves } = follow(lesson, side, delay, id => learned.push(id));
    assert.equal(training.state.status, 'complete', JSON.stringify(training.state));
    assert.ok(moves.has(TRICK_LESSONS[lesson].kind));
    assert.ok(training.watch.state.calm >= 3 - 1e-9);
    assert.equal(training.watch.state.breaks, 0);
    assert.equal(training.g.stall, 0); assert.equal(training.g.tuck, 0);
    assert.ok(training.style.state.total > 0);
    assert.deepEqual(learned, [lesson]);
    assert.ok(phases.has('recovery')); assert.ok(phases.has('complete'));
    assert.equal(training.controls.leftBrake, 0); assert.equal(training.controls.rightBrake, 0);
    const elapsed = training.state.elapsed;
    training.step(300, { leftBrake: 1, rightBrake: 1 });
    assert.equal(training.state.elapsed, elapsed, 'completed attempts wait for explicit selection');
    assert.deepEqual(learned, [lesson]);
  });

test('Training preserves shared references and flies the same canonical pair with the same solver', () => {
  const pos = { x: 100, y: 50, z: 200 }, g = createFlight(pos), controls: FlightInput = {}, air = {};
  const training = createTrainingSession({ g, controls, air });
  assert.equal(training.state.status, 'idle');
  training.begin('wingover', -1);
  assert.equal(training.g, g); assert.equal(g.pos, pos);
  assert.equal(training.controls, controls); assert.equal(training.air, air);
  assert.deepEqual(pos, TRAINING.origin);
  const input = { leftBrake: .1234567, rightBrake: .7654321 }, before = { ...input };
  training.step(dt, input);
  const expected = { controlMode: 'brakes' as const, leftBrake: brakeByte(input.leftBrake) / 255,
    rightBrake: brakeByte(input.rightBrake) / 255 };
  const reference = createFlight({ ...TRAINING.origin });
  stepFlight(reference, summarizeControls(expected), { windY: TRAINING.windY }, dt);
  assert.deepEqual(g.pilot, reference.pilot); assert.deepEqual(g.canopy, reference.canopy);
  assert.equal(controls.leftBrake, expected.leftBrake); assert.equal(controls.rightBrake, expected.rightBrake);
  assert.equal(controls.steered, false); assert.equal(controls.climb, null);
  assert.deepEqual(input, before, 'guidance never writes the held input');
});

test('idle or ignored guidance never times out, restarts or selects a different lesson', () => {
  const training = createTrainingSession(); training.begin('pitch');
  for (let tick = 0; tick < 120 * 60; tick++) training.step(dt, {});
  assert.equal(training.state.status, 'flying'); assert.equal(training.state.lesson, 'pitch');
  assert.equal(training.watch.state.moves, 0);
  assert.equal(training.message?.phase, 'shape');
  const elapsed = training.state.elapsed;
  training.step(0, { leftBrake: 1 }); assert.equal(training.state.elapsed, elapsed);
});

for (const lesson of TRAINING_LESSONS) test(`${lesson} enforces entry and abort height reserves`, () => {
  let floor = TRAINING.origin.y - TRICK_LESSONS[lesson].entry + 1;
  const training = createTrainingSession({ heightAt: () => floor });
  training.begin(lesson);
  assert.equal(training.state.status, 'failed'); assert.equal(training.state.failure, 'clearance');
  floor = 0; training.retry(); assert.equal(training.state.status, 'flying');
  floor = training.g.pos.y - TRICK_LESSONS[lesson].abort + 5;
  training.step(dt, {});
  assert.equal(training.state.status, 'failed'); assert.equal(training.state.failure, 'clearance');
  const elapsed = training.state.elapsed, position = { ...training.g.pos };
  training.step(100, {});
  assert.equal(training.state.elapsed, elapsed); assert.deepEqual(training.g.pos, position);
});

test('a real full-stall attempt fails and waits for explicit retry without learning', () => {
  const learned: string[] = [], training = createTrainingSession({ onLearned: id => learned.push(id) });
  training.begin('loop');
  for (let tick = 0; tick < 30 * 60 && training.state.status === 'flying'; tick++)
    training.step(dt, { leftBrake: 1, rightBrake: 1 });
  assert.equal(training.state.status, 'failed'); assert.deepEqual(learned, []);
  const elapsed = training.state.elapsed;
  training.step(100, {}); assert.equal(training.state.elapsed, elapsed);
  training.retry(); assert.equal(training.state.status, 'flying'); assert.equal(training.state.elapsed, 0);
  assert.equal(training.g.stall, 0); assert.equal(training.watch.state.moves, 0);
});

test('an incomplete slow loop settles into Retry rather than teaching another maneuver or hanging', () => {
  const learned: string[] = [], { training } = follow('loop', 1, .6, id => learned.push(id));
  assert.equal(training.state.status, 'failed'); assert.equal(training.state.failure, 'incomplete');
  assert.deepEqual(learned, []);
});

test('Retry and Next are explicit neutral respawns; leaving clears the training instruction', () => {
  const training = createTrainingSession(); training.begin('spiral', -1);
  for (let i = 0; i < 240; i++) training.step(dt, { leftBrake: .82 });
  training.retry();
  assert.equal(training.state.lesson, 'spiral'); assert.equal(training.state.side, -1);
  assert.deepEqual(training.g.pos, TRAINING.origin); assert.equal(training.watch.state.clock, 0);
  assert.equal(training.style.state.total, 0); assert.equal(training.controls.leftBrake, 0);
  training.next(); assert.equal(training.state.lesson, 'wingover'); assert.equal(training.state.side, -1);
  training.begin('loop'); training.next(); assert.equal(training.state.lesson, 'pitch');
  training.leave(); assert.equal(training.state.status, 'idle'); assert.equal(training.message, null);
});

test('completed training persists only the selected learned lesson, preserving career and kit progress', () => {
  const items = new Map<string, string>(), storage = { getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => items.set(key, value), removeItem: (key: string) => items.delete(key) };
  clearStore(storage);
  writeStore({ ...emptyStore(), best: { total: 100, score: 120, peak: 800 }, runs: 8, tonnage: 500,
    learnedLessons: ['loop'] }, storage);
  const before = readStore(storage);
  const { training } = follow('spiral', 1, .3, id => learnTrickLesson(id, storage));
  assert.equal(training.state.status, 'complete');
  assert.deepEqual(readStore(storage), { ...before, learnedLessons: ['spiral', 'loop'] });
  clearStore(storage);
});
