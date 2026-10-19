import { namedFixture, renderFixture, type SceneFixture } from '../../../test/helpers/test-scene.ts';
import type { ModelLoader } from '../../../adapters/rendering/rendering.types.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CLOUD_GLOW, CLOUD_LIT, CLOUD_MILESTONES, CLOUD_POOL, CLOUD_STRIKE, FOG_SURFACE, ORDER, createCloudbase, createCloudbaseRun } from './cloudbase.ts';
import { CLOUD_HUNT, CLOUD_RAVENS, CLOUD_STORM, CLOUD_WEAR, CLOUD_ZONE } from '../../../domains/good-lift/cloudbase-state.ts';
import { RAVEN, rigRaven, poseRaven, ravenEffort } from './ravens.ts';
import { THERMAL_MOTES, layoutMotes, moteAt, type MoteParameters } from './thermal-motes.ts';
import { BLESSING } from '../../../domains/good-lift/meet-runes.ts';
import { createTestLoader, readModel } from '../../../test/helpers/test-models.ts';
import { arraysMadeBy } from '../../../test/helpers/test-alloc.ts';
import type { Vector2, Vector3 } from '../../../domains/flight/models.ts';
import type { CloudbaseRun } from '../../../domains/good-lift/models.ts';

const STEP = 1 / 60;
// How the view is asked to draw a storm cloud: 1.3 times its hazard, around a file that is 1
// long, 0.563 tall and 0.741 deep, and thinned to 0.22 when it is in the camera's way. A cloud
// counts as in the way out to 1.3 times the size it is drawn, because the real one is lobed.
const SWELL = 1.3;
const TALL = 0.563;
const DEEP = 0.741;
const THIN = 0.22;
const CLEAR = 1.3;
// The brightness at which the game's glow starts (the bloom pass in game.js), and how bright a
// colour is by that measure.
const GLOW = 0.3;
const luma = (colour: THREE.Color) => 0.2126 * colour.r + 0.7152 * colour.g + 0.0722 * colour.b;

const close = (actual: number, expected: number, slack = 1e-9) => assert.ok(Math.abs(actual - expected) <= slack, `${actual} is within ${slack} of ${expected}`);
// Random numbers from 0 to 1 that come out the same on every run of the tests.
const dice = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const named = (view: ReturnType<typeof createCloudbase>, name: string) => namedFixture(view.root, name);
// A thermal's uniforms as plain numbers, with where its motes' mesh stands: what moteAt reads.
const valuesOf = (mesh: SceneFixture) => {
  const values = { x: mesh.position.x, z: mesh.position.z } as MoteParameters & Record<string, number>;
  for (const [name, uniform] of Object.entries(mesh.material.uniforms)) values[name] = uniform.value;
  return values;
};
const meshesIn = (object: THREE.Object3D) => {
  const found: SceneFixture[] = [];
  object.traverse((part) => { if (renderFixture(part) && 'isMesh' in part) found.push(part); });
  return found;
};
// Every geometry and material in use under an object, hidden parts included.
const resources = (object: THREE.Object3D<THREE.Object3DEventMap>, into = { geometries: new Set<THREE.BufferGeometry>(), materials: new Set<THREE.Material>() }) => {
  object.traverse((part) => {
    if (!renderFixture(part)) return;
    if (part.geometry) into.geometries.add(part.geometry);
    if (part.material) into.materials.add(part.material);
  });
  return into;
};
// Counts how often each of some things is released from now on.
const watch = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(things: Iterable<T | null>) => {
  const counts = new Map<THREE.BufferGeometry | THREE.Material | THREE.Texture, number>();
  for (const thing of things) {
    assert.ok(thing);
    counts.set(thing, 0);
    thing.addEventListener('dispose', () => counts.set(thing, counts.get(thing)! + 1));
  }
  return counts;
};
const releasedOnce = (counts: Map<THREE.BufferGeometry | THREE.Material | THREE.Texture, number>, what: string) => {
  assert.ok(counts.size > 0, `there is some ${what} to release`);
  for (const count of counts.values()) assert.equal(count, 1, `every ${what} is released exactly once`);
};
const neverReleased = (counts: Map<THREE.BufferGeometry | THREE.Material | THREE.Texture, number>, what: string) => {
  assert.ok(counts.size > 0, `the loader has some ${what}`);
  for (const count of counts.values()) assert.equal(count, 0, `no ${what} of the loader's is released`);
};
// A run with its sky laid out and every storm cloud cleared away, for tests that place their own.
const clearSky = (seed = 1) => {
  const run = createCloudbaseRun();
  run.reset(80, seed);
  for (const cloud of run.state.clouds) cloud.fade = 0;
  return run;
};
// Parks one cloud by writing its plain numbers; nothing steps the run afterwards to move it.
const park = (cloud: { x: number; y: number; z: number; rx: number; ry: number; rz: number; turn: number; cos: number; sin: number; fade: number; lane: number; along: number; ux: number; uz: number; speed: number; layer: number; vx: number; vz: number; }, x: number, y: number, z: number, { rx = 40, ry = 20, rz = 30, turn = 0, fade = 1 } = {}) => Object.assign(cloud, { x, y, z, rx, ry, rz, turn, fade });
const pilotAt = (point: Vector2, y: number) => ({ x: point.x, y, z: point.z });
// The point `metres` from `from`, straight away from `other`.
const beyond = (from: Vector2, other: Vector2, metres: number) => {
  const gap = Math.hypot(from.x - other.x, from.z - other.z);
  return { x: from.x + ((from.x - other.x) / gap) * metres, z: from.z + ((from.z - other.z) / gap) * metres };
};
// The centre of a closed mesh's volume in the world, however it has been turned or mirrored.
const bulkOf = (mesh: SceneFixture) => {
  const position = mesh.geometry.attributes.position;
  const index = mesh.geometry.index!;
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const cross = new THREE.Vector3();
  const centre = new THREE.Vector3();
  let volume = 0;
  for (let i = 0; i < index.count; i += 3) {
    corners.forEach((corner, n) => corner.fromBufferAttribute(position, index.getX(i + n)).applyMatrix4(mesh.matrixWorld));
    const piece = corners[0].dot(cross.crossVectors(corners[1], corners[2])) / 6;
    volume += piece;
    for (const corner of corners) centre.addScaledVector(corner, piece / 4);
  }
  return centre.divideScalar(volume);
};

test('with no loader the view builds once on begin, hides on reset and releases everything it made exactly once', async () => {
  const scene = new THREE.Scene();
  const view = createCloudbase({ scene });
  assert.equal(scene.children.length, 0);
  assert.equal(view.root, null);
  const ready = view.begin();
  assert.equal(scene.children.length, 1);
  const root = scene.children[0];
  assert.equal(view.root, root);
  assert.equal(await ready, undefined);
  assert.deepEqual(view.loaded, { raven: false, clouds: false });

  // Thin one cloud first, so that the see-through material is in use and gets counted too.
  const run = clearSky();
  const cloud = park(run.state.clouds[0], 125, 700, 238);
  const pos = { x: cloud.x, y: cloud.y - CLOUD_STRIKE.rise, z: cloud.z + 200 };
  view.update(1, pos, run, { x: cloud.x, y: cloud.y, z: cloud.z - 200 });
  assert.equal(named(view, 'cloud-0').children[0].material.alphaHash, true);
  const made = resources(root!);
  assert.ok(made.geometries.size >= 8 && made.materials.size >= 12, 'the view is made of many parts');
  const geometries = watch(made.geometries);
  const materials = watch(made.materials);

  // The camera is optional, and so is a run that has started: a bare state will do.
  view.update(2, new THREE.Vector3(125, 80, 320), run);
  view.update(3, pos, run.state);
  view.update(4, pos, createCloudbaseRun());
  view.reset();
  assert.equal(root.visible, false);
  assert.equal(view.begin() instanceof Promise, true);
  assert.equal(scene.children.length, 1);
  assert.equal(scene.children[0], root);
  assert.equal(view.root, root);
  assert.equal(root.visible, true);

  view.dispose();
  view.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(view.root, null);
  releasedOnce(geometries, 'geometry');
  releasedOnce(materials, 'material');
  assert.equal(await view.begin(), undefined);
  view.update(5, pos, run);
  view.reset();
  assert.equal(scene.children.length, 0);
  assert.equal(view.root, null);
});

test('a new run opens with nothing of the last one showing until its first update', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  view.begin();
  const run = clearSky(4);
  const cloud = park(run.state.clouds[2], 125, 420, 238);
  Object.assign(run.state.ravens[0], { x: 120, y: 410, z: 230, fade: 1, threat: true });
  const pos = { x: 125, y: 400, z: 500 };
  view.update(1, pos, run, { x: cloud.x, y: 400, z: -100 });
  const showing = ['raven-0', 'cloud-2', 'threat-0', 'motes-0'].map((name) => named(view, name));
  for (const object of showing) assert.equal(object.visible, true, `${object.name} shows during the run`);
  assert.equal(named(view, 'cloud-2').children[0].material.alphaHash, true);
  assert.ok(named(view, 'glints').geometry.attributes.glow.getX(0) > 0);

  view.reset();
  view.begin();
  for (const object of showing) assert.equal(object.visible, false, `${object.name} waits for the next update`);
  assert.equal(named(view, 'cloud-2').children[0].material.alphaHash, false);
  assert.equal(named(view, 'glints').geometry.attributes.glow.getX(0), 0);
  view.update(2, pos, run);
  for (const object of showing) assert.equal(object.visible, true);
  view.dispose();
});

test('the pieces are named for what they are, every thermal is one instanced mesh of motes, and nothing stands tall', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  assert.ok(view);
  view.begin();
  const thermals = named(view, 'thermals');
  assert.equal(thermals.isGroup, true);
  assert.deepEqual(thermals.children.map((part) => part.name), Array.from({ length: CLOUD_POOL.thermals }, (_, i) => `motes-${i}`));
  for (let i = 0; i < CLOUD_POOL.thermals; i++) {
    const motes = named(view, `motes-${i}`);
    assert.equal(motes.isMesh && (motes.geometry as THREE.InstancedBufferGeometry).isInstancedBufferGeometry, true);
    assert.equal((motes.geometry as THREE.InstancedBufferGeometry).instanceCount, i === 0 ? THERMAL_MOTES.count.launch : THERMAL_MOTES.count.hunted);
    assert.equal(motes.geometry.attributes.seed.count, (motes.geometry as THREE.InstancedBufferGeometry).instanceCount);
    // The sparks, the rings at the cores and the launch column's cylinder are gone.
    for (const old of ['sparks', 'core', 'column']) assert.equal(view.root!.getObjectByName(`${old}-${i}`), undefined);
  }
  // The two hunted thermals share one layout, phased apart; the launch column has its own.
  assert.equal(named(view, 'motes-1').geometry, named(view, 'motes-2').geometry);
  assert.notEqual(named(view, 'motes-0').geometry, named(view, 'motes-1').geometry);
  assert.equal(view.root!.getObjectByName(`motes-${CLOUD_POOL.thermals}`), undefined);
  assert.equal(view.root!.getObjectsByProperty('isPoints', true).length, 1, 'only the ravens\' glints are points');
  for (let i = 0; i < CLOUD_POOL.ravens; i++) assert.equal(named(view, `raven-${i}`).rotation.order, 'YXZ');
  for (let i = 0; i < CLOUD_POOL.clouds; i++) assert.equal(named(view, `cloud-${i}`).isGroup, true);
  assert.equal(view.root!.getObjectByName(`raven-${CLOUD_POOL.ravens}`), undefined);
  assert.equal(view.root!.getObjectByName(`cloud-${CLOUD_POOL.clouds}`), undefined);
  // A ring across the whole zone at each milestone, and nowhere else but at the pilot's feet.
  const wide = view.root!.children.filter((part) => 'isLineLoop' in part && part.isLineLoop && !part.name);
  assert.deepEqual(wide.map((part) => part.position.y).slice(0, CLOUD_MILESTONES.length), [...CLOUD_MILESTONES]);
  assert.equal(wide.length, CLOUD_MILESTONES.length + 1);
  // No full-height cylinder is left: the dark sink columns went before, and the launch column is
  // its motes now.
  const tall = meshesIn(view.root!).filter((mesh) => mesh.geometry.type === 'CylinderGeometry' && (mesh.geometry as THREE.CylinderGeometry).parameters.height > 1000);
  assert.deepEqual(tall, []);
  view.dispose();
});

