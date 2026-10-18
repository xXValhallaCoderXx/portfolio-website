import { centerX, surfaceAt } from './ground.js';

export const ATMOSPHERE = Object.freeze({
  grid: 16, ridgeReach: 96, maximumLift: 6, maximumSink: 6,
  probes: Object.freeze([24, 48, 72, 96]),
  ridge: Object.freeze({ relief: 14, reliefRange: 72, support: 24, grade: 0.04, gradeRange: 0.4,
    fraction: 1.10, maximum: 3.5, usefulHeight: 55, ceiling: 120, normalSpan: 48, deflection: 0.45 }),
  lee: Object.freeze({ height: 80, fraction: 0.6, slope: 0.7, blocked: 0.35,
    crestMargin: 12, depth: 65, relief: 20, shelter: 0.65, rough: 0.35 }),
  ground: Object.freeze({ start: 1, range: 9, thermal: 8 }),
});
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const ease = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
export const thermalProfile = (distance, radius, fade = 1) => ease((radius - distance) / (radius * fade));

/** A cached height field, shared by Node replay and the browser. Synthetic terrain is injectable.
 * The default bounds span whole cells about the origin so mirrored faces sample identically. */
export function createTerrainAir(height = surfaceAt, { step = ATMOSPHERE.grid, minX = -400, maxX = 400, minZ = -528, maxZ = 528 } = {}) {
  const width = Math.ceil((maxX - minX) / step) + 1;
  const depth = Math.ceil((maxZ - minZ) / step) + 1;
  let grid;
  function terrain(x, z) {
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
  function sample(pos, windX, windZ, out = {}) {
    const R = ATMOSPHERE.ridge, L = ATMOSPHERE.lee, G = ATMOSPHERE.ground;
    const speed = Math.sqrt(windX * windX + windZ * windZ);
    const h = terrain(pos.x, pos.z), agl = Math.max(0, pos.y - h);
    const ground = ease((agl - G.start) / G.range);
    out.ambientX = windX; out.ambientZ = windZ;
    out.crestHeight = h; out.thermal = 0;
    if (speed < 1e-8 || pos.y <= h) {
      out.windX = out.windY = out.windZ = out.ridge = out.lee = out.rough = 0;
      return out;
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
    return out;
  }
  return { sample, heightAt: terrain };
}

const terrain = createTerrainAir();

/** The one environmental field. Vertical diagnostics are aliases, never extra forces. */
export function sampleAtmosphere(pos, weather, out = {}) {
  terrain.sample(pos, weather.windX ?? 0, weather.windZ ?? 0, out);
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
  out.windY = clamp(out.windY + rising, -ATMOSPHERE.maximumSink, ATMOSPHERE.maximumLift);
  out.lift = Math.max(0, out.windY);
  out.sink = Math.max(0, -out.windY);
  out.hazardSink = 0;
  return out;
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
export function sampleFjordAir(pos, elapsed = 0, out = {}) {
  sampleAtmosphere(pos, fjordWeather, out);
  const agl = pos.y - surfaceAt(pos.x, pos.z);
  // Keep the last metres of a landing readable without changing the wing's response.
  out.windY *= ease((agl - 4) / 16);
  out.lift = Math.max(0, out.windY); out.sink = Math.max(0, -out.windY);
  out.front = 0;
  return out;
}

const fjordPoint = { x: 0, y: 0, z: 0 };
export function fjordWindAt(x, y, z, out = {}) {
  fjordPoint.x = x; fjordPoint.y = y; fjordPoint.z = z;
  sampleFjordAir(fjordPoint, 0, out);
  out.x = out.windX; out.y = out.windY; out.z = out.windZ;
  return out;
}
