// Read-only glide forecasts shared by the view and directional coach. No sky or renderer imports.
import { FLIGHT } from './flight.js';

/** Duration before a descending wing meets rising fog. Callers supply their sky's fog speed. */
export function glideDuration(y, fogHeight, elapsed, limit = 60, {
  fogSpeed = () => 0, sink = FLIGHT.sink.trim, catchHeight = 3, step = 0.5, end = 600,
} = {}) {
  limit = Math.min(limit, Math.max(0, end - elapsed));
  let gap = y - fogHeight - catchHeight;
  if (!(gap > 0)) return 0;
  const h = step;
  let fog = fogHeight;
  let t = 0;
  while (t < limit) {
    const now = fogSpeed(fog, elapsed + t);
    const then = fogSpeed(fog + now * h, elapsed + t + h);
    const rise = 0.5 * (now + then) * h;
    const next = gap - rise - sink * h;
    if (next <= 0) return Math.min(limit, t + (h * gap) / (gap - next));
    fog += rise;
    gap = next;
    t += h;
  }
  return limit;
}

/** Three fixed refinements preserve the glide ring's moving-source interception rule exactly. */
export function movingLiftIntercept(pos, source, wind = {}, out = {}, speed = FLIGHT.speed.trim) {
  let seconds = 0;
  let x = source.x, z = source.z;
  for (let k = 0; k < 3; k++) {
    const dx = x - pos.x - (wind.x ?? 0) * seconds;
    const dz = z - pos.z - (wind.z ?? 0) * seconds;
    seconds = Math.hypot(dx, dz) / speed;
    x = source.x + (source.vx ?? 0) * seconds;
    z = source.z + (source.vz ?? 0) * seconds;
  }
  out.x = x; out.z = z; out.seconds = seconds;
  return out;
}

/** A necessary straight-glide check; steering guidance also checks its actual turn corridor. */
export function glidePathClear(pos, target, seconds, heightAt, clearance = 8, sink = FLIGHT.sink.trim, samples = 12) {
  for (let k = 1; k <= samples; k++) {
    const share = k / samples;
    const x = pos.x + (target.x - pos.x) * share, z = pos.z + (target.z - pos.z) * share;
    if (pos.y - sink * seconds * share <= heightAt(x, z) + clearance) return false;
  }
  return true;
}
