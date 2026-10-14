import test from 'node:test';
import assert from 'node:assert/strict';
import { TST, createReferencePilot, flyPilot } from './pilots.js';
import { RUN, createRunWorld, startRun, stepRun } from './run-step.js';
import { createCloudbaseRun } from './cloudbase-state.js';
import { MEET, createMeet } from './meet-state.js';
import { createBells } from './bells.js';

// Good Lift's balance: whole runs with Hrungnir's kettlebells and the meet, flown by the reference
// pilots (pilots.js) through the one step every run takes, the way a player meets them. The rules
// themselves are pinned in meet-state.test.js and bells.test.js; this pins what they add up to.

const firstSkies = (count) => Array.from({ length: count }, (_, i) => i + 1);
const sum = (values) => values.reduce((total, value) => total + value, 0);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
// Two red lights or three: a lift dropped into the mist.
const twoRed = (lift) => (lift.red & (lift.red - 1)) !== 0;
// The 1,000 lb club's TOTAL, in kilograms.
const CLUB = 453.6;

// A run's world on the sky laid out from `seed`, with a fresh set of kettlebells and a fresh meet.
const meetWorld = (seed) => startRun(createRunWorld({ sky: createCloudbaseRun(), bells: createBells(), meet: createMeet() }), seed);

// One whole run with the kettlebells and the meet, flown by the reference pilot with `options` until
// the fog or the ground ends it and the meet has judged what was left on the bar. Returns how it
// went (flyPilot), the meet's TOTAL, plates loaded and lifts judged, and the bells thrown and hit.
function flyMeet(seed, options) {
  const world = meetWorld(seed);
  const flown = flyPilot(world, createReferencePilot(options));
  const { meet, bells } = world;
  const lifts = meet.state.lifts.slice(0, Math.min(meet.state.count, meet.state.lifts.length)).map((lift) => ({ ...lift }));
  return { seed, ...flown, total: meet.state.total, plates: meet.state.plates, lifts, thrown: bells.state.thrown, hits: bells.state.hits };
}

