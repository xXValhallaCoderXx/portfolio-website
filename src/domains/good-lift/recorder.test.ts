import type { RunWorld } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT, LOG_FORMAT, MAX_LINK, MAX_STEPS, createRecorder, decodeLog, encodeLog, inputBits } from './recorder.ts';
import { createRunWorld, finishRun, startRun, stepBits } from './run-step.ts';
import { createReferencePilot } from './pilots.ts';
import { createCloudbaseRun } from './cloudbase-state.ts';
import { createMeet } from './meet-state.ts';
import { createBells } from './bells.ts';
import { summariseRun } from './meet-sheet.ts';
import { SIM_VERSION } from './sim-version.ts';
import { LOG_WINGS } from './glider-ids.ts';
import type { WithImplicitCoercion } from 'node:buffer';

const firstSkies = (count: number) => Array.from({ length: count }, (_, i) => i + 1);
const BASE64URL = /^[A-Za-z0-9_-]*$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
// A link's bytes as Node's own base64url reads them, and bytes written out by it: a second opinion
// on the recorder's, for building and taking apart links by hand.
const bytesOf = (text: WithImplicitCoercion<string>) => [...Buffer.from(text, 'base64url')];
const textOf = (bytes: number[]) => Buffer.from(bytes).toString('base64url');
const META = Object.freeze({ simVersion: 0, glider: 'en-a', seed: 7, day: 0, touch: false, initials: '', total: 25, peak: 300 });

test('the ten-minute deadline fits the current format even when every fixed step changes digital input', () => {
  assert.equal(MAX_STEPS, 36_000);
  assert.equal(LOG_FORMAT, 3);
  const bits = Uint8Array.from({ length: MAX_STEPS }, (_, i) => i % 32);
  const text = encodeLog({ ...META, simVersion: SIM_VERSION }, bits, bits.length);
  assert.ok(text.length <= MAX_LINK);
  const decoded = decodeLog(text);
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.log.bits, Uint32Array.from(bits));
  assert.throws(() => encodeLog(META, new Uint8Array(MAX_STEPS + 1), MAX_STEPS + 1), RangeError);
});

// A fixed stream of numbers from 0 to 1 for a seed, so a test's made-up runs are the same every time.
function numbers(seed: number) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// `steps` of controls from `seed`, each held for 1 to `longest` steps.
function madeUp(seed: number, steps: number, longest: number) {
  const next = numbers(seed);
  const bits = new Uint8Array(steps);
  for (let i = 0; i < steps;) {
    const held = Math.floor(next() * 32);
    const end = Math.min(steps, i + 1 + Math.floor(next() * longest));
    bits.fill(held, i, end);
    i = end;
  }
  return bits;
}

// The reference pilot (pilots.js) at the keys, turning its asks by degrees into the four controls
// as a player's fingers would. Every `hold` steps it picks which way to steer and holds that arrow
// until it picks again, for any turn of more than a third; or, with `pulse`, taps the arrow for the
// share of those steps its turn asks for. Its brake follows its hands at once. Between lifts it
// pushes the speed bar, with the bar's own key or, with `chord`, both arrows at once, as a phone
// does, and only when it has no turning to do. Its keys are written as the game writes them
// (inputBits), so the bar it still holds while its brake catches a dive stays the brake.
function keys(options = {}, { hold = 9, pulse = false, chord = false } = {}) {
  const pilot = createReferencePilot(options);
  const intent = { turn: 0, brake: false, bar: false };
  let side = 0;
  let on = 0;
  let glide = false;
  return (world: RunWorld) => {
    pilot.decide(world, intent);
    const phase = world.steps % hold;
    if (phase === 0) {
      side = intent.turn > 0 ? INPUT.right : INPUT.left;
      on = pulse ? Math.round(Math.abs(intent.turn) * hold) : Math.abs(intent.turn) > 1 / 3 ? hold : 0;
      glide = world.sky.state.pilot.thermal < 0 && !intent.brake;
    }
    let bits = phase < on ? side : 0;
    if (glide && chord && !bits) bits = INPUT.left | INPUT.right;
    return inputBits({ left: (bits & INPUT.left) !== 0, right: (bits & INPUT.right) !== 0, brake: intent.brake, bar: glide && !chord });
  };
}

