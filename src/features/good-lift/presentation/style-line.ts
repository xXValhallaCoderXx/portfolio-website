import { STYLE } from '../../../domains/good-lift/meet-style.ts';

export type ComboPhase = 'pending' | 'move' | 'multiplier' | 'banked' | 'lost';
export interface ComboFacts {
  phase: ComboPhase; move: number; elements: number; links: number; pending: number; points: number; scoreMultiplier: number;
}
const number = (value: number) => value.toLocaleString('en-GB');
export const comboMultiplier = (links: number) => STYLE.chain[Math.max(1, Math.min(links, STYLE.chain.length)) - 1] / 2;
export const moveName = (kind: number) => kind === 1 ? 'PITCH' : kind === 2 ? 'WINGOVER' : kind === 3 ? 'LOOP' : 'MOVE';

/** Counts, chain multipliers and banked score multipliers always have distinct labels. */
export function styleLine(facts: ComboFacts): { label: string; detail: string } {
  const { phase, move, elements, links, pending, points, scoreMultiplier } = facts;
  if (phase === 'banked') return {
    label: `${elements > 1 ? 'COMBO' : moveName(move)} BANKED · +${number(points)} STYLE`,
    detail: `score ×${scoreMultiplier.toFixed(2)}`,
  };
  if (phase === 'lost') return { label: 'COMBO ENDED', detail: 'recover calmly' };
  const chain = `chain ×${number(comboMultiplier(links))}`;
  if (phase === 'multiplier') return {
    label: `COMBO ${elements} · ${chain}`,
    detail: `${moveName(move)} +${number(points)} · ${number(pending)} pending`,
  };
  if (phase === 'move') return {
    label: `${moveName(move)} · +${number(points)}`,
    detail: `${elements > 1 ? `${elements} moves · ${chain} · ` : ''}${number(pending)} pending`,
  };
  return {
    label: elements > 1 ? `COMBO ${elements} · ${chain}` : moveName(move),
    detail: `${number(pending)} pending`,
  };
}
