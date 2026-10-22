import test from 'node:test';
import assert from 'node:assert/strict';
import { PHYSICS, WING } from '../flight/flight.ts';
import { STYLE } from './meet-style.ts';
import { DIRECT_STEP, createDirectFlight, createDirectCatch, directBrakes } from '../../test/helpers/test-direct-flight.ts';

const DEG = Math.PI / 180;
const sides = [-1, 1];
const delays = [0, 0.1, 0.2, 0.3];
const sidePull = (side: number, amount: number) => side < 0 ? directBrakes(amount, 0) : directBrakes(0, amount);

function clean(flight: ReturnType<typeof createDirectFlight>) {
  assert.equal(flight.stats.stalls, 0);
  assert.equal(flight.stats.tucks, 0);
  assert.equal(flight.watch.state.breaks, 0);
  assert.equal(flight.g.wingPhase, WING.flying);
  assert.ok(flight.stats.maxEnergyGain <= 0.001, 'brake travel never supplies mechanical energy');
  assert.equal(flight.g.bankTarget, 0, 'all motion comes from independent physical brakes');
  assert.equal(flight.g.coordination, 0);
}

for (const side of sides) for (const delay of delays)
  test(`an actual spiral 360 recovers and banks once, side ${side}, ${delay}s reactions`, () => {
    const flight = createDirectFlight(), recover = createDirectCatch(delay);
    let releaseAt: number | null = null;
    for (let tick = 0; tick < 30 / DIRECT_STEP && flight.style.state.landed === 0; tick++) {
      if (releaseAt === null && flight.watch.state.spirals > 0) releaseAt = tick + Math.round(delay / DIRECT_STEP);
      flight.step(releaseAt === null || tick < releaseAt ? sidePull(side, .82) : recover(flight.g, tick));
    }
    assert.deepEqual(flight.stats.moves.map(move => move.kind), [4]);
    assert.equal(flight.g.loops, 0);
    assert.equal(flight.style.state.total, STYLE.spiral);
    assert.equal(flight.style.state.landed, 1);
    assert.equal(flight.style.state.lost, 0);
    assert.equal(flight.style.state.pitch, 0);
    assert.ok(flight.stats.minimumHeight > 1800, 'the taught spiral and recovery cost under 200m');
    assert.ok(flight.watch.state.calm >= STYLE.settle - 1e-9);
    clean(flight);
  });

for (const side of sides) for (const delay of delays)
  test(`a physical spiral links fresh wingovers into one bank, side ${side}, ${delay}s reactions`, () => {
    const flight = createDirectFlight(), recover = createDirectCatch(delay);
    let reverseAt: number | null = null;
    for (let tick = 0; tick < 45 / DIRECT_STEP && flight.style.state.landed === 0; tick++) {
      if (reverseAt === null && flight.watch.state.spirals > 0) reverseAt = tick + Math.round(delay / DIRECT_STEP);
      const elapsed = reverseAt === null ? -1 : (tick - reverseAt) * DIRECT_STEP;
      const direction = Math.floor(elapsed / 4.5) % 2 ? side : -side;
      flight.step(elapsed < 0 ? sidePull(side, .82) : elapsed < 20 ? sidePull(direction, .82) : recover(flight.g, tick));
      if (elapsed < 20) assert.equal(flight.style.state.total, 0, 'the mixed sequence stays in hand');
    }
    assert.deepEqual(flight.stats.moves.map(move => move.kind), [4, 2, 2]);
    assert.ok(flight.stats.moves[1].time - flight.stats.moves[0].time > 8, 'both wingover tops are new physical motion');
    assert.equal(flight.g.loops, 0);
    assert.equal(flight.style.state.landed, 1);
    assert.equal(flight.style.state.lost, 0);
    assert.equal(flight.style.state.lastCombo.moves, 3);
    assert.equal(flight.style.state.lastCombo.mask, 10);
    assert.equal(flight.style.state.lastCombo.variety, STYLE.variety);
    assert.equal(flight.style.state.total, flight.style.state.lastCombo.base + STYLE.variety);
    assert.deepEqual(flight.style.state.lastCombo.sequence, [4, 2, 2]);
    assert.ok(flight.stats.minimumHeight > 1700, 'linking moves spends altitude without adding energy');
    clean(flight);
  });

