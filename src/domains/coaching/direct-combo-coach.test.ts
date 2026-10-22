import test from 'node:test';
import assert from 'node:assert/strict';
import type { CoachMessage } from './models.ts';
import { createFlightCoach } from './flight-coach.ts';
import { createDirectFlight, directBrakes } from '../../test/helpers/test-direct-flight.ts';

for (const delay of [0, 0.1, 0.2, 0.3]) test(`visible pitch linking cues build three moves before banking, ${delay}s reaction`, () => {
  const flight = createDirectFlight(), coach = createFlightCoach();
  let input = directBrakes(.6), phase = 'shape';
  let pending: { at: number; input: ReturnType<typeof directBrakes>; phase?: string } | null = null;
  let linking = false, recovering = false, shown = 0;
  for (let tick = 0; tick < 50 * 60 && flight.style.state.landed === 0; tick++) {
    if (pending && tick >= pending.at) { input = pending.input; phase = pending.phase ?? phase; pending = null; }
    flight.step(input);
    if (flight.watch.state.moves > 0) linking = true;
    if (flight.watch.state.moves >= 3) recovering = true;
    let message: CoachMessage | null = null;
    if (linking) {
      message = coach.step(1 / 60, { ...flight, watch: flight.watch.state, style: flight.style.state, input,
        maneuverPolicy: recovering ? 'off' : 'acro', forceRecovery: recovering,
        clearance: 1000, fogClearance: 1000 });
      if (!recovering && message?.state === 'combo') shown++;
    }
    if (!pending) {
      let next: { input: ReturnType<typeof directBrakes>; phase?: string } | null = null;
      if (linking && message) {
        const targets = message.brakeTargets;
        next = { input: targets ? directBrakes(targets.left, targets.right) : directBrakes(message.action === 'brake' ? .6 : 0) };
      } else if (!linking) {
        if (phase === 'shape' && flight.g.pitch > .15 && flight.g.pitchRate <= 0) next = { input: directBrakes(), phase: 'first-front' };
        else if (phase === 'first-front' && flight.watch.state.fronts >= 1) next = { input: directBrakes(.6), phase: 'pump' };
        else if (phase === 'pump' && flight.g.pitch > 0 && flight.g.pitchRate <= 0) next = { input: directBrakes(), phase: 'wait' };
        else if (phase === 'wait' && flight.g.pitch < -.35 && flight.g.pitchRate < 0) next = { input: directBrakes(.6), phase: 'catch' };
      }
      if (next && (next.input.leftBrake !== input.leftBrake || next.input.rightBrake !== input.rightBrake))
        pending = { ...next, at: tick + Math.round(delay * 60) + 1 };
    }
  }
  assert.ok(shown > 0);
  assert.equal(flight.watch.state.moves, 3);
  assert.equal(flight.style.state.landed, 1);
  assert.equal(flight.style.state.total, 35);
  assert.equal(flight.style.state.lost, 0);
  assert.equal(flight.stats.stalls, 0);
  assert.equal(flight.stats.tucks, 0);
});
