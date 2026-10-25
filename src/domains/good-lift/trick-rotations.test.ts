import type { FlightInput, FlightState } from '../flight/models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlight } from '../flight/flight.ts';
import { BREAK, LINKS, MOVE } from './trick-tables.ts';
import { pair } from '../../test/helpers/flight-lab.ts';
import { flyTricks, reacting, type TrickLeg } from '../../test/helpers/test-tricks.ts';
import './gliders.ts';

// The rotations on one half (trick-watch.js), flown for real on Good Lift's gliders: SATs out of a
// spiral, helicopters out of a full stall, and spins, which are bails until the wing is saved.
const Q = pair(0.82, 0), E = pair(0, 0.82), SQ = pair(1, 0), SE = pair(0, 1), SS = pair(1), UP = pair(0), S = pair(0.6);
const named = (id: number) => id ? LINKS[id - 1].name : '';
const on = (wing: string) => ({ make: (pos: { x: number; y: number; z: number }) => createFlight(pos, wing) });

/** Lets go, and brakes the surge (S) for a second once the canopy dives ahead. */
function caught(): (g: FlightState, tick: number) => FlightInput {
  let dived = -1;
  return (g, tick) => {
    if (dived < 0 && g.pitch < -0.26 && g.pitchRate < 0) dived = tick;
    return dived >= 0 && tick < dived + 60 ? S : UP;
  };
}

test('a SAT pulled out of a confirmed spiral links as SAT ENTRY with flow, to either side, at any human reaction', () => {
  for (const [turn, full, side] of [[Q, SQ, -1], [E, SE, 1]] as const) for (const delay of [0, 0.15, 0.3]) {
    const { moves, events } = flyTricks([[10, turn], [10, reacting(delay, () => full)], [12, caught()]], on('acro'));
    const sat = moves.find(move => move.move === MOVE.sat);
    assert.ok(sat, `a SAT, ${delay} s late: ${JSON.stringify(moves)}`);
    assert.equal(moves[0].move, MOVE.spiral);
    assert.equal(sat.side, side);
    assert.equal(named(sat.link), 'SAT ENTRY');
    assert.equal(sat.flow, 1);
    assert.ok(sat.band >= 3, `it turns fast: band ${sat.band}`);
    assert.ok(events.filter(event => event.kind === 'unit').length >= 3, 'each turn is a unit');
    assert.equal(events.filter(event => event.kind === 'break').length, 0, 'never a spin');
  }
});

test('a helicopter eased out of a held full stall credits the stall, links as STALL-HELI with flow and counts its turns', () => {
  for (const [eased, side] of [[pair(1, 0.6), -1], [pair(0.6, 1), 1]] as const) {
    const { moves, events } = flyTricks([[8, SS], [10, eased], [2.5, SS], [12, caught()]], on('acro'));
    assert.deepEqual(moves.map(move => move.move), [MOVE.stall, MOVE.heli, MOVE.stall], JSON.stringify(moves));
    const heli = moves[1];
    assert.equal(heli.side, side);
    assert.equal(named(heli.link), 'STALL-HELI');
    assert.equal(heli.flow, 1);
    assert.ok(heli.band >= 2, `it turns flat: band ${heli.band}`);
    assert.ok(events.filter(event => event.kind === 'unit').length >= 3);
    assert.equal(events.filter(event => event.kind === 'break').length, 0, 'the stall back out of it is caught');
  }
});

test('the C and the D fly the helicopter too, eased out of a held full stall with the outer hand anywhere from 0.45 to 0.75', () => {
  for (const wing of ['en-c', 'en-d']) for (const outer of [0.45, 0.6, 0.75]) for (const [eased, side] of [[pair(1, outer), -1], [pair(outer, 1), 1]] as const) {
    const { moves, events } = flyTricks([[8, SS], [10, eased], [2.5, SS], [12, caught()]], on(wing));
    const heli = moves.find(move => move.move === MOVE.heli);
    assert.ok(heli, `${wing} ${outer}: ${JSON.stringify(moves)}`);
    assert.equal(moves[0].move, MOVE.stall, 'the stall it came out of is credited first');
    assert.equal(heli.side, side);
    assert.equal(named(heli.link), 'STALL-HELI');
    assert.equal(events.filter(event => event.kind === 'break').length, 0, `${wing} ${outer}: caught without a bail`);
    if (outer === 0.6) assert.deepEqual(moves.map(move => move.move), [MOVE.stall, MOVE.heli, MOVE.stall], `${wing}: one helicopter`);
  }
});

