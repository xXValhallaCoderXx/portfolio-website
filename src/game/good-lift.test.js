import test from 'node:test';
import assert from 'node:assert/strict';
import { DASH, TST, WORTH_RUNES, createReferencePilot, flyPilot } from './pilots.js';
import { RUN, createRunWorld, finishRun, startRun, stepRun } from './run-step.js';
import { createCloudbaseRun } from './cloudbase-state.js';
import { MEET, PLATE_KIND, createMeet } from './meet-state.js';
import { GATE, GATES, RUNE } from './meet-runes.js';
import { BELL_RESULT, createBells } from './bells.js';
import { BRAKE } from './flight.js';

// Good Lift's balance: whole runs with Hrungnir's kettlebells and the meet, flown by the reference
// pilots (pilots.js) through the one step every run takes, the way a player meets them. The rules
// themselves are pinned in meet-state.test.js, meet-plates.test.js, meet-runes.test.js and
// bells.test.js; this pins what they add up to.

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
// the fog or the ground ends it and the meet has judged what was left on the bar, as flyPilot flies
// it, watching every step for anything new under 550 m. Returns how it went (flyPilot's), the
// meet's TOTAL, plates loaded and lifts judged, the bells thrown and hit (the Beast's apart), the
// plates a strike sprayed and those loaded back, the gates taken, and every step's breach of the
// rule that nothing new comes under 550 m but the 500 m stones.
function flyMeet(seed, options) {
  const world = meetWorld(seed);
  const pilot = createReferencePilot(options);
  const { state } = world.sky;
  const { meet, bells } = world;
  const intent = { turn: 0, brake: false, bar: false };
  const breaches = [];
  let reason = null;
  while (!reason && state.elapsed < 200) {
    pilot.decide(world, intent);
    reason = stepRun(world, intent, RUN.step);
    const met = meet.state;
    if (state.peak < MEET.iron && (met.loose.some((plate) => plate.live || plate.held) || met.fronts + met.scattered + met.wind + met.thunder + met.bait > 0 || bells.state.thrown > 0)) {
      breaches.push(state.elapsed);
    }
  }
  if (reason) finishRun(world, reason);
  const lifts = meet.state.lifts.slice(0, Math.min(meet.state.count, meet.state.lifts.length)).map((lift) => ({ ...lift }));
  const beast = bells.state.beast;
  return {
    seed, peak: state.peak, strikes: state.pilot.strikes, reason, total: meet.state.total, plates: meet.state.plates, lifts,
    thrown: bells.state.thrown, hits: bells.state.hits, beast: beast.n >= 0 ? 1 : 0, beastHits: beast.result === BELL_RESULT.hit ? 1 : 0,
    scattered: meet.state.scattered, recovered: meet.state.recovered, gates: meet.state.runes.taken, breaches,
  };
}

