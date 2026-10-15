import test from 'node:test';
import assert from 'node:assert/strict';
import { CUES, LOOP_STEPS, SWING_GAUGE, swingGauge } from './swing-gauge.js';
import { createSwingWatch } from './swing-watch.js';
import { BRAKE, PITCH, ROLL, TUCK, createFlight, stepFlight } from './flight.js';

const STEP = 1 / 60;
const DEG = Math.PI / 180;
const stillAir = () => ({ lift: 0, sink: 0, windX: 0, windZ: 0, calm: false, rough: 0, clearance: Infinity });
const swinging = (over = {}) => ({ turn: 0, brake: false, bar: false, locked: false, harsh: false, linger: true, climb: null, swing: true, ...over });

// A wing, its watch and its gauge, flown on together a step at a time; `drive(g, controls, gauge)`
// before each step and `seen(gauge, g)` after, if given.
function flown(controls = swinging(), { folds = true } = {}) {
  const g = createFlight({ x: 0, y: 5000, z: 0 });
  const watch = createSwingWatch();
  const gauge = {};
  const fly = (seconds, drive = null, seen = null) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      drive?.(g, controls, gauge);
      stepFlight(g, controls, stillAir(), STEP);
      watch.step(STEP, g, false, controls);
      swingGauge(g, watch.state, folds, STEP, gauge);
      seen?.(gauge, g);
    }
  };
  return { g, watch, gauge, controls, fly };
}

test('the gauge stays down in level flight and in a thermalling turn, and comes up for a big swing, a wingover or a moment to act, lingering after', () => {
  const level = flown();
  level.fly(5, null, (gauge) => assert.equal(gauge.on, false, 'level'));
  const circling = flown(swinging({ turn: 1 }));
  circling.fly(20, null, (gauge) => assert.equal(gauge.on, false, 'circling'));
  // An ordinary press and let-go of the light brake neither.
  const eased = flown(swinging({ brake: true }));
  eased.fly(6, (g, controls) => (controls.brake = g.brake < BRAKE.shelf - 0.02), (gauge) => assert.equal(gauge.on, false, 'eased'));
  // A surge brings it up, and it stays up a while after.
  const { g, gauge, fly } = flown();
  g.pitchRate = -1.6;
  fly(STEP);
  assert.equal(gauge.on, true);
  let up = 0;
  fly(8, null, (each) => (up += each.on ? STEP : 0));
  assert.ok(gauge.on === false && up > SWING_GAUGE.linger, `up ${up.toFixed(2)} s`);
});

test('the bank and the pitch move the dot across and up its arms, clamped at their ends, in whole steps', () => {
  const at = (bank, pitch) => {
    const g = Object.assign(createFlight(), { bank, pitch });
    return swingGauge(g, createSwingWatch().state, true, STEP, {});
  };
  assert.deepEqual([at(0, 0).x, at(0, 0).y], [0, 0]);
  assert.equal(at(SWING_GAUGE.side / 2, 0).x, 50);
  assert.equal(at(-2, 0).x, -100);
  // Ahead is up, behind is down.
  assert.equal(at(0, -SWING_GAUGE.ahead).y, -67);
  assert.equal(at(0, -3).y, -67);
  assert.equal(at(0, SWING_GAUGE.behind / 3).y, 11);
  for (const [bank, pitch] of [[0.123, -0.456], [-0.77, 0.21]]) {
    const { x, y } = at(bank, pitch);
    assert.ok(Number.isInteger(x) && Number.isInteger(y));
  }
});

test('a surge heading for the fold says catch it, until it swings back', () => {
  const { g, gauge, fly } = flown();
  g.pitchRate = -2.2;
  fly(STEP);
  assert.equal(gauge.cue, CUES.catch);
  let caught = false;
  fly(2, (wing, controls) => (controls.brake = wing.pitch < 0 && wing.pitchRate < 0), (each, wing) => {
    if (wing.pitchRate > 0) caught = true;
    if (caught) assert.notEqual(each.cue, CUES.catch);
  });
  // Caught and let go, the swing left over is never told to be pumped.
  const pump = [CUES.press, CUES.release];
  fly(6, (wing, controls) => (controls.brake = false), (each) => assert.ok(!pump.includes(each.cue) && !pump.includes(each.coming), `${each.cue}, ${each.coming}`));
});

test('a swing being pitched says press just after it peaks ahead and let go just after it peaks behind', () => {
  const { watch, gauge, fly } = flown();
  // Pitched by hand until it is plainly a swing being built (the cues wait for that), then by the
  // cues alone.
  let rate = 0;
  let timer = -1;
  let want = false;
  const said = new Set();
  fly(10, (g, controls, each) => {
    if (watch.state.clock === 0) controls.brake = true;
    if (watch.state.building < 2) {
      if (rate < 0 && g.pitchRate >= 0) [timer, want] = [0.2, true];
      if (rate > 0 && g.pitchRate <= 0) [timer, want] = [0.2, false];
      if (timer >= 0 && (timer -= STEP) < 0) controls.brake = want;
    } else {
      if (each.cue === CUES.press) controls.brake = true;
      if (each.cue === CUES.release) controls.brake = false;
      said.add(each.cue);
    }
    rate = g.pitchRate;
  });
  assert.ok(said.has(CUES.press) && said.has(CUES.release), [...said].join(', '));
  assert.ok(watch.state.building >= 3 && gauge.band >= 2, `building ${watch.state.building}, band ${gauge.band}`);
});

