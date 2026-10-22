import type { RunWorld } from './models.ts';
import type { FlightInput } from '../flight/models.ts';
import type { CoachMessage } from '../coaching/models.ts';
import type { SwingGauge } from '../../features/flight/presentation/swing-gauge.ts';
import type receiptFixture from '../../test/fixtures/good-lift-chromium.json';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRunWorld, startRun, stepBits, stepRun, finishRun, RUN } from './run-step.ts';
import { createCloudbaseRun } from './cloudbase-state.ts';
import { createMeet } from './meet-state.ts';
import { createBells } from './bells.ts';
import { createStyle } from './meet-style.ts';
import { summariseRun } from './meet-sheet.ts';
import { decodeLog } from './recorder.ts';
import { SIM_VERSION } from './sim-version.ts';
import { surfaceAt } from '../flight/ground.ts';
import { createRunCoachEnvironment, runCoachHazard } from '../../features/good-lift/services/coach-run.service.ts';
import { createLiftGuide } from '../coaching/lift-guide.ts';
import { createFlightCoach } from '../coaching/flight-coach.ts';
import { interruptsLift } from '../coaching/coach-routing.ts';
import { swingGauge } from '../../features/flight/presentation/swing-gauge.ts';
import { createFlight, stepFlight } from '../flight/flight.ts';
import { createSwingWatch } from '../coaching/swing-watch.ts';
import { FJORD_THERMALS, sampleFjordAir } from '../flight/atmosphere.ts';
import { WORLD } from '../../adapters/rendering/terrain.ts';
import type { Vector3 } from '../flight/models.ts';

const receipt = JSON.parse(readFileSync(new URL('../../test/fixtures/good-lift-chromium.json', import.meta.url), 'utf8')) as typeof receiptFixture;
const fresh = (seed: number): RunWorld => startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(),
  bells: createBells(), style: createStyle() }), seed);
const authority = (world: RunWorld) => ({ g: world.g, sky: world.sky.state, meet: world.meet!.state,
  bells: world.bells!.state, watch: world.watch.state, style: world.style!.state,
  controls: world.controls, air: world.air, forces: world.forces, intent: world.intent, pump: world.pump,
  hook: world.hook, struck: world.struck, stalls: world.stalls, tucks: world.tucks,
  steps: world.steps, ended: world.ended, trace: world.trace });
const released = () => ({ left: false, right: false, brake: false, deepBrake: false, bar: false, ears: false });
const heldControls = (message: CoachMessage | null): ReturnType<typeof released> => ({ ...Object.fromEntries(Object.keys(released()).map(key => [key, message?.hold.includes(key as import('../coaching/models.ts').ControlName) ?? false])) as ReturnType<typeof released>,
  deepBrake: !!message?.hold.includes('brake') && message.brakeDepth === 'deep' });
const physicalControls = (input: FlightInput): FlightInput => ({ turn: Number(input.right) - Number(input.left),
  brake: input.brake, deepBrake: input.deepBrake, bar: input.bar, ears: input.ears });

