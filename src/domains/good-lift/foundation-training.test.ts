import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrainingSession, TRAINING_LESSONS, TRAINING_LESSON_INFO, type FoundationLessonId, type TrainingLessonId } from './training-session.ts';
import { FOUNDATION } from './foundation-training.ts';
import { TRICK_LESSONS } from './trick-lessons.ts';
import type { FlightInput } from '../flight/models.ts';
import { PHYSICS } from '../flight/flight-physics.ts';
import { emptyStore, normalizeStore } from '../progression/good-lift-store.ts';
import { clearStore, learnTrainingLesson, readStore, writeStore } from '../../adapters/browser/good-lift-storage.service.ts';

const dt = 1 / 60;
function pilot(lesson: FoundationLessonId, side: number, delay: number, onLearned: (id: TrainingLessonId) => void = () => {}) {
  const training = createTrainingSession({ onLearned }); training.begin(lesson, side);
  let input: FlightInput = { leftBrake: 0, rightBrake: 0 }, pending: { at: number; input: FlightInput } | null = null;
  let deepFrames = 0, peakBank = 0, acquisitions = 0, losses = 0, previousQualified = false, retainedDips = 0;
  const phases = new Set<string>();
  for (let tick = 0; tick < 150 * 60 && training.state.status === 'flying'; tick++) {
    if (pending && tick >= pending.at) { input = pending.input; pending = null; }
    const message = training.step(dt, input), foundation = training.foundationState;
    phases.add(foundation.phase); deepFrames += Number(Math.max(input.leftBrake ?? 0, input.rightBrake ?? 0) > .7);
    peakBank = Math.max(peakBank, Math.abs(training.g.bank));
    if (foundation.qualified && !previousQualified) acquisitions++;
    if (!foundation.qualified && previousQualified) {
      losses++;
      assert.equal(foundation.orbit, 0, 'confirmed loss clears unfinished orbit');
      assert.equal(foundation.gain, 0, 'confirmed loss clears the old height baseline');
      assert.equal(training.state.status, 'flying', 'loss returns to acquisition without restarting');
    }
    if (foundation.qualified && training.activity.exitSeconds > 0) retainedDips++;
    previousQualified = foundation.qualified;
    const targets = message?.brakeTargets, next = { leftBrake: targets?.left ?? 0, rightBrake: targets?.right ?? 0 };
    if (!pending && (next.leftBrake !== input.leftBrake || next.rightBrake !== input.rightBrake))
      pending = { at: tick + Math.round(delay / dt) + 1, input: next };
  }
  return { training, phases, deepFrames, peakBank, acquisitions, losses, retainedDips };
}

for (const side of [-1, 1]) for (const delay of [0, .3, .6])
  test(`steering uses visible controls and real flight at side ${side}, ${delay}s reaction`, () => {
    const learned: TrainingLessonId[] = [];
    const { training, phases, deepFrames, peakBank } = pilot('steering', side, delay, id => learned.push(id));
    assert.equal(training.state.status, 'complete', JSON.stringify(training.state));
    assert.deepEqual([...phases], ['level', 'turn-first', 'release-first', 'turn-second', 'release-second',
      'turn-sharp', 'release-sharp', 'brake', 'recovery', 'complete']);
    assert.ok(training.state.elapsed > 40 && training.state.elapsed < 90, `elapsed ${training.state.elapsed}`);
    assert.equal(training.air.windY, 0); assert.equal(training.air.thermal, 0);
    assert.ok(training.foundationState.speedDrop >= 1);
    assert.ok(deepFrames > 0); assert.ok(peakBank >= FOUNDATION.sharpTurnBank);
    assert.equal(training.watch.state.moves, 0); assert.equal(training.watch.state.breaks, 0);
    assert.equal(training.style.state.total, 0); assert.equal(training.g.stall, 0); assert.equal(training.g.tuck, 0);
    assert.deepEqual(learned, ['steering']);
    const elapsed = training.state.elapsed;
    training.step(300, { leftBrake: 1 });
    assert.equal(training.state.elapsed, elapsed); assert.deepEqual(learned, ['steering']);
    assert.equal(training.controls.leftBrake, 0); assert.equal(training.controls.rightBrake, 0);
  });

