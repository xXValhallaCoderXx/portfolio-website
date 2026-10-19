import type * as THREE from 'three';
import type { LitMesh } from './rendering.types.ts';

/** GLB models use the loader's standard PBR materials. */
export const isMesh = (part: THREE.Object3D): part is LitMesh => 'isMesh' in part && part.isMesh === true;
export const isSkinnedMesh = (part: THREE.Object3D): part is THREE.SkinnedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> => 'isSkinnedMesh' in part && part.isSkinnedMesh === true;
export function firstMesh(model: THREE.Object3D): LitMesh | null {
  let mesh: LitMesh | null = null;
  model.traverse((part) => { if (isMesh(part)) mesh ??= part; });
  return mesh;
}
export function firstSkinnedMesh(model: THREE.Object3D): THREE.SkinnedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null {
  let mesh: THREE.SkinnedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null;
  model.traverse((part) => { if (isSkinnedMesh(part)) mesh ??= part; });
  return mesh;
}
