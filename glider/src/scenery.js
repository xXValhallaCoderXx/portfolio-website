import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ZONES, STONES, THERMALS, TREES, BOULDERS, heightAt } from './terrain.js';

const FILL = 0x0a1a2c;
const LINE = 0x4fb8ff;
const CYAN = 0x5ee6ff;
const EMBER = 0xff9a3c;
const WARM = 0xffb066;

// Generated models, shrunk into models/ by tools/optimize-models.mjs. Each file is 1 unit along
// its longest side with its base at the origin, so `size` is that side in metres.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const files = new Map();

function loadModel(name, size, selfLight = 0.07) {
  if (!files.has(name)) files.set(name, loader.loadAsync(`models/${name}.glb`));
  return files.get(name).then((file) => {
    const model = file.scene.clone();
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
// `faces` is where the front points, `light` is a warm lamp at [right, up, forward, strength]
// from the model's base, and `label` names the project a prop stands for.
const FURNITURE = {
  about: [{ model: 'hall', size: 26, at: [12, 0], faces: 'south', light: [0, 2.6, 15, 90], standIn: hall }],
  projects: [
    { model: 'forge', size: 11, at: [12, 0], faces: 'water', light: [0, 2.4, -1, 140], standIn: forgeHouse },
    // The props are monument-sized on purpose, so they read from the air.
    { model: 'hound', size: 6.5, at: [12, 15], faces: 'water', label: 'sentiment-hound' },
    { model: 'shield-rack', size: 7.5, tall: 4.5, at: [12, -15], faces: 'water', label: 'hird-orchestrator' },
    { model: 'kettlebell', size: 4, at: [-2, 19], faces: 'water', label: 'sheetless.app' },
    { model: 'wing-bag', size: 4.2, at: [-2, -19], faces: 'water', label: 'flyte-paragliding.app' },
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

// The waterline below a place: walk from its centre toward the fjord until the ground goes under.
function shoreBelow(zone) {
  const [wx, wz] = bearings(zone).water;
  let reach = zone.r;
  while (reach < 140 && heightAt(zone.x + wx * reach, zone.z + wz * reach) > 0) reach += 1;
  return { x: zone.x + wx * reach, z: zone.z + wz * reach, out: [wx, wz] };
}

// Where each project's prop stands, for the labels that float over them.
export const PROJECT_PROPS = ZONES.flatMap((zone) =>
  (FURNITURE[zone.id] ?? [])
    .filter((item) => item.label)
    .map((item) => {
      const [x, z] = spotAt(zone, item.at);
      return { label: item.label, x: zone.x + x, y: zone.h + (item.tall ?? item.size) + 1.5, z: zone.z + z };
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
    marks.set(zone.id, { ring, pulse, pillar });
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
  animated.push((time) => {
    mooring.position.y = -0.9 + Math.sin(time * 0.9) * 0.12;
    if (ship) ship.rotation.x = Math.sin(time * 0.7) * 0.03;
  });

  return {
    group,
    update(time) {
      for (const tick of animated) tick(time);
      for (const { pulse } of marks.values()) {
        const t = (time * 0.4) % 1;
        pulse.scale.setScalar(1 - t * 0.85);
        pulse.material.opacity = 0.6 * (1 - t);
      }
    },
    // A visited place keeps its ring but its pillar dims, so progress reads from the air.
    setVisited(id) {
      const mark = marks.get(id);
      mark.pillar.material.opacity = 0.12;
      mark.ring.material.color.set(LINE);
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
  length: 2.7,
  turn: Math.PI / 2,
  drop: 1.3,
  // Where the lines meet the pilot, in the model's own units (it is 1 long, feet toward +x,
  // 0.67 tall). These are for the right-hand side; the left side mirrors them across z.
  shoulder: [-0.19, 0.48, 0.175],
  hand: [-0.02, 0.56, 0.25],
};

// Lines run from the pilot to the underside of the wing, found by casting rays up at it.
function rigLines(wing, pilot) {
  wing.updateMatrixWorld(true);
  pilot.updateMatrixWorld(true);
  const onPilot = ([x, y, z], side) => pilot.localToWorld(new THREE.Vector3(x, y, side * z));
  const box = new THREE.Box3().setFromObject(wing);
  const halfSpan = (box.max.x - box.min.x) / 2;
  const halfChord = (box.max.z - box.min.z) / 2;
  const ray = new THREE.Raycaster();
  const up = new THREE.Vector3(0, 1, 0);
  const underside = (reach, along, side) => {
    const narrowing = Math.sqrt(1 - 0.8 * reach * reach); // the wing gets shallower toward its tips
    ray.set(new THREE.Vector3(side * reach * halfSpan, box.min.y - 1, along * halfChord * narrowing), up);
    return ray.intersectObject(wing, true)[0]?.point;
  };

  const points = [];
  const join = (from, to) => to && points.push(from, to);
  for (const side of [-1, 1]) {
    const shoulder = onPilot(PILOT.shoulder, side);
    const hand = onPilot(PILOT.hand, side);
    for (const reach of [0.1, 0.32, 0.54, 0.76, 0.93]) {
      join(shoulder, underside(reach, -0.55, side)); // front row
      join(shoulder, underside(reach, 0.25, side)); // rear row
    }
    for (const reach of [0.3, 0.6, 0.88]) join(hand, underside(reach, 0.82, side)); // brakes
  }
  return new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.28 }),
  );
}

async function loadGliderModels() {
  const [wing, pilot] = await Promise.all([loadModel('wing', WING.span, 0.2), loadModel('pilot', PILOT.length, 0.2)]);
  wing.rotation.y = WING.turn;
  wing.position.y = WING.height;
  pilot.rotation.y = PILOT.turn;
  pilot.position.y = -PILOT.drop;
  return { wing, pilot, lines: rigLines(wing, pilot) };
}

// The origin is the pilot; the wing arcs overhead. Forward is -z.
export function buildGlider() {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const canopy = new THREE.Group();
  const seat = new THREE.Group();
  const placeholder = placeholderGlider();
  group.add(canopy, seat, placeholder);

  loadGliderModels()
    .then(({ wing, pilot, lines }) => {
      group.remove(placeholder);
      canopy.add(wing, lines);
      seat.add(pilot);
    })
    .catch((error) => console.warn('Glider models did not load; keeping the placeholder.', error));

  return {
    group,
    pose({ bank, landed }) {
      // On the ground the wing drops forward, clear of the camera; in a turn the pilot leans into it.
      canopy.rotation.x += ((landed ? -1.25 : 0) - canopy.rotation.x) * 0.08;
      placeholder.rotation.x = canopy.rotation.x * 0.4;
      seat.rotation.z = -bank * 0.35;
    },
  };
}
