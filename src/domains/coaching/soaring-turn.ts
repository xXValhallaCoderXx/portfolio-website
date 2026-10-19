// Reactive advice for a manual brake turn. Forecasts use copies of the real wing and read-only air.
import { copyFlight, createFlight, FLIGHT, stepFlight } from '../flight/flight.ts';
import { actionMessage } from './coach-actions.ts';
import { createControlSummary } from '../flight/brake-controls.ts';
import { heldControls } from '../flight/thermal-centering.ts';
import type { AirSample, ControlSummary, FlightInput, FlightState, Vector3 } from '../flight/models.ts';
import type { CoachMessage, CoachingAdapter, LiftFrame } from './models.ts';
export interface TurnForecast {safe: boolean; supported: boolean; seconds: number; drop: number; gain?: number}
export interface SoaringTurnState {active: boolean; supported: boolean; phase: string; dir: number; progress: number; forecast: TurnForecast | null; message: CoachMessage | null}

export const SOARING_TURN = Object.freeze({
  useful: FLIGHT.sink.trim + 0.25, searchEvery: 0.25, step: 1 / 60,
  horizon: 18, exit: 2, clearance: 15, footprint: 6, boundary: 20,
  maximumDrop: 6, netLoss: 2, rolloutLead: 1.15, duration: 20,
  levelBank: 0.14, levelRate: 0.12, rollout: 2.5,
});
const C = SOARING_TURN;
const wrap = (value: number): number => Math.atan2(Math.sin(value), Math.cos(value));
const vertical = (air: AirSample) => air.windY ?? ((air.lift || 0) - (air.sink || 0));
const sideName = (side: number): 'left' | 'right' => side < 0 ? 'left' : 'right';

