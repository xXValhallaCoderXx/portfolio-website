import type { RunWorld } from './models.ts';
import type { FlightInput } from '../flight/models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { RUN, createRunWorld, finishRun, startRun, stepRun } from './run-step.ts';
import { CLOUD_ZONE, createCloudbaseRun } from './cloudbase-state.ts';
import { createMeet } from './meet-state.ts';
import { createBells } from './bells.ts';
import { createComboStyle } from './meet-combo.ts';
import { summariseRun } from './meet-sheet.ts';
import { BREAK, MOVE } from './trick-tables.ts';
import { settleFlight } from '../flight/flight.ts';
import { pair } from '../../test/helpers/flight-lab.ts';

// Every run is judged as a trick pilot is: the trick watch steps with the wing, the combos score what
// it saw, and control is judged by what was lost, not by a stall asked for.
function world(wing = 'en-a', hazards = true) {
  const w = startRun(createRunWorld({ sky: createCloudbaseRun({ hazards }), meet: createMeet(), bells: hazards ? createBells() : null,
    style: createComboStyle(), wing }), 3);
  Object.assign(w.g.pos, { x: CLOUD_ZONE.x, y: 1400, z: CLOUD_ZONE.z + 100 });
  settleFlight(w.g, undefined, wing);
  w.sky.state.peak = 1400; w.sky.state.elapsed = RUN.grace + 1;
  return w;
}
function fly(w: RunWorld, seconds: number, hands: FlightInput | ((w: RunWorld) => FlightInput)) {
  for (let i = 0; i < Math.round(seconds / RUN.step); i++) if (stepRun(w, typeof hands === 'function' ? hands(w) : { ...hands })) return;
}
const surgeCatch = () => {
  let at = -1;
  return (w: RunWorld) => {
    if (at < 0 && w.g.pitch < -0.4) at = w.steps;
    return at >= 0 && w.steps - at < 50 ? pair(1) : pair(0);
  };
};

test('every run steps the trick watch, and its sheet carries the run\'s trick book', () => {
  const run = world();
  fly(run, 25, pair(0.82, 0));
  assert.ok(run.tricks.state.steps > 0);
  assert.equal(run.tricks.state.move, MOVE.spiral);
  finishRun(run, 'quit');
  assert.ok('tricks' in summariseRun(run, 'quit').stats);
});

test('control is judged by what was lost: a full stall caught is a trick, and one let go that tucks and folds is one red light', () => {
  const caught = world('en-c', false);
  fly(caught, 3, pair(0.3));
  fly(caught, 5, pair(1));
  fly(caught, 10, surgeCatch());
  assert.deepEqual([caught.tucks, caught.stalls, caught.tricks.state.breaks], [0, 0, 0]);
  const dropped = world('en-c', false);
  fly(dropped, 3, pair(0.3));
  fly(dropped, 5, pair(1));
  fly(dropped, 10, pair(0));
  assert.equal(dropped.tucks, 1, 'the surge let go tucks the wing');
  assert.equal(dropped.stalls, 1, 'the tuck and the fold it leaves are one loss of control');
  assert.equal(dropped.tricks.state.broke, BREAK.fold);
});

test('a run on one glider leaves no trace on the world\'s next run on another', () => {
  const make = (wing: string) => createRunWorld({ sky: createCloudbaseRun({ hazards: false }), meet: createMeet(), bells: null,
    style: createComboStyle(), wing });
  const reused = make('acro');
  startRun(reused, 9);
  assert.equal(reused.g.physical.wing, 'acro');
  for (let i = 0; i < 600; i++) stepRun(reused, { ...pair(0.82, 0) });
  // The same world on another glider, as the session does it.
  reused.wing = 'en-a';
  startRun(reused, 9);
  const fresh = startRun(make('en-a'), 9);
  assert.equal(reused.g.physical.wing, 'en-a');
  for (let i = 0; i < 900; i++) { stepRun(reused, { ...pair(0.3, 0) }); stepRun(fresh, { ...pair(0.3, 0) }); }
  assert.deepEqual(reused.g.pilot.pos, fresh.g.pilot.pos, 'flown exactly as a world that never flew another glider');
  assert.deepEqual(reused.g.canopy.q, fresh.g.canopy.q);
  assert.deepEqual(reused.tricks.state, fresh.tricks.state);
});
