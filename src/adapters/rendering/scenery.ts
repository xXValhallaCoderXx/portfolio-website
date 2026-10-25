import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { AirSample, Vector3 } from '../../domains/flight/models.ts';
import type { WindSampler } from '../../domains/flight/wind-flow.ts';
import type { ModelLoader, GliderAir, GliderPose, GliderMeasure, CanvasSurface } from './rendering.types.ts';
import { firstMesh, firstSkinnedMesh, isMesh, isSkinnedMesh } from './mesh.ts';
type Zone = typeof ZONES[number];
interface Anchor { onPilot: THREE.Vector3; part: 'chest' | 'fist'; side: number; onWing: THREE.Vector3; bone?: THREE.Object3D; onBone?: THREE.Vector3 }
interface Joint { bone: THREE.Object3D; rest: THREE.Quaternion; toLocal: THREE.Quaternion }
interface Furniture { model: string; size: number; at: [number, number]; faces: 'water' | 'south' | 'north' | 'uphill'; light?: [number, number, number, number]; standIn?: () => THREE.Object3D; tall?: number; fire?: number }
interface KitParts {
  livery: () => Promise<Pick<typeof import('./livery.ts'), 'LIVERIES' | 'wingUv' | 'liveryTexture'>>;
  harness: () => Promise<{ HARNESSES: typeof import('./harness.ts').HARNESSES; harnessTexture: (id: string, source: THREE.Texture | null, options?: { canvas?: CanvasSurface; base?: string }) => Promise<THREE.Texture> }>;
  helmet: () => Promise<Pick<typeof import('./helmet.ts'), 'makeHelmet' | 'wearHelmet'>>;
  canvas: () => CanvasSurface; readonly base: string;
}
interface WornKit { wing?: string; harness?: string; helmet?: boolean }
type GliderRig = Awaited<ReturnType<typeof loadGliderModels>> & {
  body: THREE.SkinnedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null;
  pilotMaterial: THREE.MeshStandardMaterial | undefined;
  lines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  marks: ReturnType<typeof landmarks>; material: THREE.MeshStandardMaterial;
  base: { pivot: THREE.Vector3; wing: THREE.Vector3; pilot: THREE.Vector3; scale: number };
};

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneModel } from 'three/addons/utils/SkeletonUtils.js';
import { PROJECTS } from '../../domains/portfolio/content.ts';
import { ZONES, STONES, TREES, BOULDERS, GATEWAY, heightAt } from './terrain.ts';
import { APPROACH_WINDS } from '../../domains/flight/approach.ts';
import { BRAKE } from '../../domains/flight/flight.ts';
import { FJORD_THERMALS, fjordWindAt, sampleFjordAir } from '../../domains/flight/atmosphere.ts';
import { createNordicSky } from './nordic-sky.ts';

const FILL = 0x0a1a2c;
const LINE = 0x4fb8ff;
const CYAN = 0x5ee6ff;
const EMBER = 0xff9a3c;
const WARM = 0xffb066;

// Generated models, shrunk into public/models/ by tools/optimize-models.mjs. Each file is 1 unit
// along its longest side with its base at the origin, so `size` is that side in metres.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const files = new Map<string, Promise<GLTF>>();

