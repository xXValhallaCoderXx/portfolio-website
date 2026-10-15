import test from 'node:test';
import assert from 'node:assert/strict';
import { RUN, TRACE, createRunWorld, finishRun, startRun, stepBits, stepRun } from './run-step.js';
import { TST, WORTH_RUNES, createReferencePilot, flyPilot } from './pilots.js';
import { CLOUD_GATE, CLOUD_RAVENS, CLOUD_STRIKE, CLOUD_ZONE, createCloudbaseRun } from './cloudbase-state.js';
import { GATEWAY, surfaceAt } from './terrain.js';
import { EARS, FLIGHT, PITCH } from './flight.js';
import { MEET, createMeet } from './meet-state.js';
import { RUNE } from './meet-runes.js';
import { createBells } from './bells.js';

// What the reference pilot does on these skies, to the last bit: seed, options, then peak (m),
// strikes, stalls, front tucks, tip collapses, seconds, seconds in cloud and how the run ended. First taken before
// its flying moved into run-step.js and pilots.js, to hold the move to the bit; re-captured for
// SIM_VERSION 2, on purpose, since its hunted cores peak at their middle and the pilot circles
// tighter in them (pilots.js); re-captured for SIM_VERSION 3, and every row came out as version 2's
// to the bit: the sky, the wing and the bare pilot fly as they did, and everything new is the
// meet's and the kettlebells'. Re-captured for SIM_VERSION 4, on purpose: the wing swings over the
// pilot fore and aft and in its turns, surging as the air falls away and tucking above the ravens'
// grace height unless it is caught, and a fold is pumped open; every pilot catches and pumps
// (pilots.js CATCH), but for the last rows, a pilot that never does and so tucks. No reference
// pilot ever banks far enough to tip. Any change to how a run flies shows up here first.
const GOLDENS = [
  [1, {"brake": "none"}, 957.1358978670338, 2, 0, 0, 0, 138.06666666666868, 2.3833333333333298, 'fog'],
  [2, {"brake": "none"}, 1123.7629637278148, 0, 0, 0, 0, 142.96666666667258, 13.533333333333585, 'fog'],
  [3, {"brake": "none"}, 1166.72919022752, 1, 0, 0, 0, 143.55000000000638, 3.9666666666666575, 'fog'],
  [4, {"brake": "none"}, 954.0916593639267, 1, 0, 0, 0, 137.51666666666824, 7.4666666666666455, 'fog'],
  [5, {"brake": "none"}, 836.1547200771289, 0, 0, 0, 0, 134.6499999999993, 28.74999999999965, 'fog'],
  [6, {"brake": "none"}, 1299.7875170177483, 0, 0, 0, 0, 147.00000000000912, 1.8333333333333317, 'fog'],
  [7, {"brake": "none"}, 1058.704471332012, 3, 0, 0, 0, 141.26666666667123, 2.3833333333333298, 'fog'],
  [8, {"brake": "none"}, 1181.5568966481717, 1, 0, 0, 0, 144.33333333334033, 3.2499999999999933, 'fog'],
  [9, {"brake": "none"}, 1170.3260303680297, 1, 0, 0, 0, 143.7000000000065, 8.683333333333344, 'fog'],
  [10, {"brake": "none"}, 1277.0480000368907, 0, 0, 0, 0, 146.63333333334216, 4.333333333333323, 'fog'],
  [11, {"brake": "none"}, 1472.1053387400539, 1, 0, 0, 0, 150.88333333334555, 3.866666666666658, 'fog'],
  [12, {"brake": "none"}, 1032.0256881273458, 2, 0, 0, 0, 139.6333333333366, 0, 'fog'],
  [1, {"brake": "eased"}, 1357.7424599482406, 0, 0, 0, 0, 147.83333333334312, 23.199999999999964, 'fog'],
  [2, {"brake": "eased"}, 1828.1628684732254, 1, 0, 0, 0, 157.733333333351, 4.9166666666666545, 'fog'],
  [3, {"brake": "eased"}, 1538.9685052339607, 2, 0, 0, 0, 152.2500000000133, 8.900000000000022, 'fog'],
  [4, {"brake": "eased"}, 1193.1826147666895, 1, 0, 0, 0, 144.66666666667393, 14.96666666666699, 'fog'],
  [5, {"brake": "eased"}, 835.1105193608538, 0, 0, 0, 0, 134.79999999999941, 30.199999999999566, 'fog'],
  [6, {"brake": "eased"}, 1655.1443382648972, 2, 0, 0, 0, 154.53333333334845, 0, 'fog'],
  [7, {"brake": "eased"}, 1476.0811047556929, 4, 0, 0, 0, 150.96666666667895, 0, 'fog'],
  [8, {"brake": "eased"}, 1356.9477264434472, 2, 0, 0, 0, 147.8500000000098, 18.38333333333357, 'fog'],
  [9, {"brake": "eased"}, 1507.9739219792982, 2, 0, 0, 0, 151.61666666667946, 3.8333333333333246, 'fog'],
  [10, {"brake": "eased"}, 1483.7252386966104, 4, 0, 0, 0, 151.06666666667903, 8.416666666666664, 'fog'],
  [11, {"brake": "eased"}, 1649.3237050276462, 2, 0, 0, 0, 154.4166666666817, 12.516666666666868, 'fog'],
  [12, {"brake": "eased"}, 1225.243188707521, 2, 0, 0, 0, 144.55000000000717, 0, 'fog'],
  [1, {"brake": "late"}, 1058.7614157493704, 1, 0, 1, 0, 140.966666666671, 12.383333333333528, 'fog'],
  [2, {"brake": "late"}, 1284.8246545835837, 1, 0, 0, 0, 146.2000000000085, 17.10000000000031, 'fog'],
  [3, {"brake": "late"}, 1473.0261003501096, 2, 0, 0, 0, 150.5166666666786, 0, 'fog'],
  [4, {"brake": "late"}, 872.4897167029495, 3, 0, 0, 0, 135.26666666666645, 19.28333333333352, 'fog'],
  [5, {"brake": "late"}, 1108.4469003835668, 1, 0, 0, 0, 142.4500000000055, 10.633333333333441, 'fog'],
  [6, {"brake": "late"}, 1549.3815834499508, 1, 0, 0, 0, 152.35000000001338, 10.683333333333444, 'fog'],
  [7, {"brake": "late"}, 1210.3307553268207, 2, 0, 0, 0, 145.08333333334093, 18.916666666666874, 'fog'],
  [8, {"brake": "late"}, 1381.545849981059, 0, 0, 0, 0, 148.96666666667736, 11.716666666666828, 'fog'],
  [9, {"brake": "late"}, 1504.5321456816837, 2, 0, 0, 0, 151.55000000001274, 0, 'fog'],
  [10, {"brake": "late"}, 1306.3718204915178, 1, 0, 0, 0, 147.30000000000936, 20.68333333333344, 'fog'],
  [11, {"brake": "late"}, 1622.8380266410059, 2, 0, 0, 0, 153.90000000001461, 7.09999999999998, 'fog'],
  [12, {"brake": "late"}, 1333.8339013484142, 1, 0, 0, 0, 147.8500000000098, 11.383333333333479, 'fog'],
  [1, {"brake": "held"}, 1012.1039082653682, 2, 4, 0, 0, 139.7833333333367, 9.616666666666724, 'fog'],
  [2, {"brake": "held"}, 1105.586461627324, 2, 5, 0, 0, 142.50000000000554, 2.8499999999999948, 'fog'],
  [3, {"brake": "held"}, 1186.3851500368783, 1, 4, 0, 0, 143.66666666667314, 5.516666666666652, 'fog'],
  [4, {"brake": "held"}, 870.2213345153102, 1, 4, 0, 0, 134.2333333333323, 5.749999999999985, 'fog'],
  [5, {"brake": "held"}, 836.9193398117027, 0, 3, 0, 0, 134.66666666666598, 30.38333333333289, 'fog'],
  [6, {"brake": "held"}, 943.2032026447092, 3, 5, 0, 0, 137.3833333333348, 0, 'fog'],
  [7, {"brake": "held"}, 1228.410497654733, 2, 5, 0, 0, 145.46666666667457, 0.39999999999999997, 'fog'],
  [8, {"brake": "held"}, 1116.683857352091, 3, 3, 0, 0, 142.15000000000526, 0, 'fog'],
  [9, {"brake": "held"}, 1406.1146908841258, 1, 4, 0, 0, 149.31666666667763, 0, 'fog'],
  [10, {"brake": "held"}, 1146.9085622004125, 2, 5, 0, 0, 142.7000000000057, 0, 'fog'],
  [11, {"brake": "held"}, 1189.173305564863, 5, 4, 0, 0, 143.91666666667334, 1.9833333333333312, 'fog'],
  [12, {"brake": "held"}, 1178.4797121836316, 0, 5, 0, 0, 144.21666666667358, 7.899999999999977, 'fog'],
  [1, {"brake": "none", "withFlock": false}, 739.1308906576244, 5, 0, 0, 0, 129.7499999999954, 0, 'fog'],
  [2, {"brake": "none", "withFlock": false}, 857.0494711664305, 2, 0, 0, 0, 135.51666666666665, 0.4333333333333333, 'fog'],
  [3, {"brake": "none", "withFlock": false}, 1025.8586021255303, 4, 0, 0, 0, 140.2166666666704, 0, 'fog'],
  [4, {"brake": "none", "withFlock": false}, 813.9906467931692, 1, 0, 0, 0, 133.94999999999874, 5.18333333333332, 'fog'],
  [5, {"brake": "none", "withFlock": false}, 836.8057686610298, 2, 0, 0, 0, 134.7333333333327, 12.23333333333352, 'fog'],
  [6, {"brake": "none", "withFlock": false}, 919.4463899838482, 3, 0, 0, 0, 137.41666666666816, 0, 'fog'],
  [1, {"brake": "none", "hazards": false}, 1188.7447140343793, 0, 0, 0, 0, 144.56666666667385, 0, 'fog'],
  [2, {"brake": "none", "hazards": false}, 1213.8978245796002, 0, 0, 0, 0, 145.16666666667433, 0, 'fog'],
  [3, {"brake": "none", "hazards": false}, 1239.8265926249492, 0, 0, 0, 0, 145.7666666666748, 0, 'fog'],
  [4, {"brake": "none", "hazards": false}, 1029.892660346921, 0, 0, 0, 0, 140.5333333333373, 0, 'fog'],
  [5, {"brake": "none", "hazards": false}, 1088.5024415784574, 0, 0, 0, 0, 141.75000000000495, 0, 'fog'],
  [6, {"brake": "none", "hazards": false}, 1283.5827736185565, 0, 0, 0, 0, 146.78333333334228, 0, 'fog'],
  [1, {"brake": "none", "catches": false}, 903.3573779904191, 1, 0, 2, 0, 136.58333333333417, 0, 'fog'],
  [2, {"brake": "none", "catches": false}, 1123.7629637278148, 0, 0, 0, 0, 142.96666666667258, 13.533333333333585, 'fog'],
  [3, {"brake": "none", "catches": false}, 1182.0492581977373, 1, 0, 1, 0, 143.98333333334006, 4.116666666666657, 'fog'],
  [4, {"brake": "none", "catches": false}, 859.2468643243675, 1, 0, 2, 0, 135.58333333333337, 6.649999999999982, 'fog'],
  [5, {"brake": "none", "catches": false}, 837.7197349100353, 2, 0, 3, 0, 132.53333333333094, 6.899999999999981, 'fog'],
  [6, {"brake": "none", "catches": false}, 1275.5066944006755, 0, 0, 1, 0, 146.46666666667537, 1.266666666666667, 'fog'],
];