for (const side of [-1, 1]) for (const delay of [.3, .6])
  test(`thermal uses a real spatial source and coherent climbing circle at side ${side}, ${delay}s reaction`, () => {
    const learned: TrainingLessonId[] = [];
    const { training, deepFrames, peakBank, acquisitions, losses, retainedDips } = pilot('thermal', side, delay, id => learned.push(id));
    assert.equal(training.state.status, 'complete', JSON.stringify(training.state));
    assert.ok(training.foundationState.orbit >= Math.PI * 2);
    assert.ok(training.foundationState.gain >= 10);
    assert.equal(training.activity.sourceId, 'training-thermal'); assert.equal(training.activity.sourceGeneration, 1);
    assert.equal(training.activity.sourceDir, side);
    assert.ok(peakBank < 27 * Math.PI / 180); assert.equal(deepFrames, 0);
    assert.equal(training.watch.state.moves, 0); assert.equal(training.watch.state.breaks, 0);
    assert.equal(training.style.state.total, 0); assert.equal(training.g.stall, 0); assert.equal(training.g.tuck, 0);
    assert.deepEqual(learned, ['thermal']);
    if (delay === .6) {
      assert.ok(acquisitions >= 3 && losses >= 2, 'delayed pilot can reacquire before completing');
      assert.ok(retainedDips > 0, 'brief dips retain qualified activity through its existing grace');
    }
  });

for (const releasePhase of ['release-first', 'release-sharp'])
test(`steering waits for physical recovery at ${releasePhase} rather than reusing the earlier calm timer`, () => {
  const training = createTrainingSession(); training.begin('steering');
  let previous: FlightInput = {};
  for (let tick = 0; tick < 90 * 60 && training.foundationState.phase !== releasePhase; tick++) {
    const target = training.message?.brakeTargets;
    previous = { leftBrake: target?.left ?? 0, rightBrake: target?.right ?? 0 };
    training.step(dt, previous);
  }
  assert.equal(training.foundationState.phase, releasePhase);
  for (let tick = 0; tick < 60; tick++) training.step(dt, previous);
  assert.equal(training.foundationState.phase, releasePhase, 'held turning hand cannot count as recovery');
  let waited = 0;
  while (training.foundationState.phase === releasePhase && waited < 20) { training.step(dt, {}); waited += dt; }
  assert.ok(waited >= .5); assert.equal(training.foundationState.phase, releasePhase === 'release-first' ? 'turn-second' : 'brake');
  assert.ok(Math.max(training.g.leftBrake, training.g.rightBrake) / PHYSICS.deepBrake <= .05);
});

test('gentle steering cannot substitute for the sharper pull or record completion', () => {
  const learned: TrainingLessonId[] = [], training = createTrainingSession({ onLearned: id => learned.push(id) });
  training.begin('steering');
  for (let tick = 0; tick < 90 * 60 && training.foundationState.phase !== 'turn-sharp'; tick++) {
    const target = training.message?.brakeTargets;
    training.step(dt, { leftBrake: target?.left ?? 0, rightBrake: target?.right ?? 0 });
  }
  assert.equal(training.foundationState.phase, 'turn-sharp');
  for (let tick = 0; tick < 10 * 60; tick++) training.step(dt, { rightBrake: .30 });
  assert.ok(training.foundationState.course >= FOUNDATION.turnCourse, 'gentle steering still changes the actual course');
  assert.equal(training.state.status, 'flying'); assert.equal(training.foundationState.phase, 'turn-sharp');
  assert.deepEqual(learned, []);
});

for (const lesson of ['steering', 'thermal'] as const)
  test(`neutral input never completes ${lesson} or times out after 90 seconds`, () => {
    const learned: TrainingLessonId[] = [], training = createTrainingSession({ onLearned: id => learned.push(id) });
    training.begin(lesson);
    for (let tick = 0; tick < 120 * 60; tick++) training.step(dt, {});
    assert.equal(training.state.status, 'flying'); assert.deepEqual(learned, []);
    assert.equal(training.foundationState.orbit, 0); assert.equal(training.foundationState.gain, 0);
    assert.equal(training.watch.state.moves, 0);
  });

test('a reborn thermal clears partial orbit; retry restores the fixture and leave clears it', () => {
  const training = createTrainingSession(); training.begin('thermal');
  assert.deepEqual(training.g.pos, FOUNDATION.thermalOrigin);
  let input: FlightInput = {};
  for (let tick = 0; tick < 60 * 60 && training.foundationState.orbit < .3; tick++) {
    const target = training.step(dt, input)?.brakeTargets;
    input = { leftBrake: target?.left ?? 0, rightBrake: target?.right ?? 0 };
  }
  assert.ok(training.foundationState.orbit >= .3);
  training.sources[0].generation++;
  training.step(dt, input);
  assert.equal(training.state.status, 'flying'); assert.equal(training.foundationState.qualified, false);
  assert.equal(training.foundationState.orbit, 0); assert.equal(training.foundationState.gain, 0);
  training.retry();
  assert.deepEqual(training.g.pos, FOUNDATION.thermalOrigin); assert.equal(training.state.elapsed, 0);
  assert.equal(training.sources[0].generation, 1); assert.equal(training.foundationState.orbit, 0);
  training.leave(); assert.equal(training.state.status, 'idle'); assert.equal(training.message, null); assert.deepEqual(training.sources, []);
});

