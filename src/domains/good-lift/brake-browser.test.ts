import type receiptFixture from '../../test/fixtures/good-lift-brakes-chromium.json';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeLog, frameInput, isDirectFrame } from './recorder.ts';
import { SIM_VERSION } from './sim-version.ts';
import { WING } from '../flight/flight.ts';
import { replayBrakeCapture } from '../../test/helpers/test-brake-replay.ts';
import { replayLog } from './replay.ts';

const receipt = JSON.parse(readFileSync(new URL('../../test/fixtures/good-lift-brakes-chromium.json', import.meta.url), 'utf8')) as typeof receiptFixture;

test('Chromium direct, mixed, full-stall and frontal inputs retain exact physical and observer replays', () => {
  assert.match(receipt.engine, /^Chromium /);
  assert.match(receipt.sourceDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(receipt.records.map((record) => record.kind), ['direct', 'mixed', 'stall', 'frontal']);
  for (const record of receipt.records) {
    assert.match(record.source, /^Chromium computed quantized/);
    assert.equal(record.simVersion, SIM_VERSION);
    const read = decodeLog(record.link);
    assert.ok(read.ok, read.why!);
    assert.equal(read.log.format, 2);
    assert.equal(read.log.steps, record.steps);
    assert.ok(read.log.bits.some(isDirectFrame));
    const replay = replayBrakeCapture(record, read.log.bits);
    assert.deepEqual(replay.checkpoints, record.checkpoints, `${record.kind}: every body, wing, watch and style checkpoint`);
    assert.deepEqual(replay.snapshot, record.snapshot, `${record.kind}: complete final physical and observer state`);
    if (!record.pureFlight) {
      assert.deepEqual(replay.sheet, record.sheet);
      assert.deepEqual(replayLog(read.log), record.sheet, 'the ordinary replay judge returns the browser sheet');
      assert.ok(record.kind === 'direct' ? read.log.bits.every(isDirectFrame) : read.log.bits.some((frame) => !isDirectFrame(frame)));
      const hands = [...read.log.bits].filter(isDirectFrame).map(frame => frameInput(frame));
      assert.ok(hands.some(input => input.leftBrake > input.rightBrake));
      assert.ok(hands.some(input => input.rightBrake > input.leftBrake));
      assert.ok(hands.some(input => input.leftBrake === 0 && input.rightBrake === 0));
    } else {
      assert.ok(record.phases!.some((phase) => phase.phase === (record.kind === 'stall' ? WING.backfly : WING.frontal)));
      assert.equal(record.snapshot.wing.wingPhase, WING.flying);
      assert.equal(record.snapshot.wing.inflation, 1);
      assert.ok(record.snapshot.watch.calm >= 1);
      assert.ok(record.metrics!.recoveredAt - record.metrics!.handedAt < 30);
      assert.ok(record.metrics!.heightLoss < 150);
    }
  }
});
