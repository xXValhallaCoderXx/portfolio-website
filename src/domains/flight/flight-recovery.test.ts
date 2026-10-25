import type { SwingGauge } from '../../features/flight/presentation/swing-gauge.ts';
import type { FlightInput, FlightState } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlight, copyFlight, settleFlight, stepFlight, physicsEnergy, pitchPhase, WING } from './flight.ts';
import { PHYSICS } from './flight-physics.ts';
import { recoveryFlight, recoveryRun } from '../../test/helpers/test-recovery-flight.ts';
import { createFlightCoach } from '../coaching/flight-coach.ts';
import { createSwingWatch } from '../coaching/swing-watch.ts';
import { createStyle } from '../good-lift/meet-style.ts';
import { swingGauge, CUES } from '../../features/flight/presentation/swing-gauge.ts';
import { stallEffects, STALL_EFFECTS } from '../../features/flight/presentation/stall-effects.ts';
import { createReferencePilot } from '../good-lift/pilots.ts';
import { createCloudbaseRun } from '../good-lift/cloudbase-state.ts';
import { createRunWorld, startRun, stepRun } from '../good-lift/run-step.ts';

const dt = 1 / 60;
const aloft = () => createFlight({ x: 0, y: 1000, z: 0 });
function fly(g: FlightState, seconds: number, input = {}) {
  for (let tick = 0; tick < Math.round(seconds / dt); tick++) stepFlight(g, typeof input === 'function' ? input(g, tick) : input, {}, dt);
  return g;
}

for (const scenario of ['stall', 'frontal'] as const) for (const delay of [0, 0.15, 0.3, 0.6]) {
  test(`${scenario}: real entry and visible recovery with ${delay}s reaction`, () => {
    const r = recoveryFlight({ scenario, delay });
    assert.notEqual(r.handedAt, null, 'the solver must create the failure before coaching');
    assert.notEqual(r.recoveredAt, null, 'visible requests must recover without assistance');
    assert.ok(r.recoverySeconds! <= 30, `${r.recoverySeconds}s`);
    assert.ok(r.recoveryHeightLoss <= 150 && r.recoveryHeightLoss > 0, `${r.recoveryHeightLoss}m`);
    assert.equal(r.g.wingPhase, WING.flying); assert.equal(r.g.inflation, 1);
    assert.equal(r.g.stall, 0); assert.equal(r.g.tuck, 0); assert.ok(r.watch.calm >= 1);
    assert.equal(r.style.total, 0, 'a recovery is not a new style award');
    assert.equal(r.style.pending, 0);
    if (scenario === 'stall') {
      assert.ok(r.stalledAt! < 8 && r.stalledSeconds >= 5);
      assert.ok(r.reverseSeconds >= 5, 'backfly is sustained backwards air-relative motion of both bodies');
      assert.ok(r.phases.some(p => p.wing === WING.stalled));
      if (delay <= 0.3) assert.equal(r.folds, 0, 'a timely controlled exit must not collapse');
    } else {
      assert.ok(r.minimumInflation < 0.3 && r.folds >= 1, 'the leading edge really folds');
      assert.ok(r.phases.some(p => p.wing === WING.opening));
    }
  });
}

test('a growing pitch can be caught while the same uncaught flight folds its leading edge', () => {
  const g = aloft();
  for (let tick = 0; tick < 1200; tick++) {
    stepFlight(g, { deepBrake: tick % 420 < 90 }, {}, dt);
    if (tick > 15 * 60 && g.pitch < -0.45 && g.pitchRate < -0.5) break;
  }
  const caught = copyFlight(aloft(), g), missed = copyFlight(aloft(), g);
  let catches = 0, folds = 0;
  const reference = createReferencePilot();
  const world = createRunWorld({g:missed,sky:createCloudbaseRun()}); world.sky.reset(missed.pos.y,1);
  for (let tick = 0; tick < 360; tick++) {
    stepFlight(caught, { brake: caught.pitch < 0 }, {}, dt);
    stepFlight(missed, {}, {}, dt);
    catches += Number(caught.tuck > 0); folds += Number(missed.tuck > 0);
    if(missed.tuck>0){
      const intent: FlightInput={};reference.decide(world,intent);
      assert.equal(intent.brake,false,'reference pilots release a frontal rather than pump it');
      assert.equal(intent.bar,false);assert.equal(intent.turn,0);
    }
  }
  assert.equal(catches, 0); assert.ok(folds > 0);
  assert.notDeepEqual(caught.pilot.vel, missed.pilot.vel, 'the fold changes forces, not just its label');
});

