import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrakeInput, keyboardBrakes } from '../flight/brake-input.ts';
import { createTrainingSession, TRICK_TRAINING_LESSONS } from './training-session.ts';
import { TRICK_LESSONS } from './trick-lessons.ts';

const shortcuts = [[], ['KeyA'], ['KeyD'], ['KeyW'], ['Space'], ['KeyW', 'KeyA'], ['KeyW', 'KeyD'],
  ['KeyQ'], ['KeyE'], ['ShiftLeft', 'KeyA'], ['ShiftLeft', 'KeyD'], ['ShiftLeft', 'Space']];
const dt = 1 / 60;

// Follow the visible lesson using actual keyboard intent, including progressive full pulls.
for (const lesson of ['steering', ...TRICK_TRAINING_LESSONS] as const) for (const side of [-1, 1])
for (const delay of lesson === 'steering' ? [0, .3, .6] : [0, .15, .3]) {
  test(`keyboard ${lesson}, side ${side}, ${delay}s response completes cleanly`, () => {
    const controller = createBrakeInput(), session = createTrainingSession();
    session.begin(lesson, side);
    let held: string[] = [], requested = { leftBrake: 0, rightBrake: 0 };
    let pending: { at: number; leftBrake: number; rightBrake: number } | null = null;
    for (let tick = 0; tick < 90 * 60 && session.state.status === 'flying'; tick++) {
      if (pending && tick >= pending.at) {
        const next = shortcuts.find(keys => {
          const pair = keyboardBrakes(new Set(keys));
          return Math.abs(pair.leftBrake - pending!.leftBrake) < 1e-9 && Math.abs(pair.rightBrake - pending!.rightBrake) < 1e-9;
        });
        assert.ok(next, `a real shortcut must produce the visible target ${JSON.stringify(pending)}`);
        for (const key of held) if (!next.includes(key)) controller.keyUp(key);
        for (const key of next) if (!held.includes(key)) controller.keyDown(key);
        held = next; requested = pending; pending = null;
      }
      controller.step(dt);
      const message = session.step(dt, controller.state);
      const target = message?.brakeTargets;
      const leftBrake = target?.left ?? 0, rightBrake = target?.right ?? 0;
      if (!pending && (leftBrake !== requested.leftBrake || rightBrake !== requested.rightBrake))
        pending = { at: tick + Math.round(delay / dt) + 1, leftBrake, rightBrake };
    }
    assert.equal(session.state.status, 'complete', JSON.stringify(session.state));
    if (lesson === 'steering') {
      assert.equal(session.watch.state.moves, 0); assert.equal(session.style.state.total, 0);
    } else {
      assert.equal(session.watch.state.moveKind, TRICK_LESSONS[lesson].kind);
      assert.ok(session.style.state.total > 0);
    }
    assert.equal(session.watch.state.breaks, 0);
    assert.equal(session.g.stall, 0); assert.equal(session.g.tuck, 0);
    assert.equal(session.controls.leftBrake, 0); assert.equal(session.controls.rightBrake, 0);
  });
}
