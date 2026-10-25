import type gliderFixture from '../../test/fixtures/good-lift-gliders-chromium.json';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOG_FORMAT, decodeLog } from './recorder.ts';
import { replayLog } from './replay.ts';
import { SIM_VERSION } from './sim-version.ts';
import { GLIDERS } from './glider-ids.ts';
import { MOVE } from './trick-tables.ts';
import { GLIDER_RUN } from '../../test/helpers/test-glider-runs.ts';

// A Daily Sky's run on every glider, flown in Chromium by tools/capture-goldens.ts (set gliders):
// TST's keys, a spiral flown on one hand and banked, and every strike the sky threw folding the half
// it hit and flown out. Node flies each log again to the very same sheet; the board's function takes
// them too (functions/test/glider-browser.test.js).
const receipt = JSON.parse(readFileSync(new URL('../../test/fixtures/good-lift-gliders-chromium.json', import.meta.url), 'utf8')) as typeof gliderFixture;

test('a Chromium run on every glider replays in Node to its very sheet, a spiral banked and strikes flown out', () => {
  assert.match(receipt.engine, /^Chromium /);
  assert.equal(receipt.simVersion, SIM_VERSION);
  assert.deepEqual(receipt.records.map((record) => record.glider), [...GLIDERS]);
  for (const record of receipt.records) {
    assert.match(record.source, /^Chromium computed run on a glider/);
    const read = decodeLog(record.link);
    assert.ok(read.ok, read.why!);
    assert.deepEqual([read.log.format, read.log.simVersion, read.log.glider, read.log.day, read.log.steps], [LOG_FORMAT, SIM_VERSION, record.glider, GLIDER_RUN.day, record.steps]);
    assert.deepEqual(replayLog(read.log), record.sheet, `${record.glider}: every score, event, step and trace sample`);
    assert.ok(['fog', 'landed', 'time'].includes(record.sheet.reason), `${record.glider}: a judged run`);
    assert.ok(record.sheet.stats.style > 0 && record.sheet.stats.tricks.moves[MOVE.spiral] > 0, `${record.glider}: the spiral banked`);
    assert.ok(record.sheet.stats.strikes > 0, `${record.glider}: struck at least once, and flown out`);
  }
});
