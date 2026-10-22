import test from 'node:test';
import assert from 'node:assert/strict';
import type { FlightInput } from '../flight/models.ts';
import type { CoachMessage } from '../coaching/models.ts';
import { createFlight, stepFlight } from '../flight/flight.ts';
import { createSwingWatch } from '../coaching/swing-watch.ts';
import { createStyle } from './meet-style.ts';
import { createTrickLessons } from './trick-lessons.ts';
import { directBrakes } from '../../test/helpers/test-direct-flight.ts';

function follow(message: CoachMessage): FlightInput {
  if (message.brakeTargets) return directBrakes(message.brakeTargets.left, message.brakeTargets.right);
  if (message.action === 'deep-brake') return directBrakes(1);
  if (message.action === 'brake') return directBrakes(0.6);
  return directBrakes();
}

for (const kind of ['pitch', 'wingover', 'loop'] as const) for (const side of [-1, 1]) for (const delay of [0, 0.1, 0.2, 0.3]) {
  test(`visible direct ${kind} lesson, side ${side}, ${delay}s reaction, completes and learns after banking`, () => {
    const g = createFlight({ x: 0, y: 1100, z: 0 });
    const watch = createSwingWatch(), style = createStyle(), controls = directBrakes();
    const world = { g, watch, style, controls }, air = { windY: 5.5 };
    const learned: string[] = [], phases = new Set<string>();
    const lessons = createTrickLessons({ learned: () => kind === 'pitch' ? [] : kind === 'wingover' ? ['pitch'] : ['pitch', 'wingover'],
      onLearned: id => learned.push(id) });
    let input = side < 0 ? directBrakes(.5, .2) : directBrakes(.2, .5);
    let pending: { at: number; input: FlightInput } | null = null, started = false;
    let lastMessage: CoachMessage | null = null;
    for (let tick = 0; tick < 60 * 60; tick++) {
      if (pending && tick >= pending.at) { input = pending.input; pending = null; }
      Object.assign(controls, input);
      stepFlight(g, controls, air, 1 / 60); watch.step(1 / 60, g, false, controls); style.step(1 / 60, world);
      assert.equal(g.stall, 0, `${(lastMessage as CoachMessage | null)?.title}: ${(lastMessage as CoachMessage | null)?.phase}`);
      assert.equal(g.tuck, 0, `${(lastMessage as CoachMessage | null)?.title}: ${(lastMessage as CoachMessage | null)?.phase}`);
      if (tick < 600) continue;
      const message = lessons.step(1 / 60, { g, watch: watch.state, style: style.state, input: controls, air,
        clearance: g.pos.y, fogClearance: g.pos.y, eligible: true });
      started ||= lessons.state.active === kind;
      lastMessage = message;
      if (message?.phase) phases.add(message.phase);
      if (message && !pending) {
        const next = follow(message);
        if (next.leftBrake !== input.leftBrake || next.rightBrake !== input.rightBrake)
          pending = { at: tick + Math.round(delay * 60) + 1, input: next };
      }
      if (lessons.state.phase === 'banked') break;
    }
    assert.equal(started, true);
    assert.deepEqual(learned, [kind], `phase ${lessons.state.phase}, cancelled ${lessons.state.cancelled}, moves ${watch.state.moves}; phases ${[...phases]}`);
    assert.equal(watch.state.moveKind, kind === 'pitch' ? 1 : kind === 'wingover' ? 2 : 3);
    assert.equal(style.state.landed, 1);
    assert.equal(style.state.lost, 0);
    assert.ok(style.state.total > 0);
    assert.equal(watch.state.breaks, 0);
    assert.ok(watch.state.calm >= 1);
    assert.equal(g.loops, kind === 'loop' ? 1 : 0);
  });
}
