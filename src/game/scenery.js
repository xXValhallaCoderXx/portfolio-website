import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneModel } from 'three/addons/utils/SkeletonUtils.js';
import { PROJECTS } from '../content.js';
import { ZONES, STONES, THERMALS, TREES, BOULDERS, GATEWAY, heightAt } from './terrain.js';
import { APPROACH_WINDS } from './approach.js';

const FILL = 0x0a1a2c;
const LINE = 0x4fb8ff;
const CYAN = 0x5ee6ff;
const EMBER = 0xff9a3c;
const WARM = 0xffb066;

// Generated models, shrunk into public/models/ by tools/optimize-models.mjs. Each file is 1 unit
// along its longest side with its base at the origin, so `size` is that side in metres.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const files = new Map();

export function loadModel(name, size, selfLight = 0.07) {
  if (!files.has(name)) files.set(name, loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`));
  return files.get(name).then((file) => {
    const model = cloneModel(file.scene); // unlike a plain clone, this keeps a skeleton attached to its skin
    model.scale.setScalar(size);
    model.traverse((part) => {
      if (!part.isMesh || part.material.userData.lit) return;
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
function carvedGlow(model) {
  model.traverse((part) => {
    if (!part.isMesh || part.material.userData.carved) return;
    const { material } = part;
    if (!material.map?.image) return;
    const image = material.map.image;
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
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
function solid(geo, { fill = FILL, line = LINE, opacity = 0.95 } = {}) {
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: fill }));
  mesh.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 20),
      new THREE.LineBasicMaterial({ color: line, transparent: true, opacity }),
    ),
  );
  return mesh;
}

function glow(geo, color = EMBER) {
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
}

function gableRoof(width, height, length) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, height);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  geo.translate(0, 0, -length / 2);
  return geo;
}

function circle(radius, color, opacity = 1) {
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
function beaconFire(height, animated) {
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
  animated.push((time) => {
    sweep.rotation.y = time * 0.5;
    flame.scale.setScalar(1 + 0.12 * Math.sin(time * 9) + 0.08 * Math.sin(time * 23));
  });
  return group;
}

function runestone(height) {
  const geo = new THREE.CylinderGeometry(1, 1.9, height, 5);
  geo.translate(0, height / 2, 0);
  return solid(geo, { line: CYAN });
}

// What stands at each place. `at` is [metres uphill of the ring's centre, metres north of it],
// `faces` is where the front points, and `light` is a warm lamp at [right, up, forward, strength]
// from the model's base. A model named as a project's `prop` in content.js is labelled with it.
const FURNITURE = {
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
function bearings(zone) {
  const east = zone.side || 1;
  return { uphill: [east, 0], water: zone.side ? [-zone.side, 0] : [0, 1], north: [0, -1], south: [0, 1] };
}

function spotAt(zone, [uphill, north]) {
  const way = bearings(zone);
  return [way.uphill[0] * uphill + way.north[0] * north, way.uphill[1] * uphill + way.north[1] * north];
}

// An empty holder at a spot, turned so that whatever is put in it faces along `toward`.
function stand(name, x, y, z, [dx, dz]) {
  const holder = new THREE.Group();
  holder.position.set(x, y, z);
  holder.rotation.y = FACES_X.has(name) ? Math.atan2(-dz, dx) : Math.atan2(dx, dz);
  return holder;
}

// Fills a holder with a model, swapping out the box stand-in once the model arrives.
function furnish(holder, name, size, standIn) {
  if (standIn) holder.add(standIn);
  return loadModel(name, size)
    .then((model) => {
      if (standIn) holder.remove(standIn);
      holder.add(model);
      return model;
    })
    .catch((error) => console.warn(`The ${name} model did not load.`, error));
}

// The supplied sock and pole share a mesh. Rotate about the pole, and move only the high,
// outboard cloth vertices; each instance owns its geometry so the four animations stay apart.
function windsock(wind, animated, phase) {
  const holder = new THREE.Group();
  const direction = Math.atan2(-wind.z, wind.x);
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
  const moving = [];
  loadModel('windsock', 8, 0.12).then((model) => {
    model.position.x = 8 * 0.17;
    model.traverse((part) => {
      if (!part.isMesh) return;
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
  }).catch((error) => console.warn('The windsock model did not load; keeping the pole and cloth.', error));
  animated.push((time) => {
    const flutter = time * 4 + phase;
    holder.rotation.y = direction + Math.sin(time * 1.4 + phase) * 0.045;
    cloth.rotation.x = Math.sin(flutter) * 0.12;
    cloth.position.y = 7.1 + Math.sin(flutter) * 0.07;
    for (const { geometry, rest } of moving) {
      const positions = geometry.attributes.position;
      for (let i = 0; i < rest.length; i += 3) {
        const x = rest[i], y = rest[i + 1], z = rest[i + 2];
        const mask = smooth(-0.12, -0.05, x) * smooth(0.73, 0.8, y);
        const reach = Math.max(0, (x + 0.12) / 0.404);
        const filled = 0.8 + wind.speed * 0.25;
        positions.array[i] = x;
        positions.array[i + 1] = y + mask * (0.014 * reach * Math.sin(flutter + reach * 6) - 0.025 * (1 - filled) * reach);
        positions.array[i + 2] = z * (1 + mask * (filled - 1)) + mask * reach * 0.014 * Math.sin(flutter * 1.3 + reach * 9);
      }
      positions.needsUpdate = true;
    }
  });
  return holder;
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
  loadModel('gateway', GATEWAY.size, 0.1).then((model) => {
    carvedGlow(model);
    group.remove(fallback);
    group.add(model);
  }).catch((error) => console.warn('The gateway model did not load; keeping the stone arch.', error));

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.96, 1, 48),
    new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.2,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  halo.position.y = 27;
  halo.scale.set(11, 18, 1);
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
    update(time) {
      halo.material.opacity = 0.17 + 0.07 * Math.sin(time * 1.6);
      runeMaterial.opacity = 0.72 + 0.2 * Math.sin(time * 1.6 + 0.6);
    },
  };
}

// The waterline below a place: walk from its centre toward the fjord until the ground goes under.
function shoreBelow(zone) {
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
  const animated = [];
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
    const wind = APPROACH_WINDS.find((candidate) => candidate.id === zone.id);
    const sock = windsock(wind, animated, marks.size * 1.7);
    const [sockX, sockZ] = spotAt(zone, [-zone.r + 5, -7]);
    sock.position.set(sockX, 0, sockZ);
    place.add(sock);
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
      animated.push((time) => (sink.material.opacity = 0.42 + Math.sin(time * 0.7) * 0.08));
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
  const shore = shoreBelow(ZONES.find((zone) => zone.id === 'about'));
  const [ox, oz] = shore.out;
  const jetty = stand('jetty', shore.x + ox * 5, -1.6, shore.z + oz * 5, shore.out);
  const lantern = new THREE.PointLight(WARM, 70, 45, 2);
  lantern.position.set(6, 5, 0);
  jetty.add(lantern);
  furnish(jetty, 'jetty', 14);
  const mooring = stand('longship', shore.x + ox * 11, -0.9, shore.z + oz * 11 - 8, shore.out);
  let ship = null;
  furnish(mooring, 'longship', 20).then((model) => (ship = model));
  group.add(jetty, mooring);
  const harbour = { x: shore.x, z: shore.z, out: shore.out, ship: mooring, berth: mooring.position.clone() };
  animated.push((time) => {
    mooring.position.y = -0.9 + Math.sin(time * 0.9) * 0.12;
    if (ship) ship.rotation.x = Math.sin(time * 0.7) * 0.03;
  });

  return {
    group,
    harbour,
    update(time) {
      for (const tick of animated) tick(time);
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
    setVisited(id) {
      const mark = marks.get(id);
      mark.visited = true;
      mark.ring.material.color.set(LINE);
    },
    setHot(id) {
      for (const [each, mark] of marks) mark.hot = each === id;
    },
  };
}

// The forest and the loose rock: one model each, drawn once per spot.
export function buildScatter(onForest) {
  const group = new THREE.Group();
  const draw = async (name, spots, size) => {
    const model = await loadModel(name, 1, 0.015);
    model.updateMatrixWorld(true);
    let source = null;
    model.traverse((part) => {
      if (part.isMesh) source ??= part;
    });
    const mesh = new THREE.InstancedMesh(source.geometry, source.material, spots.length);
    const spot = new THREE.Object3D();
    const matrix = new THREE.Matrix4();
    spots.forEach((item, i) => {
      spot.position.set(item.x, item.y, item.z);
      spot.rotation.y = item.turn;
      spot.scale.setScalar(item.scale * size);
      spot.updateMatrix();
      mesh.setMatrixAt(i, matrix.multiplyMatrices(spot.matrix, source.matrixWorld));
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  };
  draw('pine-tree', TREES, 8).then(onForest, (error) => console.warn('The tree model did not load.', error));
  draw('boulder', BOULDERS, 1).catch((error) => console.warn('The boulder model did not load.', error));
  return { group };
}

function sparkTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
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
  const columns = THERMALS.map((thermal) => {
    const seeds = [];
    for (let i = 0; i < perColumn; i++) {
      seeds.push({ phase: Math.random() * top, spin: Math.random() * Math.PI * 2, reach: 0.25 + Math.random() * 0.6 });
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
    sparks.position.set(thermal.x, thermal.y, thermal.z);
    sparks.frustumCulled = false;
    const base = circle(thermal.r, EMBER, 0.4);
    base.position.set(thermal.x, thermal.y + 0.5, thermal.z);
    group.add(sparks, base);
    return { thermal, seeds, geo };
  });

  return {
    group,
    update(time) {
      for (const { thermal, seeds, geo } of columns) {
        const pos = geo.attributes.position;
        seeds.forEach((seed, i) => {
          const y = (seed.phase + time * 9) % top;
          const angle = seed.spin + y * 0.05;
          const radius = thermal.r * 0.55 * seed.reach * (0.6 + 0.4 * (y / top));
          pos.setXYZ(i, Math.cos(angle) * radius, y, Math.sin(angle) * radius);
        });
        pos.needsUpdate = true;
      }
    },
  };
}

export function buildSky() {
  const group = new THREE.Group();

  const count = 1400;
  const points = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.98 + 0.02);
    points[i * 3] = 2200 * Math.sin(phi) * Math.cos(theta);
    points[i * 3 + 1] = 2200 * Math.cos(phi);
    points[i * 3 + 2] = 2200 * Math.sin(phi) * Math.sin(theta);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(points, 3));
  group.add(
    new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xcfe6ff,
        size: 1.6,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        fog: false,
      }),
    ),
  );

  const aurora = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.z += sin(p.x * 0.006 + uTime * 0.12) * 90.0 + sin(p.x * 0.017 - uTime * 0.2) * 30.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float rays = 0.5 + 0.5 * sin(vUv.x * 140.0 + sin(vUv.x * 17.0 + uTime * 0.35) * 5.0);
        // At a ribbon's edge vUv can land just outside 0..1. Raising a negative number to a power
        // has no valid result, so keep the base in range.
        float curtain = smoothstep(0.0, 0.07, vUv.y) * pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.7);
        float ends = smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x));
        float pulse = 0.75 + 0.25 * sin(uTime * 0.5 + vUv.x * 6.0);
        vec3 col = mix(vec3(0.12, 0.95, 0.72), vec3(0.22, 0.38, 1.0), smoothstep(0.0, 0.7, vUv.y));
        gl_FragColor = vec4(col, curtain * ends * (0.3 + 0.7 * rays) * pulse * 0.5);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ribbons = [
    { x: 0, y: 340, z: -950, turn: 0, width: 1500 },
    { x: -620, y: 400, z: -700, turn: 0.6, width: 1100 },
    { x: 700, y: 320, z: -500, turn: -0.9, width: 1000 },
    { x: 300, y: 380, z: 1000, turn: Math.PI + 0.3, width: 1200 },
  ];
  for (const ribbon of ribbons) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ribbon.width, 280, 120, 1), aurora);
    mesh.position.set(ribbon.x, ribbon.y, ribbon.z);
    mesh.rotation.y = ribbon.turn;
    group.add(mesh);
  }

  return { group, update: (time) => (aurora.uniforms.uTime.value = time) };
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
};

// How lively the glider is in the air. Raise a number for more of that motion, set it to 0 to
// switch it off. Angles are radians; the wing numbers are fractions of the wingspan.
const MOTION = {
  swingSpeed: 2.8, // how quickly the pilot swings back under the wing (higher is snappier)
  swingDamping: 0.35, // how soon a swing dies away (1 stops it without any overshoot)
  speedPitch: 0.02, // how far the wing sits ahead of the pilot per m/s above trim speed
  turnLead: 0.1, // how far the wing rolls ahead of the pilot going into and out of a turn
  liftKick: 0.06, // how hard flying into rising air knocks the wing back and to the side
  gusts: 0.55, // how much rough air rocks the glider; rising air is rougher than still air
  pilotFollow: 0.6, // how much of each swing the pilot's body leans along with
  armPull: 0.7, // how far the pilot's arm comes down with a full pull on that side's brake
  bodyLean: 0.06, // how far the pilot's upper body leans toward the side being steered
  headTurn: 0.4, // how far the pilot's head turns to look into a turn
  brakePull: 0.035, // how far steering pulls the trailing edge down on that side
  tipFlutter: 0.012, // how much the wingtips shake in rough air
  ripple: 0.004, // how much the surface ripples along the span
  breathing: 0.008, // how much the whole arc flexes open and shut
};

// The wing file's own shape: 1 wide along x, with its leading edge at +z.
const HALF_CHORD = 0.139;

const smooth = (from, to, x) => {
  const t = THREE.MathUtils.clamp((x - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};

// Where a point of the wing sits right now, in the wing file's own units, written into `out`.
// The same rule moves the wing's surface and the line ends attached to it.
function flexWing(x, y, z, air, out) {
  const reach = Math.min(1, Math.abs(x) * 2); // 0 at the centre, 1 at a tip
  const aft = THREE.MathUtils.clamp(0.5 - z / (2 * HALF_CHORD), 0, 1); // 0 at the leading edge, 1 at the trailing edge
  const brake = x > 0 ? air.brakeLeft : air.brakeRight; // in the file, +x is the pilot's left
  const lift =
    -MOTION.brakePull * brake * smooth(0.08, 0.5, reach) * aft * aft * aft +
    MOTION.tipFlutter * air.rough * reach * reach * reach * Math.sin(air.time * 9 + x * 14) +
    MOTION.ripple * air.rough * Math.sin(x * 46 + air.time * 5) * Math.sin(aft * Math.PI) +
    MOTION.breathing * air.rough * reach * reach * Math.sin(air.time * 1.7);
  const fold = air.collapse;
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
function loosen(wing) {
  wing.updateMatrixWorld(true);
  let source = null;
  wing.traverse((part) => {
    if (part.isMesh) source ??= part;
  });
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
function lineAnchors(wing) {
  wing.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wing);
  const halfSpan = (box.max.x - box.min.x) / 2;
  const halfChord = (box.max.z - box.min.z) / 2;
  const ray = new THREE.Raycaster();
  const up = new THREE.Vector3(0, 1, 0);
  const underside = (reach, along, side) => {
    const narrowing = Math.sqrt(1 - 0.8 * reach * reach); // the wing gets shallower toward its tips
    ray.set(new THREE.Vector3(side * reach * halfSpan, box.min.y - 1, along * halfChord * narrowing), up);
    const hit = ray.intersectObject(wing, true)[0];
    return hit && wing.worldToLocal(hit.point.clone());
  };

  const anchors = [];
  const join = ([x, y, z], side, part, onWing) =>
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
function rigPilot(pilot, anchors) {
  pilot.updateMatrixWorld(true);
  const named = (part, side) => pilot.getObjectByName(PILOT.bones[part].replace('side', side > 0 ? 'R' : 'L'));
  const joint = (part, side) => {
    const bone = named(part, side);
    // `toLocal` turns an axis of the file's frame into the frame this bone is posed in.
    return bone && { bone, rest: bone.quaternion.clone(), toLocal: bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert() };
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
  return Object.values(joints).every(Boolean) ? joints : null;
}

const spin = new THREE.Quaternion();
const axis = new THREE.Vector3();

// Turns a joint away from its resting pose, about an axis given in the pilot file's frame.
// With `more`, the turn is added to whatever the joint was last given instead.
function turnJoint(joint, about, angle, more = false) {
  axis.copy(about).applyQuaternion(joint.toLocal);
  if (!more) joint.bone.quaternion.copy(joint.rest);
  joint.bone.quaternion.premultiply(spin.setFromAxisAngle(axis, angle));
}

// The reserve parachute, 7 m across, with a ring of lines down to the pilot. It stays hidden and
// is placed by whoever throws it; the lines are redrawn to follow.
const RESERVE = { size: 7, lines: 12, rim: 0.45 };

async function loadReserve() {
  const canopy = new THREE.Group();
  canopy.add(await loadModel('reserve', RESERVE.size, 0.25));
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

async function loadGliderModels() {
  const [wing, pilot] = await Promise.all([loadModel('wing', WING.span, 0.2), loadModel(PILOT.model, PILOT.length, 0.2)]);
  wing.rotation.y = WING.turn;
  wing.position.y = WING.height;
  const { mesh, rest } = loosen(wing);
  const anchors = lineAnchors(wing);
  const joints = rigPilot(pilot, anchors);
  pilot.rotation.y = PILOT.turn;
  pilot.position.y = -PILOT.drop;
  pilot.traverse((part) => {
    if (part.isSkinnedMesh) part.frustumCulled = false; // its outline moves with its bones
  });
  return { wing, pilot, mesh, rest, anchors, joints };
}

// The origin is the pilot; the wing arcs overhead. Forward is -z.
export function buildGlider() {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  // The wing and the pilot each hang from the point between the pilot's shoulders, where the
  // lines gather, so swinging either one about it keeps the lines meeting there.
  const sling = new THREE.Group();
  const seat = new THREE.Group();
  const placeholder = placeholderGlider();
  group.add(sling, seat, placeholder);

  let rig = null;
  loadGliderModels()
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
      rig = { wing, pilot, mesh, rest, anchors, joints, lines };
    })
    .catch((error) => console.warn('Glider models did not load; keeping the placeholder.', error));

  // The swing is two springs, one fore-and-aft and one side to side, each pulled toward a resting
  // angle and pushed around by the air.
  const sway = { pitch: 0, pitchRate: 0, roll: 0, rollRate: 0, collapse: 0, lastBank: 0, lastLift: 0 };
  const air = { time: 0, rough: 0, brakeLeft: 0, brakeRight: 0, collapse: 0 };
  // What an emergency does to the gear, each from 0 to 1: the wing crumpling, being gathered in,
  // and the arm throwing the reserve. Whoever stages the emergency sets these.
  const gear = { collapse: 0, stow: 0, throwing: 0 };
  let reserve = null;
  const wingToGroup = new THREE.Matrix4();
  const pilotToGroup = new THREE.Matrix4();
  const worldToGroup = new THREE.Matrix4();
  const point = new THREE.Vector3();

  function redraw() {
    const { wing, pilot, mesh, rest, anchors, joints, lines } = rig;
    if (joints) {
      // Each arm comes down with its brake; the body leans and the head looks toward the turn.
      const steer = air.brakeRight - air.brakeLeft;
      turnJoint(joints.leftArm, RIGHT, -air.brakeLeft * MOTION.armPull);
      turnJoint(joints.rightArm, RIGHT, -air.brakeRight * MOTION.armPull);
      // Throwing the reserve: the right arm sweeps down and out to the side, then comes back.
      const sweep = Math.sin(Math.PI * gear.throwing);
      if (sweep > 0) {
        turnJoint(joints.rightArm, RIGHT, -0.9 * sweep, true);
        turnJoint(joints.rightArm, UP, -1.1 * sweep, true);
      }
      turnJoint(joints.waist, FORWARD, steer * MOTION.bodyLean);
      turnJoint(joints.chest, FORWARD, steer * MOTION.bodyLean);
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
    anchors.forEach(({ onPilot, onBone, bone, onWing }, i) => {
      if (bone) point.copy(onBone).applyMatrix4(bone.matrixWorld).applyMatrix4(worldToGroup);
      else point.copy(onPilot).applyMatrix4(pilotToGroup);
      ends.setXYZ(i * 2, point.x, point.y, point.z);
      flexWing(onWing.x, onWing.y, onWing.z, air, point).applyMatrix4(wingToGroup);
      ends.setXYZ(i * 2 + 1, point.x, point.y, point.z);
    });
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
    /** The reserve canopy, once `packReserve` has loaded it. Place and scale it in the glider's frame. */
    get reserve() {
      return reserve?.canopy ?? null;
    },
    async packReserve() {
      reserve ??= await loadReserve();
      group.add(reserve.canopy, reserve.lines);
      return reserve.canopy;
    },
    /**
     * Moves the glider for this frame. `pace` is speed above trim in m/s, `turn` is the steering
     * from -1 (left) to 1 (right), `lift` is the rising air in m/s and `liftSide` says which side
     * its core is on (-1 left, 1 right).
     */
    pose({ dt, time, bank, pace, turn, slow, lift, liftSide, landed }) {
      const { clamp } = THREE.MathUtils;
      const step = Math.min(dt, 0.1);
      if (step > 0) {
        const bankRate = clamp((bank - sway.lastBank) / step, -3, 3);
        const liftRate = clamp((lift - sway.lastLift) / step, -20, 20);
        sway.lastBank = bank;
        sway.lastLift = lift;

        air.time = time;
        air.collapse = gear.collapse;
        air.rough += ((landed ? 0 : 0.3 + Math.min(1, lift / 5) * 0.7) - air.rough) * Math.min(1, step * 2);
        const both = slow ? 0.6 : 0;
        const ease = Math.min(1, step * 6);
        air.brakeLeft += (Math.min(1, Math.max(0, -turn) + both) - air.brakeLeft) * ease;
        air.brakeRight += (Math.min(1, Math.max(0, turn) + both) - air.brakeRight) * ease;

        const pull = MOTION.swingSpeed ** 2;
        const drag = 2 * MOTION.swingDamping * MOTION.swingSpeed;
        const gust = MOTION.gusts * air.rough;
        // Faster flight puts the wing ahead (negative pitch); a turn starting or ending rolls it first.
        const pitchRest = -pace * MOTION.speedPitch;
        const rollRest = -bankRate * MOTION.turnLead;
        // Rising air knocks the wing back and lifts the side nearer its core.
        const pitchPush = liftRate * MOTION.liftKick + gust * (Math.sin(time * 1.7) * 0.6 + Math.sin(time * 3.1 + 1.3) * 0.4);
        const rollPush =
          liftRate * liftSide * MOTION.liftKick + gust * (Math.sin(time * 1.3 + 2.1) * 0.6 + Math.sin(time * 2.7 + 0.5) * 0.4);
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

      sling.rotation.set(sway.pitch + sway.collapse, 0, sway.roll);
      // The pilot leans along with each swing, and into a turn.
      seat.rotation.set(sway.pitch * MOTION.pilotFollow, 0, sway.roll * MOTION.pilotFollow - bank * 0.35);
      placeholder.rotation.x = sway.collapse * 0.4;
      if (rig) redraw();
    },
  };
}
