// The moment to turn into a thermal. A hunted core lifts hardest at its middle (cloudbase-state.js),
// so a pilot flying at the flock's middle and turning there puts the core on the rim of the first
// circle, and the ride is two or three laps too short to put that right. Passing the core instead
// on the side the flock turns to, a few metres off its middle, and turning as the lift stops
// building, the first circle goes round it: that wing lifts as the core comes abeam, and real
// pilots turn into the lifted wing. This calls that moment, once a thermal: flying straight, the
// lift (at the thermal's full strength, so its waxing and wearing out are taken away) has been
// building and has stopped, it is strong enough to be within about 12 m of the middle, and the core
// lies to the flock's side. Measured on the run's own skies, it calls 80% of passes beside a core,
// about 8 m from it, and never a pass through the middle; turning on it, half the first circles are
// centred, where flying at the middle centres one in twenty. Like run-surge.js beside it, it only
// reads, so nothing a run flies depends on it, and it makes nothing as it steps.
export const ENTRY = Object.freeze({
  // m/s each second the lift (at full strength) must have been building by: flying into the core.
  rise: 2,
  // Seconds the felt rate takes to follow the lift: a pilot's own lag in feeling it, as SURGE.feel.
  feel: 0.2,
  // m/s (at full strength) the lift must have reached as it stops building: within about 12 m of a
  // hunted core's middle.
  near: 21,
  // The share of the thermal's radius (liftSide) the core must lie to the flock's side: 4.6 m or more.
  side: 0.12,
  // rad/s: turning harder than this, the glider is circling already, and too late to be told.
  straight: 0.3,
  // Radians turned in a thermal after which nothing is called: half a circle, as SURGE.settle.
  settle: Math.PI,
  // A thermal fainter than this (its strength, 0 to 1) is too far gone to fly into, as SURGE.weak.
  weak: 0.5,
});

export function createEntry() {
  // `felt` is the lift the last step felt and `rate` how fast it is climbing (m/s²); `building`
  // says it has been climbing faster than `rise` since it last stopped; `turned` is the turning
  // (rad) done in this thermal; `called` says the moment has been called in this thermal, and
  // `calls` counts them.
  const state = { felt: NaN, rate: 0, building: false, turned: 0, called: false, calls: 0 };

  /** Starts over: a new run, or the pilot out of the thermal, folded, stalled or in cloud. */
  function reset() {
    state.felt = NaN;
    state.rate = state.turned = 0;
    state.building = state.called = false;
  }

  /**
   * One step of `dt` seconds. `lift` is the rising air at the glider (m/s), `strength` the thermal's
   * (0 to 1), `yawRate` the glider's turn (rad/s), `liftSide` which side the core lies on (-1 left to
   * 1 right, as a share of the radius), `dir` the way the thermal's flock turns (1 right, -1 left) and
   * `riding` whether the glider is flying in a hunted thermal: not folded, stalled or in cloud.
   * Returns `dir` on the step the moment comes, and 0 on every other.
   */
  function step(dt, lift, strength, yawRate, liftSide, dir, riding) {
    if (!riding || strength < ENTRY.weak) {
      if (!Number.isNaN(state.felt)) reset();
      return 0;
    }
    const felt = lift / strength;
    if (Number.isNaN(state.felt)) {
      state.felt = felt;
      return 0;
    }
    state.rate += ((felt - state.felt) / dt - state.rate) * Math.min(1, dt / ENTRY.feel);
    state.felt = felt;
    state.turned += Math.abs(yawRate) * dt;
    if (state.called || state.turned >= ENTRY.settle) return 0;
    if (state.rate > ENTRY.rise) state.building = true;
    // The lift has been building and has stopped: the core is abeam, or as near as this pass comes.
    if (!state.building || state.rate > 0) return 0;
    state.building = false;
    if (Math.abs(yawRate) >= ENTRY.straight || felt < ENTRY.near || liftSide * dir < ENTRY.side) return 0;
    state.called = true;
    state.calls += 1;
    return dir;
  }

  return { reset, step, get state() { return state; } };
}
