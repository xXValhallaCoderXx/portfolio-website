import type { FlightState, Vector3 } from '../../../domains/flight/models.ts';

// A presentation-only pair of snapshots. Sampling never changes a simulation body or clock.
const BODIES = ['pilot', 'canopy'] as const;
const AXES = ['x', 'y', 'z'] as const;
const QUATERNION = ['x', 'y', 'z', 'w'] as const;
const copy3 = (to: Vector3, from: Vector3) => { to.x = from.x; to.y = from.y; to.z = from.z; };
const vector = () => ({ x: 0, y: 0, z: 0 });
const pose = () => ({ pilot: { pos: vector(), vel: vector() }, canopy: { pos: vector(), q: { x: 0, y: 0, z: 0, w: 1 } }, yaw: 0 });
type Pose = ReturnType<typeof pose>;
type PoseSource = { pos: Vector3; yaw: number; track?: number; pilot: { pos: Vector3; vel?: Vector3 }; canopy: { pos: Vector3; q: FlightState['canopy']['q'] } };
export type RenderedFlight = Pose & { motion: { from: Vector3; to: Vector3; seconds: number; discontinuity: boolean } };
function copy(to: Pose, g: PoseSource) {
  copy3(to.pilot.pos, g.pilot.pos);
  if (g.pilot.vel) copy3(to.pilot.vel, g.pilot.vel);
  copy3(to.canopy.pos, g.canopy.pos);
  Object.assign(to.canopy.q, g.canopy.q);
  to.yaw = g.track ?? g.yaw;
}
export function createFlightView(g: PoseSource) {
  const previous = pose();
  const out: RenderedFlight = { ...pose(), motion: { from: vector(), to: vector(), seconds: 1 / 60, discontinuity: false } };
  // Endpoints belong to the physical step, not the number of times a renderer samples it.
  copy(previous, g);
  return {
    capture(seconds = 1 / 60) {
      copy(previous, g);
      out.motion.seconds = seconds > 0 && Number.isFinite(seconds) ? seconds : 1 / 60;
      out.motion.discontinuity = false;
    },
    sample(amount: number) {
      const t = Math.min(1, Math.max(0, amount));
      const distance = Math.hypot(g.pos.x - previous.pilot.pos.x, g.pos.y - previous.pilot.pos.y, g.pos.z - previous.pilot.pos.z);
      if (distance > 20) { copy(previous, g); out.motion.discontinuity = true; } // teleport/reset
      for (const body of BODIES) for (const axis of AXES)
        out[body].pos[axis] = previous[body].pos[axis] + (g[body].pos[axis] - previous[body].pos[axis]) * t;
      copy3(out.motion.from, previous.pilot.vel);
      for (const axis of AXES) {
        const velocity = g.pilot.vel?.[axis] ?? 0;
        out.motion.to[axis] = velocity;
        out.pilot.vel[axis] = previous.pilot.vel[axis] + (velocity - previous.pilot.vel[axis]) * t;
      }
      const a = previous.canopy.q;
      const b = g.canopy.q;
      const sign = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1;
      let squared = 0;
      for (const axis of QUATERNION) {
        out.canopy.q[axis] = a[axis] * (1 - t) + b[axis] * sign * t;
        squared += out.canopy.q[axis] ** 2;
      }
      const length = Math.sqrt(squared) || 1;
      for (const axis of QUATERNION) out.canopy.q[axis] /= length;
      const delta = Math.atan2(Math.sin((g.track ?? g.yaw) - previous.yaw), Math.cos((g.track ?? g.yaw) - previous.yaw));
      out.yaw = previous.yaw + delta * t;
      return out;
    },
  };
}
