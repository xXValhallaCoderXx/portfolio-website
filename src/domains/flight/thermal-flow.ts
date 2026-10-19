import type { ThermalSource, Vector2 } from './models.ts';
export interface ThermalFlowState { observations: ReturnType<typeof observation>[]; source: number; generation: number; dir: number; sense: number; against: number; matching: number; gap: number; challenger: number; challengerGeneration: number; challenge: number; pressure: boolean }
interface FlowCandidate { id: number; generation: number; own: number; dir: number; sense: number }
// Actual traffic around a moving source. Plain state travels with a copied/replayed sky;
// controls, coach messages and rendering never decide whether an orbit is against the flock.
import { thermalProfile } from './atmosphere.ts';

export const THERMAL_FLOW = Object.freeze({ useful: 1.5, reach: 0.9, radius: 6,
  speed: 4, turnRate: 0.08, orbitRate: 0.04, maximumRate: 1.5,
  improvement: 1.2, switchFor: 1, grace: 3, gap: 0.5, clearFor: 0.5, pressureRate: 1.5 });
const C = THERMAL_FLOW;
const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
const observation = () => ({ generation: -1, angle: 0, course: 0, near: 0, valid: false });

export function createThermalFlowState(count: number) {
  const state = { observations: Array.from({ length: count }, observation) } as ThermalFlowState;
  resetThermalFlow(state);
  return state;
}
export function resetThermalFlow(state: Pick<ThermalFlowState, 'observations'>): asserts state is ThermalFlowState {
  Object.assign(state, { source: -1, generation: -1, dir: 0, sense: 0, against: 0,
    matching: 0, gap: 0, challenger: -1, challengerGeneration: -1, challenge: 0, pressure: false });
  for (const previous of state.observations) Object.assign(previous, observation());
}
export function thermalFlowLift(source: ThermalSource, pos: Vector2) {
  const near = Math.hypot(pos.x - source.x, pos.z - source.z);
  if (source.live === false || source.move! > 0 || source.scatter! > 0 || source.remaining! <= 0 ||
      near >= (source.r ?? 60) * C.reach) return 0;
  return (source.s ?? 5.5) * (source.strength ?? 1) * thermalProfile(near, source.r ?? 60, source.fade ?? 1);
}

export function stepThermalFlow(state: ThermalFlowState, dt: number, pos: Vector2, thermals: readonly ThermalSource[], vx: number, vz: number, eligible = true) {
  if (!(dt > 0)) return state;
  if (!eligible) { resetThermalFlow(state); return state; }
  const candidates: FlowCandidate[] = [];
  for (let id = 0; id < thermals.length; id++) {
    const source = thermals[id], previous = state.observations[id];
    const own = thermalFlowLift(source, pos), generation = source.generation ?? 0;
    const near = Math.hypot(pos.x - source.x, pos.z - source.z);
    const angle = Math.atan2(pos.x - source.x, -(pos.z - source.z));
    const dx = vx - (source.vx ?? 0), dz = vz - (source.vz ?? 0);
    const course = Math.atan2(dx, -dz), arc = wrap(angle - previous.angle);
    const rate = wrap(course - previous.course) / dt;
    const coherent = previous.valid && previous.generation === generation &&
      near >= C.radius && previous.near >= C.radius && Math.hypot(dx, dz) >= C.speed &&
      Math.abs(arc) >= C.orbitRate * dt && Math.abs(arc) <= C.maximumRate * dt &&
      Math.abs(rate) >= C.turnRate && Math.abs(rate) <= C.maximumRate && Math.sign(rate) === Math.sign(arc);
    Object.assign(previous, { generation, angle, course, near, valid: own >= C.useful });
    if (own >= C.useful) candidates.push({ id, generation, own, dir: id ? Math.sign(source.dir || 1) : 0,
      sense: coherent && id ? Math.sign(arc) === Math.sign(source.dir || 1) ? 1 : -1 : 0 });
  }
  let current: FlowCandidate | null | undefined = candidates.find(item => item.id === state.source && item.generation === state.generation);
  const best = candidates.reduce<FlowCandidate | null>((a, b) => !a || b.own > a.own ? b : a, null);
  if (!current) {
    current = best;
    state.against = state.matching = state.gap = state.challenge = 0;
    state.challenger = state.challengerGeneration = -1; state.pressure = false;
  } else if (best && best.id !== current.id && best.own >= current.own * C.improvement) {
    if (state.challenger !== best.id || state.challengerGeneration !== best.generation) {
      state.challenger = best.id; state.challengerGeneration = best.generation; state.challenge = 0;
    }
    state.challenge += dt;
    if (state.challenge + 1e-9 >= C.switchFor) {
      current = best; state.against = state.matching = state.gap = state.challenge = 0;
      state.challenger = state.challengerGeneration = -1; state.pressure = false;
    }
  } else { state.challenger = state.challengerGeneration = -1; state.challenge = 0; }
  state.source = current?.id ?? -1; state.generation = current?.generation ?? -1;
  state.dir = current?.dir ?? 0; state.sense = current?.sense ?? 0;
  if (state.sense < 0) {
    state.gap = state.matching = 0;
    state.against += dt;
    if (state.against + 1e-9 >= C.grace) state.pressure = true;
  } else if (state.sense > 0) {
    state.matching += dt; state.gap = 0;
    if (state.matching + 1e-9 >= C.clearFor) { state.against = 0; state.pressure = false; }
  } else {
    state.matching = 0; state.gap += dt;
    if (state.gap > C.gap + 1e-9) { state.against = 0; state.pressure = false; }
  }
  return state;
}