test('full stall persists with deep brake, while normal flight and a single released pitch stay attached', () => {
  const stalled = fly(aloft(), 8, { deepBrake: true });
  assert.equal(stalled.wingPhase, WING.stalled); assert.ok(stalled.stall > 0.95);
  assert.ok(stalled.vy < -5 && stalled.inflation < 0.8);
  for (const input of [{}, { brake: true }, { turn: 1, brake: true }, { turn: -1, brake: true }, { bar: true }]) {
    const g = aloft();
    for (let tick = 0; tick < 3600; tick++) {
      stepFlight(g, input, {}, dt);
      assert.equal(g.stall, 0); assert.equal(g.tuck, 0); assert.equal(g.wingPhase, WING.flying);
    }
  }
  const pitched = fly(aloft(), 1.5, { deepBrake: true });
  fly(pitched, 15, (g: { pitch: number; }): FlightInput => ({ brake: g.pitch < -0.4 }));
  assert.equal(pitched.stall, 0); assert.equal(pitched.tuck, 0);
});

test('braking before reattachment returns the separated wing to a stalled state', () => {
  const g = fly(aloft(), 8, { deepBrake: true });
  fly(g, 2, { brake: true }); assert.equal(g.wingPhase, WING.backfly);
  fly(g, 0.4); assert.equal(g.wingPhase, WING.exit);
  fly(g, 0.4, { brake: true });
  assert.ok(g.wingPhase === WING.stalled || g.wingPhase === WING.backfly);
  assert.ok(g.stall > 0.8);
});

test('early release while the stalled canopy is behind preserves the larger physical surge', () => {
  const g = aloft();
  for (let tick = 0; tick < 720 && !(g.wingPhase === WING.entry && g.pitch > 0.4); tick++) stepFlight(g, { deepBrake: true }, {}, dt);
  const behind = g.pitch;
  let peak = 0;
  for (let tick = 0; tick < 900; tick++) { stepFlight(g, {}, {}, dt); peak = Math.max(peak, -g.pitch); }
  assert.ok(behind > 0.4); assert.ok(peak > 0.8, `uncaught exit reaches ${peak}rad`);
});

test('phase-specific cues are read-only, supersede hazards and distinguish frontal reopening from strike pumping', () => {
  const r = recoveryFlight({ scenario: 'stall' });
  assert.ok(r.phases.some(p => p.title?.includes('RELEASE TO EXIT')));
  const g = fly(aloft(), 3.5, { deepBrake: true }), watch = createSwingWatch(), coach = createFlightCoach();
  const input: FlightInput = { deepBrake: true, brake: true }, before = structuredClone({ g, input });
  let message = coach.step(dt, { g, watch: watch.state, input, collapse: 1, hazard: { action: 'left' } });
  assert.equal(message!.action, 'deep-brake');
  assert.deepEqual({ g, input }, before);
  const gauge: Partial<SwingGauge> = {};
  swingGauge(g, watch.state, true, dt, gauge, { fold: 1, held: 0 }); assert.equal(gauge.cue, CUES.press);
  g.wingPhase = WING.frontal; g.stall = 0; g.tuck = 0.7;
  message = coach.step(dt, { g, watch: watch.state, input, collapse: 1 });
  assert.equal(message!.action, 'release-all');
  swingGauge(g, watch.state, true, dt, gauge, { fold: 1, held: 0 }); assert.equal(gauge.cue, CUES.release);
});

