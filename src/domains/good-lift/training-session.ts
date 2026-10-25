import type { AirSample, FlightInput, FlightState, HeightSampler, Vector3 } from '../flight/models.ts';
import { createFlight, settleFlight, stepFlight } from '../flight/flight.ts';
import { brakeByte, summarizeControls } from '../flight/brake-controls.ts';
import { createSwingWatch } from '../coaching/swing-watch.ts';
import { createCoachIntent } from '../coaching/coach-intent.ts';
import type { CoachMessage } from '../coaching/models.ts';
import { surfaceAt } from '../flight/ground.ts';
import { createStyle } from './meet-style.ts';
import { createTrickLessons } from './trick-lessons.ts';
import { createTrickWatch } from './trick-watch.ts';
import { TRAINING_LESSONS, TRAINING_LESSON_INFO, isRecoveryLesson, isTrickLesson, type TrainingLessonId } from '../coaching/training-catalog.ts';
import { createRecoveryLessons, type RecoveryFailure } from './recovery-lessons.ts';
import { createFoundationTraining, FOUNDATION } from './foundation-training.ts';
import { WING } from '../flight/wing-envelope.ts';

export type { LessonId } from './trick-lessons.ts';
export { TRAINING_LESSONS, TRAINING_LESSON_INFO, TRICK_TRAINING_LESSONS, RECOVERY_TRAINING_LESSONS, isTrickLesson, isRecoveryLesson } from '../coaching/training-catalog.ts';
export type { TrainingLessonId, FoundationLessonId } from '../coaching/training-catalog.ts';
export const TRAINING = Object.freeze({ origin: Object.freeze({ x: 0, y: 1100, z: 0 }), windY: 5.5 });
// What a recovery lesson's card says when it fails, by why (recovery-lessons.js).
const RECOVERY_FAILED: Readonly<Record<Exclude<RecoveryFailure, ''>, string>> = Object.freeze({
  escalated: 'It went into something worse. Retry, and follow each step as it comes.',
  slow: 'Not out of it in time. Retry, and follow the steps sooner.',
  height: 'Too much height went. Retry, and follow the steps sooner.',
  clearance: 'Height ran low. Retry to start high again.',
  'hands-off': 'The wing came out by itself. Retry, and fly the fix with your hands.',
});
export interface TrainingState {
  status: 'idle' | 'flying' | 'complete' | 'failed'; lesson: TrainingLessonId; side: number;
  elapsed: number; failure: string; progress: number;
}
interface TrainingOptions {
  g?: FlightState; controls?: FlightInput; air?: AirSample; heightAt?: HeightSampler;
  onLearned?: (id: TrainingLessonId) => void;
  // The wing each lesson is flown on (the classic wing unless told), and whether it can fly a lesson.
  wing?: () => string; open?: (id: TrainingLessonId) => boolean;
}

/**
 * A separate, unranked physical world. No meet, run recorder, rewards, board or environment clock.
 * The trick watch looks on beside the swing watch, for the lessons whose moves only it
 * knows (a full stall, and the links into and out of a spiral); it never touches the flight. The
 * recovery lessons (recovery-lessons.js) start a failure on the wing and are flown in still air, so
 * the metres a save costs are its own.
 */
