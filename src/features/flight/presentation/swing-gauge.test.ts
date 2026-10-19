import test from 'node:test';
import assert from 'node:assert/strict';
import { CUES, swingGauge } from './swing-gauge.ts';
const wing = () => ({ bank: 0, rollRate: 0, pitch: 0, pitchRate: 0, turn: 0, loop: 0, stall: 0, stallLoad: 0, tuck: 0, speed: 11.5, tension: 900 });
const watch = () => ({ clock: 10, topAt: -Infinity, frontAt: -Infinity, backAt: -Infinity, topSide: 0, top: 0, front: 0, rollAcceleration: 0, linking: 0 });
test('a surge asks for a check in either mode, and a stall always asks for release', () => {
  const g = wing(); Object.assign(g, { pitch: -0.6, pitchRate: -0.8 });
  assert.equal(swingGauge(g, watch(), false, 1 / 60, {}).cue, CUES.catch);
  g.stall = 1; assert.equal(swingGauge(g, watch(), true, 1 / 60, {}).cue, CUES.release);
});
test('a decelerating steep swing foretells the actual reversal', () => {
  const g = wing(); Object.assign(g, { bank: 1, rollRate: 0.5, turn: 1 });
  const w = watch(); w.rollAcceleration = -1.5;
  const out = swingGauge(g, w, true, 1 / 60, {});
  assert.equal(out.coming, CUES.left); assert.equal(out.cue, 0);
  w.rollAcceleration = -4;
  assert.equal(swingGauge(g, w, true, 1 / 60, {}).cue, CUES.left);
});
test('an inversion never prescribes artificial bar/brake rhythm', () => {
  const g = wing(); Object.assign(g, { loop: 1, loopAngle: Math.PI, bank: 2 });
  const out = swingGauge(g, watch(), true, 1 / 60, {});
  assert.equal(out.mode, 'loop'); assert.equal(out.cue, 0); assert.equal(out.round, 36);
});
test('sampling the coach cannot mutate physics or its observer', () => {
  const g = wing(); const w = watch(); const before = JSON.stringify([g, w]);
  for (let n = 0; n < 100; n++) swingGauge(g, w, true, 1 / 60, {});
  assert.equal(JSON.stringify([g, w]), before);
});
