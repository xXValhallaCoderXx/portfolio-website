// Runs of Good Lift flown here for the function's tests, the way the game flies one: a reference
// pilot (pilots.js) at the keys, through the one step every run takes (run-step.js stepBits), with a
// recorder taking each step's controls down, so each run comes with its log and the sheet it truly
// came to. The tests hold what the function makes of a run up against that sheet. They never pin
// what a pilot lifts, which every SIM_VERSION changes.
import { TST, createReferenceKeys } from '../../src/game/pilots.js';
import { createRunWorld, finishRun, startRun, stepBits, stepFrame } from '../../src/game/run-step.js';
import { createCloudbaseRun } from '../../src/game/cloudbase-state.js';
import { createMeet } from '../../src/game/meet-state.js';
import { createBells } from '../../src/game/bells.js';
import { summariseRun } from '../../src/game/meet-sheet.js';
import { INPUT, MAX_STEPS, createRecorder, decodeLog, encodeLog, inputBits, inputFrame } from '../../src/game/recorder.js';
import { seedFor } from '../../src/game/daily.js';
import { SIM_VERSION } from '../../src/game/sim-version.js';

// Pilots who fly a day's sky differently, so their runs come to different sheets.
export const PILOTS = Object.freeze({
  column: () => createReferenceKeys({ brake: 'none' }), // hands up, circling every lift it finds
  eased: () => createReferenceKeys(TST), // circling on the light brake
  collector: () => createReferenceKeys({ ...TST, collect: true }, { hold: 7 }), // TST, fetching every trail of plates
  landing: () => () => INPUT.right | INPUT.bar, // a manual turn onto terrain in the test day's sky
  bar: () => () => INPUT.bar, // straight off the gate on the speed bar, carried by that day's weather
  analog: () => world => world.steps % 420 < 20 ? 0 : inputFrame({ controlMode: 'brakes',
    leftBrake: 0.1 + 0.06 * Math.sin(world.steps / 55), rightBrake: 0.1 - 0.06 * Math.sin(world.steps / 55) }),
});

/**
 * A run of the Daily Sky of UTC `day` flown by `pilot` (one of PILOTS) under `initials`, until the
 * fog or the ground ends it or its pilot does at step `quit`. Returns { day, seed, sheet, log, text }:
 * the sheet it came to (summariseRun's), its log as decodeLog reads it, and its link's text.
 */
export function fly(day, pilot, { initials = 'REN', quit = MAX_STEPS } = {}) {
  const seed = seedFor(day);
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells() }), seed);
  const recorder = createRecorder();
  const bitsOf = PILOTS[pilot]();
  let reason = null;
  while (!reason && recorder.steps < quit) {
    const bits = bitsOf(world);
    recorder.push(bits);
    reason = stepFrame(world, bits);
  }
  reason ??= 'quit';
  finishRun(world, reason);
  const sheet = summariseRun(world, reason);
  const text = encodeLog({ simVersion: SIM_VERSION, seed, day, initials, total: sheet.total, peak: sheet.peak }, recorder.bits, recorder.steps);
  return { day, seed, sheet, log: decodeLog(text).log, text };
}

/** A flown run's log written again with `meta` changed: the run itself, its seed and controls, the same. */
export const rewrite = ({ log }, meta) => encodeLog({ ...log, ...meta }, log.bits, log.steps);

/**
 * The steps of a flown run on which its wing was folded, flown again from its log: the hands are off
 * it then. Read after each step, so a step on which a pump opened the wing, and gave the hands back,
 * is not one of them.
 */
export function folded({ seed, log }) {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells() }), seed);
  const steps = [];
  for (let i = 0; i < log.steps; i++) {
    const ended = stepBits(world, log.bits[i]);
    if (world.controls.locked) steps.push(i);
    if (ended) break;
  }
  return steps;
}
