import type { CoachFields } from '../../../domains/coaching/models.ts';
import type { FlightInput } from '../../../domains/flight/models.ts';
import { BRAKE_CONTROLS, brakeByte } from '../../../domains/flight/brake-controls.ts';

export interface TrainingInputFeedback {
  status: 'idle' | 'pull' | 'hold' | 'ease';
  label: string;
  /** Brake position only; lesson progress remains the lesson observer's own measurement. */
  position: number;
  bing: boolean;
}
interface FeedbackFrame {
  lesson: string; status: string; message: CoachFields | null; input: FlightInput; clock: number;
}
const ENTER_SECONDS = .08, REARM_SECONDS = .12, REARM_MARGIN = .02, BING_GAP = .8;

/** A read-only, fixed-step cue for reaching a Steering lesson's requested hand position. */
export function createTrainingInputFeedback() {
  const state: TrainingInputFeedback = { status: 'idle', label: '', position: 0, bing: false };
  let identity = '', previousClock = -Infinity, matchedFor = 0, outsideFor = 0, latched = false, lastBing = -Infinity;
  function reset() {
    identity = ''; previousClock = lastBing = -Infinity; matchedFor = outsideFor = 0; latched = false;
    Object.assign(state, { status: 'idle', label: '', position: 0, bing: false });
  }
  function step({ lesson, status, message, input, clock }: FeedbackFrame) {
    state.bing = false;
    const target = message?.brakeTargets;
    if (lesson !== 'steering' || status !== 'flying' || message?.lessonId !== 'steering' ||
        message.state !== 'lesson' || message.warning || message.urgent || !target || !Number.isFinite(clock) ||
        ![target.left, target.right, target.tolerance].every(Number.isFinite) ||
        target.left < 0 || target.right < 0 || target.left > 1 || target.right > 1 || target.tolerance <= 0 ||
        Math.max(target.left, target.right) === 0) { reset(); return state; }
    if (clock < previousClock) reset();
    const dt = Number.isFinite(previousClock) ? Math.max(0, clock - previousClock) : 0;
    previousClock = clock;
    const key = JSON.stringify([lesson, message.phase, message.intentId, target.left, target.right, target.tolerance]);
    if (key !== identity) { identity = key; matchedFor = outsideFor = 0; latched = false; }
    const left = brakeByte(input.leftBrake) / 255, right = brakeByte(input.rightBrake) / 255;
    const leftError = Math.abs(left - target.left), rightError = Math.abs(right - target.right);
    // A requested release uses the same strict threshold as canonical coach acceptance.
    const leftTolerance = target.left === 0 ? BRAKE_CONTROLS.released : target.tolerance;
    const rightTolerance = target.right === 0 ? BRAKE_CONTROLS.released : target.tolerance;
    const additionalControl = !!input.bar || !!input.ears;
    const matching = !additionalControl && leftError <= leftTolerance && rightError <= rightTolerance;
    const over = left > target.left + leftTolerance || right > target.right + rightTolerance;
    matchedFor = matching ? matchedFor + dt : 0;
    if (latched) {
      outsideFor = additionalControl || leftError > leftTolerance + REARM_MARGIN || rightError > rightTolerance + REARM_MARGIN ? outsideFor + dt : 0;
      if (outsideFor + 1e-9 >= REARM_SECONDS) { latched = false; outsideFor = 0; }
    }
    if (!latched && matchedFor + 1e-9 >= ENTER_SECONDS) {
      latched = true;
      if (clock - lastBing + 1e-9 >= BING_GAP) { state.bing = true; lastBing = clock; }
    }
    const positions = [target.left ? left / target.left : 1, target.right ? right / target.right : 1];
    state.position = Math.max(0, Math.min(1, ...positions));
    state.status = over ? 'ease' : matching && matchedFor + 1e-9 >= ENTER_SECONDS ? 'hold' : 'pull';
    state.label = state.status === 'ease' ? 'EASE OFF · pull is too deep'
      : state.status === 'hold' ? 'HOLD HERE · correct brake position'
        : `BRAKE POSITION · ${Math.round(state.position * 100)}% of target`;
    return state;
  }
  return { state, step, reset };
}
