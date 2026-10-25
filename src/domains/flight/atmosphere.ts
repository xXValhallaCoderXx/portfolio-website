import { centerX, surfaceAt } from './ground.ts';
import type { AirSample, AtmosphereSample, ThermalSource, Vector3 } from './models.ts';
/**
 * Thermals a wing can feel (Good Lift's runs): a sinking `ring` round each, as a share of its
 * strength and `ringWidth` of its radius wide; `background` m/s of sink wherever the rising air is
 * under `calm` m/s; and each core `upwind` of its radius toward the wind, where the lift is strongest.
 * None of it is there below `low` m: it grows in over the next `blend` m, so the climb out of the
 * launch is as easy as ever.
 */
export interface AirFeel { ring: number; ringWidth: number; background: number; calm: number; upwind: number; low: number; blend: number }
export interface WeatherField { windX?: number; windZ?: number; thermals?: readonly (ThermalSource & {s: number; r: number})[]; feel?: Readonly<AirFeel> }

export const ATMOSPHERE = Object.freeze({
  grid: 16, ridgeReach: 96, maximumLift: 6, maximumSink: 6,
  probes: Object.freeze([24, 48, 72, 96]),
  ridge: Object.freeze({ relief: 14, reliefRange: 72, support: 24, grade: 0.04, gradeRange: 0.4,
    fraction: 1.10, maximum: 3.5, usefulHeight: 55, ceiling: 120, normalSpan: 48, deflection: 0.45 }),
  lee: Object.freeze({ height: 80, fraction: 0.6, slope: 0.7, blocked: 0.35,
    crestMargin: 12, depth: 65, relief: 20, shelter: 0.65, rough: 0.35 }),
  ground: Object.freeze({ start: 1, range: 9, thermal: 8 }),
});
const clamp = (x: number, low: number, high: number) => Math.max(low, Math.min(high, x));
const ease = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
export const thermalProfile = (distance: number, radius: number, fade = 1) => ease((radius - distance) / (radius * fade));

/** A cached height field, shared by Node replay and the browser. Synthetic terrain is injectable.
 * The default bounds span whole cells about the origin so mirrored faces sample identically. */