// Measured over 80 skies (seeds 1 to 40, then 1001 to 1040) with the kettlebells and the meet,
// under SIM_VERSION 1, 2, 3 and then 4: kettlebells thrown a run and the share that hit; runs of 40
// past 1,000 m; the share of lifts (the fog's included) with two red lights or more; TOTAL median
// and runs of 40 in the 1,000 lb club; plates loaded a run (from version 3, every plate: off a
// trail, the plates off it below, and a strike's plates loaded back):
//   no kettlebells, light brake eased          1  -           -            37 / 40   6.6 / 5.9%   238 / 219 kg    0 / 0    5.4 / 4.4
//                                              2  -           -            36 / 39   4.6 / 7.5%   278 / 258 kg    3 / 1    5.7 / 5.0
//                                              3  -           -            36 / 39   4.6 / 7.5%   278 / 273 kg    4 / 1    7.0 / 6.7
//                                              4  -           -            39 / 39   6.0 / 8.2%   320 / 263 kg    4 / 2    7.6 / 6.9
//   holding its line, hands up                 1  4.0 / 3.9   78 / 79%     24 / 22    12 / 12%    169 / 155 kg    0 / 0    4.2 / 4.5
//                                              2  3.3 / 3.0   73 / 79%      9 / 1     12 / 15%    148 / 125 kg    0 / 1    4.0 / 4.4
//                                              3  3.3 / 3.1   73 / 78%      9 / 2     14 / 15%    143 / 118 kg    0 / 0    6.3 / 6.9
//                                              4  3.6 / 3.7   72 / 77%     10 / 15    11 / 15%    158 / 150 kg    0 / 0    6.5 / 7.0
//   holding its line, light brake eased        1  3.7 / 4.0   80 / 81%     24 / 23    13 / 16%    154 / 143 kg    0 / 0    4.4 / 3.7
//                                              2  3.6 / 4.0   79 / 82%     25 / 24    10 / 11%    191 / 175 kg    0 / 0    5.2 / 4.2
//                                              3  3.6 / 4.0   75 / 80%     25 / 24     9 / 12%    185 / 168 kg    0 / 0    7.1 / 6.7
//                                              4  4.0 / 4.2   77 / 68%     35 / 39    15 / 11%    178 / 218 kg    1 / 1    8.3 / 7.6
//   changing what it does 0.4 s in, hands up   1  4.3 / 4.1   1.7 / 3.1%   36 / 32   3.8 / 3.4%   219 / 215 kg    0 / 0    4.0 / 4.5
//                                              2  3.4 / 3.5   0.7 / 1.4%   15 / 18   7.0 / 5.1%   180 / 196 kg    0 / 0    4.1 / 4.8
//                                              3  3.4 / 3.5   0.7 / 1.4%   15 / 18   7.0 / 5.7%   203 / 201 kg    0 / 0    5.6 / 6.0
//                                              4  3.5 / 3.9   0.0 / 0.0%   20 / 17   4.5 / 3.4%   213 / 220 kg    0 / 1    6.1 / 6.3
//   TST: 0.4 s in, light brake eased           1  4.1 / 4.2   0.0 / 0.6%   36 / 38   7.0 / 5.1%   220 / 194 kg    0 / 0    4.4 / 3.6
//                                              2  3.8 / 4.2   0.0 / 0.6%   35 / 35   5.0 / 4.7%   238 / 233 kg    1 / 0    4.8 / 4.2
//                                              3  4.0 / 4.2   0.0 / 0.0%   35 / 35   2.3 / 4.2%   270 / 244 kg    1 / 1    6.3 / 5.5
//                                              4  4.1 / 4.3   0.6 / 0.0%   34 / 36   6.9 / 5.0%   238 / 258 kg    0 / 2    6.7 / 6.8
//   0.6 s in, light brake eased                1  4.4 / 4.2   1.1 / 0.6%   35 / 39   6.3 / 6.2%   258 / 233 kg    0 / 0    4.7 / 4.2
//                                              2  3.9 / 4.3   0.6 / 1.2%   36 / 35   6.0 / 3.7%   248 / 261 kg    0 / 1    5.5 / 4.6
//                                              3  3.8 / 4.3   1.3 / 1.2%   36 / 35   6.6 / 3.7%   238 / 251 kg    1 / 1    7.0 / 6.2
//                                              4  4.1 / 4.3   1.2 / 0.6%   35 / 38   6.9 / 6.3%   268 / 260 kg    1 / 0    6.9 / 6.8
//   TST following the plates: the collector    1  4.0 / 4.3   0.6 / 1.8%   32 / 36   5.9 / 5.8%   334 / 366 kg   10 / 11  12.3 / 12.7
//                                              2  3.7 / 3.9   2.0 / 1.9%   31 / 31   4.9 / 6.2%   358 / 323 kg    6 / 11   8.9 / 10.8
//                                              3  3.8 / 3.9   2.0 / 1.9%   32 / 29   4.4 / 5.5%   335 / 346 kg    8 / 11  11.0 / 13.0
//                                              4  3.9 / 4.1   0.6 / 1.9%   30 / 34   6.7 / 6.7%   330 / 313 kg    8 / 10  11.2 / 11.3
//   the collector circling back for its plates 3  3.6 / 4.0   2.8 / 1.2%   26 / 29   5.6 / 5.5%   308 / 336 kg    7 / 10  11.8 / 12.5
//                                              4  4.0 / 4.2   0.6 / 1.8%   30 / 31   6.6 / 5.4%   356 / 289 kg   10 / 11  12.2 / 11.2
//   TST taking Fehu's or Tiwaz's stone         3  3.9 / 4.0   0.0 / 0.0%   33 / 30   3.8 / 4.9%   283 / 239 kg    4 / 4    6.8 / 6.5
//                                              4  3.9 / 4.2   0.6 / 0.0%   31 / 34   6.7 / 4.3%   238 / 224 kg    2 / 3    7.5 / 6.6
// and, not pinned (the second pilot's version 1 row is from its pilot rebuilt for version 2, as the
// one first measured had gone: that one gave 496 / 546 kg and 24 / 27 in the club):
//   the collector with no kettlebells          1  -           -            40 / 39   4.0 / 4.0%   446 / 498 kg   18 / 25  14.3 / 15.4
//                                              2  -           -            35 / 37   7.1 / 8.4%   419 / 375 kg   17 / 11  11.3 / 11.3
//                                              3  -           -            33 / 38   6.9 / 7.7%   415 / 411 kg   16 / 17  13.2 / 14.6
//                                              4  -           -            37 / 40   5.6 / 6.5%   453 / 424 kg   20 / 16  13.1 / 13.9
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
// Under version 3, on each set of seeds: the plates off the trail met a run, then the plates a
// strike sprayed off the bar a run and those loaded back, the rune gates taken a run, and the
// Beasts thrown (of 40) and how many hit:
//   no kettlebells, light brake eased          wind 0.8 / 0.8   under cloud 0.25 / 0.25   bait 0.07   sprayed 0.75 / 1.55, back 0.17 / 0.55   gates 0.03 / 0.07
//   holding its line, light brake eased        wind 0.9 / 0.8   under cloud 0.13 / 0.15   bait 0.03   sprayed 3.15 / 3.73, back 0.97 / 1.43   gates 0 / 0.05     Beasts 23 / 17, 14 / 13 hit
//   TST                                        wind 1.0 / 1.0   under cloud 0.20 / 0.25   bait 0.03   sprayed 0.63 / 1.05, back 0.15 / 0.42   gates 0 / 0.10     Beasts 31 / 31, none hit
//   the collector                              wind 1.1 / 1.1   under cloud 0.17 / 0.20   bait 0 / 0.03   sprayed 1.45 / 2.02, back 0.65 / 0.93   gates 0.33 / 0.35  Beasts 26 / 23, 1 / 0 hit
//   the collector circling back                wind 1.1 / 1.2   under cloud 0.17 / 0.17   bait 0       sprayed 2.40 / 1.57, back 1.55 / 1.00   gates 0.35 / 0.38  Beasts 22 / 25, 1 / 0 hit
//   the gate-taker                             wind 0.9 / 0.7   under cloud 0.28 / 0.38   bait 0.03   sprayed 0.47 / 0.90, back 0.13 / 0.55   gates 0.30 / 0.53  Beasts 28 / 27, none hit
// and under version 4, where every pilot catches its wing and pumps a fold open (pilots.js CATCH):
//   no kettlebells, light brake eased          wind 0.7 / 0.5   under cloud 0.20 / 0.33   bait 0.13 / 0.13   sprayed 1.23 / 1.60, back 0.48 / 0.68   gates 0.05 / 0.05
//   holding its line, light brake eased        wind 0.8 / 0.9   under cloud 0.23 / 0.33   bait 0.08 / 0      sprayed 4.08 / 3.58, back 1.53 / 1.50   gates 0.05 / 0.10  Beasts 28 / 35, 17 / 14 hit
//   TST                                        wind 1.0 / 0.9   under cloud 0.18 / 0.23   bait 0 / 0.10      sprayed 0.83 / 1.00, back 0.30 / 0.43   gates 0.05 / 0.13  Beasts 31 / 34, none hit
//   the collector                              wind 1.0 / 1.1   under cloud 0.15 / 0.20   bait 0 / 0.05      sprayed 1.45 / 1.33, back 0.70 / 0.48   gates 0.33 / 0.48  Beasts 23 / 29, none hit
//   the collector circling back                wind 1.1 / 1.1   under cloud 0.18 / 0.25   bait 0.03 / 0.05   sprayed 1.65 / 1.23, back 1.33 / 0.73   gates 0.40 / 0.48  Beasts 26 / 28, none hit
//   the gate-taker                             wind 1.2 / 1.0   under cloud 0.20 / 0.23   bait 0.05 / 0.05   sprayed 0.80 / 0.60, back 0.43 / 0.30   gates 0.48 / 0.48  Beasts 28 / 31, none hit
// A pilot that never catches its wing (TST told not to) tucks 0.4 / 0.4 times a run, its held brake
// catching most of its surges, and passes 1,000 m on 38 / 26 skies for a median 256 / 193 kg; one
// circling hands up and dodging 0.6 s in tucks 1.6 / 1.6 times a run, passing on 12 / 11 skies to the
// 17 / 18 of the same pilot catching. Pumping folds open lifts everyone who is struck: the pilots
// holding their line pass 1,000 m on 1 to 15 skies of 40 more than under version 3.
// Every pilot meets about a gust front's plate a run by chance, and they and the plates under the
// clouds lift everyone's TOTAL a little (TST's by 12 kg a run over 800 skies). A strike now sprays
// the bar, which costs most the pilot who carries most. A pilot circling back through its plates
// catches two in three of them back, where one that flies on catches a third to a half by the way,
// but to a pilot that climbs as these do no plate off the trail is worth a detour (pilots.js): the
// collector leaves them all to chance, and dashes only for Fehu's and Tiwaz's stones. Over 800
// skies it banked a median 335 kg against TST's 220, 1.52 times as under version 2 (320 against
// 210), and the means 349 against 227 kg (1.54 times; 1.48 under version 2); on these 40 skies
// TST happens to bank its most, a median 270 kg, and the collector 1.24 times that. It passed
// 1,000 m on 78% of 800 skies against TST's 80%, and made the club on 23% (TST on 1.5%). The
// collector first built for version 3, which went for every plate off the trail it could meet
// within 0.6 s, for the fog's bait and back for its own sprayed plates, and dashed for Algiz's stone
// too, banked a median 310 kg over those skies and passed 1,000 m on 69% of them. A gate costs a
// dash out of the climb, 83 m of it 15 s on (the median on calm skies): TST dashing for Fehu's or
// Tiwaz's stone passed 1,000 m on 75% of 800 skies against TST's 80%, and banked 16 kg more a run.
// TST itself, which seeks no stone, flies through one by chance on 54 of the 800 (43 of them at
// 1,000 m), which raised its TOTAL on 19 of them and lowered it on 2, by up to 140 kg (Tiwaz's
// doubling), 1.3 kg a run in all.
//
// Here TST, the collectors, the gate-taker and the pilot holding its line fly seeds 1 to 40, as their
// pins count skies of 40, and the 0.6 s dodger 16, bells enough for its share, which keeps this file
// to a few seconds. The pilot holding its line flew 12 until SIM_VERSION 4, when the Beast met it on
// too few of them (8, 2 hitting) to say how often it hits. The margins leave room to retune.
const PILOTS = {
  holding: { options: { brake: 'eased' }, skies: firstSkies(40) },
  dodger: { options: TST, skies: firstSkies(40) },
  slow: { options: { ...TST, react: 0.6 }, skies: firstSkies(16) },
  collector: { options: { ...TST, collect: true }, skies: firstSkies(40) },
  recoverer: { options: { ...TST, collect: true, recover: true }, skies: firstSkies(40) },
  gates: { options: { ...TST, gates: WORTH_RUNES }, skies: firstSkies(40) },
};
const flights = {};
// Each pilot's runs, flown once and read by every test that needs them.
const flown = (name) => (flights[name] ??= PILOTS[name].skies.map((seed) => flyMeet(seed, PILOTS[name].options)));

