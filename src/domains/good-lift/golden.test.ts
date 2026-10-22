import type receiptFixture from '../../test/fixtures/good-lift-chromium.json';
import type lessonFixture from '../../test/fixtures/good-lift-lessons-chromium.json';
import type { FlightInput, Vector3 } from '../flight/models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeLog } from './recorder.ts';
import { replayLog } from './replay.ts';
import { createFlight, stepFlight } from '../flight/flight.ts';
import { createSwingWatch } from '../coaching/swing-watch.ts';
import { createStyle } from './meet-style.ts';
import { SIM_VERSION } from './sim-version.ts';
import { sampleAtmosphere } from '../flight/atmosphere.ts';

// These inputs AND sheets were computed in Chromium, then replayed in Node. Their source receipt
// records the engine, timestamp and a source digest checked before/after recording. The ignored
// .artifacts/fun-acro-v4/capture-all.mjs reproduces the capture from the Vite source
// server, on an empty page without HMR or rendering clocks. No Node-generated expected sheets.
const receipt = JSON.parse(readFileSync(new URL('../../test/fixtures/good-lift-chromium.json', import.meta.url), 'utf8')) as typeof receiptFixture;

test('actual Chromium keyboard runs replay to exactly the same complete Node sheets and barograms', () => {
  assert.match(receipt.engine, /^Chromium /);
  const runs = receipt.records.filter((record) => !record.pureFlight);
  assert.ok(runs.filter((run) => run.scenario === 'soaring').length >= 3, 'three complete soaring skies');
  assert.ok(runs.some((run) => run.scenario === 'ears'), 'also cover ears and reopening throughout a complete flight');
  for (const run of runs) {
    assert.match(run.source, /^Chromium computed/);
    assert.equal(run.simVersion, SIM_VERSION, 'record fresh browser receipts when the simulation version changes');
    const read = decodeLog(run.link);
    assert.ok(read.ok, `${run.name}: ${read.why}`);
    const sheet = replayLog(read.log); assert.ok(!('error' in sheet));
    assert.deepEqual(sheet, run.sheet, `${run.name}: every score, event, step and Float32 trace sample`);
    if (run.scenario === 'soaring') {
      assert.equal(sheet.steps, 600 * 60, `${run.name}: slow fog leaves a complete skilled soaring run`);
      assert.equal(sheet.reason, 'time');
    } else {
      assert.equal(run.scenario, 'ears');
      assert.equal(sheet.steps, 600 * 60, 'a complete skilled flight continues after reopening');
      assert.equal(sheet.reason, 'time', 'slow fog preserves room to continue soaring after reopening');
      const first = read.log.bits.findIndex((bits) => (bits & 12) === 12);
      assert.ok(first >= 75 * 60 && first <= 75 * 60 + 1, 'elapsed-time rounding allows one boundary tick');
      assert.ok(read.log.bits.slice(first, first + 180).every((bits) => (bits & 12) === 12));
      assert.ok(read.log.bits.slice(first + 180, first + 300).every((bits) => (bits & 12) !== 12));
    }
  }
});
test('Chromium maneuvers and stable recoveries have identical physical and observer results in Node', () => {
  const moves = receipt.records.filter((item): item is typeof item & {pureFlight: true; origin: Vector3} => !!item.pureFlight);
  assert.deepEqual(moves.map((move) => move.kind), ['orbit', 'wingover', 'pitch']);
  for (const record of moves) {
    assert.match(record.source, /^Chromium computed/);
    const read = decodeLog(record.link); assert.ok(read.ok, record.name!);
    assert.equal(read.log.simVersion, SIM_VERSION);
    assert.equal(read.log.steps, record.tick);
    const g = createFlight({ ...record.origin }), watch = createSwingWatch(), style = createStyle();
    const controls: FlightInput = { turn: 0, brake: false, bar: false, ears: false }, world = { g, watch, controls };
    let stallFrames = 0;
    for (const bits of read.log.bits) {
      const left = !!(bits & 1), right = !!(bits & 2), ears = (bits & 12) === 12;
      controls.turn = Number(right) - Number(left); controls.ears = ears;
      controls.deepBrake = !ears && !!(bits & 16);
      controls.brake = !ears && (!!(bits & 4) || controls.deepBrake); controls.bar = !ears && !controls.brake && ((left && right) || !!(bits & 8));
      stepFlight(g, controls, {}, 1 / 60);
      watch.step(1 / 60, g, false, controls); style.step(1 / 60, world);
      stallFrames += g.stall > 0 ? 1 : 0;
    }
    assert.equal(g.loops, record.kind === 'orbit' ? 1 : 0);
    assert.equal(stallFrames, 0); assert.equal(watch.state.breaks, 0);
    assert.ok(style.state.total > 0 && style.state.landed > 0, 'a completed move banks only after recovery');
    assert.ok(watch.state.calm >= 1); assert.ok(g.pos.y < record.origin!.y, 'maneuvers spend altitude');
    const snapshot = { loops: g.loops, pos: { ...g.pos }, vel: { ...g.pilot.vel }, canopy: { ...g.canopy.pos },
      canopyVel: { ...g.canopy.vel }, quaternion: { ...g.canopy.q }, omega: { ...g.canopy.omega },
      bank: Math.round(g.bank * 1e12) / 1e12, pitch: Math.round(g.pitch * 1e12) / 1e12, energy: g.physical.energy, stallFrames,
      watch: { breaks: watch.state.breaks, moves: watch.state.moves, kind: watch.state.moveKind, band: watch.state.moveBand, calm: watch.state.calm },
      style: { total: style.state.total, pending: style.state.pending, landed: style.state.landed, lost: style.state.lost,
        loops: style.state.mostLoops, wingovers: style.state.wingovers, pitch: style.state.pitch } };
    // Derived inverse-trig angles use 1e-12 rad precision across V8 platforms; authoritative
    // bodies, velocities, quaternion, energy and observers above retain exact equality.
    // The receipt's JSON format writes both signed zeros as 0. Preserve every other number exactly.
    assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), record.snapshot, record.name);
  }
});


