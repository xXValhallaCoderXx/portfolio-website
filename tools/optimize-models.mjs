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
    .reduce((sum, primitive) => sum + primitive.getIndices().getCount() / 3, 0);
const kb = (file) => `${Math.round(fs.statSync(file).size / 1024)} KB`;

fs.mkdirSync(target, { recursive: true });
for (const name of fs.readdirSync(source).filter((file) => file.endsWith('.glb'))) {
  const doc = await io.read(path.join(source, name));
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  const before = triangles(doc);

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
  await io.write(path.join(target, name), doc);
  console.log(
    `${name}: ${before} -> ${triangles(doc)} triangles, ${kb(path.join(source, name))} -> ${kb(path.join(target, name))}`,
  );
}
