import test from 'node:test';
import assert from 'node:assert/strict';
import { MEET, MEET_POOL, PLATE_KIND, SCATTER, TRAIL, createMeet } from './meet-state.ts';
import { RUNE } from './meet-runes.ts';
import { createStyle } from './meet-style.ts';
import { createBells } from './bells.ts';
import { TST, createReferenceKeys } from './pilots.ts';
import { RUN, createRunWorld, finishRun, startRun, stepBits } from './run-step.ts';
import { createCloudbaseRun } from './cloudbase-state.ts';
import { createRecorder, decodeLog, encodeLog } from './recorder.ts';
import { replayLog } from './replay.ts';
import { summariseRun } from './meet-sheet.ts';
import { SIM_VERSION } from './sim-version.ts';

const STEP = RUN.step, TAU = Math.PI * 2;
function standing() {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun({ hazards: false, wind: false }), meet: createMeet() }), 1);
  Object.assign(world.g.pos, { x: 0, y: 400, z: 80 });
  for (const thermal of world.sky.state.thermals) Object.assign(thermal, { live: false, strength: 0, move: 0 });
  const state = world.meet!.state, sky = world.sky.state;
  return { world, state, sky, pilot: sky.pilot, meet: world.meet! };
}
function core(run: ReturnType<typeof standing>, slot = 1, x = 80, z = 80) {
  Object.assign(run.sky.thermals[slot], { x, z, r: 60, dir: 1, live: true, strength: 1, move: 0, generation: 1 });
  run.pilot.thermal = slot;
  return run.sky.thermals[slot];
}
function tick(run: ReturnType<typeof standing>, seconds = STEP) {
  run.sky.elapsed += seconds;
  run.meet!.step(seconds, run.world);
}
function trailRun() {
  const run = standing();
  const source = core(run);
  Object.assign(run.world.g.pos, { x: source.x, y: 400, z: source.z });
  core(run, 2, -80, 80);
  run.pilot.thermal = 1;
  tick(run);
  source.strength = 0.2;
  tick(run);
  assert.equal(run.state.trails, 1);
  return run;
}

test('lines bank every150 metres with independent contact, control and airspace judges', () => {
  for (const red of [0, 1, 2, 4, 3, 5, 6, 7]) {
    const run = standing();
    run.state.bar = 15;
    run.pilot.strikes = red & 1 ? 1 : 0;
    run.world.stalls = red & 2 ? 1 : 0;
    run.pilot.cloudTime = red & 4 ? MEET.cloud + STEP : 0;
    run.sky.peak = MEET.every;
    tick(run);
    const lift = run.state.lifts[0], good = (red & (red - 1)) === 0;
    assert.deepEqual([lift.line, lift.kg, lift.red, lift.good, run.state.total], [150, 40, red, good, good ? 40 : 0]);
    run.sky.peak = 2 * MEET.every;
    tick(run);
    assert.equal(run.state.lifts[1].red, 0, 'counters restart at each line');
  }
});

test('the horn begins at300 seconds and only subsequent height lines double', () => {
  const run = standing();
  run.sky.elapsed = MEET.horn - STEP;
  run.sky.peak = MEET.every;
  run.meet!.step(STEP, run.world);
  assert.equal(run.state.horn, false);
  run.sky.elapsed = MEET.horn;
  run.meet!.step(STEP, run.world);
  assert.equal(run.state.horn, true);
  run.sky.peak = 2 * MEET.every;
  tick(run);
  assert.equal(run.state.lifts[0].double, false);
  assert.equal(run.state.lifts[1].double, true);
  assert.equal(run.state.total, 75);
});

test('time, fog and landing judge carried weight once while a quit forfeits it', () => {
  for (const reason of ['time', 'fog', 'landed', 'quit']) {
    const run = standing();
    run.state.bar = 15;
    run.state.horn = true;
    run.meet!.finish(reason, run.world);
    assert.equal(run.state.total, reason === 'quit' ? 0 : 40);
    assert.equal(run.state.ended, reason);
    const kept = structuredClone(run.state);
    run.meet!.finish('fog', run.world);
    tick(run);
    assert.deepEqual(run.state, kept);
  }
});

test('core-relative circles remain centered while the thermal drifts; rebirth resets the ride', () => {
  const run = standing(), thermal = core(run);
  run.world.g.yawRate = TAU / 2;
  for (let i = 0; i <= 120; i++) {
    thermal.x += 0.05; thermal.z += 0.02;
    run.world.g.pos.x = thermal.x + 8 * Math.cos(i * TAU / 120);
    run.world.g.pos.z = thermal.z + 8 * Math.sin(i * TAU / 120);
    tick(run);
  }
  assert.deepEqual([run.state.ride.n, run.state.reps, run.state.deep, run.state.bar], [1, 1, 1, MEET.deep]);
  thermal.generation++;
  tick(run);
  assert.equal(run.state.ride.n, 2);
  assert.ok(run.state.turned < 0.1);
});

test('counterrotation and a fold or stall never earn thermal reps', () => {
  for (const kind of ['opposite', 'stall', 'tuck', 'collapse', 'launch']) {
    const run = standing();
    const thermal = core(run, kind === 'launch' ? 0 : 1);
    for (let i = 0; i < 600; i++) {
      run.world.g.yawRate = kind === 'opposite' ? -1 : 1;
      if (kind === 'stall' || kind === 'tuck') run.world.g[kind] = 1;
      if (kind === 'collapse') run.pilot.collapse = 1;
      Object.assign(run.world.g.pos, { x: thermal.x + 15 * Math.cos(i * STEP), z: thermal.z + 15 * Math.sin(i * STEP) });
      tick(run);
    }
    assert.equal(run.state.reps, 0, kind);
  }
});

