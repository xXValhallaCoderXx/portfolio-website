import type { CloudbaseRun } from '../../../domains/good-lift/models.ts';
import type { Vector3, AirSample } from '../../../domains/flight/models.ts';
// Good Lift's presentation adapter stays in its lazy-loaded bundle.
import { CLOUD_ZONE, cloudFogSpeed, cloudThermalRemaining } from '../../../domains/good-lift/cloudbase-state.ts';
import { surfaceAt } from '../../../domains/flight/ground.ts';
import { BELL_RESULT } from '../../../domains/good-lift/bells.ts';
import { BRAKE } from '../../../domains/flight/flight.ts';

const FOG_NEAR = 80, GUST_NEAR = 60;

export const thermalRideIdentity = (index: number, thermal: { generation: number } | null) => thermal && index > 0 ? `${index}:${thermal.generation}` : null;

export function createRunCoachEnvironment(sky: CloudbaseRun) {
  return {
    navigation: true,
    thermalFlow: () => sky.state.flow,
    openingProtected: () => sky.state.openingAt < 0,
    recoveryPoint: () => ({ x: CLOUD_ZONE.x, z: CLOUD_ZONE.z }),
    sampleAir: (pos: Vector3, out: AirSample) => sky.sample(pos, 0, out),
    heightAt: surfaceAt,
    sources: () => sky.state.thermals.map((t: CloudbaseRun['state']['thermals'][number], id: number) => ({ ...t, id, flock: id > 0, remaining: cloudThermalRemaining(t) })),
    inside: (pos: { x: number; z: number; }, margin = 0) => Math.hypot(pos.x - CLOUD_ZONE.x, pos.z - CLOUD_ZONE.z) <= CLOUD_ZONE.r - margin,
    fog: () => ({ height: sky.state.fogHeight, elapsed: sky.state.elapsed, speedAt: cloudFogSpeed }),
    cloudDepth: (pos: Vector3) => sky.depthAt(pos.x, pos.y, pos.z),
  };
}

/** Fresh physical facts, independent of the render-time hint text. */
interface HazardObservation {
  sky: { state: { pilot: { cloud: number; danger: number; gustIn?: number } } };
  g?: { ears?: number; brake?: number; leftBrake?: number; rightBrake?: number }; controls?: { ears?: boolean };
  bells?: { state: { warning: number; bells: { result: number; circling: boolean }[] } } | null;
}
export function runCoachHazard(world: HazardObservation) {
  const pilot = world.sky.state.pilot;
  if (pilot.cloud > 0.25) return { state: 'hazard', context: 'IN CLOUD', phase: 'leave', action: 'straight',
    title: 'FLY STRAIGHT OUT', detail: 'Release the turn and leave the cloud.' };
  const bells = world.bells?.state;
  const bell = bells && bells.warning >= 0 ? bells.bells[bells.warning] : null;
  if (bell?.result === BELL_RESULT.pending) return bell.circling && !(world.g?.ears! > 0.01 || world.controls?.ears)
    ? { state: 'hazard', context: 'KETTLEBELL', phase: 'dodge', action: 'release-all', hold: [], release: ['left', 'right', 'brake', 'bar', 'ears'],
      title: 'LET GO · HANDS UP', detail: 'Release the pull to leave the falling kettlebell’s line.' }
    : { state: 'hazard', context: 'KETTLEBELL', phase: 'dodge', action: 'none',
      title: 'LEAVE YOUR LINE', detail: 'Turn away from the falling kettlebell.' };
  if (pilot.danger > 0) return { state: 'hazard', context: 'RAVENS', phase: 'leave', action: 'none',
    title: 'KEEP CLEAR OF THE BIRDS', detail: 'The ravens are above your wing. Fly clear of their path.' };
  if (pilot.gustIn! < GUST_NEAR && Math.max(world.g?.brake || 0, world.g?.leftBrake || 0, world.g?.rightBrake || 0) > BRAKE.light) return { state: 'hazard', context: 'GUST COMING',
    phase: 'release', action: 'release-brake', detail: 'Ease the brake before the gust reaches the wing.' };
  return null;
}

/** Environmental warnings accompany the action instead of hiding it or overlapping the card. */
export function runCoachWarning(world: { sky: { state: { pilot: { headroom: number }; fogHeight: number } }; g: { pos: { y: number }; lift: number; vy: number } }) {
  const { pilot, fogHeight } = world.sky.state;
  if (world.g.pos.y - fogHeight < FOG_NEAR) return { context: 'FOG CLOSE',
    detail: world.g.lift > 3 ? 'The fog is close below. Keep climbing.' : 'The fog is close below. Follow rising air.' };
  if (pilot.headroom < 70 && world.g.vy > 2) return { context: 'CLOUD ABOVE',
    detail: 'Stay below the cloud base; leave the lift before entering cloud.' };
  return null;
}
