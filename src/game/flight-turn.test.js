import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlight, copyFlight, settleFlight, stepFlight, physicsEnergy, PHYSICS } from './flight.js';

const STEP = 1 / 60, DEG = Math.PI / 180;
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const aloft = () => createFlight({ x: 0, y: 2000, z: 0 });

function halfTurn(side, brake, windY = 0) {
  const g = aloft(), input = Object.freeze({ turn: side, brake }), air = { windY };
  for (const body of [g.pilot, g.canopy]) body.vel.y += windY;
  let heading = 0, previous = g.track, ticks = 0, peakBank = 0, energy = physicsEnergy(g);
  while (Math.abs(heading) < Math.PI && ticks < 1200) {
    stepFlight(g, input, air, STEP);
    heading += wrap(g.track - previous); previous = g.track;
    peakBank = Math.max(peakBank, Math.abs(g.bank));
    assert.equal(g.stall, 0);
    if (!windY) {
      const next = physicsEnergy(g);
      assert.ok(next <= energy + 0.001, 'a coordinated turn never supplies mechanical energy');
      energy = next;
    }
    ticks++;
  }
  assert.ok(ticks < 1200, 'ordinary digital input completes the turn');
  return { g, seconds: ticks * STEP, height: g.pos.y - 2000, peakBank };
}

test('the manual brake-turn chord carves faster and spends less height than an ordinary turn', () => {
  for (const side of [-1, 1]) {
    const ordinary = halfTurn(side, false), carve = halfTurn(side, true);
    assert.ok(carve.seconds <= ordinary.seconds * 0.95, 'the complete first 180 degrees is faster');
    assert.ok(-carve.height <= -ordinary.height * 0.8, 'the turn loses substantially less altitude');
    assert.ok(carve.peakBank >= 30 * DEG && carve.peakBank <= 37 * DEG);
    assert.ok(ordinary.peakBank >= 35 * DEG && ordinary.peakBank <= 42 * DEG);
    assert.equal(ordinary.g.coordination, 0, 'ordinary steering retains its own response');
    assert.equal(ordinary.g.brake, 0, 'there is no automatic common brake');
    assert.ok(carve.g.coordination > 0.9);
    assert.ok(carve.g.coordinatedLean * side > 0.9);
    assert.ok(carve.g.pilotLean * side > 0.18);
    assert.ok(Math.abs(carve.g.brake - PHYSICS.brake) < 1e-6);
    assert.ok(Math.abs(carve.g.bankTarget * side - 0.52) < 1e-6);
  }
});

test('actual rising air supports a coordinated turn without a map or activity-mode bonus', () => {
  const calm = halfTurn(1, true), weak = halfTurn(1, true, 2), strong = halfTurn(1, true, 3);
  assert.ok(calm.height < -10, 'still-air maneuvering always spends altitude');
  assert.ok(weak.height > -1, 'a continuous 2m/s updraft nearly supports the whole first turn');
  assert.ok(strong.height > 5, 'a strong physical updraft gains height through the turn');
  assert.ok(Math.abs(calm.seconds - strong.seconds) <= STEP);
  assert.ok(Math.abs(strong.height - calm.height - 3 * strong.seconds) < 0.005,
    'height comes from the same moving-air force model');
});

test('coordinated rollout keeps momentum, eases the lean and returns to ordinary trim', () => {
  const { g } = halfTurn(1, true);
  const heading = g.yaw, brake = g.brake, lean = g.pilotLean;
  stepFlight(g, {}, {}, STEP);
  assert.ok(g.coordination > 0.9, 'the configured controller remains through rollout');
  assert.ok(g.yaw > heading, 'release preserves actual angular momentum');
  assert.ok(g.brake < brake && g.pilotLean < lean, 'the released brake and lean ease physically');
  for (let tick = 0; tick < 300; tick++) stepFlight(g, {}, {}, STEP);
  assert.ok(g.coordination < 0.001 && Math.abs(g.pilotLean) < 0.001);
  assert.ok(Math.abs(g.bank) < 5 * DEG);
});