// Flies a run on `seed` with the meet and the kettlebells through stepBits, as the game does, with
// `bitsOf(world)` at the keys and a recorder taking down every step. Returns the run's sheet, its
// link and the recorder.
function recordRun(seed: number, bitsOf: (world: RunWorld) => number) {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells() }), seed);
  const recorder = createRecorder();
  let reason = null;
  while (!reason) {
    const bits = bitsOf(world);
    assert.equal(recorder.push(bits), true);
    reason = stepBits(world, bits);
  }
  finishRun(world, reason);
  const sheet = summariseRun(world, reason);
  const text = encodeLog({ ...META, simVersion: SIM_VERSION, seed, total: sheet.total, peak: sheet.peak }, recorder.bits, recorder.steps);
  return { sheet, text, recorder };
}

test('a log of five-bit controls survives encoding and decoding whatever the run, and each log has one text', () => {
  const runs = [
    new Uint8Array(0), Uint8Array.of(0), Uint8Array.of(31), Uint8Array.of(3, 3, 3),
    // Every step a change, every value of the five bits in turn, and stretches long enough to need
    // a second and a third byte.
    Uint8Array.from({ length: 64 }, (_, i) => i % 2), Uint8Array.from({ length: 320 }, (_, i) => Math.floor(i / 10)),
    Uint8Array.from({ length: 2000 }, (_, i) => (i < 7 ? 1 : i < 15 ? 2 : i < 1039 ? 4 : 8)),
    new Uint8Array(MAX_STEPS), madeUp(1, MAX_STEPS, 400), madeUp(2, 9000, 12), madeUp(3, 777, 3),
  ];
  const metas = [
    META,
    { simVersion: 1, glider: 'classic', seed: 0x6785502f, day: 20756, touch: true, initials: 'REN', total: 487.5, peak: 1412 },
    { simVersion: 0xffffffff, glider: 'acro', seed: 0xffffffff, day: 0xffffffff, touch: false, initials: 'ZZZ', total: 2.5 * 0xffffffff, peak: 0xffffffff },
    { simVersion: 127, glider: 'en-d', seed: 0, day: 128, touch: true, initials: 'AAA', total: 0, peak: 0 },
  ];
  for (const meta of metas) {
    for (const bits of runs) {
      const text = encodeLog(meta, bits, bits.length);
      assert.ok(BASE64URL.test(text) && text.length <= MAX_LINK, `${text.length} characters`);
      const read = decodeLog(text);
      assert.ok(read.ok, read.why!);
      assert.deepEqual(read.log, { format: LOG_FORMAT, ...meta, steps: bits.length,
        bits: Uint32Array.from(bits) });
      // Read back and written again it is the very same text, and Node's own base64url agrees.
      assert.equal(encodeLog(read.log, read.log.bits, read.log.steps), text);
      assert.equal(textOf(bytesOf(text)), text);
    }
  }
  // Only the steps asked for are written, however much more the buffer holds; and a log of the
  // controls alone has every meta at its default but the wing, which is never assumed.
  const buffer = madeUp(4, 500, 20);
  assert.equal(encodeLog(META, buffer, 100), encodeLog(META, buffer.subarray(0, 100), 100));
  assert.deepEqual(decodeLog(encodeLog({ simVersion: 2, glider: 'en-c', seed: 9 }, buffer, 10)).log,
    { format: LOG_FORMAT, simVersion: 2, glider: 'en-c', seed: 9, day: 0, touch: false, initials: '', total: 0, peak: 0, steps: 10, bits: Uint32Array.from(buffer.slice(0, 10)) });
  assert.throws(() => encodeLog({ simVersion: 2, seed: 9 }, buffer, 10), RangeError);
});

test('every wing a log can name keeps its byte for good, and reads back as itself', () => {
  assert.deepEqual(LOG_WINGS, ['classic', 'en-a', 'en-b', 'en-c', 'en-d', 'acro']);
  for (const [byte, glider] of LOG_WINGS.entries()) {
    const text = encodeLog({ ...META, simVersion: SIM_VERSION, glider }, [0, 1], 2);
    assert.equal(bytesOf(text)[2], byte, glider);
    assert.equal(decodeLog(text).log!.glider, glider);
  }
});

