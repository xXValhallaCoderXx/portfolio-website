// A run's log: the controls held at every fixed step. Given the seed of its sky, that is all a
// run of Good Lift is made of (run-step.js flies a run from nothing else), so a log replays to the
// very run it was recorded from (replay.js), travels in a challenge link (#vs=) and is the proof a
// board row keeps of its total. Pure and free of imports, like the step it feeds.
//
// A link, format 1, is these bytes written in base64url without padding:
//
//   u8       the format: 1
//   varint   the sim version the run was flown under (sim-version.js)
//   u32 LE   the sky's seed
//   varint   the UTC day of a Daily Sky, or 0 for any other sky
//   varint   flags: bit 0, flown on a touch screen
//   3 × u8   the pilot's initials, 1 to 26 for A to Z, or three 0s for none
//   varint   the total claimed, in 2.5 kg plates
//   varint   the peak claimed, in whole metres
//   varint   steps
//   varint   (steps held << 4) | bits, for each stretch of steps the controls were held the same,
//            until the stretches add up to `steps`
//
// A varint is LEB128: seven bits a byte, the lowest first, the top bit set on every byte but the
// last. Every log has one text and every text one log: no number takes more bytes than it needs, no
// stretch is empty or holds what the one before it held, and nothing follows the last, not even
// padding. A decoder that read a damaged link as best it could would give two texts of one run two
// rows on a board, and a link nobody wrote would be a run nobody flew, so whatever is not exactly a
// log is refused, never repaired. The total and peak a link claims are only what it says: whoever
// reads one replays it for the real numbers.

export const LOG_FORMAT = 1;
// Steps a log can hold: 240 s at 60 steps a second. The fog ends every run well inside that.
export const MAX_STEPS = 14_400;
// Characters of a link read at all. A whole run's log comes to a few hundred, or about two thousand
// for a pilot tapping the arrows five times a second all the way up.
export const MAX_LINK = 8_192;
// The controls, as the bits of one fixed step (run-step.js's stepBits): left and right together are
// the speed bar, so a phone with only the two arrows can push it, and the brake and the bar
// together are the big ears. The brake has always won over the bar, so that pair meant nothing of
// its own until the ears took it, and the links of runs flown before them fly as they always did.
export const INPUT = Object.freeze({ left: 1, right: 2, brake: 4, bar: 8, ears: 12 });

// Both ▼ on a touch screen pressed together are the big ears: the second within `together` fixed
// steps of the first, and both held `hold` steps. After that either ▼ keeps them in, so the other
// thumb can steer. A change of thumb starts from one ▼ held far longer than `together`, and a quick
// handover lets go within `hold`, so neither is ever the ears, however long the thumbs overlap.
export const TOUCH_EARS = Object.freeze({ together: 12, hold: 6 });

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
// Each character's six bits, by its code; -1 for any character base64url does not use.
const SEXTET = new Int8Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) SEXTET[ALPHABET.charCodeAt(i)] = i;
// The largest number a varint may carry, and the most bytes it may take to carry it.
const UINT = 0xffffffff;
const VARINT = 5;
// The most bytes a log can take before its first stretch: format, version, seed, day, flags,
// initials, total, peak and steps. A stretch takes at most three (MAX_STEPS << 4 is under 2^21).
const HEAD = 1 + VARINT + 4 + VARINT + VARINT + 3 + VARINT + VARINT + VARINT;
const NAMED = /^(?:[A-Z]{3})?$/;
const KG = 2.5;

const isUint = (value) => Number.isInteger(value) && value >= 0 && value <= UINT;
const refused = (why) => ({ ok: false, why });

function need(ok, what, value) {
  if (!ok) throw new RangeError(`a log cannot hold ${what} ${typeof value === 'string' ? JSON.stringify(value) : String(value)}`);
}

/**
 * The bits of one step for the controls held as `input` ({ left, right, brake, bar, ears }, as the
 * game keeps them). The brake wins over the ears and the ears over the bar, so the brake and the bar
 * are only ever written together as the ears: the bar still held while braking is the brake, as the
 * step always flew it.
 */
export function inputBits(input) {
  const turn = (input.left ? INPUT.left : 0) | (input.right ? INPUT.right : 0);
  return turn | (input.brake ? INPUT.brake : input.ears ? INPUT.ears : input.bar ? INPUT.bar : 0);
}

/**
 * Tells, step by step, whether the two ▼ of a touch screen are holding the big ears (TOUCH_EARS).
 * `step(first, second)` takes whether each ▼ is held this fixed step and says whether the ears are;
 * nothing else is read, so the bits a run records are all its replay needs.
 */
export function createTouchEars() {
  // Steps since each ▼ went down (-1 while it is up), how long both have been held, and whether
  // the ears are in.
  let first = -1;
  let second = -1;
  let both = 0;
  let on = false;

  function reset() {
    first = second = -1;
    both = 0;
    on = false;
  }

  function step(a, b) {
    first = a ? first + 1 : -1;
    second = b ? second + 1 : -1;
    if (!a && !b) {
      on = false;
      both = 0;
      return false;
    }
    if (on) return true;
    // Both down, and the later of the two went down within `together` steps of the earlier.
    both = a && b && Math.abs(first - second) <= TOUCH_EARS.together ? both + 1 : 0;
    on = both >= TOUCH_EARS.hold;
    return on;
  }

  return { reset, step, get on() { return on; } };
}

