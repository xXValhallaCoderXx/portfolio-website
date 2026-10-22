import { STYLE } from '../../../domains/good-lift/meet-style.ts';

export type ComboPhase = 'pending' | 'move' | 'multiplier' | 'banked' | 'lost';
export interface ComboFacts {
  phase: ComboPhase; move: number; elements: number; links: number; pending: number; points: number;
  sequence: readonly number[]; bankProgress: number;
}
const number = (value: number) => value.toLocaleString('en-GB');
export const comboMultiplier = (links: number) => STYLE.chain[Math.max(1, Math.min(links, STYLE.chain.length)) - 1] / 2;
export const moveName = (kind: number) => kind === 1 ? 'PITCH' : kind === 2 ? 'WINGOVER' : kind === 3 ? 'LOOP' : kind === 4 ? 'SPIRAL 360' : 'MOVE';
export function comboSequence(sequence: readonly number[], elements: number, fallback: number) {
  const last = sequence.slice(-3);
  const omitted = Math.max(0, elements - last.length);
  return `${omitted ? `+${omitted} · ` : ''}${last.length ? last.map(moveName).join(' → ') : moveName(fallback)}`;
}

/** Chain multipliers apply to moves; recovered acro adds directly to the final score. */
export function styleLine(facts: ComboFacts): { label: string; detail: string } {
  const { phase, move, elements, links, pending, points, sequence, bankProgress } = facts;
  const moves = comboSequence(sequence, elements, move);
  if (phase === 'banked') return { label: `BANKED +${number(points)} ACRO`, detail: moves };
  if (phase === 'lost') return { label: 'COMBO ENDED', detail: 'pending acro lost' };
  const chain = `chain ×${number(comboMultiplier(links))}`;
  if (phase === 'move' || phase === 'multiplier') return {
    label: moves, detail: `+${number(points)} · ${chain} · ${number(pending)} pending`,
  };
  return { label: moves, detail: `${chain} · ${number(pending)} pending${bankProgress > 0 ? ' · banking' : ''}` };
}
