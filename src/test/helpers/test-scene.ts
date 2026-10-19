import * as THREE from 'three';
import assert from 'node:assert/strict';

/** Named nodes in the authored renderer fixtures expose geometry/materials to assertions. */
export interface SceneFixture extends THREE.Object3D {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial & THREE.ShaderMaterial;
  children: SceneFixture[];
  isMesh?: boolean;
  isGroup?: boolean;
  isPoints?: boolean;
  isLine?: boolean;
  isLineLoop?: boolean;
  isSkinnedMesh?: boolean;
  skeleton: THREE.Skeleton;
  boundingSphere: THREE.Sphere | null;
}
export function namedFixture(root: THREE.Object3D | null, name: string): SceneFixture {
  assert.ok(root);
  const node = root.getObjectByName(name);
  assert.ok(node, name);
  return node as SceneFixture;
}
export function renderFixture(node: THREE.Object3D): node is SceneFixture {
  return ('isMesh' in node && node.isMesh === true) || ('isLine' in node && node.isLine === true) || ('isPoints' in node && node.isPoints === true);
}