export function createTerrainAir(height = surfaceAt, { step = ATMOSPHERE.grid, minX = -400, maxX = 400, minZ = -528, maxZ = 528 } = {}) {
  const width = Math.ceil((maxX - minX) / step) + 1;
  const depth = Math.ceil((maxZ - minZ) / step) + 1;
  let grid: Float64Array | undefined;
  function terrain(x: number, z: number) {
    if (x < minX || x > maxX || z < minZ || z > maxZ) return height(x, z);
    if (!grid) {
      grid = new Float64Array(width * depth);
      for (let iz = 0; iz < depth; iz++) for (let ix = 0; ix < width; ix++) grid[iz * width + ix] = height(minX + ix * step, minZ + iz * step);
    }
    const fx = (x - minX) / step, fz = (z - minZ) / step;
    const ix = Math.min(width - 2, Math.floor(fx)), iz = Math.min(depth - 2, Math.floor(fz));
    const tx = fx - ix, tz = fz - iz, p = iz * width + ix;
    return (grid[p] * (1 - tx) + grid[p + 1] * tx) * (1 - tz) + (grid[p + width] * (1 - tx) + grid[p + width + 1] * tx) * tz;
  }
  function sample(pos: { x: number; z: number; y: number; }, windX: number, windZ: number, out: AirSample = {}) {
    const R = ATMOSPHERE.ridge, L = ATMOSPHERE.lee, G = ATMOSPHERE.ground;
    const speed = Math.sqrt(windX * windX + windZ * windZ);
    const h = terrain(pos.x, pos.z), agl = Math.max(0, pos.y - h);
    const ground = ease((agl - G.start) / G.range);
    out.ambientX = windX; out.ambientZ = windZ;
    out.crestHeight = h; out.thermal = 0;
    if (speed < 1e-8 || pos.y <= h) {
      out.windX = out.windY = out.windZ = out.ridge = out.lee = out.rough = 0;
      return out as AtmosphereSample;
    }
    const ux = windX / speed, uz = windZ / speed;
    // Look far enough upstream of a face for a wing to use its lift. Broad relief and uphill
    // grade must agree; a nearby rock cannot become a lift source. Multiple probes describe
    // one obstacle, so select the strongest response rather than adding its faces together.
    let response = 0, reachWeight = 0, reachMoment = 0, gradeMoment = 0, upstream = h, slope = 0;
    for (let i = 0; i < ATMOSPHERE.probes.length; i++) {
      const distance = ATMOSPHERE.probes[i];
      const ahead = terrain(pos.x + ux * distance, pos.z + uz * distance);
      const behind = terrain(pos.x - ux * distance, pos.z - uz * distance);
      const grade = (ahead - behind) / (2 * distance);
      const beyond = terrain(pos.x + ux * (distance + R.support), pos.z + uz * (distance + R.support));
      const broadRelief = Math.min(ahead, beyond) - h;
      const obstacle = ease((broadRelief - R.relief) / R.reliefRange) * ease((grade - R.grade) / R.gradeRange);
      response = Math.max(response, obstacle);
      reachWeight += obstacle; reachMoment += distance * obstacle; gradeMoment += grade * obstacle;
      out.crestHeight = Math.max(out.crestHeight, ahead);
      upstream = Math.max(upstream, behind);
      if (i === 0) slope = grade;
    }
    // Estimate one broad face normal with a continuous weighted reach. Choosing a winning
    // probe's normal would abruptly rotate the wind when two probe strengths exchange rank.
    // Amplitude still uses their maximum, so this blend cannot stack the same obstacle's lift.
    const reach = reachWeight > 0 ? reachMoment / reachWeight : ATMOSPHERE.probes[0];
    const mx = pos.x + ux * reach * 0.5, mz = pos.z + uz * reach * 0.5;
    let gx = terrain(mx + R.normalSpan, mz) - terrain(mx - R.normalSpan, mz);
    let gz = terrain(mx, mz + R.normalSpan) - terrain(mx, mz - R.normalSpan);
    // A locally flat patch must not make the normal undefined while the broad probes still
    // see a face. Retain their measured uphill component, with the stencil's cross-ridge tilt.
    const measuredGrade = reachWeight > 0 ? gradeMoment / reachWeight : 0;
    const support = Math.max(0, 2 * R.normalSpan * measuredGrade - gx * ux - gz * uz);
    gx += ux * support; gz += uz * support;
    const normalLength = Math.sqrt(gx * gx + gz * gz);
    const nx = normalLength > 1e-8 ? gx / normalLength : ux;
    const nz = normalLength > 1e-8 ? gz / normalLength : uz;
    const incoming = Math.max(0, windX * nx + windZ * nz);
    const envelope = 1 - ease((pos.y - out.crestHeight - R.usefulHeight) / (R.ceiling - R.usefulHeight));
    out.ridge = Math.min(R.maximum, incoming * R.fraction * response * envelope * ground);
    const bend = R.deflection * response * envelope;
    const terrainRise = Math.max(0, upstream - h);
    const blocked = ease((upstream - pos.y + L.crestMargin) / L.depth) * ease(terrainRise / L.relief);
    const leeEnvelope = Math.exp(-agl / L.height);
    out.lee = Math.min(ATMOSPHERE.maximumSink, Math.min(speed * L.fraction,
      Math.max(0, -slope) * speed * L.slope + blocked * speed * L.blocked) * leeEnvelope * ground);
    const shelter = 1 - blocked * L.shelter;
    out.windX = (windX - nx * incoming * bend) * shelter * ground;
    out.windZ = (windZ - nz * incoming * bend) * shelter * ground;
    out.windY = out.ridge - out.lee;
    out.rough = blocked * L.rough * leeEnvelope;
    return out as AtmosphereSample;
  }
  return { sample, heightAt: terrain };
}

const terrain = createTerrainAir();

/** The one environmental field. Vertical diagnostics are aliases, never extra forces. */
export function sampleAtmosphere(pos: Vector3, weather: WeatherField, out: AirSample = {}) {
  terrain.sample(pos, weather.windX ?? 0, weather.windZ ?? 0, out);
  if (weather.feel) return feltThermals(pos, weather, weather.feel, out);
  let rising = 0;
  const thermals = weather.thermals ?? [];
  for (let i = 0; i < thermals.length; i++) {
    const t = thermals[i];
    if (t.live === false || !(t.strength ?? 1)) continue;
    const dx = pos.x - t.x, dz = pos.z - t.z;
    rising += t.s * (t.strength ?? 1) * thermalProfile(Math.sqrt(dx * dx + dz * dz), t.r, t.fade ?? 1);
  }
  rising *= ease((pos.y - terrain.heightAt(pos.x, pos.z)) / ATMOSPHERE.ground.thermal);
  out.thermal = rising;
  out.windY = clamp(out.windY! + rising, -ATMOSPHERE.maximumSink, ATMOSPHERE.maximumLift);
  out.lift = Math.max(0, out.windY!);
  out.sink = Math.max(0, -out.windY!);
  out.hazardSink = 0;
  return out as AtmosphereSample;
}

