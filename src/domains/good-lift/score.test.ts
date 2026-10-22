import test from 'node:test';
import assert from 'node:assert/strict';
import { byRank, outranks, rankOf, scoreOf, styleOf } from './score.ts';

test('banked acro adds directly to lift points without a cap or a lifted-weight requirement', () => {
  assert.equal(scoreOf({ total: 512.5, style: 260 }), 773);
  assert.equal(scoreOf({ total: 512.5, style: 0 }), 513);
  assert.equal(scoreOf({ total: 512.5 }), 513);
  assert.equal(scoreOf({ total: 100, style: 35 }), 135);
  assert.equal(scoreOf({ total: 100, style: 150 }), 250);
  assert.equal(scoreOf({ total: 0, style: 150 }), 150);
  assert.equal(scoreOf({ total: 400, style: 5000 }), 5400);
});
test('banked acro validation preserves integer multiples of five and rejects malformed points', () => {
  for (const [style, counted] of [[260, 260], [1005, 1005], [0, 0], [-5, 0], [1, 0], [2.5, 0], [NaN, 0], [undefined, 0], [null, 0], ['260', 0], [Infinity, 0], [1e20, 0]])
    assert.equal(styleOf(style), counted, String(style));
});
test('exact doubled ranks retain half points and stable score, peak and time ordering', () => {
  for (const total of [2.5, 512.5, 1237.5]) for (const style of [0, 5, 260, 1000, 5000])
    assert.equal(rankOf({ total, style }), total * 2 + style * 2);
  assert.equal(outranks({ total: 100, style: 30, peak: 500 }, { total: 125, style: 0, peak: 900 }), true);
  assert.equal(outranks({ total: 100, style: 25, peak: 500 }, { total: 125, style: 0, peak: 900 }), false);
  assert.equal(outranks({ total: 100, style: 25, peak: 901 }, { total: 125, style: 0, peak: 900 }), true);
  const rows = [
    { id: 'a', total: 125, style: 0, peak: 900, at: 3 },
    { id: 'b', total: 100, style: 30, peak: 500, at: 2 },
    { id: 'c', total: 100, style: 25, peak: 900, at: 1 },
    { id: 'd', total: 100, style: 25, peak: 900, at: 4 },
  ];
  assert.deepEqual(rows.sort(byRank).map(row => row.id), ['b', 'c', 'a', 'd']);
});
