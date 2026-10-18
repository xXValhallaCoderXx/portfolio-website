import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGlider } from './scenery.js';
import { LIVERIES } from './livery.js';
import { HELMET } from './helmet.js';
import { createTestLoader } from './test-models.js';
import { createSketchpad } from './test-canvas.js';
import { DataTexture } from 'three';
import { HARNESSES } from './harness.js';

// The kit the glider wears (wing-kit.js: a livery and the helmet), on the real glider from
// public/models/. The parts are the real livery and helmet modules, fetched through a log of what
// was asked for, with a sketchpad to paint on where a browser would give a canvas.
const STEP = 1 / 60;
const CALM = { bank: 0, pace: 0, turn: 0, lift: 0, liftSide: 0, landed: false };

function dressable({ load = null, livery = () => import('./livery.js'), helmet = () => import('./helmet.js'), harness = () => import('./harness.js') } = {}) {
  const loader = createTestLoader();
  const asked = { livery: 0, harness: 0, helmet: 0, canvases: [] };
  const parts = {
    livery: () => {
      asked.livery += 1;
      return livery();
    },
    helmet: () => {
      asked.helmet += 1;
      return helmet();
    },
    harness: () => {
      asked.harness += 1;
      return harness();
    },
    canvas: () => {
      const pad = createSketchpad();
      asked.canvases.push(pad);
      return pad;
    },
    base: '/site/',
  };
  const glider = buildGlider({ loadModel: load ?? loader.loadModel, parts });
  return { glider, loader, asked };
}

const wingOf = (glider) => {
  let wing = null;
  glider.group.traverse((part) => {
    if (part.isMesh && !part.isSkinnedMesh) wing ??= part;
  });
  return wing;
};

test('a glider dressed in nothing keeps the very material its wing came with, and fetches no livery, helmet or picture', async () => {
  const { glider, loader, asked } = dressable();
  await glider.setKit({ wing: 'standard', helmet: false });
  const wing = wingOf(glider);
  const owned = await loader.owned();
  assert.ok(owned.materials.has(wing.material), 'the file\'s own material');
  assert.equal(wing.geometry.attributes.uv1, undefined, 'no second set of coordinates');
  assert.deepEqual(asked, { livery: 0, harness: 0, helmet: 0, canvases: [] });
  assert.deepEqual(loader.calls.map(([name]) => name), ['wing', 'pilot-skeleton']);
  assert.equal(glider.helmet, null);
  assert.deepEqual(glider.kit, { wing: 'standard', harness: 'standard', helmet: false });
});

test('a livery is a copy of the wing\'s own material, its picture both colour and glow through the wing\'s second coordinates, and the standard wing comes back as the very material it was', async () => {
  const { glider, loader, asked } = dressable();
  await glider.ready;
  const wing = wingOf(glider);
  const own = wing.material;
  const before = { map: own.map, emissiveMap: own.emissiveMap, glow: own.emissiveIntensity, version: own.version };
  await glider.setKit({ wing: 'raven' });
  const dressed = wing.material;
  assert.notEqual(dressed, own);
  assert.equal(dressed.map, dressed.emissiveMap, 'the picture is the glow');
  assert.equal(dressed.map.name, 'livery-raven');
  assert.equal(dressed.map.channel, 1);
  assert.equal(dressed.emissiveIntensity, LIVERIES.raven.glow);
  const { uv1, position } = wing.geometry.attributes;
  assert.equal(uv1.count, position.count);
  assert.equal(asked.canvases.length, 1);
  assert.ok(asked.canvases[0].calls.some(([name]) => name === 'fillRect'), 'painted');
  // The file's own material is untouched.
  assert.deepEqual({ map: own.map, emissiveMap: own.emissiveMap, glow: own.emissiveIntensity, version: own.version }, before);
  // Another livery is worn in the same copy, and the livery worn already is not painted again.
  await glider.setKit({ wing: 'hird' });
  assert.equal(wing.material, dressed);
  assert.equal(dressed.map.name, 'livery-hird');
  assert.equal(dressed.emissiveIntensity, LIVERIES.hird.glow);
  await glider.setKit({ wing: 'hird' });
  assert.equal(asked.canvases.length, 2);
  await glider.setKit({ wing: 'raven' });
  assert.equal(dressed.map.name, 'livery-raven');
  assert.equal(wing.geometry.attributes.uv1, uv1, 'worked out once');
  await glider.setKit({ wing: 'standard' });
  assert.equal(wing.material, own);
  // A wing that is no livery at all is the standard wing too.
  await glider.setKit({ wing: 'golden' });
  assert.equal(wing.material, own);
  assert.deepEqual(loader.calls.map(([name]) => name), ['wing', 'pilot-skeleton'], 'a livery loads no model');
});