test('a pilot who holds its line is hit by most kettlebells, and one who changes what it is doing 0.4 s into the warning, or even 0.6 s, by hardly any, plates or gates or none', () => {
  const hit = (name) => {
    const runs = flown(name);
    const thrown = sum(runs.map((run) => run.thrown));
    return { thrown, share: sum(runs.map((run) => run.hits)) / thrown };
  };
  const holding = hit('holding');
  const dodger = hit('dodger');
  const slow = hit('slow');
  const collector = hit('collector');
  const recoverer = hit('recoverer');
  const gates = hit('gates');
  // On these seeds under SIM_VERSION 4: 123 of 160 bells hit the pilot holding its line (38 of 48 on
  // its first 12 skies), 1 of 164 hit TST, 1 of 65 the 0.6 s dodger, 1 of 154 the collector,
  // whose dodge wins over the plate it is flying at (3 of 162 on 1001 to 1040), 1 of 160 the
  // collector circling back for its plates, and 1 of 157 the gate-taker. Under 3: 36 of 44 on 12
  // skies, none of 158, none of 65, 3 of 151, 4 of 145 and none of 154; under 2: 36 of 42, none of
  // 153, none of 66 and 3 of 149; under 1: 35 of 43, none of 162, 2 of 69 and 1 of 161.
  assert.ok(holding.thrown >= 30 && dodger.thrown >= 120 && slow.thrown >= 50, `${holding.thrown}, ${dodger.thrown} and ${slow.thrown} thrown`);
  assert.ok(holding.share >= 0.6, `${(holding.share * 100).toFixed(1)}% of the bells hit the pilot holding its line`);
  assert.ok(dodger.share <= 0.05, `${(dodger.share * 100).toFixed(1)}% of the bells hit TST`);
  assert.ok(slow.share <= 0.1, `${(slow.share * 100).toFixed(1)}% of the bells hit the 0.6 s dodger`);
  assert.ok(collector.share <= 0.05, `${(collector.share * 100).toFixed(1)}% of the bells hit the collector`);
  assert.ok(recoverer.share <= 0.05, `${(recoverer.share * 100).toFixed(1)}% of the bells hit the collector circling back`);
  assert.ok(gates.share <= 0.05, `${(gates.share * 100).toFixed(1)}% of the bells hit the gate-taker`);
});

