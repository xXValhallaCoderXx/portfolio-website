import test from 'node:test';
import assert from 'node:assert/strict';
import { DIRECT_FRAME, LOG_FORMAT, MAX_LINK, MAX_STEPS, createRecorder, decodeLog, encodeLog, frameInput, inputFrame, isDirectFrame } from './recorder.ts';
import { RUN, createRunWorld, finishRun, startRun, stepBits, stepFrame } from './run-step.ts';
import { CLOUD_STRIKE, CLOUD_ZONE, createCloudbaseRun } from './cloudbase-state.ts';
import { createMeet } from './meet-state.ts';
import { createBells } from './bells.ts';
import { createStyle } from './meet-style.ts';
import { summariseRun } from './meet-sheet.ts';
import { replayLog } from './replay.ts';
import { runId } from '../../adapters/crypto/run-identity.service.ts';
import { SIM_VERSION } from './sim-version.ts';
import { settleFlight } from '../flight/flight.ts';
import type { RunLog } from './recorder.ts';

const meta = { simVersion: SIM_VERSION, seed: 7 };
const direct = (leftBrake: unknown = 0, rightBrake: unknown = leftBrake, extra = {}) => inputFrame({ controlMode: 'brakes', leftBrake, rightBrake, ...extra });
const fresh = () => startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells(), style: createStyle() }), meta.seed);
const textOf = (bytes: number[]): string => Buffer.from(bytes).toString('base64url');
const bytesOf = (text: string): number[] => [...Buffer.from(text, 'base64url')];

test('canonical brake frames quantize each hand once and preserve direct neutral and exact precedence', () => {
  const frame = direct(0.1234, 0.8765);
  const read = frameInput(frame);
  assert.equal(read.controlMode, 'brakes');
  assert.equal(read.leftBrake, Math.round(0.1234 * 255) / 255);
  assert.equal(read.rightBrake, Math.round(0.8765 * 255) / 255);
  assert.equal(inputFrame(read), frame);
  assert.notEqual(direct(), inputFrame({}));
  assert.equal(direct(), DIRECT_FRAME);
  assert.equal(frameInput(direct(0.9, 0.9, { ears: true, bar: true })).ears, true);
  assert.equal(frameInput(direct(0.9, 0.9, { ears: true })).leftBrake, 0);
  assert.equal(frameInput(direct(1 / 255, 0, { bar: true })).bar, false, 'even the smallest recorded pull beats the bar');
  assert.equal(frameInput(direct(0, 0, { bar: true })).bar, true);
  for (const malformed of [NaN, Infinity, -Infinity, null, '0.5', {}, Symbol('brake')]) {
    const released = frameInput(direct(malformed, malformed, { bar: true }));
    assert.deepEqual([released.leftBrake, released.rightBrake, released.bar], [0, 0, true]);
  }
  const bounded = frameInput(direct(-5, 5));
  assert.deepEqual([bounded.leftBrake, bounded.rightBrake], [0, 1]);
  const threshold = frameInput(direct(0.5 / 255, 0.49 / 255));
  assert.deepEqual([threshold.leftBrake, threshold.rightBrake], [1 / 255, 0]);
});

test('format 2 retains mixed controller modes, all brake depths and recorder storage beyond eight bits', () => {
  const recorder = createRecorder();
  const frames = [0, 0, direct(), direct(), direct(0.125, 0.875), direct(1, 0), direct(0, 1), direct(0, 0, { ears: true }), direct(0, 0, { bar: true }), 20];
  for (const frame of frames) recorder.push(frame);
  assert.ok(recorder.bits instanceof Uint32Array);
  assert.deepEqual([...recorder.bits], frames);
  const text = encodeLog(meta, recorder.bits, recorder.steps);
  const read = decodeLog(text);
  assert.equal(read.ok, true);
  assert.equal(read.log.format, LOG_FORMAT);
  assert.deepEqual([...read.log.bits], frames);
  assert.equal(encodeLog(read.log, read.log.bits, read.log.steps), text);
  assert.throws(() => encodeLog({ ...meta, format: 1 }, frames, frames.length), RangeError);
});

test('every step of a noisy ten-minute independent brake run fits the shared browser/server bound', () => {
  const frames = Uint32Array.from({ length: MAX_STEPS }, (_, i) => DIRECT_FRAME | (i & 0xffff));
  const text = encodeLog(meta, frames, frames.length);
  assert.ok(text.length <= MAX_LINK, `${text.length} <= ${MAX_LINK}`);
  assert.equal(MAX_STEPS, 36_000);
  const read = decodeLog(text);
  assert.equal(read.ok, true);
  assert.deepEqual(read.log.bits, frames);
  assert.equal(decodeLog(`${text}${'A'.repeat(MAX_LINK - text.length + 1)}`).why, 'long');
});

