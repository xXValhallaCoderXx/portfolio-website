// Wind can carry a perfectly held air-relative circle out of a stationary core. Compare ordinary
// working-brake choices on a private wing, then ask the pilot for the best safe correction.
// Forecasts sample the current sky; neither the sky nor the real wing advances here.
import { createFlight, copyFlight, stepFlight } from './flight.js';

export const THERMAL_CENTERING = Object.freeze({ every: 0.5, horizon: 7, step: 1 / 30,
  reaction: 1, clearance: 35, distanceCost: 0.0025, keep: 0.5 });

export function createThermalCentering(adapter, validPoint) {
  const projected = createFlight(), air = {}, C = THERMAL_CENTERING;
  let due = -Infinity, key = '', chosen = null;
  function reset() { due = -Infinity; key = ''; chosen = null; }
  function choose(g, source, dir, input, fog, clock, { brake = true, onlySide = null } = {}) {
    const identity = `${source.key}:${brake}:${onlySide ?? 'any'}`;
    if (clock < due && key === identity) return chosen;
    key = identity; due = clock + C.every;
    let best = -Infinity, next = null;
    for (const side of onlySide === null ? [dir, 0, -dir] : [onlySide]) {
      copyFlight(projected, g);
      let score = 0, safe = true;
      for (let t = C.step; t <= C.horizon; t += C.step) {
        adapter.sampleAir(projected.pos, air);
        const controls = t < C.reaction ? { turn: Number(!!input.right) - Number(!!input.left), brake: !!input.brake,
          bar: !!input.bar, ears: !!input.ears } : { turn: side, brake };
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
