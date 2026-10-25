import type { CoachFrame } from './flight-coach.ts';
import type { CoachFields } from './models.ts';
import { COACH_INTENT } from './coach-intent.ts';
import { wingTable } from '../flight/flight-physics.ts';
import { MOVE } from '../good-lift/trick-tables.ts';
import type { createTrickWatch } from '../good-lift/trick-watch.ts';

export type DirectManeuver = 'pitch' | 'spiral' | 'wingover' | 'loop' | 'stall' | 'wing-spiral' | 'spiral-exit' | 'heli' | 'sat';
const working = 0.60;
const names = { pitch: 'PITCH & CATCH', spiral: 'SPIRAL 360', wingover: 'WINGOVER', loop: 'LOOP',
  stall: 'FULL STALL & CATCH', 'wing-spiral': 'WING-SPIRAL', 'spiral-exit': 'SPIRAL EXIT', heli: 'HELICOPTER', sat: 'SAT' };
// Out of a spiral, the other hand pulls until the wing banks this far (rad, 60°) its way, or for at
// most `SWAP_MOST` s: held longer, the swing goes over the top and dives far too fast. The hands then
// stay up while it tops out, for at most `TOP_MOST` s: braked there, the steep loaded swing reads as
// a new spiral beginning rather than a wingover's top.
const SWAP_BANK = 1.05, SWAP_MOST = 3, TOP_MOST = 2;
// A full stall is let go once held (the trick watch's READY) and settled above the pilot: pitch and
// its rate under these (rad, rad/s), or after `SETTLE_MOST` s held, should it never quite settle.
const SETTLED = Object.freeze({ pitch: 0.17, rate: 0.2 }), SETTLE_MOST = 3;
// A rotation on one half: a helicopter's eased hand (the keyboard chord's, Shift and both hands and
// one side), the units it is kept turning for, how long both hands are full again before they let go
// (s), and how long a pull into a SAT may take to begin one (s).
const HELI_EASED = 0.6, ROTATION_TURNS = 3, STOP_FOR = 2.5, SAT_MOST = 4;

/**
 * Visible requests from measured motion. This observer never moves the wing or presses a key. The
 * moves the swing watch does not know (a full stall, and the named links into and out of a spiral)
 * are followed through the trick watch (`frame.tricks`), which only the lessons that
 * teach them are given.
 */