test('the one step flies the reference pilot exactly as recorded under this SIM_VERSION, to the last bit', () => {
  for (const [seed, options, peak, strikes, stalls, tucks, tips, seconds, cloud, reason] of GOLDENS) {
    const { hazards = true, ...pilot } = options;
    const world = startRun(createRunWorld({ sky: createCloudbaseRun({ hazards }) }), seed);
    const flown = flyPilot(world, createReferencePilot(pilot));
    assert.deepEqual(flown, { peak, strikes, stalls, tucks, tips, seconds, cloud, reason }, `seed ${seed} ${JSON.stringify(options)}`);
  }
});

// The same with the meet and Hrungnir's kettlebells in the run, which the goldens above leave out:
// what TST (pilots.js), the collector (TST following the trails of plates and taking Fehu's or
// Tiwaz's stone), the gate-taker (TST taking Fehu's or Tiwaz's stone at each line), a pilot holding
// its line with the light brake eased (whom most kettlebells hit) and that pilot taking Algiz's
// stone came to on these skies. Seed and pilot, then the peak (m, to the last bit), fixed steps
// flown, the TOTAL (kg), each lift's red lights in order (1 contact, 2 control and 4 airspace, added
// up; `x` judged under the horn, at ×2; the fog's lift last), reps and how many of them were to
// depth, trails and plates loaded, the kettlebells thrown, hit, close and dodged, the plates off
// gust fronts, from under clouds and the fog's bait, the plates strikes sprayed and those loaded
// back, bells glanced off Algiz, how the Beast came out (BELL_RESULT), and the gates taken with
// their runes (a bit for each). Every link already shared replays through these rules, so none of
// it may change without a new SIM_VERSION. Re-captured for SIM_VERSION 3, on purpose, with the
// plates off the trail, the gates and the Beast added (TST's and the line-holder's rows came out as
// version 2's), and the collector's and gate-taker's rows again when those pilots were retuned
// (pilots.js, not the rules: the other rows stayed to the bit); and for SIM_VERSION 4, on purpose,
// as the wing swings and folds are pumped open. Seed 3's collector holds Fehu as strikes spray
// five plates, and all five go straight back on the bar (its reach takes in the ring they spray
// from); the collector's seeds 5 and 15 lose bars to strikes under Tiwaz; a bell glances off Algiz
// on seeds 1 and 36 of the pilot taking it, and on seed 19 it never reaches the stone.
const MEET_GOLDENS = [
  [1, 'TST', 1044.867034736461, 8443, 215, '0 0 4 1x 0', 3, 3, 4, 4, 3, 0, 0, 3, 0, 1, 0, 1, 1, 0, 0, 0, 0],
  [3, 'TST', 1491.6162855370328, 9077, 310, '0 0 0 1 0x 0', 4, 4, 5, 9, 4, 0, 0, 4, 2, 0, 0, 2, 1, 0, 3, 0, 0],
  [5, 'TST', 838.4841820234357, 8096, 240, '0 0 4x 4', 3, 3, 4, 5, 2, 0, 0, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  [10, 'TST', 1590.499684986063, 9196, 340, '0 0 0 1 0x 0x 0', 6, 6, 5, 4, 5, 0, 0, 5, 1, 0, 0, 1, 0, 0, 3, 0, 0],
  [1, 'collector', 1037.9381648574035, 8402, 375, '0 0 5 1x 0', 5, 5, 4, 15, 3, 0, 0, 2, 0, 0, 0, 3, 2, 0, 0, 0, 0],
  [3, 'collector', 1008.2787340546226, 8393, 447.5, '0 1 0 1x 0', 3, 1, 5, 17, 4, 0, 1, 3, 2, 0, 0, 5, 5, 0, 0, 1, 1],
  [5, 'collector', 836.7434636883831, 7998, 50, '0 1 5x 5', 3, 3, 4, 7, 3, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 1, 8],
  [10, 'collector', 956.5585022974227, 8294, 135, '0 1 1 1', 3, 3, 4, 7, 3, 0, 0, 3, 0, 0, 0, 5, 0, 0, 0, 0, 0],
  [14, 'collector', 933.804269908305, 8248, 390, '0 0 1 4', 2, 2, 5, 22, 1, 0, 0, 1, 3, 1, 0, 4, 4, 0, 0, 1, 1],
  [15, 'collector', 1553.7509505904677, 9112, 435, '0 0 1 0 0 1x 4', 5, 4, 5, 10, 3, 0, 1, 2, 1, 0, 0, 0, 0, 0, 3, 1, 8],
  [20, 'collector', 1182.4221700961398, 8664, 425, '0 1 1 1x 0', 2, 2, 5, 12, 4, 0, 1, 3, 1, 0, 0, 2, 2, 0, 0, 0, 0],
  [2, 'gates', 1178.3241970318902, 8647, 315, '0 0 1 0 4', 1, 1, 5, 14, 5, 0, 1, 4, 3, 0, 0, 0, 0, 0, 3, 2, 12],
  [12, 'gates', 1154.7828143696581, 8620, 545, '0 0 0 1x 0', 3, 3, 5, 20, 2, 0, 0, 2, 2, 0, 0, 2, 2, 0, 0, 1, 1],
  [20, 'gates', 1258.3689633852634, 8762, 300, '0 0 0 1 4x 4', 3, 2, 4, 10, 5, 0, 0, 5, 0, 0, 0, 1, 0, 0, 3, 0, 0],
  [1, 'holding', 1103.8200982721742, 8533, 170, '0 0 5 1x 1', 3, 3, 4, 5, 4, 3, 0, 0, 0, 1, 0, 2, 0, 0, 0, 0, 0],
  [3, 'holding', 1276.7635470114221, 8785, 205, '0 0 0 1 5x 0', 3, 3, 5, 15, 4, 4, 0, 0, 1, 2, 0, 8, 5, 0, 1, 0, 0],
  [5, 'holding', 836.8547958266746, 8085, 105, '0 0 5x 4', 3, 3, 4, 5, 2, 2, 0, 0, 0, 0, 0, 3, 2, 0, 0, 0, 0],
  [10, 'holding', 1325.1979292257631, 8847, 175, '0 0 0 1 5x 1', 4, 4, 4, 14, 4, 3, 1, 0, 1, 0, 1, 8, 2, 0, 2, 0, 0],
  [1, 'algiz', 1067.7854969323587, 8468, 185, '0 0 4 1x 0', 3, 3, 4, 8, 4, 2, 0, 0, 0, 0, 0, 4, 2, 1, 0, 1, 2],
  [19, 'algiz', 1317.6013097979778, 8846, 210, '0 0 0 5 1x 0', 2, 2, 5, 9, 4, 2, 1, 0, 1, 0, 0, 3, 1, 0, 1, 0, 0],
  [36, 'algiz', 1214.692642837299, 8711, 185, '0 0 1 1x 0', 1, 1, 4, 1, 3, 1, 1, 0, 0, 0, 0, 0, 0, 1, 2, 1, 2],
];
const MEET_PILOTS = {
  TST, collector: { ...TST, collect: true }, gates: { ...TST, gates: WORTH_RUNES }, holding: { brake: 'eased' }, algiz: { brake: 'eased', gates: [RUNE.algiz] },
};

test('with the meet and the kettlebells, each sky comes out as recorded under this SIM_VERSION: the same flight to the last bit, the same lights, plates, gates and kettlebells', () => {
  for (const row of MEET_GOLDENS) {
    const [seed, pilot, ...want] = row;
    const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells() }), seed);
    const flown = flyPilot(world, createReferencePilot(MEET_PILOTS[pilot]));
    const { state } = world.meet;
    const bells = world.bells.state;
    const shown = state.lifts.slice(0, state.count).map(({ red, double }) => `${red}${double ? 'x' : ''}`).join(' ');
    assert.equal(flown.reason, 'fog', `seed ${seed}, ${pilot}`);
    assert.deepEqual(
      [flown.peak, world.steps, state.total, shown, state.reps, state.deep, state.trails, state.plates, bells.thrown, bells.hits, bells.close, bells.dodged,
        state.wind, state.thunder, state.bait, state.scattered, state.recovered, bells.glanced, bells.beast.result, state.runes.taken, state.runes.runes],
      want,
      `seed ${seed}, ${pilot}`,
    );
    // The meet paid for every close call the kettlebells counted.
    assert.equal(state.close, bells.close);
  }
});

