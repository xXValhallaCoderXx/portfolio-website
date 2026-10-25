import type fixture from '../../test/fixtures/good-lift-recovery-chromium.json';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFlight, stepFlight, WING } from '../flight/flight.ts';
import { createSwingWatch } from '../coaching/swing-watch.ts';
import { createStyle } from './meet-style.ts';
import { decodeLog } from './recorder.ts';
import { SIM_VERSION } from './sim-version.ts';
import type { Vector3 } from '../flight/models.ts';

const receipt = JSON.parse(readFileSync(new URL('../../test/fixtures/good-lift-recovery-chromium.json', import.meta.url), 'utf8')) as typeof fixture;
// Flown in Chromium on the classic wing by tools/capture-goldens.ts (set recovery). Derived angles to
// the cross-engine precision of V8's inverse trig; bodies, observers and style exact.
const angles = new Set(['bank', 'pitch', 'rollRate', 'pitchRate', 'trackRate', 'yawRate', 'rollAcceleration', 'leftBrake', 'rightBrake', 'leftBrakeTarget', 'rightBrakeTarget']);
const normalize = <T>(value: T): T => JSON.parse(JSON.stringify(value, (key, item) =>
  angles.has(key) && typeof item === 'number' ? Math.round(item * 1e11) / 1e11 : item));
for (const record of receipt.records.filter((r): r is typeof r & {pureFlight: true; origin: Vector3} => !!r.pureFlight)) {
  test(`Chromium ${record.scenario} recovery, ${record.delay}s reactions: complete physical replay`, () => {
    assert.match(receipt.engine, /^Chromium /); assert.equal(record.simVersion, SIM_VERSION);
    const read = decodeLog(record.link); assert.ok(read.ok);
    const g = createFlight({ ...record.origin }), watch = createSwingWatch(), style = createStyle(), controls = {};
    const world = { g, watch, controls };
    for (const bits of read.log.bits) {
      const ears = (bits & 12) === 12;
      Object.assign(controls, { turn: Number(!!(bits & 2)) - Number(!!(bits & 1)), ears,
        deepBrake: !ears && !!(bits & 16), brake: !ears && !!(bits & 20), bar: !ears && !!(bits & 8) });
      stepFlight(g, controls, {}, 1 / 60); watch.step(1 / 60, g, false, controls); style.step(1 / 60, world);
    }
    assert.deepEqual(normalize({ g, watch: watch.state, style: style.state }), normalize(record.snapshot));
    assert.equal(g.wingPhase, WING.flying); assert.equal(g.inflation, 1); assert.ok(watch.state.calm >= 1);
    assert.equal(style.state.total, 0); assert.ok(record.metrics.seconds! <= 30); assert.ok(record.metrics.heightLoss! <= 150);
    assert.ok(record.phases.some((p) => (p as {wing?: string}).wing === (record.scenario === 'stall' ? WING.backfly : WING.frontal)));
  });
}
