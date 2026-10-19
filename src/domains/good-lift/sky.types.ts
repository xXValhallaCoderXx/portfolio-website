import type { ThermalSource, Vector2, Vector3 } from '../flight/models.ts';
import type { CloudWeather } from '../flight/cloud-weather.ts';
import type { ThermalFlowState } from '../flight/thermal-flow.ts';

export interface SkyThermal extends ThermalSource {
  r: number; s: number; wear: number; age: number; life: number; strength: number; live: boolean;
  move: number; moveTime: number; fromX: number; fromZ: number; dir: number; rise: number; scatter: number;
  generation: number; vx: number; vz: number; fade: number; edgeFade: number; waiting?: boolean;
}
export interface SkyRaven extends Vector3 {
  heading: number; bank: number; flap: number; fade: number; hot: boolean; threat: boolean;
  thermal: number; rung: number; radius: number; rate: number; angle: number;
}
export interface SkyCloud extends Vector3 {
  rx: number; ry: number; rz: number; turn: number; cos: number; sin: number; fade: number;
  lane: number; along: number; ux: number; uz: number; speed: number; layer: number; vx: number; vz: number;
}
export interface WindLayer extends Vector3 { shear: number; scale: number }
export interface GustBand {strength: number; ux: number; uz: number; born: number; lane: number; at: number}
export interface SkyPilot extends Vector3 {
  collapse: number; shield: number; cloud: number; cloudTime: number; strikes: number; thermal: number;
  danger: number; headroom: number; gustAhead: number; gustIn: number; gustSlot: number;
}
export interface SkyState {
  seed: number; rng: number; elapsed: number; fogHeight: number; peak: number; openingAt: number;
  active: boolean; windEnabled: boolean; ambientX: number; ambientZ: number; weather: CloudWeather;
  thermals: SkyThermal[]; ravens: SkyRaven[]; clouds: SkyCloud[]; wind: WindLayer[]; gusts: GustBand[];
  gustDue: number; gustCount: number; ravenDue: number; ravenCount: number; ravenAttack: number; ravenAt: number;
  flow: ThermalFlowState; pilot: SkyPilot;
}
export interface CloudbaseOptions {hazards?: boolean; wind?: boolean; fixedWind?: Vector2 | null}
