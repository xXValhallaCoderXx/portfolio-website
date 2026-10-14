import test from 'node:test';
import assert from 'node:assert/strict';
import { LOW, RING_HIGH, fjordHint } from './fjord-hints.js';
import { HINT_HOLD, HINT_WIDTH, holdHint } from './cloudbase-hints.js';

// Gliding high over the fjord well after take-off, with nothing near and nothing to say.
const quiet = {
  stall: 0, stallSide: 0, auto: '', nearArch: false, arch: false, outside: false, nearRing: false, unvisited: false, agl: 120, sinking: true,
  airtime: 60, touch: false,
};
const hint = (facts) => fjordHint({ ...quiet, ...facts });

test('a stalled wing outranks every other line over the fjord too, and a spin says why it spun', () => {
  const everything = { auto: 'forge', arch: true, outside: true, nearRing: true, unvisited: true, agl: 5, airtime: 1 };
  assert.equal(hint({ ...everything, stall: 0.8 }), 'stalled — let go, the wing flies again');
  assert.equal(hint({ ...everything, stall: 0.8, stallSide: 1 }), 'spin — too much brake in the turn, let go');
  assert.equal(hint(everything), 'flying itself to forge · steer to take over');
  assert.equal(hint({ ...everything, auto: '', nearArch: true }), 'past the arch the brake can stall the wing');
  assert.equal(hint({ ...everything, auto: '' }), 'Good Lift → hard right through the arch');
  assert.equal(hint({ ...everything, auto: '', arch: false }), 'the fog turns you back toward the fjord');
});

test('near a ring still to be read, high enough, the line says how to brake down into it, naming the key or the button', () => {
  assert.equal(hint({ nearRing: true, unvisited: true, agl: RING_HIGH + 1 }), 'hold space to brake down into the ring');
  assert.equal(hint({ nearRing: true, unvisited: true, agl: 60, touch: true }), 'hold ▼ to brake down into the ring');
  // Low over it, or over a place already read, nothing is said: not even the red line, which
  // over the fjord would only scare a visitor off the brake they need to come down.
  assert.equal(hint({ nearRing: true, unvisited: true, agl: RING_HIGH }), '');
  assert.equal(hint({ nearRing: true, unvisited: false, agl: 80 }), '');
  assert.equal(hint({ nearRing: true, unvisited: true, agl: 10, airtime: 2 }), '');
});

test('low and sinking says where to climb, and the first twenty seconds teach the pillars and the boost', () => {
  assert.equal(hint({ agl: LOW - 1, sinking: true }), 'low — steer for the amber sparks to climb');
  assert.equal(hint({ agl: LOW - 1, sinking: false }), '');
  assert.equal(hint({ airtime: 3 }), 'lit pillars are places to land · amber sparks are rising air');
  assert.equal(hint({ airtime: 12 }), 'click a pillar to fly there by itself · hold shift to speed up');
  assert.equal(hint({ airtime: 12, touch: true }), 'tap a pillar to fly there by itself · hold » to speed up');
  assert.equal(hint({ airtime: 20 }), '');
});

test('the lines about the brake and the stall fit one line of a narrow phone', () => {
  for (const moment of [{ stall: 1 }, { stall: 1, stallSide: -1 }, { nearArch: true }, { nearRing: true, unvisited: true }, { nearRing: true, unvisited: true, touch: true }]) {
    const line = hint(moment);
    assert.ok(line.length > 0 && [...line].length <= HINT_WIDTH, `"${line}" is ${[...line].length} characters`);
  }
});

test('held on the frame clock, a fjord line stays up long enough to read, but a stall is said at once', () => {
  const held = { line: '', since: 0 };
  assert.equal(holdHint(held, hint({ nearRing: true, unvisited: true }), 30), 'hold space to brake down into the ring');
  assert.equal(holdHint(held, hint({}), 30.5), 'hold space to brake down into the ring');
  assert.equal(holdHint(held, hint({ stall: 1 }), 30.6), 'stalled — let go, the wing flies again');
  assert.equal(holdHint(held, hint({}), 30.6 + HINT_HOLD), '');
});
