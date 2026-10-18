import * as THREE from 'three';
import { EXPERIENCE, SECTIONS } from '../content.js';
import { GATEWAY, PLATEAUS, centerX, heightAt, shore, smoothstep, surfaceAt, valueNoise } from './ground.js';

// The shape of the land is ground.js's, free of 3D code so a run can be flown without it; what is
// built on it here (the places' labels, the stones, the forest, the meshes) is the page's.
export { GATEWAY, centerX, heightAt, surfaceAt };

// World units are roughly metres. North is -z, east is +x, the fjord surface is y = 0.
export const WORLD = { halfX: 320, north: -450, south: 450, ceiling: 420 };

// Places to land, one per page section: each plateau ground.js cuts, with its label and name from
// the section with the same id.
export const ZONES = PLATEAUS.map((zone) => {
  const section = SECTIONS.find((candidate) => candidate.id === zone.id);
  return { ...zone, label: section.file, place: section.place };
});

const ridge = ZONES.find((zone) => zone.id === 'experience');

// The career timeline, one stone per role: flying north along the east shore you pass them oldest
// first, each a little taller, and the newest stands on the plateau above.
export const STONES = [...EXPERIENCE].reverse().map((entry, i, all) => {
  const newest = i === all.length - 1;
  const z = ridge.z + (newest ? 0 : 32 * (all.length - 1 - i));
  const x = shore(z, 1, newest ? 92 : 34 + 6 * i);
  const height = 9 + 2 * i + (newest ? 1 : 0);
  return { years: entry.years, role: entry.role, company: entry.company, height, x, z, y: surfaceAt(x, z) };
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

// Leave a longer northward lead-in before turning east through the arch.
export const START = { x: centerX(340), y: 100, z: 375, yaw: 0 };

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
    if (Math.abs(z - GATEWAY.z) < 40 && x > GATEWAY.x - 85 && x < GATEWAY.x + 35) continue;
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
