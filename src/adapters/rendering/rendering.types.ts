import type * as THREE from 'three';
export type ModelLoader = (name: string, size: number, selfLight?: number) => Promise<THREE.Object3D>;
export type LitMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
export interface CanvasSurface { width: number; height: number; getContext: (kind: '2d') => CanvasRenderingContext2D | null }
export interface GliderAir {
  time: number; rough: number; trailLeft: number; trailRight: number; trail: number; luff: number;
  collapse: number; foldLeft: number; foldRight: number; tuck: number; ears: number;
}
export interface GliderPose {
  dt: number; time: number; bank: number; pace: number; turn: number; lift: number; liftSide: number; landed: boolean;
  flying?: boolean; brake?: number; bar?: number; luff?: number; stall?: number; foldLeft?: number; foldRight?: number;
  rough?: number; ears?: number; tuck?: number; heave?: number; swing?: number; physical?: boolean;
  coordinatedLean?: number; coordination?: number; controlMode?: 'legacy' | 'brakes'; leftBrake?: number; rightBrake?: number;
}
export interface GliderMeasure { handLeft: number; handRight: number; edgeLeft: number; edgeRight: number; tipLeft: number; dropLeft: number; tipRight: number; dropRight: number }
export interface SkyContext {
  mode?: string; altitude?: number; camera?: { position: THREE.Vector3Like }; dt?: number; reducedMotion?: boolean; lowDetail?: boolean;
  seed?: number; fog?: number | { height: number };
}
