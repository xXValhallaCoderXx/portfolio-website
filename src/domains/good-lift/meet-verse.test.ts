import type { VerseSheet } from './meet-verse.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { VERSE, VERSES, count, times, verseFor, wordsOf } from './meet-verse.ts';
import { THOUSAND_POUNDS, kilos, metres } from './meet-card.ts';
import { TST, createReferencePilot, flyPilot } from './pilots.ts';
import { createRunWorld, startRun } from './run-step.ts';
import { createCloudbaseRun } from './cloudbase-state.ts';
import { createMeet } from './meet-state.ts';
import { createBells } from './bells.ts';
import { summariseRun } from './meet-sheet.ts';

// A lift as the meet keeps one: good with no more than one red light.
const lift = (line: number, red = 0, double = false) => ({ line, kg: 25, red, good: (red & (red - 1)) === 0, double, at: 0 });
// A sheet as summariseRun writes one: a fog run of two lines, one with a red light, that did nothing
// of note (no strike, no kettlebell, no close call, no rep to depth, no lift under the horn).
const sheet = (fields = {}, stats = {}) => ({
  seed: 7, reason: 'fog', steps: 8_000, seconds: 133, total: 75, peak: 640,
  lifts: [lift(250), lift(500, 4), lift(0)],
  stats: { strikes: 0, stalls: 0, cloud: 3, reps: 1, deep: 0, trails: 2, close: 0, thrown: 0, dodged: 0, hits: 0, ...stats },
  trace: { alt: [], fog: [], total: [], n: 0 },
  ...fields,
});
const idOf = (run: VerseSheet) => VERSES.find((verse) => verse.line(wordsOf(run)) === verseFor(run))?.id;

test('counts and how-oftens are said as a poem says them, in words while they are small', () => {
  assert.deepEqual([0, 1, 2, 3, 12, 13, 40].map(count), ['no', 'one', 'two', 'three', 'twelve', '13', '40']);
  assert.deepEqual([1, 2, 3, 12, 16].map(times), ['once', 'twice', 'three times', 'twelve times', '16 times']);
});

test('every line is 60 to 120 characters long, whatever numbers a run brings to it', () => {
  assert.deepEqual(VERSE, { shortest: 60, longest: 120 });
  const words = (n: number, total: string, peak: string) => ({ total, peak, lifts: count(n), deep: count(n), thrown: times(n), strikes: times(n), close: times(n) });
  // From a run with the least of everything to one with more than any run has.
  const shortest = words(1, kilos(0), metres(80));
  const longest = [words(12, kilos(9_999.5), metres(9_999)), words(16, kilos(9_999.5), metres(9_999))];
  for (const verse of VERSES) {
    for (const n of [shortest, ...longest]) {
      const line = verse.line(n);
      assert.ok(line.length >= VERSE.shortest && line.length <= VERSE.longest, `${verse.id}: ${line.length} characters: ${line}`);
    }
  }
});

test('every line speaks to the pilot, says what the run came to, and names nobody', () => {
  const n = wordsOf(sheet({ total: 512.5, peak: 1412 }, { strikes: 2, thrown: 3, close: 1, deep: 3 }));
  for (const verse of VERSES) {
    const line = verse.line(n);
    assert.match(line, /\byou(r)?\b/i, verse.id);
    assert.ok(line.includes('512.5 kg') || line.includes('1,412 m'), `${verse.id}: ${line}`);
    assert.doesNotMatch(line, /\b(Renate|Gouveia|REN)\b/, verse.id);
    assert.match(line, /^[A-Z].*\.$/, `${verse.id} is one sentence`);
  }
  assert.equal(new Set(VERSES.map((verse) => verse.id)).size, VERSES.length);
});