test('a digital log is written byte for byte in the current format', () => {
  const bits = [...Array(90).fill(0), ...Array(12).fill(INPUT.right), ...Array(30).fill(INPUT.right | INPUT.bar), INPUT.left | INPUT.right, ...Array(5).fill(INPUT.brake)];
  const text = encodeLog({ simVersion: 1, glider: 'en-b', seed: 0x6785502f, day: 20756, touch: true, initials: 'REN', total: 487.5, peak: 1412 }, bits, bits.length);
  assert.equal(text, 'AwECL1CFZ5SiAQESBQ7DAYQLigFaAAwCHgoBAwUE');
  assert.deepEqual(bytesOf(text), [
    LOG_FORMAT,
    0x01,                   // sim version 1
    0x02,                   // the EN-B (LOG_WINGS)
    0x2f, 0x50, 0x85, 0x67, // the seed, lowest byte first
    0x94, 0xa2, 0x01,       // day 20,756, seven bits a byte, lowest first
    0x01,                   // flown on a touch screen
    0x12, 0x05, 0x0e,       // R, E, N
    0xc3, 0x01,             // 195 plates of 2.5 kg
    0x84, 0x0b,             // 1,412 m
    0x8a, 0x01,             // 138 steps
    90, 0,                 // 90 steps of nothing held
    12, INPUT.right,       // 12 of right
    30, INPUT.right | INPUT.bar, // 30 of right on the bar
    1, INPUT.left | INPUT.right, // 1 of left and right together
    5, INPUT.brake,         // 5 of the brake
  ]);
});

test('a recorder keeps every step of the longest run in one buffer, counts each change of the controls, and says when it is full', () => {
  assert.deepEqual([{}, { left: true }, { right: true }, { left: true, right: true }, { brake: true }, { right: true, bar: true }, { ears: true }, { left: true, ears: true }].map(inputBits),
    [0, 1, 2, 3, 4, 10, 12, 13]);
  assert.deepEqual(INPUT, { left: 1, right: 2, brake: 4, bar: 8, ears: 12, deepBrake: 16 });
  assert.ok(Object.isFrozen(INPUT));
  const recorder = createRecorder();
  const { buffer } = recorder.bits;
  assert.deepEqual([recorder.steps, recorder.changes, recorder.bits.length], [0, 0, 0]);
  for (const bits of [0, 0, 1, 1, 1, 0, 9, 9, 32 + 3]) assert.equal(recorder.push(bits), true);
  // Changes are counted from nothing held; anything above the five bits is not a control.
  assert.deepEqual([...recorder.bits], [0, 0, 1, 1, 1, 0, 9, 9, 3]);
  assert.deepEqual([recorder.steps, recorder.changes], [9, 4]);
  for (let i = recorder.steps; i < MAX_STEPS; i++) assert.equal(recorder.push(i % 7 === 0 ? INPUT.left : 0), true);
  assert.equal(recorder.steps, MAX_STEPS);
  // Full: four minutes of steps is more than the fog lets any run last, and the rest is refused.
  assert.equal(recorder.push(INPUT.brake), false);
  assert.equal(recorder.steps, MAX_STEPS);
  assert.equal(recorder.bits.length, MAX_STEPS);
  assert.notEqual(recorder.bits[MAX_STEPS - 1], INPUT.brake);
  recorder.reset();
  assert.deepEqual([recorder.steps, recorder.changes, recorder.bits.length], [0, 0, 0]);
  assert.equal(recorder.push(INPUT.right), true);
  assert.equal(recorder.bits.buffer, buffer, 'one buffer for every run');
  assert.deepEqual([...recorder.bits], [INPUT.right]);
});

// Measured over 20 skies (seeds 1 to 20) with the meet and the kettlebells, every run to the fog,
// under SIM_VERSION 1 and then 2: changes of the controls a run, then characters of link (median /
// most).
//   arrows held 150 ms at a time, bar key on the glide     1   123 / 142     350 /   400
//                                                          2    91 / 115     264 /   328
//   the same on the light brake, eased                     1   200 / 261     539 /   692
//                                                          2   176 / 205     474 /   551
//   arrows held 67 ms at a time                            1   165 / 208     446 /   563
//                                                          2   116 / 148     320 /   394
//   light brake, both arrows for the bar, held 100 ms      1   240 / 279     631 /   736
//                                                          2   200 / 221     532 /   583
//   arrows tapped three times a second, steering by share  1   624 / 692    1300 / 1452
//                                                          2   482 / 580    1016 / 1222
//   tapped five times a second                             1   873 / 1111   1678 / 2112
//                                                          2   697 / 927    1356 / 1819
//   tapped five times a second, light brake, eased         1  1130 / 1383   1942 / 2355
//                                                          2  1011 / 1295   1838 / 2350
test('ears win over deep brake, then working brake, then bar, with resolved depth recorded', () => {
  const all = new Set<number>();
  for (let held = 0; held < 64; held++) {
    const input = { left: !!(held & 1), right: !!(held & 2), brake: !!(held & 4), bar: !!(held & 8), ears: !!(held & 16), deepBrake: !!(held & 32) };
    const bits = inputBits(input);
    all.add(bits);
    assert.equal(bits & 3, held & 3);
    const expected = input.ears ? INPUT.ears : input.deepBrake ? INPUT.deepBrake | INPUT.brake : input.brake ? INPUT.brake : input.bar ? INPUT.bar : 0;
    assert.equal(bits & 28, expected, JSON.stringify(input));
  }
  assert.equal(inputBits({ brake: true, bar: true }), INPUT.brake);
  assert.equal(inputBits({ deepBrake: true, bar: true }), INPUT.deepBrake | INPUT.brake);
  assert.equal(inputBits({ deepBrake: true, ears: true }), INPUT.ears);
  assert.deepEqual([...all].sort((a, b) => a - b), [...Array(16).keys(), 20, 21, 22, 23]);
});


