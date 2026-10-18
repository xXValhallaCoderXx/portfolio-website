// Shrinks the raw generator exports in models-raw/ into web-ready files in public/models/.
// Run `npm run models` after adding or replacing a file in models-raw/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, '../models-raw');
const target = path.join(here, '../public/models');

// Generator names are authoring details; the game uses stable, readable asset names.
const ALIASES = {
  'windsock+post+3d+model.glb': 'windsock.glb',
  'stone+arch+3d+model.glb': 'gateway.glb',
  'raven+3d+model.glb': 'raven.glb',
  'clouds+3d+model.glb': 'clouds.glb',
};
const selected = process.argv.slice(2).map((name) => `${name.replace(/\.glb$/, '')}.glb`);
const inputs = fs.readdirSync(source).filter((name) => name.endsWith('.glb'));
for (const name of selected) {
  if (!inputs.some((input) => input === name || ALIASES[input] === name)) {
    throw new Error(`No raw model found for ${name}`);
  }
}

// How far a simplified surface may drift from the original, as a fraction of the model's size.
// Larger values cut more triangles but start tearing the texture seams.
const DRIFT = 0.002;
// Exports that already arrive low-poly are compressed but otherwise left alone.
const HEAVY = 30000;

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const triangles = (doc) =>
  doc
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce((sum, primitive) => sum + (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount()) / 3, 0);
const kb = (file) => `${Math.round(fs.statSync(file).size / 1024)} KB`;

fs.mkdirSync(target, { recursive: true });
for (const name of inputs) {
  const runtimeName = ALIASES[name] ?? name;
  if (selected.length && !selected.includes(name) && !selected.includes(runtimeName)) continue;
  const doc = await io.read(path.join(source, name));
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  const before = triangles(doc);

  // New islands are authored in metres with their complete undersides below the shelf.
  // Normalize only these exports: longest side one unit, bottom at Y=0, centred in X/Z.
  if (/^island-(alpine|ruins|split)\.glb$/.test(runtimeName)) {
    const positions = doc.getRoot().listAccessors().filter((a) =>
      doc.getRoot().listMeshes().some((m) => m.listPrimitives().some((p) => p.getAttribute('POSITION') === a)));
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const accessor of positions) {
      const data = accessor.getArray();
      for (let i = 0; i < data.length; i++) { const axis = i % 3; min[axis] = Math.min(min[axis], data[i]); max[axis] = Math.max(max[axis], data[i]); }
    }
    const size = Math.max(...max.map((value, axis) => value - min[axis]));
    const origin = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
    for (const accessor of positions) {
      const data = accessor.getArray();
      for (let i = 0; i < data.length; i++) data[i] = (data[i] - origin[i % 3]) / size;
      accessor.setArray(data);
    }
  }

  // The scene lights every model itself, so only the colour texture is worth shipping.
  for (const material of doc.getRoot().listMaterials()) {
    material.setNormalTexture(null).setMetallicRoughnessTexture(null).setMetallicFactor(0).setRoughnessFactor(1);
  }
  await doc.transform(
    dedup(),
    weld(),
    ...(before > HEAVY ? [simplify({ simplifier: MeshoptSimplifier, ratio: 0, error: DRIFT })] : []),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(path.join(target, runtimeName), doc);
  console.log(
    `${name} -> ${runtimeName}: ${before} -> ${triangles(doc)} triangles, ${kb(path.join(source, name))} -> ${kb(path.join(target, runtimeName))}`,
  );
}