// Measured over 80 skies (seeds 1 to 40, then 1001 to 1040) with the kettlebells and the meet,
// under SIM_VERSION 1 and then 2: kettlebells thrown a run and the share that hit; runs of 40 past
// 1,000 m; the share of lifts (the fog's included) with two red lights or more; TOTAL median and
// runs of 40 in the 1,000 lb club; plates loaded a run:
//   no kettlebells, light brake eased          1  -           -            37 / 40   6.6 / 5.9%   238 / 219 kg    0 / 0    5.4 / 4.4
//                                              2  -           -            36 / 39   4.6 / 7.5%   278 / 258 kg    3 / 1    5.7 / 5.0
//   holding its line, hands up                 1  4.0 / 3.9   78 / 79%     24 / 22    12 / 12%    169 / 155 kg    0 / 0    4.2 / 4.5
//                                              2  3.3 / 3.0   73 / 79%      9 / 1     12 / 15%    148 / 125 kg    0 / 1    4.0 / 4.4
//   holding its line, light brake eased        1  3.7 / 4.0   80 / 81%     24 / 23    13 / 16%    154 / 143 kg    0 / 0    4.4 / 3.7
//                                              2  3.6 / 4.0   79 / 82%     25 / 24    10 / 11%    191 / 175 kg    0 / 0    5.2 / 4.2
//   changing what it does 0.4 s in, hands up   1  4.3 / 4.1   1.7 / 3.1%   36 / 32   3.8 / 3.4%   219 / 215 kg    0 / 0    4.0 / 4.5
//                                              2  3.4 / 3.5   0.7 / 1.4%   15 / 18   7.0 / 5.1%   180 / 196 kg    0 / 0    4.1 / 4.8
//   TST: 0.4 s in, light brake eased           1  4.1 / 4.2   0.0 / 0.6%   36 / 38   7.0 / 5.1%   220 / 194 kg    0 / 0    4.4 / 3.6
//                                              2  3.8 / 4.2   0.0 / 0.6%   35 / 35   5.0 / 4.7%   238 / 233 kg    1 / 0    4.8 / 4.2
//   0.6 s in, light brake eased                1  4.4 / 4.2   1.1 / 0.6%   35 / 39   6.3 / 6.2%   258 / 233 kg    0 / 0    4.7 / 4.2
//                                              2  3.9 / 4.3   0.6 / 1.2%   36 / 35   6.0 / 3.7%   248 / 261 kg    0 / 1    5.5 / 4.6
//   TST following the plates: the collector    1  4.0 / 4.3   0.6 / 1.8%   32 / 36   5.9 / 5.8%   334 / 366 kg   10 / 11  12.3 / 12.7
//                                              2  3.7 / 3.9   2.0 / 1.9%   31 / 31   4.9 / 6.2%   358 / 323 kg    6 / 11   8.9 / 10.8
// and, not pinned (the second pilot's version 1 row is from its pilot rebuilt for version 2, as the
// one first measured had gone: that one gave 496 / 546 kg and 24 / 27 in the club):
//   the collector with no kettlebells          1  -           -            40 / 39   4.0 / 4.0%   446 / 498 kg   18 / 25  14.3 / 15.4
//                                              2  -           -            35 / 37   7.1 / 8.4%   419 / 375 kg   17 / 11  11.3 / 11.3
//   a collector that turns onto the trail      1  4.0 / 4.3   0.6 / 1.2%   40 / 38   5.1 / 5.9%   496 / 503 kg   27 / 23  17.6 / 19.4
//   first, on the bar once within 0.5 rad      2  4.2 / 4.1   0.6 / 0.6%   37 / 37   6.8 / 10%    510 / 419 kg   27 / 17  18.8 / 16.9
// Under version 2 nearly nine reps in ten are to depth, or more, for every one of these pilots: TST
// turns 3.6 / 3.4 reps a run, 3.2 / 3.0 of them to depth, and the collector 3.7 / 3.5 with 3.4 / 3.2.
// In all 1,440 runs the opener was the empty bar under three white lights, and the fog judged the
// bar last, at ×1. Dodging costs little height (TST passes 1,000 m about as often as with no
// kettlebells at all). Version 2's peaked cores cost the pilots circling hands up half or more of
// their runs past 1,000 m, as they cost a new player who circles so (CLOUD_HUNT.peak), and its reps
// to depth now put a pilot who never follows a plate in the 1,000 lb club on up to 3 skies of 40,
// where under version 1 nobody but a collector made it. How a collector boards a trail decides the club:
// flying the bar into its turn out of the dying lift, as the hint's "follow the plates on the bar"
// reads, it misses the first plate on half the trails (three in five under version 2); turning
// onto the trail first loads half as many plates again or more and makes the club on 17 to 27
// skies of 40. The pins hold the first, the collector the plan's balance was measured with
// (335 / 305 kg there).
//
// Here TST and the collector fly seeds 1 to 40, as their pins count skies of 40; the pilot holding
// its line flies 12 and the 0.6 s dodger 16, bells enough for their shares, which keeps this file
// to a few seconds. The margins leave room to retune.
const PILOTS = {
  holding: { options: { brake: 'eased' }, skies: firstSkies(12) },
  dodger: { options: TST, skies: firstSkies(40) },
  slow: { options: { ...TST, react: 0.6 }, skies: firstSkies(16) },
  collector: { options: { ...TST, collect: true }, skies: firstSkies(40) },
};
const flights = {};
// Each pilot's runs, flown once and read by every test that needs them.
const flown = (name) => (flights[name] ??= PILOTS[name].skies.map((seed) => flyMeet(seed, PILOTS[name].options)));

