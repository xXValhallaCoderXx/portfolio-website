import { createCloudbaseRun } from '../../../domains/good-lift/cloudbase-state.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunWorld, startRun } from '../../../domains/good-lift/run-step.ts';
import { summariseRun } from '../../../domains/good-lift/meet-sheet.ts';
import type { BotResult } from '../good-lift.models.ts';
import { buildResultView, verdict, resultSummary, medalTrack } from './result-view.service.ts';

const result = () => ({
  ...summariseRun(startRun(createRunWorld({ sky: createCloudbaseRun() }), 1), 'quit'),
  kind: 'practice', day: 0, label: 'Sky 1', at: 10, style: 0, best: { total: 0, peak: 80 },
  feats: { earned: [], fresh: [], streak: 0 }, board: null, target: null,
  log: '', link: '', verified: false, verifying: false, byname: '', verse: '',
});
test('result presentation ignores responses belonging to an earlier run and stays read-only', () => {
  const sheet = result();
  const stale: BotResult = { at: 9, seed: sheet.seed, failed: true, fresh: ['opener'] };
  const before = structuredClone([sheet, stale]);
  const view = buildResultView(sheet, stale, null);
  assert.equal(view.landed, null);
  assert.equal(view.fresh.has('opener'), false);
  assert.deepEqual([sheet, stale], before);
  const current = buildResultView(sheet, { ...stale, at: sheet.at }, null);
  assert.ok(current.fresh.has('opener'));
});
test('race wording preserves score ranking and height tie breaks', () => {
  assert.equal(verdict({ total: 100, style: 0, peak: 101 }, { who: 'ABC', total: 100, style: 0, peak: 100 }), 'level on points; you climbed higher');
  assert.match(verdict({ total: 110, style: 0, peak: 100 }, { total: 100, style: 0, peak: 100 }), /^you won by/);
});

test('a below-line quit shows the shortfall and preserves earlier banked rewards', () => {
  const sheet = { ...result(), peak: 111, total: 25, style: 10, newBest: true };
  const summary = resultSummary(sheet);
  assert.deepEqual(summary, { ending: 'BAR FORFEIT', shortfall: 39, banked: 25, score: 35, personalBest: true });
  assert.equal(resultSummary({ ...sheet, peak: 150 }).shortfall, 0);
});
test('medal tracks wait for correlated targets and compare score rather than kilograms alone', () => {
  const sheet = { ...result(), total: 50, style: 20 };
  const bots = { at: sheet.at, seed: sheet.seed, medals: [
    { total: 60, peak: 200, medal: 'bronze', by: 'bot' },
    { total: 100, peak: 300, medal: 'silver', by: 'bot' },
    { total: 120, peak: 400, medal: 'gold', by: 'tst' },
  ] };
  assert.equal(medalTrack(sheet, null), null);
  assert.equal(medalTrack(sheet, { ...bots, at: sheet.at - 1 }), null);
  assert.equal(medalTrack(sheet, { ...bots, failed: true }), null);
  assert.equal(medalTrack(sheet, bots)?.caption, '30 to silver');
  assert.equal(medalTrack(sheet, bots)?.score, 70);
});
