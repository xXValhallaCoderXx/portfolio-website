import type { WorldRow } from '../../domains/good-lift/board.types.ts';
import type * as THREE from 'three';
import type { FlightState, FlightInput, AirSample } from '../../domains/flight/models.ts';
import type { loadModel } from '../../adapters/rendering/scenery.ts';
import type { FlightEffects } from '../flight/presentation/flight-effects.ts';
import type { AudioVoice, FlightAudioState } from '../flight/services/flight-audio.adapter.ts';
import type { summariseRun } from '../../domains/good-lift/meet-sheet.ts';
import type { kitSheet } from '../../domains/progression/good-lift-store.ts';
import type { emptyKit } from '../../domains/progression/wing-kit.ts';

export type RunSheet = ReturnType<typeof summariseRun>;
export type KitChoice = ReturnType<typeof emptyKit>;
export type KitSheet = ReturnType<typeof kitSheet>;
export type { GameAddress } from '../../domains/good-lift/good-lift-address.ts';
export interface BoardRow {
  who: string; total: number; peak: number; red: readonly number[]; style?: number; score?: number;
  at?: number; log?: string; byname?: string | null; via?: string; id?: string;
}
export interface ChallengeTarget extends BoardRow { seed: number; day: number; reason: string; log: string; error?: never }
export interface ChallengeFailure { error: string }
export type ChallengeOutcome = ChallengeTarget | ChallengeFailure;
export interface ResolvedSky { kind: string; seed: number; day: number; target?: ChallengeTarget; notice?: string }
export interface BotResult {
  at: number; seed: number; failed?: boolean; fresh?: string[];
  tst?: BoardRow; medals?: { total: number; peak: number; medal: string; by: string }[]; medal?: string;
}
export interface WorldResult {
  at: number; seed: number; day: number; rows: WorldRow[]; rank: number;
  sent?: { ok: boolean; why?: string; rank?: number } | null;
  removed?: boolean; stays?: boolean; failed?: boolean;
  loading?: boolean; readFailed?: boolean;
}
export interface ScoreSubmission {
  phase: 'submitting' | 'submitted' | 'not-best' | 'rejected' | 'failed' | 'withdrawn';
  initials: string; why?: string; rank?: number;
}
export interface RunResult extends RunSheet {
  kind: string; day: number; label: string; at: number;
  style: number; best: { total: number; peak: number; score?: number };
  feats: { earned: string[]; fresh: string[]; streak: number };
  board: { rows: BoardRow[]; mine: string } | null;
  target: ChallengeTarget | null; log: string; link: string; verified: boolean; verifying: boolean;
  byname: string; verse: string; score?: number; newBest?: boolean;
  initials?: string; pilot?: string; online?: boolean; submission?: ScoreSubmission;
  kit?: KitSheet; music?: boolean;
  blessing?: { rune: number; sign: string; name: string; line: number } | null;
  runes?: { rune: number; sign: string; name: string }[]; beast?: string | null;
}

export type FlightControls = FlightInput & { turn: number; brake: boolean; deepBrake: boolean; bar: boolean; ears: boolean; locked: boolean; steered: boolean; climb: number | null };
export interface GoodLiftHost {
  g: FlightState & { pos: THREE.Vector3 }; controls: FlightControls; air: AirSample; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
  effects: FlightEffects; stage: HTMLElement; view: { width: number; height: number }; loadModel: typeof loadModel;
  base?: string; touch: boolean; calm: boolean; hud(name: string): HTMLElement;
  compact(): boolean; best(): number; unlock(id: string): void; flash(): void; bright(): boolean;
  kit(): KitChoice; wear(kit: KitChoice): KitChoice;
  sound: { readonly audio: FlightAudioState; panned(ctx: AudioContext, pan: number): GainNode | StereoPannerNode;
    play<Args extends unknown[]>(name: string, gap: number, voice: AudioVoice<Args>, ...args: Args): void };
  onMusic?(on: boolean): void; onBots?(bots: BotResult): void; onWorld?(world: WorldResult): void;
  onResultUpdate?(result: RunResult): void;
}
