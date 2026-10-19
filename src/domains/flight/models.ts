/** Plain data shared by the deterministic solver, coaching and replay. */
export interface Vector2 { x: number; z: number; y?: number }
export interface Vector3 extends Vector2 { y: number }
export interface Quaternion extends Vector3 { w: number }
export type ControlMode = 'legacy' | 'brakes';
export type WingPhase = 'flying' | 'stall-entry' | 'full-stall' | 'backfly' | 'reattaching' | 'exit-surge' | 'frontal' | 'frontal-reopening';

export interface FlightInput {
  controlMode?: ControlMode;
  left?: boolean; right?: boolean; brake?: boolean; deepBrake?: boolean; bar?: boolean; ears?: boolean;
  turn?: number; leftBrake?: number; rightBrake?: number;
  locked?: boolean; steered?: boolean; climb?: number | null;
}

export interface AirSample {
  lift?: number; sink?: number; liftSide?: number;
  windX?: number; windY?: number; windZ?: number; hazardSink?: number;
  ridge?: number; lee?: number; thermal?: number; crestHeight?: number;
  ambientX?: number; ambientZ?: number; rough?: number; calm?: boolean; clearance?: number; front?: number;
}

export interface AtmosphereSample extends AirSample {
  windX: number; windY: number; windZ: number; ridge: number; lee: number; rough: number;
  crestHeight: number; thermal: number; ambientX: number; ambientZ: number;
  lift: number; sink: number; hazardSink: number;
}

export interface ControlSummary extends FlightInput {
  left: boolean; right: boolean; turn: number; brake: boolean; deepBrake: boolean; ears: boolean; bar: boolean;
  anyBrake: boolean; bothReleased: boolean; commonBrake: number; maxBrake: number;
}
export interface DirectControlSummary extends ControlSummary {
  controlMode: 'brakes'; leftBrake: number; rightBrake: number;
}

export interface ThermalSource extends Vector2 {
  id?: string | number; generation?: number; r?: number; s?: number; fade?: number;
  strength?: number; live?: boolean; remaining?: number; move?: number; scatter?: number;
  vx?: number; vz?: number; dir?: number; age?: number; life?: number; edgeFade?: number; launch?: boolean; flock?: boolean;
}

export interface FlowSample {
  alpha: number; forward: number; pilotForward: number; pitch: number; pitchRate: number;
  load: number; under: boolean; bank: number;
}

export interface PhysicalState {
  steer: number; differential: number; brake: number; brakeTarget: number; deepBrake: boolean;
  bar: number; ears: number; controlMode: ControlMode;
  leftBrake: number; rightBrake: number; leftBrakeTarget: number; rightBrakeTarget: number;
  acro: boolean; acroSteady: number; coordination: number; coordinated: number; bankTarget: number;
  orbit: number; angle: number; inverted: boolean; previousYaw: number;
  lineReady: boolean; lineX: number; lineY: number; lineZ: number;
  referenceLineX: number; referenceLineY: number; referenceLineZ: number;
  orbitActive: boolean; orbitPlaneX: number; orbitPlaneY: number; orbitPlaneZ: number;
  orbitPhase: number; orbitAge: number; orbitAbove: boolean; orbitArc: number; orbitProjection: number;
  lastOrbitAngle: number; lastOrbitArc: number; lastOrbitProjection: number;
  windX: number; windY: number; windZ: number; tension: number; alpha: number; energy: number; kinetic: number;
  wingPhase: WingPhase; recoverySource: string; inflation: number; separation: number;
  stallExposure: number; frontExposure: number; releaseExposure: number; backflyFor: number; recoveryFor: number;
  stallAge: number; stallWarning: number; frontalRisk: number; forwardAirspeed: number;
  linePitch: number; linePitchRate: number; folded: boolean; swingRate: number;
  flow: FlowSample; work: Vector3[]; force: Vector3; moment: Vector3; pilotForce: Vector3;
}

export interface PhysicsBodies {
  pilot: { pos: Vector3; vel: Vector3 };
  canopy: { pos: Vector3; vel: Vector3; q: Quaternion; omega: Vector3 };
  physical: PhysicalState;
  bank?: number; pitch?: number; rollRate?: number; pitchRate?: number; loop?: number; load?: number;
}

export interface FlightState extends PhysicsBodies {
  pos: Vector3; yaw: number; yawRate: number; track: number; trackRate: number; bank: number;
  speed: number; sink: number; vy: number; turn: number; lift: number; liftSide: number;
  brake: number; deepBrake: boolean; brakeTarget: number; acro: boolean; bar: number; ears: number;
  controlMode: ControlMode; leftBrake: number; rightBrake: number; leftBrakeTarget: number; rightBrakeTarget: number;
  coordination: number; coordinatedLean: number; pilotLean: number; bankTarget: number;
  pitch: number; pitchRate: number; lean: number; roll: number; rollRate: number; stallLoad: number; stall: number;
  windX: number; windZ: number; felt: boolean; tuck: number; wingPhase: WingPhase; recoverySource: string;
  inflation: number; forwardAirspeed: number; frontalRisk: number;
  loop: number; loopAngle: number; loopRate: number; loops: number; tension: number; load: number;
}

export interface PhasePrediction {
  toPeak: number; toLine: number; peak: number; bank: number; size: number;
}

export type HeightSampler = (x: number, z: number) => number;
