import type { Vector2 } from '../../../domains/flight/models.ts';
export interface FlightZone extends Vector2 { id: string; label: string; place: string }

/** Preserve authored ordering for equal distances; assisted travel chooses only a destination. */
export function nearestFlightZone<T extends Vector2 & { id: string }>(position: Vector2, zones: readonly T[], visited: readonly string[], onlyUnvisited: boolean): { zone: T; dist: number } | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const zone of zones) {
    if (onlyUnvisited && visited.includes(zone.id)) continue;
    const dist = Math.hypot(zone.x - position.x, zone.z - position.z);
    if (dist < bestDist) [best, bestDist] = [zone, dist];
  }
  return best && { zone: best, dist: bestDist };
}
