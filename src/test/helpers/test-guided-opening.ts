import type { CoachMessage } from '../../domains/coaching/models.ts';
import type { RunWorld } from '../../domains/good-lift/models.ts';
// Acceptance pilot: it knows only the coach's visible hold/release requests. It never selects
// a source, reads a hidden target or changes a body. The departure used by recovery tests is
// deliberately manual; normal flight resumes entirely through the same visible requests.
import { createCloudbaseRun } from '../../domains/good-lift/cloudbase-state.ts';
import { createRunWorld, startRun, stepRun, RUN } from '../../domains/good-lift/run-step.ts';
import { createMeet } from '../../domains/good-lift/meet-state.ts';
import { createBells } from '../../domains/good-lift/bells.ts';
import { createStyle } from '../../domains/good-lift/meet-style.ts';
import { createRunCoachEnvironment, runCoachHazard, runCoachWarning } from '../../features/good-lift/services/coach-run.service.ts';
import { createLiftGuide } from '../../domains/coaching/lift-guide.ts';
import { createTrickLessons } from '../../domains/good-lift/trick-lessons.ts';
import { interruptsLift, resolveCoachMessage } from '../../domains/coaching/coach-routing.ts';
import { surfaceAt } from '../../domains/flight/ground.ts';
import { swingGauge } from '../../features/flight/presentation/swing-gauge.ts';
import { copyFlight } from '../../domains/flight/flight.ts';
import { createCoachIntent } from '../../domains/coaching/coach-intent.ts';

export type HeldControls = ReturnType<typeof released>;
const released = () => ({ left: false, right: false, brake: false, deepBrake: false, bar: false, ears: false });
export const controlsOf = (input: HeldControls) => ({ turn: Number(input.right) - Number(input.left), brake: input.brake,
  deepBrake: input.deepBrake, bar: input.bar, ears: input.ears });
export function followInstruction(message: CoachMessage, input: HeldControls) {
  const next = { ...input };
  for (const key of message.release) next[key] = false;
  if (message.release.includes('brake')) next.deepBrake = false;
  for (const key of message.hold) next[key] = true;
  if (message.hold.includes('brake')) next.deepBrake = message.brakeDepth === 'deep';
  return next;
}

export function createVisiblePilot(seed: number, delay = 0.3, options: Parameters<typeof createTrickLessons>[0] = {}) {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells(), style: createStyle() }), seed) as RunWorld & { style: ReturnType<typeof createStyle>; bells: ReturnType<typeof createBells> };
  const guide = createLiftGuide(createRunCoachEnvironment(world.sky)), lessons = createTrickLessons(options), gauge = {};
  const intent = createCoachIntent();
  let input = released(), pending: { at:number;input:HeldControls } | null = null, message: CoachMessage | null = null;
  const stats = { minimumClearance: Infinity, assisted: false as boolean | undefined, shown: 0, transfers: 0, firstThermal: null as number | null, maxQualification: 0 };
  function step(manual: HeldControls | null = null) {
    const tick = world.steps;
    if (manual) { input = manual; pending = null; }
    else if (pending && tick >= pending.at) { input = pending.input; pending = null; }
    const ended = stepRun(world, controlsOf(input));
    const { g, sky, watch, style, air, pump } = world;
    const clearance = g.pos.y - surfaceAt(g.pos.x, g.pos.z);
    stats.minimumClearance = Math.min(stats.minimumClearance, clearance);
    stats.assisted ||= world.controls.steered;
    swingGauge(g, watch.state, true, RUN.step, gauge, { brake: input.brake,
      fold: sky.state.pilot.collapse, held: pump.held, pumps: pump.n });
    const lift = guide.step(RUN.step, { g, air, input, clock: sky.state.elapsed, suspended: interruptsLift(message) || sky.state.pilot.collapse > 0 });
    const hazard = runCoachHazard(world), warning = runCoachWarning(world);
    const primary = lessons.step(RUN.step, { g, watch: watch.state, style: style.state, input, air, gauge,
      eligible: !world.controls.steered, clearance, fogClearance: g.pos.y - sky.state.fogHeight,
      collapse: sky.state.pilot.collapse, hazard, warning, lift: lift ?? guide.route,
      hazardActive: sky.state.pilot.danger > 0 || sky.state.pilot.cloud > 0 || sky.state.pilot.gustIn < 6 || world.bells.state.warning >= 0 });
    stats.maxQualification = Math.max(stats.maxQualification, guide.activity.acquireSeconds);
    if (primary?.activity === 'thermalling') stats.firstThermal ??= sky.state.elapsed;
    if (interruptsLift(primary)) guide.reset();
    message = intent.resolve(resolveCoachMessage(primary, { warning }, input), input, world.sky.state.elapsed);
    if (message) {
      stats.shown++; if (message.heading === 'NEXT LIFT') stats.transfers++;
      if (!manual && !pending) {
        const next = followInstruction(message, input);
        if (JSON.stringify(next) !== JSON.stringify(input)) pending = { at: tick + Math.round(delay / RUN.step) + 1, input: next };
      }
    }
    return ended;
  }
  return { world, guide, lessons, stats, step, get message() { return message; }, get input() { return input; } };
}

