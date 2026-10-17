// Keyboard and touch share one gesture clock. Only fixed simulation steps advance it.
export const BRAKE_TAP_WINDOW = 0.3;

export function createBrakeInput({ window = BRAKE_TAP_WINDOW } = {}) {
  const interval = Number.isFinite(window) && window > 0 ? window : BRAKE_TAP_WINDOW;
  const edges = [];
  let clock = 0, held = false, forced = false, deep = false, firstAt = -Infinity;
  let armed = false, blocked = false;
  const output = { brake: false, deepBrake: false };

  function reset({ held: down = false, forceDeep = false } = {}) {
    edges.length = 0; clock = 0; held = !!down; forced = !!forceDeep;
    deep = armed = false; firstAt = -Infinity; blocked = held;
    output.brake = held; output.deepBrake = false;
    return output;
  }

  // Queue aggregate holder edges, including taps wholly between two physical steps. DOM event
  // timestamps, click/dblclick events and key repeat never determine the gesture's timing.
  function edge(down, { forceDeep = false, active = true } = {}) {
    if (!active) return reset({ held: down, forceDeep });
    edges.push({ held: !!down, forced: !!forceDeep });
  }

  function apply(next) {
    if (next.forced && !forced) { firstAt = -Infinity; armed = deep = false; }
    forced = next.forced;
    if (next.held === held) return;
    held = next.held;
    if (!held) {
      const canArm = !blocked && !deep && !forced && clock - firstAt <= interval + 1e-9;
      deep = false;
      if (blocked) { blocked = false; armed = false; firstAt = -Infinity; }
      else armed = canArm;
      return;
    }
    if (blocked) return;
    deep = !forced && armed && clock - firstAt <= interval + 1e-9;
    armed = false;
    if (forced || deep) firstAt = -Infinity;
    else firstAt = clock;
  }

  function step(dt, { held: down = held, forceDeep = forced, active = true } = {}) {
    if (!active) return reset({ held: down, forceDeep });
    for (const next of edges) apply(next);
    edges.length = 0;
    apply({ held: !!down, forced: !!forceDeep });
    output.brake = held;
    output.deepBrake = held && !blocked && (deep || forced);
    clock += Math.max(0, Number.isFinite(dt) ? dt : 0);
    if (clock - firstAt > interval + 1e-9) armed = false;
    return output;
  }
  return { edge, step, reset };
}