test('the same sky and the same asks give the same run, whatever wing and world flew before, its meet, gates and kettlebells too', () => {
  const fly = (world, seconds = 40) => {
    const intent = { turn: 0, brake: false, bar: false };
    for (let i = 0; i < seconds * 60; i++) {
      // A fixed, fussy pilot: circles, pulls the brake now and then, pushes the bar on the glide.
      intent.turn = Math.sin(i / 90);
      intent.brake = i % 700 > 520;
      intent.bar = i % 1100 > 950;
      if (stepRun(world, intent, RUN.step)) break;
    }
    return world;
  };
  const fresh = fly(startRun(createRunWorld({ sky: createCloudbaseRun() }), 77));
  // A world that has already flown, stalled, swung, tucked, pulled its ears and been struck, part way
  // through pumping a fold, starts the same run from scratch.
  const used = createRunWorld({ sky: createCloudbaseRun() });
  fly(startRun(used, 3));
  used.g.yawRate = 0.7;
  used.g.brake = 0.9;
  used.g.stallLoad = 0.8;
  used.g.ears = 0.6;
  Object.assign(used.g, { pitch: 0.4, pitchRate: -1, pitchPush: 0.3, tuck: 0.2, fallRest: 1, fallArmed: false });
  Object.assign(used.g, { lean: 0.5, roll: 0.4, rollRate: 1.5, rollRest: 0.1, rollSpeed: -1, tip: 0.3, tipSide: -1 });
  used.hook = -1;
  used.stalls = 9;
  used.tucks = 4;
  used.tips = 2;
  used.pump.held = 0.2;
  used.pump.n = 1;
  used.intent.ears = true;
  fly(startRun(used, 77));
  assert.deepEqual(used.sky.state, fresh.sky.state);
  assert.deepEqual({ ...used.g, pos: { ...used.g.pos } }, { ...fresh.g, pos: { ...fresh.g.pos } });
  assert.deepEqual([used.hook, used.stalls, used.tucks, used.tips, used.steps, used.pump], [fresh.hook, fresh.stalls, fresh.tucks, fresh.tips, fresh.steps, fresh.pump]);
  // With the meet and the kettlebells, a world that has flown a whole run, taken a gate, sprayed
  // its plates and met the Beast starts the next exactly as a new one: everything the meet keeps
  // (the plates off the trail, the gates and the blessing among it) and the kettlebells keep.
  const meetWorld = () => createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells() });
  const newer = startRun(meetWorld(), 21);
  flyPilot(newer, createReferencePilot({ ...TST, collect: true }), { limit: 140 });
  // Sky 12 (under SIM_VERSION 3 it was 32, which no longer meets the Beast, and 7 when the wing
  // first dived).
  const older = meetWorld();
  flyPilot(startRun(older, 12), createReferencePilot({ ...TST, collect: true }));
  assert.ok(older.meet.state.runes.taken > 0 && older.meet.state.scattered > 0 && older.bells.state.beast.n >= 0, 'the used world did all of it');
  startRun(older, 21);
  flyPilot(older, createReferencePilot({ ...TST, collect: true }), { limit: 140 });
  assert.deepEqual(older.meet.state, newer.meet.state);
  assert.deepEqual(older.bells.state, newer.bells.state);
  assert.deepEqual(older.sky.state, newer.sky.state);
});

