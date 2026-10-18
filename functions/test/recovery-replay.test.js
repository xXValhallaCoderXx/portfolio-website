// Browser-computed launch-to-recovery recordings replay through the same server core used by
// the submission handler. These practice flights intentionally end as quit and cannot rank.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeLog } from '../../src/game/recorder.js';
import { replayLog } from '../../src/game/replay.js';
import { SIM_VERSION } from '../../src/game/sim-version.js';

test('Chromium stall/backfly and frontal flights from launch match the server replay and complete sheets', () => {
  const receipt = JSON.parse(readFileSync(new URL('../../src/game/fixtures/good-lift-v13-recovery-chromium.json', import.meta.url), 'utf8'));
  assert.match(receipt.engine, /^Chromium /);
  const records = receipt.records.filter(r => !r.pureFlight);
  assert.equal(records.length, 2);
  for (const r of records) {
    assert.equal(r.simVersion, SIM_VERSION);
    const read = decodeLog(r.link); assert.ok(read.ok);
    assert.equal(r.metrics.recovered, true); assert.equal(r.metrics.assisted, false); assert.ok(r.metrics.minimumClearance >= 30);
    assert.ok(r.phases.some(p => p.phase === (r.scenario === 'stall' ? 'backfly' : 'frontal')));
    assert.deepEqual(replayLog(read.log), r.sheet);
    assert.equal(r.sheet.reason, 'quit'); assert.equal(r.sheet.stats.style, 0);
  }
});
