// The skald's verse: one line the meet sheet gives a run of Good Lift under its ending, spoken to
// the pilot and built from what the run did, in the kennings of the old poems: the wing a wind-steed
// or a sky-sail, a thermal the ravens' stair, the fog Niflheim's breath, Hrungnir's kettlebells
// giant-iron. A handful of lines are written out here, each for runs of one kind, and a run is given
// one of the kind that suits it best: the same run always the same line, and a replay of it too,
// since it reads nothing but the run's sheet (summariseRun's, meet-sheet.js). Kind, never mocking:
// a run that went badly is told it can go again.
import { THOUSAND_POUNDS, kilos, metres } from './meet-card.js';

// How long a verse may be, in characters, with any numbers a run can bring to it: one line on a
// phone's sheet at the least, two at the most.
export const VERSE = Object.freeze({ shortest: 60, longest: 120 });

// Small counts in words, as a poem says them; any larger in figures.
const WORDS = Object.freeze(['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']);
/** A count as a verse says it: 'three', or '16'. */
export const count = (n) => (Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n));
/** How often, as a verse says it: 'once', 'twice', 'four times'. */
export const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${count(n)} times`);

// The lines, by kind. Each line is written from `n`, the run's numbers as a verse says them (total
// and peak, then counts and how-oftens in words: thrown, strikes and close are how-oftens, deep
// and lifts are counts), and fits runs for which `fits(sheet)` holds. A run is given a line from
// the first tier that has one to fit it: what the run did that few runs do, then what it did of
// note, then how it ended. Within a tier the run's own numbers choose. A line that sings of the
// kilos banked fits only a run that banked some: one whose every lift was called no lift is told
// the iron waits for it, never that it banked 0 kg.
//   1  a 1,000 lb total; every light white over three lines or more; no strike with iron thrown
//   2  a good lift under the horn; reps to depth; a close call; struck and climbing on regardless
//   3  the fog; a touchdown; nothing banked; a run that judged no line; a run its pilot ended
export const VERSES = Object.freeze([
  Object.freeze({
    id: 'club', tier: 1,
    fits: (run) => run.total >= THOUSAND_POUNDS,
    line: (n) => `A thousand pounds of iron and more you hauled through the cloud-roof: ${n.total} kg, at ${n.peak} m.`,
  }),
  Object.freeze({
    id: 'clean', tier: 1,
    fits: (run) => run.lifts.filter((lift) => lift.line > 0).length >= 3 && run.lifts.every((lift) => lift.red === 0),
    line: (n) => `The judges lit no red lamp for you in ${n.lifts} lifts, and ${n.total} kg went up the raven-road clean.`,
  }),
  Object.freeze({
    id: 'unstruck', tier: 1,
    fits: (run) => run.stats.strikes === 0 && run.stats.thrown > 0 && run.total > 0,
    line: (n) => `Hrungnir hurled his iron ${n.thrown} and never found your sky-sail; ${n.total} kg rode with you to ${n.peak} m.`,
  }),
  Object.freeze({
    id: 'horn', tier: 2,
    fits: (run) => run.lifts.some((lift) => lift.good && lift.double),
    line: (n) => `Heimdall's horn rang out and still you lifted: ${n.total} kg banked, and ${n.peak} m of the ravens' stair below.`,
  }),
  Object.freeze({
    id: 'depth', tier: 2,
    fits: (run) => run.stats.deep >= 2,
    line: (n) => `You wound ${n.deep} circles tight about the warm well's heart, and rose on them to ${n.peak} m.`,
  }),
  Object.freeze({
    id: 'close', tier: 2,
    fits: (run) => run.stats.close > 0 && run.total > 0,
    line: (n) => `Giant-iron hissed past your cloth ${n.close}, and you only climbed the harder: ${n.total} kg at ${n.peak} m.`,
  }),
  Object.freeze({
    id: 'struck', tier: 2,
    fits: (run) => run.stats.strikes > 0 && run.total > 0,
    line: (n) => `Struck ${n.strikes}, your wind-steed shook out its cloth and climbed again, with ${n.total} kg for your hoard.`,
  }),
  Object.freeze({
    id: 'mist', tier: 3,
    fits: (run) => run.reason === 'fog' && run.total > 0,
    line: (n) => `Niflheim's breath rose to take you at the last, with ${n.total} kg banked and ${n.peak} m of sky beneath you.`,
  }),
  Object.freeze({
    id: 'tide', tier: 3,
    fits: (run) => run.reason === 'fog' && run.total > 0,
    line: (n) => `You rode the ravens' road to ${n.peak} m and laid ${n.total} kg in the hoard before the grey tide rose.`,
  }),
  Object.freeze({
    id: 'hillside', tier: 3,
    fits: (run) => run.reason === 'landed' && run.total > 0,
    line: (n) => `You brought your wind-steed home to the hillside, ${n.total} kg banked from a sky ${n.peak} m high.`,
  }),
  Object.freeze({
    id: 'empty', tier: 3,
    fits: (run) => run.reason !== 'quit' && run.total === 0,
    line: (n) => `Your hoard stays empty this time, yet your wind-steed bore you to ${n.peak} m; the iron waits for your return.`,
  }),
  Object.freeze({
    id: 'stair', tier: 3, first: true,
    fits: (run) => run.reason !== 'quit' && !run.lifts.some((lift) => lift.line > 0),
    line: (n) => `The ravens' stair waits for you yet: you rose to ${n.peak} m, and the first line hangs at 250 m.`,
  }),
  Object.freeze({
    id: 'set-down', tier: 3, first: true,
    fits: (run) => run.reason === 'quit',
    line: (n) => `You set the bar down at your own word at ${n.peak} m; the ravens will circle on till you come back.`,
  }),
]);

// A whole number from the run's own numbers, the same for the same run, to choose a line within a
// tier by (the mixer daily.js and the sky's pick() use).
function mix(sheet) {
  let t = (sheet.seed >>> 0) ^ Math.imul(sheet.steps | 0, 0x9e3779b1) ^ Math.imul(Math.round(sheet.total * 2), 0x85ebca6b) ^ Math.imul(sheet.peak | 0, 0xc2b2ae35);
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (t ^ (t >>> 14)) >>> 0;
}

/** The run's numbers as its verse says them (VERSES' `n`). */
export function wordsOf(sheet) {
  const { stats } = sheet;
  return {
    total: kilos(sheet.total),
    peak: metres(sheet.peak),
    lifts: count(sheet.lifts.length),
    deep: count(stats.deep),
    thrown: times(stats.thrown),
    strikes: times(stats.strikes),
    close: times(stats.close),
  };
}

/**
 * The skald's verse for a run, from its sheet (summariseRun's): a line of VERSES from the first
 * tier with one to fit the run, chosen within the tier by the run's own numbers. A line marked
 * `first` (a run that judged no line, or one its pilot ended) is the only one such a run is given.
 */
export function verseFor(sheet) {
  const only = VERSES.find((verse) => verse.first && verse.fits(sheet));
  const fitting = only ? [only] : VERSES.filter((verse) => !verse.first && verse.fits(sheet));
  if (!fitting.length) return '';
  const tier = Math.min(...fitting.map((verse) => verse.tier));
  const choice = fitting.filter((verse) => verse.tier === tier);
  return choice[mix(sheet) % choice.length].line(wordsOf(sheet));
}