test('browser inputs replay identically with real coaching, live-air searches and varied render reads', () => {
  assert.equal(SIM_VERSION, 5, 'spiral combos and additive acro scoring have their own replay rules version');
  assert.match(receipt.engine, /^Chromium /);
  for (const seed of [1, 2]) {
    const record = receipt.records.find((run) => run.seed === seed && run.scenario === 'soaring');
    assert.equal(record!.simVersion, SIM_VERSION);
    const read = decodeLog(record!.link);
    assert.ok(read.ok, read.why!);
    assert.ok(read.log.bits.length >= 3600, 'the source is an existing complete browser recording');
    const baseline = fresh(seed), observed = fresh(seed);
    const guide = createLiftGuide(createRunCoachEnvironment(observed.sky)), coach = createFlightCoach();
    const input = { left: false, right: false, brake: false, deepBrake: false, bar: false, ears: false };
    const gauge: Partial<SwingGauge> = {}, hands: {brake?: boolean; fold?: number; held?: number; pumps?: number} = {}, reads: Record<number, number> = { 30: 0, 144: 0 };
    let shown = 0;
    for (let tick = 0; tick < 3600; tick++) {
      const bits: number = read.log.bits[tick], ears = (bits & 12) === 12;
      Object.assign(input, { left: !!(bits & 1), right: !!(bits & 2),
        ears, deepBrake: !ears && !!(bits & 16), brake: !ears && !!(bits & 20), bar: !ears && !!(bits & 8) });
      assert.equal(stepBits(baseline, bits), null);
      assert.equal(stepBits(observed, bits), null);
      const { g, watch, style, sky, pump } = observed;
      Object.assign(hands, { brake: input.brake, fold: sky.state.pilot.collapse, held: pump.held, pumps: pump.n });
      swingGauge(g, watch.state, true, RUN.step, gauge, hands);
      const lift = guide.step(RUN.step, { g, air: observed.air, input, clock: sky.state.elapsed });
      const message = coach.step(RUN.step, { g, watch: watch.state, style: style!.state, gauge, input,
        air: observed.air, lift, collapse: hands.fold, hazard: runCoachHazard(observed),
        clearance: g.pos.y - surfaceAt(g.pos.x, g.pos.z), fogClearance: g.pos.y - sky.state.fogHeight,
        eligible: !observed.controls.steered });
      shown += message ? 1 : 0;
      // Render clocks only read stable results. Repeated held/paused reads cannot advance them.
      for (const hz of [30, 144]) {
        const count = Math.floor((tick + 1) * hz / 60) - Math.floor(tick * hz / 60);
        for (let n = 0; n < count; n++) {
          assert.equal(coach.message, message); assert.equal(guide.message, lift); reads[hz]++;
        }
      }
      if (tick % 600 === 0) for (let n = 0; n < 20; n++) {
        assert.equal(coach.message, message); assert.equal(guide.message, lift);
      }
      assert.deepEqual(authority(observed), authority(baseline), `seed${seed}, fixed step${tick}: observation changes no authoritative value`);
    }
    assert.ok(shown > 1000, 'real guidance was exercised throughout the observed run');
    assert.deepEqual(reads, { 30: 1800, 144: 8640 });
    finishRun(baseline, 'quit'); finishRun(observed, 'quit');
    assert.deepEqual(authority(observed), authority(baseline));
    assert.deepEqual(summariseRun(observed, 'quit'), summariseRun(baseline, 'quit'), 'every resulting sheet field and barogram sample is identical');
  }
});

for (const seed of [1, 2]) test(`actual sky${seed} manual thermal entry hands off to visible coaching with0.2s reactions`, () => {
  const world = fresh(seed), { g, watch, style, sky } = world;
  const guide = createLiftGuide(createRunCoachEnvironment(sky)), coach = createFlightCoach(), gauge: Partial<SwingGauge> = {};
  const manual = () => ({ ...released(), right: true, brake: true });
  const pending = Array.from({ length: 12 }, manual);
  let clearance = Infinity, stallFrames = 0, climbingFrames = 0, maxBank = 0, shown = 0, firstShown = -1, firstThermal = -1;
  for (let tick = 0; tick < 1080; tick++) {
    const input = pending.shift();
    assert.equal(stepRun(world, physicalControls(input!), RUN.step), null, `sky${seed}, step${tick}`);
    assert.equal(world.controls.steered, false, 'the approach never relies on boundary assistance');
    // The pilot establishes the initial turn manually before handing the settled flight to coaching.
    if (tick < 60) { pending.push(manual()); continue; }
    const hands = { brake: input!.brake, fold: sky.state.pilot.collapse, held: world.pump.held, pumps: world.pump.n };
    swingGauge(g, watch.state, true, RUN.step, gauge, hands);
    const lift = guide.step(RUN.step, { g, air: world.air, input, clock: sky.state.elapsed });
    const localClearance = g.pos.y - surfaceAt(g.pos.x, g.pos.z);
    const message = coach.step(RUN.step, { g, watch: watch.state, style: style!.state, gauge, input,
      air: world.air, lift, collapse: hands.fold, hazard: runCoachHazard(world),
      clearance: localClearance, fogClearance: g.pos.y - sky.state.fogHeight, eligible: true });
    if (interruptsLift(message)) guide.reset();
    // Quiet is no instruction: it must never act as an implicit release of the pilot's hands.
    pending.push(message ? heldControls(message) : firstShown < 0 ? manual() : input!);
    if (message?.activity) { shown++; if (firstShown < 0) firstShown = tick; }
    if (message?.activity === 'thermalling' && firstThermal < 0) firstThermal = tick;
    assert.ok(!['wingover', 'pitch', 'inversion'].includes(message?.context!), 'ordinary circling is never taught as an intentional stunt');
    clearance = Math.min(clearance, localClearance);
    maxBank = Math.max(maxBank, Math.abs(g.bank));
    stallFrames += g.stall > 0 ? 1 : 0;
    if (tick >= 15) assert.equal(g.stall, 0, 'no stall after the initial seeded-wind settling transient');
    if (world.air.windY! > 1.6 && g.vy > 0.2) climbingFrames++;
  }
  assert.ok(clearance > 40, 'the actual departure and circle retain terrain clearance');
  assert.ok(g.pos.y > 120 && sky.state.peak > 125, 'manual entry and visible instructions gain useful altitude');
  assert.ok(firstShown >= 60 && shown > 60, 'manual turns may receive reactive advice before a source qualifies');
  assert.ok(firstThermal >= 240, `thermal identity still earns three seconds before activation: ${firstThermal}`);
  assert.ok(climbingFrames > 8 * 60, 'actual rising air produces sustained physical climb');
  assert.ok(maxBank < 50 * Math.PI / 180);
  assert.ok(stallFrames <= 3 && watch.state.breaks <= 1, 'only the brief initial wind-settling event is allowed');
  assert.equal(watch.state.moves, 0); assert.equal(g.loops, 0); assert.equal(style!.state.total, 0);
});

