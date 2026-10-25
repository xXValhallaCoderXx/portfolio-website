import type { FlightInput, FlightState } from '../flight/models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlight, stepFlight } from '../flight/flight.ts';
import { rotate } from '../flight/flight-physics.ts';
import { pair } from '../../test/helpers/flight-lab.ts';
import './gliders.ts';

// Each half's own flow (flight-physics.js's SideFlow), flown in still air on Good Lift's gliders: the
// spins, helicopters and SATs it makes, and where it must make none.
type Hands = FlightInput | ((g: FlightState, tick: number) => FlightInput);
type Leg = [seconds: number, hands: Hands];
const UP = pair(0), S = pair(0.6), SS = pair(1), Q = pair(0.82, 0), SQ = pair(1, 0);
const up = { x: 0, y: 0, z: 0 };
const degrees = (cos: number) => Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;

/** Flies `legs`, watching from `from` s for `span` s: turning, tilt, line, sink and the most either half separated. */
function fly(wing: string, legs: Leg[], from = 0, span = Infinity) {
  const g = createFlight({ x: 0, y: 3000, z: 0 }, wing);
  let tick = 0, steps = 0, turns = 0, tilt = 0, line = 0, sink = 0, onset = -1, separated = 0, tuck = 0, peak = 0, filtered = 0;
  const loads: number[] = [];
  for (const [seconds, hands] of legs) for (let i = 0; i < Math.round(seconds * 60); i++, tick++) {
    stepFlight(g, typeof hands === 'function' ? hands(g, tick) : hands, {}, 1 / 60);
    const s = g.physical, time = (tick + 1) / 60;
    separated = Math.max(separated, s.sepL, s.sepR); tuck = Math.max(tuck, g.tuck);
    if (time <= from || time > from + span) continue;
    if (onset < 0 && Math.abs(g.canopy.omega.y) >= 1.5) onset = time - from;
    rotate(up, g.canopy.q, 0, 1, 0);
    steps += 1; turns += Math.abs(g.canopy.omega.y) / 60 / (2 * Math.PI);
    tilt += degrees(up.y); line += degrees(-s.lineY); sink -= g.vy; peak = Math.max(peak, g.load);
    loads.push(g.load); if (loads.length > 60) loads.shift();
    filtered = Math.max(filtered, loads.reduce((sum, load) => sum + load, 0) / loads.length);
  }
  return { g, onset, turns, tilt: tilt / steps, line: line / steps, sink: sink / steps, separated, tuck, peak, filtered };
}

/** Lets go, and brakes the surge (S) for a second once the canopy dives ahead, `delay` s late. */
function caught(delay: number): Hands {
  let dived = -1;
  return (g, tick) => {
    if (dived < 0 && g.pitch < -0.26 && g.pitchRate < 0) dived = tick;
    return dived >= 0 && tick >= dived + delay * 60 && tick < dived + delay * 60 + 60 ? S : UP;
  };
}

test('the A and the B never stall a half, whatever the hands do', () => {
  for (const wing of ['en-a', 'en-b']) for (const legs of [[[3, UP], [6, SQ]], [[8, S], [4, SQ]], [[6, SS], [8, pair(1, 0.6)]], [[20, Q]], [[20, pair(0.3, 0)]]] as Leg[][])
    assert.equal(fly(wing, legs).separated, 0, `${wing}: ${JSON.stringify(legs.map(([s, h]) => [s, h]))}`);
});

test('the C and the D spin from slow flight only: from trim a full pull spirals', () => {
  for (const wing of ['en-c', 'en-d']) {
    const spin = fly(wing, [[8, S], [4, SQ]], 8, 4);
    assert.ok(spin.onset >= 0 && spin.onset <= 1.2, `${wing} spins within 1.2 s: ${spin.onset}`);
    assert.ok(spin.tilt <= 40, `${wing} spins flat: ${spin.tilt}°`);
    for (const legs of [[[3, UP], [6, SQ]], [[10, pair(0.3, 0)], [4, SQ]], [[20, Q]], [[10, Q], [6, SQ]]] as Leg[][])
      assert.equal(fly(wing, legs).separated, 0, `${wing} keeps both halves: ${JSON.stringify(legs)}`);
  }
});