test('the Beast, warned and aimed 3.2 s ahead, is dodged by changing what you do 0.4 s in as surely as any bell, and still finds a pilot who holds on', () => {
  const beasts = (name) => {
    const runs = flown(name);
    const thrown = sum(runs.map((run) => run.beast));
    const hits = sum(runs.map((run) => run.beastHits));
    return { thrown, hits, others: (sum(runs.map((run) => run.hits)) - hits) / (sum(runs.map((run) => run.thrown)) - thrown) };
  };
  const dodger = beasts('dodger');
  const holding = beasts('holding');
  // On these seeds TST meets the Beast on 31 skies and it never hits, as only one of its 133 other
  // bells does; the pilot holding its line meets it on 29 of 40 and is hit by 13 (14 of 31 on 1001 to
  // 1040). Its misses are of two kinds: by a metre or two, or by 12 to 49 m, where the Beast came
  // just as the pilot left a lift that was dying, as at 1,000 m it often is. Before the brake's
  // linger came down to 1.8 s it was hit by 17 of 28 (14 of 35 on 1001 to 1040); under SIM_VERSION 3,
  // TST met it on 31 and the line-holder on 6 of 12, hit by 5: since the wing surges, a line-holder
  // who catches it changes its line now and then.
  assert.ok(dodger.thrown >= 25, `${dodger.thrown} Beasts thrown at TST`);
  assert.ok(dodger.hits / dodger.thrown <= dodger.others + 0.05, `${dodger.hits} of ${dodger.thrown} Beasts hit TST`);
  assert.ok(holding.thrown >= 3 && holding.hits / holding.thrown >= 0.4, `${holding.hits} of ${holding.thrown} Beasts hit the pilot holding its line`);
});