export function createDirectAcroGuide() {
  let phase = 'level', side = 1, topAt = -Infinity, frontAt = -Infinity, inverted = false;
  let preparing = false, recoveryPull = false, lastClock = -Infinity, swapAt = -Infinity, heldAt = -Infinity, seenMoves = 0, phaseAt = -Infinity;
  let reversal: { side: number; depth: number; at: number; acceptedFor: number } | null = null;
  function reset(direction = 1) {
    phase = 'level'; side = Math.sign(direction) || 1;
    topAt = frontAt = swapAt = heldAt = phaseAt = -Infinity; inverted = false; seenMoves = 0;
    preparing = recoveryPull = false; lastClock = -Infinity; reversal = null;
  }
  function recover() { phase = 'recover'; reversal = null; preparing = false; }
  function step(kind: DirectManeuver, frame: CoachFrame & { tricks?: ReturnType<typeof createTrickWatch>['state'] }): CoachFields {
    const { g, watch, input = {}, tricks } = frame;
    // A wing whose halves stall by themselves at any speed (the acro) spins from a full pull of one
    // hand: its one-handed pulls stop at the Q/E depth.
    const flow = wingTable(g.physical?.wing ?? 'classic').feel?.flow;
    const oneFull = flow && flow.local > 0 && flow.maxSpeed === 0 ? 0.82 : 1;
    // A spiral the trick watch has confirmed, and is still flying.
    const spiraling = !!tricks?.active && (tricks.move === MOVE.spiral || tricks.move === MOVE.asym);
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
        phase = kind === 'pitch' ? 'shape' : kind === 'stall' || kind === 'heli' ? 'pull' : kind === 'spiral-exit' || kind === 'sat' ? 'turn' : 'first-turn';
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
    } else if (kind === 'stall' && phase !== 'recover') {
      // Held fully down until the trick watch has the stall held and the wing has settled above the
      // pilot, let up together, and the surge caught. A surge before then (the hands let up early) is
      // caught all the same.
      const surging = g.pitch < -0.35 && g.pitchRate < 0, held = tricks?.ready === 2;
      heldAt = held ? Math.min(heldAt, now) : Infinity;
      const settled = Math.abs(g.pitch) < SETTLED.pitch && Math.abs(g.pitchRate) < SETTLED.rate;
      if (phase === 'pull' && held && (settled || now - heldAt >= SETTLE_MOST)) phase = 'let-go';
      if (phase === 'pull') {
        if (surging && Math.max(input.leftBrake ?? 0, input.rightBrake ?? 0) < working)
          return request(working, working, 'CATCH · PULL BOTH BRAKES', 'The wing shot ahead before it was held. Check it, then pull both fully down again.', 'catch');
        const field = held ? request(1, 1, 'HOLD · LET IT SETTLE ABOVE YOU', 'Keep both fully down while the wing stops pitching. The release comes at the next cue.', 'pull')
          : request(1, 1, 'PULL BOTH ALL THE WAY · HOLD', 'Both handles fully down. The wing slows, stalls and falls back behind you: keep holding.', 'pull');
        field.progressLabel = held ? 'HELD · SETTLING' : g.stall > 0 ? 'STALLED · KEEP HOLDING' : 'SLOWING · KEEP BOTH DOWN';
        return field;
      }
      if (phase === 'let-go') {
        if (surging) phase = 'catch';
        else return request(0, 0, 'READY ◆ BOTH HANDS UP', 'Let both handles up together. The wing refills and shoots ahead: catch it at the next cue.', 'release');
      }
      if (phase === 'catch' && g.pitch >= 0) phase = 'recover';
      if (phase === 'catch') return request(working, working, 'CATCH · PULL BOTH BRAKES', 'Check the surge with working brake, then let the wing settle.', 'catch');
    } else if (kind === 'heli' && phase !== 'recover') {
      // Held fully down until the trick watch has the stall held (READY), one hand eased to the
      // middle while the other stays full: the stalled wing turns flat on itself. Kept turning, then
      // both full again until it stops, let up together and the surge caught.
      const turning = !!tricks?.active && tricks.move === MOVE.heli, surging = g.pitch < -0.35 && g.pitchRate < 0;
      const left = side < 0 ? 1 : HELI_EASED, right = side > 0 ? 1 : HELI_EASED, held = side < 0 ? 'LEFT' : 'RIGHT';
      if (phase === 'pull' && tricks?.ready === 2) phase = 'ease';
      if (phase === 'pull') {
        if (surging && Math.max(input.leftBrake ?? 0, input.rightBrake ?? 0) < working)
          return request(working, working, 'CATCH · PULL BOTH BRAKES', 'The wing shot ahead before it was held. Check it, then pull both fully down again.', 'catch');
        const field = request(1, 1, 'PULL BOTH ALL THE WAY · HOLD', 'Both handles fully down. The wing stalls and falls back behind you: keep holding until READY.', 'pull');
        field.progressLabel = g.stall > 0 ? 'STALLED · KEEP HOLDING' : 'SLOWING · KEEP BOTH DOWN';
        return field;
      }
      if (phase === 'ease') {
        if (turning) phase = 'turning';
        else return request(left, right, 'READY ◆ EASE ONE HAND', `Keep the ${held.toLowerCase()} hand fully down and let the other up to the middle. The stalled wing turns flat on itself.`, 'ease');
      }
      if (phase === 'turning') {
        if (!turning || tricks!.units >= ROTATION_TURNS) { phase = 'stop'; phaseAt = now; }
        else {
          const field = request(left, right, `KEEP IT TURNING ${held}`, 'Hold both hands where they are while the wing turns flat on itself.', 'turning');
          field.progress = Math.min(1, tricks!.units / ROTATION_TURNS); field.progressLabel = `TURNS · ${tricks!.units} OF ${ROTATION_TURNS}`;
          return field;
        }
      }
      if (phase === 'stop') {
        if (now - phaseAt >= STOP_FOR) phase = 'let-go';
        else return request(1, 1, 'BOTH FULL · STOP THE TURN', 'Pull the eased hand fully down again: the wing stops turning and stalls straight.', 'stop');
      }
      if (phase === 'let-go') {
        if (surging) phase = 'catch';
        else return request(0, 0, 'BOTH HANDS UP TOGETHER', 'Let both handles up evenly. The wing refills and shoots ahead: catch it at the next cue.', 'release');
      }
      if (phase === 'catch' && g.pitch >= 0) phase = 'recover';
      if (phase === 'catch') return request(working, working, 'CATCH · PULL BOTH BRAKES', 'Check the surge with working brake, then let the wing settle.', 'catch');
    } else if (kind === 'sat' && phase !== 'recover') {
      // Into a spiral, and once the trick watch has it (READY), the same hand pulled fully: the wing
      // turns on itself with the pilot swung out. Kept turning, then the hand let up and the dive caught.
      const turning = !!tricks?.active && tricks.move === MOVE.sat, held = side < 0 ? 'LEFT' : 'RIGHT';
      if (phase === 'turn') {
        if (tricks?.ready === 1) { phase = 'pull'; phaseAt = now; }
        else {
          const field = request(side < 0 ? .82 : 0, side > 0 ? .82 : 0, `HOLD ${held} · INTO THE SPIRAL`,
            'Hold the marked deep turn until the wing is steep and loaded. READY comes as the spiral holds.', 'turn');
          field.progress = Math.min(1, ((watch as { spiralArc?: number }).spiralArc ?? 0) / Math.PI);
          field.progressLabel = 'SPIRAL · HALF A TURN';
          return field;
        }
      }
      if (phase === 'pull') {
        if (turning) phase = 'turning';
        else if (now - phaseAt > SAT_MOST) phase = 'recover';
        else return request(side < 0 ? 1 : 0, side > 0 ? 1 : 0, `READY ◆ PULL ${held} ALL THE WAY`,
          'The turning hand fully down: the wing turns on itself and swings you out.', 'pull');
      }
      if (phase === 'turning') {
        if (!turning || tricks!.units >= ROTATION_TURNS) phase = 'recover';
        else {
          const field = request(side < 0 ? 1 : 0, side > 0 ? 1 : 0, `KEEP IT TURNING ${held}`, 'Hold the hand fully down while you swing round outside the wing.', 'turning');
          field.progress = Math.min(1, tricks!.units / ROTATION_TURNS); field.progressLabel = `TURNS · ${tricks!.units} OF ${ROTATION_TURNS}`;
          return field;
        }
      }
    } else if (kind === 'spiral-exit' && phase !== 'recover') {
      // Into a spiral, and once the trick watch has it, the other hand pulled fully: the spiral's
      // energy swings the wing across, and the hands come up as it banks 60° the other way, so the
      // swing carries it on to a wingover's top.
      if (phase === 'turn') {
        if (spiraling) { phase = 'swap'; swapAt = now; seenMoves = tricks!.instances; side = -side; reversal = null; }
        else {
          const field = request(side < 0 ? .82 : 0, side > 0 ? .82 : 0, `HOLD ${side < 0 ? 'LEFT' : 'RIGHT'} · INTO THE SPIRAL`,
            'Hold the marked deep turn until the wing is steep and loaded. The swap comes at the next cue.', 'turn');
          field.progress = Math.min(1, ((watch as { spiralArc?: number }).spiralArc ?? 0) / Math.PI);
          field.progressLabel = 'SPIRAL · HALF A TURN';
          return field;
        }
      }
      const topped = (tricks?.instances ?? 0) > seenMoves;
      if (phase === 'swap') {
        if (topped) phase = 'recover';
        else if (g.bank * side >= SWAP_BANK || now - swapAt > SWAP_MOST) { phase = 'top'; swapAt = now; }
        else return request(side < 0 ? oneFull : 0, side > 0 ? oneFull : 0, `SWAP · PULL ${side < 0 ? 'LEFT' : 'RIGHT'} ${oneFull < 1 ? 'DEEP' : 'ALL THE WAY'}`,
          'Let the spiral hand up and pull the other fully: the stored energy swings you across. Hands up at the next cue.', 'reverse');
      }
      if (phase === 'top') {
        if (topped || now - swapAt > TOP_MOST) phase = 'recover';
        else return request(0, 0, 'HANDS UP · LET IT TOP OUT', 'Both hands up while the swing carries the wing over to its top. Catch the dive after it.', 'release');
      }
    } else if (kind === 'wing-spiral' && phase === 'into-spiral') {
      if (spiraling) phase = 'recover';
      else return request(side < 0 ? .82 : 0, side > 0 ? .82 : 0, `KEEP ${side < 0 ? 'LEFT' : 'RIGHT'} · DIVE INTO THE SPIRAL`,
        'Do not reverse this time. Hold the hand through the swing and the wing dives into a spiral.', 'into-spiral');
    } else if (kind === 'spiral' && phase !== 'recover') {
      const field = request(side < 0 ? .82 : 0, side > 0 ? .82 : 0,
        `HOLD ${side < 0 ? 'LEFT' : 'RIGHT'} · TURN THROUGH 360°`,
        'Hold the marked deep turn. The course you actually fly counts the full circle; release at the next cue.', 'turn');
      field.progress = Math.min(1, ((watch as { spiralArc?: number }).spiralArc ?? 0) / (Math.PI * 2));
      field.progressLabel = 'OBSERVED TURN · 360°';
      return field;
    } else if (kind === 'wingover' || kind === 'wing-spiral' || kind === 'loop') {
      const depth = kind === 'loop' ? oneFull : 0.82, swings = kind !== 'loop';
      // Wingovers into a spiral: once the trick watch has a pair, the hand asked for now is kept.
      if (kind === 'wing-spiral' && (phase === 'first-turn' || phase === 'alternate') && tricks?.active && tricks.move === MOVE.wingover) {
        phase = 'into-spiral'; reversal = null; preparing = false;
        return request(side < 0 ? .82 : 0, side > 0 ? .82 : 0, `KEEP ${side < 0 ? 'LEFT' : 'RIGHT'} · DIVE INTO THE SPIRAL`,
          'Do not reverse this time. Hold the hand through the swing and the wing dives into a spiral.', 'into-spiral');
      }
      if (kind === 'loop' && g.loop) inverted = true;
      const returning = watch.topAt > topAt && watch.topSide === side && g.bank * side > 0 && g.rollRate * side < 0;
      if (phase === 'first-turn' || phase === 'alternate') {
        // A held independent brake can settle into a steep spiral without rolling back through
        // a bank target. The first forward pendulum peak gives its observed transfer of energy.
        const firstWingSwing = swings && phase === 'first-turn' &&
          watch.frontAt > frontAt && g.bank * side > 1.03;
        const qualifiedReturn = returning && (!swings || phase !== 'first-turn' || watch.top >= 0.873);
        if (firstWingSwing || qualifiedReturn && Math.abs(g.bank) <= (kind === 'loop' ? 0.50 : 1.45)) {
          side = -side; topAt = watch.topAt;
          preparing = false;
          reversal = { side, depth, at: now, acceptedFor: 0 };
          phase = kind === 'loop' ? 'orbit' : 'alternate';
          return request(side < 0 ? depth : 0, side > 0 ? depth : 0, `REVERSE ${side < 0 ? 'LEFT' : 'RIGHT'} NOW`, 'Pull the other hand as the swing returns. Momentum carries you across.', 'reverse');
        }
        const prepare = preparing || (swings ? phase === 'first-turn' ? g.bank * side > 0.90 :
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