test('whole digital runs fit the bounded log and replayable input format', () => {
  const pilots = {
    'arrows held 150 ms': () => keys({}, { hold: 9 }),
    'arrows held 67 ms': () => keys({}, { hold: 4 }),
    'both arrows for the bar': () => keys({ brake: 'eased' }, { hold: 6, chord: true }),
    'tapped three times a second': () => keys({}, { hold: 18, pulse: true }),
  };
  for (const [name, pilot] of Object.entries(pilots)) {
    let longest = 0;
    for (const seed of firstSkies(6)) {
      const { sheet, text, recorder } = recordRun(seed, pilot());
      assert.ok(['fog', 'landed', 'time'].includes(sheet.reason));
      assert.ok(sheet.steps > 0 && sheet.steps <= MAX_STEPS);
      assert.equal(decodeLog(text).log!.steps, recorder.steps);
      longest = Math.max(longest, text.length);
    }
    assert.ok(longest <= MAX_LINK, `${name}: ${longest} characters`);
  }
});

test('a cut-short, padded or tampered link is refused rather than misread', () => {
  const { text } = recordRun(2, keys({ brake: 'eased' }, { hold: 6, chord: true }));
  assert.equal(decodeLog(text).ok, true);
  // Cut anywhere at all, it ends before its steps do.
  for (let length = 0; length < text.length; length++) {
    assert.deepEqual(decodeLog(text.slice(0, length)), { ok: false, why: 'truncated' }, `cut to ${length}`);
  }
  // Padded, or with anything after its end.
  for (const tail of ['=', '==', 'A', 'AA', 'AAA', 'AAAA', 'Q', ' ', '\n', '.', ')']) {
    assert.deepEqual(decodeLog(text + tail), { ok: false, why: 'corrupt' }, JSON.stringify(tail));
  }
  // Any one character changed is refused, or read as exactly the log that text writes, never as a
  // log some other text would: a decoder that patched up damage could not be trusted with a board.
  let refused = 0;
  let read = 0;
  for (let i = 0; i < text.length; i++) {
    const was = ALPHABET.indexOf(text[i]);
    for (const shift of [1, 2, 31, 63]) {
      const changed = text.slice(0, i) + ALPHABET[(was + shift) % 64] + text.slice(i + 1);
      const decoded = decodeLog(changed);
      if (!decoded.ok) {
        refused += 1;
        continue;
      }
      read += 1;
      const encoded = encodeLog(decoded.log, decoded.log.bits, decoded.log.steps);
      assert.equal(encoded, changed);
    }
  }
  assert.ok(refused > read, `${refused} refused, ${read} read as other logs`);
  // Characters base64url does not use, padding among them, and things that are not text at all.
  for (const bad of [`${text.slice(0, 8)}+${text.slice(9)}`, `${text.slice(0, 8)}/${text.slice(9)}`, `${text.slice(0, 8)}%${text.slice(9)}`, `${text.slice(0, 8)}é${text.slice(9)}`, ` ${text}`]) {
    assert.deepEqual(decodeLog(bad), { ok: false, why: 'corrupt' });
  }
  for (const nothing of [null, undefined, 42, {}, [text], new String(text)]) assert.deepEqual(decodeLog(nothing), { ok: false, why: 'corrupt' });
  assert.deepEqual(decodeLog(''), { ok: false, why: 'truncated' });
  assert.deepEqual(decodeLog('A'.repeat(MAX_LINK + 1)), { ok: false, why: 'long' });
});