test('TST, dodging every kettlebell thrown at it, still passes 1,000 m on three skies in four', () => {
  const passed = flown('dodger').filter((run) => run.peak >= 1000).length;
  // On these seeds 34 of 40 (36 of 1001 to 1040) under SIM_VERSION 4; 35 and 35 under 2 and 3, and 36
  // and 38 under 1. Should it fail, the first lever is BELLS.every at [18, 24]: fewer throws, each
  // still as hard to dodge.
  assert.ok(passed >= 30, `${passed} of 40 skies past 1,000 m`);
});

test('a rune gate is a choice, not a trap: TST dashing out of its climb for Fehu\'s or Tiwaz\'s stone at each line passes 1,000 m about as often as TST, and still dodges', () => {
  const passed = (name) => flown(name).filter((run) => run.peak >= 1000).length;
  const taken = sum(flown('gates').map((run) => run.gates));
  // On these seeds the gate-taker took 19 stones and passed 1,000 m on 31 skies to TST's 34 (19, and
  // 34 to 36, on 1001 to 1040); under SIM_VERSION 3, a stone at 12 of its 75 sets and 33 to 35 (21
  // of 76, and 30 to 35). Over 800 skies it passed on 601 to TST's
  // 640, and dashing for any stone at all on 577: a dash costs a median 83 m of climb 15 s on, on
  // calm skies, whatever its rune, and the rune decides whether that pays (pilots.js). In blocks of
  // 40 skies from 1 to 800, TST passed on up to 7 skies more than the gate-taker (and up to 5 fewer),
  // and the gate-taker took 12 to 23 stones, so the pin allows 8 and asks for 8. Dashing only once
  // over the line, it never puts a line off for a stone.
  assert.ok(taken >= 8, `${taken} gates taken`);
  assert.ok(passed('gates') >= passed('dodger') - 8, `${passed('gates')} of 40 past 1,000 m taking gates, ${passed('dodger')} not`);
});

