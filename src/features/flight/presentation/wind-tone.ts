// The wind in the lines, as the airspeed and the load make it (flight-audio.js plays it): louder and
// brighter the faster the wing flies, a whistle as it runs past its own trim, and a low buffet as the
// lines load or the air turns rough. At trim, in smooth air, the classic wing sounds as it always has.
// Pure: it says what to play, and plays nothing.
//
//   bright   the wind's low-pass: `base` Hz at trim, `slope` Hz more a m/s over it, kept within `low`
//            and `high`, its resonance `q` (dB, as Web Audio reads a low-pass's Q)
//   whistle  a band `from` Hz to `to` Hz, rising and swelling to `gain` as the speed over trim comes
//            to `over` m/s (with the square of it, so a little over trim is near silent)
//   buffet   up to `gain`, from `light` g to `heavy` g, or from `calm` to `rough` m/s of turbulence
export const WIND_TONE = Object.freeze({
  bright: Object.freeze({ base: 480, slope: 28, low: 260, high: 1400, q: 1 }),
  whistle: Object.freeze({ gain: 0.05, over: 12, from: 2000, to: 4000 }),
  buffet: Object.freeze({ gain: 0.06, light: 1.3, heavy: 3, calm: 0.15, rough: 1.2 }),
});

// The noise every rushing sound is cut from (flight-audio.js): white, and as loud for each hertz at
// any sample rate as at `rate`, so a 96 kHz context's wind is no quieter than a 48 kHz one's.
export const NOISE = Object.freeze({ rate: 48000 });

/** How far the shared noise reaches either side of 0 in a context running at `sampleRate`: 1 at NOISE.rate. */
export const noiseReach = (sampleRate: number) => Math.sqrt(sampleRate / NOISE.rate);

export interface WindTone { loud: number; bright: number; whistle: number; whistleAt: number; buffet: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smoothstep = (from: number, to: number, value: number) => {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};

/** The wind for `speed` m/s on a wing trimmed at `trim`, at `load` g in air `turbulence` m/s rough, into `out`. */
export function windTone(speed: number, trim: number, load: number, turbulence: number, out: Partial<WindTone> = {}): WindTone {
  const { bright, whistle, buffet } = WIND_TONE;
  const over = clamp((speed - trim) / whistle.over, 0, 1);
  out.loud = 0.02 + speed * 0.004;
  out.bright = clamp(bright.base + (speed - trim) * bright.slope, bright.low, bright.high);
  out.whistle = whistle.gain * over * over;
  out.whistleAt = whistle.from + (whistle.to - whistle.from) * over;
  out.buffet = buffet.gain * Math.max(smoothstep(buffet.light, buffet.heavy, load), smoothstep(buffet.calm, buffet.rough, turbulence));
  return out as WindTone;
}

/**
 * How loud the wind is (dBFS RMS) at `speed` m/s on a wing trimmed at `trim`, in smooth air at 1 g,
 * in a context running at `sampleRate`: the noise through the wind's low-pass at windTone's level.
 * What the music is held under (music.test.js).
 */
export function windLevelDb(speed: number, trim: number, sampleRate: number) {
  const tone = windTone(speed, trim, 1, 0);
  // The low-pass as Web Audio builds it, and the share of white noise's power it lets through: the
  // sum of its impulse response squared, which has died away long before the last of these steps.
  const w = 2 * Math.PI * tone.bright / sampleRate, cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * 10 ** (WIND_TONE.bright.q / 20)), a0 = 1 + alpha;
  const b0 = (1 - cos) / 2 / a0, b1 = (1 - cos) / a0, a1 = -2 * cos / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, power = 0;
  for (let n = 0; n < 32768; n++) {
    const x = n === 0 ? 1 : 0, y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y; power += y * y;
  }
  // Uniform noise reaching ±r is r/√3 RMS.
  return 20 * Math.log10(noiseReach(sampleRate) / Math.sqrt(3) * Math.sqrt(power) * tone.loud);
}
