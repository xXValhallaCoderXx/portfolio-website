import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlight, copyFlight, releaseFlight, settleFlight, stepFlight, pitchPhase, PHYSICS, physicsEnergy } from './flight.js';
import { rotate } from './flight-physics.js';
import { arraysMadeBy } from './test-alloc.js';

const STEP = 1 / 60;
const DEG = Math.PI / 180;
const aloft = (height = 2000) => createFlight({ x: 0, y: height, z: 0 });
const fly = (g, seconds, controls = {}, air = {}) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) stepFlight(g, typeof controls === 'function' ? controls(g, i) : controls, air, STEP);
  return g;
};
const near = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) <= epsilon, `${a} differs from ${b} by ${Math.abs(a - b)}`);
const body = (g) => ({ pilot: structuredClone(g.pilot), canopy: structuredClone(g.canopy) });

test('the coupled trim is a stable computed equilibrium and public position is the pilot position', () => {
  const g = aloft();
  assert.equal(g.pos, g.pilot.pos);
  assert.ok(g.speed >= 11 && g.speed <= 12);
  assert.ok(g.vy <= -1.1 && g.vy >= -1.5);
  const speed = g.speed, sink = g.vy;
  fly(g, 60);
  near(g.speed, speed, 0.01); near(g.vy, sink, 0.01);
  assert.ok(Math.abs(g.bank) < 0.001 && Math.abs(g.pitch) < 0.05);
  assert.equal(g.loops, 0);
});

test('steering banks before carving, a sustained turn is bounded, and releasing preserves then settles momentum', () => {
  const g = aloft();
  fly(g, 1, { turn: 1 });
  assert.ok(g.bank > 8 * DEG && g.bank < 35 * DEG);
  assert.ok(g.yaw > 0 && g.yaw < 0.2);
  fly(g, 29, { turn: 1 });
  assert.ok(g.bank > 30 * DEG && g.bank < 42 * DEG);
  assert.equal(g.stall, 0);
  const before = { ...g.pilot.vel };
  releaseFlight(g);
  assert.deepEqual(g.pilot.vel, before);
  fly(g, 3);
  assert.ok(Math.abs(g.bank) < 10 * DEG);
  assert.equal(g.loops, 0);
});

test('left and right turns have mirrored physical paths and equivalent height cost', () => {
  const a = fly(aloft(), 8, { turn: 1 });
  const b = fly(aloft(), 8, { turn: -1 });
  near(a.pos.x, -b.pos.x, 0.001); near(a.pos.z, b.pos.z, 0.001); near(a.pos.y, b.pos.y, 0.001);
  near(a.bank, -b.bank, 0.001);
});

test('a held brake stays at predictable working depth and the bar changes the physical glide', () => {
  const braked = fly(aloft(), 30, { brake: true });
  near(braked.brake, PHYSICS.brake, 1e-6);
  assert.ok(braked.speed < 11 && braked.speed > 7);
  assert.equal(braked.stall, 0);
  const bar = fly(aloft(), 30, { bar: true });
  assert.ok(bar.speed > 14 && bar.speed < 17);
  assert.ok(bar.sink > 1.6);
  fly(bar, 2, { brake: true, bar: true });
  assert.ok(bar.bar < 0.01 && bar.brake > 0.39);
});