test('loaded models replace the stand-ins, and dispose releases the view\'s own parts and each skeleton but nothing of the loader\'s', async () => {
  const scene = new THREE.Scene();
  const loader = createTestLoader({ maps: true });
  const view = createCloudbase({ scene, loadModel: loader.loadModel });
  const ready = view.begin();
  const root = view.root as THREE.Group | null;

  // Before the files arrive: paper darts and plain lumps, all of them the view's own.
  const run = clearSky();
  const cloud = park(run.state.clouds[0], 125, 700, 238);
  const pos = { x: cloud.x, y: cloud.y - CLOUD_STRIKE.rise, z: cloud.z + 200 };
  const eye = { x: cloud.x, y: cloud.y, z: cloud.z - 200 };
  view.update(1, pos, run, eye);
  assert.deepEqual(view.loaded, { raven: false, clouds: false });
  const dart = named(view, 'raven-0').children[0];
  const lump = named(view, 'cloud-0').children[0];
  assert.equal(meshesIn(dart).length, 2);
  assert.equal(meshesIn(dart).every((mesh) => mesh.material.side === THREE.DoubleSide && mesh.geometry.attributes.position.count === 3), true);
  assert.equal(lump.geometry.type, 'IcosahedronGeometry');
  assert.equal(lump.material.alphaHash, true);
  const made = resources(root!);

  assert.equal(await ready, undefined);
  assert.deepEqual(view.loaded, { raven: true, clouds: true });
  assert.deepEqual(loader.calls.filter(([name]) => name === 'raven'), Array.from({ length: CLOUD_POOL.ravens }, () => ['raven', RAVEN.span, RAVEN.glow]));
  assert.deepEqual(loader.calls.filter(([name]) => name === 'clouds'), [['clouds', 1, CLOUD_GLOW]]);
  assert.equal(loader.calls.length, CLOUD_POOL.ravens + 1);
  // The files are asked for once, however many runs begin.
  view.reset();
  assert.equal(await view.begin(), undefined);
  assert.equal(loader.calls.length, CLOUD_POOL.ravens + 1);
  assert.deepEqual(view.loaded, { raven: true, clouds: true });
  const owned = await loader.owned();
  assert.equal(owned.textures.size, 2);

  // Every raven is now the file's bird: its own skeleton, the shared geometry and material,
  // turned to fly forward and given a culling sphere that holds while it flaps.
  const skeletons = new Set<THREE.Skeleton>();
  for (let i = 0; i < CLOUD_POOL.ravens; i++) {
    const holder = named(view, `raven-${i}`);
    assert.equal(holder.children.length, 1);
    const model = holder.children[0];
    assert.notEqual(model, i === 0 ? dart : null);
    const skins = meshesIn(model);
    assert.equal(skins.length, 1);
    assert.equal(skins[0].isSkinnedMesh, true);
    assert.equal(owned.geometries.has(skins[0].geometry), true);
    assert.equal(owned.materials.has(skins[0].material), true);
    assert.equal(skins[0].material.emissiveIntensity, RAVEN.glow);
    assert.equal(model.rotation.order, 'YXZ');
    assert.deepEqual([model.rotation.x, model.rotation.y, model.rotation.z], [RAVEN.tilt, Math.PI, 0]);
    assert.deepEqual(model.scale.toArray(), [RAVEN.span, RAVEN.span, RAVEN.span]);
    close(model.position.x, 0);
    close(model.position.y, -0.187 * RAVEN.span);
    close(model.position.z, 0.085 * RAVEN.span);
    assert.deepEqual(skins[0].boundingSphere!.center.toArray(), [0.003, 0.263, 0.026]);
    assert.equal(skins[0].boundingSphere!.radius, 0.56);
    assert.equal(skins[0].frustumCulled, true);
    skeletons.add(skins[0].skeleton);
  }
  assert.equal(skeletons.size, CLOUD_POOL.ravens);
  assert.equal(dart.parent, null);

  // Every cloud is the file's cloud, and the one in the camera's way wears a see-through copy of
  // the file's material that still shows the file's picture.
  view.update(2, pos, run, eye);
  const fileCloud = [...owned.materials].find((material) => named(view, 'cloud-1').children[0].children[0].material === material);
  assert.ok(fileCloud, 'a cloud out of the way wears the file\'s own material');
  assert.equal(fileCloud.emissiveIntensity, CLOUD_GLOW);
  for (let i = 0; i < CLOUD_POOL.clouds; i++) {
    const meshes = meshesIn(named(view, `cloud-${i}`));
    assert.equal(meshes.length, 1);
    assert.equal(owned.geometries.has(meshes[0].geometry), true);
    assert.equal(meshes[0].material === fileCloud, i !== 0);
  }
  const veil = meshesIn(named(view, 'cloud-0'))[0].material;
  assert.equal(owned.materials.has(veil), false);
  assert.equal(veil.alphaHash, true);
  assert.equal(veil.opacity, THIN);
  assert.equal(veil.map, fileCloud.map);
  assert.equal(veil.emissiveIntensity, CLOUD_GLOW);
  assert.equal(fileCloud.alphaHash, false);
  assert.equal(fileCloud.opacity, 1);
  assert.equal(lump.parent, null);

  // The flock still flies once it is real birds.
  Object.assign(run.state.ravens[0], { x: 100, y: 690, z: 200, fade: 1, flap: 1 });
  const shoulder = namedFixture(named(view, 'raven-0'), 'bone_13');
  view.update(0.25 / RAVEN.beat, pos, run, eye);
  const raised = shoulder.quaternion.clone();
  view.update(0.75 / RAVEN.beat, pos, run, eye);
  assert.ok(shoulder.quaternion.angleTo(raised) > 1, 'a working raven swings its wings from the top of a beat to the bottom');

  resources(root!, made);
  const mine = {
    geometries: [...made.geometries].filter((geometry) => !owned.geometries.has(geometry)),
    materials: [...made.materials].filter((material) => !(owned.materials as ReadonlySet<THREE.Material>).has(material)),
  };
  assert.equal(made.geometries.size - mine.geometries.length, owned.geometries.size);
  assert.equal(made.materials.size - mine.materials.length, owned.materials.size);
  assert.equal(mine.materials.includes(veil) && mine.materials.includes(lump.material) && mine.geometries.includes(lump.geometry), true);
  const counts = {
    mineGeometries: watch(mine.geometries),
    mineMaterials: watch(mine.materials),
    theirGeometries: watch(owned.geometries),
    theirMaterials: watch(owned.materials),
    theirPictures: watch(owned.textures),
  };
  // A skeleton says nothing when it is released; the texture its bones are drawn from does, and
  // that only exists once something has asked for it.
  for (const skeleton of skeletons) skeleton.computeBoneTexture();
  const boneTextures = watch([...skeletons].map((skeleton) => skeleton.boneTexture));

  view.dispose();
  view.dispose();
  assert.equal(scene.children.length, 0);
  releasedOnce(counts.mineGeometries, 'geometry of the view\'s');
  releasedOnce(counts.mineMaterials, 'material of the view\'s');
  releasedOnce(boneTextures, 'raven skeleton');
  for (const skeleton of skeletons) assert.equal(skeleton.boneTexture, null);
  neverReleased(counts.theirGeometries, 'geometry');
  neverReleased(counts.theirMaterials, 'material');
  neverReleased(counts.theirPictures, 'picture');
});

test('a model that arrives after dispose is dropped untouched, without complaint, and the scene stays empty', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const scene = new THREE.Scene();
  const loader = createTestLoader();
  const handed: THREE.Object3D<THREE.Object3DEventMap>[] = [];
  let open!: () => void;
  const gate = new Promise<void>((resolve) => { open = resolve; });
  const view = createCloudbase({
    scene,
    loadModel: (...args) => gate.then(() => loader.loadModel(...args)).then((model) => { handed.push(model); return model; }),
  });
  const ready = view.begin();
  assert.equal(scene.children.length, 1);
  view.dispose();
  assert.equal(scene.children.length, 0);
  open();
  assert.equal(await ready, undefined);
  assert.equal(handed.length, CLOUD_POOL.ravens + 1);
  for (const model of handed) {
    assert.equal(model.parent, null);
    assert.equal(model.quaternion.angleTo(new THREE.Quaternion()), 0);
    assert.equal(model.position.length(), 0);
    for (const mesh of meshesIn(model)) if (mesh.isSkinnedMesh) assert.equal(mesh.boundingSphere, null);
  }
  assert.deepEqual(view.loaded, { raven: false, clouds: false });
  assert.equal(scene.children.length, 0);
  assert.equal(view.root, null);
  assert.equal(warn.mock.callCount(), 0);
});

test('a loader that throws, rejects or hands over a bird with no wing bones leaves the stand-ins up and says so', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const real = createTestLoader();
  const run = clearSky();
  const standing = async (loadModel: ModelLoader) => {
    const view = createCloudbase({ scene: new THREE.Scene(), loadModel });
    assert.equal(await view.begin(), undefined);
    view.update(1, { x: 125, y: 300, z: 320 }, run, { x: 125, y: 310, z: 350 });
    return view;
  };
  const isDart = (view: { begin: () => Promise<void>|null; update: (time: number,pos: Vector3,run: CloudbaseRun|CloudbaseRun["state"],eye?: Vector3|null,sight?: number,bright?: boolean) => void; reset: () => void; dispose: () => void; light: (slot: number,level: number) => void; reveal: (amount: number) => void; shown: (slot: number) => boolean; root: THREE.Group<THREE.Object3DEventMap>|null; loaded: { raven: boolean; clouds: boolean; }; }) => meshesIn(named(view, 'raven-3')).length === 2;
  const isLump = (view: { begin: () => Promise<void>|null; update: (time: number,pos: Vector3,run: CloudbaseRun|CloudbaseRun["state"],eye?: Vector3|null,sight?: number,bright?: boolean) => void; reset: () => void; dispose: () => void; light: (slot: number,level: number) => void; reveal: (amount: number) => void; shown: (slot: number) => boolean; root: THREE.Group<THREE.Object3DEventMap>|null; loaded: { raven: boolean; clouds: boolean; }; }) => meshesIn(named(view, 'cloud-3'))[0].geometry.type === 'IcosahedronGeometry';

  // scenery.js's own loader throws outright in plain Node, before it has made a promise.
  let view = await standing(() => { throw new Error('no browser here'); });
  assert.deepEqual(view.loaded, { raven: false, clouds: false });
  assert.equal(isDart(view) && isLump(view), true);
  assert.equal(warn.mock.callCount(), 2);
  view.dispose();

  view = await standing(() => Promise.reject(new Error('404')));
  assert.deepEqual(view.loaded, { raven: false, clouds: false });
  assert.equal(isDart(view) && isLump(view), true);
  assert.equal(warn.mock.callCount(), 4);
  view.dispose();

  // One file can fail without the other.
  view = await standing((name: string, size: number, glow: number|undefined) => (name === 'clouds' ? Promise.reject(new Error('404')) : real.loadModel(name, size, glow)));
  assert.deepEqual(view.loaded, { raven: true, clouds: false });
  assert.equal(!isDart(view) && isLump(view), true);
  assert.equal(warn.mock.callCount(), 5);
  view.dispose();

  // A bird that cannot be rigged is left out, and its stand-in stays.
  const boneless: THREE.Object3D<THREE.Object3DEventMap>[] = [];
  view = await standing((name: string, size: number, glow: number|undefined) => real.loadModel('clouds', size, glow).then((model) => {
    if (name === 'raven') boneless.push(model);
    return model;
  }));
  assert.deepEqual(view.loaded, { raven: false, clouds: true });
  assert.equal(isDart(view) && !isLump(view), true);
  assert.equal(boneless.length, CLOUD_POOL.ravens);
  assert.equal(boneless.every((model) => model.parent === null && model.rotation.x === 0), true);
  assert.equal(warn.mock.callCount(), 6);
  view.dispose();
});