test('sixteen Chromium lessons replay real circling, setup, matching maneuvers and style banks in Node', () => {
  const lessons = JSON.parse(readFileSync(new URL('../../test/fixtures/good-lift-lessons-chromium.json', import.meta.url), 'utf8')) as typeof lessonFixture;
  assert.match(lessons.engine, /^Chromium /); assert.equal(lessons.records.length, 16);
  const telemetry = new Set(['bank', 'pitch', 'rollRate', 'pitchRate', 'trackRate', 'yawRate', 'rollAcceleration', 'leftBrake', 'rightBrake', 'leftBrakeTarget', 'rightBrakeTarget']);
  const normalize = <T>(value: T): T => JSON.parse(JSON.stringify(value, (key, item) => telemetry.has(key) && typeof item === 'number'
    ? Math.round(item * 1e11) / 1e11 : item));
  for (const record of lessons.records) {
    assert.equal(record.simVersion, SIM_VERSION);
    const read = decodeLog(record.link); assert.ok(read.ok); assert.equal(read.log.steps, record.steps);
    const g = createFlight({ ...record.origin }), watch = createSwingWatch(), style = createStyle();
    const controls = {}, world = { g, watch, controls }, air = {};
    for (const bits of read.log.bits) {
      const ears = (bits & 12) === 12;
      Object.assign(controls, { turn: Number(!!(bits & 2)) - Number(!!(bits & 1)), ears,
        deepBrake: !ears && !!(bits & 16), brake: !ears && !!(bits & 20), bar: !ears && !!(bits & 8) });
      sampleAtmosphere(g.pos, { windX: 0, windZ: 0, thermals: [record.source] }, air);
      stepFlight(g, controls, air, 1 / 60); watch.step(1 / 60, g, false, controls); style.step(1 / 60, world);
    }
    assert.deepEqual(normalize({ g, watch: watch.state, style: style.state }), normalize(record.snapshot));
    assert.equal(watch.state.moves, 1); assert.equal(watch.state.moveKind, record.kind === 'pitch' ? 1 : 2);
    assert.equal(watch.state.breaks, 0); assert.equal(style.state.lost, 0); assert.equal(style.state.landed, 1);
    assert.ok(watch.state.calm >= 1 && style.state.total > 0);
    assert.ok(record.learned.includes(record.kind), 'the browser saved completion immediately at banking');
    assert.equal(record.keptBest.score, 123, 'learning does not replace competitive progress');
    assert.match(record.feedback, new RegExp(`\\+${style.state.said} STYLE`));
  }
});
