import type { AirSample, FlightInput, HeightSampler, ThermalSource, Vector2, Vector3 } from '../flight/models.ts';

export type ControlName = 'left' | 'right' | 'brake' | 'bar' | 'ears';
export interface CoachFields {
  action?: string; state?: string; context?: string; phase?: string;
  title?: string; detail?: string; hold?: readonly string[]; release?: readonly string[];
  brakeDepth?: string; dragAction?: string; stableTitle?: boolean;
  progress?: number; progressLabel?: string; feedback?: string; heading?: string;
  activity?: string; preferredDirection?: number; distance?: number;
  targetId?: string | number; targetGeneration?: number; warning?: boolean; warningLabel?: string; urgent?: boolean;
  transfer?: Partial<RidgeTransferState>; lessonId?: string; canCancelLesson?: boolean;
}
export interface CoachMessage extends CoachFields {
  action: string; title: string; detail: string; hold: ControlName[]; release: ControlName[]; accepted: boolean;
  controlMode?: 'brakes';
}

export interface FogForecast { height: number; elapsed?: number; speedAt?: (height: number, elapsed: number) => number }
export interface CoachingAdapter {
  sampleAir: (position: Vector3, output: AirSample) => AirSample | void;
  heightAt: HeightSampler;
  sources?: () => readonly ThermalSource[];
  inside?: (position: Vector3, margin: number) => boolean;
  cloudDepth?: (position: Vector3) => number;
  fog?: () => FogForecast | null;
  navigation?: boolean;
  openingProtected?: () => boolean;
  recoveryPoint?: () => Vector2 | null;
  thermalFlow?: () => { source: number; generation: number; pressure?: boolean } | null;
}

export interface FlightObservation {
  pos: Vector3; bank?: number; pitch?: number; stall?: number; tuck?: number; ears?: number;
  yaw?: number; track?: number; trackRate?: number; speed?: number; vy?: number; pitchRate?: number;
  deepBrake?: boolean; acro?: boolean; loop?: number;
  pilot?: { vel: Vector2 & {y?: number} };
}

export interface LiftFrame {
  g: FlightObservation; air?: AirSample; input?: FlightInput; clock?: number;
  eligible?: boolean; suspended?: boolean; activity?: string; unsafe?: boolean; turnSupported?: boolean;
}

export interface RidgeTransferState {
  ready: boolean; targetId: string | number | null; generation: number | null;
  requiredHeight: number | null; missingHeight: number | null; seconds: number | null;
}
