import * as THREE from 'three';

// World units are roughly metres. North is -z, east is +x, the fjord surface is y = 0.
export const WORLD = { halfX: 320, north: -450, south: 450, ceiling: 420 };

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;

function hash(ix, iz) {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x, z) {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    value += amp * valueNoise(x * freq, z * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return value;
}

// The fjord is a meandering channel running south to north.
export const centerX = (z) => 46 * Math.sin(z * 0.011) + 22 * Math.sin(z * 0.026 + 1.3);
const halfWidth = (z) => 42 + 12 * Math.sin(z * 0.019 + 0.5);
const shore = (z, side, off) => centerX(z) + side * (halfWidth(z) + off);

function rawHeight(x, z) {
  const d = Math.abs(x - centerX(z));
  const t = smoothstep(halfWidth(z) - 10, halfWidth(z) + 190, d);
  let h = -9 + Math.pow(t, 1.25) * 185;
  h += (fbm(x * 0.018, z * 0.018) - 0.47) * (10 + 95 * t);
  h += (fbm(x * 0.07 + 40, z * 0.07) - 0.47) * (2 + 10 * t);
  h += smoothstep(-340, -440, z) * 130; // the head of the fjord closes in the north
  h = mix(h, -9, smoothstep(350, 445, z)); // and it opens to the sea in the south
  h = mix(h, -9, smoothstep(268, 318, Math.abs(x))); // the massif falls back into the sea at its edges
  return mix(h, -9, smoothstep(-425, -449, z));
}

// Places to land. `side` picks the shore (+1 east, -1 west, 0 mid-fjord), `off` is metres inland.
export const ZONES = [
  { id: 'about', label: 'about.md', place: 'the hall', z: 170, side: 1, off: 44, r: 26 },
  { id: 'projects', label: 'projects/', place: 'the forge', z: -10, side: -1, off: 46, r: 26 },
  { id: 'experience', label: 'experience.log', place: 'rune ridge', z: -190, side: 1, off: 80, r: 24 },
  { id: 'contact', label: 'contact.sh', place: 'the beacon', z: -300, side: 0, off: 0, r: 22, h: 7 },
].map((zone) => {
  const x = shore(zone.z, zone.side, zone.off);
  const h = zone.h ?? Math.min(70, Math.max(7, rawHeight(x, zone.z)));
  return { ...zone, x, h };
});

// Terrain height with a flat plateau cut for each landing zone.
export function heightAt(x, z) {
  let h = rawHeight(x, z);
  for (const zone of ZONES) {
    const dist = Math.hypot(x - zone.x, z - zone.z);
    if (dist < zone.r * 2.2) h = mix(zone.h, h, smoothstep(zone.r, zone.r * 2.2, dist));
  }
  return h;
}

export const surfaceAt = (x, z) => Math.max(0, heightAt(x, z));

const ridge = ZONES.find((zone) => zone.id === 'experience');

// The career timeline: flying north along the east shore you pass the stones in order, and the
// newest stands on the plateau above them.
export const STONES = [
  { years: '2012 – 2014', role: 'Junior Engineer', south: 96, off: 34, height: 9 },
  { years: '2014 – 2017', role: 'Software Engineer', south: 64, off: 40, height: 11 },
  { years: '2017 – 2021', role: 'Senior Engineer', south: 32, off: 46, height: 13 },
  { years: '2021 – now', role: 'Staff Engineer', south: 0, off: 92, height: 16 },
].map((stone) => {
  const z = ridge.z + stone.south;
  const x = shore(z, 1, stone.off);
  return { ...stone, x, z, y: surfaceAt(x, z) };
});

const forge = ZONES.find((zone) => zone.id === 'projects');

// Columns of rising air. `s` is the climb rate in m/s across the core; lift fades out toward `r`.
// Keep them clear of the water just south of each place: map teleports glide in from there.
export const THERMALS = [
  { x: centerX(285) - 14, z: 285, r: 46, s: 5.5 },
  { x: centerX(85) + 18, z: 85, r: 44, s: 5.5 },
  { x: forge.x - 34, z: forge.z - 10, r: 36, s: 6 },
  { x: centerX(-105) - 12, z: -105, r: 46, s: 6 },
  { x: shore(-235, 1, 26), z: -235, r: 38, s: 5.5 },
  { x: shore(-250, -1, 20), z: -250, r: 40, s: 5.5 },
].map((thermal) => ({ ...thermal, y: surfaceAt(thermal.x, thermal.z) }));

export const START = { x: centerX(340), y: 95, z: 340, yaw: 0 };

const DEEP = new THREE.Color(0x06101c);
const ROCK = new THREE.Color(0x163a60);
const FROST = new THREE.Color(0xc4e3ff);

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Where the forest and the loose rock go. Fixed seeds keep the world the same on every visit.
function scatter(seed, limit, pick) {
  const rand = mulberry32(seed);
  const spots = [];
  for (let tries = 0; tries < 9000 && spots.length < limit; tries++) {
    const x = (rand() * 2 - 1) * (WORLD.halfX - 40);
    const z = WORLD.north + 30 + rand() * (WORLD.south - WORLD.north - 60);
    const h = heightAt(x, z);
    const tilt = Math.max(Math.abs(heightAt(x + 2, z) - h), Math.abs(heightAt(x, z + 2) - h));
    if (ZONES.some((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.r * 1.3)) continue;
    if (STONES.some((stone) => Math.hypot(x - stone.x, z - stone.z) < 16)) continue;
    const spot = pick(h, tilt, rand);
    if (spot) spots.push({ x, z, turn: rand() * Math.PI * 2, ...spot });
  }
  return spots;
}

// `scale` multiplies the tree model's height; for boulders it is the longest side in metres.
export const TREES = scatter(7, 700, (h, tilt, rand) =>
  h > 2.5 && h < 88 && tilt < 2.4 ? { y: h - 0.3, scale: 0.7 + rand() * 0.9 } : null,
);
export const BOULDERS = scatter(11, 150, (h, tilt, rand) => {
  const size = 2 + rand() * rand() * 7;
  return h > 0.4 && h < 125 && tilt < 4.5 ? { y: h - size * 0.12, scale: size } : null;
});

// Plain cones stand in for the forest until the tree model has loaded.
function buildCones() {
  const geo = new THREE.ConeGeometry(1.7, 6.5, 5);
  geo.translate(0, 3.25, 0);
  const cones = new THREE.InstancedMesh(
    geo,
    new THREE.MeshLambertMaterial({ color: 0x1b4a6e, flatShading: true }),
    TREES.length,
  );
  const spot = new THREE.Object3D();
  TREES.forEach((tree, i) => {
    spot.position.set(tree.x, tree.y, tree.z);
    spot.rotation.y = tree.turn;
    spot.scale.setScalar(tree.scale);
    spot.updateMatrix();
    cones.setMatrixAt(i, spot.matrix);
  });
  return cones;
}

function buildWater() {
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        float wave = sin(p.x * 0.33 + uTime * 0.7 + sin(p.y * 0.19) * 2.0) * sin(p.y * 0.47 - uTime * 0.5);
        float glint = smoothstep(0.9, 1.0, wave);
        vec3 col = mix(vec3(0.006, 0.03, 0.07), vec3(0.1, 0.5, 0.75), glint * 0.5);
        gl_FragColor = vec4(col, 0.92);
        #include <fog_fragment>
      }`,
    transparent: true,
    fog: true,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), material);
  water.rotation.x = -Math.PI / 2;
  return water;
}

export function buildTerrain() {
  const group = new THREE.Group();

  const geo = new THREE.PlaneGeometry(WORLD.halfX * 2, WORLD.south - WORLD.north, 128, 180);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const snow = smoothstep(100, 148, h + (valueNoise(x * 0.05, z * 0.05) - 0.5) * 50);
    color.copy(DEEP).lerp(ROCK, smoothstep(-4, 75, h)).lerp(FROST, snow);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const land = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  );
  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x3b9eff, transparent: true, opacity: 0.16 }),
  );
  const water = buildWater();
  const cones = buildCones();

  group.add(land, wire, cones, water);
  return { group, cones, update: (time) => (water.material.uniforms.uTime.value = time) };
}
