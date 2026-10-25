import type { CoachFields } from '../coaching/models.ts';
import type { FlightInput, FlightState } from '../flight/models.ts';
import type { Failure } from '../flight/wing-folds.ts';
import { TRAINING_LESSON_INFO, type RecoveryLessonId } from '../coaching/training-catalog.ts';
import { createRecoveryGuide, failureFix, failureName, type TrickSight } from '../coaching/recovery-guide.ts';
import { induceFailure, wingInTrouble } from '../flight/flight.ts';
// Training's recovery lessons, flown as an SIV course flies them: level flight with the hands up, the
// instructor's count, the failure started on the wing (flight.js induceFailure), and the recovery
// guide's way out (recovery-guide.js) as the lesson's cards, with the hands it asks for lit on the
// handles. A lesson is learned once the wing is saved and flown steady for a few seconds, and only if
// the pilot flew the fix: a wing that saves itself (an A refilling its collapse) teaches nothing until
// the hands have done their part.

/**
 * Each lesson: the failure it starts (`kind`, at `size`, wing-folds.js), the seconds the pilot has to
 * be saved in, and the metres it may cost.
 */
export const RECOVERY_LESSONS = Object.freeze({
  collapse: Object.freeze({ kind: 'asym', size: 0.6, timeout: 15, budget: 80 }),
  frontal: Object.freeze({ kind: 'frontal', size: 0.8, timeout: 15, budget: 120 }),
  'deep-stall': Object.freeze({ kind: 'deep', size: undefined, timeout: 15, budget: 100 }),
  spin: Object.freeze({ kind: 'spin', size: 2.5, timeout: 15, budget: 100 }),
  cravat: Object.freeze({ kind: 'cravat', size: undefined, timeout: 20, budget: 160 }),
  twist: Object.freeze({ kind: 'twist', size: undefined, timeout: 15, budget: 80 }),
} as const satisfies Record<RecoveryLessonId, { kind: Failure; size: number | undefined; timeout: number; budget: number }>);

// Steps (sixty a second): the hands up and level before the count, the count from three, a hand that
// pulls past `quiet` beginning it again; the fix flown when the hands meet a step of it within
// `tolerance` for `match` steps (any step asked in the last `lag`, as a pilot follows a reaction late),
// asked of the pilot once a step has been asked for `asked` steps; and the steady flight after the
// save that completes it.
export const RECOVERY_LESSON = Object.freeze({ level: 60, count: 180, quiet: 0.05, tolerance: 0.07, match: 9, lag: 24, asked: 18, steady: 180 });
const HZ = 60;

export type RecoveryLessonPhase = '' | 'level' | 'count' | 'fly' | 'saved';
export type RecoveryFailure = '' | 'escalated' | 'slow' | 'height' | 'clearance' | 'hands-off';

