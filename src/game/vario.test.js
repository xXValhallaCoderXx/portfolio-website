import test from 'node:test';
import assert from 'node:assert/strict';
import { createVario, varioTone } from './vario.js';

test('the shared soaring beep clearly separates a weak climb from a strong0–5m/s climb', () => {
  let last = varioTone(0.5, true);
  for (let vy = 1; vy <= 5; vy += 0.5) {
    const tone = varioTone(vy, true);
    assert.ok(tone.pitch > last.pitch);
    assert.ok(tone.gap < last.gap);
    assert.deepEqual(tone, varioTone(vy, false));
    last = tone;
  }
  const weak = varioTone(0.5, true), strong = varioTone(5, true);
  assert.ok(strong.pitch - weak.pitch > 300 && weak.gap - strong.gap > 0.25);
  assert.ok(varioTone(100, true).pitch < 2200);
});
test('presentation filters a brief swing and settles to the actual net climb at any render rate', () => {
  const a = createVario(), b = createVario();
  a.reset(-1.3); b.reset(-1.3);
  for (let i = 0; i < 30; i++) a.step(3, 1 / 30);
  for (let i = 0; i < 144; i++) b.step(3, 1 / 144);
  assert.ok(Math.abs(a.value - b.value) < 1e-12);
  for (let i = 0; i < 300; i++) a.step(3, 1 / 60);
  assert.ok(Math.abs(a.value - 3) < 0.001);
  const before = a.value;
  a.step(-8, 0);
  assert.equal(a.value, before);
  a.reset(-1.3);
  assert.equal(a.value, -1.3, 'a new flight never inherits the previous climb');
});
test('tone output reuses its supplied object and invalid samples stay finite', () => {
  const out = { pitch: 0, gap: 0 }, filter = createVario();
  assert.equal(varioTone(3, true, out), out);
  for (const value of [NaN, Infinity]) { filter.step(value, 1 / 60); varioTone(value, true, out); }
  assert.ok(Number.isFinite(filter.value) && Number.isFinite(out.pitch) && Number.isFinite(out.gap));
});
