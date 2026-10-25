import type { Failure } from '../../../domains/flight/wing-folds.ts';
import { failureFix, failureName, savedWords } from '../../../domains/coaching/recovery-guide.ts';
// The run's cue for a wing in trouble, said by the pilot where the eye already is. It names what
// has happened (LEFT COLLAPSE, FRONTAL, FULL STALL, SPIN, DEEP STALL, LEFT CRAVAT, LINE TWIST); on
// the forgiving gliders, the A and the B (gliders.js guidanceFor), it also says the fix as the
// recovery guide (recovery-guide.js) flies it, with the key for its step on a keyboard (a touch
// screen lights the target on the brake handle instead). The C, the D and the acro wing are only
// told what happened: their fixes are learned in Training. SAVED says what it cost once the wing is
// flown out, and SOFT which half has gone soft under a deep hand. It observes the guide once a
// fixed step, saying which cue that step began so its sound lands in the same step, and says what
// to show once a frame by its own clock. It writes nothing back to a run.

export const WING_CUE = Object.freeze({
  // Milliseconds SAVED is shown for.
  saved: 2200,
  // How near a half is to stalling by itself (softBrakes) for SOFT to say so, and to go quiet again.
  soft: 0.5, softOff: 0.3,
  // Pixels: the cue this far above the pilot, kept `margin` off the screen's edges; docked, this
  // far under the readouts.
  up: 92, margin: 8, below: 8,
});

/** How much a glider is told in a run: the fix as well as the name (the A and the B), or only the name. */
export type CueGuidance = 'fix' | 'name';
/** The hands a pilot flies with: a keyboard's keys, a mouse's drag, or the touch screen's handles. */
export type CueDevice = 'keyboard' | 'mouse' | 'touch';
/** What a step began, for its sound: a failure met, the fix's next step (the A and the B), SOFT, SAVED. */
export type CueSound = 'event' | 'step' | 'soft' | 'saved' | null;

/** What the cue reads of the recovery guide's advice (recovery-guide.js RecoveryAdvice). */
export interface CueAdvice {
  event: Failure | ''; side: number; left: number; right: number; bar: boolean;
  saves: number; saved: { seconds: number; lost: number };
}

/** What to show this frame: the event's name, its fix and the key for its step, and which of the cues it is. */
export interface CueParts { name: string; fix: string; keys: string; kind: 'event' | 'saved' | 'soft' | '' }

// What a failure is called and its fix, in the words the recovery guide says them (recovery-guide.js).
export const eventName = failureName, eventFix = failureFix;

/**
 * The keys that give the hands `left` and `right` and the `bar` (brake-input.js): the guide only ever
 * asks for a device's marks, so each is a key or a chord.
 */
export function stepKeys(left: number, right: number, bar: boolean) {
  if (bar) return '↑';
  if (left === 0 && right === 0) return 'HANDS UP';
  if (left === right) return left >= 1 ? 'SHIFT + S' : 'S';
  const deep = Math.max(left, right) >= 0.82;
  return left > right ? deep ? 'Q' : 'A' : deep ? 'E' : 'D';
}

const NONE = Object.freeze({ left: 0, right: 0 });

export function createWingCue(now: () => number = () => performance.now()) {
  const seen = { event: '' as Failure | '', side: 0, left: 0, right: 0, bar: false, saves: 0, soft: 0 };
  const parts: CueParts = { name: '', fix: '', keys: '', kind: '' };
  let savedUntil = -Infinity, savedName = '';

  /** Forgets the last run; `advice` (if given) is where the new one starts from. */
  function reset(advice?: Readonly<CueAdvice>) {
    seen.event = ''; seen.side = 0; seen.left = seen.right = 0; seen.bar = false; seen.soft = 0;
    seen.saves = advice?.saves ?? 0;
    savedUntil = -Infinity; savedName = '';
  }

  /**
   * One fixed step of the guide's advice, and how near each half is to stalling by itself (`soft`,
   * softBrakes), for a glider told `guidance`: the cue it began, for its sound, or null.
   */
  function observe(advice: Readonly<CueAdvice>, soft: Readonly<{ left: number; right: number }> = NONE, guidance: CueGuidance = 'name'): CueSound {
    // The half nearer stalling, once one is near enough, until it is well clear again.
    const most = Math.max(soft.left, soft.right);
    const softSide = most >= (seen.soft ? WING_CUE.softOff : WING_CUE.soft) ? soft.left >= soft.right ? -1 : 1 : 0;
    let began: CueSound = null;
    if (softSide && !seen.soft) began = 'soft';
    if (advice.event && (advice.event !== seen.event || advice.side !== seen.side)) began = 'event';
    else if (advice.event && guidance === 'fix' && (advice.left !== seen.left || advice.right !== seen.right || advice.bar !== seen.bar)) began = 'step';
    if (advice.saves > seen.saves) {
      began = 'saved'; savedUntil = now() + WING_CUE.saved;
      savedName = savedWords(advice.saved.seconds, advice.saved.lost);
    }
    seen.event = advice.event; seen.side = advice.side; seen.saves = advice.saves; seen.soft = softSide;
    seen.left = advice.event ? advice.left : 0; seen.right = advice.event ? advice.right : 0; seen.bar = !!advice.event && advice.bar;
    return began;
  }

  /**
   * What to show this frame, for a glider told `guidance`, flown with `device`: the failure, then
   * SAVED, then SOFT. A touch screen gets no key: its handles light the step instead.
   */
  function show(guidance: CueGuidance = 'name', device: CueDevice = 'keyboard'): Readonly<CueParts> {
    parts.fix = parts.keys = '';
    if (seen.event) {
      parts.kind = 'event'; parts.name = eventName(seen.event, seen.side);
      if (guidance === 'fix') {
        parts.fix = eventFix(seen.event, seen.side);
        if (device !== 'touch') parts.keys = stepKeys(seen.left, seen.right, seen.bar);
      }
    } else if (now() < savedUntil) { parts.kind = 'saved'; parts.name = savedName; }
    else if (seen.soft) { parts.kind = 'soft'; parts.name = seen.soft < 0 ? 'SOFT ◂' : '▸ SOFT'; }
    else { parts.kind = ''; parts.name = ''; }
    return parts;
  }

  /** What a screen reader says of it: the name, and the fix where a glider is told one. */
  function words(guidance: CueGuidance = 'name') {
    const { name, fix } = show(guidance);
    return fix ? `${name}: ${fix}` : name;
  }

  /** The hands the fix asks for this step, for a touch screen's handles to light (the A and the B), or null. */
  function target(guidance: CueGuidance) {
    return guidance === 'fix' && seen.event ? { left: seen.left, right: seen.right } : null;
  }

  return { reset, observe, show, words, target };
}

/** Where the cue of `width` × `height` px goes: above the pilot at (x, y), or docked under the readouts' `top`. */
export function placeCue(x: number, y: number, seen: boolean, dock: boolean, screen: { width: number; height: number },
  size: { width: number; height: number }, top: number, out: { x: number; y: number }) {
  const C = WING_CUE, half = size.width / 2;
  if (dock || !seen) { out.x = screen.width / 2 - half; out.y = top + C.below; return out; }
  out.x = Math.min(screen.width - C.margin - size.width, Math.max(C.margin, x - half));
  out.y = Math.min(screen.height - C.margin - size.height, Math.max(top + C.below, y - C.up - size.height));
  return out;
}