test('a wingover says swap as it tops out, the other way, and not once the swap is asked for', () => {
  const { g, gauge, controls, fly } = flown(swinging({ turn: 1 }));
  fly(20);
  controls.turn = -1;
  const swaps = [];
  // Swapped on the cue, each time, for a few tops.
  fly(8, (wing, asked, each) => {
    if (each.cue === CUES.left) asked.turn = -1;
    if (each.cue === CUES.right) asked.turn = 1;
  }, (each, wing) => {
    if (each.cue === CUES.left || each.cue === CUES.right) {
      swaps.push(each.cue);
      // Always the way back from the side it tops out on.
      assert.equal(each.cue === CUES.left ? 1 : -1, Math.sign(wing.bank));
      assert.ok(wing.turn * Math.sign(wing.bank) >= 0, 'never once the swap is asked for');
    }
  });
  assert.ok(swaps.includes(CUES.left) && swaps.includes(CUES.right));
  assert.equal(gauge.mode, 'roll');
  assert.ok(Math.abs(g.bank) > 50 * DEG || gauge.band >= 2, `band ${gauge.band}`);
});

test('the first top after a reversal shows its swap on the gauge alone, and only a wingover under way is told it aloud and by the wing', () => {
  // A circle turned the other way, and held: its top shows the swap on the gauge, and nothing tells it.
  const circle = flown(swinging({ turn: 1 }));
  circle.fly(20);
  circle.controls.turn = -1;
  let shown = 0;
  let told = 0;
  circle.fly(5, null, (each) => {
    if (each.cue === CUES.left || each.cue === CUES.right) shown += 1;
    if (each.coming === CUES.left || each.coming === CUES.right) told += 1;
  });
  assert.ok(shown > 0, 'shown on the gauge');
  assert.equal(told, 0);
  // Swapped on the gauge at that first top, the next top is told, and so is each one after it.
  const wing = flown(swinging({ turn: 1 }));
  wing.fly(20);
  wing.controls.turn = -1;
  const toldAfter = [];
  let swaps = 0;
  wing.fly(6, (g, asked, each) => {
    const want = each.cue === CUES.left ? -1 : each.cue === CUES.right ? 1 : 0;
    if (want !== 0 && asked.turn !== want) {
      asked.turn = want;
      swaps += 1;
    }
  }, (each) => {
    if (each.coming === CUES.left || each.coming === CUES.right) toldAfter.push(swaps);
  });
  assert.ok(swaps >= 3 && toldAfter.length > 0, `${swaps} swaps, told on ${toldAfter.length} steps`);
  assert.ok(Math.min(...toldAfter) >= 1, 'never before the first swap at a top');
  assert.ok(toldAfter.includes(swaps - 1) || toldAfter.includes(swaps), 'and still told at the last');
});

test('a folded wing says hold the brake, its ring filling, then let go, while pumps are left; a stalled one held on says let go', () => {
  const watch = createSwingWatch().state;
  const gauge = {};
  const read = (wing, hands) => {
    swingGauge(wing, watch, true, STEP, gauge, hands);
    return [gauge.cue, gauge.coming, Number(gauge.soon.toFixed(3))];
  };
  // A front collapse, its pumps the wing's own.
  const g = Object.assign(createFlight({ x: 0, y: 5000, z: 0 }), { tuck: 1.2, tuckHeld: 0, tuckPumps: 0 });
  assert.deepEqual(read(g), [CUES.pump, CUES.pump, 1]);
  g.tuckHeld = TUCK.pump.hold / 2;
  assert.deepEqual(read(g), [CUES.pump, CUES.pump, 0.5]);
  g.tuckHeld = TUCK.pump.hold;
  assert.deepEqual(read(g), [CUES.release, CUES.release, 0]);
  assert.equal(gauge.on, true, 'and the gauge is up for it');
  g.tuckPumps = TUCK.pump.most;
  assert.deepEqual(read(g).slice(0, 2), [CUES.none, CUES.none], 'pumped all it can be: nothing more to do');
  // A struck wing, its pumps as run-step.js counts them.
  const struck = createFlight({ x: 0, y: 5000, z: 0 });
  assert.deepEqual(read(struck, { brake: true, fold: 1.5, held: 0.1, pumps: 1 }).slice(0, 2), [CUES.pump, CUES.pump]);
  assert.deepEqual(read(struck, { brake: true, fold: 1.5, held: 0.3, pumps: 1 }).slice(0, 2), [CUES.release, CUES.release]);
  // Stalled: let go, while the brake is still held.
  const stalled = Object.assign(createFlight({ x: 0, y: 5000, z: 0 }), { stall: 1.5 });
  assert.deepEqual(read(stalled, { brake: true, fold: 0, held: 0, pumps: 0 }).slice(0, 2), [CUES.release, CUES.release]);
  assert.deepEqual(read(stalled, { brake: false, fold: 0, held: 0, pumps: 0 }).slice(0, 2), [CUES.none, CUES.none]);
});

