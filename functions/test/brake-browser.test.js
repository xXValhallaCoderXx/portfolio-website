// These complete daily flights were computed in real Chromium, including their expected sheets.
// Check the same server core and actual submission handler that accept a player's recording.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBoard } from '../src/runs.js';
import { DAY_MS } from '../../src/game/good-lift-address.js';
import { decodeLog } from '../../src/game/recorder.js';
import { replayLog } from '../../src/game/replay.js';
import { SIM_VERSION } from '../../src/game/sim-version.js';

const receipt = JSON.parse(readFileSync(new URL('../../src/game/fixtures/good-lift-brakes-chromium.json', import.meta.url), 'utf8'));

test('the server replays and accepts actual Chromium proportional and mixed daily flights exactly', async () => {
  assert.match(receipt.engine, /^Chromium /);
  const records = receipt.records.filter(record => !record.pureFlight);
  assert.equal(records.length, 2);
  for (const record of records) {
    assert.equal(record.simVersion, SIM_VERSION);
    const read = decodeLog(record.link); assert.ok(read.ok);
    assert.deepEqual(replayLog(read.log), record.sheet);
    const store = { async read() { return null; }, async update(key, change) { return change(null).result; } };
    const board = createBoard({ store, now: () => record.day * DAY_MS + 5 * 3_600_000, log() {} });
    const response = await board.handle({ method: 'POST', path: '/runs', ip: '203.0.113.7', body: JSON.stringify({
      log: record.link, token: 'Q2hvc2VuLWJ5LWEtZmFpci1kaWNlLXJvbGwtZm9yLW1l' }) });
    assert.equal(response.status, 200, `${record.kind}: ${JSON.stringify(response.body)}`);
    const row = response.body.board.rows[0];
    assert.deepEqual({ total: row.total, style: row.style, peak: row.peak, red: row.red }, {
      total: record.sheet.total, style: record.sheet.stats.style, peak: record.sheet.peak, red: record.sheet.lifts.map(lift => lift.red) });
  }
});
