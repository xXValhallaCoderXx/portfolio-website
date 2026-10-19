import type { AirSample, FlightInput, FlightState } from '../flight/models.ts';
import type { createControlSummary } from '../flight/brake-controls.ts';
import type { createSwingWatch } from '../coaching/swing-watch.ts';
import type { createCloudbaseRun } from './cloudbase-state.ts';
import type { createBells } from './bells.ts';
import type { createMeet } from './meet-state.ts';
import type { createStyle } from './meet-style.ts';

export type CloudbaseRun = ReturnType<typeof createCloudbaseRun>;
export type BellSystem = ReturnType<typeof createBells>;
export type MeetSystem = ReturnType<typeof createMeet>;
export type StyleSystem = ReturnType<typeof createStyle>;
export type SwingWatch = ReturnType<typeof createSwingWatch>;
export interface RunIntent extends FlightInput {
  turn: number; brake: boolean; deepBrake: boolean; bar: boolean; ears: boolean;
  controlMode: 'legacy' | 'brakes'; leftBrake: number; rightBrake: number;
}
export interface RunTrace { alt: Float32Array; fog: Float32Array; total: Float32Array; n: number }
export interface RunWorld {
  sky: CloudbaseRun; g: FlightState; controls: FlightInput; air: AirSample; forces: AirSample;
  bells: BellSystem | null; meet: MeetSystem | null; style: StyleSystem | null; watch: SwingWatch;
  hook: number; struck: number; stalls: number; tucks: number; steps: number; ended: string;
  pump: {held: number; n: number}; controlSummary: ReturnType<typeof createControlSummary>;
  intent: RunIntent; trace: RunTrace;
}
export interface RunWorldOptions {
  sky?: CloudbaseRun; g?: FlightState; controls?: FlightInput; air?: AirSample;
  bells?: BellSystem | null; meet?: MeetSystem | null; style?: StyleSystem | null;
}
