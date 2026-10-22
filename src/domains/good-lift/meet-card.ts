export interface LiftSummary { line: number; kg: number; red: number; good: boolean; double: boolean; at: number }
import type { StyleCombo } from './meet-style.ts';
export interface TrickStats { wingovers?: number; loops?: number; pitch?: number; style?: number; spirals?: number; bestCombo?: StyleCombo | null }
export interface FeatSummary {
  total: number; lifts: LiftSummary[]; stats: TrickStats & { thrown: number; hits: number };
}
export interface ShareSummary { total: number; style?: number; peak: number; lifts: Pick<LiftSummary, 'red'>[]; stats?: TrickStats & { thrown?: number; hits?: number } }
export interface MedalSummary { medal: string; by: string; total: number; style?: number }
export interface WorldSummary {
  rows: readonly unknown[]; rank?: number; sent?: { ok: boolean; rank?: number; why?: string } | null;
  removed?: boolean; stays?: boolean; failed?: boolean;
}
interface Feat { id: string; name: string; text: string; streak?: number; bot?: boolean }

// What the meet sheet says about a run of Good Lift, worked out without a page: the feats it
// earned, the line to share it by, the barogram of its climb, what it says of the medals the bots
// set (meet-bots.js) and of the world board (board-online.js). Pure, so the tests can read a run's
// sheet the way a visitor does. A run's numbers come from meet-sheet.js's summariseRun; its byname
// and its verse are worked out in meet-bynames.js and meet-verse.js.
import { WORLD_BOARD } from './board-world.ts';
import { scoreOf } from './score.ts';
import { RUN_RULES } from './run-rules.ts';

// The judges, in the order their lights stand: bit 0 of a lift's `red` is the first.
export const JUDGES = Object.freeze(['contact', 'control', 'airspace']);

// A 1,000 lb total, in the kilograms the meet counts in.
export const THOUSAND_POUNDS = 453.6;

// What the trick feats ask of a run's style (meet-style.js): wingovers linked in one set landed, and
// the degrees a pitched swing reached ahead in a set landed.
export const TRICK_FEATS = Object.freeze({ wingovers: 5, pitch: 45 });

// Good Lift's feats. They are its own, kept in its own store, and never move the fjord's belt.
// `streak` is the one the store awards (days in a row), and `bot` the one awarded once the bots have
// flown the run's sky (meet-bots.js, as the sheet opens); every other is earned by one run alone.
export const FEATS: readonly Readonly<Feat>[] = Object.freeze([
  Object.freeze({ id: 'opener', name: 'Opener', text: 'Lock out the first line.' }),
  Object.freeze({ id: 'under-the-horn', name: 'Under the horn', text: 'Make a good lift after Gjallarhorn sounds.' }),
  Object.freeze({ id: 'giant-dodger', name: 'Giant-dodger', text: 'Dodge every kettlebell in a run with three or more.' }),
  Object.freeze({ id: 'clean-meet', name: 'Clean meet', text: 'Four lifts or more in a run, every light white.' }),
  Object.freeze({ id: 'thousand-pound-club', name: '1,000 lb club', text: 'Total 453.6 kg in one run.' }),
  Object.freeze({ id: 'wingover-five', name: 'Wingover ×5', text: 'Land five linked wingovers past 50°.' }),
  Object.freeze({ id: 'pitched-45', name: 'Pitched 45°', text: 'Pitch the wing 45° ahead and catch it.' }),
  Object.freeze({ id: 'training-block', name: 'Training block', text: 'Fly the Daily Sky seven days in a row.', streak: 7 }),
  Object.freeze({ id: 'beat-the-bot', name: 'Beat the bot', text: 'Outscore TST, the test pilot, on the same sky.', bot: true }),
]);

/** Kilograms as a meet writes them: a decimal only for a half (182.5, 180, 1,240). */
export const kilos = (value: number) => (value ?? 0).toLocaleString('en-GB', { maximumFractionDigits: 1 });

/** A run's score ({ total, style }, score.js) as the sheet writes it: whole points (646, 1,240). */
export const points = (run: { total: number; style?: number }) => scoreOf(run).toLocaleString('en-GB');

/** Metres, with their thousands marked. */
export const metres = (value: number) => Math.floor(value ?? 0).toLocaleString('en-GB');