test('normal reps score2.5kg and a circle centered inside7 metres scores5kg', () => {
  for (const offset of [0, MEET.depth + 1]) {
    const run = standing(), thermal = core(run);
    run.world.g.yawRate = TAU / 2;
    for (let i = 0; i <= 120; i++) {
      run.world.g.pos.x = thermal.x + offset + 12 * Math.cos(i * TAU / 120);
      run.world.g.pos.z = thermal.z + 12 * Math.sin(i * TAU / 120);
      tick(run);
    }
    assert.equal(run.state.reps, 1);
    assert.equal(run.state.bar, offset === 0 ? MEET.deep : MEET.rep);
  }
});

test('a dying core lays one trail toward a settled lift, with bounded plates on a descent', () => {
  const run = trailRun(), trail = run.state.trail;
  const plates = trail.plates.filter((plate) => plate.live);
  assert.equal(trail.target, 2);
  assert.equal(plates.length, 6);
  assert.deepEqual(plates.map((plate) => plate.kg), [...TRAIL.kg6]);
  assert.ok(Math.abs(Math.hypot(plates[0].x - trail.x, plates[0].z - trail.z) - TRAIL.from) < 1e-9);
  for (let i = 1; i < plates.length; i++) assert.ok(plates[i].y < plates[i - 1].y);
  tick(run);
  assert.equal(run.state.trails, 1);
});

test('a trail follows altitude until boarded and loading a plate happens once within six metres', () => {
  const run = trailRun(), trail = run.state.trail;
  run.world.g.pos.y += 20;
  tick(run);
  assert.equal(trail.plates[0].y, run.world.g.pos.y - TRAIL.below);
  const plate = trail.plates[0];
  trail.boarded = run.sky.elapsed;
  Object.assign(run.world.g.pos, { x: plate.x, y: plate.y + TRAIL.reach + 0.01, z: plate.z });
  tick(run);
  assert.equal(plate.live, true);
  run.world.g.pos.y = plate.y + TRAIL.reach - 0.01;
  // Boarding freezes the plate altitude before the range test.
  trail.boarded = run.sky.elapsed;
  tick(run);
  assert.equal(plate.live, false);
  const bank = run.state.bar;
  const heights = trail.plates.map((p) => p.y);
  run.world.g.pos.y += 15;
  tick(run);
  assert.equal(run.state.bar, bank);
  assert.deepEqual(trail.plates.map((p) => p.y), heights);
  tick(run, TRAIL.keep + 1);
  assert.equal(trail.live, false);
});

test('a strike sprays recoverable plates; Tiwaz loses the carried bar outright', () => {
  for (const tiwaz of [false, true]) {
    const run = standing();
    run.sky.peak = MEET.iron;
    run.state.next = 10_000;
    run.state.bar = 100;
    run.state.runes.raised = 2;
    run.state.runes.blessing.rune = tiwaz ? RUNE.tiwaz : RUNE.none;
    run.pilot.strikes = 1;
    run.pilot.collapse = 2;
    tick(run);
    assert.equal(run.state.bar, 0);
    if (tiwaz) {
      assert.equal(run.state.lost, 100);
      assert.equal(run.state.spray.held, false);
    } else {
      const held = run.state.loose.filter((plate) => plate.held);
      assert.ok(held.length > 0 && held.length <= SCATTER.most);
      assert.equal(held.reduce((kg, plate) => kg + plate.kg, 0) + run.state.lost, 100);
      run.pilot.collapse = 0;
      tick(run);
      const plate = run.state.loose.find((plate) => plate.live && plate.kind === PLATE_KIND.scatter);
      assert.ok(plate);
      Object.assign(run.world.g.pos, { x: plate.x, y: plate.y, z: plate.z });
      tick(run);
      assert.ok(run.state.recovered > 0 && run.state.bar > 0);
    }
  }
});

test('judgment buffers keep late lines and the meet reuses its pools across resets', () => {
  const run = standing(), lifts = run.state.lifts;
  run.sky.peak = 70 * MEET.every;
  tick(run);
  run.meet!.finish('time', run.world);
  assert.equal(run.state.count, 71);
  assert.equal(run.state.lifts[69].line, 70 * MEET.every);
  assert.equal(run.state.lifts[70].line, 0);
  assert.equal(lifts.length, MEET_POOL.lifts);
  run.meet!.reset();
  assert.equal(run.state.lifts, lifts);
  assert.deepEqual(run.state, createMeet().state);
});

test('recorded digital soaring retains acro time through the deadline and replays exactly', () => {
  const durations = [];
  for (let seed = 1; seed <= 24; seed++) {
    const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells(), style: createStyle() }), seed);
    const keys = createReferenceKeys(TST), recorder = createRecorder();
    let reason = null;
    while (!reason) {
      const bits = keys(world);
      assert.equal(recorder.push(bits), true);
      reason = stepBits(world, bits);
    }
    finishRun(world, reason);
    const sheet = summariseRun(world, reason);
    durations.push(sheet.seconds);
    const text = encodeLog({ simVersion: SIM_VERSION, seed, total: sheet.total, peak: sheet.peak }, recorder.bits, recorder.steps);
    const read = decodeLog(text);
    assert.equal(read.ok, true);
    const replay = replayLog(read.log);
    assert.deepEqual(replay, sheet);
  }
  assert.ok(durations.filter((seconds) => Math.abs(seconds - RUN.seconds) < RUN.step).length >= 20, JSON.stringify(durations));
});
