import test from 'node:test';
import assert from 'node:assert/strict';
import { RUN, TRACE, createRunWorld, finishRun, startRun, stepBits, stepRun } from './run-step.js';
import { TST, WORTH_RUNES, createReferencePilot, flyPilot } from './pilots.js';
import { CLOUD_GATE, CLOUD_RAVENS, CLOUD_STRIKE, CLOUD_ZONE, createCloudbaseRun } from './cloudbase-state.js';
import { GATEWAY, surfaceAt } from './terrain.js';
import { EARS, FLIGHT } from './flight.js';
import { MEET, createMeet } from './meet-state.js';
import { RUNE } from './meet-runes.js';
import { createBells } from './bells.js';

// What the reference pilot does on these skies, to the last bit: seed, options, then peak (m),
// strikes, stalls, front tucks, seconds, seconds in cloud and how the run ended. First taken before
// its flying moved into run-step.js and pilots.js, to hold the move to the bit; re-captured for
// SIM_VERSION 2, on purpose, since its hunted cores peak at their middle and the pilot circles
// tighter in them (pilots.js); re-captured for SIM_VERSION 3, and every row came out as version 2's
// to the bit: the sky, the wing and the bare pilot fly as they did, and everything new is the
// meet's and the kettlebells'. Re-captured for SIM_VERSION 4, on purpose: the wing dives above the
// ravens' grace height and a fold is pumped open, and every pilot catches and pumps (pilots.js
// CATCH), but for the last rows, a pilot that never does and so tucks. Any change to how a run
// flies shows up here first.
const GOLDENS = [
  [1, {"brake": "none"}, 936.973872771315, 2, 0, 0, 137.53333333333492, 2.6999999999999953, 'fog'],
  [2, {"brake": "none"}, 1119.8777874202815, 0, 0, 0, 142.8666666666725, 8.333333333333327, 'fog'],
  [3, {"brake": "none"}, 1054.5846088165072, 2, 0, 0, 141.0500000000044, 0, 'fog'],
  [4, {"brake": "none"}, 1011.7931108945835, 0, 0, 0, 140.0333333333369, 8.31666666666666, 'fog'],
  [5, {"brake": "none"}, 836.6595766054314, 0, 0, 0, 134.6499999999993, 28.433333333333, 'fog'],
  [6, {"brake": "none"}, 1294.3296832599856, 0, 0, 0, 146.91666666667572, 1.4999999999999996, 'fog'],
  [7, {"brake": "none"}, 1114.6858084850323, 2, 0, 0, 142.58333333333894, 3.016666666666661, 'fog'],
  [8, {"brake": "none"}, 1105.825843054587, 1, 0, 0, 141.80000000000499, 3.1166666666666605, 'fog'],
  [9, {"brake": "none"}, 1167.8178427719956, 1, 0, 0, 143.68333333333982, 8.533333333333337, 'fog'],
  [10, {"brake": "none"}, 1277.011146070376, 0, 0, 0, 146.61666666667548, 4.383333333333323, 'fog'],
  [11, {"brake": "none"}, 1467.8940278445646, 1, 0, 0, 150.80000000001215, 3.7833333333333248, 'fog'],
  [12, {"brake": "none"}, 1109.8464093690977, 0, 0, 0, 142.48333333333886, 0, 'fog'],
  [1, {"brake": "eased"}, 1357.947489083276, 0, 0, 0, 147.8500000000098, 23.349999999999955, 'fog'],
  [2, {"brake": "eased"}, 1937.8051570632454, 0, 0, 0, 159.66666666668587, 2.0499999999999976, 'fog'],
  [3, {"brake": "eased"}, 1517.5596112315782, 2, 0, 0, 151.81666666667962, 9.000000000000027, 'fog'],
  [4, {"brake": "eased"}, 1197.8974314450288, 2, 0, 0, 144.7833333333407, 12.183333333333518, 'fog'],
  [5, {"brake": "eased"}, 835.7550285284906, 0, 0, 0, 134.84999999999945, 31.9333333333328, 'fog'],
  [6, {"brake": "eased"}, 1398.0760761571348, 3, 0, 0, 149.31666666667763, 0, 'fog'],
  [7, {"brake": "eased"}, 1546.8340280427842, 3, 0, 0, 152.40000000001342, 0, 'fog'],
  [8, {"brake": "eased"}, 1370.4420437330152, 1, 0, 0, 147.98333333334324, 22.133333333333358, 'fog'],
  [9, {"brake": "eased"}, 1501.5376723250254, 0, 0, 0, 151.48333333334602, 5.983333333333317, 'fog'],
  [10, {"brake": "eased"}, 1756.9535274809123, 1, 0, 0, 156.01666666668297, 6.966666666666647, 'fog'],
  [11, {"brake": "eased"}, 1793.3917556304027, 1, 0, 0, 157.10000000001716, 11.883333333333503, 'fog'],
  [12, {"brake": "eased"}, 1268.6473461953296, 2, 0, 0, 145.3666666666745, 0, 'fog'],
  [1, {"brake": "late"}, 1200.0648502080849, 1, 0, 0, 144.4500000000071, 12.56666666666687, 'fog'],
  [2, {"brake": "late"}, 1284.0281436954047, 1, 0, 0, 146.21666666667517, 17.133333333333642, 'fog'],
  [3, {"brake": "late"}, 1474.9952020509352, 3, 0, 0, 150.03333333334487, 0, 'fog'],
  [4, {"brake": "late"}, 1199.2477229253168, 1, 0, 0, 144.81666666667405, 16.86666666666699, 'fog'],
  [5, {"brake": "late"}, 1096.1988376128916, 3, 0, 0, 142.26666666667202, 5.316666666666653, 'fog'],
  [6, {"brake": "late"}, 1547.4094971290822, 1, 0, 0, 152.2500000000133, 11.133333333333466, 'fog'],
  [7, {"brake": "late"}, 918.3439621188957, 3, 0, 0, 137.01666666666785, 23.266666666666627, 'fog'],
  [8, {"brake": "late"}, 1271.2268145014016, 1, 0, 0, 146.40000000000865, 14.950000000000323, 'fog'],
  [9, {"brake": "late"}, 1661.3567088989482, 1, 0, 0, 154.6500000000152, 2.0999999999999974, 'fog'],
  [10, {"brake": "late"}, 1300.3380717622583, 2, 0, 0, 147.16666666667592, 17.91666666666693, 'fog'],
  [11, {"brake": "late"}, 1253.8625535429676, 3, 0, 0, 146.1000000000084, 10.300000000000091, 'fog'],
  [12, {"brake": "late"}, 1306.7146711115156, 2, 0, 0, 147.21666666667596, 11.100000000000131, 'fog'],
  [1, {"brake": "held"}, 1105.5320906773873, 2, 4, 0, 141.75000000000495, 8.266666666666657, 'fog'],
  [2, {"brake": "held"}, 901.5854954335423, 1, 5, 0, 136.86666666666773, 13.30000000000024, 'fog'],
  [3, {"brake": "held"}, 1253.0126328048832, 1, 5, 0, 146.08333333334173, 4.583333333333322, 'fog'],
  [4, {"brake": "held"}, 1037.402736591634, 1, 4, 0, 140.41666666667055, 4.783333333333322, 'fog'],
  [5, {"brake": "held"}, 836.5689853294175, 0, 3, 0, 134.66666666666598, 27.88333333333303, 'fog'],
  [6, {"brake": "held"}, 1017.3678839048296, 3, 4, 0, 140.10000000000363, 0, 'fog'],
  [7, {"brake": "held"}, 1222.152807033881, 2, 4, 0, 143.93333333334002, 7.5499999999999785, 'fog'],
  [8, {"brake": "held"}, 986.1609396834646, 2, 4, 0, 136.9666666666678, 2.4833333333333294, 'fog'],
  [9, {"brake": "held"}, 1179.973674510943, 0, 4, 0, 144.26666666667361, 1.8499999999999983, 'fog'],
  [10, {"brake": "held"}, 1162.4595472900055, 1, 5, 0, 143.85000000000662, 3.4499999999999926, 'fog'],
  [11, {"brake": "held"}, 1385.1332786095627, 4, 5, 0, 148.66666666667712, 1.1166666666666676, 'fog'],
  [12, {"brake": "held"}, 1188.576567078256, 0, 4, 0, 144.46666666667377, 6.866666666666648, 'fog'],
  [1, {"brake": "none", "withFlock": false}, 842.5516247274037, 3, 0, 0, 134.54999999999922, 0, 'fog'],
  [2, {"brake": "none", "withFlock": false}, 791.2721430552535, 3, 0, 0, 133.38333333333162, 2.749999999999995, 'fog'],
  [3, {"brake": "none", "withFlock": false}, 1059.2210406624756, 3, 0, 0, 141.0333333333377, 1.3166666666666669, 'fog'],
  [4, {"brake": "none", "withFlock": false}, 814.5693810532325, 1, 0, 0, 133.9833333333321, 5.2999999999999865, 'fog'],
  [5, {"brake": "none", "withFlock": false}, 836.6308594955013, 2, 0, 0, 134.76666666666605, 12.250000000000188, 'fog'],
  [6, {"brake": "none", "withFlock": false}, 944.3801577028196, 3, 0, 0, 137.95000000000192, 0, 'fog'],
  [1, {"brake": "none", "hazards": false}, 1195.0774268008515, 0, 0, 0, 144.71666666667397, 0, 'fog'],
  [2, {"brake": "none", "hazards": false}, 1208.5019603176609, 0, 0, 0, 145.0333333333409, 0, 'fog'],
  [3, {"brake": "none", "hazards": false}, 1237.0754911809559, 0, 0, 0, 145.71666666667477, 0, 'fog'],
  [4, {"brake": "none", "hazards": false}, 1058.1785187033117, 0, 0, 0, 141.2833333333379, 0, 'fog'],
  [5, {"brake": "none", "hazards": false}, 1084.5629913922016, 0, 0, 0, 141.68333333333823, 0, 'fog'],
  [6, {"brake": "none", "hazards": false}, 1280.9131189817397, 0, 0, 0, 146.65000000000884, 0, 'fog'],
  [1, {"brake": "none", "catches": false}, 826.2315608071353, 2, 0, 1, 133.18333333333146, 0, 'fog'],
  [2, {"brake": "none", "catches": false}, 972.2101652573955, 1, 0, 2, 138.93333333333604, 8.18333333333332, 'fog'],
  [3, {"brake": "none", "catches": false}, 1173.664463905874, 1, 0, 1, 143.98333333334006, 4.083333333333324, 'fog'],
  [4, {"brake": "none", "catches": false}, 873.1240022221577, 1, 0, 3, 135.58333333333337, 11.200000000000136, 'fog'],
  [5, {"brake": "none", "catches": false}, 840.2558602778965, 0, 0, 8, 134.8833333333328, 21.00000000000009, 'fog'],
  [6, {"brake": "none", "catches": false}, 1272.8618396131, 0, 0, 1, 146.41666666667533, 1.3833333333333333, 'fog'],
];

