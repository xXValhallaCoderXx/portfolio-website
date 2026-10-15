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
// pilot fore and aft and in its turns, surging as the air falls away and front-collapsing unless it
// is caught, and a fold is pumped open; every pilot catches and pumps (pilots.js CATCH), but for the
// last rows, a pilot that never does and so collapses. Captured again as the brake came to go deep
// within two seconds (a brake held on now stalls every few seconds and climbs half as high) and the
// wing to fold at any height in a run. No reference pilot ever banks far enough to tip. Any change
// to how a run flies shows up here first.
const GOLDENS = [
  [1, {"brake": "none"}, 957.1665085386104, 2, 0, 0, 0, 138.06666666666868, 2.3833333333333298, 'fog'],
  [2, {"brake": "none"}, 1123.7629637278148, 0, 0, 0, 0, 142.96666666667258, 13.533333333333585, 'fog'],
  [3, {"brake": "none"}, 1166.6940727273684, 1, 0, 0, 0, 143.55000000000638, 3.949999999999991, 'fog'],
  [4, {"brake": "none"}, 954.1369537685954, 1, 0, 0, 0, 137.51666666666824, 7.483333333333312, 'fog'],
  [5, {"brake": "none"}, 836.1547239130235, 0, 0, 0, 0, 134.6499999999993, 28.766666666666314, 'fog'],
  [6, {"brake": "none"}, 1299.7863638768113, 0, 0, 0, 0, 147.00000000000912, 1.8333333333333317, 'fog'],
  [7, {"brake": "none"}, 1058.7570952550625, 3, 0, 0, 0, 141.2833333333379, 2.366666666666663, 'fog'],
  [8, {"brake": "none"}, 1181.2783364288948, 1, 0, 0, 0, 144.33333333334033, 3.2499999999999933, 'fog'],
  [9, {"brake": "none"}, 1170.3260303680297, 1, 0, 0, 0, 143.7000000000065, 8.683333333333344, 'fog'],
  [10, {"brake": "none"}, 1277.0480000368907, 0, 0, 0, 0, 146.63333333334216, 4.333333333333323, 'fog'],
  [11, {"brake": "none"}, 1472.1554154402222, 1, 0, 0, 0, 150.88333333334555, 3.866666666666658, 'fog'],
  [12, {"brake": "none"}, 1032.0576286769199, 2, 0, 0, 0, 139.6333333333366, 0, 'fog'],
  [1, {"brake": "eased"}, 1358.0110241362786, 0, 0, 0, 0, 147.83333333334312, 23.399999999999952, 'fog'],
  [2, {"brake": "eased"}, 1777.034895539017, 1, 0, 0, 0, 156.61666666668344, 6.549999999999982, 'fog'],
  [3, {"brake": "eased"}, 1539.7904418771477, 2, 0, 0, 0, 152.26666666667998, 9.000000000000027, 'fog'],
  [4, {"brake": "eased"}, 1191.7629789254388, 1, 0, 0, 0, 144.63333333334057, 15.000000000000325, 'fog'],
  [5, {"brake": "eased"}, 835.4978932680202, 0, 0, 0, 0, 134.83333333333277, 31.633333333332818, 'fog'],
  [6, {"brake": "eased"}, 1581.7599915209983, 2, 0, 0, 0, 153.10000000001398, 0, 'fog'],
  [7, {"brake": "eased"}, 1457.7418311362267, 4, 0, 0, 0, 150.5833333333453, 0, 'fog'],
  [8, {"brake": "eased"}, 1359.9062136625523, 2, 0, 0, 0, 147.8500000000098, 18.400000000000237, 'fog'],
  [9, {"brake": "eased"}, 1563.9699213719723, 1, 0, 0, 0, 152.7500000000137, 0.6500000000000004, 'fog'],
  [10, {"brake": "eased"}, 1482.460175352761, 4, 0, 0, 0, 151.1000000000124, 8.65000000000001, 'fog'],
  [11, {"brake": "eased"}, 1783.5537866382044, 1, 0, 0, 0, 156.93333333335036, 11.866666666666836, 'fog'],
  [12, {"brake": "eased"}, 1289.6853426063594, 1, 0, 0, 0, 146.7666666666756, 2.249999999999997, 'fog'],
  [1, {"brake": "late"}, 1024.595545811299, 2, 0, 0, 0, 139.8833333333368, 11.433333333333481, 'fog'],
  [2, {"brake": "late"}, 1271.2321716500192, 1, 0, 0, 0, 146.21666666667517, 14.133333333333615, 'fog'],
  [3, {"brake": "late"}, 1642.3761076048281, 1, 0, 0, 0, 154.28333333334825, 0, 'fog'],
  [4, {"brake": "late"}, 869.9973469505815, 2, 0, 0, 0, 135.19999999999973, 18.750000000000217, 'fog'],
  [5, {"brake": "late"}, 1230.8364347612876, 1, 0, 0, 0, 145.56666666667465, 7.616666666666645, 'fog'],
  [6, {"brake": "late"}, 1461.7310037612883, 2, 0, 0, 0, 150.6666666666787, 1.183333333333334, 'fog'],
  [7, {"brake": "late"}, 1482.9961954949608, 2, 0, 0, 0, 150.45000000001187, 0, 'fog'],
  [8, {"brake": "late"}, 1138.91133024901, 3, 0, 0, 0, 143.35000000000622, 6.349999999999983, 'fog'],
  [9, {"brake": "late"}, 1329.4502418335794, 1, 0, 0, 0, 147.81666666667644, 5.549999999999986, 'fog'],
  [10, {"brake": "late"}, 1341.2589766705019, 1, 0, 0, 0, 148.08333333334332, 16.666666666667002, 'fog'],
  [11, {"brake": "late"}, 1765.6088791004395, 2, 0, 0, 0, 156.60000000001676, 2.833333333333328, 'fog'],
  [12, {"brake": "late"}, 1204.2644885474513, 2, 0, 0, 0, 144.71666666667397, 1.7499999999999987, 'fog'],
  [1, {"brake": "held"}, 521.3247466380359, 2, 12, 0, 0, 121.94999999999436, 0, 'fog'],
  [2, {"brake": "held"}, 483.78519767945824, 1, 11, 1, 0, 119.51666666666117, 0, 'fog'],
  [3, {"brake": "held"}, 575.0621853181776, 1, 12, 0, 0, 122.19999999999435, 0, 'fog'],
  [4, {"brake": "held"}, 514.1677553443069, 1, 11, 0, 0, 120.93333333332775, 0, 'fog'],
  [5, {"brake": "held"}, 464.190188695158, 2, 10, 0, 0, 112.74999999999488, 0, 'fog'],
  [6, {"brake": "held"}, 447.1776270777886, 2, 12, 0, 0, 115.21666666666141, 0, 'fog'],
  [7, {"brake": "held"}, 402.1395370833416, 2, 12, 0, 0, 108.68333333332845, 0, 'fog'],
  [8, {"brake": "held"}, 411.36500879871613, 2, 12, 0, 0, 113.43333333332818, 0, 'fog'],
  [9, {"brake": "held"}, 644.1457100562287, 1, 13, 0, 0, 127.6166666666607, 0, 'fog'],
  [10, {"brake": "held"}, 617.2266003806429, 2, 14, 1, 0, 125.83333333332747, 1.35, 'fog'],
  [11, {"brake": "held"}, 696.2685152686269, 1, 15, 0, 0, 129.4166666666618, 0, 'fog'],
  [12, {"brake": "held"}, 351.49557820428294, 3, 6, 0, 0, 78.9999999999968, 0, 'fog'],
  [1, {"brake": "none", "withFlock": false}, 738.6759976900443, 5, 0, 0, 0, 129.73333333332872, 0, 'fog'],
  [2, {"brake": "none", "withFlock": false}, 857.0494711664305, 2, 0, 0, 0, 135.51666666666665, 0.4333333333333333, 'fog'],
  [3, {"brake": "none", "withFlock": false}, 1025.8586021255303, 4, 0, 0, 0, 140.2166666666704, 0, 'fog'],
  [4, {"brake": "none", "withFlock": false}, 813.9928723438113, 1, 0, 0, 0, 133.94999999999874, 5.18333333333332, 'fog'],
  [5, {"brake": "none", "withFlock": false}, 836.7979293942905, 2, 0, 0, 0, 134.7333333333327, 12.250000000000188, 'fog'],
  [6, {"brake": "none", "withFlock": false}, 919.4665493070478, 3, 0, 0, 0, 137.41666666666816, 0, 'fog'],
  [1, {"brake": "none", "hazards": false}, 1188.7447140343793, 0, 0, 0, 0, 144.56666666667385, 0, 'fog'],
  [2, {"brake": "none", "hazards": false}, 1213.8978245796002, 0, 0, 0, 0, 145.16666666667433, 0, 'fog'],
  [3, {"brake": "none", "hazards": false}, 1239.905340551477, 0, 0, 0, 0, 145.7833333333415, 0, 'fog'],
  [4, {"brake": "none", "hazards": false}, 1029.9343386024084, 0, 0, 0, 0, 140.5333333333373, 0, 'fog'],
  [5, {"brake": "none", "hazards": false}, 1088.5024415784574, 0, 0, 0, 0, 141.75000000000495, 0, 'fog'],
  [6, {"brake": "none", "hazards": false}, 1283.5827736185565, 0, 0, 0, 0, 146.78333333334228, 0, 'fog'],
  [1, {"brake": "none", "catches": false}, 866.7365209451525, 1, 0, 2, 0, 135.28333333333313, 2.633333333333329, 'fog'],
  [2, {"brake": "none", "catches": false}, 1123.7629637278148, 0, 0, 0, 0, 142.96666666667258, 13.533333333333585, 'fog'],
  [3, {"brake": "none", "catches": false}, 1182.0492581977373, 1, 0, 1, 0, 144.26666666667361, 2.416666666666663, 'fog'],
  [4, {"brake": "none", "catches": false}, 935.7486775820097, 0, 0, 3, 0, 137.83333333333516, 2.0999999999999974, 'fog'],
  [5, {"brake": "none", "catches": false}, 837.5798188184555, 0, 0, 4, 0, 134.74999999999937, 5.499999999999986, 'fog'],
  [6, {"brake": "none", "catches": false}, 1229.0224905397451, 0, 0, 1, 0, 145.4500000000079, 1.2333333333333338, 'fog'],
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
// as the wing swings and folds are pumped open, and again as the brake came to go deep within two
// seconds and the wing to fold at any height in a run. Seed 3's collector holds Fehu as strikes spray
// five plates, and all five go straight back on the bar (its reach takes in the ring they spray
// from); the collector's seeds 5 and 15 lose bars to strikes under Tiwaz; a bell glances off Algiz
// on seeds 1 and 36 of the pilot taking it, and on seed 19 it never reaches the stone.
const MEET_GOLDENS = [
  [1, 'TST', 1039.061424483198, 8440, 215, '0 0 4 0x 1', 3, 3, 4, 3, 3, 0, 0, 3, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  [3, 'TST', 1378.4105286711138, 8934, 310, '0 0 0 1 4x 0', 3, 3, 5, 9, 5, 0, 0, 4, 2, 0, 0, 1, 0, 0, 3, 0, 0],
  [5, 'TST', 836.7326905615819, 8092, 240, '0 0 4x 4', 3, 3, 4, 5, 2, 0, 0, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  [10, 'TST', 1593.5303015769011, 9199, 360, '0 0 0 1 0x 0x 0', 6, 6, 5, 5, 5, 0, 0, 5, 1, 0, 0, 1, 0, 0, 3, 0, 0],
  [1, 'collector', 1175.8905286725426, 8602, 350, '0 0 5 0x 0', 6, 6, 4, 13, 3, 0, 0, 3, 0, 0, 0, 1, 1, 0, 3, 0, 0],
  [3, 'collector', 1036.5028920029224, 8423, 400, '0 1 0 1x 0', 2, 2, 4, 12, 3, 0, 0, 3, 3, 1, 0, 1, 1, 0, 0, 1, 1],
  [5, 'collector', 840.973079976843, 8072, 95, '0 1 5x 4', 3, 3, 4, 8, 4, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 1, 8],
  [10, 'collector', 1517.453417917834, 9074, 405, '0 1 1 4 0x 4x 1', 5, 5, 5, 7, 5, 0, 0, 5, 1, 1, 0, 0, 0, 0, 3, 0, 0],
  [14, 'collector', 932.8182754720249, 8242, 410, '0 0 1 4', 2, 2, 5, 23, 2, 0, 0, 2, 4, 1, 0, 3, 3, 0, 0, 1, 1],
  [15, 'collector', 1565.3910950354082, 9157, 435, '0 0 0 0 0 1x 0', 5, 5, 5, 8, 4, 0, 0, 4, 0, 0, 0, 0, 0, 0, 3, 1, 8],
  [20, 'collector', 1190.162446194237, 8674, 415, '0 1 1 1x 0', 2, 2, 5, 12, 4, 0, 0, 4, 1, 0, 0, 2, 2, 0, 0, 0, 0],
  [2, 'gates', 1137.7334934422672, 8582, 160, '0 0 1 5x 0', 2, 1, 5, 7, 5, 0, 1, 4, 0, 0, 0, 0, 0, 0, 3, 1, 8],
  [12, 'gates', 993.7377204415768, 8372, 390, '0 0 1 1', 2, 2, 5, 19, 3, 0, 0, 3, 2, 0, 0, 0, 0, 0, 0, 1, 1],
  [20, 'gates', 1345.7341140751278, 8881, 305, '0 0 0 1 4x 4', 4, 4, 5, 11, 5, 0, 0, 5, 0, 0, 0, 1, 1, 0, 3, 0, 0],
  [1, 'holding', 1105.3847614566475, 8483, 175, '0 0 5 1x 1', 4, 4, 4, 6, 4, 3, 1, 0, 0, 1, 0, 3, 0, 0, 1, 0, 0],
  [3, 'holding', 1438.8366936106215, 9004, 235, '0 0 0 1 1x 1', 3, 3, 5, 11, 6, 5, 1, 0, 0, 0, 0, 8, 3, 0, 2, 0, 0],
  [5, 'holding', 835.5168780360101, 8090, 110, '0 0 5x 4', 4, 4, 4, 4, 2, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
  [10, 'holding', 1442.4524220017454, 9013, 240, '0 0 0 1 1x 0', 5, 4, 5, 13, 4, 3, 0, 1, 0, 1, 0, 10, 3, 0, 3, 0, 0],
  [1, 'algiz', 1069.2351857730505, 8471, 195, '0 0 4 1x 0', 3, 3, 4, 9, 4, 2, 0, 0, 0, 0, 0, 4, 2, 1, 0, 1, 2],
  [19, 'algiz', 1376.2656368455807, 8931, 170, '0 0 0 5 1x 5', 2, 2, 5, 8, 5, 2, 1, 0, 1, 0, 0, 1, 0, 1, 6, 1, 2],
  [36, 'algiz', 1003.9876047941267, 8389, 180, '0 0 1 4x 0', 3, 3, 3, 0, 4, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 2],
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
  // Part way round a loop that a wrong press botched, with a front collapse's pumps half given.
  Object.assign(used.g, { tuckHeld: 0.2, tuckPumps: 1, loop: -1, loopAngle: 2.5, loopRate: 3, loopNext: Math.PI, loopSince: 0.1, loopLate: true });
  Object.assign(used.g, { loopEarly: true, loopOut: true, loopBotched: true, loops: 4, loopTimed: 7, keys: 3 });
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
  // Sky 17 (12 until the brake's linger came down to 1.8 s; under SIM_VERSION 3 it was 32, which no
  // longer meets the Beast, and 7 when the wing first dived).
  const older = meetWorld();
  flyPilot(startRun(older, 17), createReferencePilot({ ...TST, collect: true }));
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

test('the air falling away surges the wing at any height in a run, and left uncaught it collapses there, above the ravens\' grace height or below it', () => {
  // The same fall of the air under a wing in air with no lift and no sink, as if it had just left a
  // core that lifted it 20 m/s, either side of the grace height, flown on hands up.
  for (const [y, folds] of [[CLOUD_RAVENS.grace + 30, true], [CLOUD_RAVENS.grace - 30, true]]) {
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
  }
  // Past the edge of the sky, where the wind turns the glider back in, nothing folds it.
  const world = startRun(createRunWorld({ sky: createCloudbaseRun({ hazards: false }) }), 8);
  Object.assign(world.g.pos, { x: CLOUD_ZONE.x + CLOUD_ZONE.r * 1.2, y: CLOUD_RAVENS.grace + 30, z: CLOUD_ZONE.z });
  stepRun(world, { turn: 0, brake: false, bar: false }, RUN.step);
  assert.equal(world.controls.folds, false);
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