for (const side of [-1, 1]) test(`working-brake circle and held-brake rollout meet handling limits, side ${side}`, t => {
  const { seconds } = halfTurn(side, true);
  assert.ok(seconds <= 8.6, `${seconds}s for the first 180 degrees from settled trim`);
  const g = aloft();
  let radius = 0, sink = 0, energy = physicsEnergy(g);
  for (let tick = 0; tick < 2400; tick++) {
    stepFlight(g, { turn: side, brake: true }, {}, STEP);
    const next = physicsEnergy(g);
    assert.ok(next <= energy + 0.001); energy = next;
    assert.equal(g.stall, 0); assert.equal(g.acro, false);
    if (tick >= 1800) {
      radius += Math.hypot(g.pilot.vel.x, g.pilot.vel.z) / Math.abs(g.trackRate) / 600;
      sink -= g.vy / 600;
    }
  }
  assert.ok(radius >= 18 && radius <= 23, `${radius}m working radius`);
  assert.ok(sink <= 2.3, `${sink}m/s steady still-air sink`);
  let heading = 0, peak = 0, rebound = 0, pitchMin = g.pitch, pitchMax = g.pitch;
  let levelAt = Infinity;
  for (let tick = 0; tick < 600; tick++) {
    stepFlight(g, { brake: true }, {}, STEP);
    heading += g.trackRate * STEP * side;
    peak = Math.max(peak, heading); rebound = Math.max(rebound, peak - heading);
    pitchMin = Math.min(pitchMin, g.pitch); pitchMax = Math.max(pitchMax, g.pitch);
    if (Math.abs(g.bank) < 10 * DEG) levelAt = Math.min(levelAt, (tick + 1) * STEP);
    if (tick >= 89) assert.ok(Math.abs(g.bank) < 10 * DEG, `level within 1.5s and remains level: ${tick}`);
    assert.equal(g.brakeTarget, PHYSICS.brake);
    assert.equal(g.acro, false); assert.equal(g.stall, 0); assert.equal(g.loops, 0);
  }
  assert.ok(levelAt <= 1.5, `${levelAt}s to bank below 10 degrees`);
  assert.ok(rebound <= 5 * DEG, `${rebound / DEG} degrees of track rebound`);
  assert.ok(pitchMax - pitchMin <= 15 * DEG, `${(pitchMax - pitchMin) / DEG} degrees peak-to-peak pitch`);
  t.diagnostic(JSON.stringify({ side, seconds, radius, sink, levelAt, rebound: rebound / DEG, pitchExcursion: (pitchMax - pitchMin) / DEG }));
});

test('easing and reapplying either direction for 0.25–2s preserves normal brake and prompt steering take', () => {
  for (const side of [-1, 1]) for (const gap of [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]) {
    const g = aloft();
    for (let tick = 0; tick < 2400; tick++) stepFlight(g, { turn: side, brake: true }, {}, STEP);
    let heading = 0, peak = 0, pitchMin = g.pitch, pitchMax = g.pitch;
    for (let tick = 0; tick < (gap + 10) / STEP; tick++) {
      const turn = tick < Math.round(gap / STEP) ? 0 : side;
      const previous = g.turn;
      stepFlight(g, { turn, brake: true }, {}, STEP);
      if (turn) {
        const time = PHYSICS.steerTime + (PHYSICS.coordination.steerTime - PHYSICS.steerTime) * g.physical.coordination;
        assert.ok(Math.abs(g.turn - (previous + (side - previous) * STEP / time)) < 1e-12,
          're-pressing uses the original take response immediately');
      }
      heading += g.trackRate * STEP * side; peak = Math.max(peak, heading);
      assert.ok(peak - heading <= 5 * DEG, `gap ${gap}: no large opposite heading correction`);
      pitchMin = Math.min(pitchMin, g.pitch); pitchMax = Math.max(pitchMax, g.pitch);
      assert.ok(Math.abs(g.bank) <= 40 * DEG);
      assert.equal(g.brakeTarget, PHYSICS.brake); assert.equal(g.deepBrake, false); assert.equal(g.acro, false);
      assert.equal(g.stall, 0); assert.equal(g.loops, 0);
    }
    assert.ok(pitchMax - pitchMin <= 15 * DEG, `gap ${gap}: ${(pitchMax - pitchMin) / DEG} degrees pitch`);
    assert.ok(g.trackRate * side > 0.3, 'the original circle resumes');
  }
});

