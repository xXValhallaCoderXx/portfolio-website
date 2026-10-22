import type { RunWorld } from './models.ts';
import type { ReferencePilotOptions } from './pilots.ts';
import type { RunLog, LogMetadataInput } from './recorder.ts';
import type { ReplayResult } from './replay.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplay, replayLog } from './replay.ts';
import { INPUT, createRecorder, decodeLog, encodeLog } from './recorder.ts';
import { createRunWorld, finishRun, startRun, stepBits } from './run-step.ts';
import { TST, createReferenceKeys } from './pilots.ts';
import { CLOUD_GATE, createCloudbaseRun } from './cloudbase-state.ts';
import { createMeet } from './meet-state.ts';
import { BELL_RESULT, createBells } from './bells.ts';
import { createStyle } from './meet-style.ts';
import { RUNE } from './meet-runes.ts';
import { summariseRun } from './meet-sheet.ts';
import { SIM_VERSION } from './sim-version.ts';
import { isJudgedEnding } from './run-rules.ts';

function readLog(text: string): RunLog { const read = decodeLog(text); assert.ok(read.ok); return read.log; }
function sheetOf(result: ReplayResult | null) { assert.ok(result && !result.error); return result; }

const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

// The same fixed keyboard adapter used by the browser goldens and the balance survey.
const keys = (options: ReferencePilotOptions = TST, settings: Parameters<typeof createReferenceKeys>[1] = {}) => createReferenceKeys(options, settings);

// A pilot at the keys that climbs the launch column through the opener, then holds the brake deep
// and steers for the hillside east of it, and touches down there before the fog comes up.
function lander() {
  const climb = keys();
  let steer = 0;
  let diving = false;
  return (world: RunWorld) => {
    const bits = climb(world);
    diving ||= world.meet!.state.count > 0;
    if (!diving) return bits;
    if (world.steps % 9 === 0) {
      const { pos, yaw } = world.g;
      const turn = wrapAngle(Math.atan2(185 - pos.x, -(320 - pos.z)) - yaw);
      steer = turn > 0.15 ? INPUT.right : turn < -0.15 ? INPUT.left : 0;
    }
    return steer | INPUT.brake;
  };
}

// Flies a run on `seed` with the meet, the kettlebells and the style through stepBits, as the game does, with
// `bitsOf(world)` at the keys and a recorder taking every step down, until the run ends or the
// pilot ends it at step `quit`. Returns the run's sheet and its link.
function flyLive(seed: number, bitsOf: (world: RunWorld) => number, { quit = Infinity, meta = {} }: {quit?:number;meta?:LogMetadataInput;seed?:number} = {}) {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells(), style: createStyle() }), seed);
  const recorder = createRecorder();
  let reason = null;
  while (!reason && world.steps < quit) {
    const bits = bitsOf(world);
    recorder.push(bits);
    reason = stepBits(world, bits);
  }
  reason ??= 'quit';
  finishRun(world, reason);
  const sheet = summariseRun(world, reason);
  const text = encodeLog({ simVersion: SIM_VERSION, seed, total: sheet.total, peak: sheet.peak, ...meta }, recorder.bits, recorder.steps);
  return { sheet, text };
}

// Twenty-four actual digital traces: soaring, alternative hold lengths, touch chords,
// early exits, terrain landings and optional progression targets.
interface SkyCase { seed:number;pilot:()=> (world:RunWorld)=>number;meta?:LogMetadataInput;quit?:number }
const SKIES: SkyCase[] = [
  ...[1, 2, 3, 4, 5, 6].map((seed) => ({ seed, pilot: () => keys() })),
  ...[7, 8, 9, 10].map((seed) => ({ seed, pilot: () => keys({ brake: 'eased' }, { hold: 6, chord: true }), meta: { touch: true, initials: 'TST' } })),
  ...[11, 12, 13].map((seed) => ({ seed, pilot: () => keys({}, { hold: 18 }), meta: { day: 20_756 } })),
  ...[14, 15, 16, 17].map((seed) => ({ seed, pilot: () => keys({ brake: 'eased' }), quit: (14 + 23 * (seed - 14)) * 60 + seed })),
  ...[18, 19, 20].map((seed) => ({ seed, pilot: lander })),
  ...[21, 22, 23].map((seed) => ({ seed, pilot: () => keys({ ...TST, collect: true }, { hold: 6 }) })),
  { seed: 98, pilot: () => keys({ brake: 'eased', gates: [RUNE.algiz] }) },
];

// Each run flown live once, for every test here to replay.
let flown: Array<SkyCase & ReturnType<typeof flyLive>> | null = null;
const recorded = () => (flown ??= SKIES.map((sky) => ({ ...sky, ...flyLive(sky.seed, sky.pilot(), sky) })));

