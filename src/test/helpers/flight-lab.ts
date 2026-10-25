// Test helper: the flight lab. Flies a wing through still or simple air and measures what a pilot
// feels — trim, glide, sink, turns, stalls, how long the pitch keeps ringing, how fast it climbs in
// a thermal — and hashes whole flights, so a refactor can prove a wing flies exactly as before.
// Not part of the game, and deliberately not named *.test.ts.
import type { AirSample, FlightInput, FlightState, Vector3 } from '../../domains/flight/models.ts';
import { createFlight, stepFlight } from '../../domains/flight/flight.ts';
import { thermalProfile } from '../../domains/flight/atmosphere.ts';
import { brakeByte } from '../../domains/flight/brake-controls.ts';

export const LAB_STEP = 1 / 60;
const DEG = Math.PI / 180;

/** The literal direct pair the browser records, at byte precision. */
export const pair = (left: number, right: number = left): FlightInput =>
  ({ controlMode: 'brakes', leftBrake: brakeByte(left) / 255, rightBrake: brakeByte(right) / 255 });

export type MakeFlight = (pos: Vector3) => FlightState;
const aloft: MakeFlight = pos => createFlight(pos);

export interface Steady { air: number; sink: number; glide: number; bank: number; rate: number; radius: number }

/** Holds `controls` for `seconds` and averages the last `average` seconds. Long holds outlast the slow pitch mode. */
export function holdSteady(controls: FlightInput, { seconds = 90, average = 16, air = {} as AirSample, make = aloft } = {}): Steady {
  const g = make({ x: 0, y: 5000, z: 0 });
  let horizontal = 0, sink = 0, speed = 0, bank = 0, rate = 0, n = 0;
  const steps = Math.round(seconds / LAB_STEP), from = steps - Math.round(average / LAB_STEP);
  for (let i = 0; i < steps; i++) {
    stepFlight(g, controls, air, LAB_STEP);
    if (i < from) continue;
    horizontal += Math.hypot(g.pilot.vel.x - (air.windX ?? 0), g.pilot.vel.z - (air.windZ ?? 0));
    sink -= g.vy; speed += g.speed; bank += Math.abs(g.bank); rate += Math.abs(g.trackRate); n += 1;
  }
  return { air: speed / n, sink: sink / n, glide: horizontal / sink, bank: bank / n / DEG, rate: rate / n / DEG, radius: horizontal / rate };
}

/** Seconds of holding `controls` from trim until the wing first stalls, or Infinity. */
export function stallOnset(controls: FlightInput, { seconds = 10, make = aloft } = {}) {
  const g = make({ x: 0, y: 5000, z: 0 });
  for (let i = 1; i <= Math.round(seconds / LAB_STEP); i++) {
    stepFlight(g, controls, {}, LAB_STEP);
    if (g.stall > 0) return i * LAB_STEP;
  }
  return Infinity;
}

/**
 * How long the pitch keeps ringing after a pulse: `pulse` held for `pulseSeconds` from trim, then hands
 * up. Returns the first forward surge (deg, negative ahead) and the seconds after release until the
 * swing stays within `within` degrees of trim for good (Infinity if it never settles in `seconds`).
 */
export function pitchRinging(pulse: FlightInput, { pulseSeconds = 1.5, seconds = 60, within = 1, make = aloft } = {}) {
  const g = make({ x: 0, y: 5000, z: 0 });
  const trim = g.pitch;
  for (let i = 0; i < Math.round(pulseSeconds / LAB_STEP); i++) stepFlight(g, pulse, {}, LAB_STEP);
  let surge = 0, settledAt = 0;
  const steps = Math.round(seconds / LAB_STEP);
  for (let i = 1; i <= steps; i++) {
    stepFlight(g, {}, {}, LAB_STEP);
    const swing = (g.pitch - trim) / DEG;
    surge = Math.min(surge, swing);
    if (Math.abs(swing) > within) settledAt = i;
  }
  return { surge, settle: settledAt >= steps ? Infinity : settledAt * LAB_STEP };
}

/**
 * Mean climb (m/s) circling on `controls` in one still-air thermal centred where that circle goes
 * round: the thermal's middle is put one still-air turn radius to the side the circle turns.
 */