test('format 2 refuses noncanonical spans, unsupported tags, mixed configuration depths and truncated pairs', () => {
  const whole = bytesOf(encodeLog(meta, [direct(0.25, 0.5)], 1));
  const header = whole.slice(0, -4);
  const malformed = [
    [0, 32, 64, 128], // empty span
    [2, 32, 64, 128], // runs beyond declared steps
    [1, 35, 0, 0], // unknown action
    [1, 33, 1, 0], // ears cannot retain a brake
    [1, 34, 0, 1], // bar cannot retain a brake
    [0x81, 0, 32, 0, 0], // long-form span
  ];
  for (const tail of malformed) assert.deepEqual(decodeLog(textOf([...header, ...tail])), { ok: false, why: 'corrupt' });
  assert.deepEqual(decodeLog(textOf(whole.slice(0, -1))), { ok: false, why: 'truncated' });
  const repeated = bytesOf(encodeLog(meta, [direct(), direct()], 2));
  assert.deepEqual(decodeLog(textOf([...repeated.slice(0, -4), 1, 32, 0, 0, 1, 32, 0, 0])), { ok: false, why: 'corrupt' });
});

test('a mixed analog/digital live run replays to the exact complete meet sheet', () => {
  const world = fresh(), recorder = createRecorder();
  let ending = null;
  while (!ending) {
    const tick = world.steps;
    const frame = tick % 420 < 20 ? 0 : direct(0.10 + 0.06 * Math.sin(tick / 55), 0.10 - 0.06 * Math.sin(tick / 55));
    recorder.push(frame);
    ending = stepFrame(world, frame);
  }
  finishRun(world, ending);
  const sheet = summariseRun(world, ending);
  const read = decodeLog(encodeLog({ ...meta, total: sheet.total, peak: sheet.peak }, recorder.bits, recorder.steps));
  assert.ok(read.ok);
  assert.ok(read.log.bits.some(isDirectFrame));
  assert.ok(read.ok);
  assert.ok(read.log.bits.some((frame) => !isDirectFrame(frame)));
  assert.deepEqual(replayLog(read.log), sheet);
});

test('direct controls cannot bypass boundary or collapse authority and pumping requires two hands', () => {
  const world = fresh();
  Object.assign(world.g.pos, { x: CLOUD_ZONE.x + CLOUD_ZONE.r + 20, y: 1500, z: CLOUD_ZONE.z });
  settleFlight(world.g);
  stepFrame(world, direct(1, 0));
  assert.equal(world.controls.steered, true);
  assert.equal(world.controls.controlMode, 'legacy');
  assert.equal(world.controls.leftBrake, 0);
  world.g.pos.x = CLOUD_ZONE.x;
  world.sky.state.pilot.collapse = CLOUD_STRIKE.collapse;
  const hold = Math.ceil(CLOUD_STRIKE.pump.hold / RUN.step) + 2;
  for (let i = 0; i < hold; i++) stepFrame(world, direct(0.7));
  assert.equal(world.controls.locked, true);
  stepFrame(world, direct(0, 0.7));
  assert.equal(world.pump.n, 0, 'one hand held is not a release');
  stepFrame(world, direct());
  assert.equal(world.pump.n, 1, 'the qualified hold completes once the second hand releases');
  for (let i = 0; i < hold; i++) stepFrame(world, direct(0.7));
  for (const amount of [0.45, 0.3, 0.15, 0.05]) {
    stepFrame(world, direct(amount));
    assert.equal(world.pump.n, 1, 'gradual easing retains the hold without completing it early');
  }
  stepFrame(world, direct());
  assert.equal(world.pump.n, 2, 'gradual easing counts when both hands finally release');
  startRun(world, 9);
  stepBits(world, 0);
  assert.equal(world.controls.controlMode, 'legacy');
  assert.deepEqual([world.controls.leftBrake, world.controls.rightBrake], [0, 0]);
});

test('run identities preserve each direct depth and neutral mode', async () => {
  const make = (bits: number[]): RunLog => { const decoded = decodeLog(encodeLog(meta, bits, bits.length)); assert.ok(decoded.ok); return decoded.log; };
  assert.notEqual(await runId(make([0])), await runId(make([direct()])));
  assert.notEqual(await runId(make([direct(0.3, 0.7)])), await runId(make([direct(0.3 + 1 / 255, 0.7)])));
});