export function createSoaringTurn(adapter: CoachingAdapter) {
  let clock = -Infinity, started = 0, searchAt = -Infinity, dir = 0, progress = 0, previousTrack = 0;
  let blocked = false, rollingAt: number | null = null, supported = false, forecast: TurnForecast | null = null, state: SoaringTurnState | null = null;
  const projected = createFlight(), air: AirSample = {}, wingPoint = {} as Vector3;
  const observeControls = createControlSummary();
  function publish(message: CoachMessage | null = null) {
    state = Object.freeze({ active: !!dir, supported: !!dir && supported,
      phase: rollingAt === null ? dir ? 'turn' : 'idle' : 'rollout', dir, progress,
      forecast, message });
    return state!;
  }
  function reset() {
    observeControls.reset();
    clock = searchAt = -Infinity; started = progress = previousTrack = 0;
    dir = 0; rollingAt = null; blocked = supported = false; forecast = null;
    return publish();
  }
  function clear(waitForRelease: boolean) {
    dir = 0; progress = 0; rollingAt = null; supported = false; forecast = null;
    blocked = waitForRelease;
  }
  function pointSafe(pos: Vector3, fog: number | undefined) {
    return pos.y > adapter.heightAt(pos.x, pos.z) + C.clearance &&
      (!adapter.inside || adapter.inside(pos, C.boundary)) &&
      (!adapter.cloudDepth || adapter.cloudDepth(pos) <= 0.1) &&
      (!fog || pos.y > fog + C.clearance);
  }
  function safe(g: import('./models.ts').FlightObservation, fog: number | undefined) {
    if (!pointSafe(g.pos, fog)) return false;
    const heading = g.track ?? g.yaw ?? 0;
    for (const side of [-1, 1]) {
      wingPoint.x = g.pos.x + Math.cos(heading) * C.footprint * side;
      wingPoint.y = g.pos.y;
      wingPoint.z = g.pos.z + Math.sin(heading) * C.footprint * side;
      if (!pointSafe(wingPoint, fog)) return false;
    }
    return true;
  }
  function predict(g: FlightState, currentAir: AirSample, input: FlightInput): TurnForecast {
    copyFlight(projected, g);
    const fog = adapter.fog?.();
    let fogY = fog?.height ?? -Infinity;
    let arc = progress, lastTrack = projected.track, releasedAt: number | null = null;
    let minimum = g.pos.y, rising = 0, ticks = 0;
    for (let n = 1; n <= Math.ceil(C.horizon / C.step); n++) {
      const t = n * C.step;
      if (releasedAt === null && arc >= Math.PI - Math.abs(projected.trackRate || 0) * C.rolloutLead) releasedAt = t;
      Object.assign(air, currentAir);
      adapter.sampleAir(projected.pos, air);
      const controls: FlightInput = input.controlMode === 'brakes' ? releasedAt === null ? heldControls(input)
        : { controlMode: 'brakes', leftBrake: 0, rightBrake: 0, bar: false, ears: false }
        : { turn: releasedAt === null ? dir : 0, brake: releasedAt === null, deepBrake: false, bar: false, ears: false };
      stepFlight(projected, controls, air, C.step);
      arc += wrap(projected.track - lastTrack) * dir; lastTrack = projected.track;
      minimum = Math.min(minimum, projected.pos.y);
      rising += vertical(air) >= C.useful ? 1 : 0; ticks++;
      if (fog) fogY += (fog.speedAt?.(projected.pos.y, (fog.elapsed ?? clock) + t) ?? 0) * C.step;
      if (!safe(projected, fogY) || projected.stall > 0 || projected.tuck > 0 || projected.loop ||
          g.pos.y - minimum > C.maximumDrop)
        return Object.freeze({ safe: false, supported: false, seconds: t, drop: g.pos.y - minimum });
      if (releasedAt !== null && t - releasedAt >= C.exit) return Object.freeze({ safe: true,
        supported: rising / ticks >= 0.7 && projected.pos.y >= g.pos.y - C.netLoss,
        seconds: t, drop: g.pos.y - minimum, gain: projected.pos.y - g.pos.y });
    }
    return Object.freeze({ safe: false, supported: false, seconds: C.horizon, drop: g.pos.y - minimum });
  }
  function step(dt: number, frame: LiftFrame) {
    if (!(dt > 0) || !frame?.g?.pos) return state!;
    const now = Number.isFinite(frame.clock) ? frame.clock! : Number.isFinite(clock) ? clock + dt : 0;
    if (now < clock) reset();
    if (now === clock) return state!;
    clock = now;
    const { g, air: currentAir = {}, input = {} } = frame;
    const summarized = observeControls.step(input);
    const effective = (input.controlMode === 'brakes' ? summarized : input) as FlightInput & Partial<ControlSummary>;
    const turn = Number(!!effective.right) - Number(!!effective.left);
    const chord = (input.controlMode === 'brakes' ? effective.maxBrake! >= 0.15 && effective.maxBrake! <= 0.45 : !!input.brake) &&
      !!turn && !effective.deepBrake && !effective.ears && !effective.bar;
    if (!chord) blocked = false;
    if (frame.suspended || frame.eligible === false || frame.activity === 'thermal' ||
        effective.deepBrake || g.deepBrake || g.acro || g.stall! > 0 ||
        g.tuck! > 0 || g.loop || g.ears! > 0.1 || Math.abs(g.bank! || 0) > 0.9 || Math.abs(g.pitch! || 0) > 0.7) {
      clear(chord); return publish();
    }
    const fog = adapter.fog?.();
    if (!safe(g as FlightState, fog?.height)) { clear(chord); return publish(); }
    if (!dir) {
      if (!chord || blocked || clock < searchAt || vertical(currentAir) < C.useful) return publish();
      dir = turn; started = now; previousTrack = g.track!; progress = 0; searchAt = -Infinity;
    }
    progress += wrap(g.track! - previousTrack) * dir; previousTrack = g.track!;
    if (now - started > C.duration) { clear(chord); return publish(); }
    if (chord && turn !== dir) { clear(false); searchAt = -Infinity; return publish(); }
    if (!chord && rollingAt === null) rollingAt = now;
    if (rollingAt !== null) {
      if (now - rollingAt > C.rollout || (Math.abs(g.bank! || 0) < C.levelBank && Math.abs(g.trackRate || 0) < C.levelRate)) {
        clear(false); return publish();
      }
      const message = actionMessage({ state: 'soaring', context: 'soaring turn', activity: 'soaring-turn', brakeDepth: 'working', phase: 'level',
        action: 'straight', title: 'RELEASE TO LEVEL', hold: [], release: ['left', 'right', 'brake', 'bar'],
        detail: 'Let the wing level; keep the line you chose.' }, input);
      return publish(message);
    }
    if (clock >= searchAt) {
      forecast = predict(g as FlightState, currentAir, input); supported = forecast.safe && forecast.supported;
      searchAt = clock + C.searchEvery;
    }
    if (!supported) { const unsafe = !forecast?.safe; clear(unsafe); return publish(); }
    const arcComplete = progress >= Math.PI - Math.abs(g.trackRate || 0) * C.rolloutLead;
    const message = actionMessage({ state: 'soaring', context: 'soaring turn', activity: 'soaring-turn', brakeDepth: 'working',
      phase: arcComplete ? 'level' : progress < 0.3 ? 'entry' : 'turn',
      action: arcComplete ? 'straight' : sideName(dir),
      ...(arcComplete ? { title: 'RELEASE TO LEVEL', hold: [], release: ['left', 'right', 'brake', 'bar'] }
        : { hold: [sideName(dir), 'brake'], release: [sideName(-dir), 'bar'] }),
      detail: arcComplete ? 'Release before alignment; momentum finishes the return onto your new line.' :
        'Hold brake with the turn. The rising air supports this arc; release when you reach your chosen line.' }, input);
    return publish(message);
  }
  reset();
  return { step, reset, get state() { return state!; } };
}
