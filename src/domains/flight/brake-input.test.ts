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
  // The helicopter's chord: a full stall's keys with one side added hold that side full and ease the other.
  assert.deepEqual(key('ShiftLeft', 'KeyS', 'KeyA'), { leftBrake: 1, rightBrake: 0.6 });
  assert.deepEqual(key('ShiftRight', 'Space', 'ArrowRight'), { leftBrake: 0.6, rightBrake: 1 });
  assert.deepEqual(key('ShiftLeft', 'KeyQ', 'KeyE'), { leftBrake: 1, rightBrake: 1 });
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

test('Shift builds each keyboard pull from its ordinary depth over 0.45 simulation seconds', () => {
  const input = createBrakeInput();
  input.keyDown('ShiftLeft'); input.keyDown('KeyA');
  assert.equal(input.state.leftBrake, .3, 'key events set the ordinary starting demand');
  assert.equal(input.state.rightBrake, 0);
  for (const dt of [0, -1, NaN, Infinity]) input.step(dt);
  assert.equal(input.state.leftBrake, .3, 'no elapsed simulation means no buildup');
  input.step(.1125); assert.ok(Math.abs(input.state.leftBrake - .409375) < 1e-12);
  input.keyDown('KeyA'); input.keyDown('ShiftLeft');
  assert.ok(Math.abs(input.state.leftBrake - .409375) < 1e-12, 'repeat events do not advance or restart the curve');
  input.step(.1125); assert.ok(Math.abs(input.state.leftBrake - .65) < 1e-12);
  input.step(.225); assert.equal(input.state.leftBrake, 1);
  input.step(5); assert.equal(input.state.leftBrake, 1);
  input.keyUp('ShiftLeft'); assert.equal(input.state.leftBrake, .3, 'Shift release immediately restores ordinary control');
  input.keyUp('KeyA'); assert.equal(input.state.leftBrake, 0);
  input.keyDown('KeyE'); input.keyDown('ShiftRight');
  assert.equal(input.state.rightBrake, .82, 'the stronger ordinary Q/E pull remains the starting depth');
  input.step(.225); assert.ok(Math.abs(input.state.rightBrake - .91) < 1e-12);
});

test('easing one hand out of a held full stall keeps the other full and eases it at once', () => {
  const input = createBrakeInput(); input.keyDown('ShiftLeft'); input.keyDown('KeyS');
  input.step(.45); assert.equal(input.state.leftBrake, 1); assert.equal(input.state.rightBrake, 1);
  input.keyDown('KeyA');
  assert.equal(input.state.leftBrake, 1, 'the held side stays full');
  assert.equal(input.state.rightBrake, .6, 'the other eases to the chord');
  input.step(.45); assert.equal(input.state.rightBrake, .6);
  input.keyUp('KeyA'); assert.equal(input.state.rightBrake, .6, 'letting the side go starts the eased hand\'s pull again');
  input.step(.45); assert.equal(input.state.rightBrake, 1);
});

test('new full-pull hands have independent clocks and release or reversal clears their old buildup', () => {
  const input = createBrakeInput(); input.keyDown('KeyA'); input.keyDown('ShiftLeft');
  input.step(.225); const held = input.state.leftBrake;
  input.keyDown('KeyD');
  assert.equal(input.state.leftBrake, held, 'adding a hand does not disturb the hand already pulling');
  assert.equal(input.state.rightBrake, .6, 'the added hand starts at its ordinary bilateral depth');
  input.step(.225); assert.equal(input.state.leftBrake, 1);
  assert.ok(Math.abs(input.state.rightBrake - .8) < 1e-12);
  input.keyUp('KeyA'); assert.equal(input.state.leftBrake, 0);
  input.keyDown('KeyA'); assert.equal(input.state.leftBrake, .6, 'a released hand starts a fresh pull');
  input.keyUp('KeyA'); input.keyUp('KeyD');
  assert.equal(input.state.leftBrake, 0); assert.equal(input.state.rightBrake, 0);
  input.keyDown('KeyD'); assert.equal(input.state.rightBrake, .3, 'reversing or reengaging cannot reuse full depth');
  input.step(.225); assert.ok(Math.abs(input.state.rightBrake - .65) < 1e-12);
  input.keyDown('ShiftRight'); input.keyUp('ShiftLeft'); input.step(.225);
  assert.equal(input.state.rightBrake, 1, 'either Shift key keeps the existing pull alive');
  input.keyUp('ShiftRight'); assert.equal(input.state.rightBrake, .3);
});

