// Feeling for the core. A hunted thermal lifts hardest at its middle (cloudbase-state.js), so a
// circle off the middle climbs harder on the side nearest the core than across from it: the lift
// surges once a circle. Pilots centre on that surge: they straighten as it comes and turn again as
// it fades, and the circle moves onto the core. This feels for it as a pilot does, in the lift with
// the thermal's own waxing and wearing out taken away, so only where the circle goes is felt. It
// only reads, so nothing a run flies depends on it, and it makes nothing as it steps.
export const SURGE = Object.freeze({
  // m/s each second the lift (at the thermal's full strength) must be climbing by to be a surge.
  // A circle's lift swings by about 0.8 m/s² for each metre it is off the core, hands up or on
  // the light brake, so this is a circle some 2.5 m off: what the design study's best pilot
  // straightened on.
  rise: 2,
  // Seconds the felt rate takes to follow the lift: a pilot's own lag in feeling it.
  feel: 0.2,
  // m/s²: a surge is over once the lift stops climbing, and only then may the next one come.
  over: 0,
  // Radians a thermal must be circled before a surge counts: lift building as the pilot flies into
  // it is not a circle off the core.
  settle: Math.PI,
  // A thermal fainter than this (its strength, 0 to 1) is too far gone to centre in.
  weak: 0.5,
});

export function createSurge() {
  // `felt` is the lift the last step felt and `rate` how fast it is climbing (m/s²); `armed` says
  // the last surge is over; `turned` is the turning (rad) done in this thermal; `surges` counts them.
  const state = { felt: NaN, rate: 0, armed: false, turned: 0, surges: 0 };

  /** Starts over: a new run, or the pilot out of the thermal, folded, stalled or in cloud. */
  function reset() {
    state.felt = NaN;
    state.rate = state.turned = 0;
    state.armed = false;
  }

  /**
   * One step of `dt` seconds. `lift` is the rising air at the glider (m/s), `strength` the ridden
   * thermal's (0 to 1) and `yawRate` the glider's turn (rad/s); `riding` says the glider is flying
   * in a hunted thermal: not folded, stalled or in cloud. True on the step a surge begins.
   */
  function step(dt, lift, strength, yawRate, riding) {
    if (!riding || strength < SURGE.weak) {
      if (!Number.isNaN(state.felt)) reset();
      return false;
    }
    const felt = lift / strength;
    if (Number.isNaN(state.felt)) {
      state.felt = felt;
      return false;
    }
    state.rate += ((felt - state.felt) / dt - state.rate) * Math.min(1, dt / SURGE.feel);
    state.felt = felt;
    state.turned += Math.abs(yawRate) * dt;
    if (state.rate <= SURGE.over) state.armed = true;
    if (!state.armed || state.turned < SURGE.settle || state.rate <= SURGE.rise) return false;
    state.armed = false;
    state.surges += 1;
    return true;
  }

  return { reset, step, get state() { return state; } };
}