test('a spin is a bail; the wing is saved once both halves fly and it has flown calmly', () => {
  const spins: [string, TrickLeg[]][] = [
    ['acro', [[3, UP], [4, SQ]]], ['acro', [[8, S], [4, SE]]], ['en-c', [[8, S], [4, SQ]]], ['en-d', [[8, S], [4, SE]]],
  ];
  for (const [wing, legs] of spins) {
    const { events, tricks } = flyTricks([...legs, [12, caught()]], on(wing));
    const breaks = events.filter(event => event.kind === 'break');
    assert.equal(breaks[0]?.reason, BREAK.spin, `${wing}: ${JSON.stringify(events)}`);
    assert.ok(breaks[0].at - legs[0][0] <= 2, `${wing} bails within 2 s of the pull: ${breaks[0].at}`);
    assert.equal(tricks.state.spin, 0, `${wing} is flying again`);
    assert.equal(tricks.state.saved, 1);
    assert.equal(events.filter(event => event.kind === 'move').length, 0, 'nothing in a spin is a move');
  }
});

test('the hands that turn or climb, and the C and the D spiralling with Shift added, never make a rotation', () => {
  const flights: [string, TrickLeg[]][] = [];
  for (const wing of ['en-a', 'en-b', 'en-c', 'en-d', 'acro']) flights.push([wing, [[20, Q]]], [wing, [[30, pair(0.3, 0)]]], [wing, [[30, pair(0.5, 0.2)]]]);
  for (const wing of ['en-c', 'en-d']) flights.push([wing, [[10, Q], [6, SQ], [8, UP]]], [wing, [[3, UP], [6, SQ], [8, UP]]]);
  for (const wing of ['classic', 'en-a', 'en-b']) flights.push([wing, [[8, S], [4, SQ], [8, UP]]]);
  for (const [wing, legs] of flights) {
    const { moves, events, tricks } = flyTricks(legs, on(wing));
    assert.ok(moves.every(move => move.move !== MOVE.sat && move.move !== MOVE.heli), `${wing} ${JSON.stringify(legs)}`);
    assert.ok(events.every(event => event.kind !== 'break' || event.reason !== BREAK.spin), `${wing} ${JSON.stringify(legs)}: no spin`);
    assert.equal(tricks.state.saved, 0);
  }
});

test('the watch says when a SAT or a helicopter can be flown from what the wing is doing', () => {
  const seen = (wing: string, legs: TrickLeg[]) => {
    const ready = new Set<number>();
    flyTricks(legs, { ...on(wing), each: tricks => ready.add(tricks.state.ready) });
    return ready;
  };
  assert.ok(seen('acro', [[12, Q]]).has(1), 'a confirmed spiral: a SAT can be pulled');
  assert.ok(seen('acro', [[8, SS]]).has(2), 'a held full stall: a helicopter can be eased');
  assert.deepEqual([...seen('acro', [[20, pair(0.3, 0)]])], [0]);
});

test('the EN-A\'s wingovers count however they are swung: a steep loaded swing is a wingover\'s, not a spiral\'s, once the hands reverse', () => {
  // Swings steep and loaded enough to begin a spiral that never comes: their tops still pair.
  for (const [first, leg] of [[5, 5.5], [5.5, 5.5], [6, 5], [6, 5.5], [5, 4.5]]) {
    const { moves } = flyTricks([[first, E], [leg, Q], [leg, E], [leg, Q], [6, UP]], on('en-a'));
    assert.ok(moves.some(move => move.move === MOVE.wingover), `${first}/${leg}: ${JSON.stringify(moves)}`);
  }
});
