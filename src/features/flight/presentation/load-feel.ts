// The load on the lines as the camera, the wind and the readouts feel it: g, eased over `time`
// seconds so a gust's jolt or a line's snatch never jerks the picture, and 1 on the ground.
// Presentation only: it never touches a force, a score or a sample of the air.

export const LOAD_FEEL = Object.freeze({ time: 0.5 });

// The telemetry line's "1.8 g": shown from `show` g (`phone` on a small screen, where the line has
// less room), kept while it eases off, and gone once the load is back under `hide`, near 1 g.
export const LOAD_READOUT = Object.freeze({ show: 1.4, phone: 1.6, hide: 1.2 });

/** Frame-rate independent easing of the load; paused frames keep it still. */
export function createLoadFeel() {
  let value = 1;
  return {
    reset(load = 1) { value = Number.isFinite(load) ? load : 1; },
    step(load: number, dt: number) {
      if (Number.isFinite(load) && Number.isFinite(dt) && dt > 0) value += (load - value) * (1 - Math.exp(-dt / LOAD_FEEL.time));
      return value;
    },
    get value() { return value; },
  };
}

/** What the telemetry line shows of the eased `load`: "1.8 g", or '' near 1 g. `shown` is whether it shows now. */
export function loadReadout(load: number, compact: boolean, shown: boolean) {
  if (!Number.isFinite(load) || load < (shown ? LOAD_READOUT.hide : compact ? LOAD_READOUT.phone : LOAD_READOUT.show)) return '';
  return `${load.toFixed(1)} g`;
}