test('a link whose bytes are not exactly a log of a supported format is refused, each for what is wrong with it', () => {
  // A small log taken apart: format, version, the EN-A, seed, day, flags, initials, 10 plates, 300 m,
  // 6 steps, then 3 steps of nothing held, 2 of right and 1 of the brake.
  const whole = [LOG_FORMAT, 0, 1, 7, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0xac, 0x02, 6, 3, 0, 2, 2, 1, 4];
  assert.equal(textOf(whole), encodeLog(META, [0, 0, 0, 2, 2, 4], 6));
  assert.equal(decodeLog(textOf(whole)).ok, true);
  const swap = (at: number, count: number, ...bytes: number[]) => textOf([...whole.slice(0, at), ...bytes, ...whole.slice(at + count)]);
  const cases = {
    // Format 2 named no wing: its bytes read as format 3's would misread every one after the version.
    format: [swap(0, 1, 1), swap(0, 1, 2), swap(0, 1, 4), swap(0, 1, 0), swap(0, 3, 2, 0)],
    glider: [swap(2, 1, LOG_WINGS.length), swap(2, 1, 0xff)],
    long: [swap(15, 1, 0xa1, 0x99, 0x02)],
    truncated: [swap(15, 1, 7), textOf(whole.slice(0, 14)), textOf([LOG_FORMAT]), textOf([LOG_FORMAT, 0])],
    corrupt: [
      swap(1, 1, 0x80, 0x00),                         // the version written the long way
      swap(1, 1, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01), // a number of six bytes
      swap(1, 1, 0xff, 0xff, 0xff, 0xff, 0x7f),       // a number over 32 bits
      swap(8, 1, 2),                                  // a flag nobody sets
      swap(9, 3, 1, 0, 0),                            // one initial of three
      swap(9, 3, 27, 1, 1),                           // a 27th letter
      swap(16, 1, 0),                                 // a stretch of no steps
      swap(16, 2, 1, 0, 2, 0),                        // two stretches holding the same
      swap(15, 1, 4),                                 // stretches running past the steps
      textOf([...whole, 0]),                          // a byte after the last stretch
    ],
  };
  for (const [why, texts] of Object.entries(cases)) {
    for (const text of texts) assert.deepEqual(decodeLog(text), { ok: false, why }, `${why}: ${bytesOf(text).join(' ')}`);
  }
  // The largest number a varint carries is read as it is, and so is the longest log there can be.
  assert.equal(decodeLog(swap(1, 1, 0xff, 0xff, 0xff, 0xff, 0x0f)).log!.simVersion, 0xffffffff);
  const longest = decodeLog(textOf([...whole.slice(0, 15), 0xa0, 0x99, 0x02, 0xa0, 0x99, 0x02, 0]));
  assert.deepEqual([longest.ok, longest.log?.steps, longest.log?.bits.every((bits: number) => bits === 0)], [true, MAX_STEPS, true]);
  // Bytes that do not fill the last character leave bits over, which a log leaves 0. Set one and
  // the same bytes have a second text; it is refused, though Node's own reader would let it pass.
  const short = [LOG_FORMAT, 0, 1, 7, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0xac, 0x02, 4, 3, 0, 1, 2];
  const exact = textOf(short);
  assert.deepEqual([exact.length, decodeLog(exact).ok], [27, true]);
  const nudged = exact.slice(0, -1) + String.fromCharCode(exact.charCodeAt(exact.length - 1) + 1);
  assert.deepEqual(bytesOf(nudged), short);
  assert.deepEqual(decodeLog(nudged), { ok: false, why: 'corrupt' });
});

test('a log the format cannot hold exactly is never written', () => {
  const bits = [0, 1, 2];
  const bad = [
    { format: 0 }, { format: 1 }, { format: LOG_FORMAT + 1 },
    { simVersion: -1 }, { simVersion: 1.5 }, { simVersion: 2 ** 32 }, { simVersion: undefined },
    { glider: undefined }, { glider: '' }, { glider: 'EN-A' }, { glider: 'en-e' }, { glider: 1 }, { glider: '__proto__' },
    { seed: -1 }, { seed: 2 ** 32 }, { seed: '7' },
    { day: -1 }, { day: 0.5 },
    { initials: 'ren' }, { initials: 'AB' }, { initials: 'ABCD' }, { initials: null },
    { total: 1.2 }, { total: -2.5 }, { total: '25' }, { total: NaN }, { total: Infinity },
    { peak: 1.5 }, { peak: -1 },
  ];
  for (const change of bad) assert.throws(() => encodeLog({ ...META, ...change }, bits, 3), RangeError, JSON.stringify(change));
  for (const [list, steps] of [[bits, 4], [bits, -1], [bits, 1.5], [[0, 32], 2], [[0, -1], 2], [[0, 0.5], 2], [new Uint8Array(MAX_STEPS + 1), MAX_STEPS + 1]] as const) {
    assert.throws(() => encodeLog(META, list, steps), RangeError, `${steps} steps`);
  }
});
