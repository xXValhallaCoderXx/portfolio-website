import type { FlightInput, Vector3 } from '../../domains/flight/models.ts';
import type { CoachMessage } from '../../domains/coaching/models.ts';
import type { LessonId } from '../../domains/good-lift/trick-lessons.ts';
import { createFlight, stepFlight } from '../../domains/flight/flight.ts';
import { createSwingWatch } from '../../domains/coaching/swing-watch.ts';
import { createStyle } from '../../domains/good-lift/meet-style.ts';
import { createTrickLessons } from '../../domains/good-lift/trick-lessons.ts';
import { createRecorder, encodeLog, frameInput, inputFrame } from '../../domains/good-lift/recorder.ts';
import { SIM_VERSION } from '../../domains/good-lift/sim-version.ts';
import { DIRECT_STEP, directBrakes } from './test-direct-flight.ts';
import { brakeSnapshot } from './test-brake-replay.ts';

type LessonWorld = { g: ReturnType<typeof createFlight>; watch: ReturnType<typeof createSwingWatch>; style: ReturnType<typeof createStyle> };
/** Canonical bodies, canopy, envelope and judges, without the solver's ephemeral scratch arrays. */
export function directLessonSnapshot(world: LessonWorld) {
  const snapshot = brakeSnapshot(world);
  // Peak measurements come from inverse-trig projections of the exact bodies. Preserve event
  // counts, bands, timestamps, scores and physical bodies exactly across V8 platforms.
  for (const key of ['front', 'back', 'caughtPeak', 'top', 'moveSize'])
    snapshot.watch[key] = Math.round(snapshot.watch[key] * 1e11) / 1e11;
  snapshot.style.deepest = Math.round(snapshot.style.deepest * 1e11) / 1e11;
  return { ...snapshot, loops: world.g.loops };
}

/** The visible paired targets, with the same working-brake recovery shortcut as the input UI. */
export function followDirectLesson(message: CoachMessage): FlightInput {
  if (message.brakeTargets) return directBrakes(message.brakeTargets.left, message.brakeTargets.right);
  if (message.action === 'deep-brake') return directBrakes(1);
  if (message.action === 'brake') return directBrakes(0.6);
  return directBrakes();
}

/** Isolated high-air lesson in canonical byte controls. Never injects an angle, force or result. */
export function captureDirectLesson(kind: LessonId, side: number, delay: number) {
  const origin = { x: 0, y: 1100, z: 0 }, air = { windY: 5.5 };
  const g = createFlight({ ...origin }), watch = createSwingWatch(), style = createStyle(), controls = directBrakes();
  const world = { g, watch, style, controls }, recorder = createRecorder();
  const learned: string[] = [], phases = new Set<string>();
  const checkpoints: Array<{ step: number; snapshot: ReturnType<typeof directLessonSnapshot> }> = [];
  const messages: Array<{ step: number; phase: string; title: string; accepted: boolean; targets: CoachMessage['brakeTargets'] }> = [];
  const lessons = createTrickLessons({ learned: () => kind === 'pitch' ? [] : kind === 'wingover' ? ['pitch'] : ['pitch', 'wingover'],
    onLearned: id => learned.push(id) });
  let input = side < 0 ? directBrakes(0.5, 0.2) : directBrakes(0.2, 0.5);
  let pending: { at: number; input: FlightInput } | null = null, started = false, lastMessage = '', lastMove = 0;
  let stalls = 0, tucks = 0, minimumHeight = origin.y;
  for (let tick = 0; tick < 60 * 60; tick++) {
    if (pending && tick >= pending.at) { input = pending.input; pending = null; }
    const frame = inputFrame(input);
    recorder.push(frame); frameInput(frame, controls);
    stepFlight(g, controls, air, DIRECT_STEP); watch.step(DIRECT_STEP, g, false, controls); style.step(DIRECT_STEP, world);
    stalls += Number(g.stall > 0); tucks += Number(g.tuck > 0); minimumHeight = Math.min(minimumHeight, g.pos.y);
    let changed = false;
    if (tick >= 600) {
      const message = lessons.step(DIRECT_STEP, { g, watch: watch.state, style: style.state, input: controls, air,
        clearance: g.pos.y, fogClearance: g.pos.y, eligible: true });
      started ||= lessons.state.active === kind;
      if (message?.phase) phases.add(message.phase);
      if (message) {
        const key = `${message.phase}:${message.title}`;
        if (key !== lastMessage) {
          messages.push({ step: recorder.steps, phase: message.phase ?? '', title: message.title,
            accepted: !!message.accepted, targets: message.brakeTargets });
          lastMessage = key; changed = true;
        }
        if (!pending) {
          const next = followDirectLesson(message);
          if (next.leftBrake !== input.leftBrake || next.rightBrake !== input.rightBrake)
            pending = { at: tick + Math.round(delay / DIRECT_STEP) + 1, input: next };
        }
      }
    }
    if (recorder.steps === 1 || recorder.steps % 600 === 0 || changed || watch.state.moves !== lastMove || lessons.state.phase === 'banked')
      checkpoints.push({ step: recorder.steps, snapshot: directLessonSnapshot(world) });
    lastMove = watch.state.moves;
    if (lessons.state.phase === 'banked') break;
  }
  const link = encodeLog({ simVersion: SIM_VERSION, seed: 0, total: style.state.total, peak: origin.y }, recorder.bits, recorder.steps);
  return { kind, side, delay, pureFlight: true, simVersion: SIM_VERSION, origin, air, steps: recorder.steps,
    frames: [...recorder.bits], link, started, learned, phases: [...phases], messages,
    lesson: { ...lessons.state, learned: [...lessons.state.learned] },
    metrics: { stalls, tucks, minimumHeight }, checkpoints, snapshot: directLessonSnapshot(world) };
}

interface DirectLessonReplay { origin: Vector3; air: { windY: number }; checkpoints: readonly { step: number }[] }

/** Replays frozen canonical frames without consulting the lesson controller or its scripted pilot. */
export function replayDirectLesson(record: DirectLessonReplay, frames: ArrayLike<number>) {
  const g = createFlight({ ...record.origin }), watch = createSwingWatch(), style = createStyle(), controls = directBrakes();
  const world = { g, watch, style, controls }, wanted = new Set(record.checkpoints.map(check => check.step));
  const checkpoints = [];
  for (let tick = 0; tick < frames.length; tick++) {
    frameInput(frames[tick], controls);
    stepFlight(g, controls, record.air, DIRECT_STEP); watch.step(DIRECT_STEP, g, false, controls); style.step(DIRECT_STEP, world);
    if (wanted.has(tick + 1)) checkpoints.push({ step: tick + 1, snapshot: directLessonSnapshot(world) });
  }
  return { checkpoints, snapshot: directLessonSnapshot(world) };
}
