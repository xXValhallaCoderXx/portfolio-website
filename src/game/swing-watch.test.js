import test from 'node:test';
import assert from 'node:assert/strict';
import { BANDS, WATCH, bandOf, createSwingWatch } from './swing-watch.js';
import { BRAKE, PITCH, ROLL, createFlight, stepFlight } from './flight.js';

const STEP = 1 / 60;
const DEG = Math.PI / 180;
const stillAir = () => ({ lift: 0, sink: 0, windX: 0, windZ: 0, calm: false, rough: 0, clearance: Infinity });
const swinging = (over = {}) => ({ turn: 0, brake: false, bar: false, locked: false, harsh: false, linger: true, climb: null, swing: true, ...over });
// A wing high in still air and its watch, flown on together: `drive(t, g, controls, watch)` before
// each step, if given.
function watched(controls = swinging(), seconds = 0, drive = null) {
  const g = createFlight({ x: 0, y: 5000, z: 0 });
  const watch = createSwingWatch();
  const fly = (more, each = drive) => {
    for (let i = 0; i < Math.round(more * 60); i++) {
      each?.(i * STEP, g, controls, watch.state);
      stepFlight(g, controls, stillAir(), STEP);
      watch.step(STEP, g, false, controls);
    }
  };
  fly(seconds);
  return { g, watch, controls, fly };
}

test('the bands sit above what ordinary flying does and under the folds the swings risk', () => {
  // A brake let go swings the wing some 17° ahead, and one hard reversal of a held turn banks it 45°.
  assert.ok(BANDS.pitch[0] > 18 && BANDS.roll[0] > 46);
  assert.ok(BANDS.pitch.at(-1) <= PITCH.line / DEG - 5, 'the top pitch band under the tuck');
  assert.ok(BANDS.roll.at(-1) <= ROLL.limit / DEG - 5, 'the top wingover band under the tip');
  assert.deepEqual([0, 19.9, 20, 35, 50, 80].map((deg) => bandOf(BANDS.pitch, deg * DEG)), [0, 0, 1, 2, 4, 4]);
});

test('a free swing peaks ahead and behind, each counted, and dying away it is never a swing being built', () => {
  const { g, watch, fly } = watched();
  g.pitchRate = -1.2;
  fly(10);
  const { fronts, backs, front, building } = watch.state;
  assert.ok(fronts >= 2 && backs >= 1, `${fronts} forward and ${backs} back peaks`);
  assert.ok(front < 20 * DEG && building === 1, `the last forward peak ${(front / DEG).toFixed(1)}°, building ${building}`);
  // Peaks under `half` are no peaks at all.
  const small = watched();
  small.g.pitchRate = -0.3;
  small.fly(6);
  assert.equal(small.watch.state.fronts, 0);
});

test('pumping the brake in time builds the swing: forward peaks in a row that grow, which a let-go swing never makes', () => {
  // Pressed a fifth of a second after each forward peak and let go a fifth after each back one.
  let timer = -1;
  let want = false;
  let rate = 0;
  const pump = (t, g, controls) => {
    if (t === 0) controls.brake = true;
    if (rate < 0 && g.pitchRate >= 0) [timer, want] = [0.2, true];
    if (rate > 0 && g.pitchRate <= 0) [timer, want] = [0.2, false];
    if (timer >= 0 && (timer -= STEP) < 0) controls.brake = want;
    rate = g.pitchRate;
  };
  const { watch } = watched(swinging(), 9, pump);
  assert.ok(watch.state.building >= 3, `building ${watch.state.building}`);
  assert.ok(watch.state.front > 45 * DEG, `${(watch.state.front / DEG).toFixed(1)}° ahead`);
  // A brake held a while and let go swings it once, and the swing dies away.
  const once = watched(swinging({ brake: true }), 6);
  once.controls.brake = false;
  once.fly(10);
  assert.ok(once.watch.state.building <= 1, `building ${once.watch.state.building}`);
});

test('a surge heading for the fold, braked as it goes, is caught as it turns back short of the line; one that turns back by itself is not', () => {
  // Braked from `from` seconds into the surge while the wing still swings forward, or never.
  const surge = (from) => {
    const { g, watch, fly } = watched();
    g.pitchRate = -1.9;
    fly(4, (t, wing, controls) => {
      controls.brake = t >= from && wing.pitch < 0 && wing.pitchRate < 0;
    });
    return watch.state;
  };
  for (const from of [0, 0.3]) {
    const caught = surge(from);
    assert.equal(caught.catches, 1, `braked ${from} s in`);
    assert.ok(caught.caughtPeak > 0.1 && caught.caughtPeak < PITCH.line, `${(caught.caughtPeak / DEG).toFixed(1)}° ahead`);
  }
  assert.equal(surge(Infinity).catches, 0, 'left alone');
  // A swing too small to head for the fold is no surge to catch, braked or not.
  const { g, watch, fly } = watched();
  g.pitchRate = -1;
  fly(3, (t, wing, controls) => (controls.brake = wing.pitchRate < 0));
  assert.equal(watch.state.catches, 0);
});