test('only the livery worn is held: one taken off is disposed of, given back by the graphics card, and painted again if it is worn again', async () => {
  const { glider, asked } = dressable();
  await glider.ready;
  const wing = wingOf(glider);
  const own = wing.material;
  const disposed = new Map();
  const watch = (texture) => {
    disposed.set(texture, 0);
    texture.addEventListener('dispose', () => disposed.set(texture, disposed.get(texture) + 1));
    return texture;
  };
  await glider.setKit({ wing: 'raven' });
  const dressed = wing.material;
  const raven = watch(dressed.map);
  await glider.setKit({ wing: 'flyte' });
  const flyte = watch(dressed.map);
  assert.equal(disposed.get(raven), 1, 'the raven wing taken off is let go');
  assert.equal(disposed.get(flyte), 0, 'the one worn is kept');
  // The standard wing holds none at all, and its copy keeps no picture in it.
  await glider.setKit({ wing: 'standard' });
  assert.equal(wing.material, own);
  assert.equal(disposed.get(flyte), 1);
  assert.equal(dressed.map, null);
  assert.equal(dressed.emissiveMap, null);
  // Worn again, a livery is painted afresh into the same copy.
  await glider.setKit({ wing: 'raven' });
  assert.equal(wing.material, dressed);
  assert.notEqual(dressed.map, raven);
  assert.equal(dressed.map.name, 'livery-raven');
  assert.equal(dressed.map, dressed.emissiveMap);
  assert.equal(asked.canvases.length, 3);
  assert.equal(disposed.get(raven), 1, 'and nothing is let go twice');
  // A wing that is no livery takes the livery off too.
  const again = watch(dressed.map);
  await glider.setKit({ wing: 'golden' });
  assert.equal(wing.material, own);
  assert.equal(disposed.get(again), 1);
});

test('a choice made while a livery is on its way wins over it when it arrives', async () => {
  let open;
  const gate = new Promise((resolve) => (open = resolve));
  const { glider } = dressable({ livery: () => gate.then(() => import('./livery.js')) });
  await glider.ready;
  const wing = wingOf(glider);
  const own = wing.material;
  const raven = glider.setKit({ wing: 'raven' });
  const standard = glider.setKit({ wing: 'standard' });
  open();
  await Promise.all([raven, standard]);
  assert.equal(wing.material, own);
  // And the other way about: the livery asked for last is the one worn.
  await Promise.all([glider.setKit({ wing: 'flyte' }), glider.setKit({ wing: 'valkyrie' })]);
  assert.equal(wing.material.map.name, 'livery-valkyrie');
});

test('the helmet is made once, held by the head bone, and after that only shown or hidden; the loader is asked for helmet.glb, which is not there yet', async () => {
  const { glider, loader, asked } = dressable();
  await glider.setKit({ wing: 'standard', helmet: true });
  const helmet = glider.helmet;
  assert.ok(helmet?.getObjectByName('guard'), 'this file\'s own helmet, as there is no helmet.glb');
  assert.equal(helmet.parent.name, 'Head');
  assert.equal(helmet.visible, true);
  assert.deepEqual(loader.calls.at(-1), ['helmet', 1, HELMET.glow]);
  await glider.setKit({ wing: 'standard', helmet: false });
  assert.equal(glider.helmet, helmet);
  assert.equal(helmet.visible, false);
  await glider.setKit({ wing: 'standard', helmet: true });
  assert.equal(helmet.visible, true);
  assert.equal(asked.helmet, 1, 'fetched once');
  assert.equal(loader.calls.filter(([name]) => name === 'helmet').length, 1);
  // Put on and taken off again before anything was fetched, nothing is.
  const quick = dressable();
  await Promise.all([quick.glider.setKit({ helmet: true }), quick.glider.setKit({ helmet: false })]);
  assert.equal(quick.asked.helmet, 0);
  assert.equal(quick.glider.helmet, null);
  // Taken off while it is on its way, it arrives hidden.
  let open;
  const gate = new Promise((resolve) => (open = resolve));
  const late = dressable({ helmet: () => gate.then(() => import('./helmet.js')) });
  await late.glider.ready;
  const on = late.glider.setKit({ helmet: true });
  while (!late.asked.helmet) await new Promise((resolve) => setTimeout(resolve, 0));
  const off = late.glider.setKit({ helmet: false });
  open();
  await Promise.all([on, off]);
  assert.equal(late.glider.helmet?.visible, false);
});

