import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrickWatch, bandFor, linkFor } from './trick-watch.ts';
import { BREAK, LINKS, MOVE, TRICKS } from './trick-tables.ts';
import { pair } from '../../test/helpers/flight-lab.ts';
import { catchOnce, flyTricks, reacting, type TrickLeg } from '../../test/helpers/test-tricks.ts';
import { arraysMadeBy } from '../../test/helpers/test-alloc.ts';
import { createFlight, stepFlight } from '../flight/flight.ts';
import { createSwingWatch } from '../coaching/swing-watch.ts';

// The moves, flown for real in the classic wing: only observed motion counts.
const Q = pair(0.82, 0), E = pair(0, 0.82), SQ = pair(1, 0), SE = pair(0, 1), UP = pair(0);
const named = (id: number) => LINKS[id - 1].name;

test('bands rise with the measure, or fall where less is better, and links have names and windows', () => {
  assert.equal(bandFor(MOVE.spiral, 199), 0);
  assert.deepEqual([200, 250, 300, 350, 999].map(load => bandFor(MOVE.spiral, load)), [1, 2, 3, 4, 4]);
  assert.deepEqual([76, 75, 60, 45, 30, 5].map(surge => bandFor(MOVE.stall, surge)), [0, 1, 2, 3, 4, 4]);
  assert.equal(bandFor(MOVE.none, 1000), 0);
  assert.ok(TRICKS.every(trick => trick.bands.length === 4));
  assert.equal(named(linkFor(MOVE.wingover, MOVE.spiral, 0)), 'WING-SPIRAL');
  assert.equal(linkFor(MOVE.wingover, MOVE.spiral, 121), 0, 'past its window a move links by no name');
  assert.equal(named(linkFor(MOVE.spiral, MOVE.wingover, 0)), 'SPIRAL EXIT');
  assert.equal(linkFor(MOVE.loop, MOVE.loop, 0), 0, 'a loop into a loop is no named link');
});

test('a held spiral is confirmed after half a turn, counts each turn and is graded by its load', () => {
  for (const [hands, side] of [[Q, -1], [E, 1]] as const) {
    const { moves, events, tricks } = flyTricks([[25, hands], [8, UP]]);
    assert.equal(moves.length, 1);
    assert.equal(moves[0].move, MOVE.spiral);
    assert.equal(moves[0].side, side);
    assert.ok(moves[0].at > 6 && moves[0].at < 10, `confirmed at ${moves[0].at}`);
    assert.ok(events.filter(event => event.kind === 'unit').length >= 2);
    assert.equal(tricks.state.band, 3, 'today\'s wing spirals at about 3.2 g');
  }
});

test('thermal turns, both gentle ones, are never moves and a combo could bank while circling', () => {
  const { moves, tricks } = flyTricks([[40, pair(0.3, 0)], [40, pair(0.5, 0.2)]]);
  assert.equal(moves.length, 0);
  assert.ok(tricks.state.settled >= 180, 'circling at 25–30° counts as settled');
});

test('wingovers swung on time form one move whose units count each reversal', () => {
  const legs: TrickLeg[] = [];
  for (let i = 0; i < 6; i++) legs.push([4.5, i % 2 ? E : Q]);
  legs.push([10, UP]);
  const { moves, events } = flyTricks(legs);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].move, MOVE.wingover);
  assert.ok(events.filter(event => event.kind === 'unit').length >= 3);
  // Out of rhythm, the swing never builds: no top reaches a wingover's.
  const fast: TrickLeg[] = [];
  for (let i = 0; i < 6; i++) fast.push([3.5, i % 2 ? E : Q]);
  assert.ok(flyTricks(fast).moves.length <= 1);
});

test('a wingover held into a spiral links as WING-SPIRAL with flow, from either side, at any human reaction', () => {
  for (const delay of [0, 0.15, 0.3]) {
    for (const [a, b] of [[Q, E], [E, Q]]) {
      const legs: TrickLeg[] = [[4.5, a], [4.5, b], [4.5, a], [15, a], [6, UP]];
      const { moves } = flyTricks(legs.map(([seconds, hands]) => [seconds, reacting(delay, () => hands as ReturnType<typeof pair>)]));
      assert.deepEqual(moves.map(move => move.move), [MOVE.wingover, MOVE.spiral], `${delay}s`);
      assert.equal(named(moves[1].link), 'WING-SPIRAL');
      assert.equal(moves[1].flow, 1);
    }
  }
});

test('a spiral swung out into wingovers links as SPIRAL EXIT with flow', () => {
  const { moves } = flyTricks([[15, Q], [4.5, E], [4.5, Q], [4.5, E], [8, UP]]);
  assert.deepEqual(moves.map(move => move.move), [MOVE.spiral, MOVE.wingover]);
  assert.equal(named(moves[1].link), 'SPIRAL EXIT');
  assert.equal(moves[1].flow, 1);
});

