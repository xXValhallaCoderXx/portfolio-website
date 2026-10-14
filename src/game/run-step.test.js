import test from 'node:test';
import assert from 'node:assert/strict';
import { RUN, TRACE, createRunWorld, finishRun, startRun, stepBits, stepRun } from './run-step.js';
import { TST, createReferencePilot, flyPilot } from './pilots.js';
import { CLOUD_GATE, CLOUD_ZONE, createCloudbaseRun } from './cloudbase-state.js';
import { GATEWAY, surfaceAt } from './terrain.js';
import { FLIGHT } from './flight.js';
import { MEET, createMeet } from './meet-state.js';
import { createBells } from './bells.js';

// What the reference pilot did on these skies before its flying moved into run-step.js and
// pilots.js, to the last bit: seed, options, then peak (m), strikes, stalls, seconds, seconds in
// cloud and how the run ended. Any change to how a run flies shows up here first.
const GOLDENS = [
  [1, {"brake": "none"}, 996.2989765025334, 2, 0, 139.23333333333628, 5.916666666666651, 'fog'],
  [2, {"brake": "none"}, 1305.9580025568073, 1, 0, 146.9333333333424, 11.700000000000161, 'fog'],
  [3, {"brake": "none"}, 1169.7512665002475, 2, 0, 143.71666666667318, 3.2499999999999933, 'fog'],
  [4, {"brake": "none"}, 1086.5458425559648, 3, 0, 139.98333333333687, 6.733333333333315, 'fog'],
  [5, {"brake": "none"}, 1423.875355734372, 0, 0, 149.86666666667807, 8.666666666666677, 'fog'],
  [6, {"brake": "none"}, 1552.2927974936028, 0, 0, 152.51666666668018, 1.2500000000000004, 'fog'],
  [7, {"brake": "none"}, 1511.9621274293086, 0, 0, 151.43333333334598, 0, 'fog'],
  [8, {"brake": "none"}, 1250.5259126771448, 0, 0, 145.8500000000082, 8.950000000000024, 'fog'],
  [9, {"brake": "none"}, 1611.3577074570273, 0, 0, 153.68333333334778, 0, 'fog'],
  [10, {"brake": "none"}, 1765.4116513118822, 0, 0, 156.60000000001676, 0, 'fog'],
  [11, {"brake": "none"}, 1520.4012655713802, 1, 0, 151.86666666667966, 4.583333333333322, 'fog'],
  [12, {"brake": "none"}, 1124.0967403234783, 1, 0, 142.65000000000566, 5.166666666666654, 'fog'],
  [1, {"brake": "eased"}, 1018.9172722853599, 2, 0, 140.00000000000355, 15.716666666667027, 'fog'],
  [2, {"brake": "eased"}, 1714.3057379958937, 2, 0, 155.61666666668265, 0, 'fog'],
  [3, {"brake": "eased"}, 1579.8441259232372, 2, 0, 153.06666666668062, 5.7666666666666515, 'fog'],
  [4, {"brake": "eased"}, 882.8100421042086, 1, 0, 136.1333333333338, 25.63333333333316, 'fog'],
  [5, {"brake": "eased"}, 1600.7815461176488, 1, 0, 152.6666666666803, 0, 'fog'],
  [6, {"brake": "eased"}, 918.4900001330244, 5, 0, 137.3833333333348, 0, 'fog'],
  [7, {"brake": "eased"}, 1299.4822585415643, 4, 0, 145.5333333333413, 4.883333333333321, 'fog'],
  [8, {"brake": "eased"}, 1282.148072656388, 2, 0, 145.6833333333414, 17.950000000000262, 'fog'],
  [9, {"brake": "eased"}, 1366.003747672035, 3, 0, 146.5166666666754, 7.599999999999978, 'fog'],
  [10, {"brake": "eased"}, 1444.0531253021209, 3, 0, 150.30000000001175, 9.05000000000003, 'fog'],
  [11, {"brake": "eased"}, 1583.480935527558, 3, 0, 152.46666666668014, 2.9833333333333276, 'fog'],
  [12, {"brake": "eased"}, 1156.0120794234242, 2, 0, 143.76666666667322, 8.71666666666668, 'fog'],
  [1, {"brake": "late"}, 1475.0303702746673, 1, 0, 150.95000000001227, 2.6999999999999953, 'fog'],
  [2, {"brake": "late"}, 1275.0047141207133, 1, 0, 146.21666666667517, 12.5000000000002, 'fog'],
  [3, {"brake": "late"}, 1283.5238560049304, 2, 0, 146.78333333334228, 8.299999999999992, 'fog'],
  [4, {"brake": "late"}, 1357.4712306016172, 2, 0, 147.83333333334312, 10.816666666666784, 'fog'],
  [5, {"brake": "late"}, 1446.462377307394, 1, 0, 150.3500000000118, 0, 'fog'],
  [6, {"brake": "late"}, 1528.3352481652212, 1, 0, 152.03333333334646, 1.8499999999999983, 'fog'],
  [7, {"brake": "late"}, 1000.9748377495918, 2, 0, 139.73333333333667, 13.733333333333595, 'fog'],
  [8, {"brake": "late"}, 1245.9631249499482, 2, 0, 144.65000000000725, 16.583333333333673, 'fog'],
  [9, {"brake": "late"}, 1452.3122399084311, 2, 0, 150.46666666667855, 0, 'fog'],
  [10, {"brake": "late"}, 1159.9740393192171, 3, 0, 143.71666666667318, 11.150000000000134, 'fog'],
  [11, {"brake": "late"}, 1300.0095398038673, 2, 0, 147.16666666667592, 7.14999999999998, 'fog'],
  [12, {"brake": "late"}, 1134.4467944857422, 1, 0, 143.18333333333942, 18.183333333333582, 'fog'],
  [1, {"brake": "held"}, 983.5552861387732, 1, 4, 139.00000000000276, 10.433333333333431, 'fog'],
  [2, {"brake": "held"}, 939.4967333518237, 2, 3, 137.83333333333516, 5.6833333333333185, 'fog'],
  [3, {"brake": "held"}, 1164.9808606936697, 2, 4, 143.98333333334006, 1.4, 'fog'],
  [4, {"brake": "held"}, 876.6186230994585, 1, 3, 135.86666666666693, 12.516666666666868, 'fog'],
  [5, {"brake": "held"}, 838.3195595527299, 2, 3, 131.3166666666633, 15.600000000000355, 'fog'],
  [6, {"brake": "held"}, 1225.4066874229402, 0, 5, 145.33333333334113, 6.416666666666649, 'fog'],
  [7, {"brake": "held"}, 1022.352113061101, 1, 4, 140.31666666667047, 15.983333333333707, 'fog'],
  [8, {"brake": "held"}, 1080.805013457979, 2, 3, 140.2166666666704, 1.2833333333333337, 'fog'],
  [9, {"brake": "held"}, 1287.0250342451372, 1, 4, 146.2833333333419, 4.149999999999991, 'fog'],
  [10, {"brake": "held"}, 1078.107556514802, 4, 3, 141.80000000000499, 0, 'fog'],
  [11, {"brake": "held"}, 1023.5645865513303, 3, 3, 140.35000000000383, 4.149999999999991, 'fog'],
  [12, {"brake": "held"}, 921.0261379061529, 1, 4, 137.31666666666808, 2.166666666666664, 'fog'],
  [1, {"brake": "none", "withFlock": false}, 1194.1635020497963, 1, 0, 142.80000000000578, 14.316666666666958, 'fog'],
  [2, {"brake": "none", "withFlock": false}, 1118.3372666052683, 3, 0, 142.83333333333914, 1.5333333333333328, 'fog'],
  [3, {"brake": "none", "withFlock": false}, 1221.283097539665, 2, 0, 143.96666666667338, 5.2166666666666535, 'fog'],
  [4, {"brake": "none", "withFlock": false}, 1073.1129345030931, 3, 0, 141.66666666667155, 0, 'fog'],
  [5, {"brake": "none", "withFlock": false}, 697.2445412486134, 4, 0, 127.34999999999405, 0, 'fog'],
  [6, {"brake": "none", "withFlock": false}, 1048.4935514688452, 2, 0, 141.01666666667103, 0, 'fog'],
  [1, {"brake": "none", "hazards": false}, 1528.2147533718248, 0, 0, 152.03333333334646, 0, 'fog'],
  [2, {"brake": "none", "hazards": false}, 1596.240448103384, 0, 0, 153.38333333334754, 0, 'fog'],
  [3, {"brake": "none", "hazards": false}, 1718.3153695303497, 0, 0, 155.71666666668273, 0, 'fog'],
  [4, {"brake": "none", "hazards": false}, 1530.4863795879419, 0, 0, 152.06666666667982, 0, 'fog'],
  [5, {"brake": "none", "hazards": false}, 1510.3106229482482, 0, 0, 151.6666666666795, 0, 'fog'],
  [6, {"brake": "none", "hazards": false}, 1509.8601202352431, 0, 0, 151.51666666667938, 0, 'fog'],
];

