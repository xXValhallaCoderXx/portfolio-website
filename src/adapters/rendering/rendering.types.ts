import type * as THREE from 'three';
export type ModelLoader = (name: string, size: number, selfLight?: number) => Promise<THREE.Object3D>;
export type LitMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
export interface CanvasSurface { width: number; height: number; getContext: (kind: '2d') => CanvasRenderingContext2D | null }
export interface GliderAir {
  time: number; rough: number; trailLeft: number; trailRight: number; trail: number; luff: number;
  collapse: number; foldLeft: number; foldRight: number; tuck: number; ears: number;
  // Each tip caught in its lines (a cravat), 0 to 1.
  cravatLeft: number; cravatRight: number;
  // The side of the wing over a core lifting as it is met in flight: + its right, - its left.
  heave: number;
}
export interface GliderPose {
  dt: number; time: number; bank: number; pace: number; turn: number; lift: number; liftSide: number; landed: boolean;
  flying?: boolean; brake?: number; bar?: number; luff?: number; stall?: number; foldLeft?: number; foldRight?: number;
  rough?: number; ears?: number; tuck?: number; heave?: number; swing?: number; physical?: boolean;
  // Each tip caught in its lines (a cravat), 0 to 1, and the pilot turned under the lines against the
  // wing (a line twist, radians, positive to the left).
  cravatLeft?: number; cravatRight?: number; twist?: number;
  // For whoever asks for less motion: the cloth holds still, but for what says something (luff, folds, a tuck).
  still?: boolean;
  coordinatedLean?: number; coordination?: number; controlMode?: 'legacy' | 'brakes'; leftBrake?: number; rightBrake?: number;
}
export interface GliderMeasure { handLeft: number; handRight: number; edgeLeft: number; edgeRight: number; tipLeft: number; dropLeft: number; tipRight: number; dropRight: number }
export interface SkyContext {
  mode?: string; altitude?: number; camera?: { position: THREE.Vector3Like }; dt?: number; reducedMotion?: boolean; lowDetail?: boolean;
  seed?: number; fog?: number | { height: number };
}
