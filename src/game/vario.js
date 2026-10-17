// One climb scale for the shared wing: useful soaring climbs occupy roughly0–5m/s. This is
// presentation only; neither filtering nor audio changes a force, score or weather sample.
const SCALE = Object.freeze({ pitch: 620, rise: 85, gap: 0.44, quicken: 0.065, fastest: 0.11 });
export const VARIO = Object.freeze({ fjord: SCALE, run: SCALE, feel: 0.6 });

/** The beep follows the glider's net climb, with useful separation across the soaring range. */
export function varioTone(vy, run, out = { pitch: 0, gap: 0 }) {
  const scale = run ? VARIO.run : VARIO.fjord;
  const climb = Math.max(0, Math.min(12, Number.isFinite(vy) ? vy : 0));
  out.pitch = scale.pitch + climb * scale.rise;
  out.gap = Math.max(scale.fastest, scale.gap - climb * scale.quicken);
  return out;
}

/** Frame-rate independent filtering for both the readout and beep; paused frames keep it still. */
export function createVario() {
  let value = 0;
  return {
    reset(vy = 0) { value = Number.isFinite(vy) ? vy : 0; },
    step(vy, dt) {
      if (Number.isFinite(vy) && Number.isFinite(dt) && dt > 0) value += (vy - value) * (1 - Math.exp(-dt / VARIO.feel));
      return value;
    },
    get value() { return value; },
  };
}
