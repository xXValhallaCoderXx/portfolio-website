// The score a Good Lift run is ranked by: its total, in kilograms, multiplied by its style, the way a
// powerlifter's total is weighed by a formula. Style (meet-style.js) multiplies the total by
// 1 + style / `per`, the style counted up to `cap`, so tricks can at most double a run, and a run
// that lifted nothing scores nothing however it was flown. The kilograms stay the meet's: the
// lifts, the log's claim, the feats and the 1,000 lb club are all in kg; the board, the medals, the
// bots, challenges and the share line go by the score.
//
// Worked in whole numbers: a total is a whole number of 2.5 kg plates and style a whole number of 5
// points, so twice the total times (per + style) is a whole number, and two runs compare exactly,
// in the browser and on the server that flies a run again alike. Shown rounded to whole points.

export const SCORE = Object.freeze({ per: 1000, cap: 1000 });

// The style a run's score counts: a whole number from 0 to the cap. A row stored before style was
// carried, or damaged, counts none.
export const styleOf = (style) => (Number.isFinite(style) && style > 0 ? Math.min(SCORE.cap, Math.round(style)) : 0);

// What a run ranks by, exactly: twice its total times (per + style counted).
export const rankOf = ({ total, style }) => Math.round(total * 2) * (SCORE.per + styleOf(style));

/** The score of a run ({ total, style }), in whole points. */
export const scoreOf = (run) => Math.round(rankOf(run) / (2 * SCORE.per));

/** The multiplier a run's style gives its total, as shown: ×1.26. */
export const multiplierOf = (style) => (SCORE.per + styleOf(style)) / SCORE.per;

/**
 * Whether run `a` ranks above run `b` ({ total, style, peak }): the higher score, or the same score
 * and the higher peak. Of two that tie in both, neither does; the board then puts the earlier run
 * first, and a bot stays ahead of any run that only ties it.
 */
export const outranks = (a, b) => {
  const ra = rankOf(a);
  const rb = rankOf(b);
  return ra > rb || (ra === rb && a.peak > b.peak);
};

// Best first: the higher score, then the higher peak, then the run that started first. Stable, so a
// run that ties another exactly in all three ranks after the one already there.
export const byRank = (a, b) => rankOf(b) - rankOf(a) || b.peak - a.peak || a.at - b.at;