test('a pilot who holds its line is hit by most kettlebells, and one who changes what it is doing 0.4 s into the warning, or even 0.6 s, by hardly any, plates or no plates', () => {
  const hit = (name) => {
    const runs = flown(name);
    const thrown = sum(runs.map((run) => run.thrown));
    return { thrown, share: sum(runs.map((run) => run.hits)) / thrown };
  };
  const holding = hit('holding');
  const dodger = hit('dodger');
  const slow = hit('slow');
  const collector = hit('collector');
  // On these seeds: 36 of 42 bells hit the pilot holding its line, none of 153 hit TST, none of 66
  // the 0.6 s dodger and 3 of 149 the collector, whose dodge wins over the plate it is flying at
  // (under SIM_VERSION 1: 35 of 43, none of 162, 2 of 69 and 1 of 161).
  assert.ok(holding.thrown >= 30 && dodger.thrown >= 120 && slow.thrown >= 50, `${holding.thrown}, ${dodger.thrown} and ${slow.thrown} thrown`);
  assert.ok(holding.share >= 0.6, `${(holding.share * 100).toFixed(1)}% of the bells hit the pilot holding its line`);
  assert.ok(dodger.share <= 0.05, `${(dodger.share * 100).toFixed(1)}% of the bells hit TST`);
  assert.ok(slow.share <= 0.1, `${(slow.share * 100).toFixed(1)}% of the bells hit the 0.6 s dodger`);
  assert.ok(collector.share <= 0.05, `${(collector.share * 100).toFixed(1)}% of the bells hit the collector`);
});

test('TST, dodging every kettlebell thrown at it, still passes 1,000 m on three skies in four', () => {
  const passed = flown('dodger').filter((run) => run.peak >= 1000).length;
  // On these seeds 35 of 40 (35 of 1001 to 1040; under SIM_VERSION 1, 36 and 38). Should it fail,
  // the first lever is BELLS.every at [18, 24]: fewer throws, each still as hard to dodge.
  assert.ok(passed >= 30, `${passed} of 40 skies past 1,000 m`);
});

test('no pilot loses more than one lift in five to two red lights or three', () => {
  // On these seeds: 7 of 57 lifts holding its line, 11 of 222 for TST, 4 of 90 at 0.6 s and 10 of
  // 206 for the collector (under SIM_VERSION 1: 7 of 58, 15 of 214, 4 of 91 and 13 of 222).
  for (const name of Object.keys(PILOTS)) {
    const lifts = flown(name).flatMap((run) => run.lifts);
    const dropped = lifts.filter(twoRed).length;
    assert.ok(dropped <= lifts.length / 5, `${name}: ${dropped} of ${lifts.length} lifts with two red lights`);
  }
});

test('following the plates banks at least a quarter more than dodging alone, and makes the 1,000 lb club on a few skies but not most', () => {
  const totals = (name) => flown(name).map((run) => run.total);
  const collector = median(totals('collector'));
  const dodger = median(totals('dodger'));
  const club = totals('collector').filter((total) => total >= CLUB).length;
  const plates = (name) => sum(flown(name).map((run) => run.plates));
  // On these seeds: medians of 357.5 kg and 237.5 kg (1.51 times), from 8.9 plates loaded a run
  // against 4.8, and 6 of 40 skies in the club (1 for TST). Under SIM_VERSION 1: 333.75 and 220 kg
  // (1.52 times), 12.3 plates against 4.4, and 10 of 40 (none for TST).
  assert.ok(collector >= 1.25 * dodger, `the collector's median ${collector} kg against TST's ${dodger} kg`);
  // Following the plates loads nearly twice what TST flies through by chance: 357 against 193 here
  // (1.85 times; 2.78 under version 1, when this pin was twice). Circling tighter round a peaked
  // core, the collector now loads 2.1 plates a trail against 2.6 (the first of them on two trails
  // in five, against half), and TST, circling tighter too, flies through a few more on its way.
  // Nudging TST's aim by a millimetre or the core's peak by a thousandth moves this between 1.79
  // and 2.13 times on these skies (2.19 over all 80), so the pin sits under that spread.
  assert.ok(plates('collector') >= 1.6 * plates('dodger'), `${plates('collector')} plates collecting, ${plates('dodger')} not`);
  assert.ok(club >= 2 && club <= 15, `${club} of 40 skies in the 1,000 lb club`);
});

test('every sky opens with the empty bar locked out under three white lights and ends with the fog judging the bar at ×1, whoever flies it', () => {
  for (const name of Object.keys(PILOTS)) {
    for (const run of flown(name)) {
      const [opener] = run.lifts;
      const last = run.lifts.at(-1);
      assert.deepEqual([opener.line, opener.kg, opener.red, opener.good], [MEET.every, MEET.bar, 0, true], `${name} on seed ${run.seed}`);
      assert.equal(run.reason, 'fog', `${name} on seed ${run.seed}`);
      assert.deepEqual([last.line, last.double], [0, false], `${name} on seed ${run.seed}`);
    }
  }
});