test('free-flight manual thermal entry also hands off to confirmed coaching without stunt prompts', () => {
  const source = FJORD_THERMALS[0];
  const g = createFlight({ x: source.x - 32, y: 150, z: source.z + 20 });
  const watch = createSwingWatch(), coach = createFlightCoach(), air = {}, gauge = {};
  let clock = 0, minimumClearance = Infinity;
  const guide = createLiftGuide({ sampleAir: (pos: Vector3, out: {}|undefined) => sampleFjordAir(pos, clock, out), heightAt: surfaceAt,
    sources: () => FJORD_THERMALS, fog: () => null, cloudDepth: () => 0,
    inside: (pos: { x: number; z: number; }, margin = 0) => Math.abs(pos.x) <= WORLD.halfX - margin &&
      pos.z >= WORLD.north + margin && pos.z <= WORLD.south - margin });
  const pending = Array.from({ length: 12 }, () => ({ ...released(), right: true, brake: true }));
  let shown = 0;
  for (let tick = 0; tick < 1080; tick++) {
    const input = pending.shift(), controls = physicalControls(input!);
    clock += RUN.step;
    sampleFjordAir(g.pos, clock, air);
    stepFlight(g, controls, air, RUN.step); watch.step(RUN.step, g, false, controls);
    const clearance = g.pos.y - surfaceAt(g.pos.x, g.pos.z);
    minimumClearance = Math.min(minimumClearance, clearance);
    assert.ok(Math.abs(g.pos.x) < WORLD.halfX - 50 && g.pos.z > WORLD.north + 45 && g.pos.z < WORLD.south - 45,
      'the same manual fjord controls remain within the unassisted flight area');
    if (tick < 60) { pending.push({ ...released(), right: true, brake: true }); continue; }
    swingGauge(g, watch.state, true, RUN.step, gauge, { brake: input!.brake });
    const lift = guide.step(RUN.step, { g, air, input, clock });
    const message = coach.step(RUN.step, { g, watch: watch.state, gauge, input, air, lift, clearance, eligible: true });
    if (interruptsLift(message)) guide.reset();
    pending.push(message ? heldControls(message) : shown === 0 ? { ...released(), right: true, brake: true } : input!);
    if (message?.activity) shown++;
    assert.ok(!['wingover', 'pitch', 'inversion'].includes(message?.context!));
    assert.equal(g.stall, 0);
  }
  assert.ok(minimumClearance > 60);
  assert.ok(g.pos.y > 160 && shown > 180, `actual lift and visible coaching sustain the manual entry: y=${g.pos.y}, shown=${shown}`);
  assert.equal(watch.state.moves, 0); assert.equal(watch.state.breaks, 0); assert.equal(g.loops, 0);
});
