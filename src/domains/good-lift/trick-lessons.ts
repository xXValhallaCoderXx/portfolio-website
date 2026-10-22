import type { AirSample, ControlSummary, FlightInput } from '../flight/models.ts';
import type { CoachFrame, CoachFlight } from '../coaching/flight-coach.ts';
import type { CoachFields, CoachMessage } from '../coaching/models.ts';
import { createFlightCoach } from '../coaching/flight-coach.ts';
import { actionMessage } from '../coaching/coach-actions.ts';
import { normalizeLearnedLessons } from '../progression/trick-learning.ts';
import { WING } from '../flight/wing-envelope.ts';
import { createControlSummary, summarizeControls } from '../flight/brake-controls.ts';
import { createDirectAcroGuide } from '../coaching/direct-acro-guide.ts';
export type LessonId = 'pitch' | 'spiral' | 'wingover' | 'loop';
export interface LessonState {active: LessonId | null; phase: string; learned: string[]; retryAt: number; startedAt: number; stable: number; side: number; completedAt: number; awarded: number; cancelled: string}
export interface LessonFrame extends CoachFrame {g: CoachFlight & {pos: {x: number; y: number; z: number}; vy: number; tuck: number}; air?: AirSample; warning?: unknown; hazardActive?: boolean; dt?: number}

export const TRICK_LESSONS = Object.freeze({
  pitch: Object.freeze({ height: 500, entry: 200, abort: 120, kind: 1, label: 'PITCH & CATCH' }),
  spiral: Object.freeze({ height: 0, entry: 300, abort: 200, kind: 4, label: 'SPIRAL 360' }),
  wingover: Object.freeze({ height: 750, entry: 250, abort: 180, kind: 2, label: 'WINGOVER' }),
  loop: Object.freeze({ height: 1000, entry: 400, abort: 250, kind: 3, label: 'LOOP' }),
  stable: 1, retry: 45, setupIdle: 8, timeout: 45, celebrate: 3, settle: 3,
});
const sideName = (side: number): 'left' | 'right' => side < 0 ? 'left' : 'right';
const turnOf = (input: FlightInput) => Number(!!input.right) - Number(!!input.left);