test('a whole run can be drawn frame by frame, models and all, without a number going astray', async () => {
  const view = createCloudbase({ scene: new THREE.Scene(), loadModel: createTestLoader().loadModel });
  assert.ok(view);
  await view.begin();
  const run = createCloudbaseRun();
  run.reset(80, 11);
  const { state } = run;
  // A plain pilot: fly at trim speed to the best lift there is, circle 12 m off its axis and
  // rise with the air, with the camera trailing behind and above.
  const pos = { x: 85, y: 80, z: 320 };
  const eye = { x: 60, y: 90, z: 320 };
  const seen = { ravens: 0, clouds: 0, hunted: 0, launch: 0, frames: 0 };
  const hunted = [named(view, 'motes-1'), named(view, 'motes-2')];
  const clouds = view.root!.children.filter((part: { name: string; }) => /^cloud-/.test(part.name));
  const ravens = named(view, 'ravens').children.filter((part: { name: string; }) => /^raven-/.test(part.name));
  const { glow } = named(view, 'glints').geometry.attributes;
  let climb = 0;
  let ended = null;
  while (!ended && state.elapsed < 600) {
    const lift = [1, 2, 0].map((i) => state.thermals[i]).find((thermal) => thermal.live && thermal.move === 0 && thermal.strength > 0.3) ?? state.thermals[1];
    const round = state.elapsed * 0.8;
    const aim = { x: lift.x + 12 * Math.sin(round) - pos.x, z: lift.z - 12 * Math.cos(round) - pos.z };
    const far = Math.hypot(aim.x, aim.z);
    const stride = Math.min(far, 11.5 * STEP) / (far || 1);
    const yaw = Math.atan2(aim.x, -aim.z);
    const air = run.sample(pos, yaw);
  assert.ok(air);
    climb += (air.lift! - 1.2 - air.sink! - climb) / 24;
    pos.x += aim.x * stride;
    pos.z += aim.z * stride;
    pos.y += climb * STEP;
    Object.assign(eye, { x: pos.x - 26 * Math.sin(yaw), y: pos.y + 9.5, z: pos.z + 26 * Math.cos(yaw) });
    ended = run.step(STEP, pos);
    view.update(state.elapsed, pos, run, eye);
    seen.frames += 1;
    seen.launch += named(view, 'motes-0').visible ? 1 : 0;
    seen.hunted += hunted.some((motes) => motes.visible) ? 1 : 0;
    seen.ravens += ravens.some((holder) => holder.visible) ? 1 : 0;
    seen.clouds += clouds.some((holder) => holder.visible) ? 1 : 0;
    if (seen.frames % 20) continue;
    view.root!.updateMatrixWorld(true);
    view.root!.traverse((part) => {
      if (!part.matrixWorld.elements.every(Number.isFinite)) assert.fail(`${part.name || part.type} is somewhere impossible at ${state.elapsed.toFixed(1)} s`);
      // Every number the motes' shader is handed, too.
      for (const [name, uniform] of Object.entries(renderFixture(part) ? part.material?.uniforms ?? {} : {})) {
        const value = uniform.value;
        const numbers = typeof value === 'number' ? [value] : value?.toArray?.() ?? [];
        if (!numbers.every(Number.isFinite)) assert.fail(`${part.name}'s ${name} is ${value} at ${state.elapsed.toFixed(1)} s`);
      }
    });
    assert.equal(glow.array.every((value: number) => value >= 0 && value <= 1), true);
  }
  assert.equal(ended, 'fog');
  // Loose on purpose: this is about drawing, and must not start failing when the balance is tuned.
  assert.ok(state.peak > 300, `the pilot got somewhere (${state.peak.toFixed(0)} m)`);
  for (const [what, frames] of Object.entries(seen)) assert.ok(frames > 60, `${what} were on show for ${frames} frames`);
  view.dispose();
});

test('hunted thermals\' motes are dark beyond 85 m and lit on the axis, while the launch column is lit from anywhere', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  view.begin();
  const run = createCloudbaseRun();
  run.reset(80, 3);
  const [launch, first, second] = run.state.thermals;
  const motes = [0, 1, 2].map((i) => named(view, `motes-${i}`));
  const uniform = (i: number, name: string) => motes[i].material.uniforms[name].value;
  const launchLit = () => {
    assert.equal(motes[0].visible, true);
    assert.equal(uniform(0, 'near'), 1);
    assert.equal(uniform(0, 'strength'), 1);
  };

  // 90 m from the first hunted thermal and further still from the other: nothing of either.
  let pos = pilotAt(beyond(first, second, 90), 300);
  view.update(1, pos, run);
  for (const i of [1, 2]) {
    assert.equal(motes[i].visible, false);
    assert.equal(uniform(i, 'near'), 0);
  }
  launchLit();

  // On the axis: every mote in a short window just under the pilot, spread over its radius.
  pos = pilotAt(first, 300);
  view.update(2, pos, run);
  assert.equal(motes[1].visible, true);
  assert.equal(uniform(1, 'near'), 1);
  assert.equal(uniform(1, 'strength'), first.strength);
  assert.equal(first.strength, 1);
  assert.equal(uniform(1, 'span'), 120);
  assert.equal(uniform(1, 'radius'), first.r);
  assert.deepEqual(motes[1].position.toArray(), [first.x, 260, first.z]);
  assert.equal(uniform(1, 'foot'), 260);
  assert.equal(motes[1].frustumCulled, false);
  assert.equal(motes[2].visible, false, 'the other thermal is at least 85 m away and stays dark');
  launchLit();
  // The launch column keeps its tall window, well below the pilot, and its own radius.
  assert.equal(uniform(0, 'span'), 240);
  assert.equal(uniform(0, 'radius'), launch.r);
  assert.deepEqual(motes[0].position.toArray(), [launch.x, 200, launch.z]);

  // Coming closer, the motes come up between 85 m and 46 m.
  view.update(3, pilotAt(beyond(first, second, 86), 300), run);
  assert.equal(motes[1].visible, false);
  view.update(3, pilotAt(beyond(first, second, 65.5), 300), run);
  close(uniform(1, 'near'), 0.5);
  assert.equal(motes[1].visible, true);
  view.update(3, pilotAt(beyond(first, second, 46), 300), run);
  assert.equal(uniform(1, 'near'), 1);

  // The fog lifts the foot of every window, and a weakening thermal is handed its strength.
  run.state.fogHeight = 280;
  first.strength = 0.25;
  view.update(4, pos, run);
  assert.equal(motes[1].position.y, 280);
  assert.equal(motes[0].position.y, 280);
  assert.equal(uniform(1, 'strength'), 0.25);
  launch.strength = 0.5;
  view.update(4, pos, run);
  assert.equal(uniform(0, 'strength'), 0.5);
  Object.assign(launch, { strength: 0, live: false });
  view.update(4, pos, run);
  assert.equal(motes[0].visible, false, 'a spent launch column is gone');
  view.dispose();
});

test('under Ansuz a hunted thermal\'s motes are seen twice as far, drawn as large as that much nearer, and the launch column is as it was', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  view.begin();
  const run = createCloudbaseRun();
  run.reset(80, 3);
  const [, first, second] = run.state.thermals;
  const motes = [0, 1].map((i) => named(view, `motes-${i}`));
  const uniform = (i: number, name: string) => motes[i].material.uniforms[name].value;
  // 131 m off, half way into the stretched fade (92 to 170 m): dark without the blessing.
  const far = pilotAt(beyond(first, second, 131), 300);
  view.update(1, far, run);
  assert.equal(motes[1].visible, false);
  assert.equal(uniform(1, 'sight'), 1);
  view.update(1, far, run, null, BLESSING.sparks);
  assert.equal(BLESSING.sparks, 2);
  assert.ok(motes[1].visible);
  close(uniform(1, 'near'), 0.5, 1e-6);
  assert.equal(uniform(1, 'sight'), 2, 'its motes drawn twice the size for their distance');
  assert.match(motes[1].material.vertexShader, /170\.0 \* sight \/ away/);
  // Twice 85 m out it is dark even so, and within twice 46 m it is all there.
  view.update(1, pilotAt(beyond(first, second, 171), 300), run, null, BLESSING.sparks);
  assert.equal(motes[1].visible, false);
  view.update(1, pilotAt(beyond(first, second, 92), 300), run, null, BLESSING.sparks);
  assert.equal(uniform(1, 'near'), 1);
  // The launch column is lit from anywhere anyway, and its motes keep their size.
  assert.equal(uniform(0, 'sight'), 1);
  assert.equal(uniform(0, 'near'), 1);
  view.dispose();
});

test('the motes are drawn after the fog, which would otherwise paint over them, and before the ravens\' glints, and are never put under the fog', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  view.begin();
  const run = createCloudbaseRun();
  run.reset(80, 3);
  // The fog's surface is see-through, writes no depth and is drawn late, so it covers every
  // see-through thing drawn before it, in front of it or not.
  const fog = meshesIn(view.root!).find((mesh) => mesh.geometry.type === 'CircleGeometry')!;
  assert.deepEqual([fog.material.transparent, fog.material.depthWrite], [true, false]);
  assert.ok(fog.renderOrder > 0);
  // And whatever is drawn after the motes is drawn over them: every mark that must never be lost
  // in a crowded core comes later, the glints, the threat rings and the glide ring among them.
  const glints = named(view, 'glints');
  const marks = [0, 1, 2].map((i) => named(view, `motes-${i}`));
  for (const mark of marks) {
    assert.ok(mark.renderOrder > fog.renderOrder && mark.renderOrder < glints.renderOrder, `${mark.name} is drawn after the fog and before the glints`);
    assert.equal(mark.renderOrder, ORDER.lift);
    assert.deepEqual([mark.material.transparent, mark.material.depthWrite, mark.material.fog], [true, false, false]);
    assert.equal(mark.material.blending, THREE.NormalBlending);
  }
  assert.equal(named(view, 'threat-0').renderOrder, ORDER.aboveFog);
  assert.ok(ORDER.fog < ORDER.lift && ORDER.lift < ORDER.aboveFog);

  // Drawn after the fog, they would show through it from above if they were ever below it.
  // On the axis of a hunted thermal, with the fog far below, just under the pilot and above.
  const pos = pilotAt(run.state.thermals[1], 300);
  for (const fogHeight of [0, 150, 259, 261, 289, 291, 296, 340]) {
    run.state.fogHeight = fogHeight;
    view.update(1, pos, run);
    assert.equal(fog.position.y, fogHeight);
    // The motes only rise from where their mesh stands, the foot of their window.
    for (const mark of marks) {
      assert.ok(mark.position.y >= fogHeight, `${mark.name} is at ${mark.position.y} m over fog at ${fogHeight} m`);
      assert.equal(mark.material.uniforms.foot.value, mark.position.y);
    }
  }
  view.dispose();
});

