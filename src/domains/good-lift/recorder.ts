import type { FlightInput } from '../flight/models.ts';
import type { RunIntent } from './models.ts';

export interface RunLogMetadata { format: number; simVersion: number; glider: LogWing; seed: number; day: number; touch: boolean; initials: string; total: number; peak: number }
export interface RunLog extends RunLogMetadata { steps: number; bits: Uint32Array }
export interface LogMetadataInput { format?: unknown; simVersion?: unknown; glider?: unknown; seed?: unknown; day?: unknown; touch?: unknown; initials?: unknown; total?: unknown; peak?: unknown }
export type LogDecodeResult = {ok: false; why: string; log?: never} | {ok: true; log: RunLog; why?: never};
export type RecordingInput = Omit<FlightInput, 'leftBrake' | 'rightBrake'> & {leftBrake?: unknown; rightBrake?: unknown};
// A run's log: the controls held at every fixed step. Given the seed of its sky, that is all a
// run of Good Lift is made of (run-step.js flies a run from nothing else), so a log replays to the
// very run it was recorded from (replay.js), travels in a challenge link (#vs=) and is the proof a
// board row keeps of its total. Pure, like the step it feeds.
//
// A link is these bytes written in base64url without padding:
//
//   u8       the format: 3 (digital and proportional brakes, and the wing)
//   varint   the sim version the run was flown under (sim-version.js)
//   u8       the wing it was flown on, by its place in LOG_WINGS (glider-ids.js): 0 the classic wing
//   u32 LE   the sky's seed
//   varint   the UTC day of a Daily Sky, or 0 for any other sky
//   varint   flags: bit 0, flown on a touch screen
//   3 × u8   the pilot's initials, 1 to 26 for A to Z, or three 0s for none
//   varint   the total claimed, in 2.5 kg plates
//   varint   the peak claimed, in whole metres
//   varint   steps
//   varint   steps held, followed by an action byte, for each stretch of steps the controls were
//            held the same, until the stretches add up to `steps`
// Actions 0..31 are digital bits; 32 is direct brakes, 33 direct ears and 34 direct bar. Direct actions
// carry two following u8 brake depths, left then right. Ears and bar require both depths zero.
//
// A varint is LEB128: seven bits a byte, the lowest first, the top bit set on every byte but the
// last. Every log has one text and every text one log: no number takes more bytes than it needs, no
// stretch is empty or holds what the one before it held, and nothing follows the last, not even
// padding. A decoder that read a damaged link as best it could would give two texts of one run two
// rows on a board, and a link nobody wrote would be a run nobody flew, so whatever is not exactly a
// log is refused, never repaired. The total and peak a link claims are only what it says: whoever
// reads one replays it for the real numbers.

import { RUN_RULES } from './run-rules.ts';
import { brakeByte } from '../flight/brake-controls.ts';
import { LOG_WINGS, isLogWing, type LogWing } from './glider-ids.ts';

export const LOG_FORMAT = 3;
// Every input through the ten-minute deadline fits, even when it changes every step.
export const MAX_STEPS = RUN_RULES.maxSteps;
// The decoder accepts a complete ten-minute trace even when input changes every fixed step.
export const MAX_LINK = 196_608;
// The controls, as the bits of one fixed step (run-step.js's stepBits): left and right together are
// the keyboard's speed-bar shortcut. The brake and bar bits together encode big ears. Deep brake has its own bit and also writes the ordinary brake
// bit, so intent is replayed directly without reconstructing device gesture timing.
export const INPUT = Object.freeze({ left: 1, right: 2, brake: 4, bar: 8, ears: 12, deepBrake: 16 });
// Packed canonical frames live in Uint32 buffers. The direct tag preserves even a hands-up
// direct frame: it does not become the keyboard's bank-target controller's neutral input.
export const DIRECT_FRAME = 0x10000;
const DIRECT_EARS = 0x20000;
const DIRECT_BAR = 0x40000;
const DIRECT_MASK = 0x7ffff;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
// Each character's six bits, by its code; -1 for any character base64url does not use.
const SEXTET = new Int8Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) SEXTET[ALPHABET.charCodeAt(i)] = i;
// The largest number a varint may carry, and the most bytes it may take to carry it.
const UINT = 0xffffffff;
const VARINT = 5;
// The most bytes a log can take before its first stretch: format, version, wing, seed, day, flags,
// initials, total, peak and steps.
const HEAD = 1 + VARINT + 1 + 4 + VARINT + VARINT + 3 + VARINT + VARINT + VARINT;
const NAMED = /^(?:[A-Z]{3})?$/;
const KG = 2.5;

