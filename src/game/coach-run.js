// Good Lift's presentation adapter stays in its lazy-loaded bundle.
import { CLOUD_ZONE, cloudFogSpeed, cloudThermalRemaining } from './cloudbase-state.js';
import { surfaceAt } from './ground.js';
import { BELL_RESULT } from './bells.js';
import { FOG_NEAR, GUST_NEAR } from './cloudbase-hints.js';
import { BRAKE } from './flight.js';

export const thermalRideIdentity = (index, thermal) => thermal && index > 0 ? `${index}:${thermal.generation}` : null;

export function createRunCoachEnvironment(sky) {
  return {
    sampleAir: (pos, out) => sky.sample(pos, 0, out),
    heightAt: surfaceAt,
    sources: () => sky.state.thermals.map((t, id) => ({ ...t, id, remaining: cloudThermalRemaining(t) })),
    inside: (pos, margin = 0) => Math.hypot(pos.x - CLOUD_ZONE.x, pos.z - CLOUD_ZONE.z) <= CLOUD_ZONE.r - margin,
    fog: () => ({ height: sky.state.fogHeight, elapsed: sky.state.elapsed, speedAt: cloudFogSpeed }),
    cloudDepth: (pos) => sky.depthAt(pos.x, pos.y, pos.z),
  };
}

/** Fresh physical facts, independent of the render-time hint text. */
export function runCoachHazard(world) {
  const pilot = world.sky.state.pilot;
  if (pilot.cloud > 0.25) return { state: 'hazard', context: 'IN CLOUD', phase: 'leave', action: 'straight',
    title: 'FLY STRAIGHT OUT', detail: 'Release the turn and leave the cloud.' };
  const bells = world.bells?.state;
  const bell = bells?.warning >= 0 ? bells.bells[bells.warning] : null;
  if (bell?.result === BELL_RESULT.pending) return bell.circling && !(world.g?.ears > 0.01 || world.controls?.ears)
    ? { state: 'hazard', context: 'KETTLEBELL', phase: 'dodge', action: 'none', hold: ['bar'], release: ['brake'],
      title: 'PUSH THE BAR', detail: 'Accelerate out of its fall line, or straighten your turn.' }
    : { state: 'hazard', context: 'KETTLEBELL', phase: 'dodge', action: 'none',
      title: 'LEAVE YOUR LINE', detail: 'Turn away from the falling kettlebell.' };
  if (pilot.danger > 0) return { state: 'hazard', context: 'RAVENS', phase: 'leave', action: 'none',
    title: 'KEEP CLEAR OF THE BIRDS', detail: 'The ravens are above your wing. Fly clear of their path.' };
  if (pilot.gustIn < GUST_NEAR && world.g?.brake > BRAKE.light) return { state: 'hazard', context: 'GUST COMING',
    phase: 'release', action: 'release-brake', detail: 'Ease the brake before the gust reaches the wing.' };
  return null;
}

/** Environmental warnings accompany the action instead of hiding it or overlapping the card. */
export function runCoachWarning(world) {
  const { pilot, fogHeight } = world.sky.state;
  if (world.g.pos.y - fogHeight < FOG_NEAR) return { context: 'FOG CLOSE',
    detail: world.g.lift > 3 ? 'The fog is close below. Keep climbing.' : 'The fog is close below. Follow rising air.' };
  if (pilot.headroom < 70 && world.g.vy > 2) return { context: 'CLOUD ABOVE',
    detail: 'Stay below the cloud base; leave the lift before entering cloud.' };
  return null;
}
