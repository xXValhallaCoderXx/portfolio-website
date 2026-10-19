export type BynameId = 'unbroken' | 'unstruck' | 'centred' | 'bell-dodger' | 'horn-lifter' | 'cloud-shy';
export interface BynameSheet {
  reason?: string;
  peak: number;
  lifts: { line: number; red: number; good: boolean; double: boolean }[];
  stats: { strikes: number; thrown: number; hits: number; reps: number; deep: number; cloud: number };
}
interface Byname { id: BynameId; name: string; rule: string; earns: (sheet: BynameSheet) => boolean }

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
const lines = (sheet: BynameSheet) => sheet.lifts.filter((lift: { line: number; }) => lift.line > 0).length;

// A run earns one byname; check the rarer achievements before the more common ones.
export const BYNAMES: readonly Readonly<Byname>[] = Object.freeze([
  Object.freeze({
    id: 'unbroken',
    name: 'the Unbroken',
    rule: `every light white, over ${BYNAME.lines} lines or more`,
    earns: (sheet: BynameSheet) => lines(sheet) >= BYNAME.lines && sheet.lifts.every((lift: { red: number; }) => lift.red === 0),
  }),
  Object.freeze({
    id: 'unstruck',
    name: 'the Unstruck',
    rule: `no strike all run, with ${BYNAME.thrown} kettlebells or more thrown`,
    earns: ({ stats }: BynameSheet) => stats.strikes === 0 && stats.thrown >= BYNAME.thrown,
  }),
  Object.freeze({
    id: 'centred',
    name: 'the Centred',
    rule: `${BYNAME.reps} reps or more, every one to depth`,
    earns: ({ stats }: BynameSheet) => stats.reps >= BYNAME.reps && stats.deep === stats.reps,
  }),
  Object.freeze({
    id: 'bell-dodger',
    name: 'Bell-dodger',
    rule: `every kettlebell dodged, ${BYNAME.thrown} or more of them`,
    earns: ({ stats }: BynameSheet) => stats.thrown >= BYNAME.thrown && stats.hits === 0,
  }),
  Object.freeze({
    id: 'horn-lifter',
    name: 'Horn-lifter',
    rule: 'a good lift after Gjallarhorn sounds',
    earns: ({ lifts }: BynameSheet) => lifts.some((lift) => lift.good && lift.double),
  }),
  Object.freeze({
    id: 'cloud-shy',
    name: 'Cloud-shy',
    rule: `not a second in cloud, on a climb past ${BYNAME.peak} m`,
    earns: ({ stats, peak }: BynameSheet) => stats.cloud === 0 && peak >= BYNAME.peak,
  }),
]);

/**
 * The byname a run earns its pilot, from its sheet (summariseRun's): the id of the first of BYNAMES
 * whose rule it meets, or '' for none. A run the sky did not judge earns none.
 */
import { isJudgedEnding } from './run-rules.ts';

export function bynameFor(sheet: BynameSheet | null | undefined): BynameId | '' {
  if (!sheet || !isJudgedEnding(sheet.reason)) return '';
  for (const byname of BYNAMES) if (byname.earns(sheet)) return byname.id;
  return '';
}

/** The byname `id` names ({ id, name, rule, earns }), or null for '' and any id BYNAMES does not hold. */
export const bynameOf = (id: unknown) => BYNAMES.find((byname) => byname.id === id) ?? null;