test('wingover tops on alternate sides chain, and a top alone, or one long after the last, starts the chain over', () => {
  let rolling = 0;
  let last = 0;
  const swap = (t, g, controls) => {
    const rate = g.bank - last;
    if (rolling * rate < 0 && Math.abs(g.bank) > 0.3) controls.turn = g.bank > 0 ? -1 : 1;
    if (rate !== 0) rolling = rate;
    last = g.bank;
  };
  const { watch, controls, fly } = watched(swinging({ turn: 1 }), 20, null);
  controls.turn = -1;
  fly(6, swap);
  assert.ok(watch.state.chain >= 4 && watch.state.top > 60 * DEG, `chain ${watch.state.chain} at ${(watch.state.top / DEG).toFixed(1)}°`);
  // Flown level, the chain is over once the gap has gone.
  controls.turn = 0;
  fly(WATCH.gap + 1.5, null);
  assert.equal(watch.state.chain, 0);
  // One reversal of a held turn is a top alone: it links to nothing, and the wing settling into
  // the new turn after it tops out on the same side, short of a wingover's.
  const single = watched(swinging({ turn: 1 }), 20);
  single.controls.turn = -1;
  let most = 0;
  single.fly(4, (t, g, c, state) => (most = Math.max(most, state.chain)));
  assert.equal(Math.max(most, single.watch.state.chain), 1);
});

test('a turn rolled into after flying straight a while reverses nothing, whichever way the last went, and its overshoot is no wingover top', () => {
  // A right turn, a while straight, then a left one: no swap, and the top it overshoots to (past
  // `top` on the bar, 41°) links nothing.
  const { watch, controls, fly } = watched(swinging({ turn: 1, bar: true }), 10);
  controls.turn = 0;
  fly(WATCH.straight + 14);
  controls.turn = -1;
  let wingTops = 0;
  const tops = watch.state.tops;
  fly(4, (t, g, c, state) => (wingTops += state.wingTop));
  assert.equal(watch.state.swappedAt, -Infinity, 'never swapped');
  assert.ok(watch.state.tops > tops && watch.state.top >= WATCH.top, `it overshot to ${(watch.state.top / DEG).toFixed(1)}°`);
  assert.deepEqual([wingTops, watch.state.wingTop, watch.state.chain, watch.state.linking], [0, 0, 0, 0]);
  // Straight for less than that, a turn the other way is a reversal.
  const quick = watched(swinging({ turn: 1 }), 10);
  quick.controls.turn = 0;
  quick.fly(WATCH.straight - 0.3);
  quick.controls.turn = -1;
  quick.fly(0.1);
  assert.ok(quick.watch.state.swappedAt > 0);
});

test('a wingover is under way once the turn is swapped back from its top, and a circle turned the other way is never one', () => {
  // A held circle turned the other way, and held: its top comes, and nothing more.
  const circle = watched(swinging({ turn: 1 }), 20);
  circle.controls.turn = -1;
  let linked = 0;
  circle.fly(5, (t, g, c, state) => (linked += state.linking));
  assert.equal(linked, 0);
  // Swapped back as it tops out: under way from the swap until the next top, and again from the next swap.
  const flown = watched(swinging({ turn: 1 }), 20);
  flown.controls.turn = -1;
  const tops = flown.watch.state.tops;
  flown.fly(3, (t, g, controls, state) => {
    if (state.tops > tops && controls.turn === -1) controls.turn = 1;
  });
  assert.equal(flown.watch.state.linking, 0, 'the next top came, and nothing was swapped back from it');
  assert.ok(flown.watch.state.chain >= 2, `chain ${flown.watch.state.chain}`);
  const again = watched(swinging({ turn: 1 }), 20);
  again.controls.turn = -1;
  const before = again.watch.state.tops;
  let underWay = 0;
  again.fly(1.6, (t, g, controls, state) => {
    if (state.tops > before && controls.turn === -1) controls.turn = 1;
    underWay += state.linking;
  });
  assert.ok(underWay > 0 && again.watch.state.linking === 1, 'under way after the swap at the top');
});