/** An observer with its own coach. All outputs are requests; no input or flight state is written. */
export function createTrickLessons({ learned = () => [], onLearned = () => {}, manual = false }: {learned?: () => unknown; onLearned?: (id: LessonId) => void; manual?: boolean} = {}) {
  const coach = createFlightCoach();
  const directGuide = createDirectAcroGuide();
  const observeControls = createControlSummary();
  const state: LessonState = { active: null, phase: '', learned: [], retryAt: 0, startedAt: 0,
    stable: 0, side: 1, completedAt: -Infinity, awarded: 0, cancelled: '' };
  let clock = 0, phaseAt = 0, acceptedFor = 0, idle = 0, levelFor = 0;
  let movesAt = 0, breaksAt = 0, landedAt = 0, lostAt = 0, moveAt = -Infinity;
  let message: CoachMessage | null = null;
  let requested = false;
  let recoveredFor = 0;

  function reset() {
    observeControls.reset();
    coach.reset(); directGuide.reset(); clock = phaseAt = acceptedFor = idle = levelFor = 0;
    movesAt = breaksAt = landedAt = lostAt = 0; moveAt = -Infinity; message = null;
    Object.assign(state, { active: null, phase: '', learned: normalizeLearnedLessons(learned()), retryAt: 0,
      startedAt: 0, stable: 0, side: 1, completedAt: -Infinity, awarded: 0, cancelled: '' });
    requested = false; recoveredFor = 0;
  }
  function cancel(reason = 'back-to-lift') {
    if (!state.active) return false;
    state.active = null; state.phase = ''; state.stable = 0; state.retryAt = clock + TRICK_LESSONS.retry;
    state.cancelled = reason; message = null; coach.reset(); directGuide.reset();
    return true;
  }
  function repeat() { reset(); }
  /** Training selects a lesson explicitly, including one already learned; no prerequisites are forged. */
  function request(id: LessonId, side = 1) {
    reset(); state.active = id; state.side = Math.sign(side) || 1;
    directGuide.reset(state.side); phase('level'); requested = true;
  }
  function phase(next: string) { state.phase = next; phaseAt = clock; acceptedFor = idle = levelFor = 0; }

  function manualStep(dt: number, frame: LessonFrame) {
    const { g, watch, style, input = {} } = frame, id = state.active;
    if (!id) return message;
    if (requested) {
      state.startedAt = clock; movesAt = watch.moves ?? 0; breaksAt = watch.breaks ?? 0;
      landedAt = style?.landed ?? 0; lostAt = style?.lost ?? 0; requested = false;
    }
    const reserve = Math.min(frame.clearance ?? Infinity, frame.fogClearance ?? Infinity);
    const physicalFailure = g.stall > 0 || g.tuck > 0 || frame.collapse! > 0 ||
      g.wingPhase && g.wingPhase !== WING.flying || watch.breaks! > breaksAt || (style?.lost ?? 0) > lostAt;
    if (frame.eligible === false || physicalFailure || frame.hazard || frame.warning ||
        reserve < TRICK_LESSONS[id].abort) {
      cancel(reserve < TRICK_LESSONS[id].abort ? 'clearance' : physicalFailure ? 'physical' : 'unavailable');
      return message = null;
    }
    if (watch.moves! > movesAt && watch.moveKind === TRICK_LESSONS[id].kind && watch.moveAt > state.startedAt) {
      moveAt = watch.moveAt; movesAt = watch.moves!; recoveredFor = 0; directGuide.recover();
    }
    const released = Math.max(input.leftBrake ?? 0, input.rightBrake ?? 0) <= .04 && !input.bar && !input.ears;
    recoveredFor = moveAt > state.startedAt && watch.calm! > 0 && released ? recoveredFor + dt : 0;
    if (moveAt > state.startedAt && (style?.landed ?? 0) > landedAt && style!.bankedAt! >= moveAt &&
        style!.said! > 0 && recoveredFor + 1e-9 >= TRICK_LESSONS.settle) {
      state.learned = normalizeLearnedLessons([...state.learned, id]); state.awarded = style!.said!;
      state.completedAt = clock; state.active = null; state.phase = 'banked'; onLearned(id);
      return message = actionMessage({ state: 'banked', context: TRICK_LESSONS[id].label, owner: 'lesson',
        lessonId: id, phase: 'complete', action: 'none', title: 'LESSON COMPLETE',
        detail: 'Three steady seconds banked the move. Retry this lesson or choose another.', progress: 1,
        progressLabel: 'STEADY FLIGHT · 3s' }, input);
    }
    const fields = directGuide.step(id, frame);
    state.phase = fields.phase ?? state.phase;
    if (!(moveAt > state.startedAt) && state.phase === 'recovery' && watch.calm! >= TRICK_LESSONS.settle) {
      cancel('incomplete');
      return message = null;
    }
    if (moveAt > state.startedAt) {
      fields.progress = Math.min(1, recoveredFor / TRICK_LESSONS.settle);
      fields.progressLabel = 'STEADY FLIGHT · 3s';
    }
    // The selected phase owns teaching. Generic reactive acro/recovery copy must not replace it.
    return message = actionMessage({ ...fields, lessonId: id, canCancelLesson: false }, input);
  }
  function setup(frame: LessonFrame & {dt: number}) {
    const { g, input: rawInput = {}, watch } = frame, id = state.active;
    const input = (rawInput.controlMode === 'brakes' ? summarizeControls(rawInput) : rawInput) as FlightInput & Partial<ControlSummary>;
    const side = sideName(state.side), other = sideName(-state.side);
    let fields: CoachFields | undefined;
    if (state.phase === 'level') {
      const level = !turnOf(input) && !input.brake && !input.deepBrake && !input.bar && !input.ears &&
        (rawInput.controlMode !== 'brakes' || input.bothReleased) &&
        Math.abs(g.bank) < 0.175 && watch.calm! >= 1;
      levelFor = level ? levelFor + frame.dt : 0;
      if (levelFor >= 0.1) phase('deep');
      fields = { action: 'release-all', title: 'LEVEL THE WING', stableTitle: true,
        detail: 'Release direction and brake. Tricks spend height and earn style, increasing your final score. First let the wing settle.' };
    } else if (state.phase === 'deep') {
      fields = { action: 'deep-brake', brakeDepth: 'deep',
        hold: id === 'wingover' ? [side, 'brake'] : ['brake'],
        release: id === 'wingover' ? [other, 'bar', 'ears'] : ['left', 'right', 'bar', 'ears'],
        detail: id === 'pitch' ? 'Drag straight down into the deep range. Build a deliberate backswing; release when it turns forward.' :
          `Hold ${side} and briefly pull deep brake to energize the swing. Then release brake and keep the turn.` };
      if (acceptedFor >= (id === 'pitch' ? 3 : 0.2)) phase(id === 'pitch' ? 'swing' : 'first-turn');
    } else if (state.phase === 'swing') {
      fields = { action: 'release-brake', release: ['brake', 'left', 'right', 'bar', 'ears'],
        detail: 'Keep brake released while the wing swings forward and back. The next deep pull shapes the backswing.' };
      if (clock - phaseAt >= 3) phase('deep');
    } else if (state.phase === 'first-turn') {
      fields = { action: side, hold: [side], release: [other, 'brake', 'bar', 'ears'],
        detail: `Keep holding ${side}. Let the first swing build; the next cue reverses it.` };
      if (clock - phaseAt >= 4.3) phase('first-reverse');
    } else if (state.phase === 'first-reverse') {
      fields = { action: other, hold: [other], release: [side, 'brake', 'bar', 'ears'],
        detail: 'Reverse now. Hold through the top, then follow the observed return swing.' };
    }
    return fields ? actionMessage({ state: 'lesson', context: TRICK_LESSONS[id!].label,
      phase: state.phase, ...fields }, rawInput) : null;
  }
  function step(dt: number, frame: LessonFrame) {
    if (!(dt > 0) || !frame?.g || !frame.watch) return message;
    const now = frame.watch.clock;
    if (now < clock) reset();
    if (now === clock) return message;
    clock = now;
    if (manual) return manualStep(dt, frame);
    if (frame.eligible === false) { cancel('unavailable'); return message = null; }
    const { g, watch, style, input: rawInput = {}, air = {} } = frame;
    const summarized = observeControls.step(rawInput);
    const input = (rawInput.controlMode === 'brakes' ? summarized : rawInput) as FlightInput & Partial<ControlSummary>;
    const reserve = Math.min(frame.clearance ?? Infinity, frame.fogClearance ?? Infinity);
    const interrupted = !!(frame.hazard || frame.warning || frame.collapse! > 0 || g.stall > 0 ||
      g.tuck > 0 || g.loop && !(state.active === 'loop' && rawInput.controlMode === 'brakes') || input.ears || frame.hazardActive || g.wingPhase && g.wingPhase !== WING.flying);
    const stable = !interrupted && !input.deepBrake && !g.acro && Math.abs(g.pitch) < 0.3 &&
      Math.abs(g.pitchRate) < 0.4 && Math.abs(g.bank) < 0.75 &&
      (air.windY ?? air.lift ?? 0) >= 1.85 && g.vy > 0.2;
    state.stable = stable ? state.stable + dt : 0;
    if (state.active && (interrupted || reserve < TRICK_LESSONS[state.active].abort ||
        watch.breaks! > breaksAt || (style?.lost ?? 0) > lostAt || clock - state.startedAt >= TRICK_LESSONS.timeout))
      cancel(interrupted ? 'hazard' : reserve < TRICK_LESSONS[state.active].abort ? 'clearance' : 'attempt-ended');

    if (!state.active && clock >= state.retryAt && clock - state.completedAt >= TRICK_LESSONS.celebrate && state.stable >= TRICK_LESSONS.stable) {
      const id = !state.learned.includes('pitch') ? 'pitch' : !state.learned.includes('wingover') ? 'wingover' :
        rawInput.controlMode === 'brakes' && !state.learned.includes('loop') ? 'loop' : null;
      if (id && g.pos.y >= TRICK_LESSONS[id].height && reserve >= TRICK_LESSONS[id].entry &&
          !(style?.elements! > 0)) {
        state.active = id; state.startedAt = clock; state.cancelled = '';
        state.side = turnOf(input) || Math.sign(g.bank) || 1;
        movesAt = watch.moves!; breaksAt = watch.breaks!; landedAt = style?.landed ?? 0; lostAt = style?.lost ?? 0;
        moveAt = -Infinity; coach.reset(); directGuide.reset(state.side); phase('level');
      }
    }
    const id = state.active;
    if (id && watch.moves! > movesAt && watch.moveKind === TRICK_LESSONS[id].kind && watch.moveAt > state.startedAt) {
      moveAt = watch.moveAt; phase('recover'); movesAt = watch.moves!;
      if (rawInput.controlMode === 'brakes') directGuide.recover();
    }
    if (id && moveAt > state.startedAt && (style?.landed ?? 0) > landedAt && style!.bankedAt! >= moveAt && style!.said! > 0 && watch.calm! + 1e-9 >= TRICK_LESSONS.settle) {
      state.learned = normalizeLearnedLessons([...state.learned, id]);
      state.awarded = style!.said!;
      state.completedAt = clock; state.active = null; state.phase = 'banked'; state.stable = 0;
      onLearned(id); coach.reset();
    }
    const direct = rawInput.controlMode === 'brakes';
    const request = state.active && (direct || state.phase !== 'maneuver' && state.phase !== 'recover') ?
      direct ? actionMessage(directGuide.step(state.active, frame), rawInput) : setup({ ...frame, dt }) : null;
    if (request) {
      if (direct) state.phase = request.phase ?? state.phase;
      acceptedFor = request.accepted ? acceptedFor + dt : 0;
      idle = request.accepted ? 0 : idle + dt;
      if (idle >= TRICK_LESSONS.setupIdle) cancel('setup-idle');
    }
    const policy = direct ? state.active === 'loop' ? 'loop' : state.active ? 'off' : state.learned.includes('pitch') ? 'acro' : 'off' : state.active ?? 'off';
    const physical = coach.step(dt, { ...frame, maneuverPolicy: policy, lift: null,
      forceRecovery: !state.active && !!state.cancelled && watch.calm! < 1 &&
        (g.acro || Math.abs(g.pitch) > 0.3 || Math.abs(g.bank) > 0.75) });
    if (!direct && state.active && physical?.context === state.active && ['building', 'timing'].includes(physical.state!)) phase('maneuver');
    const safety = physical && ['recover', 'hazard', 'descent'].includes(physical.state!);
    if (direct && state.active) message = request;
    else if (safety) message = physical;
    else if (state.active) message = physical ?? request ?? actionMessage({ state: 'lesson', context: TRICK_LESSONS[state.active].label,
      phase: 'recover', action: 'release-all', title: 'RECOVER LEVEL TO BANK STYLE',
      detail: 'Let the wing settle for three steady seconds.', progress: Math.min(1, watch.calm! / TRICK_LESSONS.settle), progressLabel: 'STEADY FLIGHT · 3s' }, rawInput);
    else message = physical ?? (frame.lift as CoachMessage | null) ?? null;
    if (state.active && message) message = { ...message, lessonId: state.active, canCancelLesson: true };
    return message;
  }
  reset();
  return { reset, step, cancel, repeat, request, get state() { return state; }, get message() { return message; } };
}
