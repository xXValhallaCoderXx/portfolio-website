import type { FlightState, Vector3 } from '../../domains/flight/models.ts';
import { createFlight, stepFlight } from '../../domains/flight/flight.ts';
import { createSwingWatch } from '../../domains/coaching/swing-watch.ts';
import { createStyle } from '../../domains/good-lift/meet-style.ts';
import { createRecorder, encodeLog, frameInput, inputFrame } from '../../domains/good-lift/recorder.ts';
import { SIM_VERSION } from '../../domains/good-lift/sim-version.ts';
import { createDirectCatch, directBrakes, DIRECT_STEP } from './test-direct-flight.ts';

type ComboWorld = { g: FlightState; watch: ReturnType<typeof createSwingWatch>; style: ReturnType<typeof createStyle> };

// Bodies stay exact. Only derived inverse-trigonometric display measurements use the same
// precision as the other cross-V8 physical receipts; no event, score, timestamp or input rounds.
function snapshot({ g, watch, style }: ComboWorld) {
  const derived = new Set(['front', 'back', 'caughtPeak', 'top', 'moveSize', 'deepest', 'rollAcceleration', 'spiralArc']);
  return JSON.parse(JSON.stringify({ pilot: g.pilot, canopy: g.canopy,
    wing: { controlMode: g.controlMode, leftBrake: g.leftBrake, rightBrake: g.rightBrake, wingPhase: g.wingPhase,
      inflation: g.inflation, stall: g.stall, tuck: g.tuck, loops: g.loops, energy: g.physical.energy },
    watch: watch.state, style: style.state },
  (key, value) => derived.has(key) && typeof value === 'number' ? Math.round(value * 1e11) / 1e11 : value));
}

/** Browser capture pilot: independent brakes, actual observed spiral, fresh alternating tops. */
export function captureSpiralCombo(side: number, delay: number) {
  const origin = { x: 0, y: 2000, z: 0 };
  const g = createFlight({ ...origin }), watch = createSwingWatch(), style = createStyle(), controls = directBrakes();
  const world = { g, watch, style, controls }, recorder = createRecorder(), recover = createDirectCatch(delay);
  const checkpoints: Array<{ step: number; snapshot: ReturnType<typeof snapshot> }> = [];
  const moves: Array<{ step: number; kind: number; band: number }> = [];
  let reverseAt: number | null = null, seen = 0, stalls = 0, tucks = 0, minimumHeight = origin.y;
  const pull = (direction: number) => direction < 0 ? directBrakes(.82, 0) : directBrakes(0, .82);
  for (let tick = 0; tick < 45 / DIRECT_STEP && style.state.landed === 0; tick++) {
    if (reverseAt === null && watch.state.spirals > 0) reverseAt = tick + Math.round(delay / DIRECT_STEP);
    const elapsed = reverseAt === null ? -1 : (tick - reverseAt) * DIRECT_STEP;
    const direction = Math.floor(elapsed / 4.5) % 2 ? side : -side;
    const input = elapsed < 0 ? pull(side) : elapsed < 20 ? pull(direction) : recover(g, tick);
    const frame = inputFrame(input);
    recorder.push(frame); frameInput(frame, controls);
    stepFlight(g, controls, {}, DIRECT_STEP); watch.step(DIRECT_STEP, g, false, controls); style.step(DIRECT_STEP, world);
    stalls += Number(g.stall > 0); tucks += Number(g.tuck > 0); minimumHeight = Math.min(minimumHeight, g.pos.y);
    const moved = watch.state.moves > seen;
    if (moved) moves.push({ step: recorder.steps, kind: watch.state.moveKind, band: watch.state.moveBand });
    if (recorder.steps === 1 || recorder.steps % 600 === 0 || moved || style.state.landed > 0)
      checkpoints.push({ step: recorder.steps, snapshot: snapshot(world) });
    seen = watch.state.moves;
  }
  return { side, delay, simVersion: SIM_VERSION, origin, steps: recorder.steps,
    link: encodeLog({ simVersion: SIM_VERSION, seed: 0, total: style.state.total, peak: origin.y }, recorder.bits, recorder.steps),
    moves, metrics: { stalls, tucks, heightLoss: origin.y - minimumHeight }, checkpoints, snapshot: snapshot(world) };
}

/** Replays the frozen browser controls only; this never asks the capture pilot for an action. */
export function replaySpiralCombo(record: { origin: Vector3; checkpoints: readonly { step: number }[] }, frames: ArrayLike<number>) {
  const g = createFlight({ ...record.origin }), watch = createSwingWatch(), style = createStyle(), controls = directBrakes();
  const world = { g, watch, style, controls }, wanted = new Set(record.checkpoints.map(check => check.step));
  const checkpoints = [];
  for (let tick = 0; tick < frames.length; tick++) {
    frameInput(frames[tick], controls);
    stepFlight(g, controls, {}, DIRECT_STEP); watch.step(DIRECT_STEP, g, false, controls); style.step(DIRECT_STEP, world);
    if (wanted.has(tick + 1)) checkpoints.push({ step: tick + 1, snapshot: snapshot(world) });
  }
  return { checkpoints, snapshot: snapshot(world) };
}