test('air-track rate wraps correctly and copying or settling preserves its meaning independently of the canopy nose', () => {
  const g = aloft(), copied = aloft();
  let crossed = false, distinct = false;
  let previous = g.track;
  for (let tick = 0; tick < 1200; tick++) {
    stepFlight(g, { turn: 1, brake: true }, {}, STEP);
    assert.ok(Math.abs(g.trackRate - wrap(g.track - previous) / STEP) < 1e-12);
    if (g.track < previous - Math.PI) crossed = true;
    distinct ||= Math.abs(g.yawRate - g.trackRate) > 0.1;
    previous = g.track;
  }
  assert.ok(crossed && distinct);
  copyFlight(copied, g); assert.equal(copied.trackRate, g.trackRate);
  for (let tick = 0; tick < 120; tick++) {
    stepFlight(g, { brake: true }, {}, STEP); stepFlight(copied, { brake: true }, {}, STEP);
    assert.equal(copied.trackRate, g.trackRate); assert.deepEqual(copied.pilot, g.pilot);
  }
  settleFlight(g); assert.equal(g.trackRate, 0);
  assert.ok(Math.abs(wrap(g.track - g.yaw)) < 1e-12);
});

test('coordination cannot become an automatic control or survive a canonical reset', () => {
  const g = aloft(), ahead = aloft();
  for (let tick = 0; tick < 180; tick++) stepFlight(g, { turn: -1, brake: true }, {}, STEP);
  copyFlight(ahead, g);
  for (let tick = 0; tick < 300; tick++) {
    const input = { turn: tick < 90 ? 0 : 1, brake: tick >= 90 };
    stepFlight(g, input, {}, STEP); stepFlight(ahead, input, {}, STEP);
  }
  assert.deepEqual(g.pilot, ahead.pilot); assert.deepEqual(g.canopy, ahead.canopy);
  assert.equal(g.coordination, ahead.coordination);
  assert.equal(g.pilotLean, ahead.pilotLean);
  Object.assign(g.pos, { x: 0, y: 2000, z: 0 }); g.yaw = 0; settleFlight(g);
  assert.equal(g.coordination, 0); assert.equal(g.coordinatedLean, 0); assert.equal(g.pilotLean, 0);
  assert.equal(g.brake, 0);
  for (let tick = 0; tick < 120; tick++) stepFlight(g, { turn: 1, bar: true }, {}, STEP);
  assert.equal(g.coordination, 0, 'the bar leaves the energetic flight model available');
});

test('the common brake takes precedence over ineffective simultaneous bar and ears flags', () => {
  const normal = aloft(), chord = aloft();
  for (let tick = 0; tick < 600; tick++) {
    const turn = tick < 300 ? 1 : 0;
    stepFlight(normal, { turn, brake: true }, {}, STEP);
    stepFlight(chord, { turn, brake: true, bar: true, ears: true }, {}, STEP);
  }
  assert.deepEqual(normal.pilot, chord.pilot); assert.deepEqual(normal.canopy, chord.canopy);
  assert.equal(normal.coordination, chord.coordination);
});

test('pitch input starts promptly and the coupled fore-aft cycle remains a natural oscillation', () => {
  const g = aloft(), initialPitch = g.pitch;
  let halfBrake = -1, visiblePitch = -1, release90 = -1, rate = g.pitchRate;
  const fronts = [];
  for (let tick = 0; tick < 2400; tick++) {
    stepFlight(g, { brake: tick < 60 }, {}, STEP);
    if (halfBrake < 0 && g.brake >= 0.2) halfBrake = (tick + 1) * STEP;
    if (visiblePitch < 0 && g.pitch - initialPitch >= 2 * DEG) visiblePitch = (tick + 1) * STEP;
    if (tick >= 60 && release90 < 0 && g.brake <= 0.04) release90 = (tick - 59) * STEP;
    if (rate < 0 && g.pitchRate >= 0) fronts.push((tick + 1) * STEP);
    rate = g.pitchRate;
    assert.equal(g.stall, 0);
  }
  assert.ok(halfBrake >= 0.08 && halfBrake <= 0.12);
  assert.ok(visiblePitch >= 0.35 && visiblePitch <= 0.55);
  assert.ok(release90 > 0 && release90 <= 0.25);
  const cycle = fronts.at(-1) - fronts.at(-2);
  assert.ok(cycle >= 7.5 && cycle <= 8.3, `the forward/back cycle is ${cycle}s`);
});

