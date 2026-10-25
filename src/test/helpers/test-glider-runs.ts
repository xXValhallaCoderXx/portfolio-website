// Test helper: a Daily Sky's run on each glider with a combo banked in it, as the game flies one,
// for the Chromium receipt of every class (fixtures/good-lift-gliders-chromium.json, captured by
// tools/capture-goldens.ts) and the board's function, which flies its log again. Not part of the
// game, and deliberately not named *.test.ts.
import type { GliderId } from '../../domains/good-lift/glider-ids.ts';
import { createCloudbaseRun } from '../../domains/good-lift/cloudbase-state.ts';
import { createMeet } from '../../domains/good-lift/meet-state.ts';
import { createBells } from '../../domains/good-lift/bells.ts';
import { createComboStyle } from '../../domains/good-lift/meet-combo.ts';
import { createRunWorld, finishRun, startRun, stepFrame } from '../../domains/good-lift/run-step.ts';
import { createRecorder, encodeLog, inputFrame } from '../../domains/good-lift/recorder.ts';
import { createReferenceKeys, TST } from '../../domains/good-lift/pilots.ts';
import { planFor } from '../../domains/good-lift/gliders.ts';
import { summariseRun } from '../../domains/good-lift/meet-sheet.ts';
import { SIM_VERSION } from '../../domains/good-lift/sim-version.ts';
import { DAILY_EPOCH } from '../../domains/good-lift/good-lift-address.ts';
import { seedFor } from '../../domains/good-lift/daily.ts';

// The Daily Sky every class is flown on, and how its pilot flies a combo there: once `from` metres
// up, hands up for `clear` steps (the wing back to trim, where the sport wings spiral rather than
// spin), one hand at 0.82 for `spiral` steps, then hands up until the combo banks or is lost, or
// `settle` steps have gone; TST's keys before and after.
export const GLIDER_RUN = Object.freeze({ day: DAILY_EPOCH + 30, from: 650, clear: 180, spiral: 720, settle: 1800 });

const pair = (left: number, right: number) => inputFrame({ controlMode: 'brakes', leftBrake: left, rightBrake: right });

/** The run on `glider`: its log, as a challenge link carries it, and the sheet it came to. */
export function captureGliderRun(glider: GliderId) {
  const { day, from, clear, spiral, settle } = GLIDER_RUN, seed = seedFor(day);
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells(), style: createComboStyle(), wing: glider }), seed);
  const keys = createReferenceKeys({ ...TST, plan: planFor(glider) }), recorder = createRecorder();
  let phase: 'climb' | 'clear' | 'spiral' | 'bank' | 'soar' = 'climb', at = 0, ended = null;
  const style = world.style!.state;
  while (!ended) {
    const now = world.steps;
    if (phase === 'climb' && world.g.pos.y >= from) { phase = 'clear'; at = now; }
    else if (phase === 'clear' && now - at >= clear) { phase = 'spiral'; at = now; }
    else if (phase === 'spiral' && now - at >= spiral) { phase = 'bank'; at = now; }
    else if (phase === 'bank' && (style.landed > 0 || style.lost > 0 || now - at >= settle)) phase = 'soar';
    const frame = phase === 'clear' || phase === 'bank' ? pair(0, 0) : phase === 'spiral' ? pair(0.82, 0) : keys(world);
    recorder.push(frame);
    ended = stepFrame(world, frame);
  }
  finishRun(world, ended);
  const sheet = summariseRun(world, ended);
  const link = encodeLog({ simVersion: SIM_VERSION, glider, seed, day, initials: 'REN', total: sheet.total, peak: sheet.peak },
    recorder.bits, recorder.steps);
  return { glider, simVersion: SIM_VERSION, seed, day, steps: recorder.steps, link, sheet };
}