test('nothing is drawn at a hunted site while its flock is still flying there, and the motes follow the thermal when it lands', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  view.begin();
  const run = createCloudbaseRun();
  run.reset(80, 3);
  const thermal = run.state.thermals[2];
  const motes = named(view, 'motes-2');
  const rise = () => motes.material.uniforms.rise.value;
  const old = { x: thermal.x, z: thermal.z };

  // By plain numbers first: lift that is switched on but still has a flock on its way shows
  // nothing, and its motes are carried nowhere.
  thermal.move = 6;
  view.update(1, pilotAt(thermal, 300), run);
  const still = rise();
  view.update(1.05, pilotAt(thermal, 300), run);
  assert.equal(motes.visible, false);
  assert.equal(motes.material.uniforms.strength.value, 0);
  assert.equal(rise(), still);
  thermal.move = 0;
  view.update(1.1, pilotAt(thermal, 300), run);
  assert.equal(motes.visible, true);
  assert.ok(rise() > still);

  // Then for real: sit in it until it is used up and its ravens leave for somewhere else.
  let pos = pilotAt(old, 300);
  thermal.wear = CLOUD_WEAR.dead;
  for (let i = 0; i < 40 * 60 && thermal.move === 0; i++) run.step(STEP, pos);
  assert.ok(thermal.move > 0, 'the worn-out thermal has moved on');
  assert.ok(Math.hypot(thermal.x - old.x, thermal.z - old.z) >= CLOUD_HUNT.hop);
  for (const point of [old, thermal]) {
    view.update(run.state.elapsed, pilotAt(point, 300), run);
    assert.equal(motes.visible, false, 'neither the old site nor the new one shows anything');
  }
  // Wait at the new site for the flock to arrive and the lift to bloom, drawing every frame: the
  // motes are carried by exactly a frame of the lift there is, which is none while the flock flies.
  pos = pilotAt(thermal, 300);
  const held = rise();
  let flying = 0;
  for (let i = 0; i < 30 * 60 && !(thermal.move === 0 && thermal.strength > 0.9); i++) {
    run.step(STEP, pos);
    const before = rise();
    view.update(run.state.elapsed, pos, run);
    const lifting = thermal.live && thermal.move === 0 ? thermal.strength : 0;
    close(rise() - before, THERMAL_MOTES.flow * thermal.s * CLOUD_HUNT.peak * lifting * STEP, 1e-9);
    if (thermal.move > 0) {
      flying += 1;
      assert.equal(rise(), held);
      assert.equal(motes.visible, false);
    }
  }
  assert.ok(flying > 60, `the flock flew for ${flying} frames`);
  assert.equal(thermal.live && thermal.move === 0, true);
  assert.equal(motes.visible, true);
  assert.deepEqual([motes.position.x, motes.position.z], [thermal.x, thermal.z]);
  assert.equal(motes.material.uniforms.strength.value, thermal.strength);
  assert.ok(rise() > held, 'and the air carries the motes up again');
  view.dispose();
});

test('one second at full strength lifts a core mote at the actual 5.5 m/s airspeed', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  view.begin();
  const run = createCloudbaseRun({ hazards: false, wind: false });
  run.reset(80, 3);
  const thermal = run.state.thermals[1];
  // Only this thermal lifts, so that the run's lift anywhere near it is its own.
  run.state.thermals.forEach((t, i) => { if (i !== 1) Object.assign(t, { live: false, strength: 0 }); });
  assert.equal(thermal.strength, 1);
  const motes = named(view, 'motes-1');
  const pos = pilotAt(thermal, 300);
  view.update(5, pos, run);
  const from = motes.material.uniforms.rise.value;
  for (let n = 1; n <= 60; n++) view.update(5 + n / 60, pos, run);
  const core = CLOUD_HUNT.s * CLOUD_HUNT.peak;
  close(core, 5.5, 0.01);
  close(motes.material.uniforms.rise.value - from, THERMAL_MOTES.flow * core, 1e-9);
  // Each mote rises at its share of that, which is half as fast again as the run's lift where it is.
  const layout = layoutMotes(true, THERMAL_MOTES.count.hunted);
  const u = valuesOf(motes);
  const there = { x: 0, y: 300, z: 0 };
  for (let i = 0; i < layout.count; i += 3) {
    const mote = moteAt(layout, i, u);
    there.x = mote.x;
    there.z = mote.z;
    close(mote.vy, THERMAL_MOTES.flow * run.sample(there, 0).lift!, 1e-4);
  }
  view.dispose();
});

test('a weakening thermal slows its motes without a jump: rise only grows, by one frame of its lift at a time', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  view.begin();
  const run = createCloudbaseRun();
  run.reset(80, 3);
  const thermal = run.state.thermals[2];
  const motes = named(view, 'motes-2');
  const rise = () => motes.material.uniforms.rise.value;
  // Sit in its core, drawing every frame, until it wears out and its flock moves on.
  const pos = pilotAt(thermal, 300);
  view.update(run.state.elapsed, pos, run);
  let weakest = 1;
  let most = 0;
  for (let i = 0; i < 140 * 60 && thermal.move === 0; i++) {
    pos.x = thermal.x; pos.z = thermal.z;
    run.step(STEP, pos);
    const before = rise();
    view.update(run.state.elapsed, pos, run);
    const lifting = thermal.live && thermal.move === 0 ? thermal.strength : 0;
    const moved = rise() - before;
    assert.ok(moved >= 0, 'the motes never slide back down their ladder');
    close(moved, THERMAL_MOTES.flow * thermal.s * CLOUD_HUNT.peak * lifting * STEP, 1e-9);
    most = Math.max(most, moved);
    weakest = Math.min(weakest, lifting);
  }
  assert.ok(thermal.move > 0 && weakest < 0.05, 'the thermal wore all the way out');
  // Never more than a frame of the best lift there is. Worked out from the clock instead, every
  // mote would jump by the change in speed times the whole time flown, metres in a frame.
  assert.ok(most <= 1.5 * CLOUD_HUNT.s * CLOUD_HUNT.peak * STEP + 1e-9, `${most.toFixed(3)} m in one frame`);
  view.dispose();
});

test('strength 0, or a flock on its way, draws nothing; past the first mote\'s strength it draws', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  view.begin();
  const run = createCloudbaseRun();
  run.reset(80, 3);
  const [launch, thermal] = run.state.thermals;
  const motes = [named(view, 'motes-0'), named(view, 'motes-1')];
  const pos = pilotAt(thermal, 300);
  const drawn = (strength: number, move = 0) => {
    Object.assign(thermal, { strength, move });
    launch.strength = strength;
    view.update(1, pos, run);
    return motes.map((mesh) => mesh.visible);
  };
  const { first } = THERMAL_MOTES;
  assert.deepEqual(drawn(0), [false, false]);
  assert.deepEqual(drawn(first), [false, false]);
  assert.deepEqual(drawn(first + 1e-3), [true, true]);
  assert.deepEqual(drawn(1), [true, true]);
  assert.deepEqual(drawn(1, 4), [true, false], 'a flock on its way');
  assert.equal(motes[1].material.uniforms.strength.value, 0);
  // Below the first mote's strength not one mote would show anyway, so nothing is lost.
  const layout = layoutMotes(true, THERMAL_MOTES.count.hunted);
  for (let i = 0; i < layout.count; i++) assert.ok(layout.seed[i * 4 + 3] >= first);
  view.dispose();
});

test('paused, the motes hold still', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  view.begin();
  const run = createCloudbaseRun();
  run.reset(80, 3);
  const pos = pilotAt(run.state.thermals[1], 300);
  const motes = [0, 1, 2].map((i) => named(view, `motes-${i}`));
  const phases = () => motes.map((mesh) => ['rise', 'turn', 'clock'].map((name) => mesh.material.uniforms[name].value));
  // A new run's first frame moves nothing: each thermal starts from its own place.
  view.update(run.state.elapsed, pos, run);
  assert.deepEqual(phases().map(([rise, turn]) => [rise, turn]), [[0, 0], [37, 2.4], [74, 4.8]]);
  for (let n = 0; n < 30; n++) {
    run.step(STEP, pos);
    view.update(run.state.elapsed, pos, run);
  }
  const held = phases();
  // With the map open or the flight held, the run's clock stands still while frames are drawn,
  // and the pilot and camera may still move (the map, the spy camera).
  for (let n = 0; n < 30; n++) {
    pos.y += 1;
    view.update(run.state.elapsed, pos, run, { x: pos.x - 26, y: pos.y + 9.5, z: pos.z });
  }
  assert.deepEqual(phases(), held);
  // And a new run starts afresh, whatever the clock read at the last one.
  view.begin();
  view.update(run.state.elapsed + 30, pos, run);
  assert.deepEqual(phases().map(([rise, turn]) => [rise, turn]), [[0, 0], [37, 2.4], [74, 4.8]]);
  view.dispose();
});

test('all five thermals draw with one shader, and the launch\'s is drawn on a run\'s first update', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  view.begin();
  const motes = [0, 1, 2].map((i) => named(view, `motes-${i}`));
  const [first, ...rest] = motes.map((mesh) => mesh.material);
  // three builds one program for materials whose text and settings are the same.
  for (const material of rest) {
    assert.notEqual(material, first, 'each with uniforms of its own');
    assert.equal(material.vertexShader, first.vertexShader);
    assert.equal(material.fragmentShader, first.fragmentShader);
    assert.deepEqual(material.defines, first.defines);
    for (const setting of (['side', 'blending', 'transparent', 'depthWrite', 'depthTest', 'fog'] as const)) assert.equal(material[setting], first[setting], setting);
    assert.equal(material.customProgramCacheKey(), first.customProgramCacheKey());
  }
  assert.equal(first.side, THREE.DoubleSide);
  // Colours leave in the screen's colour space, as the glints' do (the sparks' never did).
  assert.match(first.fragmentShader, /#include <colorspace_fragment>\s*\}\s*$/);
  // The look the table names is the one worn, shared by all three.
  const look = THERMAL_MOTES.looks[THERMAL_MOTES.look];
  for (const material of [first, ...rest]) {
    for (const name of (['gold', 'amber', 'ash'] as const)) assert.equal(material.uniforms[name].value.getHex(), look[name]);
    assert.equal(material.uniforms.opacity.value, look.head);
  }
  // Nothing shows before the run's first update, and that update draws the launch column from
  // anywhere in the zone, 250 m away and more, so the program is built on the first frame and
  // never in the middle of a flight.
  assert.equal(motes.some((mesh) => mesh.visible), false);
  const run = createCloudbaseRun();
  run.reset(80, 3);
  const [launch] = run.state.thermals;
  const far = { x: launch.x, y: 120, z: launch.z - 250 };
  view.update(0, far, run);
  assert.equal(motes[0].visible, true);
  assert.equal(motes[0].material.uniforms.near.value, 1);
  view.dispose();
});

test('drawing the motes makes no arrays and never rewrites their buffers, frame after frame', () => {
  assert.ok(arraysMadeBy(() => new Float32Array(1)) > 0, 'the counter sees what it should');
  const view = createCloudbase({ scene: new THREE.Scene() });
  view.begin();
  const run = createCloudbaseRun();
  run.reset(80, 7);
  const motes = [0, 1, 2].map((i) => named(view, `motes-${i}`));
  const parts = motes.map((mesh) => [mesh.geometry, mesh.material]);
  const pos = pilotAt(run.state.thermals[1], 300);
  const eye = { x: pos.x - 26, y: pos.y + 9.5, z: pos.z };
  let made = 0;
  for (let n = 0; n < 600; n++) {
    run.step(STEP, pos);
    pos.y += 0.2;
    eye.y += 0.2;
    if (n === 300) view.reveal(1);
    // Ansuz on and off, and the glow dropped every other frame: every way of drawing them.
    made += arraysMadeBy(() => view.update(run.state.elapsed, pos, run, eye, n % 200 < 100 ? 1 : BLESSING.sparks, n % 2 === 0));
  }
  assert.equal(made, 0, `${made} arrays were made while drawing`);
  assert.ok(motes[0].visible && motes[1].visible, 'and they were drawn all the while');
  motes.forEach((mesh, i) => {
    assert.equal(mesh.geometry, parts[i][0]);
    assert.equal(mesh.material, parts[i][1]);
    for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) assert.equal((attribute as THREE.BufferAttribute).version, 0, `${mesh.name}'s ${name} is never rewritten`);
    assert.equal(mesh.geometry.index!.version, 0);
  });
  view.dispose();
});