test('the one step flies the reference pilot exactly as recorded under this SIM_VERSION, to the last bit', () => {
  for (const [seed, options, peak, strikes, stalls, tucks, seconds, cloud, reason] of GOLDENS) {
    const { hazards = true, ...pilot } = options;
    const world = startRun(createRunWorld({ sky: createCloudbaseRun({ hazards }) }), seed);
    const flown = flyPilot(world, createReferencePilot(pilot));
    assert.deepEqual(flown, { peak, strikes, stalls, tucks, seconds, cloud, reason }, `seed ${seed} ${JSON.stringify(options)}`);
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
// as the wing dives and folds are pumped open. Seed 3's collector holds Fehu as a strike sprays
// three plates, and all three go straight back on the bar (its reach takes in the ring they spray
// from); the collector's seeds 5, 10 and 15 and the gate-taker's seed 2 lose bars to strikes under
// Tiwaz; a bell glances off Algiz on seeds 1, 19 and 36 of the pilot taking it (two on 36), and on
// seed 19 the bell that glances off is the Beast.
const MEET_GOLDENS = [
  [1, 'TST', 1152.218730323731, 8538, 275, '0 0 4 0x 1', 5, 4, 4, 7, 4, 0, 0, 3, 1, 1, 0, 1, 0, 0, 3, 0, 0],
  [3, 'TST', 1407.3029666951027, 8971, 285, '0 0 0 1 4x 0', 3, 3, 5, 8, 5, 0, 0, 4, 1, 0, 0, 1, 0, 0, 3, 0, 0],
  [5, 'TST', 838.7594642616897, 8097, 200, '0 0 4x 5', 2, 2, 4, 5, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [10, 'TST', 1500.638328836822, 9088, 370, '0 0 0 0 4x 4x 0', 5, 5, 4, 4, 4, 0, 0, 4, 1, 0, 0, 0, 0, 0, 3, 0, 0],
  [1, 'collector', 1122.8738597737904, 8463, 355, '0 0 5 0x 1', 5, 5, 4, 12, 4, 1, 0, 2, 1, 0, 0, 2, 1, 0, 3, 0, 0],
  [3, 'collector', 999.0673397373226, 8355, 347.5, '0 1 1 0', 3, 2, 4, 18, 4, 0, 0, 3, 3, 0, 0, 3, 3, 0, 0, 1, 1],
  [5, 'collector', 1272.188698704326, 8785, 395, '0 1 4 0 1x 0', 2, 2, 5, 13, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 8],
  [10, 'collector', 1511.1361271507444, 9088, 670, '0 0 1 0 0x 4x 0', 5, 4, 5, 12, 5, 0, 0, 5, 1, 0, 0, 0, 0, 0, 3, 1, 8],
  [14, 'collector', 917.0001210417947, 8215, 360, '0 0 1 4', 2, 2, 5, 18, 2, 0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 1, 1],
  [15, 'collector', 1136.440025553864, 8597, 385, '0 0 1 1x 4', 3, 3, 4, 11, 4, 1, 0, 3, 0, 0, 0, 0, 0, 0, 3, 1, 8],
  [20, 'collector', 1158.1184005233522, 8629, 340, '0 1 1 1x 0', 1, 1, 5, 10, 4, 0, 0, 4, 1, 0, 0, 2, 1, 0, 0, 0, 0],
  [2, 'gates', 1169.1272292808414, 8630, 190, '0 0 1 0 5', 1, 1, 5, 8, 4, 0, 0, 4, 2, 0, 0, 0, 0, 0, 3, 1, 8],
  [12, 'gates', 1091.2617614163653, 8516, 425, '0 0 1 0x 0', 2, 2, 5, 17, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 1],
  [20, 'gates', 1071.887715978815, 8498, 255, '0 1 0 0x 0', 2, 0, 4, 7, 6, 0, 0, 6, 1, 0, 0, 0, 0, 0, 3, 1, 1],
  [1, 'holding', 1084.0641501835325, 8446, 175, '0 0 5 1x 1', 3, 3, 4, 5, 3, 3, 0, 0, 0, 1, 0, 2, 0, 0, 0, 0, 0],
  [3, 'holding', 1279.2458506510252, 8788, 205, '0 0 0 1 5x 0', 3, 3, 5, 15, 4, 4, 0, 0, 1, 2, 0, 8, 5, 0, 1, 0, 0],
  [5, 'holding', 835.7605451166347, 8091, 125, '0 0 5x 4', 4, 4, 4, 8, 2, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0],
  [10, 'holding', 1543.6417973879654, 9100, 320, '0 0 0 0 1x 1x 1', 5, 5, 5, 7, 5, 4, 0, 1, 0, 0, 0, 3, 1, 0, 1, 0, 0],
  [1, 'algiz', 1060.6599487731082, 8459, 230, '0 0 4 1x 0', 2, 2, 4, 7, 4, 2, 0, 0, 0, 0, 0, 2, 1, 1, 0, 1, 2],
  [19, 'algiz', 1374.8373142748308, 8929, 140, '0 0 0 5 1x 5', 2, 2, 5, 7, 5, 3, 1, 0, 0, 0, 0, 1, 0, 1, 6, 1, 2],
  [36, 'algiz', 1374.421760836474, 8918, 245, '0 0 0 0x 0x 4', 3, 3, 4, 0, 4, 0, 1, 1, 0, 0, 0, 0, 0, 2, 3, 2, 2],
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
  // A world that has already flown, stalled, dived, tucked, pulled its ears and been struck, part way
  // through pumping a fold, starts the same run from scratch.
  const used = createRunWorld({ sky: createCloudbaseRun() });
  fly(startRun(used, 3));
  used.g.yawRate = 0.7;
  used.g.brake = 0.9;
  used.g.stallLoad = 0.8;
  used.g.ears = 0.6;
  used.g.dive = 0.3;
  used.g.tuck = 0.2;
  used.g.diveRest = 1;
  used.g.diveArmed = false;
  used.hook = -1;
  used.stalls = 9;
  used.tucks = 4;
  used.pump.held = 0.2;
  used.pump.n = 1;
  used.intent.ears = true;
  fly(startRun(used, 77));
  assert.deepEqual(used.sky.state, fresh.sky.state);
  assert.deepEqual({ ...used.g, pos: { ...used.g.pos } }, { ...fresh.g, pos: { ...fresh.g.pos } });
  assert.deepEqual([used.hook, used.stalls, used.tucks, used.steps, used.pump], [fresh.hook, fresh.stalls, fresh.tucks, fresh.steps, fresh.pump]);
  // With the meet and the kettlebells, a world that has flown a whole run, taken a gate, sprayed
  // its plates and met the Beast starts the next exactly as a new one: everything the meet keeps
  // (the plates off the trail, the gates and the blessing among it) and the kettlebells keep.
  const meetWorld = () => createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells() });
  const newer = startRun(meetWorld(), 21);
  flyPilot(newer, createReferencePilot({ ...TST, collect: true }), { limit: 140 });
  // Sky 7 (under SIM_VERSION 3 it was 32, which no longer meets the Beast).
  const older = meetWorld();
  flyPilot(startRun(older, 7), createReferencePilot({ ...TST, collect: true }));
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
  for (const [seed, options] of [[1, collector], [10, collector], [20, collector], [37, collector], [1, MEET_PILOTS.algiz]]) {
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

test('the wing can dive above the ravens\' grace height and not below it', () => {
  // The same fall of the air under a wing in air with no lift and no sink, as if it had just left a
  // core that lifted it 20 m/s, either side of the grace height.
  for (const [y, dives] of [[CLOUD_RAVENS.grace + 30, true], [CLOUD_RAVENS.grace - 30, false]]) {
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
    Object.assign(world.g, { under: 20, felt: true, diveArmed: true, diveRest: 0 });
    stepRun(world, { turn: 0, brake: false, bar: false }, RUN.step);
    assert.equal(world.controls.dive, dives);
    assert.equal(world.g.dive > 0, dives, `at ${y} m`);
  }
});

test('a tuck is counted for the run, but is no stall: the control light stays white', () => {
  // A pilot circling hands up, so no brake of its own catches the dive.
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet() }), 3);
  const pilot = createReferencePilot({ catches: false });
  const intent = { turn: 0, brake: false, bar: false };
  let reason = null;
  while (!reason && world.g.pos.y < CLOUD_RAVENS.grace + 20) reason = stepRun(world, pilot.decide(world, intent), RUN.step);
  // A dive about to close uncaught.
  world.g.dive = 2 * RUN.step;
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
  assert.ok(Math.abs(chord.g.speed - FLIGHT.speed.bar) < 0.1, `${chord.g.speed} m/s`);
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
