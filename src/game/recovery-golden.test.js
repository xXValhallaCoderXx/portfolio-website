import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFlight, stepFlight, WING } from './flight.js';
import { createSwingWatch } from './swing-watch.js';
import { createStyle } from './meet-style.js';
import { decodeLog } from './recorder.js';
import { SIM_VERSION } from './sim-version.js';

const receipt = JSON.parse(readFileSync(new URL('./fixtures/good-lift-v13-recovery-chromium.json', import.meta.url), 'utf8'));
const angles = new Set(['bank', 'pitch', 'rollRate', 'pitchRate', 'trackRate', 'yawRate', 'rollAcceleration']);
const normalize = value => JSON.parse(JSON.stringify(value, (key, item) => angles.has(key) && typeof item === 'number'
  ? Math.round(item * 1e11) / 1e11 : item));

for (const record of receipt.records.filter(r => r.pureFlight)) {
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
    assert.equal(style.state.total, 0); assert.ok(record.metrics.seconds <= 30); assert.ok(record.metrics.heightLoss <= 150);
    assert.ok(record.phases.some(p => p.wing === (record.scenario === 'stall' ? WING.backfly : WING.frontal)));
  });
}
