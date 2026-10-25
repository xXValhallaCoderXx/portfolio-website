// Test helper: the recovery lab. Starts a failure on a wing in still air, as a lesson's instructor
// does (flight.js induceFailure), and flies it out with the hands given: none, a recovery at a
// reaction, or a wrong one. Measures how long until the wing flies steady again, the height it lost
// on the way, how far it turned, and every failure it went through. Not part of the game, and
// deliberately not named *.test.ts.
import type { FlightState } from '../../domains/flight/models.ts';
import { createFlight, induceFailure, stepFlight, PHYSICS, type Failure } from '../../domains/flight/flight.ts';
import { classify, createRecoveryGuide } from '../../domains/coaching/recovery-guide.ts';
import { LAB_STEP, pair } from './flight-lab.ts';
import { reacting, type Hands } from './test-tricks.ts';

const DEG = Math.PI / 180;
const A = PHYSICS.acro;

/** The recovery guide's hands (recovery-guide.js), followed `delay` seconds late as a pilot reacts. */
export function guided(delay = 0.15): Hands {
  const guide = createRecoveryGuide();
  return reacting(delay, g => {
    const advice = guide.step(g);
    return { ...pair(advice.left, advice.right), bar: advice.bar };
  });
}

/** What a wing is going through this step, the worst first: the failure a pilot has to answer, or ''. */
export const failureOf = (g: FlightState) => classify(g);

export interface FailureFlight {
  /** Whether the wing could be made to have it at all. */
  induced: boolean;
  /** Seconds from the failure until the wing began a second of steady flight: Infinity if it never did. */
  seconds: number;
  /** Metres lost from the failure until then (or the end of the flight). */
  lost: number;
  /** Degrees the heading turned, all told, from the failure until then (or the end). */
  turned: number;
  /** Every failure it went through, in the order each was first seen. */
  seen: Failure[];
  /** Seconds until a recovery guide watching it called it saved, and the metres it said that cost (Infinity: never). */
  saved: number; savedLost: number;
  /** Failures it went through that a guide watching it counted as escalations. */
  escalations: number;
  g: FlightState;
}

/**
 * Flies `wing` level at trim for `at` seconds, starts `kind` on `side` at `size`, then flies the
 * `hands` for up to `seconds` until the wing has flown steady for a second (flying, nothing folded,
 * caught, stalled or twisted, and level by the acro table's steady numbers) and a recovery guide
 * watching it has called it saved.
 */
export function flyFailure(wing: string, kind: Failure, { side = 1, size, hands = pair(0) as Hands, at = 5, seconds = 30 }:
  { side?: number; size?: number; hands?: Hands; at?: number; seconds?: number } = {}): FailureFlight {
  const g = createFlight({ x: 0, y: 3000, z: 0 }, wing);
  for (let i = 0; i < Math.round(at / LAB_STEP); i++) stepFlight(g, pair(0), {}, LAB_STEP);
  const induced = induceFailure(g, kind, side, size);
  const from = g.pos.y, seen: Failure[] = [], watch = createRecoveryGuide();
  let turned = 0, calm = 0, tick = 0, settledAt = -1, settledY = from, settledTurn = 0, done = false;
  const failure = failureOf(g);
  if (failure) seen.push(failure);
  for (; tick < Math.round(seconds / LAB_STEP) && induced; tick++) {
    const yaw = g.yaw;
    stepFlight(g, typeof hands === 'function' ? hands(g, tick) : hands, {}, LAB_STEP);
    turned += Math.abs(Math.atan2(Math.sin(g.yaw - yaw), Math.cos(g.yaw - yaw)));
    const now = failureOf(g);
    if (now && !seen.includes(now)) seen.push(now);
    watch.step(g);
    const steady = !now && g.wingPhase === 'flying' && Math.abs(g.bank) < A.steadyBank && Math.abs(g.pitch) < A.steadyPitch &&
      Math.abs(g.rollRate) < A.steadyRate && Math.abs(g.pitchRate) < A.steadyRate;
    if (!done && steady && calm === 0) { settledAt = tick + 1; settledY = g.pos.y; settledTurn = turned; }
    calm = steady ? calm + 1 : 0;
    done ||= calm * LAB_STEP >= A.steady;
    if (done && watch.advice.saves) break;
  }
  const { saves, saved, escalations } = watch.advice;
  return { induced, seconds: done ? settledAt * LAB_STEP : Infinity, lost: from - (done ? settledY : g.pos.y),
    turned: (done ? settledTurn : turned) / DEG, seen, saved: saves ? saved.seconds : Infinity, savedLost: saves ? saved.lost : Infinity,
    escalations, g };
}