test('a continuous inversion can be caught across a release window in either direction', () => {
  for (const side of [-1, 1]) for (const release of [560, 600]) {
    const g = aloft();
    let calm = 0, settled = false, energy = physicsEnergy(g);
    for (let tick = 0; tick < 1800; tick++) {
      const entry = tick < release;
      stepFlight(g, { turn: entry ? tick < 285 ? side : -side : 0,
        bar: entry, deepBrake: tick < 12, brake: !entry && g.pitch < 0 }, {}, STEP);
      assert.equal(g.stall, 0);
      const next = physicsEnergy(g);
      assert.ok(next <= energy + 0.001); energy = next;
      calm = Math.abs(g.bank) < 0.26 && Math.abs(g.pitch) < 0.175 && Math.abs(g.pitchRate) < 0.3 ? calm + 1 : 0;
      if (g.loops === 1 && calm >= 60) { settled = true; break; }
    }
    assert.ok(settled, `${side}/${release} completes and settles using real momentum`);
    assert.equal(g.loops, 1);
    assert.ok(2000 - g.pos.y > 60 && 2000 - g.pos.y < 150);
  }
});

test('intentional reference maneuvers use explicit deep input, complete physically and return to ordinary flight', async () => {
  const { createReferencePilot } = await import('./pilots.js');
  const { createSwingWatch } = await import('./swing-watch.js');
  const { createStyle } = await import('./meet-style.js');
  for (const [kind, request] of [[1, { pumps: 2 }], [2, { swaps: 2 }], [3, { loops: 1 }]]) {
    const g = aloft(), watch = createSwingWatch(), style = createStyle(), controls = {};
    const sky = { state: { elapsed: 0, pilot: { collapse: 0 }, thermals: [] }, inside: () => true };
    const world = { g, watch, style, sky, controls, air: { windX: 0, windZ: 0 }, steps: 0 };
    const pilot = createReferencePilot({ tricks: { ...request, from: 0 }, catches: false });
    let deepSeen = false, bankedAt = -1;
    for (let tick = 0; tick < 2400; tick++) {
      pilot.decide(world, controls);
      deepSeen ||= !!controls.deepBrake;
      stepFlight(g, controls, {}, STEP); watch.step(STEP, g, false, controls); style.step(STEP, world);
      world.steps++; sky.state.elapsed = world.steps * STEP;
      assert.equal(g.stall, 0); assert.equal(watch.state.breaks, 0);
      if (style.state.landed && bankedAt < 0) bankedAt = tick;
      if (bankedAt >= 0 && tick >= bankedAt + 600) break;
    }
    assert.ok(deepSeen, 'deliberate maneuvers explicitly request their extra brake travel');
    assert.ok(bankedAt > 0 && bankedAt < 1500);
    assert.equal(watch.state.moveKind, kind); assert.equal(watch.state.moves, 1);
    assert.ok(style.state.total > 0); assert.equal(style.state.lost, 0);
    assert.equal(g.deepBrake, false); assert.equal(g.acro, false, `kind ${kind}: normal authority returns after steady recovery`);
    assert.ok(watch.state.calm >= 1);
  }
});

test('ordinary reference flight clears deep intent from a reused control object', async () => {
  const { createReferencePilot } = await import('./pilots.js');
  const g = aloft(), pilot = createReferencePilot();
  const world = { g, air: {}, sky: { state: { thermals: [], pilot: { collapse: 0 } }, inside: () => true } };
  const intent = { deepBrake: true };
  assert.equal(pilot.decide(world, intent).deepBrake, false);
});