/**
 * The feats one run earned by itself, in FEATS order. `result` is summariseRun's: `lifts` in the
 * order they were judged (the mist, `line` 0, last), `total` and `stats`.
 */
export function featsFor(result: FeatSummary) {
  const lines = result.lifts.filter((lift: { line: number; }) => lift.line > 0);
  const earned = [];
  if (lines.length && lines[0].good) earned.push('opener');
  if (result.lifts.some((lift) => lift.good && lift.double)) earned.push('under-the-horn');
  if (result.stats.thrown >= 3 && result.stats.hits === 0) earned.push('giant-dodger');
  if (lines.length >= 4 && result.lifts.every((lift: { red: number; }) => lift.red === 0)) earned.push('clean-meet');
  if (result.total >= THOUSAND_POUNDS) earned.push('thousand-pound-club');
  if ((result.stats.wingovers ?? 0) >= TRICK_FEATS.wingovers) earned.push('wingover-five');
  if ((result.stats.pitch ?? 0) >= TRICK_FEATS.pitch) earned.push('pitched-45');
  return earned;
}

/**
 * The run's tricks in a line for the sheet, or '' if it landed none: its style is shown beside the
 * TOTAL, and this says what earned it (`stats` is summariseRun's).
 */
export function trickSaid(stats: TrickStats) {
  const said = [];
  if ((stats.wingovers ?? 0) > 0) said.push(`wingover ×${stats.wingovers}`);
  if ((stats.loops ?? 0) > 0) said.push(`loop ×${stats.loops}`);
  if ((stats.spirals ?? 0) > 0) said.push(`spiral 360 ×${stats.spirals}`);
  if ((stats.pitch ?? 0) > 0) said.push(`pitched ${stats.pitch}°`);
  return said.length ? `tricks: ${said.join(' · ')}` : '';
}

/** A bounded, replay-derived sequence; earlier moves remain represented by their count. */
export function bestComboSaid(combo?: StyleCombo | null) {
  if (!combo || combo.points <= 0) return '';
  const names = ['', 'Pitch', 'Wingover', 'Loop', 'Spiral 360'];
  const omitted = Math.max(0, combo.moves - combo.sequence.length);
  const sequence = `${omitted ? `+${omitted} earlier · ` : ''}${combo.sequence.map(kind => names[kind] || 'Move').join(' → ')}`;
  return `best combo: ${sequence} · ${combo.points.toLocaleString('en-GB')} pts`;
}

/**
 * What the sheet says once the bots have landed (good-lift.js's `bots`: the sky's `medals`, lightest
 * first, the `medal` the run took, '' for none, and the feats that `fresh`ly earned), for whoever
 * cannot see the line that shows them:
 *   Medals: bronze 145 pts, silver 160 pts, set by TST, gold 375 pts. Yours: silver. New feat: Beat the bot.
 * A bot flies no tricks, so the score that sets a medal is its total.
 */
export function medalsSaid({ medals = [], medal, fresh = [] }: { medals?: MedalSummary[]; medal?: string; fresh?: string[] }) {
  const marks = medals.map((mark) => `${mark.medal} ${points(mark)} pts${mark.by === 'tst' ? ', set by TST' : ''}`).join(', ');
  const feats = FEATS.filter((feat) => fresh.includes(feat.id)).map((feat) => feat.name);
  return `Medals: ${marks}. Yours: ${medal || 'none'}.${feats.length ? ` New feat${feats.length === 1 ? '' : 's'}: ${feats.join(', ')}.` : ''}`;
}

// What became of a run sent to the world board that it did not rank, by the reason the function
// gave (functions/src/runs.js); any other reason is said as a plain no. A board whose store or code
// failed never judged the run at all, so it is not said to have turned it down.
const NOT_RANKED = Object.freeze({
  version: 'the world board is updating its flight rules; this run stays on this device',
  'not-best': 'your better run is already on it',
  duplicate: 'this run is already on it',
  mismatch: 'its replay of this run came to another sheet, so it stays here',
  quota: 'it takes no more of your runs today',
  full: 'it takes no more pilots today',
  rate: 'it was busy, so this run stays here',
  store: 'it could not be reached, so this run stays here',
  fault: 'it could not be reached, so this run stays here',
});

