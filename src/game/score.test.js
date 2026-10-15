import test from 'node:test';
import assert from 'node:assert/strict';
import { SCORE, byRank, multiplierOf, outranks, rankOf, scoreOf, styleOf } from './score.js';

test('style multiplies the total, by a thousandth for each point, up to twice it, and nothing lifted scores nothing', () => {
  assert.equal(scoreOf({ total: 512.5, style: 260 }), 646);
  assert.equal(multiplierOf(260), 1.26);
  assert.equal(scoreOf({ total: 512.5, style: 0 }), 513, 'a half point rounds up');
  assert.equal(scoreOf({ total: 512.5 }), 513, 'a run with no style counts none');
  assert.equal(scoreOf({ total: 400, style: SCORE.cap }), 800);
  assert.equal(scoreOf({ total: 400, style: 5 * SCORE.cap }), 800, 'counted up to the cap');
  assert.equal(scoreOf({ total: 0, style: 1000 }), 0);
});

test('the style a score counts is a whole number from nought to the cap, and anything else is none', () => {
  for (const [style, counted] of [[260, 260], [1005, SCORE.cap], [0, 0], [-5, 0], [NaN, 0], [undefined, 0], [null, 0], ['260', 0], [Infinity, 0]]) {
    assert.equal(styleOf(style), counted, String(style));
  }
});

test('two runs compare exactly, in whole numbers, by the score, then the peak, then the earlier', () => {
  for (const total of [2.5, 512.5, 1_237.5]) {
    for (const style of [0, 5, 260, 995, 1000]) assert.ok(Number.isSafeInteger(rankOf({ total, style })), `${total} kg, ${style} style`);
  }
  // 100 kg with 260 style outranks 125 kg of none; 100 with 250 ties 125, and the peak decides.
  assert.equal(outranks({ total: 100, style: 260, peak: 500 }, { total: 125, style: 0, peak: 900 }), true);
  assert.equal(outranks({ total: 100, style: 250, peak: 500 }, { total: 125, style: 0, peak: 900 }), false);
  assert.equal(outranks({ total: 100, style: 250, peak: 901 }, { total: 125, style: 0, peak: 900 }), true);
  const rows = [
    { id: 'a', total: 125, style: 0, peak: 900, at: 3 },
    { id: 'b', total: 100, style: 260, peak: 500, at: 2 },
    { id: 'c', total: 100, style: 250, peak: 900, at: 1 },
    { id: 'd', total: 100, style: 250, peak: 900, at: 4 },
  ];
  // c, a and d all score 125 at 900 m: the earliest first.
  assert.deepEqual(rows.sort(byRank).map((row) => row.id), ['b', 'c', 'a', 'd']);
});
