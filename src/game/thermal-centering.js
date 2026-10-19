// Wind can carry a perfectly held air-relative circle out of a stationary core. Compare ordinary
// working-brake choices on a private wing, then ask the pilot for the best safe correction.
// Forecasts sample the current sky; neither the sky nor the real wing advances here.
import { createFlight, copyFlight, stepFlight } from './flight.js';

/** Candidate controls use the same brake mode as the pilot, without touching the real input. */
export function centeringControls(input, side, brake = true) {
  if (input.controlMode !== 'brakes') return { turn: side, brake };
  const inner = brake ? 0.50 : 0.20, outer = brake ? 0.20 : 0;
  return { controlMode: 'brakes', leftBrake: side < 0 ? inner : outer,
    rightBrake: side > 0 ? inner : outer, bar: false, ears: false };
}

export function heldControls(input) {
  if (input.controlMode === 'brakes') return { controlMode: 'brakes', leftBrake: input.leftBrake,
    rightBrake: input.rightBrake, bar: !!input.bar, ears: !!input.ears };
  return { turn: Number(!!input.right) - Number(!!input.left), brake: !!input.brake,
    deepBrake: !!input.deepBrake, bar: !!input.bar, ears: !!input.ears };
}

export const THERMAL_CENTERING = Object.freeze({ every: 0.5, horizon: 8.5, step: 1 / 20,
  reaction: 1, clearance: 35, distanceCost: 0.0025, keep: 0.5,
  easeAfter: Object.freeze([0, 1.5, 3]), easeFor: Object.freeze([1.5, 3]) });

export function createThermalCentering(adapter, validPoint) {
  const projected = createFlight(), air = {}, C = THERMAL_CENTERING;
  let due = -Infinity, key = '', chosen = null;
  function reset() { due = -Infinity; key = ''; chosen = null; }
  function choose(g, source, dir, input, fog, clock, { brake = true, onlySide = null, sameWay = false } = {}) {
    const identity = `${source.key}:${dir}:${brake}:${onlySide ?? 'any'}:${sameWay}:${input.controlMode ?? 'digital'}`;
    if (clock < due && key === identity) return chosen;
    key = identity; due = clock + C.every;
    let best = -Infinity, next = null;
    // Anticipate the upwind part of an oval instead of comparing an entire straight glide
    // against an entire circle. Every plan returns to the flock's original direction.
    const plans = sameWay && onlySide === null ? [{ side: dir, from: Infinity, duration: 0 },
      ...C.easeAfter.flatMap(from => C.easeFor.map(duration => ({ side: from === 0 ? 0 : dir, from, duration })))] :
      (onlySide === null ? [dir, 0, -dir] : [onlySide]).map(side => ({ side }));
    for (const plan of plans) {
      const side = plan.side;
      copyFlight(projected, g);
      let score = 0, safe = true;
      for (let t = C.step; t <= C.horizon; t += C.step) {
        adapter.sampleAir(projected.pos, air);
        const plannedSide = sameWay && onlySide === null ?
          t >= C.reaction + plan.from && t < C.reaction + plan.from + plan.duration ? 0 : dir : side;
        const controls = t < C.reaction ? heldControls(input) : centeringControls(input, plannedSide, brake);
        stepFlight(projected, controls, air, C.step);
        const near = Math.hypot(projected.pos.x - source.x - source.vx * t, projected.pos.z - source.z - source.vz * t);
        score += ((air.thermal || 0) - C.distanceCost * near * near) * C.step;
        if (!validPoint(projected.pos, fog, C.clearance) || projected.stall || projected.tuck || projected.loop) {
          safe = false; break;
        }
      }
      if (!safe) continue;
      if (side === chosen) score += C.keep;
      if (score > best) { best = score; next = side; }
    }
    chosen = next;
    return chosen;
  }
  return { reset, choose };
}
