import type { FlightInput } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BRAKE_DRAG, createBrakeDrag, dragBrakes } from './brake-drag.ts';
import { createControlSummary, summarizeControls } from './brake-controls.ts';

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

test('a single captured pointer owns the drag; resetting clears its identity and brake intent', () => {
  const drag = createBrakeDrag(), event = { pointerId: 7, pointerType: 'touch', button: 0, clientX: 100, clientY: 200 };
  assert.equal(drag.start({ ...event, button: 2 }), false);
  assert.equal(drag.start(event), true);
  assert.equal(drag.start({ ...event, pointerId: 8 }), false);
  assert.equal(drag.move({ ...event, pointerId: 8, clientY: 280 }), false);
  drag.move({ ...event, clientY: 280 });
  assert.equal(drag.state.leftBrake, 1);
  drag.reset();
  assert.equal(drag.state.active, false);
  assert.equal(drag.state.moved, false);
  assert.equal(drag.state.pointerId, null);
  assert.equal(drag.state.leftBrake, 0);
  assert.equal(drag.state.rightBrake, 0);
  assert.equal(drag.state.dx, 0);
  assert.equal(drag.state.dy, 0);
  drag.start(event); drag.move({ ...event, clientX: 180 }); drag.reset();
  assert.equal(drag.state.rightBrake, 0);
  assert.equal(drag.move({ ...event, clientY: 280 }), false);
});

test('click slop tracks cumulative drag ownership without changing either hand demand', () => {
  for (const pointerType of ['mouse', 'touch', 'pen'] as const) {
    const drag = createBrakeDrag();
    const event = { pointerId: 3, pointerType, button: 0, clientX: 100, clientY: 200 };
    const move = (dx: number, dy: number, pointerId = event.pointerId) => drag.move({ ...event, pointerId,
      clientX: event.clientX + dx, clientY: event.clientY + dy });
    drag.start(event);
    assert.equal(drag.state.moved, false);
    move(BRAKE_DRAG.clickSlop, 0);
    assert.equal(drag.state.moved, false, 'a stationary click tolerates six pixels of movement');
    move(BRAKE_DRAG.clickSlop + 1, 0, 9);
    assert.equal(drag.state.moved, false, 'another pointer cannot claim this drag');
    move(0, 0);
    move(5, 4);
    assert.equal(drag.state.moved, true, 'diagonal distance also distinguishes a drag');
    for (const [dx, dy] of [[-120, 0], [15, 70], [0, -120], [0, 0]]) {
      move(dx, dy);
      assert.equal(drag.state.moved, true, 'returning to hands up still suppresses its click');
      assert.deepEqual({ leftBrake: drag.state.leftBrake, rightBrake: drag.state.rightBrake },
        dragBrakes(dx, dy, pointerType), 'navigation ownership never quantizes or changes brake demands');
    }
    drag.reset();
    assert.equal(drag.state.moved, false);
    drag.start({ ...event, clientX: 150, clientY: 250 });
    assert.equal(drag.state.moved, false, 'a fresh press has its own click history');
    assert.equal(drag.state.dx, 0); assert.equal(drag.state.dy, 0);
  }
});

test('direct semantics distinguish one hand from bilateral braking and preserve direct neutral', () => {
  const pair: FlightInput = { controlMode: 'brakes', leftBrake: 1, rightBrake: 0 };
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
  const pair = (rightBrake: number): FlightInput => ({ controlMode: 'brakes', leftBrake: 0, rightBrake });
  assert.equal(observer.step(pair(0.07)).right, false);
  assert.equal(observer.step(pair(0.09)).right, true);
  assert.equal(observer.step(pair(0.06)).right, true);
  assert.equal(observer.step(pair(0.03)).right, false);
  observer.step(pair(0.1)); observer.reset();
  assert.equal(observer.step(pair(0.06)).right, false);
  observer.step({ left: true });
  assert.equal(observer.step(pair(0.06)).right, false);
});

test('a drag pushed up past its grab point holds the speed bar, and only then', () => {
  const drag = createBrakeDrag(), event = { pointerId: 3, pointerType: 'mouse', button: 0, clientX: 300, clientY: 300 };
  drag.start(event);
  drag.move({ ...event, clientY: 300 - BRAKE_DRAG.barLift + 1 }); assert.equal(drag.state.bar, false);
  drag.move({ ...event, clientY: 300 - BRAKE_DRAG.barLift }); assert.equal(drag.state.bar, true);
  assert.equal(drag.state.leftBrake, 0); assert.equal(drag.state.rightBrake, 0);
  drag.move({ ...event, clientY: 360 }); assert.equal(drag.state.bar, false);
  drag.move({ ...event, clientY: 200 }); drag.reset(); assert.equal(drag.state.bar, false);
});
