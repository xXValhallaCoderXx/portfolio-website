import type { FlightInput } from '../../domains/flight/models.ts';
import type { CoachMessage } from '../../domains/coaching/models.ts';
import { createCloudbaseRun } from '../../domains/good-lift/cloudbase-state.ts';
import { createRunWorld, startRun, stepFrame, RUN } from '../../domains/good-lift/run-step.ts';
import { createMeet } from '../../domains/good-lift/meet-state.ts';
import { createBells } from '../../domains/good-lift/bells.ts';
import { createStyle } from '../../domains/good-lift/meet-style.ts';
import { inputFrame } from '../../domains/good-lift/recorder.ts';
import { createLiftGuide } from '../../domains/coaching/lift-guide.ts';
import { createTrickLessons } from '../../domains/good-lift/trick-lessons.ts';
import { actionMessage } from '../../domains/coaching/coach-actions.ts';
import { interruptsLift, resolveCoachMessage } from '../../domains/coaching/coach-routing.ts';
import { createRunCoachEnvironment, runCoachHazard, runCoachWarning } from '../../features/good-lift/services/coach-run.service.ts';
import { coachDragTarget } from '../../features/flight/presentation/flight-cues.ts';
import { surfaceAt } from '../../domains/flight/ground.ts';
import { directBrakes } from './test-direct-flight.ts';
import { createCoachIntent } from '../../domains/coaching/coach-intent.ts';

/** Literal visible handle targets and keyboard demands, never a hidden route or source target. */
export function followDirectInstruction(message: CoachMessage, input: FlightInput): FlightInput {
  const circle = message.context === 'thermal' && (['circle', 'ease'].includes(message.phase ?? '') ||
    message.hold.includes('brake') || message.brakeDepth === 'working');
  let next: FlightInput;
  if (message.brakeTargets) next = directBrakes(message.brakeTargets.left, message.brakeTargets.right);
  else if (message.action === 'none' || message.action.startsWith('prepare-')) next = input;
  else if (message.action === 'deep-brake') next = directBrakes(1);
  else if (message.action === 'brake') next = directBrakes(0.6);
  else if (message.action === 'left') next = circle ? directBrakes(0.5, 0.2) : directBrakes(0.3, 0);
  else if (message.action === 'right') next = circle ? directBrakes(0.2, 0.5) : directBrakes(0, 0.3);
  else next = circle && message.action === 'straight' && !message.release.includes('brake') ? directBrakes(0.2) : directBrakes();
  if (actionMessage(message, next).accepted) return next;
  const target = coachDragTarget(message, 'touch', input);
  const candidates = [target && directBrakes(target.leftBrake, target.rightBrake), directBrakes(), directBrakes(0.2),
    directBrakes(0.3, 0), directBrakes(0, 0.3), directBrakes(0.5, 0.2), directBrakes(0.2, 0.5), directBrakes(0.6), directBrakes(1), input];
  const accepted = candidates.find((pair): pair is FlightInput => !!pair && actionMessage(message, pair).accepted);
  if (!accepted) throw new Error(`No visible direct input satisfies ${message.context}/${message.phase}/${message.action}`);
  return accepted;
}

/** A canonical live run driven only by the visible coach, with an explicit human reaction delay. */
export function createVisibleDirectPilot(seed: number, delay = 0.3) {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells(), style: createStyle() }), seed);
  const guide = createLiftGuide(createRunCoachEnvironment(world.sky));
  const intent = createCoachIntent();
  // Measure access to acro height independently of spending it on an automatic lesson.
  const lessons = createTrickLessons({ learned: () => ['pitch', 'wingover', 'loop'] });
  let input: FlightInput = directBrakes(), pending: { at: number; input: FlightInput } | null = null;
  let message: CoachMessage | null = null;
  const stats = { minimumClearance: Infinity, assisted: false, shown: 0, followed: 0, firstThermal: null as number | null,
    reached: {} as Record<number, number>, peak: 100 };
  function step() {
    const tick = world.steps;
    if (pending && tick >= pending.at) { input = pending.input; pending = null; }
    const ended = stepFrame(world, inputFrame(input));
    const { g, sky, watch, style, air } = world;
    const clearance = g.pos.y - surfaceAt(g.pos.x, g.pos.z);
    stats.minimumClearance = Math.min(stats.minimumClearance, clearance);
    stats.assisted ||= !!world.controls.steered;
    stats.peak = Math.max(stats.peak, g.pos.y);
    for (const height of [450, 500, 750, 1000]) if (g.pos.y >= height) stats.reached[height] ??= sky.state.elapsed;
    const lift = guide.step(RUN.step, { g, air, input: world.intent, clock: sky.state.elapsed,
      suspended: interruptsLift(message) || sky.state.pilot.collapse > 0 });
    const hazard = runCoachHazard(world), warning = runCoachWarning(world);
    const primary = lessons.step(RUN.step, { g, watch: watch.state, style: style?.state, input: world.intent, air,
      eligible: !world.controls.steered, clearance, fogClearance: g.pos.y - sky.state.fogHeight,
      collapse: sky.state.pilot.collapse, hazard, warning, lift: lift ?? guide.route,
      hazardActive: sky.state.pilot.danger > 0 || sky.state.pilot.cloud > 0 || sky.state.pilot.gustIn < 6 || world.bells!.state.warning >= 0 });
    if (primary?.activity === 'thermalling') stats.firstThermal ??= sky.state.elapsed;
    if (interruptsLift(primary)) guide.reset();
    message = intent.resolve(resolveCoachMessage(primary, { warning }, world.intent), world.intent, sky.state.elapsed);
    if (message) {
      stats.shown++;
      if (!pending) {
        const next = followDirectInstruction(message, input);
        stats.followed++;
        if (next.leftBrake !== input.leftBrake || next.rightBrake !== input.rightBrake)
          pending = { at: tick + Math.round(delay / RUN.step) + 1, input: next };
      }
    }
    return ended;
  }
  return { world, stats, step, get input() { return input; }, get message() { return message; } };
}

export function guidedDirectOpening(seed: number, delay: number, { height = 450, seconds = 180 } = {}) {
  const pilot = createVisibleDirectPilot(seed, delay);
  while (pilot.world.sky.state.elapsed < seconds && pilot.world.g.pos.y < height && !pilot.stats.assisted)
    if (pilot.step()) break;
  return { seed, delay, height: pilot.world.g.pos.y, seconds: pilot.world.sky.state.elapsed,
    reason: pilot.world.ended, stalls: pilot.world.stalls, tucks: pilot.world.tucks,
    strikes: pilot.world.sky.state.pilot.strikes, ...pilot.stats };
}