export function guidedOpening(seed: number, delay: number) {
  const pilot = createVisiblePilot(seed, delay);
  while (pilot.world.sky.state.elapsed < 180 && pilot.world.g.pos.y < 450 && !pilot.stats.assisted) if (pilot.step()) break;
  return { seed, delay, height: pilot.world.g.pos.y, seconds: pilot.world.sky.state.elapsed,
    reason: pilot.world.ended, ...pilot.stats };
}

export function guidedRecovery(seed: number, delay: number, height: number) {
  const pilot = createVisiblePilot(seed, delay), { world } = pilot;
  while (world.g.pos.y < height && world.sky.state.elapsed < 180 && !pilot.stats.assisted) if (pilot.step()) break;
  const departure = { height: world.g.pos.y, seconds: world.sky.state.elapsed };
  let minimumClearance = Infinity, ended = null;
  // Pick a safe, deliberate disturbance on a private copy, then replay those ordinary held
  // controls on the actual flight. This only constructs the loss being tested: after it, every
  // control again comes from visible guidance with the stated reaction delay. No body is moved,
  // no source is modified, and neither the copy nor its controls can rescue the recovery.
  let disturbance = null;
  for (const seconds of [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8]) {
    for (const side of seconds ? [-1, 1] : [0]) {
      const preview = createRunWorld({ sky: createCloudbaseRun() });
      Object.assign(preview.sky.state, structuredClone(world.sky.state));
      copyFlight(preview.g, world.g); preview.steps = world.steps; Object.assign(preview.air, world.air);
      const turns = Math.round(seconds / RUN.step);
      let descendAt = -1;
      for (let tick = 0; tick < 45 * 60; tick++) {
        const turn = tick < turns ? side : 0;
        if (tick >= turns && descendAt < 0 && preview.air.windY! < 1.85) descendAt = tick;
        const failed = stepRun(preview, { turn, brake: tick < turns, bar: tick >= turns && descendAt < 0, ears: descendAt >= 0 });
        const clearance = preview.g.pos.y - surfaceAt(preview.g.pos.x, preview.g.pos.z);
        if (failed || preview.controls.steered || clearance < 40 || preview.g.stall || preview.g.tuck) break;
        if (departure.height - preview.g.pos.y >= 20 && preview.air.windY! < 1.85) {
          if (clearance < 70) break; // leave room to reopen ears before the timed recovery
          const nearby = preview.sky.state.thermals.some(source => source.live && !source.move && source.strength > 0.5 &&
            Math.hypot(preview.g.pos.x - source.x, preview.g.pos.z - source.z) < source.r + 70);
          if (!nearby || !preview.sky.inside(preview.g.pos) || Math.hypot(preview.g.pos.x, preview.g.pos.z - 80) > 250) break;
          disturbance = { side, turns, descendAt, ticks: tick + 1 }; break;
        }
      }
      if (disturbance) break;
    }
    if (disturbance) break;
  }
  if (!disturbance) throw new Error(`No safe 20 m departure found for sky ${seed} at ${height} m`);
  for (let tick = 0; tick < disturbance.ticks && !ended; tick++) {
    const turning = tick < disturbance.turns;
    ended = pilot.step({ ...released(), left: turning && disturbance.side < 0, right: turning && disturbance.side > 0,
      brake: turning, bar: !turning && (disturbance.descendAt < 0 || tick < disturbance.descendAt),
      ears: disturbance.descendAt >= 0 && tick >= disturbance.descendAt });
    minimumClearance = Math.min(minimumClearance, world.g.pos.y - surfaceAt(world.g.pos.x, world.g.pos.z));
  }
  const lost = departure.height - world.g.pos.y, began = world.sky.state.elapsed;
  const returnFrom = { ...world.g.pos };
  // Ending the deliberate descent releases its held controls, exactly as letting go of ears.
  ended ||= pilot.step(released());
  let climbedFor = 0, shown = 0;
  while (!ended && !pilot.stats.assisted && world.sky.state.elapsed - began < 45 && climbedFor < 1) {
    ended = pilot.step(); if (pilot.message) shown++;
    minimumClearance = Math.min(minimumClearance, world.g.pos.y - surfaceAt(world.g.pos.x, world.g.pos.z));
    climbedFor = world.g.vy > 0.2 && world.air.windY! > 1.85 ? climbedFor + RUN.step : 0;
  }
  return { seed, delay, height, departure, disturbance, returnFrom, lost, seconds: world.sky.state.elapsed - began, climbedFor, shown,
    minimumClearance, assisted: pilot.stats.assisted, ended, finalHeight: world.g.pos.y };
}