test('explicit deep brake requests more real travel and releases back to an ordinary catch', () => {
  const working = aloft(), deep = aloft();
  let workingPitch = 0, deepPitch = 0;
  for (let tick = 0; tick < 120; tick++) {
    stepFlight(working, { brake: true }, {}, STEP);
    stepFlight(deep, { deepBrake: true }, {}, STEP);
    workingPitch = Math.max(workingPitch, working.pitch);
    deepPitch = Math.max(deepPitch, deep.pitch);
    assert.equal(working.deepBrake, false); assert.equal(working.acro, false);
    assert.equal(deep.deepBrake, true); assert.equal(deep.brakeTarget, PHYSICS.deepBrake);
    assert.equal(deep.stall, 0);
  }
  near(deep.brake, PHYSICS.deepBrake, 1e-6);
  assert.ok(deepPitch > workingPitch * 1.25, 'deeper travel visibly loads a larger physical backswing');
  assert.ok(deep.speed < working.speed, 'the deeper pull actually spends airspeed');
  stepFlight(deep, { brake: true }, {}, STEP);
  assert.equal(deep.deepBrake, false); assert.equal(deep.brakeTarget, PHYSICS.brake);
  assert.ok(deep.brake > PHYSICS.brake && deep.brake < PHYSICS.deepBrake, 'the actual brake eases to working depth');
  fly(deep, 30);
  assert.equal(deep.acro, false, 'explicit acro authority ends after a real steady recovery');
  assert.equal(deep.brakeTarget, 0); assert.ok(deep.brake < 1e-6);
});

test('deep intent implies common braking, takes precedence over other configurations and cannot bypass assistance', () => {
  const a = fly(aloft(), 3, { deepBrake: true });
  const b = fly(aloft(), 3, { brake: true, deepBrake: true, bar: true, ears: true });
  assert.deepEqual(body(a), body(b)); assert.equal(a.bar, 0); assert.equal(a.ears, 0);
  stepFlight(a, { deepBrake: true, locked: true }, {}, STEP);
  assert.equal(a.deepBrake, true, 'the telemetry retains the requested depth');
  assert.equal(a.brakeTarget, 0, 'a locked wing accepts no physical brake command');
  assert.equal(a.acro, false, 'assistance cannot preserve manual acro authority');
});

test('physical phase prediction preserves the requested deep depth without mutating the flight', () => {
  const g = fly(aloft(), 0.5, { deepBrake: true }), ahead = copyFlight(aloft(), g);
  const before = structuredClone(g), phase = {};
  pitchPhase(g, phase, undefined, 3);
  let previous = ahead.pitchRate, peak = null;
  for (let tick = 1; tick <= 180; tick++) {
    stepFlight(ahead, { deepBrake: true }, {}, STEP);
    if (previous * ahead.pitchRate <= 0) { peak = { tick, pitch: ahead.pitch }; break; }
    previous = ahead.pitchRate;
  }
  assert.ok(peak); near(phase.toPeak, peak.tick / 60); near(phase.peak, peak.pitch);
  assert.deepEqual(g, before, 'forecasting never writes the live bodies or control state');
});

test('mode forgiveness flags do not alter manual handling or aerodynamic consequences', () => {
  const a = aloft(), b = aloft();
  for (let i = 0; i < 1200; i++) {
    const input = { turn: Math.sin(i / 120), brake: i % 180 < 45, bar: i % 180 > 150 };
    const air = { windX: 2, windY: 1.5, windZ: -1 };
    stepFlight(a, { ...input, safe: true, harsh: false, linger: false, folds: false }, air, STEP);
    stepFlight(b, { ...input, safe: false, harsh: true, linger: true, folds: true }, air, STEP);
  }
  assert.deepEqual(body(a), body(b));
});

test('constant wind advects the same air-relative flight, including real work from rising air', () => {
  const a = aloft(), b = aloft();
  const wind = { windX: 2, windY: 3, windZ: -1 };
  for (const part of [b.pilot, b.canopy]) {
    part.vel.x += wind.windX; part.vel.y += wind.windY; part.vel.z += wind.windZ;
  }
  const energy = physicsEnergy(b);
  fly(a, 20); fly(b, 20, {}, wind);
  near(b.pos.x - a.pos.x, 40, 0.003); near(b.pos.y - a.pos.y, 60, 0.003); near(b.pos.z - a.pos.z, -20, 0.003);
  assert.ok(b.pos.y > 2000 && physicsEnergy(b) > energy, 'rising air adds real world-space mechanical energy');
});

test('windY is applied once and separate hazard sink subtracts from that one vertical flow', () => {
  const a = aloft(), b = aloft();
  fly(a, 8, {}, { windY: 3, lift: 40, sink: 20, hazardSink: 1 });
  fly(b, 8, {}, { windY: 2, lift: 0, sink: 0 });
  assert.deepEqual(body(a), body(b));
});