export function thermalClimb(controls: FlightInput, { r = 110, fade = 0.7, s = 5.5, seconds = 80, average = 40, make = aloft } = {}) {
  const turn = holdSteady(controls, { seconds: 40, average: 10, make });
  const right = (controls.rightBrake ?? 0) > (controls.leftBrake ?? 0) || (controls.turn ?? 0) > 0 ? 1 : -1;
  const g = make({ x: 0, y: 3000, z: 0 });
  const core = { x: right * turn.radius, z: 0 };
  const air: AirSample = { windX: 0, windZ: 0, windY: 0 };
  const steps = Math.round(seconds / LAB_STEP), from = steps - Math.round(average / LAB_STEP);
  let start = 0;
  for (let i = 0; i < steps; i++) {
    if (i === from) start = g.pos.y;
    air.windY = s * thermalProfile(Math.hypot(g.pos.x - core.x, g.pos.z - core.z), r, fade);
    stepFlight(g, controls, air, LAB_STEP);
  }
  return (g.pos.y - start) / average;
}

/**
 * A digest of whole flights: every number of both bodies, the wing's flow state and phase, added
 * as often as asked. Two 32-bit FNV-1a lanes over the numbers' shortest round-trip text, which every
 * JavaScript engine writes the same way.
 */
export function createBodyHash() {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x9e3779b9;
  const text = (value: string) => {
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193);
      b = Math.imul(b ^ c, 0x01000197);
    }
  };
  const vector = (v: { x: number; y: number; z: number }) => text(`${v.x},${v.y},${v.z};`);
  return {
    add(g: FlightState) {
      vector(g.pilot.pos); vector(g.pilot.vel);
      vector(g.canopy.pos); vector(g.canopy.vel); vector(g.canopy.omega);
      text(`${g.canopy.q.x},${g.canopy.q.y},${g.canopy.q.z},${g.canopy.q.w};`);
      text(`${g.physical.wingPhase},${g.physical.inflation},${g.physical.separation},${g.loops};`);
    },
    value: () => (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0'),
  };
}

/** One stretch of a scripted flight: hold `controls` in `air` for `seconds`. */
export interface Leg { seconds: number; controls: FlightInput; air?: AirSample }

/**
 * Today's wing through everything it can do, in still and moving air, by both control modes: ordinary
 * turns, a spiral, a full stall into backfly and an uncaught exit, the legacy coordinated turn, deep
 * brake, bar and ears, wingovers and pulled-through loops.
 */
export function classicScript(): Leg[] {
  const moving: AirSample = { windX: 2.5, windZ: -1.5, windY: 2 };
  const legs: Leg[] = [
    { seconds: 5, controls: pair(0) },
    { seconds: 6, controls: pair(0.3, 0) },
    { seconds: 6, controls: pair(0.5, 0.2) },
    { seconds: 4, controls: pair(0) },
    { seconds: 10, controls: pair(0, 0.82) },
    { seconds: 6, controls: pair(0) },
    { seconds: 4, controls: pair(1) },
    { seconds: 4, controls: pair(0.6) },
    { seconds: 3, controls: pair(0) },
    { seconds: 1, controls: pair(0.6) },
    { seconds: 6, controls: pair(0) },
    { seconds: 6, controls: { turn: 1, brake: true }, air: moving },
    { seconds: 6, controls: { turn: -1 }, air: moving },
    { seconds: 3, controls: { turn: -1, brake: true, deepBrake: true }, air: moving },
    { seconds: 3, controls: {}, air: moving },
    { seconds: 6, controls: { bar: true }, air: moving },
    { seconds: 6, controls: { ears: true }, air: moving },
    { seconds: 6, controls: {}, air: moving },
  ];
  for (let i = 0; i < 4; i++) legs.push({ seconds: 4.5, controls: i % 2 ? pair(0, 0.82) : pair(0.82, 0) });
  for (let i = 0; i < 3; i++) legs.push({ seconds: 4.5, controls: i % 2 ? pair(0, 1) : pair(1, 0) });
  legs.push({ seconds: 8, controls: pair(0) });
  return legs;
}

/** Flies `legs` from trim and returns the digest, sampled every `every` steps, with the flight. */
export function flyScript(legs: Leg[], { every = 30, make = aloft, height = 3000 } = {}) {
  const g = make({ x: 0, y: height, z: 0 });
  const hash = createBodyHash();
  let n = 0;
  for (const leg of legs) {
    const air = leg.air ?? {};
    for (let i = 0; i < Math.round(leg.seconds / LAB_STEP); i++) {
      stepFlight(g, leg.controls, air, LAB_STEP);
      if (++n % every === 0) hash.add(g);
    }
  }
  hash.add(g);
  return { g, hash: hash.value(), steps: n };
}
