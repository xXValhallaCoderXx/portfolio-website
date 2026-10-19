import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrakeDrag, dragBrakes } from './brake-drag.js';
import { createControlSummary, summarizeControls } from './brake-controls.js';

test('drag directions independently pull the two brakes through their full range', () => {
  assert.deepEqual(dragBrakes(0, 120), { leftBrake: 1, rightBrake: 1 });
  assert.deepEqual(dragBrakes(-120, 0), { leftBrake: 1, rightBrake: 0 });
  assert.deepEqual(dragBrakes(120, 0), { leftBrake: 0, rightBrake: 1 });
  assert.deepEqual(dragBrakes(0, -120), { leftBrake: 0, rightBrake: 0 });
  const diagonal = dragBrakes(20, 60);
  assert.ok(diagonal.rightBrake > diagonal.leftBrake && diagonal.leftBrake > 0);
  assert.ok(dragBrakes(0, 70).leftBrake > dragBrakes(0, 40).leftBrake);
  assert.deepEqual(dragBrakes(0, 80, 'touch'), dragBrakes(0, 120, 'mouse'));
  assert.deepEqual(dragBrakes(2, 2), { leftBrake: 0, rightBrake: 0 });
  assert.deepEqual(dragBrakes(Infinity, 5), { leftBrake: 0, rightBrake: 0 });
});

test('a single captured pointer owns the drag; release/cancel cannot leave a brake held', () => {
  const drag = createBrakeDrag(), event = { pointerId: 7, pointerType: 'touch', button: 0, clientX: 100, clientY: 200 };
  assert.equal(drag.start({ ...event, button: 2 }), false);
  assert.equal(drag.start(event), true);
  assert.equal(drag.start({ ...event, pointerId: 8 }), false);
  assert.equal(drag.move({ ...event, pointerId: 8, clientY: 280 }), false);
  drag.move({ ...event, clientY: 280 });
  assert.equal(drag.state.leftBrake, 1);
  assert.equal(drag.release({ pointerId: 8 }), false);
  assert.equal(drag.release(event), true);
  assert.equal(drag.state.active, false);
  assert.equal(drag.state.rightBrake, 0);
  drag.start(event); drag.move({ ...event, clientX: 180 }); drag.reset();
  assert.equal(drag.state.rightBrake, 0);
  assert.equal(drag.move({ ...event, clientY: 280 }), false);
});

test('direct semantics distinguish one hand from bilateral braking and preserve direct neutral', () => {
  const pair = { controlMode: 'brakes', leftBrake: 1, rightBrake: 0 };
  const one = summarizeControls(pair);
  assert.equal(one.left, true); assert.equal(one.brake, false);
  assert.equal(one.anyBrake, true); assert.equal(one.bothReleased, false);
  assert.equal(summarizeControls({ ...pair, rightBrake: 1 }).deepBrake, true);
  assert.equal(summarizeControls({ ...pair, ears: true }).bothReleased, true);
  assert.equal(summarizeControls({ ...pair, leftBrake: 0 }).controlMode, 'brakes');
  assert.equal(summarizeControls({ ...pair, bar: true }).bar, false);
});

test('effective input edges use hysteresis and reset when switching sources', () => {
  const observer = createControlSummary();
  const pair = rightBrake => ({ controlMode: 'brakes', leftBrake: 0, rightBrake });
  assert.equal(observer.step(pair(0.07)).right, false);
  assert.equal(observer.step(pair(0.09)).right, true);
  assert.equal(observer.step(pair(0.06)).right, true);
  assert.equal(observer.step(pair(0.03)).right, false);
  observer.step(pair(0.1)); observer.reset();
  assert.equal(observer.step(pair(0.06)).right, false);
  observer.step({ left: true });
  assert.equal(observer.step(pair(0.06)).right, false);
});