test('the one step flies the reference pilot exactly as it flew before it was shared, to the last bit', () => {
  for (const [seed, options, peak, strikes, stalls, seconds, cloud, reason] of GOLDENS) {
    const { hazards = true, ...pilot } = options;
    const world = startRun(createRunWorld({ sky: createCloudbaseRun({ hazards }) }), seed);
    const flown = flyPilot(world, createReferencePilot(pilot));
    assert.deepEqual(flown, { peak, strikes, stalls, seconds, cloud, reason }, `seed ${seed} ${JSON.stringify(options)}`);
  }
});

// The same with the meet and Hrungnir's kettlebells in the run, which the goldens above leave out:
// what TST (pilots.js), the collector (TST following the plates) and a pilot holding its line with
// the light brake eased (whom most kettlebells hit) came to on these skies. Seed and pilot, then
// the peak (m, to the last bit), fixed steps flown, the TOTAL (kg), each lift's red lights in
// order (1 contact, 2 control and 4 airspace, added up; `x` judged under the horn, at ×2; the
// fog's lift last), reps, trails and plates loaded, and the kettlebells thrown, hit, close and
// dodged. Every link already shared replays through these rules, so none of it may change
// without a new SIM_VERSION.
const MEET_GOLDENS = [
  [1, 'TST', 1060.5814785518598, 8395, 165, '0 0 5 0x 1', 3, 4, 3, 3, 0, 2, 1],
  [3, 'TST', 1276.935201631682, 8796, 162.5, '0 0 0 0 5x 4', 4, 5, 5, 3, 0, 0, 3],
  [5, 'TST', 1515.976467501136, 9107, 357.5, '0 0 0 0 1x 0x 0', 4, 5, 6, 6, 0, 1, 5],
  [10, 'TST', 1184.2510233398732, 8661, 125, '0 1 0 0 5', 3, 5, 4, 3, 0, 0, 3],
  [1, 'collector', 948.2051597291712, 8295, 235, '0 1 5 1', 2, 4, 14, 3, 0, 0, 3],
  [3, 'collector', 1689.2909743535454, 9311, 630, '0 0 0 1 0x 0x 0', 5, 6, 16, 6, 0, 2, 4],
  [5, 'collector', 1559.5930908956768, 9069, 407.5, '0 0 1 0 0 0x 1', 5, 5, 14, 5, 0, 1, 4],
  [10, 'collector', 1516.9381877557373, 9108, 302.5, '0 0 1 0 0 5x 0', 4, 5, 10, 4, 0, 0, 4],
  [1, 'holding', 1018.4023139687791, 8325, 140, '0 0 5 1x 1', 4, 4, 2, 3, 3, 0, 0],
  [3, 'holding', 1320.2137767916802, 8843, 280, '0 0 0 1x 4x 0', 3, 5, 3, 5, 3, 1, 1],
  [5, 'holding', 957.2435093787765, 8146, 132.5, '0 0 1 5', 2, 4, 7, 3, 2, 0, 1],
  [10, 'holding', 1143.4820189222767, 8602, 135, '0 1 1 0 5', 3, 5, 4, 5, 3, 2, 0],
];
const MEET_PILOTS = { TST, collector: { ...TST, collect: true }, holding: { brake: 'eased' } };

