import * as THREE from 'three';
import { surfaceAt } from './ground.js';
import { createWindFlow, WIND_FLOW } from './wind-flow.js';

export const WIND_STREAKS = Object.freeze({
  count: 140, front: 60, leads: 4, box: Object.freeze([180, 65, 180]), above: 45, margin: 0.15,
  flow: 1, stretch: 3, length: Object.freeze([3, 26]), still: 0.3,
  glow: Object.freeze([0.2, 0.045]), gust: 0.85, twinkle: 0.25, shimmer: Object.freeze([0.5, 1.3]),
  near: Object.freeze([8, 20]), clear: Object.freeze([2.5, 8]), rise: 3, floor: 8,
  frontLength: Object.freeze([16, 26]), curtain: Object.freeze([30, 60]), window: Object.freeze([100, 180]), swap: 0.5,
  lead: Object.freeze({ drop: 6, glow: 0.3 }), resample: 1, jump: 40,
  calm: Object.freeze({ share: 0.6, flow: 1 }), unbloomed: 1.6,
  colour: 0xbfe9ff, gustColour: 0xeaf8ff, liftColour: 0xffd494,
  ridgeShare: 0.35, ridgeRefresh: 0.5, ridgeSpacing: 30,
});
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const ease = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const sequence = (n, axis) => (0.5 + [0.8191725133961644, 0.671043606703789, 0.5497004779019701][axis] * (n + 1)) % 1;

