import { STYLE } from '../../../domains/good-lift/meet-style.ts';

export function styleLine(stamped: string, points: number, name: string, pending: number, links: number): string {
  if (stamped === 'landed') return `BANKED +${points.toLocaleString('en-GB')}`;
  if (stamped === 'lost') return `lost +${points.toLocaleString('en-GB')}`;
  if (pending < 0) return '';
  // A small caught move can restart the links while retaining the points already in hand.
  const multiplier = STYLE.chain[Math.max(1, Math.min(links, STYLE.chain.length)) - 1] / 2;
  return `${name} · ×${multiplier.toLocaleString('en-GB')} · ${pending.toLocaleString('en-GB')} pending`;
}
