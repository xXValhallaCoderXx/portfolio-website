// Test helper: reads the real models in public/models/ in plain Node, where there is no browser
// to decode their pictures. Not part of the game, and deliberately not named *.test.js.
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneModel } from 'three/addons/utils/SkeletonUtils.js';

const MODELS = new URL('../../../public/models/', import.meta.url);
const JSON_CHUNK = 0x4e4f534a;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

// A .glb is a 12-byte header and then chunks, the first of them the JSON that describes the
// file. Rewriting only that chunk (in memory) with every picture taken out leaves the geometry,
// skeleton and materials exactly as the game gets them.
function withoutPictures(file: Buffer) {
  const data = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (data.getUint32(0, true) !== 0x46546c67 || data.getUint32(16, true) !== JSON_CHUNK) throw new Error('Not a binary glTF file.');
  const length = data.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(file.subarray(20, 20 + length)));
  delete json.images;
  delete json.textures;
  delete json.samplers;
  // Any `index` left under a material now points at a texture that is gone.
  const forget = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, {index?:unknown} | null>;
    for (const key of Object.keys(object)) {
      if (object[key] && typeof object[key] === 'object' && Number.isInteger(object[key].index)) delete object[key];
      else forget(object[key]);
    }
  };
  (json.materials ?? []).forEach(forget);

  let text = new TextEncoder().encode(JSON.stringify(json));
  // Chunks are padded to four bytes; JSON pads with spaces.
  const padded = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20);
  padded.set(text);
  text = padded;
  const rest = file.subarray(20 + length);
  const out = new Uint8Array(20 + text.length + rest.length);
  out.set(file.subarray(0, 20));
  out.set(text, 20);
  out.set(rest, 20 + text.length);
  const header = new DataView(out.buffer);
  header.setUint32(8, out.length, true);
  header.setUint32(12, text.length, true);
  return out.buffer;
}

// Parses public/models/<name>.glb and returns what three's loader makes of it: { scene, ... }.
export async function readModel(name: string) {
  const file = await readFile(new URL(`${name}.glb`, MODELS));
  return loader.parseAsync(withoutPictures(file), '');
}

// Stands in for scenery.js's loadModel, which needs a browser: each file is read once and every
// call hands back a skeleton-safe clone, scaled so that its longest side is `size` metres, that
// shares the cached geometry and material. With `maps`, each cached material is given a tiny
// texture in place of the picture that was stripped, so that tests can see who releases it.
//
// The loader keeps a log: `calls` is every [name, size, selfLight] asked for, and `owned()` lists
// the cached geometries, materials and textures, which belong to the loader and to nobody else.
export function createTestLoader({ maps = false } = {}) {
  const files = new Map<string, Promise<GLTF>>();
  const calls: Array<[string, number, number]> = [];

  function loadModel(name: string, size: number, selfLight = 0.07) {
    calls.push([name, size, selfLight]);
    if (!files.has(name)) {
      files.set(name, readModel(name).then((file) => {
        if (maps) {
          file.scene.traverse((object) => {
            const part = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
            if (!part.isMesh || part.material.map) return;
            part.material.map = new THREE.DataTexture(new Uint8Array([200, 190, 230, 255]), 1, 1);
            part.material.map.colorSpace = THREE.SRGBColorSpace;
          });
        }
        return file;
      }));
    }
    return files.get(name)!.then((file) => {
      const model = cloneModel(file.scene);
      model.scale.setScalar(size);
      model.traverse((object) => {
            const part = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
        if (!part.isMesh || part.material.userData.lit) return;
        part.material.userData.lit = true;
        part.material.emissive.set(0xffffff);
        part.material.emissiveMap = part.material.map;
        part.material.emissiveIntensity = selfLight;
      });
      return model;
    });
  }

  async function owned() {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.MeshStandardMaterial>();
    const textures = new Set<THREE.Texture>();
    for (const pending of files.values()) {
      (await pending).scene.traverse((object) => {
            const part = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
        if (!part.isMesh) return;
        geometries.add(part.geometry);
        materials.add(part.material);
        if (part.material.map) textures.add(part.material.map);
      });
    }
    return { geometries, materials, textures };
  }

  return { loadModel, calls, owned };
}

// One shared loader, for tests that only want a model and have no need of the log.
export const { loadModel } = createTestLoader();