test('under reduced motion motes keep physical rise without twinkle or a decorative vortex', () => {
  const run = createCloudbaseRun();
  run.reset(80, 3);
  const thermal = run.state.thermals[1];
  const pos = pilotAt(thermal, 300);
  // What one second at full strength does to a thermal's motes.
  const second = (calm: boolean) => {
    const view = createCloudbase({ scene: new THREE.Scene(), calm });
    view.begin();
    const { uniforms } = named(view, 'motes-1').material;
    view.update(1, pos, run);
    const from = { rise: uniforms.rise.value, turn: uniforms.turn.value };
    for (let n = 1; n <= 60; n++) view.update(1 + n / 60, pos, run);
    const moved = { rise: uniforms.rise.value - from.rise, turn: uniforms.turn.value - from.turn, twinkle: uniforms.twinkle.value };
    view.dispose();
    return moved;
  };
  const calm = second(true);
  const lively = second(false);
  const core = CLOUD_HUNT.s * CLOUD_HUNT.peak;
  // The air's own pace: a calm visitor's core motes keep up with a pilot centred in the core.
  close(calm.rise, THERMAL_MOTES.calm.flow * core, 1e-9);
  close(lively.rise, THERMAL_MOTES.flow * core, 1e-9);
  assert.equal(THERMAL_MOTES.calm.flow, 1);
  close(calm.turn, THERMAL_MOTES.calm.swirl * thermal.dir, 1e-9);
  close(lively.turn, THERMAL_MOTES.swirl * thermal.dir, 1e-9);
  assert.deepEqual([calm.turn, lively.turn], [0, 0], 'no decorative vortex in either motion setting');
  assert.deepEqual([calm.twinkle, lively.twinkle], [0, THERMAL_MOTES.twinkle]);
});

test('with the glow dropped the motes are drawn brighter', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  view.begin();
  const run = createCloudbaseRun();
  run.reset(80, 3);
  const pos = pilotAt(run.state.thermals[1], 300);
  const motes = [0, 1, 2].map((i) => named(view, `motes-${i}`));
  view.update(1, pos, run);
  assert.deepEqual(motes.map((mesh) => mesh.material.uniforms.boost.value), [1, 1, 1]);
  view.update(1, pos, run, null, 1, true);
  assert.deepEqual(motes.map((mesh) => mesh.material.uniforms.boost.value), [1.4, 1.4, 1.4]);
  assert.equal(THERMAL_MOTES.unbloomed, 1.4);
  // Every pixel's alpha is multiplied by it.
  assert.match(motes[0].material.fragmentShader, /\* opacity \* vAlpha \* boost\)/);
  view.update(1, pos, run, null, 1, false);
  assert.equal(motes[1].material.uniforms.boost.value, 1);
  view.dispose();
});

test('a raven is drawn at its simulated place, heading and bank, scaled by its fade, and hidden once it has faded out or is in the fog', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  assert.ok(view);
  view.begin();
  const run = createCloudbaseRun();
  run.reset(80, 2);
  const pos = pilotAt(run.state.thermals[1], 400);
  run.step(STEP, pos);
  view.update(run.state.elapsed, pos, run);
  // Straight from the simulation: every bird of both flocks.
  let drawn = 0;
  run.state.ravens.forEach((raven, i) => {
    const holder = named(view, `raven-${i}`);
    assert.deepEqual(holder.position.toArray(), [raven.x, raven.y, raven.z]);
    assert.deepEqual([holder.rotation.x, holder.rotation.y, holder.rotation.z], [0, -raven.heading, -raven.bank]);
    assert.deepEqual(holder.scale.toArray(), [raven.fade, raven.fade, raven.fade]);
    assert.equal(holder.visible, raven.fade > 0.01);
    drawn += holder.visible ? 1 : 0;
  });
  assert.ok(drawn >= 6, `most of the ten ravens are in the air around the pilot (${drawn})`);

  // And by plain numbers, where the arrangement has to be exact.
  const raven = Object.assign(run.state.ravens[3], { x: 131, y: 417, z: 222, heading: 1.2, bank: 0.4, fade: 0.7, flap: 0.3 });
  const holder = named(view, 'raven-3');
  view.update(5, pos, run);
  assert.deepEqual(holder.position.toArray(), [131, 417, 222]);
  assert.deepEqual([holder.rotation.x, holder.rotation.y, holder.rotation.z, holder.rotation.order], [0, -1.2, -0.4, 'YXZ']);
  assert.deepEqual(holder.scale.toArray(), [0.7, 0.7, 0.7]);
  assert.equal(holder.visible, true);
  // East and banked right: the nose of the holder (-z) points to +x and its right side (+x) dips.
  Object.assign(raven, { heading: Math.PI / 2, bank: 0.5 });
  view.update(5, pos, run);
  view.root!.updateMatrixWorld(true);
  const nose = new THREE.Vector3(0, 0, -1).transformDirection(holder.matrixWorld);
  const right = new THREE.Vector3(1, 0, 0).transformDirection(holder.matrixWorld);
  close(nose.x, 1, 1e-9);
  close(right.z, Math.cos(0.5), 1e-9);
  close(right.y, -Math.sin(0.5), 1e-9);

  raven.fade = 0.01;
  view.update(5, pos, run);
  assert.equal(holder.visible, false);
  raven.fade = 0;
  view.update(5, pos, run);
  assert.equal(holder.visible, false);
  // Nor is its mark: a glint left shining on the fog would point at a bird that is not there.
  const { glow } = named(view, 'glints').geometry.attributes;
  raven.fade = 1;
  run.state.fogHeight = raven.y - 1;
  view.update(5, pos, run);
  assert.equal(holder.visible, false, 'a raven within 2 m of the fog is not drawn');
  assert.equal(glow.getX(3), 0);
  run.state.fogHeight = raven.y - 3;
  view.update(5, pos, run);
  assert.equal(holder.visible, true);
  assert.ok(glow.getX(3) > 0.3);
  view.dispose();
});

test('the stand-in dart flaps both halves together when its raven works', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  assert.ok(view);
  view.begin();
  const run = clearSky();
  const pos = { x: 125, y: 400, z: 238 };
  Object.assign(run.state.ravens[0], { x: 125, y: 420, z: 238, heading: 0, bank: 0, fade: 1, flap: 1 });
  const [right, left] = meshesIn(named(view, 'raven-0'));
  assert.equal(left.scale.x, -1);
  const tip = (half: SceneFixture) => new THREE.Vector3().fromBufferAttribute(half.geometry.attributes.position, 2).applyMatrix4(half.matrixWorld);
  const heights = [];
  for (let n = 0; n < 12; n++) {
    view.update(n / 12 / RAVEN.beat, pos, run);
    view.root!.updateMatrixWorld(true);
    const [a, b] = [tip(right), tip(left)];
    close(a.y, b.y, 1e-9);
    close(a.x - 125, 125 - b.x, 1e-9);
    heights.push(a.y - 420);
  }
  assert.ok(Math.max(...heights) > 0.5 && Math.min(...heights) < -0.5, 'the tips beat above and below the body');
  view.dispose();
});

test('every raven is posed for its own place in the flock, so no two of them beat in step, as darts or as real birds', async () => {
  const loader = createTestLoader();
  const run = clearSky();
  const pos = { x: 125, y: 400, z: 238 };
  const line = (flap: number) => run.state.ravens.forEach((raven, i) => Object.assign(raven, { x: 80 + 10 * i, y: 420, z: 238, heading: 0, bank: 0, fade: 1, flap }));
  // The beat laid down for the flock: 2.8 a second, each bird 0.618 of a beat ahead of the one
  // before, about a line just below level, with a slow sway of its own.
  const lift = (time: number, i: number, effort: number) => 0.03 * Math.sin(0.9 * time + 2.4 * i) - 0.12 * effort + 0.62 * effort * Math.sin(2 * Math.PI * (time * 2.8 + i * 0.618));
  // A moment when some soaring birds are giving their lazy beats and others are gliding.
  let lazy = 0;
  const some = () => run.state.ravens.filter((_, i) => ravenEffort(lazy, i, 0) > 0.4).length;
  while (some() < 2 || some() > CLOUD_POOL.ravens - 2) lazy += 0.05;

  const darts = createCloudbase({ scene: new THREE.Scene() });
  darts.begin();
  for (const [time, flap] of [[3.21, 1], [lazy, 0]]) {
    line(flap);
    darts.update(time, pos, run);
    const lifts = run.state.ravens.map((_, i) => meshesIn(named(darts, `raven-${i}`))[0].rotation.z);
    lifts.forEach((angle, i) => close(angle, lift(time, i, ravenEffort(time, i, flap)), 1e-12));
    if (flap) assert.equal(new Set(lifts.map((angle) => angle.toFixed(2))).size, CLOUD_POOL.ravens, 'no two working darts hold their wings alike');
  }
  darts.dispose();

  // The real birds, against one more raven from the same file posed by hand for each place.
  const birds = createCloudbase({ scene: new THREE.Scene(), loadModel: loader.loadModel });
  await birds.begin();
  const wings = rigRaven(await loader.loadModel('raven', RAVEN.span, RAVEN.glow));
  assert.ok(wings);
  const joints = wings.flatMap((wing) => [wing.shoulder, wing.elbow, wing.wrist, wing.hand]);
  for (const [time, flap] of [[3.21, 1], [lazy, 0]]) {
    line(flap);
    birds.update(time, pos, run);
    const shoulders = [];
    for (let i = 0; i < CLOUD_POOL.ravens; i++) {
      poseRaven(wings, time, i, ravenEffort(time, i, flap));
      for (const joint of joints) {
        // Number for number: the file's own turns are a hair off unit length, which is enough
        // to spoil an angle taken between two of them.
        const drawn = named(birds, `raven-${i}`).getObjectByName(joint.bone.name)!.quaternion.toArray();
        const posed = joint.bone.quaternion.toArray();
        assert.ok(drawn.every((value: number, n: number) => Math.abs(value - posed[n]) < 1e-12), `${joint.bone.name} of raven ${i} is where its place in the flock puts it`);
      }
      shoulders.push(joints[0].bone.quaternion.clone());
    }
    for (let i = 1; flap && i < shoulders.length; i++) assert.ok(shoulders[i].angleTo(shoulders[i - 1]) > 0.05, `working ravens ${i - 1} and ${i} are out of step`);
  }
  birds.dispose();
});

