import type { AirSample, AtmosphereSample, Vector3 } from './models.ts';
import { sampleFjordAir, fjordWindAt } from './atmosphere.ts';

// Windsocks point along the same prevailing air used by the wing and the visible streamlines.
const speed = Math.hypot(1.15, -1.8);
export const APPROACH_WINDS = ['about', 'projects', 'experience', 'contact'].map((id) => ({ id, x: 1.15 / speed, z: -1.8 / speed, speed }));
export const FJORD_BREEZE = Object.freeze({ speed, show: 1 });
const point = { x: 0, y: 0, z: 0 };

export function sampleApproach(x: number, y: number, z: number, out: AirSample & Partial<Vector3> = {}) {
  point.x = x; point.y = y; point.z = z;
  sampleFjordAir(point, 0, out);
  out.x = out.windX; out.y = out.windY; out.z = out.windZ;
  return out as AtmosphereSample & Vector3;
}
export const fjordBreeze = fjordWindAt;