test('no pilot loses more than one lift in five to two red lights or three', () => {
  // On these seeds under SIM_VERSION 4: 32 of 211 lifts holding its line (9 of 65 on its first 12
  // skies), 15 of 216 for TST, 4 of 86 at 0.6 s, 14 of 210 for the collector, 14 of 211 for it
  // circling back and 14 of 209 for the gate-taker: a fold pumped open climbs back sooner, so a
  // strike and a cloud land in one lift more often. Under 3: 6 of 59, 5 of 221, 5 of 86, 9 of 205, 11
  // of 196 and 8 of 213; under 2: 7 of 57, 11 of 222, 4 of 90 and 10 of 206; under 1: 7 of 58, 15 of
  // 214, 4 of 91 and 13 of 222).
  for (const name of Object.keys(PILOTS)) {
    const lifts = flown(name).flatMap((run) => run.lifts);
    const dropped = lifts.filter(twoRed).length;
    assert.ok(dropped <= lifts.length / 5, `${name}: ${dropped} of ${lifts.length} lifts with two red lights`);
  }
});

test('following the plates banks more than dodging alone and loads well over half as many plates again, and makes the 1,000 lb club on a few skies but not most', () => {
  const totals = (name) => flown(name).map((run) => run.total);
  const collector = median(totals('collector'));
  const dodger = median(totals('dodger'));
  const club = totals('collector').filter((total) => total >= CLUB).length;
  const plates = (name) => sum(flown(name).map((run) => run.plates));
  // On these seeds under SIM_VERSION 4: medians of 330 kg and 237.5 kg (1.39 times), from 11.2 plates
  // loaded a run against 6.7, and 8 of 40 skies in the club (none for TST); on 1001 to 1040, 312.5
  // and 257.5 kg (1.21 times), 11.3 plates against 6.8, and 10 (2 for TST). Under SIM_VERSION 3:
  // medians of 335 kg and 270 kg (1.24 times), from 11.0 plates loaded a run against 6.3, and 8 of
  // 40 skies in the club (1 for TST). Under SIM_VERSION 2: 357.5 and 237.5 kg (1.51
  // times), 8.9 plates against 4.8, and 6 of 40 (1 for TST); under 1, 333.75 and 220 kg (1.52 times),
  // 12.3 plates against 4.4, and 10 of 40 (none for TST). These forty skies are TST's luckiest of
  // version 3 (a median 270 kg, against 220 over 800 skies, where the collector banks 1.52 times
  // TST's median and 1.54 times its mean); in blocks of 40 from 1 to 800 the ratio of the medians ran
  // from 1.22 to 2.03 (1.42 on 1001 to 1040), and a median of 40 runs moves 25 kg with any nudge to a
  // pilot's flight. So the pin, 1.25 times under version 2, is 1.15 times, which a collector no
  // better than TST would miss (the collector first built for version 3 came to 1.18 times here).
  assert.ok(collector >= 1.15 * dodger, `the collector's median ${collector} kg against TST's ${dodger} kg`);
  // Following the plates loads well over half as many again as TST meets by chance: 446 against 266
  // here under version 4 (1.68 times; 1.66 on 1001 to 1040), and 440 against 251 under version 3
  // (1.75 times; 1.85 under version 2, 2.78 under version 1, when this pin was twice), from 1.62
  // to 2.80 times in blocks of 40 from 1 to 800 (2.39 on 1001 to 1040). The plates off the trail come
  // to both by chance. Nudging TST's aim by a millimetre or the core's peak by a thousandth moved this
  // between 1.79 and 2.13 times under version 2, so the pin sits under that spread.
  assert.ok(plates('collector') >= 1.6 * plates('dodger'), `${plates('collector')} plates collecting, ${plates('dodger')} not`);
  // The club: 8 of 40 here and 10 on 1001 to 1040 under version 4; under version 3, 8 and 11, and from
  // 4 to 18 in blocks of 40 from 1 to 800 (182 of the 800); under version 2 it was 6, and this pin's
  // top was 15.
  assert.ok(club >= 2 && club <= 20, `${club} of 40 skies in the 1,000 lb club`);
});

