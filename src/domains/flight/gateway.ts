// Scored rune gates use an exact plane crossing. The fjord's stone arch opts into its physical

import type { Vector3 } from "./models.ts";

export interface Gateway { x: number; corridor: { minY: number; maxY: number; minZ: number; maxZ: number }; entry?: { halfDepth: number; margin: number } }

// depth and a small pilot margin, so the whole visible doorway can start Good Lift.
export function crossesGateway(from: Vector3, to: Vector3, gateway: Gateway) {
  if (gateway.entry) return entersArch(from, to, gateway as Gateway & {entry: NonNullable<Gateway['entry']>});
  if (!((from.x < gateway.x && to.x >= gateway.x) || (from.x > gateway.x && to.x <= gateway.x))) return false;
  const t = (gateway.x - from.x) / (to.x - from.x);
  const y = from.y + (to.y - from.y) * t;
  const z = from.z + (to.z - from.z) * t;
  const { minY, maxY, minZ, maxZ } = gateway.corridor;
  return y >= minY && y <= maxY && z >= minZ && z <= maxZ;
}

// Intersect the entire step with the doorway volume, including a path starting inside it.
// Intersecting all three time intervals avoids accepting diagonal passes around a corner.
function entersArch(from: Vector3, to: Vector3, gateway: Gateway & {entry: NonNullable<Gateway['entry']>}) {
  const dx = to.x - from.x;
  if (dx === 0) return false;
  const { halfDepth, margin } = gateway.entry;
  const { minY, maxY, minZ, maxZ } = gateway.corridor;
  const a = (gateway.x - halfDepth - margin - from.x) / dx;
  const b = (gateway.x + halfDepth + margin - from.x) / dx;
  let enter = Math.max(0, Math.min(a, b));
  let exit = Math.min(1, Math.max(a, b));
  if (enter > exit) return false;

  const dy = to.y - from.y;
  if (dy === 0) {
    if (from.y < minY - margin || from.y > maxY + margin) return false;
  } else {
    const a = (minY - margin - from.y) / dy;
    const b = (maxY + margin - from.y) / dy;
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
    if (enter > exit) return false;
  }

  const dz = to.z - from.z;
  if (dz === 0) return from.z >= minZ - margin && from.z <= maxZ + margin;
  const c = (minZ - margin - from.z) / dz;
  const d = (maxZ + margin - from.z) / dz;
  return Math.max(enter, Math.min(c, d)) <= Math.min(exit, Math.max(c, d));
}