const isUint = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= UINT;
const refused = (why: string): {ok: false; why: string} => ({ ok: false, why });

function need(ok: unknown, what: string, value: unknown): asserts ok {
  if (!ok) throw new RangeError(`a log cannot hold ${what} ${typeof value === 'string' ? JSON.stringify(value) : String(value)}`);
}

/**
 * The bits of one step for the controls held as `input` ({ left, right, brake, deepBrake, bar, ears }, as the
 * game keeps them). Dedicated ears win over deep brake, then working brake, then the bar, so the brake and the bar
 * are only ever written together as the ears: the bar still held while braking is the brake, as the
 * step always flew it.
 */
export function inputBits(input: Pick<FlightInput, 'left' | 'right' | 'brake' | 'deepBrake' | 'bar' | 'ears'>) {
  const turn = (input.left ? INPUT.left : 0) | (input.right ? INPUT.right : 0);
  return turn | (input.ears ? INPUT.ears : input.deepBrake ? INPUT.deepBrake | INPUT.brake : input.brake ? INPUT.brake : input.bar ? INPUT.bar : 0);
}

export function inputFrame(input: RecordingInput) {
  if (input.controlMode !== 'brakes') return inputBits(input);
  if (input.ears) return DIRECT_FRAME | DIRECT_EARS;
  const left = brakeByte(input.leftBrake), right = brakeByte(input.rightBrake);
  return DIRECT_FRAME | left | (right << 8) | (!(left || right) && input.bar ? DIRECT_BAR : 0);
}

export const isDirectFrame = (frame: number): boolean => Number.isInteger(frame) && (frame & DIRECT_FRAME) !== 0;
function validFrame(frame: number) {
  if (!isUint(frame)) return false;
  if (frame <= 31) return true;
  if (!isDirectFrame(frame) || (frame & ~DIRECT_MASK) || (frame & DIRECT_EARS && frame & DIRECT_BAR)) return false;
  return !(frame & (DIRECT_EARS | DIRECT_BAR)) || !(frame & 0xffff);
}

/** Decodes a frame without allocating when an output object is supplied. */
export function frameInput(frame: number): RunIntent;
export function frameInput<T extends FlightInput>(frame: number, out: T): T & RunIntent;
export function frameInput(frame: number, out: FlightInput = {}): RunIntent {
  if (isDirectFrame(frame)) {
    out.controlMode = 'brakes';
    out.leftBrake = (frame & 255) / 255;
    out.rightBrake = ((frame >>> 8) & 255) / 255;
    out.ears = !!(frame & DIRECT_EARS);
    out.bar = !!(frame & DIRECT_BAR);
    out.left = out.right = out.brake = out.deepBrake = false;
  } else {
    out.controlMode = 'legacy';
    out.leftBrake = out.rightBrake = 0;
    out.left = !!(frame & 1); out.right = !!(frame & 2);
    out.ears = (frame & 12) === 12;
    out.deepBrake = !out.ears && !!(frame & 16);
    out.brake = !out.ears && (!!(frame & 4) || out.deepBrake);
    out.bar = !out.ears && !out.brake && ((frame & 3) === 3 || !!(frame & 8));
  }
  out.turn = out.controlMode === 'brakes' ? out.rightBrake - out.leftBrake : out.left && out.right ? 0 : Number(out.right) - Number(out.left);
  return out as RunIntent;
}

/**
 * Records a run's controls step by step, into one buffer made here and reused for every run.
 *
 *   reset()      starts a new log
 *   push(frame)  adds one step's controls (inputFrame); false once the log is full, MAX_STEPS long,
 *                when the run has outgrown any link and should be ended
 *   steps        steps recorded
 *   bits         the steps recorded, a Uint32Array view onto the recorder's own buffer: encode it
 *                (encodeLog) before the next run writes over it
 *   changes      how often the controls changed from one step to the next, from none held
 */