test('told to dodge and to collect, the reference pilot flies exactly as it always has where there is nothing to dodge or collect', () => {
  for (const seed of firstSkies(3)) {
    const bare = () => startRun(createRunWorld({ sky: createCloudbaseRun() }), seed);
    const plain = flyPilot(bare(), createReferencePilot({ brake: 'eased' }));
    for (const options of [TST, { ...TST, collect: true }]) assert.deepEqual(flyPilot(bare(), createReferencePilot(options)), plain, `seed ${seed}`);
  }
});

test('TST changes what it is doing 0.4 s into each warning, pushing the bar if it was circling off it and otherwise turning hard the other way, until the bell has passed', () => {
  // TST flies each run; beside it the same pilot without the reflex is asked about the very same
  // world at every step, which is what TST would have done without the kettlebells.
  assert.deepEqual(TST, { withFlock: true, brake: 'eased', react: 0.4 });
  const steps = Math.round(TST.react / RUN.step);
  const bells = { circling: 0, straight: 0 };
  for (const seed of firstSkies(4)) {
    const world = meetWorld(seed);
    const tst = createReferencePilot(TST);
    const without = createReferencePilot({ ...TST, react: null });
    const intent = {};
    const base = {};
    let dodged = null;
    let away = 0;
    for (let reason = null; !reason; reason = stepRun(world, intent, RUN.step)) {
      tst.decide(world, intent);
      without.decide(world, base);
      const { warning, bells: pool } = world.bells.state;
      const bell = warning < 0 ? null : pool[warning];
      // Whole steps since the bell was thrown, the step it was thrown in not counted.
      if (!bell || Math.round((world.sky.state.elapsed - bell.at) / RUN.step) < steps) {
        assert.deepEqual(intent, base);
        continue;
      }
      if (dodged !== bell.at) {
        dodged = bell.at;
        away = -(Math.sign(world.g.yawRate) || 1);
        bells[bell.circling ? 'circling' : 'straight'] += 1;
      }
      if (bell.circling) assert.deepEqual(intent, { ...base, bar: true, brake: false });
      else assert.deepEqual(intent, { ...base, turn: away });
    }
  }
  // On these seeds: 9 bells thrown at a pilot circling off the bar, and 5 at one flying straight or
  // on the bar.
  assert.ok(bells.circling >= 4 && bells.straight >= 2, `${bells.circling} bells at a circling pilot, ${bells.straight} at a straight one`);
});

test('a collector flies at the next plate still ahead on a laid trail, on the bar, and goes back to the lift once none is left ahead', () => {
  let following = 0;
  let loaded = 0;
  for (const seed of firstSkies(3)) {
    const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet() }), seed);
    const collector = createReferencePilot({ brake: 'eased', collect: true });
    const without = createReferencePilot({ brake: 'eased' });
    const intent = {};
    const base = {};
    for (let reason = null; !reason; reason = stepRun(world, intent, RUN.step)) {
      collector.decide(world, intent);
      without.decide(world, base);
      const { trail } = world.meet.state;
      const { pos, yaw } = world.g;
      const along = (point) => (point.x - trail.x) * trail.ux + (point.z - trail.z) * trail.uz;
      const next = trail.live ? trail.plates.find((plate) => plate.live && along(plate) >= along(pos)) : undefined;
      if (!next) {
        assert.deepEqual(intent, base);
        continue;
      }
      // Steered straight at it, the way the pilot steers at a lift it is heading for.
      const turn = clamp(wrapAngle(Math.atan2(next.x - pos.x, -(next.z - pos.z)) - yaw) * 2.5, -1, 1);
      assert.deepEqual(intent, { turn, brake: false, bar: true });
      following += 1;
    }
    loaded += world.meet.state.plates;
  }
  // On these seeds: 136 s following trails, and 32 plates loaded in 3 runs (110 s and 38 plates
  // under SIM_VERSION 1).
  assert.ok(following >= 50 * 60 && loaded >= 20, `${(following / 60).toFixed(1)} s following, ${loaded} plates loaded`);
});