/** Fixed pools of locally advected 3D air. Sampling and drawing never advance the simulation. */
export function createWindStreaks({ scene, order = 0, calm = false, sky = null, heightAt = surfaceAt }) {
  const W = WIND_STREAKS, steady = W.count, fronts = W.front, leading = steady + fronts;
  const positions = new Float32Array((leading + W.leads) * 6);
  const colours = new Float32Array(positions.length);
  const particles = new Float64Array(steady * 3);
  const seeds = new Float64Array((steady + fronts) * 3);
  for (let i = 0; i < steady + fronts; i++) for (let a = 0; a < 3; a++) seeds[i * 3 + a] = sequence(i, a);
  const geo = new THREE.BufferGeometry();
  const places = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const tints = new THREE.BufferAttribute(colours, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', places); geo.setAttribute('color', tints);
  const material = new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
  const lines = new THREE.LineSegments(geo, material);
  lines.name = 'wind-streaks'; lines.frustumCulled = false; lines.renderOrder = order; lines.visible = false;
  scene.add(lines);
  const flow = createWindFlow({ heightAt });
  const ribbons = createRibbons(lines, flow, calm, order);
  const air = new THREE.Color(W.colour), gust = new THREE.Color(W.gustColour), lift = new THREE.Color(W.liftColour);
  const probe = { x: 0, y: 0, z: 0, front: 0 };
  let awake = false, disposed = false, clock = 0, lastX = 0, lastY = 0, lastZ = 0, previousCount = 0;
  const ridge = { live: false, x: 0, y: 0, z: 0, ux: 1, uz: 0 };
  let ridgeAt = 0;

  function sample(windAt, x, y, z) {
    probe.x = probe.y = probe.z = probe.front = 0;
    probe.windX = probe.windY = probe.windZ = undefined;
    probe.ridge = probe.lee = 0;
    probe.crestHeight = probe.ambientX = probe.ambientZ = undefined;
    windAt(x, y, z, probe);
    // The public callback may provide either the field's names or its renderer aliases.
    if (Number.isFinite(probe.windX)) probe.x = probe.windX;
    if (Number.isFinite(probe.windY)) probe.y = probe.windY;
    if (Number.isFinite(probe.windZ)) probe.z = probe.windZ;
    if (!Number.isFinite(probe.x)) probe.x = 0;
    if (!Number.isFinite(probe.y)) probe.y = 0;
    if (!Number.isFinite(probe.z)) probe.z = 0;
  }
  // Redistribute part of the existing pool to the nearby terrain flow. A sparse search twice a
  // second finds a windward face (or its lee); particle motion still samples the actual field.
  function findRidge(pos, windAt) {
    const was = ridge.live, oldX = ridge.x, oldZ = ridge.z;
    ridge.live = false;
    let best = 0.2;
    for (let ix = -2; ix <= 2; ix++) for (let iz = -2; iz <= 2; iz++) {
      const x = pos.x + ix * W.ridgeSpacing, z = pos.z + iz * W.ridgeSpacing;
      const y = Math.max(pos.y, heightAt(x, z) + 12);
      if (y > pos.y + W.above - 12) continue;
      sample(windAt, x, y, z);
      const score = ((probe.ridge || 0) + (probe.lee || 0) * 0.6) / (1 + Math.hypot(x - pos.x, z - pos.z) / 90);
      if (score <= best) continue;
      const wx = probe.ambientX ?? probe.x, wz = probe.ambientZ ?? probe.z, speed = Math.hypot(wx, wz);
      if (speed < W.still) continue;
      best = score;
      ridge.live = true;
      ridge.x = x; ridge.z = z;
      ridge.y = Number.isFinite(probe.crestHeight) ? clamp(probe.crestHeight - 6, pos.y - 8, pos.y + 20) : y;
      ridge.ux = wx / speed; ridge.uz = wz / speed;
    }
    ridgeAt = clock + W.ridgeRefresh;
    return ridge.live && (!was || Math.hypot(ridge.x - oldX, ridge.z - oldZ) > 30);
  }
  function reset(i, pos, nearRidge = false, floor = -Infinity) {
    const k = i * 3;
    if (nearRidge && ridge.live) {
      const along = (seeds[k] - 0.5) * 36, across = (seeds[k + 2] - 0.5) * 64;
      const x = clamp(ridge.x + ridge.ux * along - ridge.uz * across, pos.x - 72, pos.x + 72);
      const z = clamp(ridge.z + ridge.uz * along + ridge.ux * across, pos.z - 72, pos.z + 72);
      const low = Math.max(pos.y - 12, heightAt(x, z) + 14, floor + 10);
      const high = pos.y + W.above - 8;
      if (low < high) {
        particles[k] = x; particles[k + 2] = z;
        particles[k + 1] = clamp(ridge.y - 18 + seeds[k + 1] * 40, low, high);
        return;
      }
    }
    particles[k] = pos.x + (seeds[k] - 0.5) * W.box[0];
    particles[k + 1] = pos.y - (W.box[1] - W.above) + seeds[k + 1] * W.box[1];
    particles[k + 2] = pos.z + (seeds[k + 2] - 0.5) * W.box[2];
  }
  function distanceToSegment(x, y, z, ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = dx * dx + dy * dy + dz * dz;
    const t = len > 1e-9 ? clamp(((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / len, 0, 1) : 0;
    return Math.sqrt((x - ax - dx * t) ** 2 + (y - ay - dy * t) ** 2 + (z - az - dz * t) ** 2);
  }
  function draw(i, x, y, z, pos, eye, base, weight, front, bright) {
    const speed = Math.sqrt(probe.x * probe.x + probe.y * probe.y + probe.z * probe.z);
    if (speed <= W.still || weight <= 0) return;
    const half = clamp(speed * W.stretch, W.length[0], W.length[1]) / 2;
    const ux = probe.x / speed, uy = probe.y / speed, uz = probe.z / speed;
    const ax = x - ux * half, ay = y - uy * half, az = z - uz * half;
    const bx = x + ux * half, by = y + uy * half, bz = z + uz * half;
    const floor = Math.max(base, heightAt(ax, az) + 1, heightAt(bx, bz) + 1);
    const edge = Math.min((W.box[0] / 2 - Math.abs(x - pos.x) - Math.abs(ux) * half) / 14, (W.box[2] / 2 - Math.abs(z - pos.z) - Math.abs(uz) * half) / 14,
      (y - pos.y + W.box[1] - W.above - Math.abs(uy) * half) / 8, (pos.y + W.above - y - Math.abs(uy) * half) / 8);
    let glow = weight * ease(W.still, 2 * W.still, speed) * ease(floor, floor + W.floor, Math.min(ay, by));
    if (!front) glow *= clamp(edge, 0, 1);
    const near = distanceToSegment(eye.x, eye.y, eye.z, ax, ay, az, bx, by, bz);
    // Sample both ends and the centre against the glider sightline; longer segments receive
    // a conservative half-length allowance so nothing cuts through the wing on a steep updraft.
    const clear = distanceToSegment(x, y, z, eye.x, eye.y, eye.z, pos.x, pos.y + W.rise, pos.z) - half;
    glow *= ease(W.near[0], W.near[1], near) * ease(W.clear[0], W.clear[1], clear);
    glow *= front ? W.gust : W.glow[0] + W.glow[1] * speed;
    if (!calm) glow *= 1 - W.twinkle * (0.5 + 0.5 * Math.sin(clock * 0.8 + i));
    if (bright) glow *= W.unbloomed;
    const warm = ease(1.55, 3, probe.y), white = clamp(probe.front, 0, 1);
    const r = air.r + (lift.r - air.r) * warm + (gust.r - air.r) * white;
    const g = air.g + (lift.g - air.g) * warm + (gust.g - air.g) * white;
    const b = air.b + (lift.b - air.b) * warm + (gust.b - air.b) * white;
    const p = i * 6;
    positions[p] = ax; positions[p + 1] = ay; positions[p + 2] = az;
    positions[p + 3] = bx; positions[p + 4] = by; positions[p + 5] = bz;
    colours[p + 3] = glow * r; colours[p + 4] = glow * g; colours[p + 5] = glow * b;
  }
  function update(dt, pos, eye, windAt, level, floor, gusts, bright) {
    if (disposed) return;
    if (!(level > 0)) {
      if (awake) { colours.fill(0); tints.needsUpdate = true; }
      flow.update(dt, pos, eye, windAt, 0, floor); ribbons.mesh.visible = false;
      lines.visible = awake = false; return;
    }
    const step = Math.max(0, Math.min(0.1, dt));
    const fresh = !awake || Math.abs(pos.x - lastX) > W.jump || Math.abs(pos.y - lastY) > W.jump || Math.abs(pos.z - lastZ) > W.jump;
    clock += step;
    const count = Math.ceil(steady * Math.min(1, level) * (calm ? W.calm.share : 1));
    const ridgeCount = Math.ceil(count * W.ridgeShare);
    colours.fill(0);
    const base = Number.isFinite(floor) ? floor : -1e9;
    flow.update(step, pos, eye, windAt, level, base);
    ribbons.draw(pos, eye, level, base, bright);
    const changed = (fresh || clock >= ridgeAt) && findRidge(pos, windAt);
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      const nearRidge = i < ridgeCount;
      if (fresh || i >= previousCount || (changed && nearRidge)) reset(i, pos, nearRidge, base);
      sample(windAt, particles[k], particles[k + 1], particles[k + 2]);
      particles[k] += probe.x * step; particles[k + 1] += probe.y * step; particles[k + 2] += probe.z * step;
      if (Math.abs(particles[k] - pos.x) > W.box[0] / 2 || Math.abs(particles[k + 2] - pos.z) > W.box[2] / 2 ||
        particles[k + 1] > pos.y + W.above || particles[k + 1] < pos.y - (W.box[1] - W.above)) {
        reset(i, pos, nearRidge, base);
        sample(windAt, particles[k], particles[k + 1], particles[k + 2]);
      }
      sample(windAt, particles[k], particles[k + 1], particles[k + 2]);
      draw(i, particles[k], particles[k + 1], particles[k + 2], pos, eye, base, 1, false, bright);
    }
    if (sky && gusts) for (let j = 0; j < fronts; j++) {
      const band = gusts[j % gusts.length];
      if (!band || !(band.strength > 0)) continue;
      const i = steady + j, k = i * 3;
      const along = band.at - 10 - seeds[k] * Math.max(1, sky.gust.depth - 20);
      const aside = band.lane + (2 * seeds[k + 1] - 1) * (sky.gust.half - sky.gust.soft);
      const x = sky.zone.x + band.ux * along - band.uz * aside;
      const z = sky.zone.z + band.uz * along + band.ux * aside;
      const y = pos.y - 20 + seeds[k + 2] * 65;
      sample(windAt, x, y, z);
      draw(i, x, y, z, pos, eye, base, clamp(probe.front, 0, 1) * Math.min(1, level), true, bright);
    }
    previousCount = count; awake = lines.visible = true;
    lastX = pos.x; lastY = pos.y; lastZ = pos.z;
    places.needsUpdate = tints.needsUpdate = true;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; flow.dispose(); ribbons.dispose(); lines.removeFromParent(); geo.dispose(); material.dispose();
  }
  return { lines, ribbons: ribbons.mesh, flow, update, dispose };
}

// Thin, connected ribbons establish a world reference, while timed arrowheads travel along the
// sampled air path. Geometry and shader storage are fixed at construction, including hidden slots.
function createRibbons(parent, flow, calm, order) {
  const F = WIND_FLOW, segments = F.points - 1, vertices = F.count * segments * 6;
  const positions = new Float32Array(vertices * 3), colours = new Float32Array(vertices * 4);
  const sides = new Float32Array(vertices), travel = new Float32Array(vertices), phases = new Float32Array(vertices);
  const ends = [0, 1, 0, 1, 1, 0], edges = [-1, -1, 1, -1, 1, 1];
  for (let i = 0; i < F.count; i++) for (let j = 0; j < segments; j++) for (let v = 0; v < 6; v++) {
    const k = (i * segments + j) * 6 + v;
    sides[k] = edges[v]; travel[k] = (j + ends[v]) * F.seconds;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('flowTint', new THREE.BufferAttribute(colours, 4).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('flowSide', new THREE.BufferAttribute(sides, 1));
  geometry.setAttribute('flowTravel', new THREE.BufferAttribute(travel, 1));
  geometry.setAttribute('flowPhase', new THREE.BufferAttribute(phases, 1).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: false, toneMapped: false,
    uniforms: { clock: { value: 0 }, boost: { value: 1 } },
    vertexShader: `
      attribute vec4 flowTint; attribute float flowSide, flowTravel, flowPhase;
      varying vec4 tint; varying float side, travel, phase;
      void main() {
        tint=flowTint; side=flowSide; travel=flowTravel; phase=flowPhase;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
    fragmentShader: `
      uniform float clock, boost;
      varying vec4 tint; varying float side, travel, phase;
      void main() {
        float behind=mod(clock-travel+phase,${F.period.toFixed(1)});
        float arrow=step(behind,.85)*smoothstep(0.,.85,behind);
        float tail=(1.-smoothstep(.85,4.,behind))*.18;
        float width=max(.11,max(arrow,tail));
        float edge=1.-smoothstep(width*.70,width,abs(side));
        float alpha=tint.a*edge*(.30+.65*step(behind,.85));
        if(alpha<.004) discard;
        float contrast=mix(.32,1.,1.-smoothstep(width*.40,width*.80,abs(side)));
        gl_FragColor=vec4(tint.rgb*contrast*boost,alpha);
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'cliff-wind-ribbons'; mesh.frustumCulled = false; mesh.renderOrder = order + 0.01; mesh.visible = false;
  parent.add(mesh);
  const cool = new THREE.Color(F.ambient), warm = new THREE.Color(F.lift), lee = new THREE.Color(F.lee);
  function draw(pos, eye, level, floor, bright) {
    colours.fill(0);
    const paths = flow.paths;
    for (let i = 0; i < F.count; i++) {
      const count = flow.counts[i], fade = flow.fades[i] * Math.min(1, level);
      if (count < 2 || fade <= 0) continue;
      for (let j = 0; j < count - 1; j++) {
        const a = (i * F.points + j) * 3, b = a + 3;
        const ax = paths[a], ay = paths[a + 1], az = paths[a + 2], bx = paths[b], by = paths[b + 1], bz = paths[b + 2];
        const x = (ax + bx) / 2, y = (ay + by) / 2, z = (az + bz) / 2;
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const ex = eye.x - x, ey = eye.y - y, ez = eye.z - z;
        const distance = Math.hypot(ex, ey, ez), half = Math.hypot(dx, dy, dz) / 2;
        let sx = dy * ez - dz * ey, sy = dz * ex - dx * ez, sz = dx * ey - dy * ex;
        const sideLength = Math.hypot(sx, sy, sz);
        if (sideLength < 1e-6) { sx = 1; sy = sz = 0; }
        else { sx /= sideLength; sy /= sideLength; sz /= sideLength; }
        const width = clamp(distance * 0.0045, F.width[0], F.width[1]);
        sx *= width; sy *= width; sz *= width;
        const lx = pos.x - eye.x, ly = pos.y + 3 - eye.y, lz = pos.z - eye.z;
        const lineLength = lx * lx + ly * ly + lz * lz;
        const along = lineLength > 1e-9 ? clamp(((x - eye.x) * lx + (y - eye.y) * ly + (z - eye.z) * lz) / lineLength, 0, 1) : 0;
        const clear = Math.hypot(x - eye.x - lx * along, y - eye.y - ly * along, z - eye.z - lz * along) - half - width;
        let alpha = fade * ease(12, 28, distance) * ease(3, 10, clear) * (1 - ease(180, F.retire, distance));
        alpha *= ease(floor + 2, floor + 10, Math.min(ay, by));
        alpha *= ease(0, 3, j + 1) * ease(0, 3, count - 1 - j);
        const rise = (flow.vertical[i * F.points + j] + flow.vertical[i * F.points + j + 1]) / 2;
        const lift = ease(1.55, 3, rise), sink = ease(0.2, 2, -rise);
        const r = cool.r + (warm.r - cool.r) * lift + (lee.r - cool.r) * sink;
        const g = cool.g + (warm.g - cool.g) * lift + (lee.g - cool.g) * sink;
        const blue = cool.b + (warm.b - cool.b) * lift + (lee.b - cool.b) * sink;
        for (let v = 0; v < 6; v++) {
          const k = (i * segments + j) * 6 + v, p = k * 3, c = k * 4;
          const end = ends[v], edge = edges[v];
          positions[p] = (end ? bx : ax) + sx * edge;
          positions[p + 1] = (end ? by : ay) + sy * edge;
          positions[p + 2] = (end ? bz : az) + sz * edge;
          colours[c] = r; colours[c + 1] = g; colours[c + 2] = blue; colours[c + 3] = alpha;
          phases[k] = flow.anchors[i].phase;
        }
      }
    }
    material.uniforms.clock.value = calm ? 0 : flow.state.clock;
    material.uniforms.boost.value = bright ? 1.35 : 1;
    geometry.attributes.position.needsUpdate = geometry.attributes.flowTint.needsUpdate = geometry.attributes.flowPhase.needsUpdate = true;
    mesh.visible = flow.state.active > 0;
  }
  function dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); }
  return { mesh, draw, dispose };
}