/**
 * Records a run's controls step by step, into one buffer made here and reused for every run.
 *
 *   reset()      starts a new log
 *   push(bits)   adds one step's controls (inputBits); false once the log is full, MAX_STEPS long,
 *                when the run has outgrown any link and should be ended
 *   steps        steps recorded
 *   bits         the steps recorded, a Uint8Array view onto the recorder's own buffer: encode it
 *                (encodeLog) before the next run writes over it
 *   changes      how often the controls changed from one step to the next, from none held
 */
export function createRecorder() {
  const buffer = new Uint8Array(MAX_STEPS);
  let steps = 0;
  let changes = 0;
  let last = 0;
  return {
    reset() {
      steps = changes = last = 0;
    },
    push(bits) {
      if (steps >= MAX_STEPS) return false;
      const held = bits & 15;
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
 * A run's log as a link's text. `meta` is { simVersion, seed, day, touch, initials, total, peak }:
 * the sim version and the seed the run was flown under; the Daily Sky's UTC day, or 0 for any other
 * sky; whether it was flown on a touch screen; '' or three letters A to Z; and the total (kg, a
 * multiple of 2.5) and peak (whole metres) it claims. `bits` holds the controls of each of the
 * first `steps` steps, 0 to 15 (a recorder's `bits`). Throws a RangeError for anything the format
 * cannot hold exactly, rather than write a log that says something else.
 */
export function encodeLog(meta, bits, steps) {
  const { simVersion, seed, day = 0, touch = false, initials = '', total = 0, peak = 0 } = meta;
  need(isUint(simVersion), 'the sim version', simVersion);
  need(isUint(seed), 'the seed', seed);
  need(isUint(day), 'the day', day);
  need(typeof initials === 'string' && NAMED.test(initials), 'the initials', initials);
  need(typeof total === 'number' && isUint(total / KG), 'the total', total);
  need(isUint(peak), 'the peak', peak);
  need(Number.isInteger(steps) && steps >= 0 && steps <= MAX_STEPS && bits?.length >= steps, 'the steps', steps);
  const bytes = new Uint8Array(HEAD + 3 * steps);
  let size = 0;
  const varint = (value) => {
    while (value > 0x7f) {
      bytes[size++] = (value % 0x80) | 0x80;
      value = Math.floor(value / 0x80);
    }
    bytes[size++] = value;
  };
  bytes[size++] = LOG_FORMAT;
  varint(simVersion);
  for (let i = 0; i < 4; i++) bytes[size++] = (seed >>> (8 * i)) & 0xff;
  varint(day);
  varint(touch ? 1 : 0);
  for (let i = 0; i < 3; i++) bytes[size++] = initials ? initials.charCodeAt(i) - 64 : 0;
  varint(total / KG);
  varint(peak);
  varint(steps);
  for (let i = 0; i < steps;) {
    const held = bits[i];
    need(Number.isInteger(held) && held >= 0 && held <= 15, `the controls of step ${i}`, held);
    let end = i + 1;
    while (end < steps && bits[end] === held) end += 1;
    varint((end - i) * 16 + held);
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
 * { simVersion, seed, day, touch, initials, total, peak, steps, bits } as encodeLog was given them
 * (`bits` a Uint8Array of `steps`); or { ok: false, why } for any text that is not exactly a log:
 *
 *   long       more than MAX_LINK characters, or more than MAX_STEPS steps
 *   format     a log, but not of format 1: from some other build of the game
 *   truncated  cut short: it ends before its steps do
 *   corrupt    anything else: a character base64url does not use (padding among them), a number
 *              written the long way, flags or initials that cannot be, a stretch of no steps, one
 *              that holds what the last held or runs past the steps, or anything after the last
 *
 * Never throws, whatever it is handed. It does not ask which sim version the log was flown under;
 * a replay does (replay.js).
 */
export function decodeLog(text) {
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
  if (byte() !== LOG_FORMAT) return refused('format');
  const simVersion = varint();
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
    const letter = (code) => code >= 1 && code <= 26;
    if (!letter(first) || !letter(second) || !letter(third)) return refused('corrupt');
    initials = String.fromCharCode(64 + first, 64 + second, 64 + third);
  }
  if (steps > MAX_STEPS) return refused('long');
  const bits = new Uint8Array(steps);
  let filled = 0;
  let last = -1;
  while (filled < steps) {
    const value = varint();
    if (why) return refused(why);
    const held = value % 16;
    const span = (value - held) / 16;
    if (span === 0 || held === last || span > steps - filled) return refused('corrupt');
    bits.fill(held, filled, filled + span);
    filled += span;
    last = held;
  }
  // Nothing may follow the last stretch: no byte, no stray character, no bit.
  if (at !== size || pool !== 0 || text.length !== Math.ceil((size * 8) / 6)) return refused('corrupt');
  return { ok: true, log: { simVersion, seed, day, touch: flags === 1, initials, total: plates * KG, peak, steps, bits } };
}