test('thermal rendering samples the real source without moving flight or lesson clocks', () => {
  const training = createTrainingSession(); training.begin('thermal', -1);
  const position = { ...training.g.pos }, elapsed = training.state.elapsed;
  assert.equal(training.sampleAir({ x: 0, y: 1100, z: 0 }).windY, 5.5);
  assert.equal(training.sampleAir({ x: 200, y: 1100, z: 0 }).windY, 0);
  assert.equal(training.air.windY, 0, 'the centerline spawn begins outside the real thermal');
  assert.equal(training.sources[0].dir, -1); assert.equal(training.sources[0].flock, false);
  assert.deepEqual(training.g.pos, position); assert.equal(training.state.elapsed, elapsed);
  training.begin('steering');
  assert.equal(training.sampleAir({ x: 0, y: 1100, z: 0 }).windY, 0);
  assert.deepEqual(training.sources, []);
});

for (const lesson of ['steering', 'thermal'] as const)
  test(`${lesson} stops on unsafe height and needs explicit retry`, () => {
    let floor = 1100 - TRAINING_LESSON_INFO[lesson].entry + 1;
    const learned: TrainingLessonId[] = [], training = createTrainingSession({ heightAt: () => floor, onLearned: id => learned.push(id) });
    training.begin(lesson); assert.equal(training.state.status, 'failed');
    floor = 0; training.retry(); assert.equal(training.state.status, 'flying');
    floor = training.g.pos.y - TRAINING_LESSON_INFO[lesson].abort + 1;
    training.step(dt, {}); assert.equal(training.state.status, 'failed');
    const elapsed = training.state.elapsed; training.step(60, {});
    assert.equal(training.state.elapsed, elapsed); assert.deepEqual(learned, []);
  });

for (const lesson of ['steering', 'thermal'] as const)
  test(`${lesson} fails a real full-stall attempt without recording completion`, () => {
    const learned: TrainingLessonId[] = [], training = createTrainingSession({ onLearned: id => learned.push(id) });
    training.begin(lesson);
    for (let tick = 0; tick < 30 * 60 && training.state.status === 'flying'; tick++)
      training.step(dt, { leftBrake: 1, rightBrake: 1 });
    assert.equal(training.state.status, 'failed'); assert.deepEqual(learned, []);
    training.retry(); assert.equal(training.state.status, 'flying'); assert.equal(training.g.stall, 0);
  });

test('foundation completion preserves trick prerequisites, scores, kit and legacy storage', () => {
  const items = new Map<string, string>(), storage = { getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => items.set(key, value), removeItem: (key: string) => items.delete(key) };
  clearStore(storage);
  const original = { ...emptyStore(), best: { total: 100, score: 150, peak: 800 }, runs: 8, tonnage: 500, learnedLessons: ['loop'] };
  writeStore(original, storage);
  const { training } = pilot('steering', 1, .3, id => learnTrainingLesson(id, storage));
  assert.equal(training.state.status, 'complete');
  assert.deepEqual(readStore(storage), { ...original, foundationLessons: ['steering'] });
  assert.equal(learnTrainingLesson('steering', storage), false);
  assert.equal(learnTrainingLesson('thermal', storage), true);
  assert.equal(learnTrainingLesson('wingover', storage), true);
  assert.deepEqual(readStore(storage), { ...original, foundationLessons: ['steering', 'thermal'], learnedLessons: ['wingover', 'loop'] });
  assert.deepEqual(normalizeStore({ ...original, foundationLessons: ['thermal', 'loop', 'thermal', false] }).foundationLessons, ['thermal']);
  assert.deepEqual(normalizeStore({ ...original, foundationLessons: undefined }), original);
  clearStore(storage);
});

test('the lesson catalog keeps real trick reserve configuration and explicit lesson order', () => {
  assert.deepEqual(TRAINING_LESSONS, ['steering', 'thermal', 'pitch', 'spiral', 'wingover', 'stall', 'wing-spiral', 'spiral-exit', 'loop', 'heli', 'sat',
    'collapse', 'frontal', 'deep-stall', 'spin', 'cravat', 'twist']);
  for (const id of ['pitch', 'spiral', 'wingover', 'stall', 'wing-spiral', 'spiral-exit', 'loop', 'heli', 'sat'] as const) {
    assert.equal(TRAINING_LESSON_INFO[id].entry, TRICK_LESSONS[id].entry);
    assert.equal(TRAINING_LESSON_INFO[id].abort, TRICK_LESSONS[id].abort);
  }
});
