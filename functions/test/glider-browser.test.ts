import type gliderFixture from '../../src/test/fixtures/good-lift-gliders-chromium.json';
import type { BoardStore } from '../src/board.types.ts';
// A Daily Sky's run on every glider, flown in real Chromium with its expected sheet (src/test/fixtures,
// tools/capture-goldens.ts set gliders). The very handler that takes a player's run takes each, and
// ranks it as its browser did, on the glider its log names.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBoard } from '../src/runs.ts';
import { DAY_MS } from '../../src/domains/good-lift/good-lift-address.ts';

const receipt = JSON.parse(readFileSync(new URL('../../src/test/fixtures/good-lift-gliders-chromium.json', import.meta.url), 'utf8')) as typeof gliderFixture;

test('the server takes an actual Chromium run on every glider as its browser ranked it', async () => {
  assert.match(receipt.engine, /^Chromium /);
  for (const record of receipt.records) {
    const store: BoardStore = { async read() { return null; }, async update(_key, change) { return change(null).result; } };
    const board = createBoard({ store, now: () => record.day * DAY_MS + 5 * 3_600_000, log() {} });
    const response = await board.handle({ method: 'POST', path: '/runs', ip: '203.0.113.7', body: JSON.stringify({
      log: record.link, token: 'Q2hvc2VuLWJ5LWEtZmFpci1kaWNlLXJvbGwtZm9yLW1l' }) });
    assert.equal(response.status, 200, `${record.glider}: ${JSON.stringify(response.body)}`);
    const row = response.body.board!.rows[0];
    assert.deepEqual({ glider: row.glider, total: row.total, style: row.style, peak: row.peak, red: row.red }, {
      glider: record.glider, total: record.sheet.total, style: record.sheet.stats.style, peak: record.sheet.peak,
      red: record.sheet.lifts.map((lift) => lift.red) });
  }
});