test('ordinary keyboard, mouse and thumb controls stay immediate and source changes discard Shift buildup', () => {
  const input = createBrakeInput();
  input.keyDown('Space'); assert.equal(input.state.leftBrake, .6); assert.equal(input.state.rightBrake, .6);
  input.step(.225); assert.equal(input.state.leftBrake, .6);
  input.keyUp('Space'); input.keyDown('KeyA'); input.keyDown('ShiftLeft'); input.step(.225);
  input.startMouse(); input.moveMouse(1, .2); input.step(.225);
  assert.equal(input.state.leftBrake, 1); assert.equal(input.state.rightBrake, .2);
  input.endMouse(); assert.equal(input.keyUp('ShiftLeft'), false);
  input.keyDown('KeyA'); input.keyDown('ShiftLeft');
  assert.equal(input.state.leftBrake, .3, 'mouse ownership discarded the preceding ramp');
  input.step(.225); input.startHand('right', pointer(1)); input.moveHand(pointer(1, 240)); input.step(.225);
  assert.equal(input.state.leftBrake, 0); assert.equal(input.state.rightBrake, 1, 'touch full pull has no keyboard ramp');
  input.endHand(1); input.keyDown('KeyA'); input.keyDown('ShiftLeft'); input.step(.225); input.reset();
  input.step(5); assert.equal(input.state.leftBrake, 0); assert.equal(input.state.source, null);
  input.keyDown('ShiftLeft'); input.keyDown('KeyA'); input.step(.225);
  assert.ok(Math.abs(input.state.leftBrake - .65) < 1e-12, 'pause/restart reset has no retained buildup');
});

test('only fixed-step samples advance the issued and recorded Shift curve regardless of event repeats', () => {
  const clean = createBrakeInput(), repeated = createBrakeInput();
  for (const input of [clean, repeated]) { input.keyDown('KeyD'); input.keyDown('ShiftLeft'); }
  const sample = (input: ReturnType<typeof createBrakeInput>) => inputFrame({ controlMode: 'brakes', ...input.state });
  const frames = [];
  for (let tick = 0; tick < 27; tick++) {
    for (let read = 0; read < 10; read++) {
      repeated.keyDown('KeyD'); repeated.keyDown('ShiftLeft');
      assert.equal(repeated.state.rightBrake, clean.state.rightBrake, 'events and reads cannot consume ramp time');
    }
    clean.step(1 / 60); repeated.step(1 / 60);
    assert.deepEqual(sample(repeated), sample(clean)); frames.push(sample(clean));
  }
  const chunked = createBrakeInput(); chunked.keyDown('KeyD'); chunked.keyDown('ShiftLeft'); chunked.step(.45);
  assert.equal(repeated.state.rightBrake, chunked.state.rightBrake);
  assert.equal(frameInput(frames.at(-1)!).rightBrake, 1);
  assert.ok(frameInput(frames[0]!).rightBrake! < .31, 'the first recorded sample contains the issued progressive depth');
  assert.ok(frameInput(frames[13]!).rightBrake! > .65 && frameInput(frames[13]!).rightBrake! < .7);
});

test('↑ holds the speed bar and X the big ears, each recorded as the wing configuration it is', () => {
  const input = createBrakeInput();
  assert.equal(input.keyDown('ArrowUp'), true);
  assert.equal(input.state.bar, true); assert.equal(input.state.ears, false);
  assert.equal(input.state.leftBrake, 0); assert.equal(input.state.rightBrake, 0);
  const frame = (state: typeof input.state) => frameInput(inputFrame({ controlMode: 'brakes', ...state }));
  assert.equal(frame(input.state).bar, true, 'hands up with the bar records the bar');
  input.keyDown('KeyA');
  assert.equal(frame(input.state).bar, false, 'a pulled brake wins over the bar, as the wing flies it');
  input.keyUp('KeyA'); input.keyUp('ArrowUp');
  assert.equal(input.state.bar, false);
  input.keyDown('KeyX');
  assert.equal(input.state.ears, true);
  assert.equal(frame(input.state).ears, true);
  input.keyUp('KeyX'); assert.equal(input.state.ears, false); assert.equal(input.state.source, null);
  input.keyDown('ArrowUp'); input.reset(); assert.equal(input.state.bar, false, 'pause and menus let go of the bar');
});

test('the touch bar and ears buttons are held like a handle and share the handles\' ownership', () => {
  const input = createBrakeInput();
  assert.equal(input.startConfig('ears', pointer(4)), true);
  assert.equal(input.state.ears, true); assert.equal(input.state.source, 'handles');
  assert.equal(input.startConfig('ears', pointer(5)), false, 'one thumb holds the ears');
  assert.equal(input.startHand('left', pointer(4)), false, 'a thumb on the ears is not also on a handle');
  assert.equal(input.keyDown('ArrowUp'), false, 'the keyboard cannot take over from held buttons');
  assert.equal(input.startHand('right', pointer(6)), true, 'the other thumb can still pull a handle');
  input.moveHand(pointer(6, 240)); assert.equal(input.state.ears, true, 'a held button stays held while a handle moves');
  input.endHand(6); assert.equal(input.state.source, 'handles');
  assert.equal(input.endConfig(9), false);
  input.endConfig(4); assert.equal(input.state.ears, false); assert.equal(input.state.source, null);
  input.startConfig('bar', pointer(7)); assert.equal(input.state.bar, true);
  input.reset(); assert.equal(input.state.bar, false); assert.equal(input.held.bar, null);
  assert.equal(input.startMouse(), true); assert.equal(input.startConfig('bar', pointer(8)), false, 'a drag owns the controls');
  input.moveMouse(0, 0, true); assert.equal(input.state.bar, true, 'a drag pushed up holds the bar');
  input.endMouse(); assert.equal(input.state.bar, false);
});
