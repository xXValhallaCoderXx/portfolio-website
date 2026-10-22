import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeLog, isDirectFrame } from './recorder.ts';
import { SIM_VERSION } from './sim-version.ts';
import { STYLE } from './meet-style.ts';
import { replaySpiralCombo } from '../../test/helpers/test-spiral-combo.ts';
import type { captureSpiralCombo } from '../../test/helpers/test-spiral-combo.ts';

interface SpiralReceipt {
  engine: string; sourceDigest: string; provenance: string;
  sourceManifest: Array<{ path: string; sha256: string }>;
  records: Array<ReturnType<typeof captureSpiralCombo> & { source: string; nodeMatches: boolean }>;
}

// Computed in actual Chromium by .artifacts/fun-acro-v4/browser-spiral-combo.mjs. Replay below
// consumes only these frozen canonical controls, never the adaptive browser capture pilot.
const receipt = JSON.parse(readFileSync(new URL('../../test/fixtures/good-lift-spiral-combo-chromium.json', import.meta.url), 'utf8')) as SpiralReceipt;

test('Chromium spiral and fresh wingovers retain mirrored physical combos and score exactly in Node', () => {
  assert.match(receipt.engine, /^Chromium /);
  assert.match(receipt.sourceDigest, /^[a-f0-9]{64}$/);
  assert.match(receipt.provenance, /actual course/);
  assert.ok(receipt.sourceManifest.some(source => source.path === 'src/domains/coaching/swing-watch.ts'));
  assert.ok(receipt.sourceManifest.every(source => /^[a-f0-9]{64}$/.test(source.sha256)));
  assert.deepEqual(receipt.records.map(record => record.side), [-1, 1]);
  for (const record of receipt.records) {
    assert.match(record.source, /^Chromium computed canonical paired brakes/);
    assert.equal(record.nodeMatches, true);
    assert.equal(record.simVersion, SIM_VERSION);
    const decoded = decodeLog(record.link); assert.ok(decoded.ok);
    assert.equal(decoded.log.simVersion, SIM_VERSION);
    assert.equal(decoded.log.steps, record.steps);
    assert.ok([...decoded.log.bits].every(isDirectFrame));
    const replay = replaySpiralCombo(record, decoded.log.bits);
    assert.deepEqual(replay.checkpoints, record.checkpoints, `side ${record.side}: complete physical and observer checkpoints`);
    assert.deepEqual(replay.snapshot, record.snapshot, `side ${record.side}: complete recovered bank`);
    assert.deepEqual(record.moves.map(move => move.kind), [4, 2, 2]);
    assert.ok(record.moves[1].step - record.moves[0].step > 8 * 60, 'the wingover uses two fresh tops');
    assert.equal(record.snapshot.watch.breaks, 0);
    assert.equal(record.metrics.stalls, 0); assert.equal(record.metrics.tucks, 0);
    assert.ok(record.metrics.heightLoss > 100 && record.metrics.heightLoss < 300);
    assert.equal(record.snapshot.style.landed, 1);
    assert.equal(record.snapshot.style.lost, 0);
    assert.equal(record.snapshot.style.lastCombo.mask, 10);
    assert.deepEqual(record.snapshot.style.lastCombo.sequence, [4, 2, 2]);
    assert.equal(record.snapshot.style.lastCombo.variety, STYLE.variety);
    assert.equal(record.snapshot.style.total, record.snapshot.style.lastCombo.base + STYLE.variety);
  }
});
