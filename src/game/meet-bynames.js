// Bynames: the word a run of Good Lift earns its pilot from its own meet sheet, the way the sagas
// name someone for what they did (Eirik the Red, Thorfinn Skull-splitter): REN the Unstruck, for a
// run nothing touched. A run earns one byname at most, the first in BYNAMES order whose rule it
// meets, and only a run the sky judged (the fog, or a touchdown) earns one: a run ended with
// [ end run ] forfeits its bar and goes unnamed. The meet sheet shows it with the initials, and the
// day's board beside each run (board.js keeps it on the row). Pure and free of imports: it reads
// summariseRun's sheet (meet-sheet.js) and nothing else, so a run replayed from its log earns the
// very same byname.

// How much of a thing a run must have met before a byname about it can be earned, so that none is
// earned by default: no kettlebell is thrown under 700 m, and no storm cloud drifts under 580 m.
export const BYNAME = Object.freeze({
  lines: 4, // lines judged, the mist's not counted, for the Unbroken: the clean meet's four
  thrown: 3, // kettlebells thrown, for the Unstruck and Bell-dodger: Giant-dodger's three
  reps: 3, // reps, for the Centred
  peak: 750, // m of peak, for Cloud-shy: through the height of the storm clouds' lowest two layers
});

// Lines judged on the way up: the mist's judging of the bar as the run ends is no line.
const lines = (sheet) => sheet.lifts.filter((lift) => lift.line > 0).length;

// Every byname, in the order a run is judged for them, the rarer before the more common. Measured
// on five reference pilots (pilots.js) over 40 skies under SIM_VERSION 2, the share of runs that met
// each rule, from the pilot that met it least to the one that met it most: the Unbroken 0 to 20%,
// the Unstruck 0 to 28%, the Centred 43 to 70%, Bell-dodger 0 to 88% (none for the pilot that never
// dodges), Horn-lifter 40 to 85% and Cloud-shy 33 to 43%. A player centres a circle less surely than
// a pilot that steers by the core's own position, so the Centred stays above the two after it.
export const BYNAMES = Object.freeze([
  Object.freeze({
    id: 'unbroken',
    name: 'the Unbroken',
    rule: `every light white, over ${BYNAME.lines} lines or more`,
    earns: (sheet) => lines(sheet) >= BYNAME.lines && sheet.lifts.every((lift) => lift.red === 0),
  }),
  Object.freeze({
    id: 'unstruck',
    name: 'the Unstruck',
    rule: `no strike all run, with ${BYNAME.thrown} kettlebells or more thrown`,
    earns: ({ stats }) => stats.strikes === 0 && stats.thrown >= BYNAME.thrown,
  }),
  Object.freeze({
    id: 'centred',
    name: 'the Centred',
    rule: `${BYNAME.reps} reps or more, every one to depth`,
    earns: ({ stats }) => stats.reps >= BYNAME.reps && stats.deep === stats.reps,
  }),
  Object.freeze({
    id: 'bell-dodger',
    name: 'Bell-dodger',
    rule: `every kettlebell dodged, ${BYNAME.thrown} or more of them`,
    earns: ({ stats }) => stats.thrown >= BYNAME.thrown && stats.hits === 0,
  }),
  Object.freeze({
    id: 'horn-lifter',
    name: 'Horn-lifter',
    rule: 'a good lift after Gjallarhorn sounds',
    earns: ({ lifts }) => lifts.some((lift) => lift.good && lift.double),
  }),
  Object.freeze({
    id: 'cloud-shy',
    name: 'Cloud-shy',
    rule: `not a second in cloud, on a climb past ${BYNAME.peak} m`,
    earns: ({ stats, peak }) => stats.cloud === 0 && peak >= BYNAME.peak,
  }),
]);

/**
 * The byname a run earns its pilot, from its sheet (summariseRun's): the id of the first of BYNAMES
 * whose rule it meets, or '' for none. A run the sky did not judge earns none.
 */
import { isJudgedEnding } from './run-rules.js';

export function bynameFor(sheet) {
  if (!isJudgedEnding(sheet?.reason)) return '';
  for (const byname of BYNAMES) if (byname.earns(sheet)) return byname.id;
  return '';
}

/** The byname `id` names ({ id, name, rule, earns }), or null for '' and any id BYNAMES does not hold. */
export const bynameOf = (id) => BYNAMES.find((byname) => byname.id === id) ?? null;
