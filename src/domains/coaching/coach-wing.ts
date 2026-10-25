import { FLIGHT } from '../flight/flight.ts';
// How the coach reckons with the wing being flown: its speeds at trim, on the bar and on the light
// brake, its sink at trim, and how fast it turns as the coach plans a turn. The fjord and Training fly
// the classic wing, whose numbers are FLIGHT's; a run on a glider hands the coach that glider's
// (the adapter's `wing`, models.js; gliders.js coachWingFor). It imports no game, so the page's
// coach can carry it.

export interface CoachWing { trimSpeed: number; barSpeed: number; lightSpeed: number; trimSink: number; turnRate: number }

/** The classic wing, as the coach has always reckoned with it. */
export const CLASSIC_COACH_WING: Readonly<CoachWing> = Object.freeze({
  trimSpeed: FLIGHT.speed.trim, barSpeed: FLIGHT.speed.bar, lightSpeed: FLIGHT.speed.light, trimSink: FLIGHT.sink.trim, turnRate: FLIGHT.turn.trim,
});

/** The wing the coach reckons with: the one the adapter hands it, or the classic wing. */
export const coachWing = (adapter: { wing?: () => Readonly<CoachWing> | null }) => adapter.wing?.() ?? CLASSIC_COACH_WING;