test('a world with the meet flies the very sky of one with the kettlebells alone, but for a bell Algiz turns aside', () => {
  // Each pilot flies its sky with the meet; its twin flies the same sky without it, asking at every
  // step exactly what the pilot asked. Gates, plates and sprays never reach the sky; only a bell
  // glancing off Algiz could, where it would otherwise have struck.
  const collector = { ...TST, collect: true };
  let twins = 0;
  let gates = 0;
  let glances = 0;
  for (const [seed, options] of [[3, collector], [5, collector], [7, collector], [12, collector], [1, MEET_PILOTS.algiz]]) {
    const asked = [];
    const met = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells() }), seed);
    const pilot = createReferencePilot(options);
    const intent = { turn: 0, brake: false, bar: false };
    for (let reason = null; !reason;) {
      pilot.decide(met, intent);
      asked.push({ ...intent });
      reason = stepRun(met, intent, RUN.step);
    }
    const twin = startRun(createRunWorld({ sky: createCloudbaseRun(), bells: createBells() }), seed);
    for (const ask of asked) if (stepRun(twin, ask, RUN.step)) break;
    gates += met.meet.state.runes.taken;
    if (met.bells.state.glanced > 0) {
      // The pilot taking Algiz on seed 1: it turned a bell aside, which struck the twin.
      assert.ok(twin.sky.state.pilot.strikes > met.sky.state.pilot.strikes || twin.steps !== met.steps, `seed ${seed}`);
      glances += 1;
      continue;
    }
    assert.deepEqual(twin.sky.state, met.sky.state, `seed ${seed}`);
    assert.deepEqual(wing(twin.g), wing(met.g), `seed ${seed}`);
    assert.deepEqual([twin.hook, twin.struck, twin.stalls, twin.steps], [met.hook, met.struck, met.stalls, met.steps]);
    twins += 1;
  }
  assert.ok(twins >= 3 && gates >= 3 && glances === 1, `${twins} twins, ${gates} gates taken, ${glances} skies with a glance`);
});

