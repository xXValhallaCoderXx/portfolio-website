import { ZONES } from './terrain.js';

const smooth = (from, to, value) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

// Vectors point downwind, matching the direction the windsock trails. Hall stays gentle.
export const APPROACH_WINDS = [
  { id: 'about', x: 1, z: 0, speed: 0.35 },
  { id: 'projects', x: -0.6, z: 0.8, speed: 0.8 },
  { id: 'experience', x: 0.9, z: Math.sqrt(0.19), speed: 0.8 },
  { id: 'contact', x: 0.7, z: -Math.sqrt(0.51), speed: 0.8 },
];

/** Local approach drift and vertical air in m/s. Apply only during unassisted fjord flight. */
export function sampleApproach(x, y, z) {
  const result = { x: 0, z: 0, lift: 0 };
  for (const zone of ZONES) {
    const wind = APPROACH_WINDS.find((candidate) => candidate.id === zone.id);
    const dx = x - zone.x;
    const dz = z - zone.z;
    const distance = Math.hypot(dx, dz);
    const above = y - zone.h;
    const reach = 1 - smooth(zone.r * 1.4, zone.r * 3.2, distance);
    const layer = smooth(0, 4, above) * (1 - smooth(45, 90, above));
    result.x += wind.x * wind.speed * reach * layer;
    result.z += wind.z * wind.speed * reach * layer;
    // Vertical quirks taper before the existing <9 m landing trigger, keeping reading easy.
    const air = smooth(9, 20, above) * (1 - smooth(45, 90, above));
    if (zone.id === 'projects') result.lift += 0.95 * (1 - smooth(zone.r * 0.7, zone.r * 2, distance)) * air;
    if (zone.id === 'experience') {
      const lee = dx * wind.x + dz * wind.z;
      result.lift -= 1.3 * smooth(2, 16, lee) * (1 - smooth(zone.r, zone.r * 2.3, distance)) * air;
    }
  }
  return result;
}
