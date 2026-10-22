import type { CoachFrame } from './flight-coach.ts';
import type { CoachFields } from './models.ts';
import { COACH_INTENT } from './coach-intent.ts';

export type DirectManeuver = 'pitch' | 'spiral' | 'wingover' | 'loop';
const working = 0.60;
const names = { pitch: 'PITCH & CATCH', spiral: 'SPIRAL 360', wingover: 'WINGOVER', loop: 'LOOP' };

/** Visible requests from measured motion. This observer never moves the wing or presses a key. */
export function createDirectAcroGuide() {
  let phase = 'level', side = 1, topAt = -Infinity, frontAt = -Infinity, inverted = false;
  let preparing = false, recoveryPull = false, lastClock = -Infinity;
  let reversal: { side: number; depth: number; at: number; acceptedFor: number } | null = null;
  function reset(direction = 1) {
    phase = 'level'; side = Math.sign(direction) || 1;
    topAt = frontAt = -Infinity; inverted = false;
    preparing = recoveryPull = false; lastClock = -Infinity; reversal = null;
  }
  function recover() { phase = 'recover'; reversal = null; preparing = false; }
  function step(kind: DirectManeuver, frame: CoachFrame): CoachFields {
    const { g, watch, input = {} } = frame;
    const common = Math.min(input.leftBrake ?? 0, input.rightBrake ?? 0);
    const released = Math.max(input.leftBrake ?? 0, input.rightBrake ?? 0) <= 0.04;
    const now = watch.clock, dt = Number.isFinite(lastClock) ? Math.max(0, now - lastClock) : 0;
    lastClock = now;
    if (reversal) {
      const matches = (actual: number, target: number) => target === 0 ? actual <= 0.04 : Math.abs(actual - target) <= 0.07;
      const accepted = !input.bar && !input.ears &&
        matches(input.leftBrake ?? 0, reversal.side < 0 ? reversal.depth : 0) &&
        matches(input.rightBrake ?? 0, reversal.side > 0 ? reversal.depth : 0);
      reversal.acceptedFor = accepted ? reversal.acceptedFor + dt : 0;
    }
    const base = { state: 'lesson', context: names[kind], owner: 'lesson' as const };
    const request = (left: number, right: number, title: string, detail: string, shownPhase = phase): CoachFields => {
      if (reversal) {
        const same = left === (reversal.side < 0 ? reversal.depth : 0) && right === (reversal.side > 0 ? reversal.depth : 0);
        if (same && (now - reversal.at < COACH_INTENT.reverse || reversal.acceptedFor + 1e-9 < COACH_INTENT.acknowledge)) {
          title = `REVERSE ${reversal.side < 0 ? 'LEFT' : 'RIGHT'} NOW`;
          detail = 'Pull the other hand as the swing returns. Momentum carries you across.';
          shownPhase = 'reverse';
        } else reversal = null;
      }
      return {
      ...base, phase: shownPhase, title, detail, stableTitle: true,
      urgency: ['reverse', 'catch', 'recovery'].includes(shownPhase) ? 'immediate' : 'routine',
      action: left && right ? 'brake' : left ? 'left' : right ? 'right' : 'release-all',
      hold: left && right ? ['brake'] : left ? ['left'] : right ? ['right'] : [],
      release: left && right ? ['left', 'right', 'bar', 'ears'] : left ? ['right', 'bar', 'ears'] : right ? ['left', 'bar', 'ears'] : ['left', 'right', 'brake', 'bar', 'ears'],
      brakeDepth: Math.max(left, right) > 0.7 ? 'deep' : 'working',
      brakeTargets: { left, right, tolerance: 0.07 },
      };
    };
    if (phase === 'level') {
      if (released && Math.abs(g.bank) < 0.175 && (watch.calm ?? 0) >= 1) {
        phase = kind === 'pitch' ? 'shape' : 'first-turn';
        topAt = watch.topAt; frontAt = watch.frontAt;
      } else return request(0, 0, 'LEVEL THE WING', 'Release both hands. First let the wing settle before building the move.');
    }
    if (kind === 'pitch') {
      if (phase === 'shape') {
        if (common >= 0.5 && g.pitch > 0.15 && g.pitchRate <= 0) phase = 'free-swing';
        else return request(working, working, 'PULL BOTH TO WORKING BRAKE', 'Build a small backswing. Release when the wing turns forward.', 'shape');
      }
      if (phase === 'free-swing') {
        if (watch.frontAt > frontAt) phase = 'pump';
        else return request(0, 0, 'HANDS UP · LET IT SWING', 'Let the wing move forward, then pull again as it starts to swing back.', 'wait');
      }
      if (phase === 'pump') {
        if (common >= 0.5 && g.pitch > 0 && g.pitchRate <= 0) phase = 'wait-catch';
        else return request(working, working, 'PULL BOTH · BUILD THE SWING', 'Pull through the backswing. The next release keeps the rhythm.', 'shape');
      }
      if (phase === 'wait-catch') {
        if (g.pitch < -0.35 && g.pitchRate < 0) phase = 'catch';
        else return request(0, 0, 'HANDS UP · WAIT FOR THE SURGE', 'Let the wing travel forward. Catch it at the next cue.', 'wait');
      }
      if (phase === 'catch' && g.pitch >= 0) phase = 'recover';
      if (phase === 'catch') return request(working, working, 'CATCH · PULL BOTH BRAKES', 'Check the forward swing with working brake, then let the wing settle.', 'catch');
    } else if (kind === 'spiral' && phase !== 'recover') {
      const field = request(side < 0 ? .82 : 0, side > 0 ? .82 : 0,
        `HOLD ${side < 0 ? 'LEFT' : 'RIGHT'} · TURN THROUGH 360°`,
        'Hold the marked deep turn. The course you actually fly counts the full circle; release at the next cue.', 'turn');
      field.progress = Math.min(1, ((watch as { spiralArc?: number }).spiralArc ?? 0) / (Math.PI * 2));
      field.progressLabel = 'OBSERVED TURN · 360°';
      return field;
    } else if (kind !== 'spiral') {
      const depth = kind === 'loop' ? 1 : 0.82;
      if (kind === 'loop' && g.loop) inverted = true;
      const returning = watch.topAt > topAt && watch.topSide === side && g.bank * side > 0 && g.rollRate * side < 0;
      if (phase === 'first-turn' || phase === 'alternate') {
        // A held independent brake can settle into a steep spiral without rolling back through
        // a bank target. The first forward pendulum peak gives its observed transfer of energy.
        const firstWingSwing = kind === 'wingover' && phase === 'first-turn' &&
          watch.frontAt > frontAt && g.bank * side > 1.03;
        const qualifiedReturn = returning && (kind !== 'wingover' || phase !== 'first-turn' || watch.top >= 0.873);
        if (firstWingSwing || qualifiedReturn && Math.abs(g.bank) <= (kind === 'loop' ? 0.50 : 1.45)) {
          side = -side; topAt = watch.topAt;
          preparing = false;
          reversal = { side, depth, at: now, acceptedFor: 0 };
          phase = kind === 'loop' ? 'orbit' : 'alternate';
          return request(side < 0 ? depth : 0, side > 0 ? depth : 0, `REVERSE ${side < 0 ? 'LEFT' : 'RIGHT'} NOW`, 'Pull the other hand as the swing returns. Momentum carries you across.', 'reverse');
        }
        const prepare = preparing || (kind === 'wingover' ? phase === 'first-turn' ? g.bank * side > 0.90 :
          returning && Math.abs(g.bank) < 1.45 : returning && Math.abs(g.bank) < 1.15);
        preparing = prepare;
        return request(side < 0 ? depth : 0, side > 0 ? depth : 0,
          prepare ? `GET READY ${side < 0 ? 'RIGHT' : 'LEFT'}` : `PULL ${side < 0 ? 'LEFT' : 'RIGHT'} TO THE ${kind === 'loop' ? 'FULL' : 'SWING'} MARK`,
          prepare ? 'Keep this hand pulled while the forward swing finishes. Get ready for the opposite pull.' :
            kind === 'loop' ? 'Use the full pull to build energy. Wait for the return before swapping.' : 'Hold the marked swing depth. More brake is not needed; wait for the return cue.', prepare ? 'prepare' : 'hold');
      }
      if (phase === 'orbit') {
        if (inverted && !g.loop && g.bank * side >= 0.70) phase = 'recover';
        else return request(side < 0 ? 1 : 0, side > 0 ? 1 : 0, inverted ? 'LET THE ORBIT COME THROUGH' : 'HOLD THE FULL PULL',
          'Keep this side while momentum carries you around. The next cue releases the turn.', 'orbit');
      }
    }
    // A forward catch followed by hands up removes swing energy without an automatic rescue.
    if ((watch.calm ?? 0) >= 0.25) recoveryPull = false;
    else if (g.pitch < -COACH_INTENT.recoveryPitch) recoveryPull = true;
    else if (g.pitch > COACH_INTENT.recoveryPitch) recoveryPull = false;
    return recoveryPull ? request(working, working, 'CATCH THE FORWARD SWING', 'Use both working brakes, then release as the wing comes back.', 'recovery') :
      request(0, 0, 'HANDS UP · RECOVER LEVEL', 'Let the wing settle for three steady seconds to bank the move.', 'recovery');
  }
  return { reset, step, recover };
}
