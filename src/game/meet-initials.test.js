import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKED, FUTHARK, RUNES, isBlocked, runesOf } from './meet-initials.js';

test('the Elder Futhark is its own 24 runes, in its own order', () => {
  // U+16A0 fehu to U+16DF othala: f u þ a r k g w h n i j ï p z s t b e m l ŋ d o.
  assert.deepEqual(
    FUTHARK.map((rune) => rune.codePointAt(0)),
    [0x16a0, 0x16a2, 0x16a6, 0x16a8, 0x16b1, 0x16b2, 0x16b7, 0x16b9, 0x16ba, 0x16be, 0x16c1, 0x16c3, 0x16c7, 0x16c8, 0x16c9, 0x16ca, 0x16cf, 0x16d2, 0x16d6, 0x16d7, 0x16da, 0x16dc, 0x16de, 0x16df],
  );
});

test('every capital A to Z is written with runes of the Elder Futhark, by its sound, and X alone with two', () => {
  assert.deepEqual(Object.keys(RUNES), [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']);
  assert.equal(Object.values(RUNES).join(' '), 'ᚨ ᛒ ᚲ ᛞ ᛖ ᚠ ᚷ ᚺ ᛁ ᛃ ᚲ ᛚ ᛗ ᚾ ᛟ ᛈ ᚲ ᚱ ᛊ ᛏ ᚢ ᚹ ᚹ ᚲᛊ ᛃ ᛉ');
  for (const [letter, runes] of Object.entries(RUNES)) {
    assert.ok([...runes].every((rune) => FUTHARK.includes(rune)), letter);
    assert.equal([...runes].length, letter === 'X' ? 2 : 1, letter);
  }
  // The row had no letter of its own for C, Q, V or Y: they share the runes of the sounds they make.
  assert.deepEqual([RUNES.C, RUNES.Q], [RUNES.K, RUNES.K]);
  assert.equal(RUNES.V, RUNES.W);
  assert.equal(RUNES.Y, RUNES.J);
  assert.equal(RUNES.X, RUNES.K + RUNES.S);
});

test('initials are written in runes letter by letter, ᚱᛖᚾ over REN', () => {
  assert.deepEqual(runesOf('REN'), ['ᚱ', 'ᛖ', 'ᚾ']);
  assert.equal(runesOf('TST').join(''), 'ᛏᛊᛏ');
  assert.deepEqual(runesOf('AXE'), ['ᚨ', 'ᚲᛊ', 'ᛖ']);
  assert.deepEqual(runesOf(''), []);
  // A character that is no capital A to Z has no rune, and what is not text has no letters at all.
  assert.deepEqual(runesOf('r3_'), ['', '', '']);
  for (const nonsense of [null, undefined, 7, ['R']]) assert.deepEqual(runesOf(nonsense), []);
});

test('the blocklist is short and readable, three capitals each, and refuses only what is on it', () => {
  assert.ok(BLOCKED.length >= 10 && BLOCKED.length <= 30, `${BLOCKED.length} on it`);
  for (const initials of BLOCKED) {
    assert.match(initials, /^[A-Z]{3}$/);
    assert.equal(isBlocked(initials), true, initials);
  }
  assert.equal(new Set(BLOCKED).size, BLOCKED.length, 'each once');
  assert.deepEqual([...BLOCKED].sort(), [...BLOCKED], 'in alphabetical order, to be read');
  // A word for who someone is is no insult; it takes capitals, as the store hands it them.
  for (const fine of ['REN', 'TST', 'GAY', 'JEW', '', 'ass']) assert.equal(isBlocked(fine), false, fine);
});