test('a livery that will not load while the helmet is on its way leaves that helmet coming: it is never fetched or fitted twice', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let open;
  const gate = new Promise((resolve) => (open = resolve));
  const { glider, asked } = dressable({
    livery: () => Promise.reject(new Error('offline')),
    helmet: () => gate.then(() => import('./helmet.js')),
  });
  await glider.ready;
  // The livery's failure settles this while the helmet is still coming.
  await glider.setKit({ wing: 'raven', helmet: true });
  assert.equal(glider.helmet, null);
  const again = glider.setKit({ wing: 'standard', helmet: true });
  open();
  await again;
  assert.equal(asked.helmet, 1, 'fetched once');
  const fitted = [];
  glider.group.traverse((part) => {
    if (part.name === 'helmet') fitted.push(part);
  });
  assert.equal(fitted.length, 1, 'one helmet on the head');
  assert.equal(fitted[0], glider.helmet);
  // So taking it off takes it off.
  await glider.setKit({ helmet: false });
  assert.equal(glider.helmet.visible, false);
});

test('putting the helmet on leaves the pilot posed exactly as a twin without it', async () => {
  const plain = dressable().glider;
  const helmeted = dressable().glider;
  await Promise.all([plain.ready, helmeted.ready]);
  let time = 0;
  const fly = (frames, args) => {
    for (let n = 0; n < frames; n++) {
      time += STEP;
      for (const glider of [plain, helmeted]) glider.pose({ ...CALM, dt: STEP, time, flying: true, ...args });
    }
  };
  fly(40, { turn: 0.8, brake: 0.5 });
  // Put on mid-turn: the joints are fitted at rest and turned back on the very next pose.
  await helmeted.setKit({ helmet: true });
  fly(1, { turn: 0.8, brake: 0.5 });
  for (const name of ['L_Upperarm', 'R_Upperarm', 'Spine01', 'Spine02', 'Head']) {
    const [a, b] = [plain, helmeted].map((glider) => glider.group.getObjectByName(name).quaternion);
    assert.ok(a.equals(b), `${name} is posed alike`);
  }
  assert.deepEqual(helmeted.measure({}), plain.measure({}));
});

test('a glider whose models never came wears nothing, asks for no part, and still settles', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const { glider, asked } = dressable({ load: () => Promise.reject(new Error('404')) });
  await glider.setKit({ wing: 'raven', helmet: true });
  assert.deepEqual(asked, { livery: 0, harness: 0, helmet: 0, canvases: [] });
  assert.equal(glider.helmet, null);
  assert.deepEqual(glider.kit, { wing: 'raven', harness: 'standard', helmet: true }, 'the choice itself is kept');
});

test('a part that will not load leaves the glider as it was and says so, and the next wear tries again', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  let fail = true;
  const { glider } = dressable({
    helmet: () => (fail ? Promise.reject(new Error('offline')) : import('./helmet.js')),
    livery: () => (fail ? Promise.reject(new Error('offline')) : import('./livery.js')),
  });
  await glider.ready;
  const own = wingOf(glider).material;
  await glider.setKit({ wing: 'sheetless', helmet: true });
  assert.equal(wingOf(glider).material, own);
  assert.equal(glider.helmet, null);
  assert.ok(warn.mock.callCount() >= 1);
  fail = false;
  await glider.setKit({ wing: 'sheetless', helmet: true });
  assert.equal(wingOf(glider).material.map.name, 'livery-sheetless');
  assert.ok(glider.helmet?.visible);
});