test('round a loop it says ▲ as the pilot comes over the wing and ▼ as they come under it, foretold as each moment comes, and nothing once it falls out', () => {
  const watch = createSwingWatch().state;
  const gauge = {};
  const read = (over) => {
    swingGauge(Object.assign(createFlight({ x: 0, y: 5000, z: 0 }), { loop: 1, loopRate: 3, loopNext: Math.PI }, over), watch, true, STEP, gauge);
    return [gauge.mode, gauge.cue, gauge.coming];
  };
  // Its top 0.17 s off, within the window: ▲, lit.
  assert.deepEqual(read({ loopAngle: Math.PI - 0.5 }), ['loop', CUES.up, CUES.up]);
  // 0.67 s off: foretold, its ring closing.
  assert.deepEqual(read({ loopAngle: Math.PI - 2 }), ['loop', CUES.none, CUES.up]);
  assert.ok(gauge.soon > 0.5 && gauge.soon < 1, `soon ${gauge.soon}`);
  assert.equal(gauge.on, true);
  // Its top just gone unpressed: still ▲, for a press that is late. Its bottom coming: ▼.
  assert.deepEqual(read({ loopAngle: Math.PI + 0.2, loopNext: 2 * Math.PI, loopLate: true }), ['loop', CUES.up, CUES.up]);
  assert.deepEqual(read({ loopAngle: 2 * Math.PI - 0.4, loopNext: 2 * Math.PI }), ['loop', CUES.down, CUES.down]);
  // Pressed for already, or falling out: nothing to do. Falling out, the ring goes, for the bank it
  // swings back with and any fold it ended in.
  assert.deepEqual(read({ loopAngle: Math.PI - 0.5, loopEarly: true }).slice(1), [CUES.none, CUES.none]);
  assert.deepEqual(read({ loopAngle: Math.PI - 0.5, loopOut: true }).slice(1), [CUES.none, CUES.none]);
  assert.notEqual(gauge.mode, 'loop');
  assert.equal(gauge.round, 0);
  // The dot goes round its ring: a quarter turn the way a right loop goes.
  read({ loopAngle: Math.PI / 2 });
  assert.equal(gauge.round, LOOP_STEPS / 4);
  read({ loop: -1, loopAngle: Math.PI / 2 });
  assert.equal(gauge.round, -LOOP_STEPS / 4);
});

test('the red ends warn only where the wing can fold, as it comes near the tuck or the tip, and never round a loop', () => {
  const near = (folds, pitch, bank = 0, loop = 0) => swingGauge(Object.assign(createFlight(), { pitch, bank, loop, loopAngle: Math.abs(bank) }), createSwingWatch().state, folds, STEP, {});
  assert.equal(near(true, -(PITCH.line - 2 * DEG)).near, true);
  assert.equal(near(true, -(PITCH.line - 10 * DEG)).near, false);
  assert.equal(near(true, 0, ROLL.limit - 2 * DEG).near, true);
  assert.equal(near(true, 0, ROLL.limit - 2 * DEG, 1).near, false);
  assert.equal(near(false, -(PITCH.line - 2 * DEG)).near, false);
  assert.deepEqual([near(false, 0).safe, near(true, 0).safe], [true, false]);
});

test('a moment to act is foretold: a wingover\'s swap as its top comes, its ring closing to the moment, and a surge to catch before it peaks', () => {
  const { gauge, controls, fly } = flown(swinging({ turn: 1 }));
  fly(20);
  controls.turn = -1;
  // Through the first swing of the wingover, swapping on the cue: before each swap the coming swap
  // is told, `soon` falling to the moment.
  const told = [];
  fly(4, (g, asked, each) => {
    if (each.cue === CUES.left) asked.turn = -1;
    if (each.cue === CUES.right) asked.turn = 1;
  }, (each) => {
    if ((each.coming === CUES.left || each.coming === CUES.right) && each.cue === CUES.none) told.push(each.soon);
  });
  assert.ok(told.length > 10, `foretold over ${told.length} steps`);
  assert.ok(told[0] > 0.5 && Math.min(...told) < 0.2, `soon from ${told[0].toFixed(2)} down to ${Math.min(...told).toFixed(2)}`);
  for (let i = 1; i < told.length; i++) if (told[i] > told[i - 1] + 1e-9) assert.ok(told[i] - told[i - 1] > 0.5, 'falling, but for starting over at the next swing');
  // A surge: the catch is told at once, `soon` saying how near its peak is.
  const surge = flown();
  surge.g.pitchRate = -2.2;
  surge.fly(STEP);
  assert.equal(surge.gauge.coming, CUES.catch);
  const first = surge.gauge.soon;
  surge.fly(0.25);
  assert.ok(surge.gauge.soon < first, `${surge.gauge.soon} after ${first}`);
  assert.ok(gauge.soon >= 0 && gauge.soon <= 1);
});