test('rapid key mashing stays small while larger wingovers spend altitude and recover', () => {
  const fast = aloft(), timed = aloft();
  let fastPeak = 0, timedPeak = 0;
  for (let i = 0; i < 1800; i++) {
    stepFlight(fast, { turn: Math.floor(i / 30) % 2 ? 1 : -1 }, {}, STEP);
    stepFlight(timed, { turn: Math.floor(i / 270) % 2 ? 1 : -1, deepBrake: i < 12 }, {}, STEP);
    fastPeak = Math.max(fastPeak, Math.abs(fast.bank)); timedPeak = Math.max(timedPeak, Math.abs(timed.bank));
    assert.equal(timed.stall, 0);
  }
  assert.ok(fastPeak < 25 * DEG);
  assert.ok(timedPeak > 50 * DEG && timedPeak < 75 * DEG);
  assert.ok(timed.pos.y < fast.pos.y);
  fly(timed, 10, (g) => ({ brake: g.pitch < 0 }));
  assert.ok(Math.abs(timed.bank) < 10 * DEG);
  assert.equal(timed.loops, 0);
});

test('a clean energetic orbit uses world-space suspension geometry and can be caught and settled', () => {
  const g = aloft();
  const lines = [], attachment = {};
  const recordLine = () => {
    rotate(attachment, g.canopy.q, 0, -PHYSICS.attachment, 0);
    const x = g.pilot.pos.x - g.canopy.pos.x - attachment.x;
    const y = g.pilot.pos.y - g.canopy.pos.y - attachment.y;
    const z = g.pilot.pos.z - g.canopy.pos.z - attachment.z;
    const length = Math.hypot(x, y, z);
    lines.push([x / length, y / length, z / length]);
  };
  recordLine();
  let initial = physicsEnergy(g), above = false, orbitTick = -1;
  // Hold left on the bar for 4.75 seconds, then right. Release the bar and catch after 9.67
  // seconds; momentum finishes a real orbit during the physical recovery.
  for (let tick = 0; tick < 2400 && !g.loops; tick++) {
    const entry = tick < 580;
    const turn = entry ? tick < 285 ? -1 : 1 : 0;
    stepFlight(g, { turn, bar: entry, deepBrake: tick < 12, brake: !entry && g.pitch < 0 }, {}, STEP);
    recordLine();
    above ||= g.pilot.pos.y > g.canopy.pos.y;
    assert.equal(g.stall, 0, 'the successful orbit keeps flying air');
    const energy = physicsEnergy(g);
    assert.ok(energy <= initial + 0.001, 'no control press supplies energy'); initial = energy;
    if (g.loops) orbitTick = tick;
  }
  assert.ok(above);
  assert.equal(g.loops, 1);
  assert.ok(Math.abs(g.physical.lastOrbitAngle) >= 2 * Math.PI);
  assert.ok(g.physical.lastOrbitProjection >= Math.sqrt(1 - PHYSICS.orbit.maxOffPlane ** 2));
  // Independently project the recorded canonical bodies into the final frozen plane. A trim
  // offset or observer initialization must not inflate less than 360 degrees into a full orbit.
  const s = g.physical;
  let measured = 0, previous;
  const [rx, ry, rz] = lines[0];
  const referenceOff = rx * s.orbitPlaneX + ry * s.orbitPlaneY + rz * s.orbitPlaneZ;
  for (const [x, y, z] of lines) {
    const off = x * s.orbitPlaneX + y * s.orbitPlaneY + z * s.orbitPlaneZ;
    const angle = Math.atan2((ry * z - rz * y) * s.orbitPlaneX + (rz * x - rx * z) * s.orbitPlaneY +
      (rx * y - ry * x) * s.orbitPlaneZ, rx * x + ry * y + rz * z - referenceOff * off);
    if (previous != null) measured += Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous));
    previous = angle;
  }
  assert.ok(Math.abs(measured) >= 2 * Math.PI, 'canonical suspension travels a complete projected orbit');
  near(measured, s.lastOrbitAngle, 1e-8);
  assert.ok(g.pos.y < 1950 && g.pos.y > 1800, 'the orbit spends substantial real altitude');
  assert.ok(orbitTick >= 450 && orbitTick < 1000);
  let calm = 0, firstCalm = -1;
  for (let tick = 0; tick < 900 && firstCalm < 0; tick++) {
    stepFlight(g, { brake: g.pitch < 0 }, {}, STEP);
    assert.equal(g.stall, 0);
    calm = Math.abs(g.bank) < 0.26 && Math.abs(g.pitch) < 0.175 && Math.abs(g.pitchRate) < 0.3 ? calm + 1 : 0;
    if (calm >= 60 && firstCalm < 0) firstCalm = tick;
  }
  assert.equal(g.loops, 1);
  assert.ok(firstCalm >= 0 && firstCalm < 900, 'a correctly caught exit settles within fifteen seconds');
  for (let tick = 0; tick < 1800; tick++) {
    stepFlight(g, {}, {}, STEP);
    assert.equal(g.stall, 0);
  }
  assert.equal(g.loops, 1, 'releasing after the catch does not leave an uncontrolled tumble');
  assert.equal(g.stall, 0);
  assert.ok(Math.abs(g.bank) < 0.03 && Math.abs(g.pitch) < 0.16);
});

