import type { RankableScore, RankedScore } from './board.types.ts';
// Lifted kilograms supply the flight's base points. Every recovered acro point adds one point;
// pending tricks do not score. Career kilograms and kit progression remain the meet's alone.
export const SCORE = Object.freeze({ acro: 1 });

/** Valid banked acro points, without a score cap or repair of damaged values. */
export const styleOf = (style: unknown) => typeof style === 'number' && Number.isSafeInteger(style) && style >= 0 && style % 5 === 0 ? style : 0;

/** Doubled points retain half-point lift totals exactly when ranking browser and server runs. */
export const rankOf = ({ total, style }: { total: number; style?: number }) => Math.round(total * 2) + 2 * styleOf(style) * SCORE.acro;

/** The score shown on the sheet: flight points plus recovered acro, rounded once. */
export const scoreOf = (run: { total: number; style?: number }) => Math.round(rankOf(run) / 2);

/** Equal exact scores rank by peak, then by the earlier run. */
export const outranks = (a: RankedScore, b: RankedScore) => {
  const ra = rankOf(a), rb = rankOf(b);
  return ra > rb || (ra === rb && a.peak > b.peak);
};
export const byRank = (a: RankableScore, b: RankableScore) => rankOf(b) - rankOf(a) || b.peak - a.peak || a.at - b.at;
