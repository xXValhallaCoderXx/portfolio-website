// The variometer's beep for a climb of `vy` m/s: its pitch (Hz) and the seconds from one beep to
// the next. Over the fjord the lift tops out at a few metres a second, and the beep is at its
// fastest by 6 m/s. In a run a thermal's core lifts at up to about 28 m/s, and centring on it is
// done by ear: the beep has to keep rising, in rate and in pitch, all the way up, or a surge on one
// side of the circle sounds the same as the core.
export const VARIO = Object.freeze({
  fjord: Object.freeze({ pitch: 620, rise: 85, gap: 0.42, quicken: 0.05, fastest: 0.11 }),
  run: Object.freeze({ pitch: 520, rise: 55, gap: 0.42, quicken: 0.0118, fastest: 0.09 }),
});

/** The beep for `vy` m/s of climb, written into `out` ({ pitch, gap }); `run` picks the run's scale. */
export function varioTone(vy, run, out = { pitch: 0, gap: 0 }) {
  const scale = run ? VARIO.run : VARIO.fjord;
  out.pitch = scale.pitch + vy * scale.rise;
  out.gap = Math.max(scale.fastest, scale.gap - vy * scale.quicken);
  return out;
}