for (const side of sides) test(`ordinary canonical pulls settle without rebound or accidental style, side ${side}`, () => {
  const flight = createDirectFlight();
  // Use the same rounded .30 demand as the browser. One extra tenth of a second accommodates
  // its nearest-byte rounding without changing ordinary aerodynamic handling.
  for (let tick = 0; tick < 60 / DIRECT_STEP; tick++) flight.step(sidePull(side, 0.3));
  assert.ok(flight.stats.peakBank < 30 * DEG);
  for (let tick = 0; tick < 5.1 / DIRECT_STEP; tick++) {
    flight.step(directBrakes());
    assert.ok(flight.g.bank * side >= -1 * DEG, 'release cannot rebound into the opposite turn');
  }
  assert.ok(Math.abs(flight.g.bank) < 10 * DEG);
  assert.equal(flight.watch.state.moves, 0);
  assert.equal(flight.style.state.total, 0);
  clean(flight);
});

test('actual thermal circles travel through full 360s without earning spiral style', () => {
  for (const side of sides) for (const [inside, outside] of [[.5, .2], [.6, .3], [.6, .2]]) {
    const flight = createDirectFlight();
    let previous = flight.g.track, arc = 0;
    for (let tick = 0; tick < 60 / DIRECT_STEP; tick++) {
      flight.step(side < 0 ? directBrakes(inside, outside) : directBrakes(outside, inside));
      arc += Math.atan2(Math.sin(flight.g.track - previous), Math.cos(flight.g.track - previous));
      previous = flight.g.track;
    }
    assert.ok(Math.abs(arc) > 2 * Math.PI, 'the actual pilot course completes a full circle');
    assert.equal(flight.watch.state.moves, 0);
    assert.equal(flight.watch.state.spirals, 0);
    assert.equal(flight.style.state.total + flight.style.state.pending, 0);
    clean(flight);
  }
});

test('prolonged same-side travel earns only a deliberate spiral, and rapid reversals manufacture no moves', () => {
  for (const side of sides) for (const amount of [0.2, 0.5, 2 / 3, 0.82, 1]) {
    const flight = createDirectFlight();
    for (let tick = 0; tick < 60 / DIRECT_STEP; tick++) flight.step(sidePull(side, amount));
    for (let tick = 0; tick < 15 / DIRECT_STEP; tick++) flight.step(directBrakes());
    const spiral = amount === .82;
    assert.equal(flight.watch.state.moves, spiral ? 1 : 0, `holding ${amount} on side ${side} can only complete one deliberate spiral`);
    assert.deepEqual(flight.stats.moves.map(move => move.kind), spiral ? [4] : []);
    assert.equal(flight.g.loops, 0);
    assert.equal(flight.style.state.total + flight.style.state.pending, spiral ? STYLE.spiral : 0);
    clean(flight);
  }
  const flight = createDirectFlight();
  for (let tick = 0; tick < 30 / DIRECT_STEP; tick++) flight.step(sidePull(Math.floor(tick / 15) % 2 ? 1 : -1, 1));
  for (let tick = 0; tick < 15 / DIRECT_STEP; tick++) flight.step(directBrakes());
  assert.equal(flight.watch.state.moves, 0, 'quarter-second button mashing completes no physical swing');
  assert.equal(flight.g.loops, 0);
  assert.equal(flight.style.state.total, 0);
  clean(flight);
});

for (const delay of delays) test(`phase-based working-brake pitch catches and banks with ${delay}s reactions`, () => {
  const flight = createDirectFlight(), recover = createDirectCatch(delay);
  let phase = 'setup', input = directBrakes(0.6);
  let pending: { at: number; phase: string; amount: number } | null = null;
  for (let tick = 0; tick < 30 / DIRECT_STEP && flight.style.state.landed === 0; tick++) {
    if (pending && tick >= pending.at) {
      input = directBrakes(pending.amount); phase = pending.phase; pending = null;
    }
    if (!pending) {
      let next: { phase: string; amount: number } | null = null;
      if (phase === 'setup' && flight.g.pitch > 0.15 && flight.g.pitchRate <= 0)
        next = { phase: 'first-front', amount: 0 };
      else if (phase === 'first-front' && flight.watch.state.fronts >= 1)
        next = { phase: 'pump', amount: 0.6 };
      else if (phase === 'pump' && flight.g.pitch > 0 && flight.g.pitchRate <= 0)
        next = { phase: 'second-front', amount: 0 };
      else if (phase === 'second-front' && flight.g.pitch < -0.35 && flight.g.pitchRate < 0)
        next = { phase: 'catch', amount: 0.6 };
      else if (phase === 'catch' && flight.g.pitch >= 0)
        next = { phase: 'recover', amount: 0 };
      if (next) pending = { ...next, at: tick + Math.round(delay / DIRECT_STEP) };
    }
    flight.step(phase === 'recover' ? recover(flight.g, tick) : input);
  }
  assert.equal(flight.watch.state.moves, 1);
  assert.deepEqual(flight.stats.moves.map(move => move.kind), [1]);
  assert.equal(flight.style.state.landed, 1);
  assert.equal(flight.style.state.total, STYLE.points[0]);
  assert.equal(flight.style.state.lost, 0);
  assert.ok(flight.stats.steps * DIRECT_STEP < 15);
  assert.ok(flight.stats.minimumHeight < 1990 && flight.stats.minimumHeight > 1965);
  assert.equal(flight.g.acro, false, 'ordinary working travel is sufficient for an introductory pitch');
  clean(flight);
});

