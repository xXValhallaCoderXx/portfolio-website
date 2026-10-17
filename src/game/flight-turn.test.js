import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlight, copyFlight, settleFlight, stepFlight, physicsEnergy } from './flight.js';

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
    assert.equal(carve.g.manualBrake, carve.g.brake);
    assert.ok(carve.g.bankTarget * side > 0.53 && carve.g.bankTarget * side < 0.60);
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
  assert.equal(g.brake, 0); assert.equal(g.manualBrake, 0);
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