test('one glint marks each raven: dimmer as its lift dies, bright while its flock leads the way to new lift, red and larger on a threat', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  assert.ok(view);
  view.begin();
  const run = clearSky(6);
  const pos = { x: 125, y: 400, z: 238 };
  const glints = named(view, 'glints');
  const { position, glow, threat } = glints.geometry.attributes;
  const { material } = glints;
  assert.equal(glints.isPoints, true);
  assert.equal(view.root!.getObjectsByProperty('isPoints', true).filter((points: { name: string; }) => points.name === 'glints').length, 1);
  assert.equal(position.count, CLOUD_POOL.ravens);
  assert.equal(glints.frustumCulled, false);
  assert.deepEqual([material.fog, material.transparent, material.depthWrite], [false, true, false]);
  // The fog's surface paints over see-through things drawn before it; the glints come after.
  const fog = meshesIn(view.root!).find((mesh) => mesh.geometry.type === 'CircleGeometry')!;
  assert.ok(glints.renderOrder > fog.renderOrder);
  const { calm, alarm } = material.uniforms;
  assert.equal(calm.value.getHex(), 0xc9a8ff);
  // A threat's mark is the threat red, lit until it is no dimmer than a calm one and bright
  // enough for the game's glow: left plain, a bird would go dim just as it turned dangerous.
  assert.equal(alarm.value.clone().multiplyScalar(1 / RAVEN.flare).getHex(), RAVEN.threat);
  assert.ok(luma(new THREE.Color(RAVEN.threat)) < GLOW, 'the plain red would not glow');
  assert.ok(luma(calm.value) > GLOW);
  assert.ok(luma(alarm.value) >= luma(calm.value), `a threat's mark (${luma(alarm.value).toFixed(3)}) is as bright as a calm one (${luma(calm.value).toFixed(3)})`);
  // Node cannot run a shader. The checks on its text here and below only keep the wording of
  // three rules in place: colours leave in the screen's colour space, the size has a floor in
  // CSS pixels, and a threat is larger. Only a browser can show that they come out right.
  assert.match(material.fragmentShader, /#include <colorspace_fragment>\s*\}\s*$/);
  assert.match(material.vertexShader, /gl_PointSize = pixel \* clamp\([^;]*, 4\.0, 10\.0\)/);
  // The floor is in CSS pixels, so it follows the renderer's pixel ratio.
  (glints.onBeforeRender as (renderer: Pick<THREE.WebGLRenderer, 'getPixelRatio'>) => void)({ getPixelRatio: () => 2.5 });
  assert.equal(material.uniforms.pixel.value, 2.5);

  const lift = run.state.thermals[1];
  const raven = Object.assign(run.state.ravens[0], { x: 110, y: 430, z: 250, fade: 1, threat: false });
  assert.equal(raven.thermal, 1);
  const shine = () => { view.update(1, pos, run); return glow.getX(0); };
  Object.assign(lift, { strength: 1, move: 0 });
  assert.equal(shine(), 1);
  assert.deepEqual([position.getX(0), position.getY(0), position.getZ(0)], [110, 430, 250]);
  lift.strength = 0.4;
  close(shine(), 0.35 + 0.65 * 0.4, 1e-6);
  lift.strength = 0;
  close(shine(), 0.35, 1e-6);
  raven.fade = 0.5;
  close(shine(), 0.175, 1e-6);
  // In flight to new lift there is no strength at all, and the flock is what the pilot follows.
  Object.assign(lift, { strength: 0, live: false, move: 7 });
  assert.equal(shine(), 0.5);
  raven.fade = 1;
  assert.equal(shine(), 1);
  // The other flock's journey is its own: a bird of the second thermal still goes by its lift.
  const other = Object.assign(run.state.ravens[CLOUD_POOL.ravens - 1], { x: 140, y: 430, z: 250, fade: 1 });
  Object.assign(run.state.thermals[other.thermal], { strength: 0.4, move: 0 });
  assert.equal(other.thermal, CLOUD_POOL.thermals - 1);
  shine();
  close(glow.getX(CLOUD_POOL.ravens - 1), 0.35 + 0.65 * 0.4, 1e-6);
  // The flock lands where the lift has yet to start. Its marks stay bright while the lift
  // builds, and only go by its strength again once it is full. Frames in which nothing has
  // changed, as when the map pauses the run, change nothing here either.
  Object.assign(lift, { live: true, move: 0 });
  for (const strength of [0, 0, 0.1, 0.1, 0.5, 0.9, 0.9, 1]) {
    lift.strength = strength;
    assert.equal(shine(), 1, `the marks are bright over new lift at ${strength}`);
  }
  lift.strength = 0.4;
  close(shine(), 0.35 + 0.65 * 0.4, 1e-6);
  // Lift that falters before it is full lets the marks go at once, and does not get them back.
  Object.assign(lift, { strength: 0, live: false, move: 3 });
  assert.equal(shine(), 1);
  Object.assign(lift, { strength: 0.5, live: true, move: 0 });
  assert.equal(shine(), 1);
  lift.strength = 0.45;
  close(shine(), 0.35 + 0.65 * 0.45, 1e-6);
  lift.strength = 0.6;
  close(shine(), 0.35 + 0.65 * 0.6, 1e-6);
  // Nor does the other flock setting off light this one's marks.
  Object.assign(run.state.thermals[other.thermal], { strength: 0, live: false, move: 5 });
  close(shine(), 0.35 + 0.65 * 0.6, 1e-6);
  assert.equal(glow.getX(CLOUD_POOL.ravens - 1), 1);
  // A new run does not take up where the last one's flocks were going.
  Object.assign(lift, { strength: 0, live: false, move: 3 });
  assert.equal(shine(), 1);
  view.reset();
  view.begin();
  Object.assign(lift, { strength: 0.2, live: true, move: 0 });
  close(shine(), 0.35 + 0.65 * 0.2, 1e-6);
  lift.strength = 1;
  raven.fade = 0;
  assert.equal(shine(), 0);

  raven.fade = 1;
  assert.equal(threat.getX(0), 0);
  raven.threat = true;
  view.update(1, pos, run);
  assert.equal(threat.getX(0), 1);
  assert.equal(threat.getX(1), 0);
  assert.match(material.vertexShader, /\(1\.0 \+ 0\.6 \* threat\)/);
  view.dispose();
});

test('a raven about to cross the pilot gets a strike-sized ring under it at chest height, and at most two are drawn', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  view.begin();
  const run = createCloudbaseRun();
  run.reset(80, 2);
  const rings = [named(view, 'threat-0'), named(view, 'threat-1')];
  assert.equal(view.root!.getObjectByName('threat-2'), undefined);
  for (const ring of rings) {
    assert.equal(ring.isLineLoop, true);
    ring.geometry.computeBoundingSphere();
    close(ring.geometry.boundingSphere!.radius, CLOUD_STRIKE.radius, 1e-5);
    // The threat red, lit like the mark on the bird so that the ring is bright enough to glow.
    const { color, opacity } = ring.material;
    assert.equal(color.clone().multiplyScalar(1 / RAVEN.flare).getHex(), RAVEN.threat);
    assert.ok(luma(color) * opacity > GLOW, `the ring is bright enough to glow (${(luma(color) * opacity).toFixed(3)})`);
    assert.equal(ring.material.fog, false);
    assert.equal(ring.renderOrder, named(view, 'glints').renderOrder);
  }

  // A real threat after the calm opening: a settled raven 12 m above the canopy.
  run.state.elapsed = CLOUD_RAVENS.quiet + 1;
  let pos = pilotAt(run.state.thermals[1], 700);
  run.step(STEP, pos);
  view.update(run.state.elapsed, pos, run);
  assert.equal(rings[0].visible || rings[1].visible, false);
  const index = run.state.ravens.findIndex((raven) => raven.fade >= 1);
  run.state.ravenAttack = index; run.state.ravenAt = run.state.elapsed - 1.1;
  run.state.ravenDue = run.state.elapsed + 60;
  const raven = run.state.ravens[index];
  pos = { x: raven.x, y: raven.y - CLOUD_STRIKE.rise - 12, z: raven.z };
  run.step(STEP, pos);
  assert.equal(raven.threat, true);
  assert.equal(run.state.pilot.danger, 1);
  view.update(run.state.elapsed, pos, run);
  assert.equal(rings[0].visible, true);
  assert.deepEqual(rings[0].position.toArray(), [raven.x, pos.y + CLOUD_STRIKE.rise, raven.z]);
  assert.equal(rings[1].visible, false);
  assert.equal(named(view, 'glints').geometry.attributes.threat.getX(index), 1);

  // By plain numbers: the first two threats in the pool get the rings, a third goes without.
  for (const other of run.state.ravens) other.threat = false;
  for (const i of [2, 5, 7]) run.state.ravens[i].threat = true;
  view.update(run.state.elapsed, pos, run);
  assert.deepEqual(rings.map((ring) => ring.visible), [true, true]);
  assert.deepEqual(rings[0].position.toArray(), [run.state.ravens[2].x, pos.y + 3, run.state.ravens[2].z]);
  assert.deepEqual(rings[1].position.toArray(), [run.state.ravens[5].x, pos.y + 3, run.state.ravens[5].z]);
  run.state.ravens[2].threat = false;
  view.update(run.state.elapsed, pos, run);
  assert.deepEqual(rings[0].position.toArray(), [run.state.ravens[5].x, pos.y + 3, run.state.ravens[5].z]);
  assert.deepEqual(rings[1].position.toArray(), [run.state.ravens[7].x, pos.y + 3, run.state.ravens[7].z]);
  for (const other of run.state.ravens) other.threat = false;
  view.update(run.state.elapsed, pos, run);
  assert.deepEqual(rings.map((ring) => ring.visible), [false, false]);
  view.dispose();
});

test('a storm cloud is drawn 1.3 times its hazard, turned with it and mirrored on odd slots, only near the pilot\'s height and above the fog', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  assert.ok(view);
  view.begin();
  const run = clearSky();
  const even = park(run.state.clouds[4], 100, 900, 200, { rx: 40, ry: 20, rz: 30, turn: 0.7 });
  const odd = park(run.state.clouds[5], 180, 950, 260, { rx: 50, ry: 30, rz: 35, turn: 0 });
  const pos = { x: 125, y: 800, z: 238 };
  view.update(1, pos, run);
  const [a, b] = [named(view, 'cloud-4'), named(view, 'cloud-5')];
  assert.equal(a.visible && b.visible, true);
  assert.equal(view.root!.children.filter((part) => /^cloud-/.test(part.name) && part.visible).length, 2);
  assert.deepEqual(a.position.toArray(), [100, 900, 200]);
  assert.equal(a.rotation.y, 0.7);
  assert.deepEqual(a.scale.toArray(), [2 * 40 * SWELL, (2 * 20 * SWELL) / TALL, (2 * 30 * SWELL) / DEEP]);
  assert.deepEqual(b.scale.toArray(), [-2 * 50 * SWELL, (2 * 30 * SWELL) / TALL, (2 * 35 * SWELL) / DEEP]);
  // The stand-in is the hazard's own ellipsoid at 1.3 times the size, centred on it.
  view.root!.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(b, true);
  const size = box.getSize(new THREE.Vector3());
  const middle = box.getCenter(new THREE.Vector3());
  [50, 30, 35].forEach((radius, axis) => close(size.getComponent(axis), 2 * radius * SWELL, 1e-3));
  [180, 950, 260].forEach((centre, axis) => close(middle.getComponent(axis), centre, 1e-3));

  // It grows and dissolves with its fade.
  even.fade = 0.5;
  view.update(1, pos, run);
  assert.deepEqual(a.scale.toArray(), [40 * SWELL, (20 * SWELL) / TALL, (30 * SWELL) / DEEP]);
  even.fade = 0.01;
  view.update(1, pos, run);
  assert.equal(a.visible, false);
  even.fade = 1;

  // Only within 320 m of the pilot's altitude.
  view.update(1, { ...pos, y: even.y - 319 }, run);
  assert.equal(a.visible, true);
  view.update(1, { ...pos, y: even.y - 321 }, run);
  assert.equal(a.visible, false);
  view.update(1, { ...pos, y: even.y + 319 }, run);
  assert.equal(a.visible, true);
  view.update(1, { ...pos, y: even.y + 321 }, run);
  assert.equal(a.visible, false);

  // And only while its top, as drawn, is still above the fog.
  run.state.fogHeight = even.y + even.ry * SWELL - 1;
  view.update(1, pos, run);
  assert.equal(a.visible, true);
  run.state.fogHeight = even.y + even.ry * SWELL + 1;
  view.update(1, pos, run);
  assert.equal(a.visible, false);
  view.dispose();
});

