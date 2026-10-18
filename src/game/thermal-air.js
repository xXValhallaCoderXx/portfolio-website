// Presentation only: rising thermal air before the wing's sink, terrain air and hazards.
export const THERMAL_AIR = Object.freeze({ feel: 0.6, history: 1, deadband: 0.25, scale: 6 });

export function showThermalAir({ airborne, manual, circling, lift, map, briefing, portal, instruction }) {
  return !!(airborne && manual && circling && lift > 0.05 && !map && !briefing && !portal &&
    !instruction?.warning && !instruction?.lessonId &&
    !['lesson', 'recover', 'hazard', 'descent', 'building', 'timing'].includes(instruction?.state));
}

/** Exponential filtering and a one-second history, using a bounded presentation-only ring. */
export function createThermalAir() {
  const times = new Float64Array(128), values = new Float64Array(128);
  let value, clock, first, count, trend;
  function reset(lift = 0) {
    value = Number.isFinite(lift) ? Math.max(0, lift) : 0;
    clock = 0; first = 0; count = 2; trend = 'STEADY';
    times[0] = -THERMAL_AIR.history; times[1] = 0;
    values[0] = values[1] = value;
  }
  function step(lift, dt) {
    if (!(Number.isFinite(dt) && dt > 0 && Number.isFinite(lift))) return value;
    value += (Math.max(0, lift) - value) * (1 - Math.exp(-dt / THERMAL_AIR.feel));
    clock += dt;
    const target = clock - THERMAL_AIR.history;
    // Keep both points around the comparison time for interpolation, including after slow frames.
    while (count > 2 && times[(first + 1) % times.length] <= target) {
      first = (first + 1) % times.length; count--;
    }
    const last = (first + count - 1) % times.length;
    if (clock - times[last] >= 1 / 60 - 1e-8) {
      if (count === times.length) { first = (first + 1) % times.length; count--; }
      const slot = (first + count++) % times.length;
      times[slot] = clock; values[slot] = value;
    }
    let before = first, after = first;
    for (let n = 1; n < count; n++) {
      after = (first + n) % times.length;
      if (times[after] >= target) break;
      before = after;
    }
    const mix = Math.max(0, Math.min(1, (target - times[before]) / (times[after] - times[before] || 1)));
    const previous = values[before] + (values[after] - values[before]) * mix;
    const change = value - previous;
    trend = change > THERMAL_AIR.deadband ? 'STRONGER' : change < -THERMAL_AIR.deadband ? 'WEAKER' : 'STEADY';
    return value;
  }
  reset();
  return { reset, step, get value() { return value; }, get trend() { return trend; },
    get fill() { return Math.min(1, value / THERMAL_AIR.scale); } };
}