for (const delay of delays) test(`three physical pitches link before a single style bank with ${delay}s reactions`, () => {
  const flight = createDirectFlight(), recover = createDirectCatch(delay);
  let phase = 'setup', input = directBrakes(0.6), seen = 0, mostPending = 0;
  let pending: { at: number; phase: string; amount: number } | null = null;
  for (let tick = 0; tick < 40 / DIRECT_STEP && flight.style.state.landed === 0; tick++) {
    if (pending && tick >= pending.at) {
      input = directBrakes(pending.amount); phase = pending.phase; pending = null;
    }
    if (!pending) {
      let next: { phase: string; amount: number } | null = null;
      if (phase === 'setup' && flight.g.pitch > 0.15 && flight.g.pitchRate <= 0)
        next = { phase: 'first-front', amount: 0 };
      else if (phase === 'first-front' && flight.watch.state.fronts >= 1)
        next = { phase: 'pump', amount: 0.6 };
      else if (phase === 'pump' && flight.g.pitch > 0 && flight.g.pitchRate <= 0)
        next = { phase: 'forward', amount: 0 };
      else if (phase === 'forward' && flight.g.pitch < -0.35 && flight.g.pitchRate < 0)
        next = { phase: 'catch', amount: 0.6 };
      else if (phase === 'catch' && flight.watch.state.moves > seen) {
        seen = flight.watch.state.moves;
        next = { phase: seen >= 3 ? 'recover' : 'link-release', amount: 0 };
      } else if (phase === 'link-release' && flight.g.pitch >= -0.34 && flight.g.pitchRate > 0)
        next = { phase: 'pump', amount: 0.6 };
      if (next) pending = { ...next, at: tick + Math.round(delay / DIRECT_STEP) };
    }
    flight.step(phase === 'recover' ? recover(flight.g, tick) : input);
    mostPending = Math.max(mostPending, flight.style.state.elements);
    if (phase !== 'recover') assert.equal(flight.style.state.total, 0, 'active physical rhythm keeps the set in hand');
  }
  assert.equal(flight.watch.state.moves, 3);
  assert.deepEqual(flight.stats.moves.map(move => move.kind), [1, 1, 1]);
  assert.equal(mostPending, 3);
  assert.equal(flight.style.state.landed, 1);
  assert.equal(flight.style.state.total, 35);
  assert.equal(flight.style.state.lost, 0);
  assert.ok(flight.stats.minimumHeight > 1940 && flight.stats.minimumHeight < 1970);
  assert.ok(flight.stats.steps * DIRECT_STEP < 30);
  clean(flight);
});

for (const side of sides) for (const delay of delays)
  test(`independent deep pulls chain three wingovers, side ${side}, ${delay}s reversal/catch reactions`, () => {
    const flight = createDirectFlight(), recover = createDirectCatch(delay);
    // Each reversal can arrive .3 seconds late and still completes three observed cycles.
    const halfCycle = Math.round((4.5 + delay) / DIRECT_STEP);
    for (let tick = 0; tick < 60 / DIRECT_STEP && flight.style.state.landed === 0; tick++) {
      const turning = tick < 30 / DIRECT_STEP;
      const direction = Math.floor(tick / halfCycle) % 2 ? -side : side;
      flight.step(turning ? sidePull(direction, 0.82) : recover(flight.g, tick));
    }
    assert.equal(flight.g.loops, 0, 'working wingovers do not unexpectedly invert');
    assert.equal(flight.watch.state.moves, 3);
    assert.deepEqual(flight.stats.moves.map(move => move.kind), [2, 2, 2]);
    assert.equal(flight.style.state.landed, 1);
    assert.equal(flight.style.state.wingovers, 3);
    assert.ok(flight.style.state.total >= 35, 'three linked elements earn more than three separate first-band moves');
    assert.equal(flight.style.state.lost, 0);
    assert.ok(flight.stats.peakBank >= 58 * DEG && flight.stats.peakBank < 80 * DEG);
    assert.ok(flight.stats.minimumHeight > 1800 && flight.stats.minimumHeight < 1950);
    clean(flight);
  });

