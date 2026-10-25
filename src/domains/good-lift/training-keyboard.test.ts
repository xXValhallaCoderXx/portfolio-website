import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrakeInput, keyboardBrakes } from '../flight/brake-input.ts';
import { createTrainingSession, TRICK_TRAINING_LESSONS } from './training-session.ts';
import { TRICK_LESSONS } from './trick-lessons.ts';
import { lessonOffers } from './gliders.ts';

const shortcuts = [[], ['KeyA'], ['KeyD'], ['KeyW'], ['Space'], ['KeyW', 'KeyA'], ['KeyW', 'KeyD'],
  ['KeyQ'], ['KeyE'], ['ShiftLeft', 'KeyA'], ['ShiftLeft', 'KeyD'], ['ShiftLeft', 'Space'],
  // The helicopter's chord: Shift, both hands, and the side held full.
  ['ShiftLeft', 'Space', 'KeyA'], ['ShiftLeft', 'Space', 'KeyD']];
const dt = 1 / 60;

// Follow the visible lesson using actual keyboard intent, including progressive full pulls.
// The classic wing's lessons, and a glider's rotations on the gliders that fly them.
const FLIGHTS = [...(['steering', ...TRICK_TRAINING_LESSONS] as const).filter(lesson => lessonOffers('classic')[lesson] === '')
  .map(lesson => ({ lesson, wing: 'classic' })), { lesson: 'heli' as const, wing: 'en-c' }, { lesson: 'sat' as const, wing: 'acro' }];
for (const { lesson, wing } of FLIGHTS) for (const side of [-1, 1])
for (const delay of lesson === 'steering' ? [0, .3, .6] : [0, .15, .3]) {
  test(`keyboard ${lesson}${wing === 'classic' ? '' : ` on the ${wing}`}, side ${side}, ${delay}s response completes cleanly`, () => {
    const controller = createBrakeInput(), session = createTrainingSession({ wing: () => wing });
    session.begin(lesson, side);
    let held: string[] = [], requested = { leftBrake: 0, rightBrake: 0 };
    let pending: { at: number; leftBrake: number; rightBrake: number } | null = null;
    const tricks: { move: number; link: number }[] = [];
    for (let tick = 0, seen = 0; tick < 90 * 60 && session.state.status === 'flying'; tick++) {
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
      if (session.tricks.state.instances > seen) {
        seen = session.tricks.state.instances;
        tricks.push({ move: session.tricks.state.move, link: session.tricks.state.link });
      }
      const target = message?.brakeTargets;
      const leftBrake = target?.left ?? 0, rightBrake = target?.right ?? 0;
      if (!pending && (leftBrake !== requested.leftBrake || rightBrake !== requested.rightBrake))
        pending = { at: tick + Math.round(delay / dt) + 1, leftBrake, rightBrake };
    }
    assert.equal(session.state.status, 'complete', JSON.stringify(session.state));
    if (lesson === 'steering') {
      assert.equal(session.watch.state.moves, 0); assert.equal(session.style.state.total, 0);
      assert.equal(session.watch.state.breaks, 0);
    } else if (!TRICK_LESSONS[lesson].kind) {
      // Moves only the trick watch knows, by name where the lesson teaches a link; a full stall held
      // on purpose is no break to it.
      const { moves, link } = TRICK_LESSONS[lesson];
      assert.ok(tricks.some(trick => moves.includes(trick.move) && (!link || trick.link === link)), JSON.stringify(tricks));
      assert.equal(session.tricks.state.breaks, 0);
    } else {
      assert.equal(session.watch.state.moveKind, TRICK_LESSONS[lesson].kind);
      assert.ok(session.style.state.total > 0);
      assert.equal(session.watch.state.breaks, 0);
    }
    assert.equal(session.g.stall, 0); assert.equal(session.g.tuck, 0);
    assert.equal(session.controls.leftBrake, 0); assert.equal(session.controls.rightBrake, 0);
  });
}

// The recovery lessons (recovery-lessons.js) flown on keys, on gliders that have each failure: every
// step of every fix is a key or a chord, and the speed bar is ↑ with the hands up.
const RECOVERY_FLIGHTS = [['collapse', 'en-a'], ['collapse', 'en-d'], ['frontal', 'en-c'], ['deep-stall', 'en-b'], ['spin', 'acro'],
  ['cravat', 'en-d'], ['twist', 'acro']] as const;
for (const [lesson, wing] of RECOVERY_FLIGHTS) for (const side of [-1, 1]) for (const delay of [0.15, 0.3]) {
  test(`keyboard ${lesson} recovery on the ${wing}, side ${side}, ${delay}s response is saved and learned`, () => {
    const controller = createBrakeInput(), session = createTrainingSession({ wing: () => wing });
    session.begin(lesson, side);
    let held: string[] = [], requested = { leftBrake: 0, rightBrake: 0, bar: false };
    let pending: { at: number; leftBrake: number; rightBrake: number; bar: boolean } | null = null;
    for (let tick = 0; tick < 60 * 60 && session.state.status === 'flying'; tick++) {
      if (pending && tick >= pending.at) {
        const next: string[] | undefined = pending.bar ? ['ArrowUp'] : shortcuts.find(keys => {
          const pair = keyboardBrakes(new Set(keys));
          return Math.abs(pair.leftBrake - pending!.leftBrake) < 1e-9 && Math.abs(pair.rightBrake - pending!.rightBrake) < 1e-9;
        });
        assert.ok(next, `a real shortcut must produce the visible target ${JSON.stringify(pending)}`);
        for (const key of held) if (!next.includes(key)) controller.keyUp(key);
        for (const key of next) if (!held.includes(key)) controller.keyDown(key);
        held = next; requested = pending; pending = null;
      }
      controller.step(dt);
      const target = session.step(dt, controller.state)?.brakeTargets;
      const want = { leftBrake: target?.left ?? 0, rightBrake: target?.right ?? 0, bar: !!target?.bar };
      if (!pending && (want.leftBrake !== requested.leftBrake || want.rightBrake !== requested.rightBrake || want.bar !== requested.bar))
        pending = { at: tick + Math.round(delay / dt) + 1, ...want };
    }
    assert.equal(session.state.status, 'complete', JSON.stringify({ ...session.state, recovery: session.recoveryState }));
  });
}
