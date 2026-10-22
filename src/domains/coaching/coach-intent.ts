import type { FlightInput } from '../flight/models.ts';
import type { CoachFields, CoachMessage, CoachOwner } from './models.ts';
import { actionMessage } from './coach-actions.ts';

export const COACH_INTENT = Object.freeze({ acknowledge: 0.15, disagree: 0.30,
  candidate: 0.25, interval: 1, reverse: 0.60, recoveryPitch: 0.05 });

const ownerOf = (message: CoachFields): CoachOwner => message.owner ??
  (['recover', 'hazard', 'descent'].includes(message.state ?? '') ? 'safety'
    : message.lessonId || message.state === 'lesson' ? 'lesson'
      : ['lift', 'soaring'].includes(message.state ?? '') ? 'navigation'
        : ['building', 'timing', 'combo'].includes(message.state ?? '') ? 'acro' : 'flight');

/** Copy and acceptance never identify an action. Identical brake demands share an intent. */
export function coachDemandKey(message: CoachFields, input: FlightInput = {}) {
  const demand = actionMessage(message, input);
  return JSON.stringify([ownerOf(message), message.lessonId ?? '', message.context ?? '',
    message.targetId ?? null, message.targetGeneration ?? null, demand.action,
    [...demand.hold].sort(), [...demand.release].sort(), demand.brakeDepth ?? '',
    message.brakeTargets ? [message.brakeTargets.left, message.brakeTargets.right, message.brakeTargets.tolerance] : null]);
}

/** Fixed-step resolved intent. A new physical demand always replaces the old one immediately. */
export function createCoachIntent() {
  let key = '', issuedAt = 0, lastClock = -Infinity, acceptedFor = 0, disagreedFor = 0, acknowledged = false;
  let copy: Pick<CoachMessage, 'title' | 'detail'> | null = null;
  let copyAt = -Infinity, candidateAt = -Infinity, candidate = '';
  function reset() {
    key = ''; issuedAt = acceptedFor = disagreedFor = 0; lastClock = -Infinity; acknowledged = false;
    copy = null; copyAt = candidateAt = -Infinity; candidate = '';
  }
  function resolve(fields: CoachFields | null, input: FlightInput, clock: number): CoachMessage | null {
    if (clock < lastClock) reset();
    const dt = Number.isFinite(lastClock) ? Math.max(0, clock - lastClock) : 0;
    lastClock = clock;
    if (!fields) { key = ''; acceptedFor = disagreedFor = 0; acknowledged = false; copy = null; return null; }
    const next = coachDemandKey(fields, input), evaluated = actionMessage(fields, input);
    const resolved = fields as CoachMessage;
    let message = typeof resolved.accepted === 'boolean' ? { ...resolved, accepted: evaluated.accepted } : evaluated;
    const changed = next !== key;
    if (changed) {
      key = next; issuedAt = clock; acceptedFor = disagreedFor = 0; acknowledged = false;
    } else if (message.accepted) {
      acceptedFor += dt; disagreedFor = 0;
      if (acceptedFor + 1e-9 >= COACH_INTENT.acknowledge) acknowledged = true;
    } else {
      acceptedFor = 0; disagreedFor += dt;
      if (disagreedFor + 1e-9 >= COACH_INTENT.disagree) acknowledged = false;
    }
    const urgency = fields.warning ? 'immediate' : fields.urgency ?? (fields.urgent || ownerOf(fields) === 'safety' ? 'immediate' : 'routine');
    if (ownerOf(fields) === 'navigation' && urgency === 'routine') {
      const topic = JSON.stringify([message.phase ?? '', message.heading ?? '']);
      if (changed || !copy) {
        copy = { title: message.title, detail: message.detail };
        copyAt = candidateAt = clock; candidate = topic;
      } else {
        if (candidate !== topic) { candidate = topic; candidateAt = clock; }
        // Settle structured phase/heading, then sample the latest copy and distance once.
        // The hand demands, acceptance and physical target above are never delayed.
        if (clock - candidateAt + 1e-9 >= COACH_INTENT.candidate && clock - copyAt + 1e-9 >= COACH_INTENT.interval) {
          copy = { title: message.title, detail: message.detail };
          copyAt = clock;
        }
      }
      message = { ...message, ...copy };
    } else copy = null;
    return { ...message, intentId: key, owner: ownerOf(fields), urgency,
      urgent: urgency === 'immediate', issuedAt, acknowledged };
  }
  return { resolve, reset };
}
