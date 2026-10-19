import type { AirSample, PhasePrediction } from '../flight/models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlight, copyFlight, settleFlight, releaseFlight, stepFlight, PHYSICS, physicsEnergy, pitchPhase, WING } from '../flight/flight.ts';
import { stepEnvelope } from '../flight/wing-envelope.ts';
import { createFlightCoach } from '../coaching/flight-coach.ts';
import { createSwingWatch } from '../coaching/swing-watch.ts';
import type { FlightState, FlightInput } from '../flight/models.ts';

const dt = 1 / 60, DEG = Math.PI / 180;
const aloft = () => createFlight({ x: 0, y: 2000, z: 0 });
const pair = (leftBrake: number, rightBrake = leftBrake): FlightInput => ({ controlMode: 'brakes', leftBrake, rightBrake });
const fly = (g: FlightState, seconds: number, controls: FlightInput | ((g: FlightState, tick: number) => FlightInput), air: AirSample = {}) => {
  for (let tick = 0; tick < Math.round(seconds / dt); tick++) stepFlight(g, typeof controls === 'function' ? controls(g, tick) : controls, air, dt);
  return g;
};
const near = (a: number, b: number, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);

test('direct neutral retains its mode and follows the same settled trim without creating a bank request', () => {
  const direct = fly(aloft(), 30, pair(0)), legacy = fly(aloft(), 30, {});
  assert.equal(direct.controlMode, 'brakes');
  assert.deepEqual(direct.pilot, legacy.pilot); assert.deepEqual(direct.canopy, legacy.canopy);
  assert.equal(direct.leftBrake, 0); assert.equal(direct.rightBrake, 0);
  assert.equal(direct.coordination, 0); assert.equal(direct.bankTarget, 0);
});

test('each hand has authoritative travel, an independent take/release and a bounded full endpoint', () => {
  const g = aloft();
  stepFlight(g, pair(0.25, 0), {}, dt);
  near(g.leftBrake, 0.25 * PHYSICS.deepBrake * dt / PHYSICS.brakeTake);
  assert.equal(g.rightBrake, 0); assert.equal(g.brake, 0);
  near(g.leftBrakeTarget, 0.15); assert.equal(g.rightBrakeTarget, 0);
  const previous = g.leftBrake;
  stepFlight(g, pair(0, 0.5), {}, dt);
  near(g.leftBrake, previous * (1 - dt / PHYSICS.brakeRelease));
  near(g.rightBrake, 0.5 * PHYSICS.deepBrake * dt / PHYSICS.brakeTake);
  stepFlight(g, pair(5, -2), {}, dt);
  assert.equal(g.leftBrakeTarget, PHYSICS.deepBrake); assert.equal(g.rightBrakeTarget, 0);
  stepFlight(g, pair(NaN, Infinity), {}, dt);
  assert.equal(g.leftBrakeTarget, 0); assert.equal(g.rightBrakeTarget, 0);
});

test('equal working pulls slow the wing symmetrically and full travel directly reaches a real stall', () => {
  const g = fly(aloft(), 15, pair(2 / 3));
  near(g.leftBrake, PHYSICS.brake); near(g.rightBrake, PHYSICS.brake);
  near(g.brake, PHYSICS.brake); near(g.bank, 0); near(g.yaw, 0);
  assert.ok(g.speed < 11 && g.speed > 7); assert.equal(g.stall, 0);
  const stalled = fly(aloft(), 8, pair(1));
  near(stalled.leftBrakeTarget, PHYSICS.deepBrake); near(stalled.rightBrakeTarget, PHYSICS.deepBrake);
  assert.equal(stalled.deepBrake, true); assert.ok(stalled.stall > 0.9);
  assert.equal(stalled.wingPhase, WING.stalled);
});

