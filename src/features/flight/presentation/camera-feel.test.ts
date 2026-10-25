import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_FEEL, lensFor, pullFor, tiltFor } from './camera-feel.ts';
import { LOAD_READOUT, createLoadFeel, loadReadout } from './load-feel.ts';

test('the lens widens only past the wing\'s own trim, smoothly, to a cap, and never for less motion', () => {
  assert.equal(lensFor(11, 11, false), 0);
  assert.equal(lensFor(9, 11, false), 0, 'slow is not fast');
  let last = 0;
  for (let over = 0.5; over <= 9; over += 0.5) {
    const lens = lensFor(11 + over, 11, false);
    assert.ok(lens > last);
    last = lens;
  }
  assert.equal(lensFor(40, 11, false), CAMERA_FEEL.lens);
  assert.ok(lensFor(12.22 + 4.9, 12.22, false) > lensFor(11.5 + 3.8, 11.5, false), 'the D on its bar widens it more than today\'s wing on its own');
  assert.equal(lensFor(30, 11, true), 0);
});

test('the camera falls back as the lines load, from 1.3 g, and the horizon tilts a quarter of the bank to 10°', () => {
  assert.equal(pullFor(1, false), 0);
  assert.equal(pullFor(1.3, false), 0);
  assert.ok(pullFor(2, false) > 0 && pullFor(2, false) < CAMERA_FEEL.back);
  assert.equal(pullFor(4, false), CAMERA_FEEL.back);
  assert.equal(pullFor(4, true), 0);
  assert.equal(tiltFor(0.2, false, false), -0.05);
  assert.equal(tiltFor(1.5, false, false), -Math.PI / 18);
  assert.equal(tiltFor(-1.5, false, false), Math.PI / 18);
  assert.equal(tiltFor(1, true, false), 0, 'round a loop the horizon holds');
  assert.equal(tiltFor(1, false, true), 0);
});

test('the load is eased the same at any frame rate, and a new flight starts at 1 g', () => {
  const a = createLoadFeel(), b = createLoadFeel();
  for (let i = 0; i < 30; i++) a.step(3, 1 / 30);
  for (let i = 0; i < 144; i++) b.step(3, 1 / 144);
  assert.ok(Math.abs(a.value - b.value) < 1e-12);
  assert.ok(Math.abs(a.value - (1 + 2 * (1 - Math.exp(-2)))) < 1e-12);
  a.step(NaN, 1 / 60); a.step(9, 0);
  assert.ok(Number.isFinite(a.value));
  a.reset();
  assert.equal(a.value, 1);
});

test('the G readout shows from 1.4 g, from 1.6 g on a phone, and stays until the load is back near 1 g', () => {
  assert.equal(loadReadout(1, false, false), '');
  assert.equal(loadReadout(1.39, false, false), '');
  assert.equal(loadReadout(LOAD_READOUT.show, false, false), '1.4 g');
  assert.equal(loadReadout(2.84, false, false), '2.8 g');
  assert.equal(loadReadout(1.5, true, false), '', 'a phone\'s line waits for more');
  assert.equal(loadReadout(LOAD_READOUT.phone, true, false), '1.6 g');
  assert.equal(loadReadout(1.3, false, true), '1.3 g', 'once shown it stays while the load eases off');
  assert.equal(loadReadout(1.3, true, true), '1.3 g');
  assert.equal(loadReadout(1.19, false, true), '');
  for (const nonsense of [NaN, Infinity]) assert.equal(loadReadout(nonsense, false, true), '');
});