export function createTrainingSession({ g = createFlight({ ...TRAINING.origin }), controls = {}, air = {},
  heightAt = surfaceAt, onLearned = () => {}, wing = () => 'classic', open = () => true }: TrainingOptions = {}) {
  const watch = createSwingWatch(), tricks = createTrickWatch(), style = createStyle(), intent = createCoachIntent();
  const foundation = createFoundationTraining(heightAt);
  const state: TrainingState = { status: 'idle', lesson: 'steering', side: 1, elapsed: 0, failure: '', progress: 0 };
  let message: CoachMessage | null = null;
  // A glider's lessons are judged as its runs are, by the trick watch.
  const lessons = createTrickLessons({ manual: true, byTricks: () => wing() !== 'classic', onLearned: id => {
    state.status = 'complete'; state.progress = 1; onLearned(id);
  } });
  const recovery = createRecoveryLessons({ onLearned: id => { state.status = 'complete'; state.progress = 1; release(); onLearned(id); } });
  function release() {
    Object.assign(controls, { controlMode: 'brakes', leftBrake: 0, rightBrake: 0, left: false, right: false,
      turn: 0, brake: false, deepBrake: false, bar: false, ears: false, steered: false, locked: false, climb: null });
  }
  function sampleAir(pos: Vector3, out: AirSample = {}) {
    if (!isTrickLesson(state.lesson) && !isRecoveryLesson(state.lesson)) return foundation.sampleAir(pos, out);
    const lift = isRecoveryLesson(state.lesson) ? 0 : TRAINING.windY;
    Object.assign(out, { windX: 0, windZ: 0, windY: lift, lift, sink: 0,
      liftSide: 0, rough: 0, hazardSink: 0, ridge: 0, lee: 0, thermal: 0, ambientX: 0, ambientZ: 0,
      crestHeight: 0, calm: false, clearance: pos.y - heightAt(pos.x, pos.z) });
    return out;
  }
  function atmosphere() {
    sampleAir(g.pos, air); g.lift = air.lift ?? 0; g.liftSide = air.liftSide ?? 0;
  }
  function begin(lesson: TrainingLessonId = 'steering', side = 1) {
    Object.assign(g.pos, lesson === 'thermal' ? FOUNDATION.thermalOrigin : TRAINING.origin); g.yaw = 0; settleFlight(g, undefined, wing());
    release(); watch.reset(); tricks.reset(); style.reset(); intent.reset(); lessons.reset(); foundation.reset(); recovery.reset();
    Object.assign(state, { status: 'flying', lesson, side: Math.sign(side) || 1, elapsed: 0, failure: '', progress: 0 });
    if (isTrickLesson(lesson)) lessons.request(lesson, state.side);
    else if (isRecoveryLesson(lesson)) recovery.request(lesson, state.side);
    else foundation.begin(lesson, state.side, g);
    atmosphere();
    message = intent.resolve({ state: 'lesson', owner: 'lesson', lessonId: lesson, context: TRAINING_LESSON_INFO[lesson].label,
      phase: 'level', action: 'release-all', title: 'LEVEL THE WING', detail: 'Release both hands and let the wing settle.',
      hold: [], release: ['left', 'right', 'brake', 'bar', 'ears'], brakeTargets: { left: 0, right: 0, tolerance: .07 } }, controls, 0);
    if (air.clearance! < TRAINING_LESSON_INFO[lesson].entry) fail('clearance');
    return state;
  }
  function fail(reason: string) {
    state.status = 'failed'; state.failure = reason;
    message = intent.resolve({ state: 'lesson', owner: 'lesson', lessonId: state.lesson,
      context: TRAINING_LESSON_INFO[state.lesson].label, phase: 'failed', action: 'none', title: 'TRY THAT AGAIN',
      detail: reason === 'clearance' ? 'Height ran low. Retry to start high again.'
        : reason === 'incomplete' ? 'That attempt settled before the full move completed. Retry from a settled wing.'
          : RECOVERY_FAILED[reason as Exclude<RecoveryFailure, ''>] ?? 'The move broke off. Retry to start with a settled wing.' }, controls, state.elapsed);
    release();
    return message;
  }
  function step(dt: number, input: FlightInput = {}) {
    if (state.status !== 'flying' || !(dt > 0)) return message;
    const canonical: FlightInput = { controlMode: 'brakes', leftBrake: brakeByte(input.leftBrake ?? 0) / 255,
      rightBrake: brakeByte(input.rightBrake ?? 0) / 255, bar: !!input.bar, ears: !!input.ears };
    Object.assign(controls, summarizeControls(canonical), { steered: false, locked: false, climb: null });
    atmosphere();
    stepFlight(g, controls, air, dt);
    watch.step(dt, g, false, controls);
    tricks.step(g, controls, false, watch.state);
    style.step(dt, { watch, controls });
    state.elapsed = watch.state.clock;
    if (isRecoveryLesson(state.lesson)) {
      // No trick is flown on purpose in a recovery lesson: the guide judges every half it sees go by itself.
      const raw = recovery.step(g, controls, g.pos.y - heightAt(g.pos.x, g.pos.z), null);
      if (recovery.state.failure) return fail(recovery.state.failure);
      if (state.status !== 'flying') return message;
      if (raw) message = intent.resolve(raw, controls, state.elapsed);
      state.progress = recovery.state.phase === 'saved' ? 0.75 : recovery.state.phase === 'fly' ? 0.5 : 0;
      return message;
    }
    if (!isTrickLesson(state.lesson)) {
      const reserve = g.pos.y - heightAt(g.pos.x, g.pos.z);
      if (reserve < TRAINING_LESSON_INFO[state.lesson].abort) return fail('clearance');
      if (g.stall > 0 || g.tuck > 0 || g.wingPhase !== WING.flying || watch.state.breaks > 0)
        return fail(g.stall > 0 ? 'stall' : g.tuck > 0 ? 'collapse' : 'lost');
      message = intent.resolve(foundation.step(dt, g, controls, air, state.elapsed), controls, state.elapsed);
      state.progress = message?.progress ?? 0;
      if (foundation.state.complete) {
        state.status = 'complete'; state.progress = 1; release(); onLearned(state.lesson);
      }
      return message;
    }
    const raw = lessons.step(dt, { g, watch: watch.state, tricks: tricks.state, style: style.state, input: controls, air,
      clearance: g.pos.y - heightAt(g.pos.x, g.pos.z), fogClearance: Infinity, eligible: true });
    if (lessons.state.cancelled) {
      return fail(lessons.state.cancelled === 'incomplete' ? 'incomplete' : lessons.state.cancelled === 'clearance' ? 'clearance'
        : g.stall > 0 ? 'stall' : g.tuck > 0 ? 'collapse' : 'lost');
    }
    message = intent.resolve(raw, controls, state.elapsed);
    state.progress = message?.progress ?? 0;
    if (lessons.state.phase === 'banked') release();
    return message;
  }
  function retry() { return begin(state.lesson, state.side); }
  // The next lesson the wing can fly, round to the first.
  function next() {
    const from = TRAINING_LESSONS.indexOf(state.lesson);
    for (let step = 1; step <= TRAINING_LESSONS.length; step++) {
      const lesson = TRAINING_LESSONS[(from + step) % TRAINING_LESSONS.length];
      if (open(lesson)) return begin(lesson, state.side);
    }
    return begin(state.lesson, state.side);
  }
  function leave() {
    state.status = 'idle'; state.elapsed = state.progress = 0; state.failure = '';
    release(); lessons.reset(); foundation.reset(); recovery.reset(); intent.reset(); message = null;
  }
  return { begin, step, retry, next, leave, g, controls, air, watch, tricks, style, state, sampleAir,
    get sources() { return state.lesson === 'thermal' ? foundation.sources : []; },
    get activity() { return foundation.activity; }, get foundationState() { return foundation.state; },
    get message() { return message; }, get lessonState() { return lessons.state; },
    /** A recovery lesson as it goes (recovery-lessons.js), and the hands its fix asks for this step, for the handles to light. */
    get recoveryState() { return recovery.state; }, recoveryTarget: () => recovery.target() };
}
