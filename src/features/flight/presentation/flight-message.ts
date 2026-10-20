/** Presentation priority only: choosing a visible card cannot change an instruction or a run. */
export interface FlightMessageFacts {
  blocked: boolean; urgent: boolean; coach: boolean; judges: boolean; notice: boolean; hint: boolean; intro: boolean;
}
export function flightMessageOwner(facts: FlightMessageFacts): 'none' | 'coach' | 'judges' | 'notice' | 'hint' | 'intro' {
  if (facts.blocked) return 'none';
  if (facts.urgent && facts.coach) return 'coach';
  if (facts.judges) return 'judges';
  if (facts.intro) return 'intro';
  if (facts.coach) return 'coach';
  if (facts.notice) return 'notice';
  return facts.hint ? 'hint' : 'none';
}
