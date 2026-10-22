import * as THREE from 'three';
import { smoothstep, valueNoise } from '../../domains/flight/ground.ts';

const DEEP = new THREE.Color(0x06101c);
const ROCK = new THREE.Color(0x163a60);
const FROST = new THREE.Color(0xc4e3ff);
const TAU = Math.PI * 2;
const SEGMENTS = 96;
const ROWS = 18;
const EDGE_OPACITY = .018;

interface RidgeProfile {
  name: string; inner: number; outer: number; floor: number; crest: number; relief: number; phase: number; haze: number;
}

/** Distant scenery only: the lesson's ground sampler and physical flight remain unchanged. */
export function createTrainingLandscape() {
  const group = new THREE.Group(); group.name = 'training alpine landscape';
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const ridges: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>[] = [];
  const edges: THREE.LineSegments<THREE.WireframeGeometry, THREE.LineBasicMaterial>[] = [];
  for (const profile of [
    { name: 'training near ridge', inner: 1450, outer: 2380,
      floor: 240, crest: 680, relief: 1000, phase: 0, haze: 1 },
    { name: 'training far ridge', inner: 2420, outer: 3500,
      floor: 340, crest: 650, relief: 900, phase: 1.2, haze: .57 },
  ] satisfies RidgeProfile[]) {
    const positions: number[] = [], colours: number[] = [], indices: number[] = [];
    const colour = new THREE.Color();
    for (let row = 0; row < ROWS; row++) {
      const across = row / (ROWS - 1);
      const shoulder = Math.pow(Math.sin(across * Math.PI), 1.15);
      for (let i = 0; i <= SEGMENTS; i++) {
        // Repeating the first angular sample closes the ridge without a seam in its noise.
        const sample = i % SEGMENTS, regularAngle = sample / SEGMENTS * TAU;
        const jitter = (row % 2 * .35 + Math.sin(sample * 12.9898 + row * 2.4) * .18) *
          TAU / SEGMENTS * shoulder;
        const angle = regularAngle + jitter;
        const folds = Math.sin(angle * 5 + profile.phase) * 48 + Math.sin(angle * 11 - .7) * 20;
        const radius = profile.inner + (profile.outer - profile.inner) * across + folds * shoulder;
        const x = Math.cos(angle) * radius, z = 80 + Math.sin(angle) * radius;
        // Broad saddles separate the peaks. The northern approach opens into a low pass;
        // higher shoulders either side frame the glider instead of forming a uniform wall.
        const massif = .5 - .5 * Math.cos(5 * (angle + Math.PI / 2) + profile.phase);
        const brokenCrest = 90 * Math.sin(angle * 7 + .7 + profile.phase) +
          35 * Math.sin(angle * 13 - .5) +
          (valueNoise(x * .003 + 17, z * .003 + 29) - .5) * 65;
        const crest = profile.crest + profile.relief * massif + brokenCrest;
        const shoulderNoise = (valueNoise(x * .014 + 41, z * .014 + 11) - .5) *
          130 * shoulder;
        const height = profile.floor + (crest - profile.floor) * shoulder + shoulderNoise;
        positions.push(x, height, z);
        const snow = smoothstep(1420, 1830, height +
          (valueNoise(x * .016, z * .016) - .5) * 360);
        colour.copy(DEEP).lerp(ROCK, smoothstep(240, 960, height)).lerp(FROST, snow);
        colour.multiplyScalar(profile.haze);
        colours.push(colour.r, colour.g, colour.b);
        if (row < ROWS - 1 && i < SEGMENTS) {
          const a = row * (SEGMENTS + 1) + i, b = a + SEGMENTS + 1;
          indices.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry(); geometries.add(geometry);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    // Shared scene fog is tuned for the nearby fjord and would erase a kilometre-distant
    // ridge. Elevation colour and the darker second layer provide its atmospheric depth.
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true,
      fog: false, side: THREE.DoubleSide, transparent: true });
    materials.add(material);
    const ridge = new THREE.Mesh(geometry, material); ridge.name = profile.name;
    group.add(ridge); ridges.push(ridge);
    const wireGeometry = new THREE.WireframeGeometry(geometry); geometries.add(wireGeometry);
    const wireMaterial = new THREE.LineBasicMaterial({ color: 0x3b9eff, transparent: true,
      opacity: EDGE_OPACITY, depthWrite: false, fog: false });
    materials.add(wireMaterial);
    const wire = new THREE.LineSegments(wireGeometry, wireMaterial);
    wire.name = `${profile.name} edges`; group.add(wire); edges.push(wire);
  }

  let disposed = false;
  return {
    group,
    update({ lowDetail = false, opacity = 1 }: { lowDetail?: boolean; opacity?: number } = {}) {
      if (disposed) return;
      const alpha = Math.max(0, Math.min(1, opacity));
      ridges.forEach((ridge, i) => {
        ridge.visible = alpha > .01 && (!lowDetail || i === 0);
        ridge.material.opacity = alpha; ridge.material.depthWrite = alpha >= .99;
      });
      edges.forEach(wire => { wire.visible = alpha > .01 && !lowDetail; wire.material.opacity = alpha * EDGE_OPACITY; });
    },
    dispose() {
      if (disposed) return;
      disposed = true; group.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      group.clear();
    },
  };
}