test('a recorded run replays to the same total, peak, lights, ending and barogram, and the same plates, gates and kettlebells', () => {
  const seen: Record<string, number> = {
    fog: 0, quit: 0, landed: 0, lines: 0, doubled: 0, reds: 0, reps: 0, trails: 0, thrown: 0, hits: 0, close: 0, dodged: 0,
    wind: 0, scattered: 0, recovered: 0, glanced: 0, gates: 0, beasts: 0,
  };
  for (const { seed, sheet, text, meta = {} } of recorded()) {
    const read = decodeLog(text);
    assert.ok(read.ok);
    // The step that touches down is in the log, though the run never counts it as flown: the sky is
    // not stepped on it.
    const steps = sheet.steps + (sheet.reason === 'landed' ? 1 : 0);
    assert.deepEqual({ ...read.log, bits: null }, { format: 2, simVersion: SIM_VERSION, seed, day: 0, touch: false, initials: '', ...meta, total: sheet.total, peak: sheet.peak, steps, bits: null });
    const replayed = replayLog(read.log);
    assert.deepEqual(replayed, sheet, `seed ${seed}`);
    seen[sheet.reason] += 1;
    seen.lines += sheet.lifts.filter((lift: { line: number; }) => lift.line > 0).length;
    seen.doubled += sheet.lifts.filter((lift) => lift.double).length;
    seen.reds += sheet.lifts.filter((lift) => lift.red).length;
    for (const stat of ['reps', 'trails', 'thrown', 'hits', 'close', 'dodged', 'wind', 'scattered', 'recovered', 'glanced', 'gates'] as const) seen[stat] += sheet.stats[stat];
    if (sheet.stats.beast !== BELL_RESULT.pending) seen.beasts += 1;
    // The barogram is the run's, second by second, whichever way it ended.
    assert.equal(sheet.trace.n, Math.floor(sheet.steps / 60) + 1);
    assert.equal(sheet.trace.alt[0], CLOUD_GATE.y);
  }
  // Natural v5 flights cover ordinary soaring and endings. Rare high-altitude hazards are
  // exercised deliberately by their own fixtures rather than depending on a former balance seed.
  for (const what of ['fog', 'quit', 'landed', 'lines', 'reps']) assert.ok(seen[what] > 0, `${seen[what]} ${what}`);

});

test('a run replayed in slices of any size ends the same', () => {
  const { sheet, text } = recorded()[0];
  const log = readLog(text);
  for (const sizes of [[1], [2], [7], [60], [599], [1000], [log.steps], [1, 13, 0, 250, 3]]) {
    const replay = createReplay({ log });
    assert.deepEqual([replay.done, replay.result], [false, null]);
    let slices = 0;
    while (!replay.advance(sizes[slices % sizes.length])) {
      slices += 1;
      assert.equal(replay.done, false);
      assert.equal(replay.result, null);
    }
    // It finishes on the very call that flies its last step, never one later.
    let flies = 0;
    for (let at = 0; at < log.steps; flies++) at += sizes[flies % sizes.length];
    assert.equal(slices + 1, flies);
    assert.equal(replay.done, true);
    assert.deepEqual(replay.result, sheet, `slices of ${sizes}`);
    // Done is done: it flies nothing more and its sheet stays the one it handed back.
    const result = replay.result;
    assert.equal(replay.advance(100), true);
    assert.equal(replay.result, result);
  }
  // A slice of no steps flies none: a log of one step is not over until that step is flown.
  const one = createReplay({ log: { ...log, steps: 1, bits: log.bits.subarray(0, 1) } });
  assert.deepEqual([one.advance(0), one.advance(0), one.result], [false, false, null]);
  assert.equal(one.advance(1), true);
  assert.deepEqual([sheetOf(one.result).reason, sheetOf(one.result).steps], ['quit', 1]);
});

test('two runs stepped side by side do not disturb each other', () => {
  const runs = recorded();
  const [one, other] = [runs[1], runs[8]].map(({ text }) => createReplay({ log: readLog(text) }));
  // A live run flown at the same time, a step of it between slices of the two replays.
  const live = SKIES[15];
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells() }), live.seed);
  const bitsOf = live.pilot();
  let reason = null;
  while (!one.done || !other.done || !reason) {
    if (!reason) {
      reason = world.steps < live.quit! ? stepBits(world, bitsOf(world)) : 'quit';
      if (reason) finishRun(world, reason);
    }
    one.advance(1);
    other.advance(3);
  }
  assert.deepEqual(one.result, runs[1].sheet);
  assert.deepEqual(other.result, runs[8].sheet);
  assert.deepEqual(summariseRun(world, reason), runs[15].sheet);
});

test('a log from another sim version is refused before anything is flown', () => {
  const { text } = recorded()[2];
  const log = readLog(text);
  for (const simVersion of [SIM_VERSION - 1, SIM_VERSION + 1, SIM_VERSION + 7]) {
    assert.deepEqual(replayLog({ ...log, simVersion }), { error: 'version' });
    const replay = createReplay({ log: { ...log, simVersion } });
    assert.deepEqual([replay.done, replay.result], [true, { error: 'version' }]);
    assert.equal(replay.advance(), true);
  }
  // A link reads the same whatever version it was flown under; the replay is what says no.
  const old = decodeLog(encodeLog({ ...log, simVersion: SIM_VERSION + 1 }, log.bits, log.steps));
  assert.ok(old.ok);
  assert.deepEqual(replayLog(old.log), { error: 'version' });
});