test('a run is given a line from the first tier that has one to fit it', () => {
  // Nothing of note: how it ended.
  assert.ok(['mist', 'tide'].includes(idOf(sheet())!));
  assert.equal(idOf(sheet({ reason: 'landed' })), 'hillside');
  // Something of note outweighs the ending, and something few runs do outweighs that.
  const horn = sheet({ lifts: [lift(250), lift(500, 4), lift(750, 0, true), lift(0)] });
  assert.equal(idOf(horn), 'horn');
  assert.equal(idOf({ ...horn, total: THOUSAND_POUNDS }), 'club');
  assert.equal(idOf({ ...horn, stats: { ...horn.stats, thrown: 3 } }), 'unstruck');
  assert.equal(idOf(sheet({ lifts: [lift(250), lift(500), lift(750), lift(0)] })), 'clean');
  assert.equal(idOf(sheet({}, { deep: 2 })), 'depth');
  assert.equal(idOf(sheet({}, { strikes: 1, thrown: 1, hits: 1 })), 'struck');
  assert.ok(['close', 'unstruck'].includes(idOf(sheet({}, { close: 1, thrown: 2 }))!));
});

test('a run the sky judged that banked nothing is told the iron waits for it, and never sung 0 kg', () => {
  // Every lift called no lift: two red lights at the line, and at the mist.
  const empty = (fields = {}, stats = {}) => sheet({ total: 0, lifts: [lift(250, 3), lift(0, 5)], ...fields }, stats);
  for (const run of [empty(), empty({ reason: 'landed' }), empty({}, { thrown: 3, dodged: 3 }), empty({}, { close: 2, thrown: 2 })]) {
    assert.equal(idOf(run)!, 'empty', JSON.stringify(run.stats));
  }
  // What it did of note still outweighs it, where that says nothing of kilos.
  assert.equal(idOf(empty({}, { deep: 2 })), 'depth');
  // On any sky, however it ended and whatever came at it.
  for (let seed = 0; seed < 20; seed++) {
    const runs = [
      empty({ seed }), empty({ seed, reason: 'landed' }), empty({ seed, reason: 'quit' }), empty({ seed, lifts: [lift(0, 3)] }),
      empty({ seed }, { thrown: 3 }), empty({ seed }, { close: 1, thrown: 1 }), empty({ seed }, { strikes: 1, thrown: 1 }),
    ];
    for (const run of runs) assert.doesNotMatch(verseFor(run), /\b0 kg/, verseFor(run));
  }
});

test('a run its pilot ended, or one that judged no line, is given the one line written for it', () => {
  for (const run of [sheet({ reason: 'quit' }), sheet({ reason: 'quit', total: THOUSAND_POUNDS }, { strikes: 3, deep: 4 }), sheet({ reason: 'quit', lifts: [] })]) {
    assert.equal(idOf(run)!, 'set-down');
  }
  for (const reason of ['fog', 'landed']) assert.equal(idOf(sheet({ reason, lifts: [lift(0)], peak: 180, total: 25 })), 'stair', reason);
});

test('the same run is always given the same line, and runs of one kind are given different ones', () => {
  const plain = sheet();
  assert.equal(verseFor(plain), verseFor(structuredClone(plain)));
  // Plain fog runs on twenty skies are given both of the plain lines for the fog.
  const lines = new Set(Array.from({ length: 20 }, (_, seed) => idOf(sheet({ seed }))));
  assert.deepEqual([...lines].sort(), ['mist', 'tide']);
});

test('a flown run is given a line that fits it, from nothing but its sheet', () => {
  for (const seed of [4, 5]) {
    for (const pilot of [TST, { ...TST, collect: true }]) {
      const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells() }), seed);
      const { reason } = flyPilot(world, createReferencePilot(pilot));
      const flown = summariseRun(world, reason!);
      const line = verseFor(flown);
      const verse = VERSES.find((each) => each.line(wordsOf(flown)) === line);
      assert.ok(verse && verse.fits(flown), `seed ${seed}: ${line}`);
      assert.ok(line.length >= VERSE.shortest && line.length <= VERSE.longest);
      assert.equal(verseFor(JSON.parse(JSON.stringify(flown))), line);
    }
  }
});