test('a swing is being pumped only while the pilot works the brake, and not once a surge of it is caught', () => {
  // A swing fore and aft drawn by hand, as the air or a wingover can rock one: forward peaks in a
  // row, big enough, and the brake never touched.
  const watch = createSwingWatch();
  const g = createFlight({ x: 0, y: 5000, z: 0 });
  const controls = swinging();
  const w = (2 * Math.PI) / PITCH.period;
  let pumped = 0;
  const swing = (seconds, size, hands = null) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      const t = watch.state.clock + STEP;
      g.pitch = -size * Math.sin(w * t);
      g.pitchRate = -size * w * Math.cos(w * t);
      if (hands) controls.brake = hands((w * t) % (2 * Math.PI));
      watch.step(STEP, g, false, controls);
      pumped += watch.state.pumping;
    }
  };
  swing(3 * PITCH.period, 0.5);
  assert.ok(watch.state.building >= 2 && watch.state.front >= WATCH.pumped, `building ${watch.state.building}`);
  assert.equal(pumped, 0, 'rocked, not pumped');
  // Pressed after each forward peak and let go after each back peak: pumped.
  swing(2 * PITCH.period, 0.5, (phase) => phase > Math.PI / 2 && phase < (3 * Math.PI) / 2);
  assert.ok(pumped > 0 && watch.state.pumping === 1, `pumped for ${pumped} steps`);
  // Hands off a while: only rocking again.
  swing(WATCH.within + PITCH.period, 0.5, () => false);
  assert.equal(watch.state.pumping, 0);
  // Pumped again, then a surge braked through its peak: caught, and the pumping ends with it.
  swing(2 * PITCH.period, 0.5, (phase) => phase > Math.PI / 2 && phase < (3 * Math.PI) / 2);
  assert.equal(watch.state.pumping, 1);
  swing(PITCH.period, 0.95, (phase) => phase > 0.3 && phase < Math.PI);
  assert.ok(watch.state.catches > 0 && watch.state.caughtAt === watch.state.frontAt, `caught at ${watch.state.caughtAt}, peaked at ${watch.state.frontAt}`);
  assert.equal(watch.state.pumping, 0);
});

test('a tuck, a tip, a stall, a strike or the ears breaks a trick off, once each, and calm is level flight with the swing still', () => {
  for (const [what, set, code] of [
    ['a tuck', (g) => (g.tuck = 0.5), 1], ['a tip', (g) => (g.tip = 0.5), 2], ['a stall', (g) => (g.stall = 1), 3], ['the ears', (g) => (g.ears = 0.5), 5],
  ]) {
    const watch = createSwingWatch();
    const g = createFlight();
    g.pitchRate = 0;
    watch.step(STEP, g);
    set(g);
    watch.step(STEP, g);
    watch.step(STEP, g);
    assert.deepEqual([watch.state.breaks, watch.state.broke], [1, code], what);
  }
  const watch = createSwingWatch();
  const g = createFlight();
  watch.step(STEP, g, true);
  assert.deepEqual([watch.state.breaks, watch.state.broke], [1, 4], 'a strike');
  // Level and calm: a wing flying straight, or circling at a thermal's bank, counts its calm.
  const { watch: level } = watched(swinging({ turn: 1 }), 5);
  assert.ok(level.state.calm > 4, `${level.state.calm.toFixed(2)} s calm`);
});

test('the watch is plain numbers, reset for every flight, and nothing of the last is left', () => {
  const { watch, g, fly } = watched(swinging({ turn: 1 }), 3);
  g.pitchRate = -2;
  fly(4);
  for (const [key, value] of Object.entries(watch.state)) assert.equal(typeof value, 'number', key);
  watch.reset();
  assert.deepEqual(watch.state, createSwingWatch().state);
  assert.ok(BRAKE.light > 0);
});

test('the hands on time are counted: a wingover\'s turn swapped at its top, and a press or a let-go just after a pitched swing peaks; late ones are not', () => {
  // Swapped `late` seconds after each top the bank comes to, six times.
  const swaps = (late) => {
    let rolling = 0;
    let last = 0;
    let wait = -1;
    const { watch, controls, fly } = watched(swinging({ turn: 1 }), 20);
    controls.turn = -1;
    let swapped = 0;
    fly(9, (t, g, asked) => {
      const rate = g.bank - last;
      if (rolling * rate < 0 && Math.abs(g.bank) > 0.3) wait = Math.round(late / STEP);
      if (wait === 0 && swapped < 6) {
        asked.turn = g.bank > 0 ? -1 : 1;
        swapped += 1;
      }
      if (wait >= 0) wait -= 1;
      if (rate !== 0) rolling = rate;
      last = g.bank;
    });
    return watch.state;
  };
  const onTime = swaps(0.05);
  assert.ok(onTime.timed >= 4 && onTime.timedKind === 3, `${onTime.timed} on time`);
  assert.equal(swaps(0.5).timed, 0, 'half a second late, none');
  // Rolling into a turn from straight flight overshoots to some 41°: no wingover's top, nothing owed.
  const entry = watched(swinging({ turn: 1 }), 4);
  assert.ok(entry.watch.state.tops <= 1 && entry.watch.state.top < WATCH.wing);
  entry.controls.turn = -1;
  entry.fly(0.1);
  assert.equal(entry.watch.state.timed, 0);
  // Pitched by its peaks, pressing and letting go `late` seconds after each.
  const pumps = (late) => {
    let rate = 0;
    let timer = -1;
    let want = false;
    const { watch } = watched(swinging(), 9, (t, g, asked) => {
      if (t === 0) asked.brake = true;
      if (rate < 0 && g.pitchRate >= 0) [timer, want] = [late, true];
      if (rate > 0 && g.pitchRate <= 0) [timer, want] = [late, false];
      if (timer >= 0 && (timer -= STEP) < 0) asked.brake = want;
      rate = g.pitchRate;
    });
    return watch.state;
  };
  const pumped = pumps(0.2);
  assert.ok(pumped.timed >= 3, `${pumped.timed} on time`);
  assert.equal(pumps(0.9).timed, 0, 'nearly a second late, none');
});