export function createRecorder() {
  const buffer = new Uint32Array(MAX_STEPS);
  let steps = 0;
  let changes = 0;
  let last = 0;
  return {
    reset() {
      steps = changes = last = 0;
    },
    push(bits: number) {
      if (steps >= MAX_STEPS) return false;
      const held = isDirectFrame(bits) ? bits : bits & 31;
      need(validFrame(held), 'the controls', held);
      if (held !== last) changes += 1;
      last = held;
      buffer[steps] = held;
      steps += 1;
      return true;
    },
    get steps() { return steps; },
    get bits() { return buffer.subarray(0, steps); },
    get changes() { return changes; },
  };
}

/**
 * A run's log as a link's text. `meta` is { simVersion, glider, seed, day, touch, initials, total,
 * peak }: the sim version, the wing (LOG_WINGS: always named, never assumed) and the seed the run
 * was flown under; the Daily Sky's UTC day, or 0 for any other sky; whether it was flown on a touch
 * screen; '' or three letters A to Z; and the total (kg, a multiple of 2.5) and peak (whole metres)
 * it claims. `bits` holds the controls of each of the first `steps` steps (a recorder's `bits`).
 * Only the current LOG_FORMAT is written. Throws a RangeError for anything the format cannot hold
 * exactly.
 */
export function encodeLog(meta: LogMetadataInput, bits: ArrayLike<number> | null | undefined, steps: number) {
  const { simVersion, glider, seed, day = 0, touch = false, initials = '', total = 0, peak = 0, format = LOG_FORMAT } = meta;
  need(format === LOG_FORMAT, 'the format', format);
  need(isUint(simVersion), 'the sim version', simVersion);
  need(isLogWing(glider), 'the wing', glider);
  need(isUint(seed), 'the seed', seed);
  need(isUint(day), 'the day', day);
  need(typeof initials === 'string' && NAMED.test(initials), 'the initials', initials);
  need(typeof total === 'number' && isUint(total / KG), 'the total', total);
  need(isUint(peak), 'the peak', peak);
  need(Number.isInteger(steps) && steps >= 0 && steps <= MAX_STEPS && bits?.length! >= steps, 'the steps', steps);
  // A changed direct frame takes four bytes (span=1, action, two depths). Longer spans never
  // exceed that budget per step. One fixed buffer bounds even a maximally noisy ten-minute run.
  const bytes = new Uint8Array(HEAD + 4 * steps);
  let size = 0;
  const varint = (value: number) => {
    while (value > 0x7f) {
      bytes[size++] = (value % 0x80) | 0x80;
      value = Math.floor(value / 0x80);
    }
    bytes[size++] = value;
  };
  bytes[size++] = format;
  varint(simVersion);
  bytes[size++] = LOG_WINGS.indexOf(glider);
  for (let i = 0; i < 4; i++) bytes[size++] = (seed >>> (8 * i)) & 0xff;
  varint(day);
  varint(touch ? 1 : 0);
  for (let i = 0; i < 3; i++) bytes[size++] = initials ? initials.charCodeAt(i) - 64 : 0;
  varint(total / KG);
  varint(peak);
  varint(steps);
  for (let i = 0; i < steps;) {
    const held = bits![i];
    need(validFrame(held), `the controls of step ${i}`, held);
    let end = i + 1;
    while (end < steps && bits![end] === held) end += 1;
    varint(end - i);
    if (held <= 31) bytes[size++] = held;
    else {
      bytes[size++] = held & DIRECT_EARS ? 33 : held & DIRECT_BAR ? 34 : 32;
      bytes[size++] = held & 255;
      bytes[size++] = (held >>> 8) & 255;
    }
    i = end;
  }
  let text = '';
  for (let i = 0; i < size; i += 3) {
    const a = bytes[i];
    const b = i + 1 < size ? bytes[i + 1] : 0;
    const c = i + 2 < size ? bytes[i + 2] : 0;
    text += ALPHABET[a >> 2] + ALPHABET[((a & 3) << 4) | (b >> 4)];
    if (i + 1 < size) text += ALPHABET[((b & 15) << 2) | (c >> 6)];
    if (i + 2 < size) text += ALPHABET[c & 63];
  }
  return text;
}