test('a storm cloud between the camera and the pilot, or around the camera, is drawn see-through, and solid again once it is out of the way', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  assert.ok(view);
  view.begin();
  const run = clearSky();
  const cloud = park(run.state.clouds[6], 125, 900, 238, { rx: 40, ry: 20, rz: 30, turn: 0 });
  const far = park(run.state.clouds[9], 125, 900, -400, { rx: 40, ry: 20, rz: 30, turn: 0 });
  const mesh = named(view, 'cloud-6').children[0];
  const solid = mesh.material;
  assert.equal(solid.isMeshStandardMaterial, true);
  assert.deepEqual([solid.alphaHash, solid.opacity], [false, 1]);
  // The pilot's chest is level with the middle of the cloud; the camera looks along +z or +x.
  const y = cloud.y - CLOUD_STRIKE.rise;
  const thinned = (pos: Vector3, eye?: Vector3 | null) => {
    view.update(1, pos, run, eye);
    assert.equal(mesh.material === solid || (mesh.material.alphaHash && mesh.material.opacity === THIN), true);
    return mesh.material !== solid;
  };
  const alongZ = (x: number): [Vector3, Vector3] => [{ x, y, z: cloud.z + 150 }, { x, y: cloud.y, z: cloud.z - 150 }];
  const alongX = (z: number): [Vector3, Vector3] => [{ x: cloud.x + 150, y, z }, { x: cloud.x - 150, y: cloud.y, z }];

  assert.equal(thinned(...alongZ(cloud.x)), true, 'straight through the middle');
  const veil = mesh.material;
  assert.equal(named(view, 'cloud-9').children[0].material, solid, 'a cloud off to one side stays solid');
  assert.equal(thinned(alongZ(cloud.x)[0]), false, 'no camera, no thinning');
  assert.equal(thinned(alongZ(cloud.x)[0], null), false);
  // The test reaches CLEAR times as far as the cloud is drawn, which is SWELL times its hazard.
  const reach = SWELL * CLEAR;
  assert.equal(thinned(...alongZ(cloud.x + 40 * reach - 1)), true);
  assert.equal(thinned(...alongZ(cloud.x + 40 * reach + 1)), false);
  assert.equal(thinned(...alongX(cloud.z + 30 * reach - 1)), true);
  assert.equal(thinned(...alongX(cloud.z + 30 * reach + 1)), false);
  assert.equal(thinned({ x: cloud.x, y: cloud.y + 20 * reach - 1 - 3, z: cloud.z + 150 }, { x: cloud.x, y: cloud.y + 20 * reach - 1, z: cloud.z - 150 }), true);
  assert.equal(thinned({ x: cloud.x, y: cloud.y + 20 * reach + 1 - 3, z: cloud.z + 150 }, { x: cloud.x, y: cloud.y + 20 * reach + 1, z: cloud.z - 150 }), false);
  // A cloud beyond the pilot, or behind the camera, hides nothing.
  assert.equal(thinned({ x: cloud.x, y, z: cloud.z - 60 }, { x: cloud.x, y: cloud.y, z: cloud.z - 150 }), false);
  assert.equal(thinned({ x: cloud.x, y, z: cloud.z + 150 }, { x: cloud.x, y: cloud.y, z: cloud.z + 60 }), false);
  // The camera inside the cloud, and the pilot inside it, both count.
  assert.equal(thinned({ x: cloud.x, y, z: cloud.z + 150 }, { x: cloud.x + 10, y: cloud.y + 5, z: cloud.z + 20 }), true);
  assert.equal(thinned({ x: cloud.x, y, z: cloud.z }, { x: cloud.x, y: cloud.y + 100, z: cloud.z + 150 }), true);
  // A cloud that is still half-grown is tested at the size it is drawn.
  cloud.fade = 0.5;
  assert.equal(thinned(...alongZ(cloud.x + 20 * reach - 1)), true);
  assert.equal(thinned(...alongZ(cloud.x + 20 * reach + 1)), false);
  cloud.fade = 1;

  // Turned a quarter, the long axis lies along z: a line that cleared the short side now hits,
  // exactly where three draws the turned cloud.
  const beside = alongX(cloud.z + 35 * reach);
  assert.equal(thinned(...beside), false);
  cloud.turn = Math.PI / 2;
  assert.equal(thinned(...beside), true);
  view.root!.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(named(view, 'cloud-6'), true).getSize(new THREE.Vector3());
  close(size.z, 2 * 40 * SWELL, 1e-3);
  close(size.x, 2 * 30 * SWELL, 1e-3);
  assert.equal(thinned(...alongZ(cloud.x + 30 * reach + 1)), false);
  assert.equal(thinned(...alongZ(cloud.x + 30 * reach - 1)), true);
  cloud.turn = 0;

  // Any turn, size and stage of growth, mirrored or not: the answer is the one given by the
  // cloud as three itself places it. The stand-in is a ball of radius 0.5 in its own space, so
  // there a line is in the way when it passes within 0.5 * CLEAR of the middle.
  const random = dice(7);
  const between = (from: number, to: number) => from + (to - from) * random();
  const toCloud = new THREE.Matrix4();
  const middle = new THREE.Vector3();
  const nearest = new THREE.Vector3();
  const answers = { thin: 0, solid: 0 };
  for (const slot of [12, 13]) {
    const drawn = named(view, `cloud-${slot}`).children[0];
    for (let n = 0; n < 500; n++) {
      const any = park(run.state.clouds[slot], between(60, 190), 900, between(180, 300), {
        rx: between(30, 55), ry: between(14, 34), rz: between(20, 45), turn: between(0, 2 * Math.PI), fade: between(0.3, 1),
      });
      const pos = { x: any.x + between(-70, 70), y: any.y + between(-40, 40), z: any.z + between(-70, 70) };
      const eye = { x: pos.x + between(-80, 80), y: pos.y + between(-40, 40), z: pos.z + between(-80, 80) };
      view.update(1, pos, run, eye);
      view.root!.updateMatrixWorld(true);
      toCloud.copy(drawn.matrixWorld).invert();
      const line = new THREE.Line3(new THREE.Vector3(eye.x, eye.y, eye.z).applyMatrix4(toCloud), new THREE.Vector3(pos.x, pos.y + CLOUD_STRIKE.rise, pos.z).applyMatrix4(toCloud));
      const gap = line.closestPointToPoint(middle, true, nearest).length() / 0.5;
      // Too close to the edge to call in floating point.
      if (Math.abs(gap - CLEAR) < 1e-6) continue;
      assert.equal(drawn.material !== solid, gap < CLEAR, `cloud ${slot}, turned ${any.turn.toFixed(2)}: a line passing ${gap.toFixed(3)} of the drawn size from its middle`);
      answers[gap < CLEAR ? 'thin' : 'solid'] += 1;
    }
    assert.equal(Math.sign(named(view, `cloud-${slot}`).scale.x), slot % 2 ? -1 : 1);
    run.state.clouds[slot].fade = 0;
  }
  assert.ok(answers.thin > 150 && answers.solid > 150, `both answers are well tried (${answers.thin} thinned, ${answers.solid} solid)`);

  // All the clouds in the sky share the same two materials.
  far.z = cloud.z;
  far.x = cloud.x + 200;
  cloud.turn = 0;
  assert.equal(thinned(...alongZ(cloud.x)), true);
  const worn = new Set(view.root!.children.filter((part: { name: string; }) => /^cloud-/.test(part.name)).map((part) => (part.children[0] as SceneFixture).material));
  assert.deepEqual([...worn].sort((one, other) => one.opacity - other.opacity), [veil, solid]);
  view.dispose();
});

test('the loaded cloud keeps the file\'s own shape and sits with the middle of its bulk on the hazard, mirrored or not', async () => {
  const loader = createTestLoader();
  const view = createCloudbase({ scene: new THREE.Scene(), loadModel: loader.loadModel });
  assert.ok(view);
  await view.begin();
  const run = clearSky();
  const clouds = [
    park(run.state.clouds[4], 100, 900, 200, { rx: 40, ry: 20, rz: 30, turn: 0 }),
    park(run.state.clouds[5], 180, 950, 260, { rx: 50, ry: 30, rz: 35, turn: 0 }),
    park(run.state.clouds[8], 60, 1000, 300, { rx: 45, ry: 22, rz: 28, turn: 2.1, fade: 0.6 }),
  ];
  view.update(1, { x: 125, y: 900, z: 238 }, run);
  view.root!.updateMatrixWorld(true);
  // Where the file itself puts its mesh, whatever that happens to be in this export of it.
  const file = (await readModel('clouds')).scene;
  file.updateMatrixWorld(true);
  const inFile = new THREE.Matrix4().copy(file.matrixWorld).invert().multiply(meshesIn(file)[0].matrixWorld);
  const bulks = [4, 5, 8].map((slot, n) => {
    const cloud = clouds[n];
    const holder = named(view, `cloud-${slot}`);
    const [mesh] = meshesIn(holder);
    // The file's node keeps its own size, turn and place, inside a model moved to centre its bulk.
    const inModel = new THREE.Matrix4().copy(holder.children[0].matrixWorld).invert().multiply(mesh.matrixWorld);
    inModel.elements.forEach((value, i) => close(value, inFile.elements[i], 1e-9));
    assert.deepEqual(holder.children[0].position.toArray(), [-0.074, -0.222, 0]);
    assert.equal(holder.children[0].scale.x, 1);
    const bulk = bulkOf(mesh);
    const length = 2 * cloud.rx * cloud.fade * SWELL;
    assert.ok(bulk.distanceTo(holder.position) < 0.005 * length, `the bulk of cloud ${slot} is ${bulk.distanceTo(holder.position).toFixed(2)} m from its hazard's centre`);
    return bulk;
  });
  assert.equal(bulks.length, 3);
  // Untouched by a turn, the drawn cloud is exactly 1.3 times the hazard in every direction.
  for (const [slot, cloud] of [[4, clouds[0]], [5, clouds[1]]] as const) {
    const box = new THREE.Box3().setFromObject(named(view, `cloud-${slot}`), true);
    const size = box.getSize(new THREE.Vector3());
    [cloud.rx, cloud.ry, cloud.rz].forEach((radius, axis) => close(size.getComponent(axis) / (2 * radius * SWELL), 1, 1e-3));
    // The file's cloud leans to one side of its box; a mirrored slot leans the other way.
    const lean = box.getCenter(new THREE.Vector3()).x - cloud.x;
    close(lean / (2 * cloud.rx * SWELL), slot % 2 ? 0.074 : -0.074, 1e-3);
  }
  view.dispose();
});

test('the file\'s lobed cloud is thinned on nearly every line of sight that it really blocks from the chase camera', async () => {
  const view = createCloudbase({ scene: new THREE.Scene(), loadModel: createTestLoader().loadModel });
  assert.ok(view);
  await view.begin();
  const run = clearSky();
  const random = dice(20261014);
  const between = (from: number, to: number) => from + (to - from) * random();
  const ray = new THREE.Raycaster();
  const eye = new THREE.Vector3();
  const chest = new THREE.Vector3();
  const along = new THREE.Vector3();
  const seen = { lines: 0, blocked: 0, hidden: 0, thinned: 0 };
  // An even slot and an odd one, which is drawn mirrored.
  for (const slot of [0, 1]) {
    const [mesh] = meshesIn(named(view, `cloud-${slot}`));
    const solid = mesh.material;
    for (let n = 0; n < 2500; n++) {
      // Any hazard the storm lays out, anywhere within a wingspan or ten of the pilot.
      const long = between(CLOUD_STORM.long[0], CLOUD_STORM.long[1]);
      const cloud = park(run.state.clouds[slot], 125, 900, 238, {
        rx: 0.5 * long,
        ry: 0.5 * long * CLOUD_STORM.shape.y * between(CLOUD_STORM.tall[0], CLOUD_STORM.tall[1]),
        rz: 0.5 * long * CLOUD_STORM.shape.z * between(CLOUD_STORM.deep[0], CLOUD_STORM.deep[1]),
        turn: between(0, 2 * Math.PI),
      });
      const pos = { x: cloud.x + between(-110, 110), y: cloud.y + between(-55, 55), z: cloud.z + between(-110, 110) };
      // The game's chase camera: 26 m behind the glider and 9.5 m above it in level flight,
      // falling back to 30 m and down to 1.5 m as it looks up in a climb.
      const yaw = between(0, 2 * Math.PI);
      const gaze = random();
      eye.set(pos.x - (26 + 4 * gaze) * Math.sin(yaw), pos.y + 9.5 - 8 * gaze, pos.z + (26 + 4 * gaze) * Math.cos(yaw));
      chest.set(pos.x, pos.y + CLOUD_STRIKE.rise, pos.z);
      view.update(1, pos, run, eye);
      view.root!.updateMatrixWorld(true);
      // Whether the cloud's own surface lies between the camera and the pilot.
      ray.set(eye, along.subVectors(chest, eye).normalize());
      ray.far = eye.distanceTo(chest);
      const blocked = ray.intersectObject(mesh, false).length > 0;
      seen.lines += 1;
      seen.blocked += blocked ? 1 : 0;
      seen.hidden += blocked && mesh.material === solid ? 1 : 0;
      seen.thinned += mesh.material === solid ? 0 : 1;
    }
    run.state.clouds[slot].fade = 0;
  }
  assert.ok(seen.blocked > 100, `the cloud was really in the way ${seen.blocked} times`);
  assert.ok(seen.hidden < 0.03 * seen.blocked, `it was left solid ${seen.hidden} of those times`);
  // Reaching further would thin clouds that are only near: most of the sky stays solid.
  assert.ok(seen.thinned < 0.25 * seen.lines, `${seen.thinned} of ${seen.lines} clouds near the pilot were thinned`);
  view.dispose();
});

