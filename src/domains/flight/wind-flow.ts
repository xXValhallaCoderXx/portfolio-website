import type { AirSample, HeightSampler, Vector2, Vector3 } from './models.ts';
export type WindProbe = AirSample & Partial<Vector3>;
export type WindSampler = (x: number, y: number, z: number, output: WindProbe) => WindProbe | void;
type WindVector = AirSample & Vector3;
// Bounded, world-anchored streamlines. The callback reads the same air as flight; no sky is stepped.
export const WIND_FLOW = Object.freeze({
  count: 12, points: 41, seconds: 1.5, refresh: 0.5, discover: 1,
  grid: 40, reach: 4, band: 24, upstream: 48, clearance: 4,
  range: 220, retire: 260, altitude: 64, minimum: 0.2, still: 0.3,
  fade: 2, width: Object.freeze([0.35, 0.9]), period: 14,
  ambient: 0x87c8de, lift: 0xffcc87, lee: 0xb3a4cd,
});
const F = WIND_FLOW;
const clamp = (x: number, low: number, high: number) => Math.max(low, Math.min(high, x));

/** Fixed arrays are allocated once. Per-frame drawing only reads these arrays and anchor records. */
export function createWindFlow({ heightAt }: {heightAt: HeightSampler}) {
  const paths = new Float64Array(F.count * F.points * 3);
  const vertical = new Float32Array(F.count * F.points);
  const counts = new Uint8Array(F.count), fades = new Float32Array(F.count);
  const anchors = Array.from({ length: F.count }, () => ({
    live: false, occupied: false, x: 0, y: 0, z: 0, cellX: 0, cellZ: 0, band: 0, ux: 1, uz: 0, phase: 0,
  }));
  const side = 2 * F.reach + 1, candidateCount = side * side;
  const candidates = new Float64Array(candidateCount * 8);
  const probe: WindProbe = {}, midway: WindProbe = {}, start = { x: 0, y: 0, z: 0 };
  const state = { clock: 0, active: 0, integrations: 0, searches: 0, samples: 0 };
  let awake = false, disposed = false, refreshAt = -Infinity, discoverAt = -Infinity;
  let lastX = 0, lastY = 0, lastZ = 0;

  function sample(windAt: WindSampler, x: number, y: number, z: number, out: WindProbe) {
    out.x = out.y = out.z = 0;
    out.windX = out.windY = out.windZ = undefined;
    out.ridge = out.lee = 0; out.crestHeight = out.ambientX = out.ambientZ = undefined;
    windAt(x, y, z, out); state.samples++;
    out.x = Number.isFinite(out.windX) ? out.windX! : Number.isFinite(out.x) ? out.x : 0;
    out.y = Number.isFinite(out.windY) ? out.windY! : Number.isFinite(out.y) ? out.y : 0;
    out.z = Number.isFinite(out.windZ) ? out.windZ! : Number.isFinite(out.z) ? out.z : 0;
    return out as WindVector;
  }
  function valid(x: number, y: number, z: number, floor: number) { return y > Math.max(floor + F.clearance, heightAt(x, z) + F.clearance); }
  function weight(out: AirSample) { return Math.max(out.ridge || 0, (out.lee || 0) * 0.7); }
  function discover(pos: { x: number; z: number; y: number; }, eye: { x: number; z: number; }, windAt: WindSampler, floor: number) {
    const cellX = Math.round(pos.x / F.grid), cellZ = Math.round(pos.z / F.grid), band = Math.round(pos.y / F.band) * F.band;
    const vx = pos.x - eye.x, vz = pos.z - eye.z, viewLength = Math.hypot(vx, vz) || 1;
    let n = 0;
    for (let ix = -F.reach; ix <= F.reach; ix++) for (let iz = -F.reach; iz <= F.reach; iz++) {
      const k = n++ * 8, cx = cellX + ix, cz = cellZ + iz, x = cx * F.grid, z = cz * F.grid;
      const dx = x - pos.x, dz = z - pos.z, distance = Math.hypot(dx, dz);
      candidates[k] = 0;
      if (distance > F.range || (dx * vx + dz * vz) / viewLength < -80) continue;
      const ground = heightAt(x, z), y = Math.max(band, ground + 18, floor + 12);
      if (y > pos.y + F.altitude) continue;
      const field = sample(windAt, x, y, z, probe);
      const wx = field.ambientX ?? field.x, wz = field.ambientZ ?? field.z, speed = Math.hypot(wx, wz);
      if (weight(field) < F.minimum || speed < F.still) continue;
      const crest = Number.isFinite(field.crestHeight) ? field.crestHeight! : y;
      const anchorY = Math.max(ground + 18, floor + 12, clamp(crest - 16, band - 24, band + 24));
      const visibility = 1 + Math.max(0, (dx * vx + dz * vz) / (viewLength * Math.max(1, distance))) * 0.2;
      candidates[k] = weight(field) * visibility / (1 + distance / 150);
      candidates[k + 1] = cx; candidates[k + 2] = cz; candidates[k + 3] = anchorY;
      candidates[k + 4] = wx / speed; candidates[k + 5] = wz / speed; candidates[k + 6] = band;
    }
    // Keep existing world cells while their actual field and view remain useful. Stronger nearby
    // samples cannot make the whole display jump to a new winning patch every refresh.
    for (let i = 0; i < F.count; i++) {
      const anchor = anchors[i];
      if (!anchor.occupied) continue;
      const dx = anchor.x - pos.x, dz = anchor.z - pos.z;
      const outside = Math.hypot(dx, dz) > F.retire || Math.abs(anchor.y - pos.y) > F.altitude ||
        (dx * vx + dz * vz) / viewLength < -120;
      const field = outside ? null : sample(windAt, anchor.x, anchor.y, anchor.z, probe);
      const wx = field ? field.ambientX ?? field.x : 0, wz = field ? field.ambientZ ?? field.z : 0;
      const speed = Math.hypot(wx, wz);
      anchor.live = !!field && weight(field) >= F.minimum && speed >= F.still && valid(anchor.x, anchor.y, anchor.z, floor);
      if (anchor.live) { anchor.ux = wx / speed; anchor.uz = wz / speed; }
      else if (fades[i] <= 0.001) { anchor.occupied = false; counts[i] = 0; }
      if (anchor.occupied) for (let j = 0; j < candidateCount; j++) {
        const k = j * 8;
        if (candidates[k + 1] === anchor.cellX && candidates[k + 2] === anchor.cellZ) candidates[k] = 0;
      }
    }
    for (let i = 0; i < F.count; i++) {
      const anchor = anchors[i];
      if (anchor.occupied) continue;
      let best = -1, score = 0;
      for (let j = 0; j < candidateCount; j++) if (candidates[j * 8] > score) { score = candidates[j * 8]; best = j * 8; }
      if (best < 0) break;
      anchor.cellX = candidates[best + 1]; anchor.cellZ = candidates[best + 2]; anchor.band = candidates[best + 6];
      anchor.x = anchor.cellX * F.grid; anchor.y = candidates[best + 3]; anchor.z = anchor.cellZ * F.grid;
      anchor.ux = candidates[best + 4]; anchor.uz = candidates[best + 5];
      anchor.phase = ((anchor.cellX * 17 + anchor.cellZ * 23) % F.period + F.period) % F.period;
      anchor.live = anchor.occupied = true; counts[i] = 0; fades[i] = 0;
      candidates[best] = 0;
    }
    state.searches++; discoverAt = state.clock + F.discover;
  }
  function integrate(i: number, pos: { y: number; x: number; z: number; }, windAt: WindSampler, floor: number) {
    const anchor = anchors[i];
    if (!anchor.live) return;
    // Seed upstream in the current horizontal breeze, so one connected path includes incoming
    // flow, its genuine upward bend, and the available air over the crest.
    start.x = anchor.x - anchor.ux * F.upstream; start.z = anchor.z - anchor.uz * F.upstream;
    // On the lee side the incoming air starts above the crest, rather than inside its rock.
    start.y = Math.max(anchor.y, heightAt(start.x, start.z) + F.clearance + 4, floor + F.clearance + 4);
    if (start.y > pos.y + F.altitude) { counts[i] = 0; return; }
    if (!valid(start.x, start.y, start.z, floor)) { counts[i] = 0; return; }
    let x = start.x, y = start.y, z = start.z, count = 0;
    for (let node = 0; node < F.points; node++) {
      const field = sample(windAt, x, y, z, probe);
      if (Math.hypot(field.x, field.y, field.z) < F.still) break;
      const p = (i * F.points + node) * 3;
      paths[p] = x; paths[p + 1] = y; paths[p + 2] = z;
      vertical[i * F.points + node] = field.y; count++;
      const mx = x + field.x * F.seconds / 2, my = y + field.y * F.seconds / 2, mz = z + field.z * F.seconds / 2;
      if (!valid(mx, my, mz, floor)) break;
      const middle = sample(windAt, mx, my, mz, midway);
      const nx = x + middle.x * F.seconds, ny = y + middle.y * F.seconds, nz = z + middle.z * F.seconds;
      if (!valid(nx, ny, nz, floor) || Math.hypot(nx - pos.x, nz - pos.z) > F.retire || Math.abs(ny - pos.y) > F.altitude + 80) break;
      x = nx; y = ny; z = nz;
    }
    counts[i] = count; state.integrations++;
  }
  function update(dt: number, pos: Vector3, eye: Vector2, windAt: WindSampler, level: number, floor = -Infinity) {
    if (disposed) return;
    if (!(level > 0)) { awake = false; state.active = 0; return; }
    const step = clamp(dt, 0, 0.1), jump = Math.hypot(pos.x - lastX, pos.z - lastZ) > F.range || Math.abs(pos.y - lastY) > F.altitude;
    if (awake && step === 0 && !jump) return;
    state.clock += step;
    const fresh = !awake || jump;
    if (jump) for (let i = 0; i < F.count; i++) { anchors[i].live = anchors[i].occupied = false; counts[i] = fades[i] = 0; }
    if (fresh || state.clock >= discoverAt) discover(pos, eye, windAt, floor);
    if (fresh || state.clock >= refreshAt) {
      for (let i = 0; i < F.count; i++) integrate(i, pos, windAt, floor);
      refreshAt = state.clock + F.refresh;
    }
    state.active = 0;
    for (let i = 0; i < F.count; i++) {
      fades[i] = clamp(fades[i] + (anchors[i].live && counts[i] > 1 ? 1 : -1) * step * F.fade, 0, 1);
      if (fades[i] > 0 && counts[i] > 1) state.active++;
    }
    awake = true; lastX = pos.x; lastY = pos.y; lastZ = pos.z;
  }
  function dispose() { disposed = true; state.active = 0; }
  return { paths, vertical, counts, fades, anchors, state, update, dispose };
}
