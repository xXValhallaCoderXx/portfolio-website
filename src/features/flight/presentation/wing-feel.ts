import { FLIGHT } from '../../../domains/flight/flight.ts';
// The wing being flown, as the picture, the wind and the readouts feel it: its trim speed and sink,
// and a line naming it on the HUD (a glider's class and glide; nothing for the classic wing). The
// fjord and Training fly the classic wing; a run on a glider hands its own (good-lift.js feel), so
// the page's presentation never needs the game's gliders.

export interface WornWing { trim: number; sink: number; label: string }

/** The classic wing, as everything has always felt it. */
export const CLASSIC_WORN: Readonly<WornWing> = Object.freeze({ trim: FLIGHT.speed.trim, sink: FLIGHT.sink.trim, label: '' });