test('a log that flies on past the end of its run is corrupt, and one that stops short of it is a run its pilot ended', () => {
  const runs = recorded();
  const longer = (log: RunLog, extra: number, bits = 0) => {
    const more = new Uint8Array(log.steps + extra).fill(bits);
    more.set(log.bits);
    return { ...log, steps: log.steps + extra, bits: more };
  };
  for (const { sheet, text } of [runs[0], runs[18]]) {
    const log = readLog(text);
    assert.ok(isJudgedEnding(sheet.reason));
    assert.deepEqual(replayLog(longer(log, 1)), { error: 'corrupt' });
    assert.deepEqual(replayLog(longer(log, 600, INPUT.left)), { error: 'corrupt' });
  }
  // Cut ten seconds before the natural ending, it is the same run ended there: the lines it judged by then,
  // and the bar on it forfeited.
  const { sheet, text } = runs[0];
  const log = readLog(text);
  const cut = log.steps - 600;
  const short = sheetOf(replayLog({ ...log, steps: cut, bits: log.bits.subarray(0, cut) }));
  assert.deepEqual([short.reason, short.steps, short.seed], ['quit', cut, sheet.seed]);
  assert.deepEqual(short.lifts, sheet.lifts.filter((lift: { line: number; at: number; }) => lift.line > 0 && lift.at <= short.seconds));
  assert.ok(short.total <= sheet.total && short.peak <= sheet.peak);
  // A log of no steps at all is a run ended at the gate.
  const none = sheetOf(replayLog({ ...log, steps: 0, bits: new Uint8Array(0) }));
  assert.deepEqual([none.reason, none.steps, none.seconds, none.total, none.peak, none.lifts, none.trace.n], ['quit', 0, 0, 0, CLOUD_GATE.y, [], 1]);
});

// How many arrays and buffers `run` makes in any way a call can be caught: by a constructor, with
// or without `new`, by a constructor's `from` or `of`, or by a method that hands back a new one
// (the same watch wind-streaks.test.js keeps on drawing a frame).
const TYPED = Object.getPrototypeOf(Int8Array);
const MAKERS: Array<[object, string[]]> = [
  [globalThis, ['Array', 'ArrayBuffer', 'DataView', 'Float32Array', 'Float64Array', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'BigInt64Array', 'BigUint64Array']],
  [Array, ['from', 'of']],
  [TYPED, ['from', 'of']],
  [Object, ['keys', 'values', 'entries', 'getOwnPropertyNames']],
  [Array.prototype, ['concat', 'filter', 'flat', 'flatMap', 'map', 'slice', 'splice', 'toReversed', 'toSorted', 'toSpliced', 'with']],
  [TYPED.prototype, ['filter', 'map', 'slice', 'subarray', 'toReversed', 'toSorted', 'with']],
  [ArrayBuffer.prototype, ['slice']],
  [String.prototype, ['split']],
];
function arraysMadeBy(run: () => unknown) {
  let made = 0;
  const count = {
    apply(target: Function, self: unknown, args: unknown[]) { made += 1; return Reflect.apply(target, self, args); },
    construct(target: Function, args: unknown[], newTarget: Function) { made += 1; return Reflect.construct(target, args, newTarget); },
  };
  const swapped: Array<[object, string, PropertyDescriptor]> = [];
  try {
    for (const [owner, names] of MAKERS) {
      for (const name of names) {
        const real = Object.getOwnPropertyDescriptor(owner, name);
        if (typeof real?.value !== 'function') continue;
        Object.defineProperty(owner, name, { ...real, value: new Proxy(real.value, count) });
        swapped.push([owner, name, real]);
      }
    }
    run();
  } finally {
    for (const [owner, name, real] of swapped) Object.defineProperty(owner, name, real);
  }
  return made;
}

test('a replay makes no array or buffer as it flies, only the sheet it hands back at the end, whatever the run met', () => {
  assert.ok(arraysMadeBy(() => new Float32Array(1)) > 0 && arraysMadeBy(() => {}) === 0, 'the watch sees what it should');
  // Exercise long ordinary and gate-seeking runs, including predicted hazard flight.
  const algiz = recorded()[23];
  for (const run of [recorded()[3], algiz]) {
    const { sheet, text } = run;
    const replay = createReplay({ log: readLog(text) });
    let slices = 0;
    while (!replay.done) {
      const made = arraysMadeBy(() => replay.advance(600));
      slices += 1;
      if (!replay.done) assert.equal(made, 0, `seed ${run.seed}, slice ${slices}`);
    }
    assert.ok(slices > 10);
    assert.deepEqual(replay.result, sheet);
  }

});
