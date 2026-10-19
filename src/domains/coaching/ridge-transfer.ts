import type { AirSample, ThermalSource, Vector2, Vector3 } from '../flight/models.ts';
import type { LiftIntercept } from '../flight/glide-math.ts';
import type { CoachingAdapter, FlightObservation, LiftFrame, RidgeTransferState } from './models.ts';
type TransferAdapter = Pick<CoachingAdapter, 'heightAt' | 'inside' | 'cloudDepth' | 'fog'> & {sampleAir?: CoachingAdapter['sampleAir']; sources: () => readonly ThermalSource[]};
interface TransferForecast extends RidgeTransferState {requiredHeight: number; missingHeight: number; seconds: number; key: string; source: ThermalSource}
// Read-only departure readiness. It never selects an action, changes an activity or flies a wing.
import { FLIGHT } from '../flight/flight.ts';
import { movingLiftIntercept } from '../flight/glide-math.ts';

export const RIDGE_TRANSFER = Object.freeze({
  refresh: 0.5, hysteresis: 8, clearance: 15, footprint: 6,
  entryReserve: 25, entryRadius: 25, entrySeconds: 16, entryJoin: 2, lifeReserve: 12,
  maximumSeconds: 60, step: 0.5, turnRate: 0.4, turnLag: 0.8,
  turnSink: FLIGHT.sink.trim + 0.8, useful: FLIGHT.sink.trim + 0.25,
  windChange: 0.35, positionChange: 12, sourceJump: 20,
});
const C = RIDGE_TRANSFER;
const wrap = (value: number): number => Math.atan2(Math.sin(value), Math.cos(value));
const bearing = (from: { x: number; z: number; }, to: { x: number; z: number; }) => Math.atan2(to.x - from.x, -(to.z - from.z));
const empty = (): RidgeTransferState => Object.freeze({ ready: false, targetId: null, generation: null,
  requiredHeight: null, missingHeight: null, seconds: null });
const keyOf = (source: ThermalSource, index: number) => `${typeof (source.id ?? index)}:${source.id ?? index}:${source.generation ?? 0}`;
const remaining = (source: ThermalSource) => Math.min(source.remaining ?? Infinity,
  (source.life ?? Infinity) - (source.age ?? 0), source.edgeFade! >= 0 ? source.edgeFade! : Infinity);
const useful = (source: ThermalSource, index: number) => (source.id ?? index) !== 0 && source.id !== 'launch' && !source.launch &&
  source.live !== false && !(source.move! > 0) && (source.s ?? 5.5) * (source.strength ?? 1) >= C.turnSink + 0.25;

