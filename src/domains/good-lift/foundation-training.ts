import type { AirSample, FlightInput, FlightState, HeightSampler, ThermalSource, Vector3 } from '../flight/models.ts';
import type { CoachFields } from '../coaching/models.ts';
import { createLiftGuide } from '../coaching/lift-guide.ts';
import { LIFT_ACTIVITY } from '../coaching/lift-activity.ts';
import { sampleAtmosphere } from '../flight/atmosphere.ts';
import { PHYSICS } from '../flight/flight-physics.ts';
import type { FoundationLessonId } from '../coaching/training-catalog.ts';

export const FOUNDATION = Object.freeze({
  origin: Object.freeze({ x: 0, y: 1100, z: 0 }),
  thermalOrigin: Object.freeze({ x: 0, y: 1100, z: 125 }),
  turnBank: Math.PI / 18, sharpTurnBank: Math.PI / 9, turnCourse: Math.PI / 12, orbit: Math.PI * 2, gain: 10,
});
export interface FoundationState {
  lesson: FoundationLessonId; phase: string; complete: boolean; progress: number;
  course: number; speedDrop: number; orbit: number; gain: number; qualified: boolean;
}
type TrainingSource = ThermalSource & { id: string; generation: number; r: number; s: number; dir: number };
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const released = (input: FlightInput) => Math.max(input.leftBrake ?? 0, input.rightBrake ?? 0) <= .04 && !input.bar && !input.ears;
const actualReleased = (g: FlightState) => Math.max(g.leftBrake, g.rightBrake) / PHYSICS.deepBrake <= .05;
const steady = (g: FlightState, input: FlightInput) => released(input) && actualReleased(g) &&
  Math.abs(g.bank) < Math.PI / 36 && Math.abs(g.rollRate) < .1 &&
  Math.abs(g.pitch) < Math.PI / 18 && Math.abs(g.pitchRate) < .3;
const airspeed = (g: FlightState, air: AirSample) => Math.hypot(g.pilot.vel.x - (air.windX ?? 0), g.pilot.vel.z - (air.windZ ?? 0));