// The thermals of air a wing can feel: each core moved upwind, a ring of sink beyond its edge, a
// little sink everywhere the air is not rising, and the lift's slope across the ground (gradX,
// gradZ, (m/s)/m) for the solver to feel across the wing. `core` and `edge` say how much of a
// thermal's middle or its edge the point is in (0 to 1, by a 5.5 m/s thermal), for the turbulence.
function feltThermals(pos: Vector3, weather: WeatherField, feel: Readonly<AirFeel>, out: AirSample) {
  const windX = weather.windX ?? 0, windZ = weather.windZ ?? 0, speed = Math.sqrt(windX * windX + windZ * windZ);
  const ux = speed > 1e-6 ? windX / speed : 0, uz = speed > 1e-6 ? windZ / speed : 0;
  const sinking = clamp((pos.y - feel.low) / feel.blend, 0, 1);
  let rising = 0, gradX = 0, gradZ = 0, core = 0, edge = 0;
  const thermals = weather.thermals ?? [];
  for (let i = 0; i < thermals.length; i++) {
    const t = thermals[i];
    if (t.live === false || !(t.strength ?? 1)) continue;
    const strength = t.s * (t.strength ?? 1), fade = t.fade ?? 1;
    const dx = pos.x - (t.x - ux * feel.upwind * sinking * t.r), dz = pos.z - (t.z - uz * feel.upwind * sinking * t.r);
    const d = Math.sqrt(dx * dx + dz * dz);
    const width = t.r * fade, u = clamp((t.r - d) / width, 0, 1);
    rising += strength * u * u * (3 - 2 * u);
    core = Math.max(core, u * u * (3 - 2 * u) * strength / 5.5);
    if (u > 0 && u < 1 && d > 1e-6) {
      const slope = -6 * u * (1 - u) / width * strength;
      gradX += slope * dx / d; gradZ += slope * dz / d;
      edge = Math.max(edge, 4 * u * (1 - u) * strength / 5.5);
    }
    const ring = t.r * feel.ringWidth, v = (d - t.r) / ring;
    if (sinking > 0 && v > 0 && v < 1 && d > 1e-6) {
      rising -= feel.ring * sinking * strength * 4 * v * (1 - v);
      const slope = -feel.ring * sinking * strength * 4 * (1 - 2 * v) / ring;
      gradX += slope * dx / d; gradZ += slope * dz / d;
    }
  }
  const ground = ease((pos.y - terrain.heightAt(pos.x, pos.z)) / ATMOSPHERE.ground.thermal);
  rising *= ground; gradX *= ground; gradZ *= ground;
  // The background sink fades out as the air rises, so its own slope follows the rising air's.
  const quiet = clamp(rising / feel.calm, 0, 1);
  rising -= feel.background * sinking * (1 - quiet * quiet * (3 - 2 * quiet)) * ground;
  if (quiet > 0 && quiet < 1) {
    const steepen = 1 + feel.background * sinking * ground * 6 * quiet * (1 - quiet) / feel.calm;
    gradX *= steepen; gradZ *= steepen;
  }
  out.thermal = rising;
  // What the wing feels of the slope grows in with the rest above the launch climb.
  out.gradX = gradX * sinking; out.gradZ = gradZ * sinking;
  out.core = core; out.edge = edge;
  out.windY = clamp(out.windY! + rising, -ATMOSPHERE.maximumSink, ATMOSPHERE.maximumLift);
  out.lift = Math.max(0, out.windY!);
  out.sink = Math.max(0, -out.windY!);
  out.hazardSink = 0;
  return out as AtmosphereSample;
}

// The fjord keeps its familiar navigation thermals, now in the same physical air as the game.
export const FJORD_THERMALS = Object.freeze([
  { x: centerX(285) - 14, z: 285, r: 60, s: 5.5 },
  { x: centerX(85) + 18, z: 85, r: 60, s: 5.5 },
  { x: -100, z: -20, r: 60, s: 5.5 },
  { x: centerX(-105) - 12, z: -105, r: 60, s: 5.5 },
  { x: 80, z: -235, r: 60, s: 5.5 },
  { x: -60, z: -250, r: 60, s: 5.5 },
]);
const fjordWeather = { windX: 1.15, windZ: -1.8, thermals: FJORD_THERMALS };
export function sampleFjordAir(pos: Vector3, elapsed = 0, out: AirSample = {}) {
  sampleAtmosphere(pos, fjordWeather, out);
  const agl = pos.y - surfaceAt(pos.x, pos.z);
  // Keep the last metres of a landing readable without changing the wing's response.
  out.windY! *= ease((agl - 4) / 16);
  out.lift = Math.max(0, out.windY!); out.sink = Math.max(0, -out.windY!);
  out.front = 0;
  return out as AtmosphereSample;
}

const fjordPoint = { x: 0, y: 0, z: 0 };
export function fjordWindAt(x: number, y: number, z: number, out: AirSample & Partial<Vector3> = {}) {
  fjordPoint.x = x; fjordPoint.y = y; fjordPoint.z = z;
  sampleFjordAir(fjordPoint, 0, out);
  out.x = out.windX; out.y = out.windY; out.z = out.windZ;
  return out as AtmosphereSample & Vector3;
}