/** Adapter: heightAt, sources, and optional sampleAir, inside, cloudDepth, fog. */
export function createRidgeTransfer(adapter: TransferAdapter) {
  if (typeof adapter?.heightAt !== 'function' || typeof adapter?.sources !== 'function')
    throw new TypeError('ridge transfer requires terrain and live sources');
  // One bounded scratch corridor is reused for every candidate, including its capture circle.
  const stride = 5, maximumPoints = Math.ceil((C.maximumSeconds + C.entrySeconds) / C.step) + 8;
  const corridor = new Float64Array(maximumPoints * stride);
  const point = {} as Vector3, field: AirSample = {}, intercepted = {} as LiftIntercept, shifted = {} as ThermalSource & {vx: number; vz: number}, turnEnd = {} as Vector2;
  let state = empty(), clock = -Infinity, next = -Infinity, selected = '', x = 0, z = 0, wx = 0, wz = 0;
  let sourceX = 0, sourceZ = 0, sourceVX = 0, sourceVZ = 0;

  function reset() {
    state = empty(); clock = next = -Infinity; selected = '';
    x = z = wx = wz = sourceX = sourceZ = sourceVX = sourceVZ = 0;
    return state;
  }
  function headingTurn(g: FlightObservation, source: ThermalSource, wind: Vector2, speed: number) {
    const heading = g.track ?? g.yaw ?? 0;
    let angle = wrap(bearing(g.pos, source) - heading), seconds = 0;
    // Interception includes the source's drift while the pilot first aligns with the glide.
    for (let refinement = 0; refinement < 3; refinement++) {
      seconds = Math.abs(angle) / C.turnRate + C.turnLag;
      turnEnd.x = g.pos.x; turnEnd.z = g.pos.z;
      const count = Math.ceil(seconds / C.step), h = seconds / count;
      for (let n = 0; n < count; n++) {
        const direction = heading + angle * (n + 0.5) / count;
        turnEnd.x += (Math.sin(direction) * FLIGHT.speed.light + wind.x) * h;
        turnEnd.z += (-Math.cos(direction) * FLIGHT.speed.light + wind.z) * h;
      }
      shifted.x = source.x + (source.vx ?? 0) * seconds;
      shifted.z = source.z + (source.vz ?? 0) * seconds;
      shifted.vx = source.vx ?? 0; shifted.vz = source.vz ?? 0;
      movingLiftIntercept(turnEnd, shifted, wind, intercepted, speed);
      // Stronger opposing drift needs more refinements than the visual glide ring. A finite
      // early estimate must not turn an unreachable headwind route into a readiness promise.
      for (let n = 0; n < 5; n++) {
        intercepted.seconds = Math.hypot(shifted.x - turnEnd.x + (shifted.vx - wind.x) * intercepted.seconds,
          shifted.z - turnEnd.z + (shifted.vz - wind.z) * intercepted.seconds) / speed;
        intercepted.x = shifted.x + shifted.vx * intercepted.seconds;
        intercepted.z = shifted.z + shifted.vz * intercepted.seconds;
      }
      const target = Math.atan2(intercepted.x - turnEnd.x - wind.x * intercepted.seconds,
        -(intercepted.z - turnEnd.z - wind.z * intercepted.seconds));
      if (refinement < 2) angle = wrap(target - heading);
    }
    return { angle, seconds, heading };
  }
  function forecast(g: FlightObservation, air: AirSample, source: ThermalSource, index: number, now: number): TransferForecast | null {
    const wind = { x: air.ambientX ?? air.windX ?? 0, z: air.ambientZ ?? air.windZ ?? 0 };
    // A held brake/bar is released for the transfer; do not assume a faster-than-trim glide.
    const speed = Math.min(FLIGHT.speed.trim, Math.max(6, g.speed || FLIGHT.speed.trim));
    const turn = headingTurn(g, source, wind, speed);
    const seconds = turn.seconds + intercepted.seconds;
    if (!Number.isFinite(seconds) || seconds > C.maximumSeconds ||
        remaining(source) < seconds + C.entrySeconds + C.lifeReserve) return null;
    const needed = Math.hypot(intercepted.x - turnEnd.x - wind.x * intercepted.seconds,
      intercepted.z - turnEnd.z - wind.z * intercepted.seconds);
    if (intercepted.seconds > 0 && needed > speed * intercepted.seconds * 1.05) return null;
    if (Math.hypot(wind.x - (source.vx ?? 0), wind.z - (source.vz ?? 0)) >= speed) return null;
    const fog = adapter.fog?.() ?? null;
    let count = 0, loss = 0, elapsed = 0, px = g.pos.x, pz = g.pos.z;
    let fogY = fog?.height ?? -Infinity, required = -Infinity, blocked = false;
    function record(nx: number, nz: number, time: number, heading: number, sink: number) {
      const dt = time - elapsed;
      point.x = nx; point.y = g.pos.y - loss; point.z = nz;
      field.windY = undefined; field.lift = field.sink = 0;
      adapter.sampleAir?.(point, field);
      // Rising en-route air is a bonus, never a reason to advertise an otherwise low transfer.
      const vertical = field.windY ?? ((field.lift || 0) - (field.sink || 0));
      loss += (sink + Math.max(0, -vertical)) * dt;
      if (fog) {
        const before = fog.speedAt?.(fogY, (fog.elapsed ?? now) + elapsed) ?? 0;
        const after = fog.speedAt?.(fogY + before * dt, (fog.elapsed ?? now) + time) ?? 0;
        fogY += (before + after) * dt / 2;
      }
      for (const side of [-1, 0, 1]) {
        point.x = nx + Math.cos(heading) * C.footprint * side;
        point.z = nz + Math.sin(heading) * C.footprint * side;
        point.y = g.pos.y - loss;
        if (adapter.inside && !adapter.inside(point, C.clearance)) blocked = true;
        required = Math.max(required, adapter.heightAt(point.x, point.z) + C.clearance + loss,
          fogY + C.clearance + loss);
      }
      const at = count++ * stride;
      corridor[at] = nx; corridor[at + 1] = nz; corridor[at + 2] = loss;
      corridor[at + 3] = time; corridor[at + 4] = heading;
      elapsed = time;
    }
    record(px, pz, 0, turn.heading, C.turnSink);
    const turning = Math.ceil(turn.seconds / C.step), turnStep = turn.seconds / turning;
    for (let n = 1; n <= turning; n++) {
      const heading = turn.heading + turn.angle * (n - 0.5) / turning;
      px += (Math.sin(heading) * FLIGHT.speed.light + wind.x) * turnStep;
      pz += (-Math.cos(heading) * FLIGHT.speed.light + wind.z) * turnStep;
      record(px, pz, n * turnStep, heading, C.turnSink);
    }
    const fromX = px, fromZ = pz, glide = Math.max(1, Math.ceil(intercepted.seconds / C.step));
    const course = Math.atan2(intercepted.x - px, -(intercepted.z - pz));
    for (let n = 1; n <= glide; n++) record(fromX + (intercepted.x - fromX) * n / glide,
      fromZ + (intercepted.z - fromZ) * n / glide, turn.seconds + intercepted.seconds * n / glide, course, FLIGHT.sink.trim);
    const entry = Math.ceil(C.entrySeconds / C.step), radius = Math.min(C.entryRadius, (source.r ?? 60) * 0.5);
    for (let n = 1; n <= entry; n++) {
      const t = C.entrySeconds * n / entry, joining = t <= C.entryJoin;
      const reach = joining ? radius * t / C.entryJoin : radius;
      const angle = course + 2 * Math.PI * Math.max(0, t - C.entryJoin) / (C.entrySeconds - C.entryJoin);
      record(intercepted.x + (source.vx ?? 0) * t + Math.sin(angle) * reach,
        intercepted.z + (source.vz ?? 0) * t - Math.cos(angle) * reach,
        seconds + t, joining ? course : angle + Math.PI / 2, C.entryReserve / C.entrySeconds);
    }
    if (blocked || !Number.isFinite(required)) return null;
    const key = keyOf(source, index), retaining = selected === key && state.ready;
    required += retaining ? 0 : C.hysteresis;
    // Check clouds at the required departure height as well as the pilot's current height. More
    // height must not be offered as the answer to a route that would enter a cloud at that height.
    for (let n = 0; n < count; n++) {
      const at = n * stride, heading = corridor[at + 4];
      for (const side of [-1, 0, 1]) {
        point.x = corridor[at] + Math.cos(heading) * C.footprint * side;
        point.z = corridor[at + 1] + Math.sin(heading) * C.footprint * side;
        for (const height of [required, Math.max(required, g.pos.y)]) {
          point.y = height - corridor[at + 2];
          if (adapter.cloudDepth && adapter.cloudDepth(point) > 0.1) return null;
        }
      }
    }
    return { ready: g.pos.y >= required, targetId: source.id ?? index, generation: source.generation ?? 0,
      requiredHeight: required, missingHeight: Math.max(0, required - g.pos.y), seconds, key, source };
  }
  function step(dt: number, frame: LiftFrame) {
    if (!(dt > 0) || !frame?.g?.pos) return state;
    const now = Number.isFinite(frame.clock) ? frame.clock! : Number.isFinite(clock) ? clock + dt : 0;
    if (now < clock) reset();
    if (now === clock) return state;
    clock = now;
    const { g, air = {} } = frame;
    if (g.stall! > 0 || g.tuck! > 0 || g.ears! > 0.1 || Math.abs(g.bank! || 0) > 0.9 || Math.abs(g.pitch! || 0) > 0.7) {
      selected = ''; next = -Infinity; state = empty(); return state;
    }
    const sources = adapter.sources(), windX = air.ambientX ?? air.windX ?? 0, windZ = air.ambientZ ?? air.windZ ?? 0;
    const current = sources.find((source, index) => keyOf(source, index) === selected);
    const invalid = !!selected && (!current || !useful(current, sources.indexOf(current)) ||
      remaining(current) < (state.seconds ?? 0) + C.entrySeconds + C.lifeReserve ||
      Math.hypot(current.x - sourceX, current.z - sourceZ) > C.sourceJump ||
      Math.hypot((current.vx ?? 0) - sourceVX, (current.vz ?? 0) - sourceVZ) >= C.windChange);
    if (!invalid && now < next && Math.hypot(windX - wx, windZ - wz) < C.windChange &&
        Math.hypot(g.pos.x - x, g.pos.z - z) < C.positionChange) return state;
    let best: TransferForecast | null = null, retained: TransferForecast | null = null;
    for (let index = 0; index < sources.length; index++) {
      const source = sources[index];
      if (!useful(source, index)) continue;
      const result = forecast(g, air, source, index, now);
      if (!result) continue;
      if (result.key === selected) retained = result;
      if (!best || result.ready && !best.ready || result.ready === best.ready && result.requiredHeight < best.requiredHeight) best = result;
    }
    if (retained && (retained.ready || best && retained.ready === best.ready && retained.requiredHeight <= best.requiredHeight + C.hysteresis)) best = retained;
    next = now + C.refresh; x = g.pos.x; z = g.pos.z; wx = windX; wz = windZ;
    selected = best?.key ?? ''; sourceX = best?.source.x ?? 0; sourceZ = best?.source.z ?? 0;
    sourceVX = best?.source.vx ?? 0; sourceVZ = best?.source.vz ?? 0;
    state = best ? Object.freeze({ ready: best.ready, targetId: best.targetId, generation: best.generation,
      requiredHeight: best.requiredHeight, missingHeight: best.missingHeight, seconds: best.seconds }) : empty();
    return state;
  }
  return { step, reset, get state() { return state; } };
}