test('every run starts settled at the gate, in the arch\'s opening, facing through it', () => {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun() }), 5);
  const { g } = world;
  assert.deepEqual([g.pos.x, g.pos.y, g.pos.z, g.yaw], [CLOUD_GATE.x, CLOUD_GATE.y, CLOUD_GATE.z, CLOUD_GATE.yaw]);
  assert.deepEqual([g.speed, g.vy, g.yawRate, g.brake, g.bar, g.stall, g.stallLoad], [FLIGHT.speed.trim, 0, 0, 0, 0, 0, 0]);
  // The gate is the arch's opening, so a run started there is a run flown through it.
  const { corridor } = GATEWAY;
  assert.equal(CLOUD_GATE.x, GATEWAY.x);
  assert.ok(CLOUD_GATE.z > corridor.minZ && CLOUD_GATE.z < corridor.maxZ);
  assert.ok(CLOUD_GATE.y > corridor.minY && CLOUD_GATE.y < corridor.maxY);
});

test('a folded wing hooks round the way it was turning when it was struck, and steering does not reach it', () => {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun() }), 8);
  for (let i = 0; i < 120; i++) stepRun(world, { turn: -1, brake: false, bar: false }, RUN.step);
  assert.ok(world.g.yawRate < -0.3);
  assert.equal(world.sky.strike(), true);
  stepRun(world, { turn: 1, brake: false, bar: false }, RUN.step);
  assert.equal(world.hook, -1);
  // While folded, a hard right asked of it still hooks left, and the brake does not reach it: held
  // all the way through, it is no pump either.
  for (let i = 0; i < 60; i++) stepRun(world, { turn: 1, brake: true, bar: false }, RUN.step);
  assert.ok(world.g.yawRate < 0);
  assert.equal(world.controls.locked, true);
  assert.equal(world.g.brake, 0);
});