test('with the meet and the kettlebells, each sky comes out as it always has: the same flight to the last bit, the same lights, plates and kettlebells', () => {
  for (const [seed, pilot, peak, steps, total, lights, reps, trails, plates, thrown, hits, close, dodged] of MEET_GOLDENS) {
    const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells() }), seed);
    const flown = flyPilot(world, createReferencePilot(MEET_PILOTS[pilot]));
    const { state } = world.meet;
    const bells = world.bells.state;
    const shown = state.lifts.slice(0, state.count).map(({ red, double }) => `${red}${double ? 'x' : ''}`).join(' ');
    assert.deepEqual(
      [flown.reason, flown.peak, world.steps, state.total, shown, state.reps, state.trails, state.plates, bells.thrown, bells.hits, bells.close, bells.dodged],
      ['fog', peak, steps, total, lights, reps, trails, plates, thrown, hits, close, dodged],
      `seed ${seed}, ${pilot}`,
    );
    // The meet paid for every close call the kettlebells counted.
    assert.equal(state.close, bells.close);
  }
});

test('the same sky and the same asks give the same run, whatever wing and world flew before', () => {
  const fly = (world) => {
    const intent = { turn: 0, brake: false, bar: false };
    for (let i = 0; i < 40 * 60; i++) {
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