test('the marks of a flock stay bright from take-off until its new lift is full, with no drop on landing', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  view.begin();
  const run = createCloudbaseRun();
  run.reset(80, 3);
  const { state } = run;
  const thermal = state.thermals[2];
  const { glow } = named(view, 'glints').geometry.attributes;
  // How bright this flock's marks are apart from each bird's own fade: the same for all of them.
  const shine = () => {
    let found = NaN;
    state.ravens.forEach((raven, i) => {
      if (raven.thermal !== 2 || raven.fade < 0.5) return;
      const mine = glow.getX(i) / raven.fade;
      if (!Number.isNaN(found)) close(mine, found, 1e-5);
      found = mine;
    });
    return found;
  };
  // Park in the thermal until it is used up, and stay put while its flock leaves, lands and the
  // new lift comes up somewhere else.
  const pos = pilotAt(thermal, 400);
  const seen = { flights: 0, landings: 0, dimmest: 1, leading: false };
  let before = NaN;
  for (let i = 0; i < 180 * 60 && (seen.landings < 1 || seen.leading); i++) {
    const moving = thermal.move > 0;
    pos.x = thermal.x; pos.z = thermal.z;
    assert.equal(run.step(STEP, pos), null);
    view.update(state.elapsed, pos, run);
    const now = shine();
    if (thermal.move > 0 && !moving) seen.flights += 1;
    if (thermal.move > 0) seen.leading = true;
    else if (thermal.strength >= 0.99) seen.leading = false;
    if (seen.leading) {
      // Within what the glow's 32-bit buffer holds of a bird partly faded at an end of the ladder.
      assert.ok(Math.abs(now - 1) <= 1e-5, `the marks are ${now} bright at ${state.elapsed.toFixed(2)} s, with ${thermal.move.toFixed(1)} s to fly and lift at ${thermal.strength.toFixed(2)}`);
      if (moving && thermal.move === 0) {
        // The frame the last bird arrives: the lift is there in name and has no strength yet.
        assert.equal(thermal.live, true);
        assert.equal(thermal.strength, 0);
        seen.landings += 1;
      }
    } else {
      seen.dimmest = Math.min(seen.dimmest, now);
      close(now, 0.35 + 0.65 * thermal.strength, 1e-5);
    }
    // Dying lift dims the marks little by little, and a flock taking off lights them at once,
    // which is the signal to follow. What must never happen is a drop from one frame to the next.
    if (!Number.isNaN(before)) assert.ok(now > before - 0.01, `the marks fell from ${before.toFixed(2)} to ${now.toFixed(2)} in one frame at ${state.elapsed.toFixed(2)} s`);
    before = now;
  }
  assert.deepEqual([seen.flights, seen.landings], [1, 1]);
  assert.ok(seen.dimmest < 0.4, 'before it left, the dying lift had dimmed the marks');
  assert.equal(thermal.strength >= 0.99, true);
  view.dispose();
});

test('lightning lets every hunted thermal show from anywhere for a moment, its motes held larger, while lift not there yet still shows nothing', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  view.begin();
  const run = createCloudbaseRun();
  run.reset(80, 3);
  const [, first, second] = run.state.thermals;
  const motes = [0, 1, 2].map((i) => named(view, `motes-${i}`));
  const uniform = (i: number, name: string) => motes[i].material.uniforms[name].value;
  // 90 m from the first hunted thermal and further from the other: both dark.
  const pos = pilotAt(beyond(first, second, 90), 300);
  view.update(1, pos, run);
  assert.equal(motes[1].visible || motes[2].visible, false);
  // Struck: both show as if close by, and their heads are never drawn tiny.
  view.reveal(1);
  view.update(1, pos, run);
  for (const i of [1, 2]) {
    assert.equal(motes[i].visible, true, `thermal ${i}`);
    assert.equal(uniform(i, 'near'), 1);
    assert.equal(uniform(i, 'flare'), 1);
    assert.equal(uniform(i, 'strength'), run.state.thermals[i].strength);
  }
  assert.deepEqual([uniform(0, 'near'), uniform(0, 'flare')], [1, 0], 'the launch column is lit from anywhere already');
  // The least width of a head, in CSS pixels, goes from 1.5 to CLOUD_LIT.flare with the flare.
  assert.equal(CLOUD_LIT.flare, 3);
  assert.match(motes[1].material.vertexShader, /max\(mix\(1\.5, 3\.0, flare\), /);
  // As the glimpse fades, a far thermal shows what is left of it, and a nearer one never less than
  // it shows from where the pilot is.
  view.reveal(0.4);
  view.update(1, pos, run);
  close(uniform(1, 'near'), 0.4);
  view.update(1, pilotAt(beyond(first, second, 65.5), 300), run);
  close(uniform(1, 'near'), 0.5);
  // Lift whose flock is still on the way has nothing to show, glimpse or not.
  second.move = 5;
  view.reveal(1);
  view.update(1, pos, run);
  assert.equal(motes[2].visible, false);
  assert.equal(uniform(2, 'strength'), 0);
  // Over, it is as before; and a new run opens with none of it.
  view.reveal(0);
  view.update(1, pos, run);
  assert.deepEqual([motes[1].visible, uniform(1, 'flare')], [false, 0]);
  view.reveal(1);
  view.begin();
  second.move = 0;
  view.update(1, pos, run);
  assert.equal(motes[1].visible || motes[2].visible, false);
  view.dispose();
});

test('the storm cloud lightning leaves wears a lit copy of its own material for a moment, brighter with the strike, and goes back after; one in the camera\'s way stays see-through', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  view.begin();
  const run = clearSky();
  park(run.state.clouds[3], 125, 900, 238);
  park(run.state.clouds[4], 260, 900, 238);
  const pos = { x: 125, y: 700, z: 400 };
  const mesh = (slot: number) => named(view, `cloud-${slot}`).children[0];
  view.update(1, pos, run);
  const solid = mesh(3).material;
  assert.equal(mesh(4).material, solid);
  view.light(3, 1);
  view.update(1, pos, run);
  const lit = mesh(3).material;
  assert.notEqual(lit, solid);
  assert.equal(mesh(4).material, solid, 'only the struck cloud');
  assert.equal(lit.isMeshStandardMaterial, true);
  assert.equal(lit.alphaHash, false, 'the same kind of material, so no new shader');
  assert.equal(lit.emissive.getHex(), CLOUD_LIT.tint);
  close(lit.emissiveIntensity, CLOUD_GLOW + CLOUD_LIT.glow);
  assert.equal(solid.emissiveIntensity, CLOUD_GLOW, 'the solid one is never touched');
  view.light(3, 0.25);
  view.update(1, pos, run);
  close(lit.emissiveIntensity, CLOUD_GLOW + 0.25 * CLOUD_LIT.glow);
  view.light(3, 0);
  view.update(1, pos, run);
  assert.equal(mesh(3).material, solid);
  // In the camera's way it is thinned, struck or not: the glider is seen first.
  view.light(3, 1);
  view.update(1, { x: 125, y: 900 - CLOUD_STRIKE.rise, z: 238 + 150 }, run, { x: 125, y: 900, z: 238 - 150 });
  assert.equal(mesh(3).material.alphaHash, true);
  view.update(1, pos, run);
  assert.equal(mesh(3).material, lit, 'and lit again once out of the way');
  // A new run opens with nothing lit, and the lit copy's light back down.
  view.begin();
  view.update(1, pos, run);
  assert.equal(mesh(3).material, solid);
  assert.equal(lit.emissiveIntensity, CLOUD_GLOW);
  view.dispose();
});

test('with the file\'s cloud loaded, the lit copy glows with the file\'s own picture, the file\'s material is never changed, and dispose releases the copy but nothing of the loader\'s', async () => {
  const loader = createTestLoader({ maps: true });
  const view = createCloudbase({ scene: new THREE.Scene(), loadModel: loader.loadModel });
  await view.begin();
  const run = clearSky();
  park(run.state.clouds[2], 125, 900, 238);
  const pos = { x: 125, y: 700, z: 400 };
  view.update(1, pos, run);
  const [mesh] = meshesIn(named(view, 'cloud-2'));
  const file = mesh.material;
  const owned = await loader.owned();
  assert.ok(owned.materials.has(file));
  view.light(2, 1);
  view.update(1, pos, run);
  const lit = mesh.material;
  assert.ok(!owned.materials.has(lit), 'a copy of the view\'s own');
  assert.deepEqual([lit.map, lit.emissiveMap], [file.map, file.map]);
  assert.equal(lit.emissive.getHex(), CLOUD_LIT.tint);
  close(lit.emissiveIntensity, CLOUD_GLOW + CLOUD_LIT.glow);
  assert.deepEqual([file.emissive.getHex(), file.emissiveIntensity], [0xffffff, CLOUD_GLOW]);
  let released = 0;
  lit.addEventListener('dispose', () => (released += 1));
  const theirs = watch([...owned.materials, ...owned.textures]);
  view.dispose();
  assert.equal(released, 1);
  neverReleased(theirs, 'material or picture');
});

test('the view says which storm clouds it drew whole last time, the ones lightning may strike from', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  assert.equal(view.shown(0), false, 'before a run, none');
  view.begin();
  const run = clearSky();
  const cloud = park(run.state.clouds[6], 125, 900, 238);
  park(run.state.clouds[7], 125, 2000, 238);
  const pos = { x: 125, y: cloud.y - CLOUD_STRIKE.rise, z: cloud.z + 150 };
  view.update(1, pos, run, { x: 300, y: 900, z: 600 });
  assert.equal(view.shown(6), true);
  assert.equal(view.shown(7), false, 'too far above the pilot to be drawn');
  assert.equal(view.shown(8), false, 'not there at all');
  view.update(1, pos, run, { x: cloud.x, y: cloud.y, z: cloud.z - 150 });
  assert.equal(view.shown(6), false, 'thinned for being in the camera\'s way');
  assert.equal(view.shown(CLOUD_POOL.clouds), false);
  view.reset();
  view.begin();
  assert.equal(view.shown(6), false, 'a new run shows none until it is drawn');
  view.dispose();
});

test('the fog\'s surface is the disc FOG_SURFACE says, which the glide ring is drawn over', () => {
  const view = createCloudbase({ scene: new THREE.Scene() });
  view.begin();
  const fog = meshesIn(view.root!).find((mesh) => mesh.geometry.type === 'CircleGeometry')!;
  assert.equal((fog.geometry as THREE.CircleGeometry).parameters.radius, FOG_SURFACE.radius);
  assert.deepEqual([fog.position.x, fog.position.z], [CLOUD_ZONE.x, CLOUD_ZONE.z]);
  assert.match(fog.material.fragmentShader, new RegExp(`smoothstep\\(${FOG_SURFACE.edge.toFixed(2)}, 1\\.0, length\\(p\\)\\)`));
  view.dispose();
});
