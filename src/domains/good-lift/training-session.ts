import type { AirSample, FlightInput, FlightState, HeightSampler } from '../flight/models.ts';
import { createFlight, settleFlight, stepFlight } from '../flight/flight.ts';
import { brakeByte, summarizeControls } from '../flight/brake-controls.ts';
import { createSwingWatch } from '../coaching/swing-watch.ts';
import { createCoachIntent } from '../coaching/coach-intent.ts';
import type { CoachMessage } from '../coaching/models.ts';
import { surfaceAt } from '../flight/ground.ts';
import { createStyle } from './meet-style.ts';
import { createTrickLessons, TRICK_LESSONS, type LessonId } from './trick-lessons.ts';

export type { LessonId } from './trick-lessons.ts';
export const TRAINING_LESSONS = Object.freeze(['pitch', 'spiral', 'wingover', 'loop'] as const);
export const TRAINING = Object.freeze({ origin: Object.freeze({ x: 0, y: 1100, z: 0 }), windY: 5.5 });
export interface TrainingState {
  status: 'idle' | 'flying' | 'complete' | 'failed'; lesson: LessonId; side: number;
  elapsed: number; failure: string; progress: number;
}
interface TrainingOptions {
  g?: FlightState; controls?: FlightInput; air?: AirSample; heightAt?: HeightSampler;
  onLearned?: (id: LessonId) => void;
}

/** A separate, unranked physical world. No meet, run recorder, rewards, board or environment clock. */
export function createTrainingSession({ g = createFlight({ ...TRAINING.origin }), controls = {}, air = {},
  heightAt = surfaceAt, onLearned = () => {} }: TrainingOptions = {}) {
  const watch = createSwingWatch(), style = createStyle(), intent = createCoachIntent();
  const state: TrainingState = { status: 'idle', lesson: 'pitch', side: 1, elapsed: 0, failure: '', progress: 0 };
  let message: CoachMessage | null = null;
  const lessons = createTrickLessons({ manual: true, onLearned: id => {
    state.status = 'complete'; state.progress = 1; onLearned(id);
  } });
  function release() {
    Object.assign(controls, { controlMode: 'brakes', leftBrake: 0, rightBrake: 0, left: false, right: false,
      turn: 0, brake: false, deepBrake: false, bar: false, ears: false, steered: false, locked: false, climb: null });
  }
  function atmosphere() {
    Object.assign(air, { windX: 0, windZ: 0, windY: TRAINING.windY, lift: TRAINING.windY, sink: 0,
      liftSide: 0, rough: 0, hazardSink: 0, ridge: 0, lee: 0, thermal: 0, ambientX: 0, ambientZ: 0,
      crestHeight: 0, calm: false, clearance: g.pos.y - heightAt(g.pos.x, g.pos.z) });
    g.lift = TRAINING.windY; g.liftSide = 0;
  }
  function begin(lesson: LessonId = 'pitch', side = 1) {
    Object.assign(g.pos, TRAINING.origin); g.yaw = 0; settleFlight(g);
    release(); atmosphere(); watch.reset(); style.reset(); intent.reset();
    Object.assign(state, { status: 'flying', lesson, side: Math.sign(side) || 1, elapsed: 0, failure: '', progress: 0 });
    lessons.request(lesson, state.side);
    message = intent.resolve({ state: 'lesson', owner: 'lesson', lessonId: lesson, context: TRICK_LESSONS[lesson].label,
      phase: 'level', action: 'release-all', title: 'LEVEL THE WING', detail: 'Release both hands and let the wing settle.',
      hold: [], release: ['left', 'right', 'brake', 'bar', 'ears'], brakeTargets: { left: 0, right: 0, tolerance: .07 } }, controls, 0);
    if (air.clearance! < TRICK_LESSONS[lesson].entry) fail('clearance');
    return state;
  }
  function fail(reason: string) {
    state.status = 'failed'; state.failure = reason;
    message = intent.resolve({ state: 'lesson', owner: 'lesson', lessonId: state.lesson,
      context: TRICK_LESSONS[state.lesson].label, phase: 'failed', action: 'none', title: 'TRY THAT AGAIN',
      detail: reason === 'clearance' ? 'Height ran low. Retry to start high again.'
        : reason === 'incomplete' ? 'That attempt settled before the full move completed. Retry from a settled wing.'
          : 'The move broke off. Retry to start with a settled wing.' }, controls, state.elapsed);
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
    style.step(dt, { watch, controls });
    state.elapsed = watch.state.clock;
    const raw = lessons.step(dt, { g, watch: watch.state, style: style.state, input: controls, air,
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
  function next() { return begin(TRAINING_LESSONS[(TRAINING_LESSONS.indexOf(state.lesson) + 1) % TRAINING_LESSONS.length], state.side); }
  function leave() {
    state.status = 'idle'; state.elapsed = state.progress = 0; state.failure = '';
    release(); lessons.reset(); intent.reset(); message = null;
  }
  return { begin, step, retry, next, leave, g, controls, air, watch, style, state,
    get message() { return message; }, get lessonState() { return lessons.state; } };
}
