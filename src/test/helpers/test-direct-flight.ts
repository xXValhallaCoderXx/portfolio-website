import type { FlightInput, FlightState } from '../../domains/flight/models.ts';
import { createFlight, physicsEnergy, stepFlight } from '../../domains/flight/flight.ts';
import { brakeByte } from '../../domains/flight/brake-controls.ts';
import { createSwingWatch } from '../../domains/coaching/swing-watch.ts';
import { createStyle } from '../../domains/good-lift/meet-style.ts';

export const DIRECT_STEP = 1 / 60;

/** The literal pair the browser records, including byte precision and direct hands-up mode. */
export function directBrakes(left = 0, right = left): FlightInput {
  return { controlMode: 'brakes', leftBrake: brakeByte(left) / 255, rightBrake: brakeByte(right) / 255 };
}

/** Real still-air bodies and observers. No angles, velocities or maneuver results are injected. */
export function createDirectFlight(height = 2000) {
  const g = createFlight({ x: 0, y: height, z: 0 });
  const watch = createSwingWatch(), style = createStyle(), controls = directBrakes();
  const world = { g, watch, style, controls };
  const stats = { steps: 0, peakBank: 0, stalls: 0, tucks: 0, minimumHeight: height,
    maxEnergyGain: 0, moves: [] as Array<{ kind: number; time: number }> };
  let energy = physicsEnergy(g), seen = 0;
  function step(input: FlightInput) {
    Object.assign(controls, directBrakes(input.leftBrake ?? 0, input.rightBrake ?? 0));
    stepFlight(g, controls, {}, DIRECT_STEP);
    watch.step(DIRECT_STEP, g, false, controls);
    style.step(DIRECT_STEP, world);
    const nextEnergy = physicsEnergy(g);
    stats.maxEnergyGain = Math.max(stats.maxEnergyGain, nextEnergy - energy);
    energy = nextEnergy;
    stats.steps += 1;
    stats.peakBank = Math.max(stats.peakBank, Math.abs(g.bank));
    stats.stalls += Number(g.stall > 0);
    stats.tucks += Number(g.tuck > 0);
    stats.minimumHeight = Math.min(stats.minimumHeight, g.pos.y);
    if (watch.state.moves > seen) stats.moves.push({ kind: watch.state.moveKind, time: watch.state.moveAt });
    seen = watch.state.moves;
  }
  return { ...world, stats, step };
}

/** A delayed human response to the observed forward/backward swing, without phase prediction. */
export function createDirectCatch(delay = 0, working = 0.6) {
  let catching = false, pending: { at: number; catching: boolean } | null = null;
  return (g: FlightState, tick: number) => {
    const wanted = g.pitch < 0;
    if (wanted !== catching && !pending) pending = { at: tick + Math.round(delay / DIRECT_STEP), catching: wanted };
    if (pending && tick >= pending.at) { catching = pending.catching; pending = null; }
    return directBrakes(catching ? working : 0);
  };
}
