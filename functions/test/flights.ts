import type { RunLog } from '../../src/domains/good-lift/recorder.ts';
type RunWorld = ReturnType<typeof createRunWorld>;
// Runs of Good Lift flown here for the function's tests, the way the game flies one: a reference
// pilot (pilots.js) at the keys, through the one step every run takes (run-step.js stepBits), with a
// recorder taking each step's controls down, so each run comes with its log and the sheet it truly
// came to. The tests hold what the function makes of a run up against that sheet. They never pin
// what a pilot lifts, which every SIM_VERSION changes.
import { TST, createReferenceKeys } from '../../src/domains/good-lift/pilots.ts';
import { createRunWorld, finishRun, startRun, stepFrame } from '../../src/domains/good-lift/run-step.ts';
import { createCloudbaseRun } from '../../src/domains/good-lift/cloudbase-state.ts';
import { createMeet } from '../../src/domains/good-lift/meet-state.ts';
import { createBells } from '../../src/domains/good-lift/bells.ts';
import { createComboStyle } from '../../src/domains/good-lift/meet-combo.ts';
import { GLIDERS, type GliderId } from '../../src/domains/good-lift/gliders.ts';
import { summariseRun } from '../../src/domains/good-lift/meet-sheet.ts';
import { INPUT, MAX_STEPS, createRecorder, decodeLog, encodeLog, inputFrame } from '../../src/domains/good-lift/recorder.ts';
import { seedFor } from '../../src/domains/good-lift/daily.ts';
import { SIM_VERSION } from '../../src/domains/good-lift/sim-version.ts';

// Pilots who fly a day's sky differently, so their runs come to different sheets.
export const PILOTS = Object.freeze({
  column: () => createReferenceKeys({ brake: 'none' }), // hands up, circling every lift it finds
  eased: () => createReferenceKeys(TST), // circling on the light brake
  collector: () => createReferenceKeys({ ...TST, collect: true }, { hold: 7 }), // TST, fetching every trail of plates
  landing: () => () => INPUT.right | INPUT.bar, // a manual turn onto terrain in the test day's sky
  bar: () => () => INPUT.bar, // straight off the gate on the speed bar, carried by that day's weather
  analog: () => (world: RunWorld) => world.steps % 420 < 20 ? 0 : inputFrame({ controlMode: 'brakes',
    leftBrake: 0.1 + 0.06 * Math.sin(world.steps / 55), rightBrake: 0.1 - 0.06 * Math.sin(world.steps / 55) }),
});

/**
 * A run of the Daily Sky of UTC `day` flown by `pilot` (one of PILOTS) on `glider` under `initials`,
 * until the fog or the ground ends it or its pilot does at step `quit`. Returns { day, seed, sheet,
 * log, text }: the sheet it came to (summariseRun's), its log as decodeLog reads it, and its link's text.
 */
export function fly(day: number, pilot: string, { initials = 'REN', quit = MAX_STEPS, glider = GLIDERS[0] }: {initials?:string;quit?:number;glider?:GliderId} = {}) {
  const seed = seedFor(day);
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells(), style: createComboStyle(), wing: glider }), seed);
  const recorder = createRecorder();
  const bitsOf = PILOTS[pilot as keyof typeof PILOTS]();
  let reason = null;
  while (!reason && recorder.steps < quit) {
    const bits = bitsOf(world);
    recorder.push(bits);
    reason = stepFrame(world, bits);
  }
  reason ??= 'quit';
  finishRun(world, reason);
  const sheet = summariseRun(world, reason);
  const text = encodeLog({ simVersion: SIM_VERSION, glider, seed, day, initials, total: sheet.total, peak: sheet.peak }, recorder.bits, recorder.steps);
  const decoded = decodeLog(text);
  if (!decoded.ok) throw new Error(decoded.why);
  return { day, seed, sheet, log: decoded.log, text };
}

/** A flown run's log written again with `meta` changed: the run itself, its seed and controls, the same. */
export const rewrite = ({ log }: {log: RunLog}, meta: Record<string, unknown>) => encodeLog({ ...log, ...meta }, log.bits, log.steps);

// A log's text as its bytes, and bytes as a log's text, to write what no encoder of this build
// would: a log of another format, or of a wing it does not know.
export const bytesOf = (text: string) => [...Buffer.from(text, 'base64url')];
export const textOf = (bytes: number[]) => Buffer.from(bytes).toString('base64url');