test('pumping the brake opens a folded wing sooner: each press held 0.3 s and let go takes 0.4 s off, twice at most, while mashing or holding it does nothing', () => {
  // How long a fold lasts with `held(step)` saying whether the brake is held on each step of it.
  const fold = (held) => {
    // Struck high above the gate, where the fold has all the air it needs.
    const world = startRun(createRunWorld({ sky: createCloudbaseRun({ hazards: false }) }), 8);
    world.g.pos.y += 600;
    for (let i = 0; i < 60; i++) stepRun(world, { turn: 0, brake: false, bar: false }, RUN.step);
    assert.equal(world.sky.strike(), true);
    let steps = 0;
    while (world.sky.state.pilot.collapse > 0 && steps < 600) stepRun(world, { turn: 0, brake: held(steps++), bar: false }, RUN.step);
    return { seconds: steps * RUN.step, pumps: world.pump.n };
  };
  const { hold, cut, most } = CLOUD_STRIKE.pump;
  const press = Math.round(hold / RUN.step);
  // Presses of `length` steps from step 10, `gap` steps apart.
  const presses = (count, length = press, gap = 6) => (step) => {
    const k = step - 10;
    return k >= 0 && k < count * (length + gap) && k % (length + gap) < length;
  };
  const near = (a, b) => Math.abs(a - b) <= 1.5 * RUN.step;
  const alone = fold(() => false);
  assert.ok(near(alone.seconds, CLOUD_STRIKE.collapse) && alone.pumps === 0, `left alone, ${alone.seconds} s`);
  for (const [count, pumps] of [[1, 1], [2, 2], [3, 2], [5, 2]]) {
    const pumped = fold(presses(count));
    assert.equal(pumped.pumps, pumps, `${count} presses`);
    assert.ok(near(pumped.seconds, CLOUD_STRIKE.collapse - pumps * cut), `${count} presses: ${pumped.seconds.toFixed(3)} s`);
  }
  assert.equal(most, 2);
  // A press a step short of the hold is no pump, however many; nor are taps, nor a brake held through.
  assert.equal(fold(presses(4, press - 1)).pumps, 0, 'just short of the hold');
  assert.equal(fold(presses(12, 5, 5)).pumps, 0, 'mashed');
  assert.equal(fold(() => true).pumps, 0, 'held through');
  assert.ok(near(fold(() => true).seconds, CLOUD_STRIKE.collapse));
  // Between folds the count starts over.
  const world = startRun(createRunWorld({ sky: createCloudbaseRun({ hazards: false }) }), 8);
  world.pump.n = most;
  world.pump.held = 1;
  stepRun(world, { turn: 0, brake: false, bar: false }, RUN.step);
  assert.deepEqual(world.pump, { held: 0, n: 0 });
});

test('the air falling away surges the wing at any height, and only above the ravens\' grace height can it tuck', () => {
  // The same fall of the air under a wing in air with no lift and no sink, as if it had just left a
  // core that lifted it 20 m/s, either side of the grace height, flown on hands up.
  for (const [y, folds] of [[CLOUD_RAVENS.grace + 30, true], [CLOUD_RAVENS.grace - 30, false]]) {
    const world = startRun(createRunWorld({ sky: createCloudbaseRun({ hazards: false }) }), 8);
    const forces = {};
    let spot = null;
    for (let a = 0; a < 64 && !spot; a++) {
      const at = { x: CLOUD_ZONE.x + Math.cos(a) * CLOUD_ZONE.r * 0.6, y, z: CLOUD_ZONE.z + Math.sin(a) * CLOUD_ZONE.r * 0.6 };
      world.sky.sample(at, 0, forces);
      if (forces.lift === 0 && forces.sink === 0 && world.sky.inside(at)) spot = at;
    }
    assert.ok(spot, 'a spot of still air');
    Object.assign(world.g.pos, spot);
    Object.assign(world.g, { under: 20, felt: true, fallArmed: true, fallRest: 0 });
    const intent = { turn: 0, brake: false, bar: false };
    stepRun(world, intent, RUN.step);
    assert.equal(world.controls.folds, folds);
    assert.equal(world.controls.swing, true);
    assert.ok(world.g.pitchPush < -PITCH.push.fall * 0.9, `at ${y} m it surges: ${world.g.pitchPush} rad/s owed`);
    let ahead = 0;
    for (let i = 0; i < 90 && world.g.tuck === 0; i++) {
      stepRun(world, intent, RUN.step);
      ahead = Math.min(ahead, world.g.pitch);
    }
    assert.equal(world.tucks > 0, folds, `at ${y} m`);
    if (!folds) assert.ok(-ahead > PITCH.line, 'low down it swings as far, and is only stopped');
  }
});