test('a full pull out of a wingover\'s swing is an asymmetric spiral', () => {
  const { moves } = flyTricks([[4.5, Q], [4.5, E], [4.5, Q], [15, SQ], [8, UP]]);
  assert.deepEqual(moves.map(move => move.move), [MOVE.wingover, MOVE.asym]);
  assert.equal(named(moves[1].link), 'WING-SPIRAL');
});

test('full pulls swung over the top are loops, each its own move, to the side they went round', () => {
  const legs: TrickLeg[] = [];
  for (let i = 0; i < 5; i++) legs.push([4.5, i % 2 ? SE : SQ]);
  const { moves } = flyTricks(legs);
  const loops = moves.filter(move => move.move === MOVE.loop);
  assert.ok(loops.length >= 2);
  assert.ok(loops.every(loop => loop.side === loops[0].side && loop.band >= 1));
});

test('a deliberate full stall caught as it surges is a move; left to surge, it folds and bails', () => {
  const caught = flyTricks([[5, pair(1)], [14, catchOnce(-0.4, 50, 1)], [6, UP]]);
  assert.deepEqual(caught.moves.map(move => move.move), [MOVE.stall]);
  assert.equal(caught.events.filter(event => event.kind === 'break').length, 0, 'a stall asked for breaks nothing');
  const dropped = flyTricks([[5, pair(1)], [10, UP]]);
  assert.equal(dropped.moves.length, 0);
  assert.deepEqual(dropped.events.filter(event => event.kind === 'break').map(event => event.reason), [BREAK.tuck]);
  // A stall nobody asked for (one deep hand, the other at working depth) is a bail as it begins.
  const lopsided = flyTricks([[6, pair(1, 0.6)], [6, UP]]);
  assert.ok(lopsided.events.some(event => event.kind === 'break' && event.reason === BREAK.stall) || lopsided.tricks.state.breaks === 0);
});

test('a full stall held until READY and settled, let up and every dive caught at working brake, is a move at any human reaction', () => {
  // As Training's lesson coaches it (direct-acro-guide.js): both hands fully down until the watch has
  // the stall held and the wing has stopped pitching, both up, and working brake on each dive until
  // the wing comes back.
  for (const delay of [0, 0.15, 0.3]) {
    let held = false, up = false, catching = false;
    const { moves, events } = flyTricks([[25, reacting(delay, (g) => {
      if (!up && held && Math.abs(g.pitch) < 0.17 && Math.abs(g.pitchRate) < 0.2) up = true;
      if (catching && g.pitch >= 0) catching = false;
      else if (up && g.pitch < -0.35 && g.pitchRate < 0) catching = true;
      return pair(!up ? 1 : catching ? 0.6 : 0);
    })]], { each: (tricks) => { held ||= tricks.state.ready === 2; } });
    assert.ok(moves.some(move => move.move === MOVE.stall), `${delay}s: ${JSON.stringify(moves)}`);
    assert.equal(events.filter(event => event.kind === 'break').length, 0, `${delay}s: nothing folds`);
  }
});

test('strikes break a move off, and the watch never writes to the flight or allocates as it watches', () => {
  const { events } = flyTricks([[12, Q]], { struckAt: 600 });
  assert.ok(events.some(event => event.kind === 'break' && event.reason === BREAK.strike));
  const g = createFlight({ x: 0, y: 3000, z: 0 }), swing = createSwingWatch(), tricks = createTrickWatch();
  for (let i = 0; i < 300; i++) { stepFlight(g, Q, {}, 1 / 60); swing.step(1 / 60, g, false, Q); tricks.step(g, Q, false, swing.state); }
  const before = JSON.stringify({ pilot: g.pilot, canopy: g.canopy, physical: { ...g.physical, work: null } });
  assert.equal(arraysMadeBy(() => { for (let i = 0; i < 600; i++) tricks.step(g, Q, false, swing.state); }), 0);
  assert.equal(JSON.stringify({ pilot: g.pilot, canopy: g.canopy, physical: { ...g.physical, work: null } }), before);
});

test('mirrored flights see mirrored moves', () => {
  const left = flyTricks([[4.5, Q], [4.5, E], [4.5, Q], [15, Q], [6, UP]]).moves;
  const right = flyTricks([[4.5, E], [4.5, Q], [4.5, E], [15, E], [6, UP]]).moves;
  assert.deepEqual(left.map(move => [move.move, move.band, move.link, move.flow]), right.map(move => [move.move, move.band, move.link, move.flow]));
  assert.deepEqual(left.map(move => move.side), right.map(move => move.side === 0 ? 0 : -move.side));
});