for (const side of [-1, 1]) test(`graded direct pulls support stable manual circles and real lift, side ${side}`, () => {
  let previousBank = 0, previousRate = 0;
  for (const amount of [0.1, 0.2, 0.3]) {
    const g = fly(aloft(), 120, side < 0 ? pair(amount, 0) : pair(0, amount), { windY: 3 });
    assert.ok(g.bank * side > previousBank + DEG * 3);
    assert.ok(g.trackRate * side > previousRate + 0.03);
    assert.ok(Math.abs(g.bank) < 30 * DEG && Math.abs(g.yaw) > 2 * Math.PI);
    assert.ok(g.pos.y > 2000, 'climbing comes from rising air');
    assert.equal(side < 0 ? g.rightBrake : g.leftBrake, 0, 'the opposite hand stays released');
    near(g.physical.differential, g.rightBrake - g.leftBrake);
    assert.equal(g.bankTarget, 0); assert.equal(g.coordination, 0);
    assert.equal(g.stall, 0); assert.equal(g.tuck, 0);
    previousBank = g.bank * side; previousRate = g.trackRate * side;
    fly(g, 15, pair(0));
    assert.ok(Math.abs(g.bank) < 2 * DEG, 'hands up naturally settles through passive stability');
  }
});

test('direct left and right inputs have mirrored canonical paths', () => {
  const left = fly(aloft(), 30, pair(0.3, 0));
  const right = fly(aloft(), 30, pair(0, 0.3));
  near(left.pos.x, -right.pos.x, 0.001); near(left.pos.z, right.pos.z, 0.001);
  near(left.pos.y, right.pos.y, 0.001); near(left.bank, -right.bank, 0.001);
});

test('still-air per-hand sweeps, full stalls and releases cannot supply mechanical energy', () => {
  const g = aloft(); let previous = physicsEnergy(g);
  for (let tick = 0; tick < 3600; tick++) {
    const left = tick < 600 ? 1 : tick < 1200 ? 0 : (Math.sin(tick * 0.013) + 1) / 2;
    const right = tick < 600 ? 1 : tick < 1200 ? 0 : (Math.sin(tick * 0.019) + 1) / 2;
    stepFlight(g, pair(left, right), {}, dt);
    const energy = physicsEnergy(g);
    assert.ok(energy <= previous + 0.001, `unpowered input added energy at ${tick}`); previous = energy;
    assert.ok(Number.isFinite(g.pos.y) && Number.isFinite(g.bank) && g.tension >= 0);
  }
});

test('global stall and frontal reopening require both hands released', () => {
  const s = aloft().physical;
  Object.assign(s, { controlMode: 'brakes', wingPhase: WING.stalled, separation: 1, brake: 0,
    leftBrake: 0.4, rightBrake: 0, inflation: 0.7, recoverySource: 'stall' });
  const flow = { alpha: 0.1, forward: 8, pilotForward: 8, pitch: 0, pitchRate: 0, load: 1, under: true, bank: 0 };
  for (let tick = 0; tick < 60; tick++) stepEnvelope(s, flow, dt, PHYSICS);
  assert.equal(s.wingPhase, WING.stalled); assert.equal(s.releaseExposure, 0);
  s.leftBrake = 0;
  for (let tick = 0; tick < 15; tick++) stepEnvelope(s, flow, dt, PHYSICS);
  assert.notEqual(s.wingPhase, WING.stalled);
  Object.assign(s, { wingPhase: WING.frontal, folded: true, inflation: 0.2, leftBrake: 0.4 });
  for (let tick = 0; tick < 30; tick++) stepEnvelope(s, flow, dt, PHYSICS);
  assert.equal(s.wingPhase, WING.frontal); near(s.inflation, 0.2);
  s.leftBrake = 0;
  for (let tick = 0; tick < 180; tick++) stepEnvelope(s, flow, dt, PHYSICS);
  assert.ok(s.inflation > 0.98);
});