test('a tuck is counted for the run, but is no stall: the control light stays white', () => {
  // A pilot circling hands up, so no brake of its own catches the surge.
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet() }), 3);
  const pilot = createReferencePilot({ catches: false });
  const intent = { turn: 0, brake: false, bar: false };
  let reason = null;
  while (!reason && world.g.pos.y < CLOUD_RAVENS.grace + 20) reason = stepRun(world, pilot.decide(world, intent), RUN.step);
  // A surge that will carry the wing past its line.
  world.g.pitchRate = -2.8;
  while (!reason && world.meet.state.count < 2) reason = stepRun(world, pilot.decide(world, intent), RUN.step);
  assert.ok(world.tucks >= 1, `${world.tucks} tucks`);
  assert.equal(world.stalls, 0);
  const lift = world.meet.state.lifts[1];
  assert.equal(lift.line, 2 * MEET.every);
  assert.equal(lift.red & 2, 0, 'the control light is white');
});

test('touching down ends a run there and then, without stepping the sky', () => {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun() }), 4);
  // Gliding down 5 m above the hillside beyond the edge of the sky, where no lift can hold it up.
  Object.assign(world.g.pos, { x: CLOUD_ZONE.x + CLOUD_ZONE.r + 20, z: CLOUD_ZONE.z });
  world.g.pos.y = surfaceAt(world.g.pos.x, world.g.pos.z) + 5;
  world.g.vy = -2;
  let ended = null;
  let flown = 0;
  for (; flown < 600 && !ended; flown++) ended = stepRun(world, { turn: 0, brake: true, bar: false }, RUN.step);
  assert.equal(ended, 'landed');
  // Every step before the last moved the sky on; the one that touched down did not.
  assert.ok(flown > 1);
  assert.equal(world.steps, flown - 1);
  assert.ok(Math.abs(world.sky.state.elapsed - (flown - 1) * RUN.step) < 1e-9);
});

test('a strike called between steps still hooks the wing the way it was turning', () => {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun() }), 6);
  for (let i = 0; i < 120; i++) stepRun(world, { turn: 1, brake: false, bar: false }, RUN.step);
  world.sky.strike();
  stepRun(world, { turn: -1, brake: false, bar: false }, RUN.step);
  assert.equal(world.hook, 1);
  assert.equal(world.struck, 1);
});

const wing = (g) => ({ ...g, pos: { ...g.pos } });

// What each of the sixteen ways of holding the controls asks of the wing: bits (1 left, 2 right,
// 4 brake, 8 the speed bar), then the turn, the brake, the bar and the big ears they stand for.
const ASKS = [
  [0b0000, 0, false, false, false], [0b0001, -1, false, false, false], [0b0010, 1, false, false, false], [0b0011, 0, false, true, false],
  [0b0100, 0, true, false, false], [0b0101, -1, true, false, false], [0b0110, 1, true, false, false], [0b0111, 0, true, true, false],
  [0b1000, 0, false, true, false], [0b1001, -1, false, true, false], [0b1010, 1, false, true, false], [0b1011, 0, false, true, false],
  [0b1100, 0, false, false, true], [0b1101, -1, false, false, true], [0b1110, 1, false, false, true], [0b1111, 0, false, false, true],
];

test('the controls fly exactly what they stand for: left and right held together push the speed bar, straight, and the brake and the bar bits together are the big ears', () => {
  for (const [bits, turn, brake, bar, ears] of ASKS) {
    // Held for ten seconds from the gate, beside a twin asked the same in so many words.
    const held = startRun(createRunWorld({ sky: createCloudbaseRun() }), 3);
    const twin = startRun(createRunWorld({ sky: createCloudbaseRun() }), 3);
    const asked = { turn, brake, bar, ears };
    for (let i = 0; i < 10 * 60; i++) {
      assert.equal(stepBits(held, bits), stepRun(twin, asked, RUN.step));
      assert.deepEqual(held.intent, asked, `bits ${bits}`);
    }
    assert.deepEqual(held.sky.state, twin.sky.state, `bits ${bits}`);
    assert.deepEqual(wing(held.g), wing(twin.g), `bits ${bits}`);
    assert.deepEqual([held.hook, held.struck, held.stalls, held.steps], [twin.hook, twin.struck, twin.stalls, twin.steps]);
  }
  // On the chord the wing really is on the bar, flying straight; with the brake held as well, the
  // brake wins, as it does over the bar's own key.
  const chord = startRun(createRunWorld({ sky: createCloudbaseRun() }), 3);
  for (let i = 0; i < 3 * 60; i++) stepBits(chord, 0b0011);
  assert.equal(chord.g.bar, 1);
  // Fast, if not settled: leaving the launch column on the bar swings the wing a little.
  assert.ok(chord.g.speed > FLIGHT.speed.trim + 3, `${chord.g.speed} m/s`);
  assert.equal(chord.g.yawRate, 0);
  const braked = startRun(createRunWorld({ sky: createCloudbaseRun() }), 3);
  for (let i = 0; i < 3 * 60; i++) stepBits(braked, 0b0111);
  assert.equal(braked.g.bar, 0);
  assert.ok(braked.g.brake > 0);
  assert.equal(braked.g.ears, 0);
  // The brake and the bar bits together pull the ears all the way in, and the arrows still steer by
  // weight shift; both arrows with them hold the ears straight.
  for (const [bits, way] of [[0b1100, 0], [0b1101, -1], [0b1110, 1], [0b1111, 0]]) {
    const eared = startRun(createRunWorld({ sky: createCloudbaseRun() }), 3);
    for (let i = 0; i < 3 * 60; i++) stepBits(eared, bits);
    assert.deepEqual([eared.g.ears, eared.g.bar, eared.g.brake], [1, 0, 0], `bits ${bits}`);
    assert.ok(Math.abs(eared.g.yawRate - way * EARS.turn) < 1e-3, `bits ${bits}: ${eared.g.yawRate} rad/s`);
  }
});