test('a pilot who flies back through the plates a strike sprays off its bar catches most of them back, where one that flies on catches a few by the way', () => {
  const share = (name) => {
    const runs = flown(name);
    return { scattered: sum(runs.map((run) => run.scattered)), share: sum(runs.map((run) => run.recovered)) / sum(runs.map((run) => run.scattered)) };
  };
  const recoverer = share('recoverer');
  const dodger = share('dodger');
  // On these seeds under SIM_VERSION 4: the collector circling back through them on the light brake
  // caught 53 of 66 (80%; 29 of 49, 59%, on 1001 to 1040), and TST, which flies on, 12 of 33 (36%; 17
  // of 40, 43%): pumped open, a fold reopens nearer TST's circle, where it meets more of its plates
  // by the way. Under 3: 62 of 96 (65%; 40 of 63, 63%), and TST 6 of 25 (24%; 17 of 42, 40%). In
  // blocks of 40 from 1 to 800 the one circling back caught 60 to 81% of 45 to 101 plates, from 18 to
  // 51 points more than TST. Over those skies it banked 10 kg a run less than the collector that
  // flies on, which is why the collector leaves them to chance (pilots.js).
  assert.ok(recoverer.scattered >= 40, `${recoverer.scattered} plates sprayed off the bar of the collector circling back`);
  assert.ok(recoverer.share >= 0.5, `${(recoverer.share * 100).toFixed(0)}% caught back`);
  assert.ok(recoverer.share >= dodger.share + 0.15, `${(recoverer.share * 100).toFixed(0)}% against TST's ${(dodger.share * 100).toFixed(0)}%`);
});

test('every sky opens with the empty bar locked out under three white lights, nothing new comes under 550 m but the 500 m stones, and the fog judges the bar last at ×1, whoever flies it', () => {
  for (const name of Object.keys(PILOTS)) {
    for (const run of flown(name)) {
      const [opener] = run.lifts;
      const last = run.lifts.at(-1);
      assert.deepEqual([opener.line, opener.kg, opener.red, opener.good], [MEET.every, MEET.bar, 0, true], `${name} on seed ${run.seed}`);
      assert.deepEqual(run.breaches, [], `${name} on seed ${run.seed}`);
      assert.equal(run.reason, 'fog', `${name} on seed ${run.seed}`);
      assert.deepEqual([last.line, last.double], [0, false], `${name} on seed ${run.seed}`);
    }
  }
});

test('told to dodge, to collect, to take gates and to circle back for its plates, the reference pilot flies exactly as it always has where there is nothing to dodge, collect, take or catch', () => {
  for (const seed of firstSkies(3)) {
    const bare = () => startRun(createRunWorld({ sky: createCloudbaseRun() }), seed);
    const plain = flyPilot(bare(), createReferencePilot({ brake: 'eased' }));
    for (const options of [TST, { ...TST, collect: true }, { ...TST, gates: true }, { ...TST, collect: true, recover: true }]) {
      assert.deepEqual(flyPilot(bare(), createReferencePilot(options)), plain, `seed ${seed}`);
    }
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
      // A wing surging is caught first, over the dodge, as every pilot's is.
      if (tst.catching) continue;
      if (bell.circling) assert.deepEqual(intent, { ...base, bar: true, brake: false });
      else assert.deepEqual(intent, { ...base, turn: away });
    }
  }
  // On these seeds: 8 bells thrown at a pilot circling off the bar, and 7 at one flying straight or
  // on the bar.
  assert.ok(bells.circling >= 4 && bells.straight >= 2, `${bells.circling} bells at a circling pilot, ${bells.straight} at a straight one`);
});

test('a collector flies at the next plate still ahead on a laid trail, on the bar, whatever else is in the sky, and goes back to the lift once none is left ahead', () => {
  let following = 0;
  let loaded = 0;
  for (const seed of firstSkies(3)) {
    const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet() }), seed);
    const collector = createReferencePilot({ brake: 'eased', collect: true, gates: false });
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
      // A wing surging or folded is caught or pumped first, as every pilot's is.
      if (collector.catching || without.catching || world.sky.state.pilot.collapse > 0) continue;
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
  // On these seeds: 130 s following trails and 40 plates loaded in 3 runs under SIM_VERSION 4, the
  // plates off the trail met by chance among them (136 s and 39 under 3; 136 s and 32 plates under
  // SIM_VERSION 2, 110 s and 38 under 1, when there were none).
  assert.ok(following >= 90 * 60 && loaded >= 25, `${(following / 60).toFixed(1)} s following, ${loaded} plates loaded`);
});

