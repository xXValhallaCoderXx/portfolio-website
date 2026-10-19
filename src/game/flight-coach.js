// A presentation observer: instructions never press controls or change flight/scoring state.
import { actionMessage } from './coach-actions.js';
import { WATCH } from './swing-watch.js';
import { pitchPeak, WING } from './flight.js';
import { createControlSummary } from './brake-controls.js';

const DEG = Math.PI / 180;
const names = ['', 'PITCH & CATCH', 'WINGOVER', 'INVERSION'];
export const COACH = Object.freeze({ returnBank: 40 * DEG, prepareBank: 55 * DEG,
  clearance: 80, inversionClearance: 250, neutral: 0.25, steady: 1, pitchIdle: WATCH.within,
  catchLead: 0.03, pitchCatch: 0.65, surge: 0.8 });
const clamp = value => Math.max(0, Math.min(1, value));
const sideName = side => side < 0 ? 'left' : 'right';
const turnOf = input => Number(!!input.right) - Number(!!input.left);
const empty = Object.freeze({});

/** Raw inputs and observed physical phases determine one shared text/highlight instruction. */
export function createFlightCoach() {
  const observeControls = createControlSummary();
  let message = null, clock = 0, initialized = false, lastDirection = 0, lastDirectionAt = -Infinity;
  let reversedAt = -Infinity, brakeWas = false, brakeAt = -Infinity, brakeEdges = 0;
  let neutralFor = 0, wing = false, pitch = false, pitchShaping = false, recovering = false, inverted = false, surge = false;
  let target = 0, requested = 0, answeredTopAt = -Infinity, seenMoves = 0, seenBreaks = 0;
  let motionAfter = -Infinity, rollBelow = true;

  function clearIntent() {
    wing = pitch = pitchShaping = recovering = inverted = surge = false;
    target = requested = 0;
    answeredTopAt = -Infinity;
  }
  function reset() {
    observeControls.reset();
    clearIntent();
    message = null; initialized = false; clock = neutralFor = brakeEdges = seenMoves = seenBreaks = 0;
    lastDirection = 0; brakeWas = false;
    lastDirectionAt = reversedAt = brakeAt = -Infinity;
    motionAfter = -Infinity; rollBelow = true;
  }

  function step(dt, frame) {
    const { g, watch, style, gauge = empty, input: rawInput = empty, maneuverPolicy = 'reactive' } = frame;
    if (frame.eligible === false || !g || !watch) { reset(); return null; }
    const now = Number.isFinite(watch.clock) ? watch.clock : clock + dt;
    if (now < clock) reset();
    const summarized = observeControls.step(rawInput);
    const input = rawInput.controlMode === 'brakes' ? summarized : rawInput;
    clock = now;
    if (!initialized) {
      seenMoves = watch.moves ?? 0; seenBreaks = watch.breaks ?? 0; initialized = true;
      motionAfter = now; rollBelow = Math.abs(g.bank) < WATCH.wing;
    }
    if (Math.abs(g.bank) < WATCH.wing) rollBelow = true;
    const turn = turnOf(input);
    const changed = turn !== 0 && turn !== lastDirection;
    neutralFor = turn === 0 ? neutralFor + dt : 0;
    if (changed && lastDirection !== 0 && now - lastDirectionAt <= WATCH.straight) reversedAt = now;
    if (turn !== 0) { lastDirection = turn; lastDirectionAt = now; }
    if (!!input.brake !== brakeWas) {
      brakeEdges = now - brakeAt <= WATCH.within ? brakeEdges + 1 : 1;
      brakeAt = now; brakeWas = !!input.brake;
    }
    function consumeEvidence() {
      // The watch keeps historical peaks for scoring. A finished/cancelled coaching attempt
      // consumes its own evidence so those same peaks cannot start another set of instructions.
      motionAfter = now; rollBelow = Math.abs(g.bank) < WATCH.wing;
      lastDirection = 0; lastDirectionAt = reversedAt = brakeAt = -Infinity;
      brakeEdges = 0; brakeWas = !!input.brake;
    }
    if ((watch.breaks ?? 0) > seenBreaks) {
      clearIntent(); consumeEvidence();
      recovering = watch.broke >= 1 && watch.broke <= 4;
    }
    seenBreaks = watch.breaks ?? 0;
    if ((watch.moves ?? 0) > seenMoves) { recovering = true; consumeEvidence(); }
    seenMoves = watch.moves ?? 0;

    function feedback() {
      if (style && style.lostAt > style.bankedAt && now - style.lostAt < 2) return 'PENDING STYLE LOST · RECOVER CALMLY';
      if (style && now - style.bankedAt < 2.8) return `${names[watch.moveKind] || 'MOVE'} BANKED · +${style.said} STYLE`;
      if (style?.elements > 0) return `${names[style.last]} · ${watch.quality === 2 ? 'PRECISE' : 'CLEAN'} · +${style.pending} pending`;
      if (now - watch.moveAt < 3) return `${names[watch.moveKind] || 'MOVE'} COMPLETE`;
      if (now - watch.timedAt < 0.65) return watch.quality === 2 ? 'PRECISE TIMING' : 'GOOD TIMING';
      return undefined;
    }
    function emit(fields) {
      message = actionMessage({ ...fields, feedback: feedback() ?? fields.feedback }, rawInput);
      return message;
    }
    function recover(reason = surge ? 'Catch the forward surge, then let the wing settle.' : 'Let the wing settle before adding another turn.') {
      const fields = { state: 'recover', context: inverted ? 'inversion' : surge ? 'surge' : wing ? 'wingover' : pitch ? 'pitch' : 'recovery',
        phase: 'recovery', detail: reason, progress: clamp((watch.calm ?? 0) / COACH.steady), progressLabel: 'STEADY FLIGHT · 1s' };
      if (g.pitch < 0) return emit({ ...fields, action: 'brake', title: input.brake ? 'HOLD BRAKE' : 'PRESS BRAKE',
        brakeDepth: 'working', hold: ['brake'], release: ['left', 'right', 'bar'], detail: `${reason} Check the forward swing with the working brake.` });
      if (input.brake) return emit({ ...fields, action: 'release-brake', release: ['brake', 'left', 'right', 'bar'],
        detail: `${reason} Release the brake as the wing swings back.` });
      return emit({ ...fields, action: 'straight', release: ['left', 'right', 'bar'] });
    }

    // Fully separated flight has phase-specific recovery. A hands-up instruction appropriate
    // before the stall can amplify the pendulum if repeated while the stalled wing is behind.
    const phase = g.wingPhase;
    if (phase === WING.entry || phase === WING.stalled || phase === WING.backfly || phase === WING.exit ||
        phase === WING.frontal || phase === WING.opening) {
      clearIntent(); consumeEvidence(); recovering = true;
      const base = { state: 'recover', context: phase === WING.frontal || phase === WING.opening || g.recoverySource === 'frontal' ? 'frontal collapse' : 'stall', phase };
      if (phase === WING.entry) return emit({ ...base, action: 'deep-brake', brakeDepth: 'deep',
        hold: ['brake'], release: ['left', 'right', 'bar', 'ears'], title: 'HOLD DEEP BRAKE · WAIT UNDER THE WING',
        detail: 'Full stall. The canopy is behind you; keep the stall held until you swing back underneath.' });
      if (phase === WING.stalled) return emit({ ...base, action: 'brake', brakeDepth: 'working',
        hold: ['brake'], release: ['left', 'right', 'bar', 'ears'], title: 'NORMAL BRAKE FOR BACKFLY',
        detail: 'Release the deep pull, then hold normal brake. Let the descending backward flight settle before exiting.' });
      if (phase === WING.backfly) return emit({ ...base, action: 'release-all', title: 'BACKFLY STABLE · RELEASE TO EXIT',
        detail: 'The wing is overhead and moving backward. Release brake to let it fly forward; then catch the surge.' });
      if (phase === WING.frontal || phase === WING.opening) return emit({ ...base, action: 'release-all',
        title: phase === WING.frontal ? 'FRONTAL COLLAPSE · HANDS UP' : 'WING REOPENING · KEEP BRAKE RELEASED',
        detail: 'Release brake and bar. Let the leading edge refill before catching the next forward surge.' });
      return emit({ ...base, action: 'release-all', title: 'LET THE WING REINFLATE AND ACCELERATE',
        detail: 'Keep brake released while airflow returns. Wait for forward flight before catching the surge.' });
    }
    if (phase === WING.surge) { recovering = true; surge = true; }

    // Approaching separation overrides deliberate maneuver input and score celebrations.
    if (g.stall > 0 || g.stallLoad > 0.65) {
      if (g.stall === 0 && maneuverPolicy === 'wingover' && !wing && turn !== 0) {
        return emit({ state: 'timing', context: 'wingover entry', phase: 'release', action: 'release-brake',
          hold: [sideName(turn)], release: ['brake', sideName(-turn), 'bar', 'ears'],
          title: 'RELEASE DEEP BRAKE · KEEP THE TURN',
          detail: 'The swing has enough input. Release brake to keep airflow, and hold the direction until the reverse cue.' });
      }
      if (g.stall === 0 && pitch) {
        pitchShaping = false;
        return emit({ state: 'timing', context: 'pitch', phase: 'release', action: 'release-brake',
          release: ['brake', 'left', 'right', 'bar', 'ears'], title: 'RELEASE DEEP BRAKE · KEEP AIRSPEED',
          detail: 'The backswing is close to separation. Release now, then catch the forward surge with normal brake.' });
      }
      clearIntent(); consumeEvidence(); recovering = true;
      return emit({ state: 'recover', context: 'stall', phase: 'airspeed', action: 'release-all', detail: 'Release the controls so the wing can regain airspeed.' });
    }
    if (frame.collapse > 0 || gauge.coming === 6) {
      clearIntent(); consumeEvidence(); recovering = true;
      const released = gauge.cue === 3;
      return emit({ state: 'recover', context: 'collapse', phase: released ? 'release' : 'reopen',
        action: released ? 'release-brake' : 'brake', title: released ? 'RELEASE BRAKE' : input.brake ? 'HOLD BRAKE BRIEFLY' : 'PRESS BRAKE BRIEFLY',
        brakeDepth: 'working',
        detail: released ? 'Let the reopened wing regain airspeed.' : 'Briefly work the brake to reopen the folded wing.' });
    }
    if ((g.loop ?? 0) !== 0) {
      inverted = recovering = true; wing = pitch = false; consumeEvidence();
      const danger = frame.hazard?.detail ? ` ${frame.hazard.detail}` : '';
      return emit({ state: 'recover', context: 'inversion', phase: 'above', action: 'release-turns',
        title: 'RECOVER FROM INVERSION', detail: `You are above the canopy. Release turns and bar to recover; the full orbit may not complete.${danger}` });
    }
    if (frame.hazard) {
      const hazard = frame.hazard;
      if (wing || pitch) { recovering = true; consumeEvidence(); }
      return emit({ state: 'hazard', context: hazard.kind || 'hazard', phase: 'avoid', action: 'none', ...hazard });
    }
    if (input.ears) {
      clearIntent(); consumeEvidence();
      return emit({ state: 'descent', context: 'ears', phase: 'held', action: 'none', title: 'BIG EARS · HOLD TO DESCEND',
        detail: 'Keep ears held for descent. Release to reopen the wing.', hold: ['ears'], release: [] });
    }
    if (g.ears > WATCH.ears) {
      clearIntent(); consumeEvidence();
      if (maneuverPolicy === 'off') return emit({ state: 'recover', context: 'ears', phase: 'reopening',
        action: 'brake', brakeDepth: 'working', title: 'NORMAL BRAKE TO REOPEN', hold: ['brake'],
        release: ['ears', 'left', 'right', 'bar'],
        detail: 'Keep ears released. Briefly press normal brake to reopen the wing, then follow the lift.' });
      return emit({ state: 'recover', context: 'ears', phase: 'reopening', action: 'none', title: 'WING REOPENING',
        detail: 'Keep ears released while the wing opens.', release: ['ears'] });
    }

    // Callers opt out of spontaneous teaching without disabling any physical safety advice.
    if (maneuverPolicy !== 'reactive') {
      if (maneuverPolicy !== 'wingover') wing = false;
      if (maneuverPolicy !== 'pitch') pitch = pitchShaping = false;
    }
    if (frame.forceRecovery) recovering = true;

    // A steep angle alone is ordinary flight. Acro help begins after deliberate input and motion.
    const recentTop = now - watch.topAt <= WATCH.gap && watch.top >= WATCH.wing;
    const freshRoll = (rollBelow && Math.abs(g.bank) >= WATCH.wing) || (recentTop && watch.topAt > motionAfter);
    if ((maneuverPolicy === 'reactive' || maneuverPolicy === 'wingover') && g.acro && (!wing || recovering) && (!recovering || wing) && !inverted && now - reversedAt <= WATCH.gap && freshRoll) {
      wing = true; pitch = pitchShaping = recovering = false; target = turn || lastDirection;
      requested = 0; answeredTopAt = motionAfter;
    }
    const deep = !!(input.deepBrake || g.deepBrake);
    const freshPitch = watch.building >= 1 && watch.frontAt > motionAfter &&
      watch.front >= WATCH.pumped && now - watch.frontAt <= WATCH.within;
    const lessonBackswing = maneuverPolicy === 'pitch' && g.pitch > WATCH.half && g.pitchRate > 0;
    if ((maneuverPolicy === 'reactive' || maneuverPolicy === 'pitch') && !wing && !pitch && !inverted && !recovering && turn === 0 && deep && (freshPitch || lessonBackswing)) {
      pitch = true;
      // Finish the observed backswing, including a fresh attempt recognized just after its
      // forward peak. Subsequent forward surges are caught and recovered.
      pitchShaping = g.pitchRate > 0;
    }

    if (pitch && !recovering && (((watch.calm ?? 0) >= COACH.steady && now - brakeAt >= COACH.steady) ||
        now - Math.max(watch.frontAt, brakeAt) > COACH.pitchIdle)) {
      recovering = true; consumeEvidence();
    }

    const reserve = Math.min(frame.clearance ?? Infinity, frame.fogClearance ?? Infinity);
    if (recovering && (watch.calm ?? 0) >= COACH.steady) { clearIntent(); consumeEvidence(); }
    const uncoachedSwing = maneuverPolicy === 'off' && (g.acro || Math.abs(g.bank) >= WATCH.wing || Math.abs(g.pitch) >= COACH.pitchCatch);
    if ((wing || pitch || inverted || uncoachedSwing) && reserve < (input.bar && wing ? COACH.inversionClearance : COACH.clearance)) {
      recovering = true; consumeEvidence();
      return recover('Low clearance. Recover before adding more swing.');
    }
    if (recovering) return recover();

    if (wing) {
      if (neutralFor > COACH.neutral || now - reversedAt > WATCH.gap) {
        recovering = true; consumeEvidence(); return recover();
      }
      if (requested && turn === requested) { target = requested; requested = 0; }
      else if (!requested && turn !== 0 && turn !== target) { target = turn; answeredTopAt = watch.topAt; }
      const returning = recentTop && watch.topSide === target && watch.topAt > answeredTopAt &&
        Math.sign(g.bank) === target && g.bank * (g.rollRate ?? 0) < 0;
      if (!requested && returning && Math.abs(g.bank) < COACH.returnBank) {
        requested = -target; answeredTopAt = watch.topAt;
      }
      if (requested) return emit({ state: 'timing', context: 'wingover', phase: 'reverse', action: sideName(requested),
        detail: 'Reverse now as the swing returns. Hold that side while momentum carries you across.' });
      if (returning && Math.abs(g.bank) < COACH.prepareBank) return emit({ state: 'building', context: 'wingover', phase: 'prepare',
        action: `prepare-${sideName(-target)}`, hold: [sideName(target)],
        detail: `Keep holding ${sideName(target)} for now. Reverse when the swing comes closer to centre.` });
      return emit({ state: 'building', context: 'wingover', phase: 'hold', action: sideName(target),
        detail: 'Hold through the top of the swing. Wait for the return before reversing.' });
    }
    if (pitch) {
      // A shaping hold ends at the observed backswing reversal, including a weak one. Requiring
      // a scoring-sized back peak could keep asking for brake through the whole forward swing.
      if (pitchShaping && (g.pitchRate <= 0 || !deep)) pitchShaping = false;
      if (pitchShaping) return emit({ state: 'building', context: 'pitch', phase: 'shape', action: 'deep-brake',
        brakeDepth: 'deep', hold: ['brake'], release: ['bar'], title: 'HOLD DEEP BRAKE',
        detail: 'Keep the deeper pull through the backswing. Release when it turns forward again.' });
      if (input.brake && g.pitch >= 0) return emit({ state: 'timing', context: 'pitch', phase: 'release', action: 'release-brake',
        detail: 'Release the brake as the wing swings back.' });
      const forward = g.pitch < 0 && g.pitchRate < 0 && g.pitch + COACH.catchLead * g.pitchRate < -COACH.pitchCatch;
      if (input.brake || forward) return emit({ state: 'timing', context: 'pitch', phase: 'catch',
        action: 'brake', brakeDepth: 'working', title: input.brake ? 'HOLD BRAKE' : 'PRESS BRAKE',
        detail: 'Check the forward swing with the working brake. Release when the wing swings back.' });
      return emit({ state: 'building', context: 'pitch', phase: 'wait', action: 'release-brake',
        detail: 'Keep the brake released. Wait for a clear forward surge.' });
    }

    // A dangerous forward surge also needs a catch without deliberate stunt intent. Match the
    // existing run safety forecast; the smaller planned pitch runup retains its own phase cues.
    if (g.pitch < 0 && g.pitchRate < 0 && pitchPeak(g) < -COACH.surge) {
      surge = recovering = true; consumeEvidence();
      return recover();
    }
    if (frame.lift) return emit(frame.lift);
    message = null;
    return message;
  }
  return { reset, step, get message() { return message; } };
}
