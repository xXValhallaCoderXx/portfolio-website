import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOG_FORMAT, decodeLog, isDirectFrame } from './recorder.ts';
import { SIM_VERSION } from './sim-version.ts';
import { replayDirectLesson } from '../../test/helpers/test-direct-lessons.ts';
import type { captureDirectLesson } from '../../test/helpers/test-direct-lessons.ts';

interface DirectLessonReceipt {
  engine: string;
  sourceDigest: string;
  provenance: string;
  sourceManifest: Array<{ path: string; sha256: string }>;
  records: Array<ReturnType<typeof captureDirectLesson> & { source: string; nodeMatches: boolean }>;
}

// Frozen in Chromium by tools/capture-goldens.ts (set direct-lessons). Tests replay these recorded
// canonical inputs; they never run the scripted capture pilot to generate expected results.
const receipt = JSON.parse(readFileSync(new URL('../../test/fixtures/good-lift-direct-lessons-chromium.json', import.meta.url), 'utf8')) as DirectLessonReceipt;

test('Chromium pitch, wingover and loop lessons retain every paired-control body and observer checkpoint in Node', () => {
  assert.match(receipt.engine, /^Chromium /);
  assert.match(receipt.sourceDigest, /^[a-f0-9]{64}$/);
  assert.match(receipt.provenance, /Isolated high-air lesson/);
  assert.ok(receipt.sourceManifest.some(source => source.path === 'src/domains/coaching/direct-acro-guide.ts'));
  assert.ok(receipt.sourceManifest.every(source => /^[a-f0-9]{64}$/.test(source.sha256)));
  const expectedCases = ['pitch', 'wingover', 'loop'].flatMap(kind => [-1, 1].flatMap(side =>
    [0, 0.1, 0.2, 0.3].map(delay => `${kind}/${side}/${delay}`)));
  assert.deepEqual(receipt.records.map(record => `${record.kind}/${record.side}/${record.delay}`), expectedCases);
  for (const record of receipt.records) {
    const label = `${record.kind}/${record.side}/${record.delay}`;
    assert.match(record.source, /^Chromium computed visible paired-target lesson/);
    assert.equal(record.nodeMatches, true);
    assert.equal(record.simVersion, SIM_VERSION);
    const read = decodeLog(record.link); assert.ok(read.ok, label);
    assert.equal(read.log.simVersion, SIM_VERSION);
    assert.equal(read.log.format, LOG_FORMAT);
    assert.equal(read.log.glider, 'classic');
    assert.equal(read.log.steps, record.steps);
    assert.deepEqual([...read.log.bits], record.frames);
    assert.ok(record.frames.every(isDirectFrame), 'hands-up frames retain direct mode too');
    assert.equal(record.checkpoints[0].step, 1);
    assert.equal(record.checkpoints.at(-1)!.step, record.steps);
    const replay = replayDirectLesson(record, read.log.bits);
    assert.deepEqual(replay.checkpoints, record.checkpoints, `${label}: every physical, watch and style checkpoint`);
    assert.deepEqual(replay.snapshot, record.snapshot, `${label}: complete recovered state`);
    assert.equal(record.started, true);
    assert.deepEqual(record.learned, [record.kind]);
    assert.equal(record.lesson.phase, 'banked');
    assert.equal(record.metrics.stalls, 0); assert.equal(record.metrics.tucks, 0);
    assert.equal(record.snapshot.watch.breaks, 0); assert.ok(record.snapshot.watch.calm + 1e-9 >= 3);
    assert.equal(record.snapshot.watch.moveKind, record.kind === 'pitch' ? 1 : record.kind === 'wingover' ? 2 : 3);
    assert.equal(record.snapshot.style.landed, 1); assert.equal(record.snapshot.style.lost, 0);
    assert.ok(record.snapshot.style.total > 0);
    assert.equal(record.snapshot.loops, record.kind === 'loop' ? 1 : 0);
    assert.ok(record.messages.some(message => message.targets), 'the pilot follows visible paired brake targets');
    assert.equal(record.lesson.awarded, record.snapshot.style.lastCombo.points);
    assert.equal(record.lesson.awarded, record.snapshot.style.said);
    assert.doesNotMatch(record.messages.at(-1)!.title, /STYLE|BANKED/, 'bank feedback belongs to the compact combo strip');
  }
});