/** Foundation observers teach the real wing. They request controls but never write them. */
export function createFoundationTraining(heightAt: HeightSampler) {
  const state: FoundationState = { lesson: 'steering', phase: 'level', complete: false, progress: 0,
    course: 0, speedDrop: 0, orbit: 0, gain: 0, qualified: false };
  let sources: TrainingSource[] = [], side = 1, stable = 0, previousCourse = 0, baselineSpeed = 0;
  let orbitKey = '', previousAngle = 0, orbitHeight = 0, previousOrbitCourse = 0;
  function sampleAir(pos: Vector3, out: AirSample = {}) {
    Object.assign(out, { windX: 0, windY: 0, windZ: 0, lift: 0, sink: 0, liftSide: 0, rough: 0,
      hazardSink: 0, ridge: 0, lee: 0, thermal: 0, ambientX: 0, ambientZ: 0, crestHeight: 0, calm: false });
    if (state.lesson === 'thermal') sampleAtmosphere(pos, { windX: 0, windZ: 0, thermals: sources }, out);
    out.clearance = pos.y - heightAt(pos.x, pos.z);
    return out;
  }
  const guide = createLiftGuide({ heightAt, sampleAir, sources: () => sources, navigation: true });
  function reset() {
    sources = []; stable = 0; orbitKey = ''; guide.reset();
    Object.assign(state, { phase: 'level', complete: false, progress: 0, course: 0, speedDrop: 0, orbit: 0, gain: 0, qualified: false });
  }
  function begin(lesson: FoundationLessonId, direction: number, g: FlightState) {
    reset(); state.lesson = lesson; side = Math.sign(direction) || 1; previousCourse = g.track;
    if (lesson === 'thermal') sources = [{ id: 'training-thermal', generation: 1, x: 0, z: 0, r: 110, s: 5.5,
      fade: 1, strength: 1, remaining: Infinity, live: true, dir: side, vx: 0, vz: 0, flock: false }];
  }
  function phase(next: string, g: FlightState, air: AirSample) {
    state.phase = next; stable = 0; state.course = state.progress = 0; previousCourse = g.track;
    if (next === 'brake') baselineSpeed = airspeed(g, air);
  }
  function fields(title: string, detail: string, left = 0, right = 0): CoachFields {
    return { state: 'lesson', owner: 'lesson', lessonId: state.lesson, context: state.lesson === 'thermal' ? 'thermal' : 'Steering & braking',
      phase: state.phase, title, detail, action: left === right ? left ? 'brake' : 'release-all' : left > right ? 'left' : 'right',
      hold: [], release: [], brakeTargets: { left, right, tolerance: .07 }, progress: state.progress, canCancelLesson: false };
  }
  function finish(): CoachFields {
    state.complete = true; state.phase = 'complete'; state.progress = 1;
    return { ...fields('LESSON COMPLETE', 'Retry this lesson or choose another.'), state: 'banked', action: 'none', brakeTargets: undefined };
  }
  function steering(dt: number, g: FlightState, input: FlightInput, air: AirSample): CoachFields {
    const sharp = state.phase === 'turn-sharp';
    const turning = state.phase === 'turn-first' || state.phase === 'turn-second' || sharp;
    const direction = state.phase === 'turn-first' ? -side : side;
    if (turning) {
      state.course += wrap(g.track - previousCourse) * direction;
      previousCourse = g.track;
      const bank = sharp ? FOUNDATION.sharpTurnBank : FOUNDATION.turnBank;
      const actual = (direction < 0 ? g.leftBrake : g.rightBrake) / PHYSICS.deepBrake;
      const stronger = !sharp || actual >= .72 && (direction < 0 ? input.leftBrake ?? 0 : input.rightBrake ?? 0) >= .75 &&
        (direction < 0 ? input.rightBrake ?? 0 : input.leftBrake ?? 0) <= .04 && !input.bar && !input.ears;
      state.progress = clamp(Math.min(state.course / FOUNDATION.turnCourse, g.bank * direction / bank, sharp ? actual / .72 : 1));
      if (state.course >= FOUNDATION.turnCourse && g.bank * direction >= bank && stronger)
        phase(sharp ? 'release-sharp' : state.phase === 'turn-first' ? 'release-first' : 'release-second', g, air);
    } else if (state.phase === 'brake') {
      state.speedDrop = baselineSpeed - airspeed(g, air);
      const actual = Math.min(g.leftBrake, g.rightBrake) / PHYSICS.deepBrake;
      const matching = Math.abs((input.leftBrake ?? 0) - .60) < .08 && Math.abs((input.rightBrake ?? 0) - .60) < .08 && !input.bar && !input.ears;
      stable = matching && actual >= .5 && state.speedDrop >= 1 ? stable + dt : 0;
      state.progress = clamp(stable / .5);
      if (stable + 1e-9 >= .5) phase('recovery', g, air);
    } else {
      stable = steady(g, input) ? stable + dt : 0;
      const required = state.phase === 'level' ? 1 : state.phase === 'recovery' ? 3 : .5;
      state.progress = clamp(stable / required);
      if (stable + 1e-9 >= required) {
        if (state.phase === 'recovery') return finish();
        phase(state.phase === 'level' ? 'turn-first' : state.phase === 'release-first' ? 'turn-second' :
          state.phase === 'release-second' ? 'turn-sharp' : 'brake', g, air);
      }
    }
    if (state.phase === 'turn-first' || state.phase === 'turn-second') {
      const turn = state.phase === 'turn-first' ? -side : side;
      return { ...fields(`TURN ${turn < 0 ? 'LEFT' : 'RIGHT'}`, 'Pull one handle gently. Watch your course change.', turn < 0 ? .30 : 0, turn > 0 ? .30 : 0),
        progressLabel: 'TURN THE COURSE · 15°' };
    }
    if (state.phase === 'turn-sharp') return {
      ...fields(`SHARPER TURN ${side < 0 ? 'LEFT' : 'RIGHT'}`,
        `Pull the ${side < 0 ? 'left' : 'right'} handle farther (${side < 0 ? 'Q' : 'E'}). Release at the next cue; holding builds a spiral.`,
        side < 0 ? .82 : 0, side > 0 ? .82 : 0),
      progressLabel: 'FIRMER PULL · BANK 20° · TURN 15°',
    };
    if (state.phase === 'brake') return { ...fields('SLOW DOWN', 'Pull both handles to working brake until your airspeed drops.', .60, .60), progressLabel: 'SLOW BY 1 m/s' };
    return { ...fields(state.phase === 'level' ? 'LEVEL THE WING' : 'HANDS UP · RELEASE THE PULL',
      state.phase === 'recovery' ? 'Keep both hands released for three fresh steady seconds.' : 'Release both handles and let the wing settle.'),
      progressLabel: state.phase === 'recovery' ? 'STEADY FLIGHT · 3s' : 'SETTLE THE WING' };
  }
  function thermal(dt: number, g: FlightState, input: FlightInput, air: AirSample, clock: number): CoachFields {
    if (state.phase === 'level') {
      stable = steady(g, input) ? stable + dt : 0;
      state.progress = clamp(stable);
      if (stable + 1e-9 < 1) return fields('LEVEL THE WING', 'Release both handles before flying toward the rising air.');
      phase('acquire', g, air);
    }
    const route = guide.step(dt, { g, air, input, clock }) ?? guide.route;
    const activity = guide.activity;
    const source = sources.find(item => item.id === activity.sourceId && item.generation === activity.sourceGeneration);
    state.qualified = activity.activity === 'thermal' && !!source;
    if (state.qualified && source) {
      const key = `${activity.sourceKey}:${activity.sourceDir}:${activity.since}`;
      const angle = Math.atan2(g.pos.x - source.x, -(g.pos.z - source.z));
      const course = Math.atan2(g.pilot.vel.x - (source.vx ?? 0), -(g.pilot.vel.z - (source.vz ?? 0)));
      if (key !== orbitKey) { orbitKey = key; state.orbit = state.gain = 0; orbitHeight = g.pos.y; previousAngle = angle; previousOrbitCourse = course; }
      const arc = wrap(angle - previousAngle), rate = wrap(course - previousOrbitCourse) / dt;
      const dir = activity.sourceDir ?? side, near = Math.hypot(g.pos.x - source.x, g.pos.z - source.z);
      const coherent = near >= LIFT_ACTIVITY.orbitRadius && Math.abs(arc) <= LIFT_ACTIVITY.orbitMaximum * dt &&
        airspeed(g, air) >= LIFT_ACTIVITY.groundSpeed && rate * dir >= LIFT_ACTIVITY.turnRate && arc * dir >= LIFT_ACTIVITY.orbitRate * dt;
      if (coherent) state.orbit += arc * dir;
      else if (arc * dir < 0 && Math.abs(arc) <= LIFT_ACTIVITY.orbitMaximum * dt) state.orbit = Math.max(0, state.orbit + arc * dir);
      previousAngle = angle; previousOrbitCourse = course;
      state.gain = g.pos.y - orbitHeight; state.phase = 'circle';
      state.progress = clamp(Math.min(state.orbit / FOUNDATION.orbit, state.gain / FOUNDATION.gain));
      if (state.orbit >= FOUNDATION.orbit && state.gain >= FOUNDATION.gain) return finish();
    } else {
      orbitKey = ''; state.orbit = state.gain = state.progress = 0; state.phase = 'acquire';
    }
    if (!route) return fields('FIND THE RISING AIR', 'Fly toward the thermal. Rising air provides the lift.');
    const direction = route.action === 'left' ? -1 : route.action === 'right' ? 1 : 0;
    const both = route.phase === 'circle' || route.phase === 'ease' || route.brakeDepth === 'working' || route.hold.includes('brake');
    const left = both ? direction < 0 ? .50 : .20 : direction < 0 ? .30 : 0;
    const right = both ? direction > 0 ? .50 : .20 : direction > 0 ? .30 : 0;
    return { ...route, ...fields(route.title, route.detail, left, right), context: 'thermal',
      phase: route.phase, activity: route.activity, targetId: route.targetId, targetGeneration: route.targetGeneration,
      progressLabel: state.qualified ? `CIRCLE · ${Math.floor(state.orbit / FOUNDATION.orbit * 100)}% · CLIMB ${Math.max(0, Math.floor(state.gain))}/10 m` : 'FIND AND JOIN THE THERMAL' };
  }
  function step(dt: number, g: FlightState, input: FlightInput, air: AirSample, clock: number) {
    return state.lesson === 'steering' ? steering(dt, g, input, air) : thermal(dt, g, input, air, clock);
  }
  return { begin, reset, step, state, sampleAir, get sources() { return sources; }, get activity() { return guide.activity; } };
}