for (const side of sides) for (const delay of delays)
  test(`independent full pulls complete and recover a geometric loop, side ${side}, ${delay}s reactions`, () => {
    const flight = createDirectFlight(), recover = createDirectCatch(delay);
    const first = Math.round((4.75 + delay) / DIRECT_STEP);
    const second = Math.round((4.7 + delay) / DIRECT_STEP);
    for (let tick = 0; tick < 35 / DIRECT_STEP && flight.style.state.landed === 0; tick++) {
      flight.step(tick < first ? sidePull(side, 1)
        : tick < first + second ? sidePull(-side, 1) : recover(flight.g, tick));
    }
    assert.equal(flight.g.loops, 1);
    assert.ok(Math.abs(flight.g.physical.lastOrbitAngle) >= 2 * Math.PI);
    assert.ok(flight.g.physical.lastOrbitProjection >= Math.sqrt(1 - PHYSICS.orbit.maxOffPlane ** 2));
    assert.deepEqual(flight.stats.moves.map(move => move.kind), [3], 'the orbit cannot also score its run-up as wingovers');
    assert.equal(flight.style.state.landed, 1);
    assert.equal(flight.style.state.total, STYLE.loop);
    assert.equal(flight.style.state.lost, 0);
    assert.ok(flight.stats.steps * DIRECT_STEP < 25);
    assert.ok(flight.stats.minimumHeight > 1800 && flight.stats.minimumHeight < 1950);
    assert.ok(flight.watch.state.calm >= STYLE.settle - 1e-9);
    for (let tick = 0; tick < 10 / DIRECT_STEP; tick++) flight.step(directBrakes());
    assert.equal(flight.g.loops, 1, 'a recovered loop cannot continue tumbling after release');
    assert.equal(flight.watch.state.moves, 1);
    assert.equal(flight.style.state.total, STYLE.loop);
    clean(flight);
  });

for (const side of sides) for (const delay of delays)
  test(`a physical pitch, wingover and loop share one mixed style bank, side ${side}, ${delay}s pitch/catch reactions`, () => {
    const flight = createDirectFlight(), recover = createDirectCatch(delay);
    let phase = 'setup', input = directBrakes(0.6), wingAt: number | null = null, loopAt: number | null = null, loopSide = side;
    let pending: { at: number; phase: string; amount: number } | null = null;
    for (let tick = 0; tick < 55 / DIRECT_STEP && flight.style.state.landed === 0; tick++) {
      if (pending && tick >= pending.at) {
        input = directBrakes(pending.amount); phase = pending.phase; pending = null;
      }
      if (wingAt === null) {
        if (!pending) {
          let next: { phase: string; amount: number } | null = null;
          if (phase === 'setup' && flight.g.pitch > 0.15 && flight.g.pitchRate <= 0)
            next = { phase: 'first-front', amount: 0 };
          else if (phase === 'first-front' && flight.watch.state.fronts >= 1)
            next = { phase: 'pump', amount: 0.6 };
          else if (phase === 'pump' && flight.g.pitch > 0 && flight.g.pitchRate <= 0)
            next = { phase: 'forward', amount: 0 };
          else if (phase === 'forward' && flight.g.pitch < -0.35 && flight.g.pitchRate < 0)
            next = { phase: 'catch', amount: 0.6 };
          if (next) pending = { ...next, at: tick + Math.round(delay / DIRECT_STEP) };
        }
        if (flight.watch.state.moves > 0) wingAt = tick;
      }
      if (wingAt !== null && loopAt === null) {
        input = sidePull(Math.floor((tick - wingAt) / (4.5 / DIRECT_STEP)) % 2 ? -side : side, 0.82);
        if (flight.watch.state.moveKind === 2) {
          loopAt = tick; loopSide = -Math.sign(flight.g.bank);
        }
      }
      if (loopAt !== null) {
        const elapsed = (tick - loopAt) * DIRECT_STEP;
        input = elapsed < 10.25 ? sidePull(elapsed < 5.5 ? loopSide : -loopSide, 1) : recover(flight.g, tick);
      }
      flight.step(input);
      if (flight.style.state.total > 0) assert.equal(flight.watch.state.moveKind, 3, 'the entire mixed set remains pending through its final maneuver');
    }
    assert.deepEqual(flight.stats.moves.map(move => move.kind), [1, 2, 3]);
    assert.equal(flight.g.loops, 1);
    assert.equal(flight.style.state.landed, 1);
    assert.equal(flight.style.state.lost, 0);
    assert.ok(flight.style.state.total >= 120, 'the third completed element receives the existing linked multiplier');
    assert.ok(flight.stats.minimumHeight > 1780 && flight.stats.minimumHeight < 1850);
    assert.ok(flight.stats.steps * DIRECT_STEP < 45);
    clean(flight);
  });
