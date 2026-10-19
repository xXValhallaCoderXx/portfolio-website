import type * as THREE from 'three';
export interface ScenePort { add(...objects: THREE.Object3D[]): unknown }
export type ModelLoader = (name: string, size: number, selfLight?: number) => Promise<THREE.Object3D>;
export interface OwnedResources {
  ownGeometry<T extends THREE.BufferGeometry>(geometry: T): T;
  ownMaterial<T extends THREE.Material>(material: T): T;
}
export interface PresentationOptions { scene: ScenePort; loadModel?: ModelLoader | null; calm?: boolean }