test('the barogram samples height, fog and total as a run starts and once a second after, and nothing of the last run is left in it', () => {
  const world = createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells() });
  const { trace } = world;
  const arrays = [trace.alt, trace.fog, trace.total];
  assert.ok(arrays.every((array) => array instanceof Float32Array && array.length === TRACE.length));
  // A world that has already flown a run starts the next one's barogram as a new world would.
  flyPilot(startRun(world, 9), createReferencePilot());
  assert.ok(trace.n > 100);
  startRun(world, 4);
  assert.deepEqual(trace, startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells() }), 4).trace);
  assert.deepEqual([trace.n, trace.alt[0], trace.fog[0], trace.total[0]], [1, CLOUD_GATE.y, 0, 0]);
  // Sample i is the run as it stood after i seconds, written down on the step that ends that second.
  const seen = [[world.g.pos.y, world.sky.state.fogHeight, 0]];
  const pilot = createReferencePilot({ brake: 'eased' });
  const intent = { turn: 0, brake: false, bar: false };
  let reason = null;
  while (!reason) {
    pilot.decide(world, intent);
    reason = stepRun(world, intent, RUN.step);
    if (world.steps % 60 === 0) seen.push([world.g.pos.y, world.sky.state.fogHeight, world.meet.state.total]);
  }
  assert.equal(reason, 'fog');
  assert.equal(trace.n, Math.floor(world.steps / 60) + 1);
  assert.equal(trace.n, seen.length);
  for (let i = 0; i < trace.n; i++) {
    assert.deepEqual([trace.alt[i], trace.fog[i], trace.total[i]], seen[i].map(Math.fround), `second ${i}`);
  }
  assert.ok(trace.total[trace.n - 1] > 0 && trace.total[trace.n - 1] <= world.meet.state.total);
  // A world stepped on past four minutes, the sky stood still after its fog, writes no further.
  const room = TRACE.every * TRACE.length;
  for (let i = 0; i < room && world.steps <= room; i++) stepRun(world, { turn: 0, brake: false, bar: false }, RUN.step);
  assert.ok(world.steps > room, `${world.steps} steps`);
  assert.equal(trace.n, TRACE.length);
  assert.ok([trace.alt, trace.fog, trace.total].every((array, i) => array === arrays[i] && array.length === TRACE.length));
});

test('finishing a run judges the bar for the fog or a touchdown and forfeits it for anything else, stops the sky, and counts only once', () => {
  for (const [reason, judged] of [['fog', true], ['landed', true], ['quit', false], ['travel', false]]) {
    const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet() }), 6);
    // Past the opener and still flying.
    flyPilot(world, createReferencePilot(), { limit: 30 });
    const { state } = world.meet;
    const before = { count: state.count, total: state.total, kg: state.bar + MEET.bar };
    assert.ok(before.count >= 1 && world.sky.state.active);
    finishRun(world, reason);
    assert.equal(world.sky.state.active, false);
    assert.equal(state.ended, judged ? reason : 'quit');
    assert.equal(state.count, before.count + (judged ? 1 : 0));
    if (judged) {
      const mist = state.lifts[before.count];
      assert.deepEqual([mist.line, mist.kg, mist.double, mist.at], [0, before.kg, false, world.sky.state.elapsed]);
      assert.equal(state.total, before.total + (mist.good ? before.kg : 0));
    } else {
      assert.equal(state.total, before.total);
    }
    // The first ending is the one that counts.
    const after = structuredClone(state);
    finishRun(world, judged ? 'quit' : 'fog');
    assert.deepEqual(state, after);
  }
  // The bare sky ends the same way, with no meet to judge it.
  const bare = startRun(createRunWorld({ sky: createCloudbaseRun() }), 6);
  flyPilot(bare, createReferencePilot(), { limit: 5 });
  assert.equal(finishRun(bare, 'fog'), bare);
  assert.equal(bare.sky.state.active, false);
});