test('changing a chase heading or drawing a rotated mesh cannot earn an orbit', () => {
  const g = aloft();
  for (let i = 0; i < 1200; i++) { g.yaw += 0.3; stepFlight(g, {}, {}, STEP); }
  assert.equal(g.loops, 0);
});

test('suspension stays finite and cannot push, and still-air controls never create energy', () => {
  const g = aloft(), r = {};
  let seed = 17, energy = physicsEnergy(g);
  for (let i = 0; i < 7200; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    stepFlight(g, { turn: ((seed & 3) - 1.5) / 1.5, brake: (seed & 16) !== 0, deepBrake: (seed & 64) !== 0,
      bar: (seed & 32) !== 0, ears: (seed & 128) !== 0 }, {}, STEP);
    rotate(r, g.canopy.q, 0, -PHYSICS.attachment, 0);
    const length = Math.hypot(g.pos.x - g.canopy.pos.x - r.x, g.pos.y - g.canopy.pos.y - r.y, g.pos.z - g.canopy.pos.z - r.z);
    assert.ok(length <= PHYSICS.line + 0.00001);
    assert.ok(Number.isFinite(g.speed) && Number.isFinite(g.physical.energy) && g.tension >= 0);
    near(Math.hypot(g.canopy.q.x, g.canopy.q.y, g.canopy.q.z, g.canopy.q.w), 1, 0.000001);
    const next = physicsEnergy(g); assert.ok(next <= energy + 0.001); energy = next;
  }
});

test('prediction copies do not alias live bodies and stepping/copying creates no arrays', () => {
  const source = aloft(), ahead = aloft();
  copyFlight(ahead, source);
  const before = body(source);
  fly(ahead, 2, { turn: 1 });
  assert.deepEqual(body(source), before);
  assert.notEqual(source.pilot.pos, ahead.pilot.pos); assert.notEqual(source.canopy.q, ahead.canopy.q);
  const arrays = arraysMadeBy(() => {
    for (let i = 0; i < 300; i++) { copyFlight(ahead, source); stepFlight(ahead, { turn: 0.5 }, {}, STEP); }
  });
  assert.equal(arrays, 0);
});

test('settling resets canonical bodies and the observer regardless of previous flight', () => {
  const a = aloft(), b = aloft();
  fly(b, 30, (g, i) => ({ turn: Math.sin(i / 120), brake: i % 100 < 40 }), { windX: 2, windY: 3, windZ: 1 });
  Object.assign(b.pos, { x: 0, y: 2000, z: 0 }); b.yaw = 0; settleFlight(b);
  assert.deepEqual(body(a), body(b));
  assert.equal(b.loops, 0); assert.equal(b.physical.orbitActive, false);
});
