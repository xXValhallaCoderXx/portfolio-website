import type { CoachFields } from '../../../domains/coaching/models.ts';
import type { FlightState } from '../../../domains/flight/models.ts';

/** Normal flight retains hazards and physical safety, while maneuver teaching stays in Training. */
export function essentialFlightMessage<T extends CoachFields>(message: T | null,
  wing: Pick<FlightState, 'stallLoad' | 'stall' | 'tuck' | 'wingPhase'>): T | null {
  const physicalSafety = wing.stallLoad > .65 || wing.stall > 0 || wing.tuck > 0 || wing.wingPhase !== 'flying';
  return message?.warning || message?.state === 'hazard' || physicalSafety && message?.owner === 'safety' ? message : null;
}

/** Presentation priority only: choosing a visible card cannot change an instruction or a run. */
export interface FlightMessageFacts {
  blocked: boolean; urgent: boolean; coach: boolean; judges: boolean; notice: boolean; hint: boolean; intro: boolean;
}
export function flightMessageOwner(facts: FlightMessageFacts): 'none' | 'coach' | 'judges' | 'notice' | 'hint' | 'intro' {
  if (facts.blocked) return 'none';
  if (facts.coach) return 'coach';
  if (facts.judges) return 'judges';
  if (facts.intro) return 'intro';
  if (facts.notice) return 'notice';
  return facts.hint ? 'hint' : 'none';
}

/** Results accompany the current instruction instead of taking its place. */
export function flightSecondaryOwner(facts: Pick<FlightMessageFacts, 'blocked' | 'urgent' | 'judges'>): 'judges' | 'none' {
  return !facts.blocked && !facts.urgent && facts.judges ? 'judges' : 'none';
}