const fetchModel = (name: string) => {
  if (!files.has(name)) files.set(name, loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`));
  return files.get(name)!;
};

/** Fetches a model into the cache without making one, so it is at hand when first wanted. */
export function prefetchModel(name: string) {
  return fetchModel(name).then(() => true, () => false);
}

export function loadModel(name: string, size: number, selfLight = 0.07) {
  return fetchModel(name).then((file: { scene: THREE.Object3D<THREE.Object3DEventMap>; }) => {
    const model = cloneModel(file.scene); // unlike a plain clone, this keeps a skeleton attached to its skin
    model.scale.setScalar(size);
    model.traverse((part) => {
      if (!isMesh(part) || part.material.userData.lit) return;
      // A little of its own light keeps a model readable against the night.
      part.material.userData.lit = true;
      part.material.emissive.set(0xffffff);
      part.material.emissiveMap = part.material.map;
      part.material.emissiveIntensity = selfLight;
    });
    return model;
  });
}

// Turns the turquoise paint in a model's carvings into light, so the runes shine after dark.
function carvedGlow(model: THREE.Object3D<THREE.Object3DEventMap>) {
  model.traverse((part) => {
    if (!isMesh(part) || part.material.userData.carved) return;
    const { material } = part;
    if (!material.map?.image) return;
    const image = material.map.image as CanvasImageSource & { width: number; height: number };
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const paint = Math.max(0, Math.min(pixels.data[i + 1], pixels.data[i + 2]) - pixels.data[i] - 18) * 4;
      pixels.data[i] = paint * 0.25;
      pixels.data[i + 1] = paint * 0.9;
      pixels.data[i + 2] = paint;
    }
    ctx.putImageData(pixels, 0, 0);
    const mask = new THREE.CanvasTexture(canvas);
    mask.flipY = material.map.flipY;
    mask.colorSpace = THREE.SRGBColorSpace;
    mask.offset.copy(material.map.offset);
    mask.repeat.copy(material.map.repeat);
    material.userData.carved = true;
    material.emissiveMap = mask;
    material.emissiveIntensity = 1.8;
  });
}

// Dark body with glowing edges: the look shared by every built thing in the world.
function solid(geo: THREE.ExtrudeGeometry|THREE.BoxGeometry|THREE.CylinderGeometry, { fill = FILL, line = LINE, opacity = 0.95 } = {}) {
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: fill }));
  mesh.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 20),
      new THREE.LineBasicMaterial({ color: line, transparent: true, opacity }),
    ),
  );
  return mesh;
}

function glow(geo: THREE.BoxGeometry|THREE.PlaneGeometry|THREE.ConeGeometry, color = EMBER) {
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
}

function gableRoof(width: number, height: number, length: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, height);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  geo.translate(0, 0, -length / 2);
  return geo;
}

function circle(radius: number, color: number, opacity = 1) {
  const points = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
}

// The box buildings below stand in until each model has loaded.
function hall() {
  const group = new THREE.Group();
  const body = solid(new THREE.BoxGeometry(9, 4.5, 24));
  body.position.y = 2.25;
  const roof = solid(gableRoof(11.5, 5.5, 26));
  roof.position.y = 4.5;
  group.add(body, roof);
  for (const end of [-13, 13]) {
    for (const lean of [-0.6, 0.6]) {
      const beam = solid(new THREE.BoxGeometry(0.4, 8, 0.4), { line: CYAN });
      beam.position.set(0, 8.2, end);
      beam.rotation.z = lean;
      group.add(beam);
    }
  }
  const door = glow(new THREE.PlaneGeometry(2.2, 3.2));
  door.position.set(0, 1.6, 12.06);
  group.add(door);
  return group;
}

function forgeHouse() {
  const group = new THREE.Group();
  const body = solid(new THREE.BoxGeometry(10, 4.5, 8));
  body.position.y = 2.25;
  const roof = solid(gableRoof(9.5, 3.6, 12));
  roof.rotation.y = Math.PI / 2;
  roof.position.y = 4.5;
  const chimney = solid(new THREE.BoxGeometry(2.4, 11, 2.4));
  chimney.position.set(-2.5, 5.5, -1.5);
  const coals = glow(new THREE.BoxGeometry(1.8, 0.5, 1.8));
  coals.position.set(-2.5, 11.1, -1.5);
  const hearth = glow(new THREE.PlaneGeometry(3.2, 2.4));
  hearth.position.set(1, 1.5, 4.06);
  const anvilBase = solid(new THREE.BoxGeometry(1, 1.2, 1), { line: CYAN });
  anvilBase.position.set(7.5, 0.6, 5);
  const anvilTop = solid(new THREE.BoxGeometry(2.6, 0.6, 1), { line: CYAN });
  anvilTop.position.set(7.5, 1.5, 5);
  group.add(body, roof, chimney, coals, hearth, anvilBase, anvilTop);
  return group;
}

function beacon() {
  const group = new THREE.Group();
  const tower = solid(new THREE.CylinderGeometry(2.4, 3.6, 16, 8));
  tower.position.y = 8;
  const rim = solid(new THREE.CylinderGeometry(3.6, 3.6, 0.8, 8), { line: CYAN });
  rim.position.y = 16.4;
  group.add(tower, rim);
  return group;
}

// The beacon's fire: a flickering flame, a slow sweeping beam and a lamp for the island below.
function beaconFire(height: number, animated: ((time: number) => void)[]) {
  const group = new THREE.Group();
  group.position.y = height;
  const flame = glow(new THREE.ConeGeometry(1.3, 3.6, 6));
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(2.5, 120, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffc27a,
      transparent: true,
      opacity: 0.03,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  beam.geometry.rotateZ(Math.PI / 2);
  beam.geometry.translate(-60, 0, 0);
  const sweep = new THREE.Group();
  sweep.add(beam);
  group.add(flame, sweep, new THREE.PointLight(WARM, 420, 90, 2));
  animated.push((time: number) => {
    sweep.rotation.y = time * 0.5;
    flame.scale.setScalar(1 + 0.12 * Math.sin(time * 9) + 0.08 * Math.sin(time * 23));
  });
  return group;
}

function runestone(height: number) {
  const geo = new THREE.CylinderGeometry(1, 1.9, height, 5);
  geo.translate(0, height / 2, 0);
  return solid(geo, { line: CYAN });
}

// What stands at each place. `at` is [metres uphill of the ring's centre, metres north of it],
// `faces` is where the front points, and `light` is a warm lamp at [right, up, forward, strength]
// from the model's base. A model named as a project's `prop` in content.js is labelled with it.
const FURNITURE: Partial<Record<string, Furniture[]>> = {
  about: [{ model: 'hall', size: 26, at: [12, 0], faces: 'south', light: [0, 2.6, 15, 90], standIn: hall }],
  projects: [
    { model: 'forge', size: 11, at: [12, 0], faces: 'water', light: [0, 2.4, -1, 140], standIn: forgeHouse },
    // The props are monument-sized on purpose, so they read from the air.
    { model: 'hound', size: 6.5, at: [12, 15], faces: 'water' },
    { model: 'shield-rack', size: 7.5, tall: 4.5, at: [12, -15], faces: 'water' },
    { model: 'kettlebell', size: 4, at: [-2, 19], faces: 'water' },
    { model: 'wing-bag', size: 4.2, at: [-2, -19], faces: 'water' },
  ],
  contact: [{ model: 'beacon', size: 19, at: [0, 7], faces: 'south', fire: 17.8, standIn: beacon }],
};

// Most models face +z in their own file; these face +x.
const FACES_X = new Set(['hound', 'longship', 'jetty']);

// The ways something at a place can face, as [x, z] steps. Uphill is east on the east shore and
// on the island, west on the west shore.
function bearings(zone: Zone) {
  const east = zone.side || 1;
  return { uphill: [east, 0], water: zone.side ? [-zone.side, 0] : [0, 1], north: [0, -1], south: [0, 1] };
}

function spotAt(zone: Zone, [uphill, north]: [number,number]) {
  const way = bearings(zone);
  return [way.uphill[0] * uphill + way.north[0] * north, way.uphill[1] * uphill + way.north[1] * north];
}

// An empty holder at a spot, turned so that whatever is put in it faces along `toward`.
function stand(name: string, x: number, y: number, z: number, [dx, dz]: number[]) {
  const holder = new THREE.Group();
  holder.position.set(x, y, z);
  holder.rotation.y = FACES_X.has(name) ? Math.atan2(-dz, dx) : Math.atan2(dx, dz);
  return holder;
}

// Fills a holder with a model, swapping out the box stand-in once the model arrives.
function furnish(holder: THREE.Group<THREE.Object3DEventMap>, name: string, size: number, standIn?: THREE.Object3D) {
  if (standIn) holder.add(standIn);
  return loadModel(name, size)
    .then((model: THREE.Object3D<THREE.Object3DEventMap>) => {
      if (standIn) holder.remove(standIn);
      holder.add(model);
      return model;
    })
    .catch((error) => console.warn(`The ${name} model did not load.`, error));
}

// The supplied sock and pole share a mesh. Rotate about the pole, and move only the high,
// outboard cloth vertices; each instance owns its geometry so the four animations stay apart.
export function buildWindsock({ wind = { x: 1.15, z: -1.8, speed: Math.hypot(1.15, -1.8) }, phase = 0, loadModel: load = loadModel }: { wind?: { x: number; z: number; speed?: number }; phase?: number; loadModel?: ModelLoader } = {}) {
  const holder = new THREE.Group();
  let direction = Math.atan2(-wind.z, wind.x);
  let speed = wind.speed ?? Math.hypot(wind.x, wind.z);
  const field: AirSample & Partial<Vector3> = {}, point = new THREE.Vector3();
  holder.rotation.y = direction;
  const fallback = new THREE.Group();
  const pole = solid(new THREE.CylinderGeometry(0.07, 0.1, 8, 6), { line: LINE });
  pole.position.y = 4;
  const cloth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.5, 3.4, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: EMBER, side: THREE.DoubleSide }),
  );
  cloth.rotation.z = -Math.PI / 2;
  cloth.position.set(1.7, 7.1, 0);
  fallback.add(pole, cloth);
  holder.add(fallback);
  const moving: { geometry: THREE.BufferGeometry; rest: Float32Array }[] = [];
  const ready = load('windsock', 8, 0.12).then((model: THREE.Object3D<THREE.Object3DEventMap>) => {
    if (!model) return false;
    model.position.x = 8 * 0.17;
    model.traverse((part) => {
      if (!isMesh(part)) return;
      part.geometry = part.geometry.clone();
      const packed = part.geometry.attributes.position;
      const rest = new Float32Array(packed.count * 3);
      for (let i = 0; i < packed.count; i++) {
        rest[i * 3] = packed.getX(i);
        rest[i * 3 + 1] = packed.getY(i);
        rest[i * 3 + 2] = packed.getZ(i);
      }
      part.geometry.setAttribute('position', new THREE.BufferAttribute(rest.slice(), 3).setUsage(THREE.DynamicDrawUsage));
      part.frustumCulled = false;
      moving.push({ geometry: part.geometry, rest });
    });
    holder.remove(fallback);
    holder.add(model);
    return true;
  }).catch((error) => console.warn('The windsock model did not load; keeping the pole and cloth.', error));
  function update(time: number, windAt: WindSampler = fjordWindAt, calm = false) {
    holder.getWorldPosition(point);
    field.windX = field.windZ = undefined;
    field.x = field.z = 0;
    windAt(point.x, point.y + 7.1, point.z, field);
    const wx = Number.isFinite(field.windX) ? field.windX! : field.x!;
    const wz = Number.isFinite(field.windZ) ? field.windZ! : field.z!;
    speed = Math.hypot(wx, wz);
    if (speed > 0.05) direction = Math.atan2(-wz, wx);
    holder.rotation.y = direction;
    const flutter = calm ? 0 : time * (2 + Math.min(4, speed)) + phase;
    cloth.rotation.x = calm ? 0 : Math.sin(flutter) * 0.12;
    cloth.position.y = 7.1 + (calm ? 0 : Math.sin(flutter) * 0.07);
    for (const { geometry, rest } of moving) {
      const positions = geometry.attributes.position;
      for (let i = 0; i < rest.length; i += 3) {
        const x = rest[i], y = rest[i + 1], z = rest[i + 2];
        const mask = smooth(-0.12, -0.05, x) * smooth(0.73, 0.8, y);
        const reach = Math.max(0, (x + 0.12) / 0.404);
        const filled = 0.7 + Math.min(1.3, speed * 0.25);
        positions.array[i] = x;
        positions.array[i + 1] = y + mask * ((calm ? 0 : 0.014 * reach * Math.sin(flutter + reach * 6)) - 0.025 * (1 - filled) * reach);
        positions.array[i + 2] = z * (1 + mask * (filled - 1)) + (calm ? 0 : mask * reach * 0.014 * Math.sin(flutter * 1.3 + reach * 9));
      }
      positions.needsUpdate = true;
    }
  }
  return { group: holder, ready, update };
}

/** A visible, fly-through arch. The controller owns discovery and crossing detection. */
export function buildGateway() {
  const group = new THREE.Group();
  group.position.set(GATEWAY.x, GATEWAY.baseY, GATEWAY.z);
  group.rotation.y = GATEWAY.rotationY;
  const fallback = new THREE.Group();
  for (const side of [-1, 1]) {
    const pillar = solid(new THREE.BoxGeometry(14, 40, 14), { line: CYAN });
    pillar.position.set(side * 20, 20, 0);
    fallback.add(pillar);
  }
  const lintel = solid(new THREE.BoxGeometry(54, 14, 14), { line: CYAN });
  lintel.position.y = 47;
  fallback.add(lintel);
  group.add(fallback);
  loadModel('gateway', GATEWAY.size, 0.1).then((model: THREE.Object3D<THREE.Object3DEventMap>) => {
    carvedGlow(model);
    group.remove(fallback);
    group.add(model);
  }).catch((error) => console.warn('The gateway model did not load; keeping the stone arch.', error));

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.96, 1, 48),
    new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.2,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  const { minY, maxY, minZ, maxZ } = GATEWAY.corridor;
  halo.position.y = (minY + maxY) / 2 - GATEWAY.baseY;
  halo.scale.set((maxZ - minZ) / 2, (maxY - minY) / 2, 1);
  group.add(halo);
  const runes = new THREE.Group();
  const runeMaterial = new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.9, fog: false });
  for (const side of [-1, 1]) for (const y of [16, 26, 36]) {
    const points = [new THREE.Vector3(-1.2, 0, 0), new THREE.Vector3(0, 1.8, 0),
      new THREE.Vector3(1.2, 0, 0), new THREE.Vector3(0, -1.8, 0), new THREE.Vector3(-1.2, 0, 0)];
    for (const face of [-1, 1]) {
      const rune = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), runeMaterial);
      rune.position.set(side * 20, y, face * 11.5);
      runes.add(rune);
    }
  }
  group.add(runes);
  return {
    group,
    update(time: number) {
      halo.material.opacity = 0.17 + 0.07 * Math.sin(time * 1.6);
      runeMaterial.opacity = 0.72 + 0.2 * Math.sin(time * 1.6 + 0.6);
    },
  };
}

// The waterline below a place: walk from its centre toward the fjord until the ground goes under.
function shoreBelow(zone: Zone) {
  const [wx, wz] = bearings(zone).water;
  let reach = zone.r;
  while (reach < 140 && heightAt(zone.x + wx * reach, zone.z + wz * reach) > 0) reach += 1;
  return { x: zone.x + wx * reach, z: zone.z + wz * reach, out: [wx, wz] };
}

// Where each project's prop stands, for the labels that float over them.
export const PROJECT_PROPS = ZONES.flatMap((zone) =>
  (FURNITURE[zone.id] ?? []).flatMap((item) => {
    const project = PROJECTS.find((candidate) => candidate.prop === item.model);
    if (!project) return [];
    const [x, z] = spotAt(zone, item.at);
    return [{ label: project.name, x: zone.x + x, y: zone.h + (item.tall ?? item.size) + 1.5, z: zone.z + z }];
  }),
);

export function buildPlaces() {
  const group = new THREE.Group();
  const marks = new Map();
  const animated: ((time: number, windAt?: WindSampler, calm?: boolean) => void)[] = [];
  const pillarGeo = new THREE.CylinderGeometry(0.9, 0.9, 320, 6, 1, true);
  pillarGeo.translate(0, 160, 0);

  for (const zone of ZONES) {
    const place = new THREE.Group();
    place.position.set(zone.x, zone.h, zone.z);
    const ring = circle(zone.r - 2, CYAN);
    const pulse = circle(zone.r - 2, CYAN, 0.5);
    ring.position.y = pulse.position.y = 0.4;
    const pillar = new THREE.Mesh(
      pillarGeo,
      new THREE.MeshBasicMaterial({
        color: CYAN,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    place.add(ring, pulse, pillar);
    const wind = APPROACH_WINDS.find((candidate) => candidate.id === zone.id)!;
    const sock = buildWindsock({ wind, phase: marks.size * 1.7 });
    animated.push((time: number, windAt?: WindSampler, calm?: boolean) => sock.update(time, windAt, calm));
    const [sockX, sockZ] = spotAt(zone, [-zone.r + 5, -7]);
    sock.group.position.set(sockX, 0, sockZ);
    place.add(sock.group);
    if (zone.id === 'experience') {
      const sink = new THREE.Mesh(
        new THREE.CircleGeometry(16, 24),
        new THREE.MeshBasicMaterial({ color: 0x02050b, transparent: true, opacity: 0.5,
          depthWrite: false, side: THREE.DoubleSide }),
      );
      sink.geometry.rotateX(-Math.PI / 2);
      const points = sink.geometry.attributes.position;
      const cx = zone.x + wind.x * 34;
      const cz = zone.z + wind.z * 34;
      for (let i = 0; i < points.count; i++) {
        const x = points.getX(i), z = points.getZ(i);
        points.setY(i, heightAt(cx + x, cz + z) + 0.35);
      }
      sink.geometry.computeBoundingSphere();
      sink.position.set(cx, 0, cz);
      group.add(sink);
      animated.push((time: number) => (sink.material.opacity = 0.42 + Math.sin(time * 0.7) * 0.08));
    }

    for (const item of FURNITURE[zone.id] ?? []) {
      const [x, z] = spotAt(zone, item.at);
      const holder = stand(item.model, x, 0, z, bearings(zone)[item.faces]);
      if (item.light) {
        const [right, up, forward, strength] = item.light;
        const lamp = new THREE.PointLight(WARM, strength, 60, 2);
        lamp.position.set(right, up, forward);
        holder.add(lamp);
      }
      if (item.fire) holder.add(beaconFire(item.fire, animated));
      furnish(holder, item.model, item.size, item.standIn?.());
      place.add(holder);
    }
    group.add(place);
    marks.set(zone.id, { ring, pulse, pillar, visited: false, hot: false, beat: marks.size * 1.7 });
  }

  // The career stones turn their carved faces toward pilots coming up the fjord.
  STONES.forEach((stone, i) => {
    const holder = stand('rune-stone', stone.x, stone.y - 0.5, stone.z, [-0.6, 0.8]);
    holder.rotation.z = 0.05 * (i - 1.5);
    furnish(holder, 'rune-stone', stone.height, runestone(stone.height)).then((model) => model && carvedGlow(model));
    group.add(holder);
  });

  // A jetty and a moored longship on the shore below the hall.
  const shore = shoreBelow(ZONES.find((zone) => zone.id === 'about')!);
  const [ox, oz] = shore.out;
  const jetty = stand('jetty', shore.x + ox * 5, -1.6, shore.z + oz * 5, shore.out);
  const lantern = new THREE.PointLight(WARM, 70, 45, 2);
  lantern.position.set(6, 5, 0);
  jetty.add(lantern);
  furnish(jetty, 'jetty', 14);
  const mooring = stand('longship', shore.x + ox * 11, -0.9, shore.z + oz * 11 - 8, shore.out);
  let ship: { rotation: { x: number; }; }|null = null;
  furnish(mooring, 'longship', 20).then((model) => { ship = model ?? null; });
  group.add(jetty, mooring);
  const harbour = { x: shore.x, z: shore.z, out: shore.out, ship: mooring, berth: mooring.position.clone() };
  animated.push((time: number) => {
    mooring.position.y = -0.9 + Math.sin(time * 0.9) * 0.12;
    if (ship) ship.rotation.x = Math.sin(time * 0.7) * 0.03;
  });

  return {
    group,
    harbour,
    update(time: number, windAt = fjordWindAt, calm = false) {
      for (const tick of animated) tick(time, windAt, calm);
      for (const mark of marks.values()) {
        const t = (time * 0.4) % 1;
        mark.pulse.scale.setScalar(1 - t * 0.85);
        mark.pulse.material.opacity = 0.6 * (1 - t);
        // A place still to visit breathes to invite a click; the one under the pointer flares.
        const glow = mark.visited ? 0.12 : 0.36 + 0.14 * Math.sin(time * 2.2 + mark.beat);
        mark.pillar.material.opacity = mark.hot ? 0.95 : glow;
        mark.pillar.scale.x = mark.pillar.scale.z = mark.hot ? 2.2 : 1;
      }
    },
    // A visited place keeps its ring but its pillar dims, so progress reads from the air.
    setVisited(id: string) {
      const mark = marks.get(id);
      mark.visited = true;
      mark.ring.material.color.set(LINE);
    },
    setHot(id: string|null) {
      for (const [each, mark] of marks) mark.hot = each === id;
    },
  };
}

// The forest and the loose rock: one model each, drawn once per spot.
export function buildScatter(onForest?: (() => void) | null) {
  const group = new THREE.Group();
  const draw = async (name: string, spots: { x: number; y: number; z: number; turn: number; scale: number }[], size: number) => {
    const model = await loadModel(name, 1, 0.015);
    model.updateMatrixWorld(true);
    const source = firstMesh(model)!;
    const mesh = new THREE.InstancedMesh(source.geometry, source.material, spots.length);
    const spot = new THREE.Object3D();
    const matrix = new THREE.Matrix4();
    spots.forEach((item: { x: number; y: number; z: number; turn: number; scale: number; }, i: number) => {
      spot.position.set(item.x, item.y, item.z);
      spot.rotation.y = item.turn;
      spot.scale.setScalar(item.scale * size);
      spot.updateMatrix();
      mesh.setMatrixAt(i, matrix.multiplyMatrices(spot.matrix, source.matrixWorld));
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  };
  draw('pine-tree', TREES, 8).then(() => onForest?.(), (error) => console.warn('The tree model did not load.', error));
  draw('boulder', BOULDERS, 1).catch((error) => console.warn('The boulder model did not load.', error));
  return { group };
}

function sparkTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const fade = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  fade.addColorStop(0, 'rgba(255, 255, 255, 1)');
  fade.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}

export function buildThermals() {
  const group = new THREE.Group();
  const spark = sparkTexture();
  const perColumn = 70;
  const top = 280;
  const columns = FJORD_THERMALS.map((thermal) => {
    const seeds = [];
    for (let i = 0; i < perColumn; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * thermal.r * 0.6;
      seeds.push({ x: Math.cos(angle) * radius, y: Math.random() * top, z: Math.sin(angle) * radius });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(perColumn * 3), 3));
    const sparks = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: EMBER,
        map: spark,
        size: 1.6,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    sparks.position.set(thermal.x, heightAt(thermal.x, thermal.z), thermal.z);
    sparks.frustumCulled = false;
    const base = circle(thermal.r, EMBER, 0.4);
    base.position.set(thermal.x, heightAt(thermal.x, thermal.z) + 0.5, thermal.z);
    group.add(sparks, base);
    return { thermal, seeds, geo };
  });

  let lastTime = 0;
  const position = { x: 0, y: 0, z: 0 };
  const flow: AirSample = {};
  return {
    group,
    update(time: number) {
      const dt = Math.max(0, Math.min(0.1, time - lastTime));
      lastTime = time;
      for (const { thermal, seeds, geo } of columns) {
        const base = heightAt(thermal.x, thermal.z);
        const pos = geo.attributes.position;
        seeds.forEach((seed, i) => {
          position.x = thermal.x + seed.x;
          position.y = base + seed.y;
          position.z = thermal.z + seed.z;
          sampleFjordAir(position, time, flow);
          seed.x += flow.windX! * dt;
          seed.y += flow.windY! * dt;
          seed.z += flow.windZ! * dt;
          if (seed.y > top || seed.y < 1 || Math.hypot(seed.x, seed.z) > thermal.r) {
            seed.x = Math.cos(i * 2.4) * thermal.r * 0.3;
            seed.z = Math.sin(i * 2.4) * thermal.r * 0.3;
            seed.y = 5;
          }
          pos.setXYZ(i, seed.x, seed.y, seed.z);
        });
        pos.needsUpdate = true;
      }
    },
  };
}

export function buildSky(options = {}) {
  return createNordicSky({ loadModel, ...options });
}

// A glider made of boxes, shown until the models arrive (or if they fail to load).
function placeholderGlider() {
  const group = new THREE.Group();
  const cells = 10;
  const radius = 7.5;
  const arc = 1.0;
  const lift = 7.2;

  const verts = [];
  const index = [];
  const lines = [];
  for (let i = 0; i <= cells; i++) {
    const a = -arc + (2 * arc * i) / cells;
    const taper = 0.45 + 0.55 * Math.cos(a * 1.1);
    const x = radius * Math.sin(a);
    const y = lift - radius * (1 - Math.cos(a));
    verts.push(x, y, -1.6 * taper, x, y - 0.15, 1.4 * taper);
    if (i % 2 === 0) lines.push(0, 0.9, 0, x, y, -1.6 * taper, 0, 0.9, 0, x, y - 0.15, 1.4 * taper);
  }
  for (let i = 0; i < cells; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  wingGeo.setIndex(index);
  const wing = new THREE.Mesh(wingGeo, new THREE.MeshBasicMaterial({ color: 0x14466e, side: THREE.DoubleSide }));
  wing.add(new THREE.LineSegments(new THREE.EdgesGeometry(wingGeo, 1), new THREE.LineBasicMaterial({ color: 0xb8f1ff })));

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  const rigging = new THREE.LineSegments(
    lineGeo,
    new THREE.LineBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.45 }),
  );

  const pilot = solid(new THREE.BoxGeometry(0.6, 1.1, 1), { fill: 0x1c5a86, line: 0xe6f8ff });
  pilot.position.y = 0.3;
  const head = solid(new THREE.BoxGeometry(0.45, 0.45, 0.45), { fill: 0x1c5a86, line: 0xe6f8ff });
  head.position.set(0, 1.15, -0.1);

  group.add(wing, rigging, pilot, head);
  return group;
}

// How the generated models sit in the glider's frame: the pilot is at the origin, forward is -z,
// lengths are metres. `turn` spins a model about its vertical axis so that it faces forward.
const WING = { span: 11.5, turn: Math.PI, height: 6.2 };
const PILOT = {
  model: 'pilot-skeleton',
  length: 2.7,
  turn: Math.PI / 2,
  drop: 1.3,
  // Where the lines meet the pilot, in the model's own units (it is 1 long, feet toward +x,
  // 0.67 tall). These are for the right-hand side; the left side mirrors them across z.
  shoulder: [-0.19, 0.48, 0.175],
  hand: [-0.02, 0.56, 0.25],
  // The bones that carry those points and the ones the flight moves. `side` becomes L or R.
  bones: { chest: 'Spine02', waist: 'Spine01', head: 'Head', arm: 'side_Upperarm', fist: 'side_Forearm' },
  // How far an upper arm may turn down and up from where the file has it, in radians, before its
  // skin tears. The forearms and the knees tear far sooner, so they are never moved at all.
  arms: [-0.75, 0.55],
};

// How lively the glider is in the air. Raise a number for more of that motion, set it to 0 to
// switch it off. Angles are radians, pushes on the swing radians per second squared; the wing
// numbers are fractions of the wingspan.
const MOTION = {
  swingSpeed: 2.8, // how quickly the pilot swings back under the wing (higher is snappier)
  swingDamping: 0.35, // how soon a swing dies away (1 stops it without any overshoot)
  speedPitch: 0.02, // how far the wing sits ahead of the pilot per m/s above trim speed
  brakePitch: 0.02, // how much further back the wing sits on the full brake, beyond what its slowness does
  turnLead: 0.1, // how far the wing rolls ahead of the pilot going into and out of a turn
  liftKick: 0.06, // how hard flying into rising air knocks the wing back and to the side
  gusts: 0.55, // how much rough air rocks the glider; rising air is rougher than still air
  // Nearing a stall the wing hangs back a little and rocks to and fro (a push); kept small, so that
  // the stall itself is seen to throw the wing back further than any of that.
  luffPitch: 0.02,
  luffRock: 0.3,
  // How much further back the wing drops while it is stalled, where its lost airspeed already
  // holds it 0.17 back, and how hard it is flung there the moment it goes (radians per second).
  // In still air it peaks near 0.37, 0.12 beyond the rocking before; in the roughest air, a
  // strong thermal, near 0.43. The swing's stops are at 0.5.
  stallPitch: 0.12,
  stallKick: 0.3,
  spinRoll: 1.5, // how hard a wing folded on one side rolls toward that side (a push, per whole fold)
  pilotFollow: 0.6, // how much of each swing the pilot's body leans along with
  leanMost: 0.65, // the most bank the pilot leans into: a thermalling turn's, never a wingover's
  armPull: 0.7, // how far the pilot's arm comes down with a full pull on that side's brake
  brakeShown: 0.6, // how much of that full pull the hands show at the light brake, so it is seen at all
  steerDeep: 0.25, // how much a full steer still adds to the pull on top of the full brake
  armRest: 0.2, // how much lower the hands rest while flying than in the hero picture
  armRaise: 0.55, // how far the arms go up with the speed bar fully on
  stallRaise: 0.8, // how high the hands are thrown in a stall, as a share of the speed bar's
  armTremble: 0.03, // how much the arms tremble as the wing nears a stall
  armFlail: 0.08, // how much they flail while it is stalled
  bodyLean: 0.06, // each torso joint's ordinary lean; coordinated weight shift adds the same again
  headTurn: 0.4, // how far the pilot's head turns to look into a turn
  brakePull: 0.035, // how far a full steer pulls the trailing edge down on that side
  // How far the full brake pulls the trailing edge down on both sides: 0.40 m where the real edge
  // is, 70% of the way out to each tip, and `brakeCentre` of that (0.24 m) in the middle.
  brakeDrop: 0.0466,
  brakeCentre: 0.45,
  luff: 0.0148, // how far the trailing edge flutters as the wing nears a stall
  foldBlend: 0.2, // how far either side of the middle a fold of one half fades out
  // Big ears: the outer cells of each half fold down and in about a hinge `earHinge` of the wing's
  // width out from the middle (70% of the way to the tip), by up to `earFold` radians: under 84°, so
  // the cloth is never turned inside out along the span. The folded chord narrows by `earTuck`, and
  // the hands go up to the outer lines, `earsRaise` of the speed bar's height.
  earHinge: 0.35,
  earFold: 1.25,
  earTuck: 0.3,
  earsRaise: 0.7,
  // A tip caught in its lines (a cravat): the cells past `cravatHinge` are wrapped `cravatFold`
  // radians down and under, pulled `cravatBack` back, and flap `cravatFlap` radians about that.
  cravatHinge: 0.38,
  cravatFold: 2.4,
  cravatBack: 0.06,
  cravatFlap: 0.3,
  // A front collapse (a tuck) folds the leading edge `tuckDrop` down and `tuckBack` back under the
  // wing, in the wing file's units, leaving the trailing edge where it was: deep enough to read at
  // a glance from behind, as a collapse is.
  tuckDrop: 0.08,
  tuckBack: 0.05,
  // The flight's own swing over the pilot (flight.js's pitch), drawn as it is: eased at `swingEase`
  // a second, so a strike or the autopilot taking it over is never a snap, and stopped at `swingMost`
  // either way. The pilot hangs under the lines through `hang` of it.
  swingEase: 12,
  swingMost: 1.25,
  hang: 0.85,
  // With that swing drawn, where the pace and the brake hold the wing once it has died away
  // (`speedPitch`, `brakePitch`) is eased in at `trimEase` a second, never sprung, so it adds no
  // swing of its own to the flight's.
  trimEase: 2,
  heave: 2.5, // how hard the side of the wing over a core is lifted as the moment to turn in comes (a push)
  coreLift: 0.03, // in flight, how far the tip over a core lifts as the wing meets it (the file's units)
  tipFlutter: 0.012, // how much the wingtips shake in rough air
  ripple: 0.004, // how much the surface ripples along the span
  breathing: 0.008, // how much the whole arc flexes open and shut
};

// The wing file's own shape: 1 wide along x, with its leading edge at +z.
const HALF_CHORD = 0.139;

const smooth = (from: number, to: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};

// Eases `from` toward `to` by the share `rate`, landing on it exactly once within `hair` of it, so
// that a brake let go is let go to the last bit and the work it costs the wing stops. Easing that
// never landed would go on shrinking toward nothing for good, into the tiny numbers a processor
// works with many times more slowly, on every point of the wing in every frame.
const settle = (from: number, to: number, rate: number, hair = 1e-4) => (Math.abs(to - from) < hair ? to : from + (to - from) * rate);

// A share handed to `pose`, held to 0 to 1, with anything too faint to see taken as none. Whoever
// eases one out may never quite reach nothing (the game's flutter does not), and the wing would
// pay for it on every point until the flight ended. Anything that is not a number is none too.
const share = (value: number) => (value > 1e-3 ? Math.min(1, value) : 0);

// Where a point of the wing sits right now, in the wing file's own units, written into `out`.
// The same rule moves the wing's surface and the line ends attached to it. `air` is the glider's
// (see buildGlider); the rule is exported so that a test can try it point by point.
export function flexWing(x: number, y: number, z: number, air: GliderAir, out: THREE.Vector3) {
  const reach = Math.min(1, Math.abs(x) * 2); // 0 at the centre, 1 at a tip
  const aft = THREE.MathUtils.clamp(0.5 - z / (2 * HALF_CHORD), 0, 1); // 0 at the leading edge, 1 at the trailing edge
  const steer = x > 0 ? air.trailLeft : air.trailRight; // in the file, +x is the pilot's left
  const outer = smooth(0.08, 0.5, reach); // steering pulls only the outer part of the trailing edge
  let lift =
    -MOTION.brakePull * steer * outer * aft * aft * aft +
    MOTION.tipFlutter * air.rough * reach * reach * reach * Math.sin(air.time * 9 + x * 14) +
    MOTION.ripple * air.rough * Math.sin(x * 46 + air.time * 5) * Math.sin(aft * Math.PI) +
    MOTION.breathing * air.rough * reach * reach * Math.sin(air.time * 1.7);
  // Meeting a core in flight, the half over it lifts, the more toward its tip (in the file +x is the pilot's left).
  if (air.heave) lift += MOTION.coreLift * Math.max(0, -air.heave * Math.sign(x)) * reach * reach;
  // The brake pulls all of the trailing edge, the middle less than the rest, and near a stall the
  // edge flutters. This runs for every point of the wing in every frame, so neither costs
  // anything while it is not happening.
  if (air.trail > 0) lift -= MOTION.brakeDrop * air.trail * (outer + MOTION.brakeCentre * (1 - outer)) * aft * aft * aft;
  if (air.luff > 0) lift += MOTION.luff * air.luff * aft * aft * Math.sin(air.time * 23 + x * 60);
  // A collapse folds all of the wing. Each half can also fold on its own, fading out across the
  // middle over a band wide enough that the cloth is never turned inside out.
  let fold = air.collapse;
  if (air.foldLeft > 0 || air.foldRight > 0) {
    fold = Math.max(fold, air.foldRight + (air.foldLeft - air.foldRight) * smooth(-MOTION.foldBlend, MOTION.foldBlend, x));
  }
  // A tuck folds the leading edge down and back under the wing, and the trailing edge stays.
  if (air.tuck > 0) {
    const lead = (1 - aft) * (1 - aft) * air.tuck;
    lift -= MOTION.tuckDrop * lead;
    z -= MOTION.tuckBack * lead;
  }
  // A tip caught in its lines is wrapped under its hinge and flaps there, on its own side.
  const cravat = x > 0 ? air.cravatLeft : air.cravatRight;
  if (cravat > 0) {
    const past = Math.abs(x) - MOTION.cravatHinge;
    if (past > 0) {
      const angle = cravat * (MOTION.cravatFold + MOTION.cravatFlap * Math.sin(air.time * 21 + x * 37));
      x = Math.sign(x) * (MOTION.cravatHinge + past * Math.cos(angle));
      lift -= past * Math.sin(angle);
      z += (MOTION.cravatBack * cravat * past) / (0.5 - MOTION.cravatHinge);
    }
  }
  // Big ears fold each tip down and in about its hinge, calm (the tips shiver only as the rest of
  // the cloth does); a collapse on top of them takes the wing over.
  if (air.ears > 0) {
    const past = Math.abs(x) - MOTION.earHinge;
    if (past > 0) {
      const ears = air.ears * (1 - Math.min(1, fold));
      const angle = MOTION.earFold * ears;
      x = Math.sign(x) * (MOTION.earHinge + past * Math.cos(angle));
      lift -= past * Math.sin(angle);
      z *= 1 - (MOTION.earTuck * ears * past) / (0.5 - MOTION.earHinge);
    }
  }
  if (fold <= 0) return out.set(x, y + lift, z);
  // A collapsed wing folds in from its tips, lets them drop, and thrashes.
  const thrash = Math.sin(air.time * 17 + x * 31) * Math.cos(air.time * 11 + z * 43);
  return out.set(
    x * (1 - 0.62 * fold) + fold * 0.04 * Math.sin(air.time * 13 + z * 40),
    y + lift - fold * (0.2 * reach * reach - 0.05 * thrash),
    z * (1 - 0.35 * fold) + fold * 0.05 * thrash,
  );
}

// Swaps the wing's compressed geometry for plain numbers in the wing file's own units, so that
// every point can be moved each frame. Returns the new mesh and its resting shape.
function loosen(wing: THREE.Object3D) {
  wing.updateMatrixWorld(true);
  const source = firstMesh(wing)!;
  const toFile = wing.matrixWorld.clone().invert().multiply(source.matrixWorld);
  const packed = source.geometry.attributes.position;
  const rest = new Float32Array(packed.count * 3);
  const point = new THREE.Vector3();
  for (let i = 0; i < packed.count; i++) {
    point.fromBufferAttribute(packed, i).applyMatrix4(toFile);
    rest[i * 3] = point.x;
    rest[i * 3 + 1] = point.y;
    rest[i * 3 + 2] = point.z;
  }
  const geometry = source.geometry.clone();
  geometry.setAttribute('position', new THREE.BufferAttribute(rest.slice(), 3).setUsage(THREE.DynamicDrawUsage));
  // The copied bounds still describe the compressed numbers; the line anchors below rely on real ones.
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, source.material);
  mesh.frustumCulled = false; // its outline now changes every frame
  wing.clear();
  wing.add(mesh);
  return { mesh, rest };
}

// Finds where each line meets the pilot and the underside of the wing. Both ends are kept in
// their own model's units, so the lines can be redrawn as the two models move apart. `part` names
// the piece of the pilot each line is tied to.
function lineAnchors(wing: THREE.Object3D<THREE.Object3DEventMap>) {
  wing.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wing);
  const halfSpan = (box.max.x - box.min.x) / 2;
  const halfChord = (box.max.z - box.min.z) / 2;
  const ray = new THREE.Raycaster();
  const up = new THREE.Vector3(0, 1, 0);
  const underside = (reach: number, along: number, side: number) => {
    const narrowing = Math.sqrt(1 - 0.8 * reach * reach); // the wing gets shallower toward its tips
    ray.set(new THREE.Vector3(side * reach * halfSpan, box.min.y - 1, along * halfChord * narrowing), up);
    const hit = ray.intersectObject(wing, true)[0];
    return hit && wing.worldToLocal(hit.point.clone());
  };

  const anchors: Anchor[] = [];
  const join = ([x, y, z]: number[], side: number, part: Anchor['part'], onWing: THREE.Vector3 | undefined) =>
    onWing && anchors.push({ onPilot: new THREE.Vector3(x, y, side * z), part, side, onWing });
  for (const side of [-1, 1]) {
    for (const reach of [0.1, 0.32, 0.54, 0.76, 0.93]) {
      join(PILOT.shoulder, side, 'chest', underside(reach, -0.55, side)); // front row
      join(PILOT.shoulder, side, 'chest', underside(reach, 0.25, side)); // rear row
    }
    for (const reach of [0.3, 0.6, 0.88]) join(PILOT.hand, side, 'fist', underside(reach, 0.82, side)); // brakes
  }
  return anchors;
}

// The pilot file faces +x, with +y up and +z to its right.
const FORWARD = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(0, 0, 1);

// Picks out the pilot's moving joints and ties each line end to the bone that carries it. Must
// run while the pilot is still unturned, so that its bones can be read in the file's own frame.
// A pilot file without a skeleton comes back with no joints and its line ends left fixed.
function rigPilot(pilot: THREE.Object3D, anchors: Anchor[]) {
  pilot.updateMatrixWorld(true);
  const named = (part: keyof typeof PILOT.bones, side = 0) => pilot.getObjectByName(PILOT.bones[part].replace('side', side > 0 ? 'R' : 'L'));
  const joint = (part: keyof typeof PILOT.bones, side = 0) => {
    const bone = named(part, side);
    // `toLocal` turns an axis of the file's frame into the frame this bone is posed in.
    return bone && { bone, rest: bone.quaternion.clone(), toLocal: bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert() };
  };
  for (const anchor of anchors) {
    const bone = named(anchor.part, anchor.side);
    if (!bone) continue;
    anchor.bone = bone;
    anchor.onBone = anchor.onPilot.clone().applyMatrix4(pilot.matrixWorld).applyMatrix4(bone.matrixWorld.clone().invert());
  }
  const joints = {
    chest: joint('chest'),
    waist: joint('waist'),
    head: joint('head'),
    leftArm: joint('arm', -1),
    rightArm: joint('arm', 1),
  };
  return Object.values(joints).every(Boolean) ? joints as Record<keyof typeof joints, Joint> : null;
}

const spin = new THREE.Quaternion();
const axis = new THREE.Vector3();

// Turns a joint away from its resting pose, about an axis given in the pilot file's frame.
// With `more`, the turn is added to whatever the joint was last given instead.
function turnJoint(joint: Joint, about: THREE.Vector3Like, angle: number, more = false) {
  axis.copy(about).applyQuaternion(joint.toLocal);
  if (!more) joint.bone.quaternion.copy(joint.rest);
  joint.bone.quaternion.premultiply(spin.setFromAxisAngle(axis, angle));
}

// The reserve parachute, 7 m across, with a ring of lines down to the pilot. It stays hidden and
// is placed by whoever throws it; the lines are redrawn to follow.
const RESERVE = { size: 7, lines: 12, rim: 0.45 };

async function loadReserve(load: ModelLoader) {
  const canopy = new THREE.Group();
  canopy.add(await load('reserve', RESERVE.size, 0.25));
  canopy.visible = false;
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(RESERVE.lines * 6), 3).setUsage(THREE.DynamicDrawUsage),
    ),
    new THREE.LineBasicMaterial({ color: 0xffe2c4, transparent: true, opacity: 0.4 }),
  );
  lines.frustumCulled = false;
  lines.visible = false;
  return { canopy, lines };
}

async function loadGliderModels(load: ModelLoader) {
  const [wing, pilot] = await Promise.all([load('wing', WING.span, 0.2), load(PILOT.model, PILOT.length, 0.2)]);
  wing.rotation.y = WING.turn;
  wing.position.y = WING.height;
  const { mesh, rest } = loosen(wing);
  const anchors = lineAnchors(wing);
  const joints = rigPilot(pilot, anchors);
  pilot.rotation.y = PILOT.turn;
  pilot.position.y = -PILOT.drop;
  pilot.traverse((part) => {
    if (isSkinnedMesh(part)) part.frustumCulled = false; // its outline moves with its bones
  });
  return { wing, pilot, mesh, rest, anchors, joints };
}

// The places `measure` reads, found once on the real models: the line each fist holds, a point of
// the trailing edge at 70% of each half of the span (the rearmost point there), and each tip.
function landmarks(rest: Float32Array, anchors: Anchor[]) {
  const fist = (side: number) => anchors.find((anchor: { part: string; side: number; }) => anchor.part === 'fist' && anchor.side === side) ?? null;
  let tipLeft = 0;
  let tipRight = 0;
  let edgeLeft = -1;
  let edgeRight = -1;
  for (let i = 0; i < rest.length; i += 3) {
    const x = rest[i];
    // In the file, +x is the pilot's left.
    if (x > rest[tipLeft]) tipLeft = i;
    if (x < rest[tipRight]) tipRight = i;
    if (Math.abs(Math.abs(x) * 2 - 0.7) > 0.01) continue;
    if (x > 0 && (edgeLeft < 0 || rest[i + 2] < rest[edgeLeft + 2])) edgeLeft = i;
    if (x < 0 && (edgeRight < 0 || rest[i + 2] < rest[edgeRight + 2])) edgeRight = i;
  }
  // A wing file with no point there gets the rule's own trailing edge instead.
  const at = (i: number, side: number) => (i < 0 ? new THREE.Vector3(side * 0.35, 0, -HALF_CHORD) : new THREE.Vector3().fromArray(rest, i));
  return {
    fistLeft: fist(-1),
    fistRight: fist(1),
    edgeLeft: at(edgeLeft, 1),
    edgeRight: at(edgeRight, -1),
    tipLeft: at(tipLeft, 1),
    tipRight: at(tipRight, -1),
  };
}

// Where the glider's kit comes from (see setKit below): wing, cocoon and helmet, each fetched the
// first time it is worn, a canvas for colour textures, and the site's root, under which the
// owner's own paintings would be. A test hands in its own.
const KIT_PARTS = Object.freeze({
  livery: () => import('./livery.ts'),
  harness: () => import('./harness.ts'),
  helmet: () => import('./helmet.ts'),
  canvas: () => document.createElement('canvas'),
  get base() {
    return import.meta.env.BASE_URL;
  },
});

// The origin is the pilot; the wing arcs overhead. Forward is -z. `loadModel` is this file's own
// unless one is handed in, as a test does to build the real glider outside a browser, and `parts`
// is where its kit comes from.
export function buildGlider({ loadModel: load = loadModel, parts = KIT_PARTS }: { loadModel?: ModelLoader; parts?: KitParts } = {}) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  // The wing and the pilot each hang from the point between the pilot's shoulders, where the
  // lines gather, so swinging either one about it keeps the lines meeting there.
  const sling = new THREE.Group();
  const seat = new THREE.Group();
  const placeholder = placeholderGlider();
  const fallbackLines = Float32Array.from((placeholder.children[1] as THREE.LineSegments).geometry.attributes.position.array);
  group.add(sling, seat, placeholder);

  let rig: GliderRig | null = null;
  // How much longer (span) and deeper (chord) than its model the canopy is drawn: a glider's (setShape).
  const shape = { span: 1, chord: 1 };
  // The canopy drawn to `shape`: stretched along the model's own span and chord, never its height,
  // and only as a whole, so every bend and every line's end, worked in the model's own units, follows.
  const reshape = () => {
    if (!rig) return;
    rig.wing.scale.set(rig.base.scale * shape.span, rig.base.scale, rig.base.scale * shape.chord);
    rig.wing.updateMatrix();
  };
  // Settles once the models have taken the stand-in's place (true), or have failed to and left it
  // up (false). The game does not wait for it.
  const ready = loadGliderModels(load)
    .then(({ wing, pilot, mesh, rest, anchors, joints }) => {
      pilot.updateMatrix();
      const pivot = new THREE.Vector3(PILOT.shoulder[0], PILOT.shoulder[1], 0).applyMatrix4(pilot.matrix);
      sling.position.copy(pivot);
      seat.position.copy(pivot);
      wing.position.sub(pivot);
      pilot.position.sub(pivot);
      wing.updateMatrix();
      pilot.updateMatrix();

      const lines = new THREE.LineSegments(
        new THREE.BufferGeometry().setAttribute(
          'position',
          new THREE.BufferAttribute(new Float32Array(anchors.length * 6), 3).setUsage(THREE.DynamicDrawUsage),
        ),
        new THREE.LineBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.28 }),
      );
      lines.frustumCulled = false;

      group.remove(placeholder);
      sling.add(wing);
      seat.add(pilot);
      group.add(lines);
      // `material` is the wing's own, from its file: the standard wing, which a livery never touches.
      const body = firstSkinnedMesh(pilot);
      rig = { wing, pilot, body, pilotMaterial: body?.material, mesh, rest, anchors, joints, lines, marks: landmarks(rest, anchors), material: mesh.material,
        base: { pivot: pivot.clone(), wing: wing.position.clone(), pilot: pilot.position.clone(), scale: wing.scale.x } };
      reshape();
      return true;
    })
    .catch((error) => {
      console.warn('Glider models did not load; keeping the placeholder.', error);
      return false;
    });

  // The swing is two springs, one fore-and-aft and one side to side, each pulled toward a resting
  // angle and pushed around by the air. `swing` is the flight's own swing fore and aft, eased.
  const sway = { pitch: 0, pitchRate: 0, roll: 0, rollRate: 0, collapse: 0, swing: 0, trim: 0, lastBank: 0, lastLift: 0, lastStall: 0 };
  // What `pose` has been handed, eased: the steering on each side, the brake, the speed bar, the
  // flutter near a stall and the stall itself, each 0 to 1, and `rest`, the radians the hands sit
  // lower while flying. From those, what the trailing edge feels: `trail` along all of it from the
  // brake, and `trailLeft` and `trailRight` on each side from steering. The folds are as handed in.
  // `ears` and `tuck` are how far the big ears are in and the leading edge tucked, each 0 to 1.
  const air = {
    time: 0, rough: 0, steerLeft: 0, steerRight: 0, brake: 0, bar: 0, rest: 0, luff: 0, stall: 0,
    trail: 0, trailLeft: 0, trailRight: 0, collapse: 0, foldLeft: 0, foldRight: 0, cravatLeft: 0, cravatRight: 0, ears: 0, tuck: 0, heave: 0,
    coordinatedLean: 0, directBrakes: 0, leftBrake: 0, rightBrake: 0,
  };
  // What an emergency does to the gear, each from 0 to 1: the wing crumpling, being gathered in,
  // and the arm throwing the reserve. Whoever stages the emergency sets these.
  const gear = { collapse: 0, stow: 0, throwing: 0 };
  let reserve: Awaited<ReturnType<typeof loadReserve>> | null = null;
  const wingToGroup = new THREE.Matrix4();
  const pilotToGroup = new THREE.Matrix4();
  const worldToGroup = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const suspension = new THREE.Vector3();
  const pilotHeading = new THREE.Quaternion();
  const torsoLean = new THREE.Quaternion();
  const physicalForward = new THREE.Vector3(0, 0, -1);
  const physicalUp = new THREE.Vector3(0, 1, 0);
  let physicalWas = false;

  // How far an upper arm turns from the hands-off pose, in radians about the pilot's right axis
  // (a hand goes up as it grows), given the steering on its side and `side`, -1 left or 1 right.
  function armAngle(steer: number, side: number) {
    const { clamp } = THREE.MathUtils;
    // The light brake is drawn most of the way down, or it would hardly be seen at all.
    const shown =
      air.brake <= BRAKE.light
        ? (MOTION.brakeShown * air.brake) / BRAKE.light
        : MOTION.brakeShown + ((1 - MOTION.brakeShown) * (air.brake - BRAKE.light)) / (1 - BRAKE.light);
    // How far the hand is down its line: the brake, and steering on top of it (only a little more
    // on a deep brake). In a stall the hands let go of the lines altogether, and with the ears in
    // they hold the outer lines and the pilot steers by weight alone.
    const pull = air.directBrakes ? (1 - air.stall) * (1 - air.ears) * (side < 0 ? air.leftBrake : air.rightBrake)
      : (1 - air.stall) * (shown + steer * (1 - air.ears) * (1 - (1 - MOTION.steerDeep) * shown));
    // Hands up on the speed bar, or thrown up in a stall a little short of that, so that they can
    // be seen to flail, or up on the outer lines with the ears in. A raised hand leaves its rest; a
    // hand pulling its brake stays down, from a third of a full pull on exactly where it would be
    // without the bar.
    const hold = 1 - Math.min(1, 3 * pull);
    const up = Math.max(air.bar, air.stall, air.ears) * hold;
    const high = MOTION.armRaise * Math.max(air.bar, MOTION.stallRaise * air.stall, MOTION.earsRaise * air.ears) * hold;
    const angle =
      air.rest * (1 - Math.min(1, pull)) * (1 - up) +
      high -
      MOTION.armPull * pull +
      MOTION.armTremble * air.luff * Math.sin(air.time * 19 + side) +
      MOTION.armFlail * air.stall * Math.sin(air.time * 11 + 2 * side);
    return clamp(angle, PILOT.arms[0], PILOT.arms[1]);
  }

  // What the glider wears (wing-kit.js's kit, less the chalk, which is the run's): independent wing
  // and cocoon colours, and whether the helmet is on. A part is fetched the first time it is worn, and a
  // choice made while it was on its way wins over it when it comes. `material` is the wing's dressed
  // copy of its own material, `livery` the livery it is dressed in and `texture` that livery's
  // picture, `helmet` the helmet once it is made and `fetching` the helmet on its way.
  const worn = { wing: 'standard', harness: 'standard', helmet: false };
  const dressing: {
    material: THREE.MeshStandardMaterial | null; livery: string; texture: THREE.Texture | null;
    helmet: THREE.Object3D | null; fetching: Promise<void> | null;
    harnessMaterial: THREE.MeshStandardMaterial | null; harness: string; harnessTexture: THREE.Texture | null;
    harnessPending: { id: string; promise: Promise<void> | null } | null;
  } = {
    material: null, livery: '', texture: null, helmet: null, fetching: null,
    harnessMaterial: null, harness: '', harnessTexture: null, harnessPending: null,
  };

  // The livery taken off is let go, its picture given back by the graphics card, so that however
  // many are tried in the kit tab only the one worn is held there (an owner's picture is a few MB
  // of it). Put on again, it is painted again.
  function undress() {
    if (!dressing.texture) return;
    dressing.texture.dispose();
    dressing.material!.map = dressing.material!.emissiveMap = null;
    dressing.texture = null;
    dressing.livery = '';
  }

  // The standard wing is the very material the file came with. A livery is a copy of it with the
  // painted picture as both its colour and its glow, laid on by the wing's second set of texture
  // coordinates, worked out once from its resting shape (livery.js).
  function dressWing() {
    const id = worn.wing;
    if (!rig) return Promise.resolve();
    if (id === 'standard') {
      rig.mesh.material = rig.material;
      undress();
      return Promise.resolve();
    }
    return parts.livery().then((livery) => {
      if (worn.wing !== id) return;
      const { mesh, rest, material } = rig!;
      if (!livery.LIVERIES[id as keyof typeof livery.LIVERIES]) {
        mesh.material = material;
        undress();
        return;
      }
      if (!mesh.geometry.attributes.uv1) mesh.geometry.setAttribute('uv1', new THREE.BufferAttribute(livery.wingUv(rest), 2));
      const dressed = (dressing.material ??= material.clone());
      if (dressing.livery !== id) {
        undress();
        dressing.texture = livery.liveryTexture(id, { canvas: parts.canvas(), base: parts.base });
        dressing.livery = id;
      }
      dressed.map = dressed.emissiveMap = dressing.texture;
      dressed.emissiveIntensity = livery.LIVERIES[id as keyof typeof livery.LIVERIES].glow;
      dressed.needsUpdate = true;
      mesh.material = dressed;
    });
  }

  function undressHarness() {
    dressing.harnessTexture?.dispose();
    dressing.harnessTexture = null;
    dressing.harness = '';
    if (dressing.harnessMaterial) dressing.harnessMaterial.map = dressing.harnessMaterial.emissiveMap = null;
  }

  // The shared pilot material is never tinted: an owned texture recolours only the cocoon's UV
  // mask. One request per desired theme; a superseded result is released before it can be worn.
  function dressHarness() {
    if (!rig?.body) return Promise.resolve();
    const id = worn.harness;
    if (id === 'standard') {
      dressing.harnessPending = null;
      rig!.body!.material = rig!.pilotMaterial!;
      undressHarness();
      return Promise.resolve();
    }
    if (dressing.harness === id) return Promise.resolve();
    if (dressing.harnessPending?.id === id) return dressing.harnessPending.promise;
    const request: { id: string; promise: Promise<void> | null } = { id, promise: null };
    dressing.harnessPending = request;
    request.promise = parts.harness().then(async (harness) => {
      if (dressing.harnessPending !== request || worn.harness !== id) return;
      if (!harness.HARNESSES[id as keyof typeof harness.HARNESSES]) {
        rig!.body!.material = rig!.pilotMaterial!;
        undressHarness();
        return;
      }
      const texture = await harness.harnessTexture(id, rig!.pilotMaterial!.map, { canvas: parts.canvas(), base: parts.base });
      if (dressing.harnessPending !== request || worn.harness !== id) {
        texture.dispose();
        return;
      }
      const material = (dressing.harnessMaterial ??= rig!.pilotMaterial!.clone());
      undressHarness();
      dressing.harnessTexture = texture;
      dressing.harness = id;
      material.map = material.emissiveMap = texture;
      material.needsUpdate = true;
      rig!.body!.material = material;
    }).finally(() => {
      if (dressing.harnessPending === request) dressing.harnessPending = null;
    });
    return request.promise;
  }

  // The helmet is made and fitted to the head once (helmet.js), and after that only shown or hidden.
  // One fetch at a time: only that fetch failing forgets it, so the next wear asks again. (A livery
  // failing alongside it must not, or a second helmet could be fetched while the first was still
  // coming; both would be fitted, and the first, forgotten, could never be taken off.)
  function dressHead() {
    if (!rig) return Promise.resolve();
    if (dressing.helmet) dressing.helmet!.visible = worn.helmet;
    if (!worn.helmet || dressing.helmet) return Promise.resolve();
    if (!dressing.fetching) {
      const fetching = parts.helmet().then(async (helmets) => {
        const helmet = await helmets.makeHelmet(load);
        // Fitted to the head as the file has it: the joints go back to rest, and the next pose turns
        // them again.
        for (const joint of Object.values(rig!.joints ?? {})) joint.bone.quaternion.copy(joint.rest);
        helmets.wearHelmet(helmet, rig!.pilot);
        dressing.helmet = helmet;
      });
      fetching.catch(() => {
        if (dressing.fetching === fetching) dressing.fetching = null;
      });
      dressing.fetching = fetching;
    }
    return dressing.fetching.then(() => {
      dressing.helmet!.visible = worn.helmet;
    });
  }

  // Where a line meets the pilot, in the glider's frame, written into `out`. The matrices it reads
  // must have been brought up to date first.
  function pilotEnd({ onPilot, onBone, bone }: Anchor, out: THREE.Vector3) {
    if (bone) return out.copy(onBone!).applyMatrix4(bone.matrixWorld).applyMatrix4(worldToGroup);
    return out.copy(onPilot).applyMatrix4(pilotToGroup);
  }

  function redraw() {
    const { wing, pilot, mesh, rest, anchors, joints, lines } = rig!;
    if (joints) {
      // Each hand comes down with the brake, further on the side being steered, goes up with the
      // speed bar and is thrown up in a stall. The body leans and the head looks toward the turn,
      // whatever the brake is doing.
      const steer = air.steerRight - air.steerLeft;
      turnJoint(joints.leftArm, RIGHT, armAngle(air.steerLeft, -1));
      turnJoint(joints.rightArm, RIGHT, armAngle(air.steerRight, 1));
      // Throwing the reserve: the right arm sweeps down and out to the side, then comes back.
      const sweep = Math.sin(Math.PI * gear.throwing);
      if (sweep > 0) {
        turnJoint(joints.rightArm, RIGHT, -0.9 * sweep, true);
        turnJoint(joints.rightArm, UP, -1.1 * sweep, true);
      }
      const lean = (steer + air.coordinatedLean) * MOTION.bodyLean;
      turnJoint(joints.waist, FORWARD, lean);
      turnJoint(joints.chest, FORWARD, lean);
      turnJoint(joints.head, UP, -steer * MOTION.headTurn);
    }
    const surface = mesh.geometry.attributes.position;
    for (let i = 0; i < rest.length; i += 3) {
      flexWing(rest[i], rest[i + 1], rest[i + 2], air, point);
      surface.array[i] = point.x;
      surface.array[i + 1] = point.y;
      surface.array[i + 2] = point.z;
    }
    surface.needsUpdate = true;
    // A stowed wing is gathered in to a bundle at the pilot's shoulders, with its lines out of sight.
    sling.scale.setScalar(1 - 0.88 * gear.stow);
    lines.visible = gear.stow < 0.5;

    // The bones' positions are needed now, before the frame is drawn, to tie the lines to them.
    group.updateWorldMatrix(true, true);
    worldToGroup.copy(group.matrixWorld).invert();
    wingToGroup.multiplyMatrices(sling.matrix, wing.matrix);
    pilotToGroup.multiplyMatrices(seat.matrix, pilot.matrix);
    const ends = lines.geometry.attributes.position;
    for (let i = 0; i < anchors.length; i++) {
      pilotEnd(anchors[i], point);
      ends.setXYZ(i * 2, point.x, point.y, point.z);
      const { onWing } = anchors[i];
      flexWing(onWing.x, onWing.y, onWing.z, air, point).applyMatrix4(wingToGroup);
      ends.setXYZ(i * 2 + 1, point.x, point.y, point.z);
    }
    ends.needsUpdate = true;

    if (reserve) {
      // The reserve's lines run from the point between the pilot's shoulders to its rim.
      reserve.lines.visible = reserve.canopy.visible;
      reserve.canopy.updateMatrix();
      const cords = reserve.lines.geometry.attributes.position;
      for (let i = 0; i < RESERVE.lines; i++) {
        const around = (i / RESERVE.lines) * Math.PI * 2;
        point.set(Math.cos(around) * RESERVE.rim * RESERVE.size, 0.2, Math.sin(around) * RESERVE.rim * RESERVE.size);
        point.applyMatrix4(reserve.canopy.matrix);
        cords.setXYZ(i * 2, sling.position.x, sling.position.y, sling.position.z);
        cords.setXYZ(i * 2 + 1, point.x, point.y, point.z);
      }
      cords.needsUpdate = true;
    }
  }

  return {
    group,
    sway,
    air,
    gear,
    ready,
    /** The reserve canopy, once `packReserve` has loaded it. Place and scale it in the glider's frame. */
    get reserve() {
      return reserve?.canopy ?? null;
    },
    async packReserve() {
      reserve ??= await loadReserve(load);
      group.add(reserve.canopy, reserve.lines);
      return reserve.canopy;
    },
    /**
     * Dresses the glider in `kit` ({ wing, harness, helmet }, wing-kit.js). Unknown themes use the
     * original material. Settles once it is all on, or at once on the undressed stand-in.
     * A part that will not load leaves the glider as it was, and says so.
     */
    setKit(kit: WornKit) {
      worn.wing = typeof kit?.wing === 'string' ? kit.wing : 'standard';
      worn.harness = typeof kit?.harness === 'string' ? kit.harness : 'standard';
      worn.helmet = kit?.helmet === true;
      return ready
        .then(() => Promise.all([dressWing(), dressHarness(), dressHead()]))
        .then(() => undefined, (error) => {
          console.warn('Part of the kit did not load; the glider keeps what it had.', error);
        });
    },
    /**
     * Draws the canopy `span` times as long and `chord` times as deep as its model (a glider's,
     * gliders.js lookFor), or as the model is with null. Laid on once the models are in.
     */
    setShape(look: { span: number; chord: number } | null) {
      shape.span = look?.span ?? 1;
      shape.chord = look?.chord ?? 1;
      reshape();
    },
    /** What the glider wears now ({ wing, harness, helmet }), and its helmet once made. */
    get kit() {
      return { ...worn };
    },
    get helmet() {
      return dressing.helmet;
    },
    // Airborne poses come straight from interpolated simulation bodies. Canopy rotation never
    // rotates the pilot around the group origin; the actual suspension connects their paths.
    posePhysical(snapshot: { pilot: { pos: { x: number; y: number; z: number; }; vel?: { x: number; y: number; z: number; }; }; canopy: { pos: { x: number; y: number; z: number; }; q: { x: number; y: number; z: number; w: number; }; }; yaw: number; }, detail: GliderPose) {
      this.pose({ ...detail, swing: 0, physical: true });
      group.position.copy(snapshot.pilot.pos);
      group.quaternion.identity();
      if (rig) {
        sling.position.copy(snapshot.canopy.pos).sub(snapshot.pilot.pos);
        sling.quaternion.copy(snapshot.canopy.q);
        rig.wing.position.set(0, 0, 0);
        rig.wing.updateMatrix();
        seat.position.set(0, 0, 0);
        rig.pilot.position.set(0, -PILOT.drop, 0);
        rig.pilot.updateMatrix();
        suspension.copy(snapshot.canopy.pos).sub(snapshot.pilot.pos).normalize();
        seat.quaternion.setFromUnitVectors(physicalUp, suspension);
        // Twisted under the lines, the pilot faces that much round from the wing (positive to the left).
        pilotHeading.setFromAxisAngle(physicalUp, -snapshot.yaw + (Number.isFinite(detail.twist) ? detail.twist! : 0));
        seat.quaternion.multiply(pilotHeading);
        redraw();
      } else {
        // The fallback remains readable when model loading fails.
        placeholder.quaternion.identity();
        const [wing, cords, body, head] = placeholder.children;
        wing.quaternion.copy(snapshot.canopy.q);
        point.set(0, 7.2, 0).applyQuaternion(wing.quaternion);
        wing.position.copy(snapshot.canopy.pos).sub(snapshot.pilot.pos).sub(point);
        suspension.copy(snapshot.canopy.pos).sub(snapshot.pilot.pos).normalize();
        pilotHeading.setFromUnitVectors(physicalUp, suspension);
        body.quaternion.copy(pilotHeading); head.quaternion.copy(pilotHeading);
        torsoLean.setFromAxisAngle(physicalForward, air.coordinatedLean * MOTION.bodyLean * 2);
        body.quaternion.multiply(torsoLean); head.quaternion.multiply(torsoLean);
        body.position.set(0, 0.3, 0).applyQuaternion(pilotHeading);
        head.position.set(0, 1.15, -0.1).applyQuaternion(pilotHeading);
        const ends = (cords as THREE.LineSegments).geometry.attributes.position;
        for (let i = 0; i < ends.count; i++) {
          point.fromArray(fallbackLines, i * 3);
          if (i % 2 === 0) point.applyQuaternion(pilotHeading);
          else point.y -= 7.2, point.applyQuaternion(wing.quaternion).add(snapshot.canopy.pos).sub(snapshot.pilot.pos);
          ends.setXYZ(i, point.x, point.y, point.z);
        }
        ends.needsUpdate = true;
      }
      physicalWas = true;
    },
    /**
     * For tests and QA: writes into `out`, in metres, how the glider stands after its last pose.
     * `handLeft` and `handRight` are the heights of the brake lines' ends at each fist above the
     * point between the shoulders, in the glider's frame. `edgeLeft` and `edgeRight` are how far
     * the trailing edge is pulled down at 70% of each half of the span, and `tipLeft` and
     * `tipRight` how far each tip has come in toward the middle, along the wing's own axes (so the
     * swing plays no part in them). Hands back `out`, or null while the stand-in is shown.
     */
    measure(out: Partial<GliderMeasure> = {}): GliderMeasure | null {
      if (!rig) return null;
      const { pilot, wing, marks } = rig;
      group.updateWorldMatrix(true, true);
      worldToGroup.copy(group.matrixWorld).invert();
      pilotToGroup.multiplyMatrices(seat.matrix, pilot.matrix);
      out.handLeft = marks.fistLeft ? pilotEnd(marks.fistLeft, point).y - sling.position.y : 0;
      out.handRight = marks.fistRight ? pilotEnd(marks.fistRight, point).y - sling.position.y : 0;
      // Metres a unit of the model is along its span, and up (a glider's canopy is drawn longer than its model).
      const across = wing.scale.x * sling.scale.x, up = wing.scale.y * sling.scale.x;
      const { edgeLeft, edgeRight, tipLeft, tipRight } = marks;
      out.edgeLeft = (edgeLeft.y - flexWing(edgeLeft.x, edgeLeft.y, edgeLeft.z, air, point).y) * up;
      out.edgeRight = (edgeRight.y - flexWing(edgeRight.x, edgeRight.y, edgeRight.z, air, point).y) * up;
      // The left tip is the file's +x end, and the right tip its -x end: how far each has come in,
      // and how far it has dropped.
      out.tipLeft = (tipLeft.x - flexWing(tipLeft.x, tipLeft.y, tipLeft.z, air, point).x) * across;
      out.dropLeft = (tipLeft.y - point.y) * up;
      out.tipRight = (flexWing(tipRight.x, tipRight.y, tipRight.z, air, point).x - tipRight.x) * across;
      out.dropRight = (tipRight.y - point.y) * up;
      return out as GliderMeasure;
    },
    /**
     * Moves the glider for this frame. `pace` is speed above trim in m/s, `turn` is the steering
     * from -1 (left) to 1 (right), `lift` is the rising air in m/s and `liftSide` says which side
     * its core is on (-1 left, 1 right).
     *
     * The others are each 0 (or false) when left out, which is how the hero picture and the 404
     * scene pose it. `flying` is a pilot in the air with the wing in hand, whose hands rest a
     * little lower. `brake` is how deep the brake is and `bar` how far the speed bar is on
     * (flight.js's, 0 to 1). `luff` is how near the wing is to a stall, 0 to 1, and `stall` is 1
     * while it is stalled. `foldLeft` and `foldRight` are how far the pilot's left and right halves
     * of the wing are folded, 0 to 1, already eased by whoever folds them (gear.collapse still
     * folds all of it). `rough` is a gust on the tail, 0 to 1. `ears` is how far the big ears are
     * in and `tuck` how far its leading edge is tucked under (each 0 to 1, eased by whoever hands
     * them in), and `heave` a moment's lift of the side of the wing over a core, -1 (left) to 1
     * (right), as the moment to turn in comes. Any of these shares under a thousandth is taken as
     * none, so that one eased out without ever reaching 0 costs nothing.
     *
     * `swing`, the flight's own swing over the pilot (flight.js's pitch, radians, positive with the
     * wing behind), is left out by the hero picture and the 404 scene, whose glider swings as it
     * always has. Handed in, it is drawn as it is, and the springs keep only what the air does to the
     * wing: the brake, the pace and a stall already swing it through the flight, and where the pace
     * and the brake hold it once that swing dies is eased in, never sprung.
     * `coordinatedLean` is the signed physical weight shift, -1 to 1 and already eased. It
     * bends only the upper body during physical flight, independently of decorative motion.
     */
    pose({
      dt, time, bank, pace, turn, lift, liftSide, landed,
      flying = false, brake = 0, bar = 0, luff = 0, stall = 0, foldLeft = 0, foldRight = 0, cravatLeft = 0, cravatRight = 0, rough = 0,
      ears = 0, tuck = 0, heave = 0, swing, physical = false, coordinatedLean = 0,
      controlMode = 'legacy', leftBrake = 0, rightBrake = 0, still = false,
    }: GliderPose) {
      if (physicalWas && rig && !physical) {
        sling.position.copy(rig.base.pivot);
        seat.position.copy(rig.base.pivot);
        rig.wing.position.copy(rig.base.wing);
        rig.pilot.position.copy(rig.base.pilot);
        rig.wing.updateMatrix();
        rig.pilot.updateMatrix();
      }
      physicalWas = false;
      const { clamp } = THREE.MathUtils;
      const step = Math.min(dt, 0.1);
      const flown = swing !== undefined;
      // This weight shift is already eased by the physical controls. It only bends torso
      // joints; the simulated suspension, pilot origin and canopy pose stay authoritative.
      air.coordinatedLean = physical && flying && !landed && Number.isFinite(coordinatedLean)
        ? clamp(coordinatedLean, -1, 1) : 0;
      if (step > 0) {
        const bankRate = clamp((bank - sway.lastBank) / step, -3, 3);
        const liftRate = clamp((lift - sway.lastLift) / step, -20, 20);
        // The moment the wing stalls it is flung back, once.
        const stalled = share(stall);
        const kick = !flown && stalled > 0 && !(sway.lastStall > 0) ? MOTION.stallKick : 0;
        sway.lastBank = bank;
        sway.lastLift = lift;
        sway.lastStall = stalled;
        if (flown) sway.swing = settle(sway.swing, clamp(swing, -MOTION.swingMost, MOTION.swingMost), Math.min(1, step * MOTION.swingEase));
        air.ears = settle(air.ears, share(ears), Math.min(1, step * 6));
        air.tuck = share(tuck);

        air.time = time;
        air.collapse = gear.collapse;
        air.foldLeft = share(foldLeft);
        air.foldRight = share(foldRight);
        air.cravatLeft = share(cravatLeft);
        air.cravatRight = share(cravatRight);
        // Rising air is rougher than still air, and a gust on the tail rougher still. The roughness
        // and the steering ease exactly as they always have, landing only within a hair (1e-9) far
        // too fine to see: steering let go, or a glider long on the ground, would otherwise shrink
        // toward nothing for good.
        const rocking = 0.3 + Math.min(1, lift / 5) * 0.7;
        const onTail = share(rough);
        const restless = onTail > 0 ? Math.max(rocking, 0.3 + 0.7 * onTail) : rocking;
        air.rough = settle(air.rough, landed || still ? 0 : restless, Math.min(1, step * 2), 1e-9);
        // In flight the side over a core lifts as the wing meets it; the spring does it otherwise.
        air.heave = settle(air.heave, physical ? THREE.MathUtils.clamp(heave, -1, 1) : 0, Math.min(1, step * 6), 1e-9);
        const ease = Math.min(1, step * 6);
        air.steerLeft = settle(air.steerLeft, Math.min(1, Math.max(0, -turn)), ease, 1e-9);
        air.steerRight = settle(air.steerRight, Math.min(1, Math.max(0, turn)), ease, 1e-9);
        air.brake = settle(air.brake, share(brake), ease);
        air.bar = settle(air.bar, share(bar), ease);
        air.rest = settle(air.rest, flying ? -MOTION.armRest : 0, ease);
        air.luff = settle(air.luff, share(luff), Math.min(1, step * 5));
        // A stall takes the wing at once and gives it back more slowly.
        air.stall = settle(air.stall, stalled, Math.min(1, step * (stalled > air.stall ? 10 : 3)));
        // What the trailing edge feels: the brake all along it, and steering on its own side (only
        // a little more of that on a deep brake). Stalled, the hands are off the lines.
        const held = 1 - air.stall;
        const steering = 1 - (1 - MOTION.steerDeep) * air.brake;
        air.directBrakes = Number(controlMode === 'brakes');
        air.leftBrake = share(leftBrake / BRAKE.shelf);
        air.rightBrake = share(rightBrake / BRAKE.shelf);
        air.trail = air.directBrakes ? 0 : air.brake * held;
        // With the ears in, the hands are off the brakes and steering pulls no edge down.
        air.trailLeft = (air.directBrakes ? air.leftBrake : air.steerLeft * steering) * held * (1 - air.ears);
        air.trailRight = (air.directBrakes ? air.rightBrake : air.steerRight * steering) * held * (1 - air.ears);

        if (!physical) {
          const pull = MOTION.swingSpeed ** 2;
          const drag = 2 * MOTION.swingDamping * MOTION.swingSpeed;
          const gust = MOTION.gusts * air.rough;
          // Faster flight puts the wing ahead (negative pitch) and the brake holds it back; a turn
          // starting or ending rolls it first. Nearing a stall it hangs back and rocks to and fro,
          // and once stalled it drops back further, rocking no more. A flight's own swing already
          // carries the stall and the swings the pace and the brake set going, so with it the spring
          // rests on the rocking alone, and where the pace and the brake hold the wing is eased in.
          const hunting = air.luff * held;
          const sits = -pace * MOTION.speedPitch + MOTION.brakePitch * air.brake;
          const pitchRest = flown ? MOTION.luffPitch * hunting : sits + MOTION.luffPitch * hunting + MOTION.stallPitch * air.stall;
          if (flown) sway.trim = settle(sway.trim, clamp(sits, -0.5, 0.5), Math.min(1, step * MOTION.trimEase));
          const rollRest = -bankRate * MOTION.turnLead;
          // Rising air knocks the wing back and lifts the side nearer its core, and a wing folded on
          // one side rolls toward it.
          const pitchPush =
            liftRate * MOTION.liftKick +
            gust * (Math.sin(time * 1.7) * 0.6 + Math.sin(time * 3.1 + 1.3) * 0.4) +
            MOTION.luffRock * hunting * Math.sin(time * 3.6);
          let rollPush =
            liftRate * liftSide * MOTION.liftKick +
            gust * (Math.sin(time * 1.3 + 2.1) * 0.6 + Math.sin(time * 2.7 + 0.5) * 0.4) +
            MOTION.spinRoll * (air.foldLeft - air.foldRight);
          // The side over a core lifts as the moment to turn into it comes.
          if (Math.abs(heave) >= 0.001) rollPush += MOTION.heave * heave;
          sway.pitchRate += kick;
          const slices = Math.ceil(step * 90);
          const h = step / slices;
          for (let i = 0; i < slices; i++) {
            sway.pitchRate += (pull * (pitchRest - sway.pitch) - drag * sway.pitchRate + pitchPush) * h;
            sway.pitch = clamp(sway.pitch + sway.pitchRate * h, -0.5, 0.5);
            sway.rollRate += (pull * (rollRest - sway.roll) - drag * sway.rollRate + rollPush) * h;
            sway.roll = clamp(sway.roll + sway.rollRate * h, -0.5, 0.5);
          }
          // On the ground the wing drops forward, clear of the camera.
          sway.collapse += ((landed ? -1.25 : 0) - sway.collapse) * Math.min(1, step * 5);
        }
      }

      if (!physical) {
        sling.rotation.set(sway.pitch + sway.trim + sway.collapse + sway.swing, 0, sway.roll);
        // The pilot leans along with each swing, hangs under the flight's own, and leans into a turn:
        // as far as a thermalling turn takes it (its bank of 0.63 at most), and no further however
        // steep a wingover banks the whole rig, which already rolls the pilot with it.
        seat.rotation.set(
          (sway.pitch + sway.trim) * MOTION.pilotFollow + sway.swing * MOTION.hang,
          0,
          sway.roll * MOTION.pilotFollow - clamp(bank, -MOTION.leanMost, MOTION.leanMost) * 0.35,
        );
        placeholder.rotation.x = sway.collapse * 0.4;
      }
      if (rig && !physical) redraw();
    },
  };
}