for (const scenario of ['stall', 'frontal']) test(`real direct ${scenario} can recover by following the visible equal-hand actions`, () => {
  const g = aloft(), watch = createSwingWatch(), coach = createFlightCoach();
  let input = pair(0), stalledAt = null, backflyAt = null, handedAt = null, recoveredAt = null;
  let pending = null, lastAction = '', lowestInflation = 1;
  for (let tick = 0; tick < 70 * 60; tick++) {
    const time = tick * dt;
    if (handedAt === null) {
      if (scenario === 'stall') {
        input = pair(stalledAt !== null && time - stalledAt >= 5 ? 2 / 3 : 1);
        if (backflyAt !== null && time - backflyAt >= 5) handedAt = time;
      } else {
        input = pair(time % 7 < 1.5 ? 1 : 0);
        if (g.tuck > 0) { handedAt = time; input = pair(0); }
      }
    }
    if (pending && tick >= pending.at) { input = pending.input; pending = null; }
    stepFlight(g, input, {}, dt); watch.step(dt, g, false, input);
    lowestInflation = Math.min(lowestInflation, g.inflation);
    if (g.stall > 0 && stalledAt === null) stalledAt = time;
    if (g.wingPhase === WING.backfly && backflyAt === null) backflyAt = time;
    if (handedAt !== null) {
      const message = coach.step(dt, { g, watch: watch.state, input, clearance: g.pos.y });
      if (message && !pending && message.action !== lastAction) {
        let amount;
        if (message.action === 'deep-brake') amount = 1;
        else if (message.action === 'brake') amount = 2 / 3;
        else if (['release-all', 'release-brake', 'straight'].includes(message.action)) amount = 0;
        if (amount !== undefined) pending = { at: tick + 10, input: pair(amount) };
        lastAction = message.action;
      }
      if (g.wingPhase === WING.flying && watch.state.calm >= 1) { recoveredAt = time; break; }
    }
  }
  assert.notEqual(handedAt, null, 'the physical model must create the failure');
  assert.notEqual(recoveredAt, null, 'the visible actions must recover the wing');
  assert.ok(recoveredAt! - handedAt! < 30);
  assert.ok(g.pos.y > 1800); assert.equal(g.stall, 0); assert.equal(g.tuck, 0);
  if (scenario === 'frontal') assert.ok(lowestInflation < 0.3);
  else assert.notEqual(backflyAt, null);
});

test('direct phase forecasts preserve each target and mode without mutating live flight', () => {
  const g = fly(aloft(), 0.5, pair(0.8, 0.95)), ahead = copyFlight(aloft(), g);
  const before = structuredClone(g), out: Partial<PhasePrediction> = {};
  pitchPhase(g, out, 3);
  let rate = ahead.pitchRate, peak;
  for (let tick = 1; tick <= 180; tick++) {
    stepFlight(ahead, pair(0.8, 0.95), {}, dt);
    if (rate * ahead.pitchRate <= 0) { peak = { time: tick * dt, pitch: ahead.pitch }; break; }
    rate = ahead.pitchRate;
  }
  assert.ok(peak); near(out.toPeak!, peak.time); near(out.peak!, peak.pitch);
  assert.deepEqual(g, before);
});

test('mode changes, copying and canonical reset cannot retain an old per-hand target', () => {
  const g = fly(aloft(), 2, pair(0.3, 0.1)), copy = copyFlight(aloft(), g);
  assert.deepEqual(copy.pilot, g.pilot); assert.deepEqual(copy.canopy, g.canopy);
  assert.equal(copy.controlMode, g.controlMode); assert.equal(copy.leftBrake, g.leftBrake);
  assert.equal(copy.rightBrakeTarget, g.rightBrakeTarget); assert.notEqual(copy.physical.flow, g.physical.flow);
  stepFlight(copy, pair(0, 0.3), {}, dt);
  assert.equal(g.leftBrakeTarget, 0.18); assert.equal(copy.leftBrakeTarget, 0);
  stepFlight(copy, { turn: -1, brake: true }, {}, dt);
  assert.equal(copy.controlMode, 'legacy');
  near(copy.leftBrakeTarget, PHYSICS.brake); near(copy.rightBrakeTarget, PHYSICS.brake);
  settleFlight(g);
  assert.equal(g.controlMode, 'legacy'); assert.equal(g.leftBrakeTarget, 0); assert.equal(g.rightBrake, 0);
  releaseFlight(copy);
  assert.equal(copy.leftBrake, 0); assert.equal(copy.rightBrakeTarget, 0);
});
