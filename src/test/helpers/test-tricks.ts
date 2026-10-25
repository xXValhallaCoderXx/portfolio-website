// Test helper: flies scripted hands through the trick watch (trick-watch.js) and combo
// scorer (meet-combo.js) in still air, and lists what they saw. Not part of the game, and
// deliberately not named *.test.ts.
import type { FlightInput, FlightState, Vector3 } from '../../domains/flight/models.ts';
import { createFlight, stepFlight } from '../../domains/flight/flight.ts';
import { createSwingWatch } from '../../domains/coaching/swing-watch.ts';
import { createTrickWatch } from '../../domains/good-lift/trick-watch.ts';
import { createComboStyle } from '../../domains/good-lift/meet-combo.ts';
import { LAB_STEP, pair } from './flight-lab.ts';

export interface TrickEvent { at: number; kind: 'move' | 'unit' | 'break' | 'bank' | 'lost'; move: number; side: number; units: number;
  band: number; link: number; flow: number; reason: number; points: number }
export type Hands = FlightInput | ((g: FlightState, tick: number) => FlightInput);
export type TrickLeg = [seconds: number, hands: Hands];

/** A hand that waits `delay` seconds before doing what `want` asks, as a pilot reacting to the wing. */
export function reacting(delay: number, want: (g: FlightState, tick: number) => FlightInput): Hands {
  let pending: { at: number; input: FlightInput } | null = null, held: FlightInput = pair(0);
  return (g, tick) => {
    const asked = want(g, tick);
    if (!pending && JSON.stringify(asked) !== JSON.stringify(held)) pending = { at: tick + Math.round(delay / LAB_STEP), input: asked };
    if (pending && tick >= pending.at) { held = pending.input; pending = null; }
    return held;
  };
}

/** Brakes a full stall's surge once, at `depth`, from when the wing is `at` rad ahead, for `hold` steps. */
export function catchOnce(at = -0.4, hold = 50, depth = 1): Hands {
  let caught = -1;
  return (g, tick) => {
    if (caught < 0 && g.pitch < at) caught = tick;
    return caught >= 0 && tick - caught < hold ? pair(depth) : pair(0);
  };
}

export function flyTricks(legs: TrickLeg[], { make = (pos: Vector3) => createFlight(pos), struckAt = -1,
  each = (_tricks: ReturnType<typeof createTrickWatch>) => {} } = {}) {
  const g = make({ x: 0, y: 3000, z: 0 }), swing = createSwingWatch(), tricks = createTrickWatch(), style = createComboStyle();
  const events: TrickEvent[] = [];
  const world = { tricks };
  let tick = 0, instances = 0, units = 0, breaks = 0, landed = 0, lost = 0;
  for (const [seconds, hands] of legs) {
    for (let i = 0; i < Math.round(seconds / LAB_STEP); i++, tick++) {
      const controls = typeof hands === 'function' ? hands(g, tick) : hands;
      stepFlight(g, controls, {}, LAB_STEP);
      swing.step(LAB_STEP, g, false, controls);
      tricks.step(g, controls, tick === struckAt, swing.state);
      each(tricks);
      style.step(LAB_STEP, world);
      const s = tricks.state, at = (tick + 1) * LAB_STEP;
      const event = (kind: TrickEvent['kind'], points = 0) => events.push({ at, kind, move: s.move, side: s.side, units: s.units,
        band: s.band, link: s.link, flow: s.flow, reason: s.broke, points });
      if (s.instances > instances) event('move');
      else if (s.unitCount > units) event('unit');
      if (s.breaks > breaks) event('break');
      if (style.state.landed > landed) event('bank', style.state.said);
      if (style.state.lost > lost) event('lost', style.state.said);
      instances = s.instances; units = s.unitCount; breaks = s.breaks; landed = style.state.landed; lost = style.state.lost;
    }
  }
  return { g, tricks, style, events, moves: events.filter(event => event.kind === 'move') };
}