test('the acro wing spins from any speed, flat and quickly', () => {
  for (const legs of [[[3, UP], [4, SQ]], [[8, S], [4, SQ]], [[8, pair(0.2)], [4, SQ]]] as Leg[][]) {
    const from = legs[0][0], spin = fly('acro', legs, from, 4);
    assert.ok(spin.onset >= 0 && spin.onset <= 1.2, `onset ${spin.onset}`);
    assert.ok(spin.tilt <= 40, `tilt ${spin.tilt}°`);
  }
  assert.equal(fly('acro', [[20, Q]]).separated, 0, 'Q/E never stall a half: their hand stops short of the latch');
});

test('the acro helicopter turns flat out of a backfly with the outer hand anywhere from 0.45 to 0.75', () => {
  for (const outer of [0.45, 0.6, 0.75]) {
    const heli = fly('acro', [[6, SS], [10, pair(1, outer)]], 8, 8);
    assert.ok(heli.turns >= 3, `${outer}: ${heli.turns} turns in 8 s`);
    assert.ok(heli.tilt <= 25, `${outer}: tilt ${heli.tilt}°`);
    assert.ok(heli.sink <= 6.5, `${outer}: sink ${heli.sink} m/s`);
    assert.ok(heli.line <= 20, `${outer}: the pilot hangs nearly under it, ${heli.line}°`);
  }
});

test('the acro SAT swings the pilot out round an axis between pilot and wing, entered firmly but not snatched from a spiral', () => {
  const sat = fly('acro', [[10, Q], [12, SQ]], 12, 10);
  assert.ok(sat.turns >= 5, `${sat.turns} turns in 10 s`);
  assert.ok(sat.line >= 30, `line ${sat.line}°`);
  assert.ok(sat.sink < 6, `sink ${sat.sink} m/s`);
  // Pulled as the spiral is confirmed (about 7.5 s into a Q turn): about 4 g over a second, about 5 at its peak.
  const entry = fly('acro', [[7.5, Q], [3, SQ]], 7.5, 3);
  assert.ok(entry.filtered <= 4.5, `entry load ${entry.filtered} g over a second`);
  assert.ok(entry.peak <= 6, `entry load ${entry.peak} g at its peak`);
});

test('a full stall settles into a slow backfly on every glider: the separated cloth never slides off along its chord', () => {
  for (const wing of ['en-b', 'en-c', 'en-d', 'acro']) {
    const g = createFlight({ x: 0, y: 3000, z: 0 }, wing);
    let back = 0, sink = 0, steps = 0;
    for (let i = 0; i < 12 * 60; i++) {
      stepFlight(g, SS, {}, 1 / 60);
      if (i >= 8 * 60) { back -= g.physical.flow.forward; sink -= g.canopy.vel.y; steps += 1; }
    }
    assert.ok(back / steps > 0 && back / steps < 5, `${wing} backflies at ${back / steps} m/s`);
    assert.ok(sink / steps > 5 && sink / steps < 8, `${wing} sinks at ${sink / steps} m/s`);
  }
});

test('every manoeuvre\'s exit, caught as the canopy dives, opens without a tuck at any human reaction', () => {
  const exits: [string, Leg[]][] = [
    ['en-b', [[8, SS]]], ['en-c', [[8, SS]]], ['en-d', [[8, SS]]], ['acro', [[8, SS]]],
    ['en-c', [[8, S], [4, SQ]]], ['en-d', [[8, S], [4, SQ]]], ['acro', [[8, S], [4, SQ]]],
    ['acro', [[10, Q], [10, SQ]]], ['acro', [[6, SS], [8, pair(1, 0.6)], [2, SS]]],
  ];
  for (const [wing, legs] of exits) for (const delay of [0, 0.15, 0.3]) {
    const exit = fly(wing, [...legs, [12, caught(delay)]]);
    assert.equal(exit.tuck, 0, `${wing} ${JSON.stringify(legs)} caught ${delay} s late`);
    // Open and flying, if (the D swings long) still in its surge.
    assert.ok(['flying', 'exit-surge'].includes(exit.g.wingPhase), `${wing} ${JSON.stringify(legs)} flies again: ${exit.g.wingPhase}`);
    assert.equal(exit.g.physical.sepL + exit.g.physical.sepR, 0);
  }
});

test('the classic wing has no halves of its own: nothing here changes it', () => {
  for (const legs of [[[3, UP], [6, SQ]], [[8, S], [4, SQ]], [[6, SS], [8, pair(1, 0.6)]]] as Leg[][]) {
    const { g, separated } = fly('classic', legs);
    assert.equal(separated, 0);
    assert.equal(g.physical.sideAlphaL, 0);
  }
});
