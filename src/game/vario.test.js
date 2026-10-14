import test from 'node:test';
import assert from 'node:assert/strict';
import { varioTone } from './vario.js';

test('over the fjord the vario beeps as it always has, at its fastest by 6 m/s', () => {
  for (const vy of [0.5, 2, 4, 6.2, 10]) {
    const tone = varioTone(vy, false);
    assert.equal(tone.pitch, 620 + 85 * vy);
    assert.equal(tone.gap, Math.max(0.11, 0.42 - vy * 0.05));
  }
  assert.equal(varioTone(6.2, false).gap, varioTone(12, false).gap, 'no faster above 6.2 m/s');
});

test('in a run the beep keeps quickening and rising all the way up a thermal\'s core', () => {
  let last = varioTone(0.5, true);
  for (let vy = 1; vy <= 28; vy += 0.5) {
    const tone = varioTone(vy, true);
    assert.ok(tone.pitch > last.pitch, `pitch rises at ${vy} m/s`);
    assert.ok(tone.gap < last.gap, `and the beeps come quicker at ${vy} m/s`);
    last = tone;
  }
  // A swing across a circle in the core, 18 to 25 m/s, is heard in both.
  const off = varioTone(18, true);
  const on = varioTone(25, true);
  assert.ok(on.pitch - off.pitch > 300 && off.gap - on.gap > 0.07);
  assert.ok(varioTone(28, true).pitch < 2200, 'and it stays a beep, not a whistle');
});

test('the tone is written into the object it is handed, so a frame makes nothing', () => {
  const out = { pitch: 0, gap: 0 };
  assert.equal(varioTone(3, true, out), out);
});
