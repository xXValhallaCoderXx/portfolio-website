import test from 'node:test';
import assert from 'node:assert/strict';
import { RUN, TRACE, createRunWorld, finishRun, startRun, stepBits, stepRun } from './run-step.js';
import { TST, WORTH_RUNES, createReferencePilot, flyPilot } from './pilots.js';
import { CLOUD_GATE, CLOUD_ZONE, createCloudbaseRun } from './cloudbase-state.js';
import { GATEWAY, surfaceAt } from './terrain.js';
import { FLIGHT } from './flight.js';
import { MEET, createMeet } from './meet-state.js';
import { RUNE } from './meet-runes.js';
import { createBells } from './bells.js';

// What the reference pilot does on these skies, to the last bit: seed, options, then peak (m),
// strikes, stalls, seconds, seconds in cloud and how the run ended. First taken before its flying
// moved into run-step.js and pilots.js, to hold the move to the bit; re-captured for SIM_VERSION 2,
// on purpose, since its hunted cores peak at their middle and the pilot circles tighter in them
// (pilots.js); re-captured for SIM_VERSION 3, and every row came out as version 2's to the bit: the
// sky, the wing and the bare pilot fly as they did, and everything new is the meet's and the
// kettlebells'. Any change to how a run flies shows up here first.
const GOLDENS = [
  [1, {"brake": "none"}, 954.7750248206488, 1, 0, 137.98333333333528, 1.016666666666668, 'fog'],
  [2, {"brake": "none"}, 1119.8860489703784, 0, 0, 142.8666666666725, 8.333333333333327, 'fog'],
  [3, {"brake": "none"}, 1173.664463905874, 1, 0, 143.55000000000638, 4.016666666666658, 'fog'],
  [4, {"brake": "none"}, 1011.790963020544, 0, 0, 140.0333333333369, 8.31666666666666, 'fog'],
  [5, {"brake": "none"}, 836.6584401662902, 0, 0, 134.6499999999993, 28.433333333333, 'fog'],
  [6, {"brake": "none"}, 1294.3309777858697, 0, 0, 146.91666666667572, 1.4999999999999996, 'fog'],
  [7, {"brake": "none"}, 1212.6758340143692, 1, 0, 145.13333333334097, 5.733333333333318, 'fog'],
  [8, {"brake": "none"}, 1105.8320520429368, 1, 0, 141.23333333333787, 3.1166666666666605, 'fog'],
  [9, {"brake": "none"}, 1071.2837623848254, 2, 0, 139.7000000000033, 5.083333333333321, 'fog'],
  [10, {"brake": "none"}, 1277.0105798981194, 0, 0, 146.61666666667548, 4.383333333333323, 'fog'],
  [11, {"brake": "none"}, 1194.1444236272332, 2, 0, 144.7000000000073, 7.116666666666647, 'fog'],
  [12, {"brake": "none"}, 1109.828949131752, 0, 0, 142.48333333333886, 0, 'fog'],
  [1, {"brake": "eased"}, 1357.947489083276, 0, 0, 147.8500000000098, 23.349999999999955, 'fog'],
  [2, {"brake": "eased"}, 1937.8051570632454, 0, 0, 159.66666666668587, 2.0499999999999976, 'fog'],
  [3, {"brake": "eased"}, 1486.6848406055367, 2, 0, 149.6000000000112, 6.766666666666648, 'fog'],
  [4, {"brake": "eased"}, 1153.9111330830503, 3, 0, 143.71666666667318, 2.33333333333333, 'fog'],
  [5, {"brake": "eased"}, 835.754823102484, 0, 0, 134.84999999999945, 31.9333333333328, 'fog'],
  [6, {"brake": "eased"}, 1750.6401559351195, 1, 0, 156.3166666666832, 0, 'fog'],
  [7, {"brake": "eased"}, 1338.9905700394065, 3, 0, 147.86666666667648, 0, 'fog'],
  [8, {"brake": "eased"}, 1370.4420437330152, 1, 0, 147.3500000000094, 22.133333333333358, 'fog'],
  [9, {"brake": "eased"}, 1501.5376723250254, 0, 0, 151.48333333334602, 5.983333333333317, 'fog'],
  [10, {"brake": "eased"}, 1429.5073940986829, 3, 0, 148.75000000001052, 5.716666666666652, 'fog'],
  [11, {"brake": "eased"}, 1758.2625562273704, 1, 0, 156.066666666683, 11.883333333333503, 'fog'],
  [12, {"brake": "eased"}, 1259.757421368203, 1, 0, 146.15000000000845, 0, 'fog'],
  [1, {"brake": "late"}, 1030.1870397646355, 2, 0, 140.23333333333707, 12.56666666666687, 'fog'],
  [2, {"brake": "late"}, 1159.926492680537, 3, 0, 143.13333333333938, 6.966666666666647, 'fog'],
  [3, {"brake": "late"}, 1597.8399721303697, 1, 0, 153.4166666666809, 0, 'fog'],
  [4, {"brake": "late"}, 871.3366326490473, 3, 0, 135.28333333333313, 8.98333333333336, 'fog'],
  [5, {"brake": "late"}, 835.2395103572198, 2, 0, 134.66666666666598, 19.16666666666686, 'fog'],
  [6, {"brake": "late"}, 1526.7547870392154, 1, 0, 151.81666666667962, 5.2999999999999865, 'fog'],
  [7, {"brake": "late"}, 1122.3699434082077, 3, 0, 142.25000000000534, 12.866666666666886, 'fog'],
  [8, {"brake": "late"}, 1268.5947443079558, 1, 0, 146.45000000000869, 16.883333333333656, 'fog'],
  [9, {"brake": "late"}, 1216.5992900165456, 3, 0, 144.06666666667346, 1.0000000000000013, 'fog'],
  [10, {"brake": "late"}, 1300.4414305101068, 1, 0, 147.16666666667592, 20.166666666666803, 'fog'],
  [11, {"brake": "late"}, 1324.1285646071428, 3, 0, 146.91666666667572, 6.966666666666647, 'fog'],
  [12, {"brake": "late"}, 1216.6893489987856, 2, 0, 145.23333333334105, 11.100000000000131, 'fog'],
  [1, {"brake": "held"}, 930.2679193251835, 2, 4, 137.65000000000168, 0, 'fog'],
  [2, {"brake": "held"}, 879.900978199669, 4, 4, 135.3833333333332, 3.8333333333333246, 'fog'],
  [3, {"brake": "held"}, 1003.2957475457524, 2, 5, 139.8000000000034, 1.866666666666665, 'fog'],
  [4, {"brake": "held"}, 991.3290925033358, 1, 4, 139.18333333333624, 3.599999999999992, 'fog'],
  [5, {"brake": "held"}, 836.5690866932515, 0, 3, 134.66666666666598, 27.816666666666368, 'fog'],
  [6, {"brake": "held"}, 884.0515281900673, 1, 4, 136.35000000000065, 0, 'fog'],
  [7, {"brake": "held"}, 890.635304604717, 2, 3, 136.5500000000008, 5.916666666666651, 'fog'],
  [8, {"brake": "held"}, 846.4878523683851, 3, 4, 131.28333333332995, 0, 'fog'],
  [9, {"brake": "held"}, 1179.9850039692517, 0, 4, 144.25000000000693, 1.8833333333333315, 'fog'],
  [10, {"brake": "held"}, 1119.9652817609185, 2, 4, 142.66666666667234, 0, 'fog'],
  [11, {"brake": "held"}, 826.3512719884055, 4, 3, 134.41666666666578, 3.949999999999991, 'fog'],
  [12, {"brake": "held"}, 1188.4567730960262, 0, 4, 144.46666666667377, 6.866666666666648, 'fog'],
  [1, {"brake": "none", "withFlock": false}, 589.27792616958, 4, 0, 121.68333333332771, 3.183333333333327, 'fog'],
  [2, {"brake": "none", "withFlock": false}, 484.2786476682587, 4, 0, 113.09999999999486, 0, 'fog'],
  [3, {"brake": "none", "withFlock": false}, 1158.9082984351166, 2, 0, 141.91666666667174, 1.5833333333333326, 'fog'],
  [4, {"brake": "none", "withFlock": false}, 756.3576999538873, 2, 0, 132.11666666666395, 5.2999999999999865, 'fog'],
  [5, {"brake": "none", "withFlock": false}, 773.0991918632551, 3, 0, 130.71666666666283, 2.6499999999999955, 'fog'],
  [6, {"brake": "none", "withFlock": false}, 911.5709841624083, 2, 0, 134.94999999999953, 0, 'fog'],
  [1, {"brake": "none", "hazards": false}, 1195.0774268008515, 0, 0, 144.71666666667397, 0, 'fog'],
  [2, {"brake": "none", "hazards": false}, 1208.5019603176609, 0, 0, 145.0333333333409, 0, 'fog'],
  [3, {"brake": "none", "hazards": false}, 1237.168287310611, 0, 0, 145.71666666667477, 0, 'fog'],
  [4, {"brake": "none", "hazards": false}, 1058.1785187033117, 0, 0, 141.2833333333379, 0, 'fog'],
  [5, {"brake": "none", "hazards": false}, 1084.5629913922016, 0, 0, 141.68333333333823, 0, 'fog'],
  [6, {"brake": "none", "hazards": false}, 1280.9131189817397, 0, 0, 146.65000000000884, 0, 'fog'],
];

