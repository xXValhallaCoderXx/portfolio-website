import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrakeInput, handleBrake, handleProgress, keyboardBrakes } from './brake-input.ts';
import { inputFrame, frameInput } from '../good-lift/recorder.ts';

const key = (...codes: string[]) => keyboardBrakes(new Set(codes));
test('keyboard turns, bilateral catches and thermal turns resolve one direct brake pair', () => {
  assert.deepEqual(key('KeyA'), { leftBrake: 0.3, rightBrake: 0 });
  assert.deepEqual(key('ArrowRight'), { leftBrake: 0, rightBrake: 0.3 });
  for (const codes of [['Space'], ['KeyS'], ['ArrowDown'], ['KeyA', 'KeyD']]) assert.deepEqual(key(...codes), { leftBrake: 0.6, rightBrake: 0.6 });
  assert.deepEqual(key('Space', 'KeyA'), { leftBrake: 0.5, rightBrake: 0.2 });
  assert.deepEqual(key('KeyS', 'ArrowRight'), { leftBrake: 0.2, rightBrake: 0.5 });
  assert.deepEqual(key('ShiftLeft', 'KeyD'), { leftBrake: 0, rightBrake: 1 });
  assert.deepEqual(key('ShiftRight', 'Space'), { leftBrake: 1, rightBrake: 1 });
  assert.deepEqual(key('ShiftLeft'), { leftBrake: 0, rightBrake: 0 });
  assert.deepEqual(key('KeyQ'), { leftBrake: 0.82, rightBrake: 0 });
  assert.deepEqual(key('KeyE'), { leftBrake: 0, rightBrake: 0.82 });
  assert.deepEqual(key('ShiftLeft', 'KeyE'), { leftBrake: 0, rightBrake: 1 });
  assert.deepEqual(key('KeyW'), { leftBrake: 0.2, rightBrake: 0.2 });
  assert.deepEqual(key('KeyW', 'KeyA'), { leftBrake: 0.5, rightBrake: 0.2 });
});
test('progressive handles have a broad working range, wingover depth and a deliberate full pull', () => {
  assert.equal(handleBrake(0.06), 0); assert.equal(handleBrake(0.68), 0.65);
  assert.ok(Math.abs(handleBrake(0.88) - 0.82) < 1e-12); assert.equal(handleBrake(1), 1);
  assert.equal(handleBrake(Infinity), 0);
  for (const brake of [0, 0.1, 0.3, 0.5, 0.6, 0.65, 0.82, 1]) assert.ok(Math.abs(handleBrake(handleProgress(brake)) - brake) < 1e-12);
});
const pointer = (pointerId: number, clientY = 100) => ({ pointerId, clientY, clientX: 30, pointerType: 'touch', button: 0 });
test('each hand captures its own pointer, releasing one leaves the other hand held', () => {
  const input = createBrakeInput();
  assert.equal(input.startHand('left', pointer(1)), true); assert.equal(input.startHand('right', pointer(2)), true);
  assert.equal(input.startHand('left', pointer(3)), false); assert.equal(input.startHand('right', pointer(1)), false);
  input.moveHand(pointer(1, 240)); input.moveHand(pointer(2, 170));
  assert.equal(input.state.leftBrake, 1); assert.ok(input.state.rightBrake > 0);
  assert.equal(input.moveHand(pointer(3, 240)), false);
  input.endHand(1); assert.equal(input.state.leftBrake, 0); assert.ok(input.state.rightBrake > 0);
  assert.equal(input.state.source, 'handles'); input.endHand(2); assert.equal(input.state.source, null);
});
test('source ownership prevents stale key or pointer demand from reappearing', () => {
  const input = createBrakeInput();
  input.keyDown('KeyA'); input.keyDown('KeyA'); assert.equal(input.state.leftBrake, 0.3);
  input.startHand('right', pointer(2)); assert.equal(input.state.leftBrake, 0);
  assert.equal(input.keyDown('Space'), false); assert.equal(input.startMouse(), false);
  input.moveHand(pointer(2, 240)); input.endHand(2); assert.equal(input.keyUp('KeyA'), false);
  assert.equal(input.state.leftBrake, 0); assert.equal(input.state.rightBrake, 0);
  input.keyDown('Space'); assert.equal(input.startMouse(), true); assert.equal(input.state.leftBrake, 0);
  input.moveMouse(0.4, 0.2); assert.equal(input.startHand('left', pointer(1)), false);
  input.endMouse(); assert.equal(input.keyUp('Space'), false);
  input.startHand('left', pointer(1)); input.moveHand(pointer(1, 240)); input.reset();
  assert.equal(input.state.source, null); assert.equal(input.hands.left.pointerId, null); assert.equal(input.state.leftBrake, 0);
});
test('a mouse-operated handle keeps the compact desktop presentation', () => {
  const input = createBrakeInput(); input.state.device = 'keyboard';
  input.startHand('left', { ...pointer(1), pointerType: 'mouse' });
  assert.equal(input.state.source, 'handles'); assert.equal(input.state.device, 'keyboard');
  input.endHand(1); input.startHand('left', pointer(2)); assert.equal(input.state.device, 'touch');
});
test('handle and keyboard demands retain the same fixed-step replay precision', () => {
  const input = createBrakeInput(); input.startHand('left', pointer(1));
  for (const target of [0.3, 0.6, 0.82, 1]) {
    input.moveHand(pointer(1, 100 + 140 * handleProgress(target)));
    const sample = (leftBrake: number) => inputFrame({ controlMode: 'brakes', leftBrake, rightBrake: 0 });
    assert.deepEqual(frameInput(sample(input.state.leftBrake)), frameInput(sample(target)));
  }
});
