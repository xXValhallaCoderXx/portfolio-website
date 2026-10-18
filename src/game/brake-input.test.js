import test from 'node:test';
import assert from 'node:assert/strict';
import { BRAKE_TAP_WINDOW, createBrakeInput } from './brake-input.js';

const tick = 1 / 60;
function controls() {
  const gesture = createBrakeInput(), holders = new Map();
  const raw = () => ({ held: holders.size > 0, forceDeep: [...holders.values()].some(Boolean) });
  return { gesture, press(owner, down, forceDeep = false) {
    if (down) holders.set(owner, forceDeep); else holders.delete(owner);
    gesture.edge(raw().held, raw());
  }, step(dt = tick, active = true) { return { ...gesture.step(dt, { ...raw(), active }) }; } };
}

test('the first brake press is immediate and a long hold never deepens automatically', () => {
  const c = controls(); c.press('space', true);
  assert.deepEqual(c.step(), { brake: true, deepBrake: false });
  for (let i = 0; i < 600; i++) assert.equal(c.step().deepBrake, false);
  c.press('space', false); c.step(); c.press('space', true);
  assert.equal(c.step().deepBrake, false, 'releasing a long hold is not a first tap');
});

test('a tap, release and held second press deepen within the inclusive 300ms fixed-step window', () => {
  const c = controls(); c.press('touch1', true); c.step(tick);
  c.press('touch1', false); c.step(BRAKE_TAP_WINDOW - tick);
  c.press('touch2', true);
  assert.deepEqual(c.step(), { brake: true, deepBrake: true });
  for (let i = 0; i < 180; i++) assert.equal(c.step().deepBrake, true);
  c.press('touch2', false); assert.deepEqual(c.step(), { brake: false, deepBrake: false });
  c.press('space', true); assert.equal(c.step().deepBrake, false, 'after a deep release the next catch is normal');
  const late = controls(); late.press('space', true); late.step(tick);
  late.press('space', false); late.step(BRAKE_TAP_WINDOW);
  late.press('space', true); assert.equal(late.step().deepBrake, false, 'a second press one tick late stays normal');
});

test('queued subtick taps survive render timing, while repeated down edges do not count as taps', () => {
  const c = controls(); c.press('space', true); c.press('space', false); c.press('space', true);
  assert.equal(c.step().deepBrake, true);
  const repeat = controls(); repeat.press('space', true); repeat.step();
  for (let i = 0; i < 30; i++) { repeat.press('space', true); assert.equal(repeat.step().deepBrake, false); }
});

test('multiple holders release only after the final owner; X requests deep without arming the gesture', () => {
  const c = controls(); c.press('space', true); c.step(); c.press('touch', true); c.step();
  c.press('space', false); assert.deepEqual(c.step(), { brake: true, deepBrake: false });
  c.press('X', true, true); assert.deepEqual(c.step(), { brake: true, deepBrake: true });
  c.press('X', false); assert.deepEqual(c.step(), { brake: true, deepBrake: false }, 'releasing X preserves another normal holder');
  c.press('touch', false); assert.deepEqual(c.step(), { brake: false, deepBrake: false });
  c.press('space', true); assert.equal(c.step().deepBrake, false, 'forced-deep input cannot become a tap');
});

test('pause, blur, cancel and restart reset history and require a held control to be released', () => {
  for (const interruption of ['pause', 'blur', 'cancel', 'restart']) {
    const c = controls(); c.press('space', true); c.step(); c.press('space', false); c.step();
    c.gesture.reset(); c.press('space', true);
    assert.equal(c.step().deepBrake, false, interruption + ' cannot preserve a first tap');
    c.gesture.reset({ held: true });
    assert.equal(c.step().deepBrake, false);
    c.press('space', false); c.step(); c.press('space', true);
    assert.equal(c.step().deepBrake, false, interruption + ' release is not a first tap');
    c.press('space', false); c.step(); c.press('space', true);
    assert.equal(c.step().deepBrake, true, 'a fresh complete gesture still works');
  }
});

test('events arriving while inactive cannot accumulate into a deep command on resume', () => {
  const g = createBrakeInput();
  g.edge(true, { active: false }); g.edge(false, { active: false }); g.edge(true, { active: false });
  assert.equal(g.step(tick, { held: true }).deepBrake, false);
  g.edge(false); g.step(tick, { held: false }); g.edge(true);
  assert.equal(g.step(tick, { held: true }).deepBrake, false);
});