/**
 * Reads a link's text back into the log it was written from: { ok: true, log }, `log` being
 * { format, simVersion, glider, seed, day, touch, initials, total, peak, steps, bits } as encodeLog
 * was given them (`bits` a Uint32Array); or { ok: false, why }:
 *
 *   long       more than MAX_LINK characters, or more than MAX_STEPS steps
 *   format     a log, but not of the current LOG_FORMAT
 *   glider     a log of a wing this build does not know (one added since, its byte past LOG_WINGS)
 *   truncated  cut short: it ends before its steps do
 *   corrupt    anything else: a character base64url does not use (padding among them), a number
 *              written the long way, flags or initials that cannot be, a stretch of no steps, one
 *              that holds what the last held or runs past the steps, or anything after the last
 *
 * Never throws, whatever it is handed. It does not ask which sim version the log was flown under,
 * nor whether its wing can be raced; a replay does (replay.js).
 */
export function decodeLog(text: unknown): LogDecodeResult {
  if (typeof text !== 'string') return refused('corrupt');
  if (text.length > MAX_LINK) return refused('long');
  // The characters back to bytes, keeping the bits that are left over: in a whole log, none.
  const bytes = new Uint8Array(Math.floor((text.length * 6) / 8));
  let size = 0;
  let pool = 0;
  let pooled = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const sextet = code < 128 ? SEXTET[code] : -1;
    if (sextet < 0) return refused('corrupt');
    pool = (pool << 6) | sextet;
    pooled += 6;
    if (pooled >= 8) {
      pooled -= 8;
      bytes[size++] = (pool >> pooled) & 0xff;
      pool &= (1 << pooled) - 1;
    }
  }
  // Read on past the end and the log was cut short; anything else wrong is said where it is met.
  let at = 0;
  let why = '';
  const byte = () => {
    if (at < size) return bytes[at++];
    why ||= 'truncated';
    return 0;
  };
  const varint = () => {
    let value = 0;
    for (let i = 0, scale = 1; i < VARINT; i++, scale *= 0x80) {
      if (at >= size) {
        why ||= 'truncated';
        return 0;
      }
      const next = bytes[at++];
      value += (next & 0x7f) * scale;
      if (next < 0x80) {
        // Written the short way only: a last byte of 0 after others is a number written twice.
        if ((i > 0 && next === 0) || value > UINT) why ||= 'corrupt';
        return value;
      }
    }
    why ||= 'corrupt';
    return 0;
  };
  if (size === 0) return refused('truncated');
  const format = byte();
  if (format !== LOG_FORMAT) return refused('format');
  const simVersion = varint();
  const wing = byte();
  if (!why && wing >= LOG_WINGS.length) return refused('glider');
  // Operands are read left to right, so the first byte is the lowest.
  const seed = (byte() | (byte() << 8) | (byte() << 16) | (byte() << 24)) >>> 0;
  const day = varint();
  const flags = varint();
  const first = byte();
  const second = byte();
  const third = byte();
  const plates = varint();
  const peak = varint();
  const steps = varint();
  if (why) return refused(why);
  if (flags > 1) return refused('corrupt');
  let initials = '';
  if (first || second || third) {
    const letter = (code: number) => code >= 1 && code <= 26;
    if (!letter(first) || !letter(second) || !letter(third)) return refused('corrupt');
    initials = String.fromCharCode(64 + first, 64 + second, 64 + third);
  }
  if (steps > MAX_STEPS) return refused('long');
  const bits = new Uint32Array(steps);
  let filled = 0;
  let last = -1;
  while (filled < steps) {
    const span = varint();
    if (why) return refused(why);
    const action = byte();
    let held;
    if (action <= 31) held = action;
    else if (action <= 34) {
      held = DIRECT_FRAME | (action === 33 ? DIRECT_EARS : action === 34 ? DIRECT_BAR : 0) | byte() | (byte() << 8);
    } else return refused('corrupt');
    if (why) return refused(why);
    if (!validFrame(held)) return refused('corrupt');
    if (span === 0 || held === last || span > steps - filled) return refused('corrupt');
    bits.fill(held, filled, filled + span);
    filled += span;
    last = held;
  }
  // Nothing may follow the last stretch: no byte, no stray character, no bit.
  if (at !== size || pool !== 0 || text.length !== Math.ceil((size * 8) / 6)) return refused('corrupt');
  return { ok: true, log: { format, simVersion, glider: LOG_WINGS[wing], seed, day, touch: flags === 1, initials, total: plates * KG, peak, steps, bits } };
}