test('told to recover, a pilot circles back through its own sprayed plates on the light brake, the nearest first, while the collector leaves every plate off the trail to chance', () => {
  let circling = 0;
  let eased = 0;
  const ignored = { [PLATE_KIND.wind]: 0, [PLATE_KIND.thunder]: 0, [PLATE_KIND.bait]: 0, [PLATE_KIND.scatter]: 0 };
  for (const seed of firstSkies(8)) {
    const world = meetWorld(seed);
    // The collector told to recover flies each run; beside it the collector and the pilot told
    // neither are asked about the very same world at every step.
    const recoverer = createReferencePilot({ brake: 'eased', collect: true, gates: false, recover: true });
    const collector = createReferencePilot({ brake: 'eased', collect: true, gates: false });
    const plain = createReferencePilot({ brake: 'eased' });
    const intent = {};
    const collecting = {};
    const base = {};
    for (let reason = null; !reason; reason = stepRun(world, intent, RUN.step)) {
      recoverer.decide(world, intent);
      collector.decide(world, collecting);
      plain.decide(world, base);
      const { loose, trail } = world.meet.state;
      const { pos, yaw } = world.g;
      const sprayed = loose.filter((plate) => plate.live && plate.kind === PLATE_KIND.scatter);
      if (sprayed.length) {
        // Its own plates first: the nearest, turning hard on the light brake, eased as it is about to
        // go deep.
        const nearest = sprayed.reduce((a, b) => (Math.hypot(a.x - pos.x, a.z - pos.z) <= Math.hypot(b.x - pos.x, b.z - pos.z) ? a : b));
        assert.deepEqual({ ...intent, brake: true }, { turn: clamp(wrapAngle(Math.atan2(nearest.x - pos.x, -(nearest.z - pos.z)) - yaw) * 2.5, -1, 1), brake: true, bar: false });
        if (!intent.brake) eased += 1;
        assert.ok(world.g.brake < BRAKE.shelf + 0.01, `the brake never deep: ${world.g.brake}`);
        circling += 1;
      } else {
        assert.deepEqual(intent, collecting);
      }
      // Off a trail, the collector asks exactly what the pilot told neither does, whatever plates
      // hang in the sky.
      if (trail.live) continue;
      assert.deepEqual(collecting, base);
      for (const kind of Object.keys(ignored)) if (loose.some((plate) => plate.live && plate.kind === Number(kind))) ignored[kind] += 1;
    }
  }
  // On these seeds: 98 s circling back, and the collector off a trail with plates on gust fronts
  // in the sky for 99 s, under clouds for 56 s, over the fog for 13 s and its own sprayed ones for
  // 38 s.
  assert.ok(circling >= 30 * 60, `${(circling / 60).toFixed(1)} s circling back`);
  assert.ok(eased > 0 && eased < circling / 10, `eased ${eased} steps of ${circling}`);
  assert.ok(Object.values(ignored).every((steps) => steps >= 10 * 60), JSON.stringify(ignored));
});

test('a gate-taker dashes straight out of its climb for a stone nearly ahead once the dash would carry it over the line and into the opening, and straight back; TST never dashes', () => {
  let dashes = 0;
  let takes = 0;
  for (const seed of firstSkies(10)) {
    const world = meetWorld(seed);
    const taker = createReferencePilot({ ...TST, react: null, gates: true });
    const tst = createReferencePilot({ ...TST, react: null });
    const intent = {};
    const base = {};
    let dashing = false;
    let line = 0;
    for (let reason = null; !reason; reason = stepRun(world, intent, RUN.step)) {
      taker.decide(world, intent);
      tst.decide(world, base);
      const { runes } = world.meet.state;
      if (runes.line !== line) {
        line = runes.line;
        dashing = false;
      }
      const differs = intent.turn !== base.turn || intent.brake !== base.brake || intent.bar !== base.bar;
      if (differs && !dashing) {
        // The first step it leaves TST's way: a stone waiting nearly ahead, and the wing at or under
        // the opening's top.
        const { pos, yaw } = world.g;
        const ahead = runes.gates.filter((stone) => stone.state === GATE.waiting && Math.abs(wrapAngle(Math.atan2(stone.x - pos.x, -(stone.z - pos.z)) - yaw)) <= DASH.ahead);
        assert.ok(ahead.length > 0 && pos.y <= runes.line + GATES.tall, `seed ${seed}`);
        assert.ok(world.sky.state.peak >= runes.line - GATES.ahead && intent.bar === false);
        dashing = true;
        dashes += 1;
      }
    }
    takes += world.meet.state.runes.taken;
  }
  // On these seeds: 10 dashes, 8 of them through the stone (it dashes at most once a set).
  assert.ok(dashes >= 4 && takes >= 3 && takes <= dashes, `${dashes} dashes, ${takes} stones taken`);
  assert.equal(RUNE.none, 0);
});
