import { ZONES, centerX } from './terrain.js';

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

// The breeze the streaks draw over the fjord. It moves nothing: sampleApproach above is all the
// wind a pilot feels there. It blows at `speed` m/s, up the fjord over the water and up the slope
// on land, turning from one to the other between `shore` metres either side of the channel's
// middle, and never more than `turn` round from the channel: where the fjord bends away from a
// shore, the air there leans up the slope instead of doubling back. Near a ring it becomes that
// ring's windsock, drawn `show` times the drift it really gives so that a 0.8 m/s wind can be
// seen at all.
export const FJORD_BREEZE = Object.freeze({ speed: 1.6, shore: Object.freeze([35, 95]), turn: Math.PI / 2, show: 2 });

// Each ring with its windsock's wind as drawn, looked up once: fjordBreeze runs for every streak.
const SOCKS = ZONES.map((zone) => {
  const wind = APPROACH_WINDS.find((candidate) => candidate.id === zone.id);
  const drawn = wind.speed * FJORD_BREEZE.show;
  return { x: zone.x, z: zone.z, near: zone.r * 1.4, far: zone.r * 3.2, windX: wind.x * drawn, windZ: wind.z * drawn };
});

/**
 * The wind to draw at a point over the fjord, into `out`: `out.x`, `out.z` in m/s and `out.front`,
 * always 0 here (no gusts). The same shape as a Cloudbase run's windAt; height makes no difference.
 */
export function fjordBreeze(x, y, z, out) {
  const B = FJORD_BREEZE;
  // Northward along the channel: the heading its middle line has here, as a yaw.
  const along = Math.atan(-(46 * 0.011 * Math.cos(z * 0.011) + 22 * 0.026 * Math.cos(z * 0.026 + 1.3)));
  const off = x - centerX(z);
  // Turned by angle, not by adding the two winds, which would swing round where they oppose.
  const upslope = off < 0 ? -Math.PI / 2 : Math.PI / 2;
  const yaw = along + Math.max(-B.turn, Math.min(B.turn, upslope - along)) * smooth(B.shore[0], B.shore[1], Math.abs(off));
  let windX = Math.sin(yaw) * B.speed;
  let windZ = -Math.cos(yaw) * B.speed;
  let share = 0;
  let sockX = 0;
  let sockZ = 0;
  for (let i = 0; i < SOCKS.length; i++) {
    const sock = SOCKS[i];
    const distance = Math.hypot(x - sock.x, z - sock.z);
    if (distance >= sock.far) continue;
    // The window sampleApproach gives the drift: whole inside 1.4 radii, gone by 3.2.
    const reach = 1 - smooth(sock.near, sock.far, distance);
    share += reach;
    sockX += sock.windX * reach;
    sockZ += sock.windZ * reach;
  }
  if (share > 0) {
    const rest = Math.max(0, 1 - share);
    const total = Math.max(1, share);
    windX = (windX * rest + sockX) / total;
    windZ = (windZ * rest + sockZ) / total;
  }
  out.x = windX;
  out.z = windZ;
  out.front = 0;
  return out;
}