const bodyOf = (glider) => {
  let body = null;
  glider.group.traverse((part) => { if (part.isSkinnedMesh) body ??= part; });
  return body;
};
const cocoonTexture = (id) => {
  const texture = new DataTexture(new Uint8Array([120, 140, 150, 255]), 1, 1);
  texture.name = `harness-${id}`;
  return texture;
};
const harnessParts = (make = async (id) => cocoonTexture(id)) => async () => ({ HARNESSES, harnessTexture: make });

test('independent cocoon dressing owns its map and material, preserves other gliders and bones, and restores the exact original', async () => {
  const loader = createTestLoader({ maps: true });
  const { glider } = dressable({ load: loader.loadModel, harness: harnessParts() });
  const twin = dressable({ load: loader.loadModel }).glider;
  await Promise.all([glider.ready, twin.ready]);
  const body = bodyOf(glider), other = bodyOf(twin);
  const material = body.material, geometry = body.geometry, map = material.map;
  assert.equal(other.material, material, 'the loader shares its original');
  const rest = body.skeleton.bones.map((bone) => bone.quaternion.toArray());
  await glider.setKit({ wing: 'raven', harness: 'flyte' });
  assert.equal(wingOf(glider).material.map.name, 'livery-raven');
  assert.equal(body.material.map.name, 'harness-flyte');
  assert.equal(body.material.map, body.material.emissiveMap);
  assert.equal(body.material.emissiveIntensity, material.emissiveIntensity);
  assert.notEqual(body.material, material);
  assert.equal(other.material, material);
  assert.equal(material.map, map);
  assert.equal(body.geometry, geometry);
  assert.deepEqual(body.skeleton.bones.map((bone) => bone.quaternion.toArray()), rest);
  const dressed = body.material, first = dressed.map;
  let disposed = 0;
  first.addEventListener('dispose', () => disposed++);
  await glider.setKit({ wing: 'raven', harness: 'hird' });
  assert.equal(disposed, 1);
  assert.equal(body.material, dressed, 'one owned material is reused');
  const second = dressed.map;
  let secondDisposed = 0;
  second.addEventListener('dispose', () => secondDisposed++);
  await glider.setKit({ wing: 'raven', harness: 'standard' });
  assert.equal(body.material, material);
  assert.equal(wingOf(glider).material.map.name, 'livery-raven');
  assert.equal(secondDisposed, 1);
  assert.equal(dressed.map, null);
  assert.equal(dressed.emissiveMap, null);
  assert.equal(disposed, 1);
  await glider.setKit({ harness: 'golden' });
  assert.equal(body.material, material);
});

test('an in-flight harness request is shared, and a superseded texture is disposed without replacing the latest choice', async () => {
  const waiting = new Map();
  const { glider } = dressable({ harness: harnessParts((id) => new Promise((resolve) => waiting.set(id, resolve))) });
  await glider.ready;
  const original = bodyOf(glider).material;
  const first = glider.setKit({ harness: 'raven' });
  const duplicate = glider.setKit({ harness: 'raven' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(waiting.size, 1);
  const last = glider.setKit({ harness: 'flyte' });
  await new Promise((resolve) => setImmediate(resolve));
  const late = cocoonTexture('raven');
  let released = 0;
  late.addEventListener('dispose', () => released++);
  waiting.get('flyte')(cocoonTexture('flyte'));
  await last;
  waiting.get('raven')(late);
  await Promise.all([first, duplicate]);
  assert.equal(bodyOf(glider).material.map.name, 'harness-flyte');
  assert.equal(released, 1);
  const pending = glider.setKit({ harness: 'hird' });
  await new Promise((resolve) => setImmediate(resolve));
  await glider.setKit({ harness: 'standard' });
  waiting.get('hird')(cocoonTexture('hird'));
  await pending;
  assert.equal(bodyOf(glider).material, original);
});

test('a harness failure preserves the current pilot material and the next choice retries', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let fail = true;
  const { glider } = dressable({ harness: harnessParts(async (id) => {
    if (fail) throw new Error('offline');
    return cocoonTexture(id);
  }) });
  await glider.ready;
  const original = bodyOf(glider).material;
  await glider.setKit({ harness: 'raven' });
  assert.equal(bodyOf(glider).material, original);
  fail = false;
  await glider.setKit({ harness: 'raven' });
  assert.equal(bodyOf(glider).material.map.name, 'harness-raven');
});