export function createRecoveryLessons({ onLearned = (_id: RecoveryLessonId) => {} } = {}) {
  const guide = createRecoveryGuide();
  // The steps of the fix asked for over the last `lag` steps (left, right and the bar, 1 or 0, each), oldest next.
  const recent = new Float64Array(3 * RECOVERY_LESSON.lag);
  let recentAt = 0;
  const state = { active: null as RecoveryLessonId | null, side: 1, phase: '' as RecoveryLessonPhase, count: 3, steps: 0,
    failure: '' as RecoveryFailure, saved: { seconds: 0, lost: 0 } };
  let startY = 0, asked = 0, run = 0, flown = false;

  function reset() {
    Object.assign(state, { active: null, side: 1, phase: '', count: 3, steps: 0, failure: '' });
    state.saved.seconds = state.saved.lost = 0;
    guide.reset(); startY = asked = run = recentAt = 0; flown = false; recent.fill(-1);
  }

  /** Starts lesson `id` on `side` (−1 left, 1 right): level flight first. */
  function request(id: RecoveryLessonId, side: number) {
    reset();
    state.active = id; state.side = side < 0 ? -1 : 1; state.phase = 'level';
  }

  const card = (fields: Partial<CoachFields>): CoachFields => ({ state: 'lesson', owner: 'lesson', lessonId: state.active!,
    context: TRAINING_LESSON_INFO[state.active!].label, action: 'none', hold: [], release: [], ...fields } as CoachFields);
  const up = (phase: string, title: string, detail: string) => card({ phase, title, detail, action: 'release-all',
    release: ['left', 'right', 'brake', 'bar', 'ears'], brakeTargets: { left: 0, right: 0, tolerance: RECOVERY_LESSON.tolerance } });
  function fail(reason: RecoveryFailure) { state.failure = reason; return null; }

  /**
   * One fixed step of lesson flight, after the wing has flown it: `input` the hands that flew it,
   * `clearance` the metres to the ground and `tricks` what the trick watch saw. The card for the next
   * step, or null once it has failed (`state.failure` says why).
   */
  function step(g: FlightState, input: FlightInput, clearance: number, tricks: Readonly<TrickSight> | null) {
    const id = state.active;
    if (!id || state.failure) return null;
    const lesson = RECOVERY_LESSONS[id], R = RECOVERY_LESSON;
    if (clearance < TRAINING_LESSON_INFO[id].abort) return fail('clearance');
    const left = input.leftBrake ?? 0, right = input.rightBrake ?? 0;
    state.steps += 1;
    if (state.phase === 'level' || state.phase === 'count') {
      // The instructor counts down from three once the wing flies level with the hands up, and begins
      // again whenever a hand pulls.
      const quiet = left <= R.quiet && right <= R.quiet && !input.bar && !wingInTrouble(g);
      if (!quiet) { state.phase = 'level'; state.steps = 0; }
      else if (state.phase === 'level' && state.steps >= R.level) { state.phase = 'count'; state.steps = 0; }
      if (state.phase === 'level') return up('level', 'LEVEL THE WING', 'Hands up, and let the wing fly steady.');
      state.count = 3 - Math.floor(state.steps / HZ);
      if (state.count > 0) return up('count', `${failureName(lesson.kind, state.side)} IN ${state.count}`, 'The instructor counts down. Hands up until then.');
      induceFailure(g, lesson.kind, state.side, lesson.size);
      state.phase = 'fly'; state.steps = 0; startY = g.pos.y;
    }
    const advice = guide.step(g, tricks);
    if (state.phase === 'fly') {
      // A step of the fix asked for, and whether the hands are on one asked lately.
      const asking = advice.left > 0 || advice.right > 0 || advice.bar;
      if (asking) asked += 1;
      const slot = 3 * (recentAt++ % R.lag);
      recent[slot] = asking ? advice.left : -1; recent[slot + 1] = advice.right; recent[slot + 2] = advice.bar ? 1 : 0;
      let on = false;
      for (let i = 0; i < recent.length && !on; i += 3) on = recent[i] >= 0 && Math.abs(left - recent[i]) <= R.tolerance &&
        Math.abs(right - recent[i + 1]) <= R.tolerance && (input.bar ? 1 : 0) === recent[i + 2];
      run = on ? run + 1 : 0;
      if (run >= R.match) flown = true;
      if (advice.escalations > 0 || advice.episode > 1) return fail('escalated');
      if (startY - g.pos.y > lesson.budget) return fail('height');
      if (state.steps > lesson.timeout * HZ) return fail('slow');
      if (advice.saves > 0) {
        if (asked >= R.asked && !flown) return fail('hands-off');
        state.phase = 'saved'; state.steps = 0;
        state.saved.seconds = advice.saved.seconds; state.saved.lost = advice.saved.lost;
      } else {
        const event = advice.event;
        const title = event ? failureName(event, advice.side) : advice.phase === 'catch' ? 'CATCH THE DIVE' : advice.phase === 'level' ? 'ROLL IT LEVEL' : 'FLY IT OUT';
        const detail = event ? failureFix(event, advice.side) : advice.phase === 'catch' ? 'Both brakes as the wing dives ahead.' :
          advice.phase === 'level' ? 'A light pull on the high side.' : 'Hands up, and let the wing fly.';
        return card({ phase: advice.phase || 'up', title, detail, urgency: 'immediate',
          brakeTargets: { left: advice.left, right: advice.right, tolerance: R.tolerance, bar: advice.bar } });
      }
    }
    // Saved: steady flight for a few seconds, and a wing back in trouble is the next failure's lesson, not this one's.
    if (advice.episode > 1) return fail('escalated');
    if (state.steps >= R.steady) { state.phase = ''; state.active = null; onLearned(id); return null; }
    const lost = Math.max(0, Math.round(state.saved.lost));
    return up('saved', `SAVED · ${state.saved.seconds.toFixed(1)} s · −${lost} m`, 'Fly level, hands up, for three seconds.');
  }

  /** The hands the lesson's fix asks for this step, for the handles to light while the wing is in its failure; else null. */
  function target() {
    return state.phase === 'fly' && guide.trouble ? { left: guide.advice.left, right: guide.advice.right } : null;
  }

  return { state, request, step, reset, target, get advice() { return guide.advice; } };
}