/**
 * What the sheet says under the world board (good-lift.js's `world`: the day's `rows`, where this
 * browser stands, `rank`, what became of the run `sent`, and whether this browser's run was
 * `removed`, or `stays` because another browser sent it), for everyone, sighted or not:
 *   57 pilots on it · you: #3 · this run went up
 */
export function worldSaid({ rows, rank = 0, sent = null, removed = false, stays = false, failed = false }: WorldSummary) {
  const said = [rows.length ? `${rows.length} pilot${rows.length === 1 ? '' : 's'} on it` : 'nobody on it yet'];
  if (removed) said.push('yours is taken off');
  else if (rank > 0) said.push(`you: #${rank}`);
  if (failed && !removed) said.push('it could not be taken off just now: try again');
  else if (stays) said.push('only the browser that sent it can take it off');
  else if (sent && !removed) said.push(sent.ok ? `this run went up${(sent.rank ?? 0) > 0 ? '' : `, but not into the top ${WORLD_BOARD.keep}`}` : NOT_RANKED[sent.why as keyof typeof NOT_RANKED] ?? 'it turned this run down');
  return said.join(' · ');
}

/** One lift's three lights as a share line writes them: ⚪ white, 🔴 red. */
export const lightsOf = (red: number) => JUDGES.map((_, i) => ((red >> i) & 1 ? '🔴' : '⚪')).join('');

/**
 * The line a run is shared by, and under it the link that races it:
 *   Good Lift · Daily #12 · 646 pts · 512.5 kg · 1,412 m · ⚪⚪⚪ ⚪🔴⚪ 🔴🔴⚪
 * `label` names the sky ('Daily #12', 'Sky 7f3a2c1e'), and `link` is the challenge's address. The
 * score (lifted points plus banked acro) leads; the kilograms say what was lifted.
 */
export function shareText(result: ShareSummary, { label, link = '' }: { label: string; link?: string }) {
  const lights = result.lifts.map((lift) => lightsOf(lift.red)).join(' ');
  const acro = result.style ?? result.stats?.style ?? 0;
  const line = ['Good Lift', label, `${points({ total: result.total, style: acro })} pts`, `${kilos(result.total)} kg`,
    acro > 0 ? `+${acro.toLocaleString('en-GB')} acro` : '', `${metres(result.peak)} m`, lights,
    bestComboSaid(result.stats?.bestCombo)].filter(Boolean).join(' · ');
  return link ? `${line}\n${link}` : line;
}

/**
 * A run's climb for the sheet, as point lists for SVG in a `width` × `height` frame: the glider's
 * height (`alt`), the fog under it, filled from the floor (`fog`), the lines it was judged at
 * (`lines`, with their call) and the horn's second (`horn`, or null if the run never got there).
 * `trace` is run-step.js's: a sample every second, `n` of them. The frame reaches over the highest
 * of the samples, the run's `peak` (which can fall between two samples) and every line judged.
 */
export function barogram(trace: { n: number; alt: ArrayLike<number>; fog: ArrayLike<number> }, lifts: LiftSummary[], { width = 320, height = 96, horn = RUN_RULES.horn, peak = 0 } = {}) {
  const n = Math.max(2, trace.n);
  let top = Math.max(1, peak);
  for (let i = 0; i < trace.n; i++) top = Math.max(top, trace.alt[i]);
  for (const lift of lifts) top = Math.max(top, lift.line);
  // Headroom over the highest point, rounded up to the next line.
  const ceiling = Math.ceil((top + 30) / 250) * 250;
  const x = (i: number) => ((i / (n - 1)) * width).toFixed(1);
  const y = (metresUp: number) => (height - (Math.max(0, Math.min(ceiling, metresUp)) / ceiling) * height).toFixed(1);
  const alt = [];
  const fog = [`0,${height}`];
  for (let i = 0; i < trace.n; i++) {
    alt.push(`${x(i)},${y(trace.alt[i])}`);
    fog.push(`${x(i)},${y(trace.fog[i])}`);
  }
  fog.push(`${x(trace.n - 1)},${height}`);
  const lines = [];
  for (const lift of lifts) if (lift.line > 0 && lift.line <= ceiling) lines.push({ y: Number(y(lift.line)), line: lift.line, good: lift.good });
  return { alt: alt.join(' '), fog: fog.join(' '), lines, horn: trace.n - 1 >= horn ? Number(x(horn)) : null, ceiling, width, height };
}