test('real failure loses pending style once, preserves banked style and cannot bank its recovery', () => {
  const g = aloft(), watch = createSwingWatch(), style = createStyle(), controls: FlightInput = { deepBrake: true };
  const world = { g, watch, controls };
  style.state.total = 50; style.state.pending = 30; style.state.elements = 1;
  for (let tick = 0; tick < 480; tick++) { stepFlight(g, controls, {}, dt); watch.step(dt, g, false, controls); style.step(dt, world); }
  assert.equal(watch.state.breaks, 1); assert.equal(style.state.lost, 1);
  assert.equal(style.state.total, 50); assert.equal(style.state.pending, 0);
});

test('recovery state is copied without aliasing, predictions do not mutate it and settle clears it', () => {
  const g = fly(aloft(), 4, { deepBrake: true }), copy = copyFlight(aloft(), g);
  const original = structuredClone(g);
  pitchPhase(g, {}, 3); assert.deepEqual(g, original);
  for (let tick = 0; tick < 300; tick++) { stepFlight(g, { brake: true }, {}, dt); stepFlight(copy, { brake: true }, {}, dt); }
  assert.deepEqual(g, copy); assert.notEqual(g.physical.flow, copy.physical.flow);
  settleFlight(copy); assert.equal(copy.wingPhase, WING.flying); assert.equal(copy.inflation, 1);
  assert.equal(copy.physical.stallExposure, 0); assert.equal(copy.stall, 0);
});

test('stall and frontal flights dissipate energy and maintain finite suspension without altitude gates', () => {
  for (const height of [100, 300, 1000]) {
    const g = createFlight({ x: 0, y: height, z: 0 }); let energy = physicsEnergy(g), stalled = false;
    for (let tick = 0; tick < 720; tick++) {
      stepFlight(g, { deepBrake: tick < 420, brake: tick >= 420 }, {}, dt);
      const next = physicsEnergy(g); assert.ok(next <= energy + 0.001); energy = next;
      stalled ||= g.stall > 0;
      assert.ok(Number.isFinite(next) && Number.isFinite(g.speed) && g.tension >= 0);
      const d = Math.hypot(g.pilot.pos.x - g.canopy.pos.x, g.pilot.pos.y - g.canopy.pos.y, g.pilot.pos.z - g.canopy.pos.z);
      assert.ok(d <= PHYSICS.line + PHYSICS.attachment + 0.001);
    }
    assert.ok(stalled);
  }
  const world = startRun(createRunWorld({ sky: createCloudbaseRun() }), 1);
  let ended = null;
  for (let tick = 0; tick < 10800 && !ended; tick++) ended = stepRun(world, { turn: -1, deepBrake: true });
  assert.equal(ended, 'landed', 'holding a stall low down ends through real terrain contact');
});

test('stable backfly has quieter cloth while a frontal fold follows its actual inflation deficit', () => {
  const g = fly(aloft(), 8, { deepBrake: true }); fly(g, 2, { brake: true });
  const backfly = stallEffects('flying', g, {});
  assert.equal(backfly.left, STALL_EFFECTS.backflyFold); assert.equal(backfly.shake, 0);
  assert.equal(stallEffects('intro', g, {}).luff, 0);
});

// The flight coach's recovery cards, followed after a real guided climb on the classic wing. A
// glider's failures are flown out by the recovery guide instead (recovery-runs.test.js), and the A and
// the B never tuck from pulsed brakes at all.
for (const scenario of ['stall', 'frontal'] as const) test(`canonical ${scenario} recovery after a real guided climb`, () => {
  const r = recoveryRun({ scenario, wing: 'classic' });
  assert.equal(r.recovered, true); assert.equal(r.assisted, false);
  assert.ok(r.minimumClearance >= 30);
  assert.ok(r.phases.some(p => p.phase === (scenario === 'stall' ? WING.backfly : WING.frontal)));
  assert.ok(r.sheet.steps > 120 * 60 && r.sheet.steps < 230 * 60);
  assert.equal(r.style.total, 0);
});