test('the one step flies the reference pilot exactly as recorded under this SIM_VERSION, to the last bit', () => {
  for (const [seed, options, peak, strikes, stalls, seconds, cloud, reason] of GOLDENS) {
    const { hazards = true, ...pilot } = options;
    const world = startRun(createRunWorld({ sky: createCloudbaseRun({ hazards }) }), seed);
    const flown = flyPilot(world, createReferencePilot(pilot));
    assert.deepEqual(flown, { peak, strikes, stalls, seconds, cloud, reason }, `seed ${seed} ${JSON.stringify(options)}`);
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
// (pilots.js, not the rules: the other rows stayed to the bit). Seed 14's collector holds Fehu as a
// strike sprays four plates, and all four go straight back on the bar (its reach takes in the ring
// they spray from); seeds 10, 15 and 20 lose bars to strikes under Tiwaz; a bell glances off Algiz
// on seeds 1 and 36 of the pilot taking it, and the Beast comes close on its seed 19.
const MEET_GOLDENS = [
  [1, 'TST', 1152.218730323731, 8506, 275, '0 0 4 0x 1', 5, 4, 4, 7, 4, 0, 0, 3, 1, 1, 0, 1, 0, 0, 3, 0, 0],
  [3, 'TST', 1278.8486516985072, 8787, 365, '0 0 0 1 4x 0', 4, 4, 5, 7, 4, 0, 1, 3, 2, 1, 0, 1, 0, 0, 3, 0, 0],
  [5, 'TST', 819.865337186954, 7978, 225, '0 0 4x 1', 2, 2, 4, 5, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [10, 'TST', 1500.638328836822, 9088, 370, '0 0 0 0 4x 4x 0', 5, 5, 4, 4, 4, 0, 0, 4, 1, 0, 0, 0, 0, 0, 3, 0, 0],
  [1, 'collector', 1042.159583275864, 8361, 215, '0 0 5 0x 1', 5, 5, 4, 7, 2, 0, 0, 2, 1, 0, 0, 1, 1, 0, 3, 0, 0],
  [3, 'collector', 1411.259947272213, 8976, 450, '0 1 1 0x 0x 0', 3, 3, 5, 12, 6, 0, 1, 5, 0, 0, 0, 1, 0, 0, 3, 0, 0],
  [5, 'collector', 1327.327374850414, 8866, 510, '0 1 4 1x 0x 0', 4, 4, 5, 12, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 3, 0, 0],
  [10, 'collector', 1509.8241905697012, 9094, 480, '0 0 1 0 4x 0x 0', 5, 4, 5, 9, 6, 0, 0, 6, 1, 0, 0, 0, 0, 0, 3, 1, 8],
  [14, 'collector', 898.1979759129669, 8153, 560, '0 0 1x 4', 1, 1, 5, 20, 2, 0, 0, 2, 5, 0, 0, 4, 4, 0, 0, 1, 1],
  [15, 'collector', 857.0606958674464, 8131, 110, '0 0 1 5', 2, 2, 4, 7, 2, 0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 1, 8],
  [20, 'collector', 1167.9618627290333, 8627, 290, '0 1 0 1x 1', 3, 2, 5, 5, 3, 0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 1, 8],
  [2, 'gates', 1144.0286468139996, 8608, 290, '0 0 1 4x 0', 2, 1, 5, 6, 4, 0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 1, 8],
  [12, 'gates', 779.0341527624436, 7975, 460, '0 0 1x 0', 1, 0, 4, 11, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1, 1],
  [20, 'gates', 1254.785966637613, 8763, 405, '0 1 0 0 0x 4', 3, 2, 5, 10, 3, 0, 0, 3, 0, 0, 0, 0, 0, 0, 3, 2, 9],
  [1, 'holding', 1024.9181718515536, 8409, 205, '0 0 5 1x 0', 3, 3, 4, 9, 3, 3, 0, 0, 0, 1, 0, 4, 1, 0, 0, 0, 0],
  [3, 'holding', 1055.748106358312, 8467, 215, '0 0 0 1x 1', 2, 2, 5, 12, 3, 3, 0, 0, 0, 0, 0, 5, 1, 0, 0, 0, 0],
  [5, 'holding', 835.7077318719834, 8091, 125, '0 0 5x 4', 4, 4, 4, 6, 2, 1, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0],
  [10, 'holding', 1306.3303083794092, 8820, 150, '0 0 0 0 5x 1', 4, 4, 4, 8, 5, 5, 0, 0, 0, 0, 0, 6, 2, 0, 1, 0, 0],
  [1, 'algiz', 919.9239483332752, 8232, 180, '0 0 4 1', 1, 1, 4, 10, 3, 2, 0, 0, 1, 0, 0, 2, 1, 1, 0, 1, 2],
  [19, 'algiz', 1351.1524856025273, 8814, 260, '0 0 0 1 0x 1', 2, 2, 5, 4, 4, 2, 2, 0, 0, 0, 0, 2, 1, 0, 2, 0, 0],
  [36, 'algiz', 1373.918966955416, 8917, 245, '0 0 0 0x 0x 4', 3, 3, 4, 0, 3, 0, 1, 1, 0, 0, 0, 0, 0, 1, 3, 2, 2],
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
  // A world that has already flown, stalled and been struck starts the same run from scratch.
  const used = createRunWorld({ sky: createCloudbaseRun() });
  fly(startRun(used, 3));
  used.g.yawRate = 0.7;
  used.g.brake = 0.9;
  used.g.stallLoad = 0.8;
  used.hook = -1;
  used.stalls = 9;
  fly(startRun(used, 77));
  assert.deepEqual(used.sky.state, fresh.sky.state);
  assert.deepEqual({ ...used.g, pos: { ...used.g.pos } }, { ...fresh.g, pos: { ...fresh.g.pos } });
  assert.deepEqual([used.hook, used.stalls, used.steps], [fresh.hook, fresh.stalls, fresh.steps]);
  // With the meet and the kettlebells, a world that has flown a whole run, taken a gate, sprayed
  // its plates and met the Beast starts the next exactly as a new one: everything the meet keeps
  // (the plates off the trail, the gates and the blessing among it) and the kettlebells keep.
  const meetWorld = () => createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells() });
  const newer = startRun(meetWorld(), 21);
  flyPilot(newer, createReferencePilot({ ...TST, collect: true }), { limit: 140 });
  const older = meetWorld();
  flyPilot(startRun(older, 32), createReferencePilot({ ...TST, collect: true }));
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
  // While folded, a hard right asked of it still hooks left, and the brake does not reach it.
  for (let i = 0; i < 60; i++) stepRun(world, { turn: 1, brake: true, bar: false }, RUN.step);
  assert.ok(world.g.yawRate < 0);
  assert.equal(world.controls.locked, true);
  assert.equal(world.g.brake, 0);
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

// What each of the sixteen ways of holding the four controls asks of the wing: bits (1 left,
// 2 right, 4 brake, 8 the speed bar), then the turn, the brake and the bar they stand for.
const ASKS = [
  [0b0000, 0, false, false], [0b0001, -1, false, false], [0b0010, 1, false, false], [0b0011, 0, false, true],
  [0b0100, 0, true, false], [0b0101, -1, true, false], [0b0110, 1, true, false], [0b0111, 0, true, true],
  [0b1000, 0, false, true], [0b1001, -1, false, true], [0b1010, 1, false, true], [0b1011, 0, false, true],
  [0b1100, 0, true, true], [0b1101, -1, true, true], [0b1110, 1, true, true], [0b1111, 0, true, true],
];

test('the four controls fly exactly what they stand for, and left and right held together push the speed bar, straight', () => {
  for (const [bits, turn, brake, bar] of ASKS) {
    // Held for ten seconds from the gate, beside a twin asked the same in so many words.
    const held = startRun(createRunWorld({ sky: createCloudbaseRun() }), 3);
    const twin = startRun(createRunWorld({ sky: createCloudbaseRun() }), 3);
    const asked = { turn, brake, bar };
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
