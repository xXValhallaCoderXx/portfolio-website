// What the meet sheet says about a run of Good Lift, worked out without a page: the feats it
// earned, the line to share it by and the barogram of its climb. Pure, so the tests can read a
// run's sheet the way a visitor does. A run's numbers come from meet-sheet.js's summariseRun.

// The judges, in the order their lights stand: bit 0 of a lift's `red` is the first.
export const JUDGES = Object.freeze(['contact', 'control', 'airspace']);

// A 1,000 lb total, in the kilograms the meet counts in.
export const THOUSAND_POUNDS = 453.6;

// Good Lift's feats. They are its own, kept in its own store, and never move the fjord's belt.
// `streak` is the one the store awards (days in a row); every other is earned by one run.
export const FEATS = Object.freeze([
  Object.freeze({ id: 'opener', name: 'Opener', text: 'Lock out the first line.' }),
  Object.freeze({ id: 'under-the-horn', name: 'Under the horn', text: 'Make a good lift after Gjallarhorn sounds.' }),
  Object.freeze({ id: 'giant-dodger', name: 'Giant-dodger', text: 'Dodge every kettlebell in a run with three or more.' }),
  Object.freeze({ id: 'clean-meet', name: 'Clean meet', text: 'Four lifts or more in a run, every light white.' }),
  Object.freeze({ id: 'thousand-pound-club', name: '1,000 lb club', text: 'Total 453.6 kg in one run.' }),
  Object.freeze({ id: 'training-block', name: 'Training block', text: 'Fly the Daily Sky seven days in a row.', streak: 7 }),
]);

/** Kilograms as a meet writes them: a decimal only for a half (182.5, 180, 1,240). */
export const kilos = (value) => (value ?? 0).toLocaleString('en-GB', { maximumFractionDigits: 1 });

/** Metres, with their thousands marked. */
export const metres = (value) => Math.floor(value ?? 0).toLocaleString('en-GB');

/**
 * The feats one run earned by itself, in FEATS order. `result` is summariseRun's: `lifts` in the
 * order they were judged (the mist, `line` 0, last), `total` and `stats`.
 */
export function featsFor(result) {
  const lines = result.lifts.filter((lift) => lift.line > 0);
  const earned = [];
  if (lines.length && lines[0].good) earned.push('opener');
  if (result.lifts.some((lift) => lift.good && lift.double)) earned.push('under-the-horn');
  if (result.stats.thrown >= 3 && result.stats.hits === 0) earned.push('giant-dodger');
  if (lines.length >= 4 && result.lifts.every((lift) => lift.red === 0)) earned.push('clean-meet');
  if (result.total >= THOUSAND_POUNDS) earned.push('thousand-pound-club');
  return earned;
}

/** One lift's three lights as a share line writes them: ⚪ white, 🔴 red. */
export const lightsOf = (red) => JUDGES.map((_, i) => ((red >> i) & 1 ? '🔴' : '⚪')).join('');

/**
 * The line a run is shared by, and under it the link that races it:
 *   Good Lift · Daily #12 · 512.5 kg · 1,412 m · ⚪⚪⚪ ⚪🔴⚪ 🔴🔴⚪
 * `label` names the sky ('Daily #12', 'Sky 7f3a2c1e'), and `link` is the challenge's address.
 */
export function shareText(result, { label, link = '' }) {
  const lights = result.lifts.map((lift) => lightsOf(lift.red)).join(' ');
  const line = ['Good Lift', label, `${kilos(result.total)} kg`, `${metres(result.peak)} m`, lights].filter(Boolean).join(' · ');
  return link ? `${line}\n${link}` : line;
}

/**
 * A run's climb for the sheet, as point lists for SVG in a `width` × `height` frame: the glider's
 * height (`alt`), the fog under it, filled from the floor (`fog`), the lines it was judged at
 * (`lines`, with their call) and the horn's second (`horn`, or null if the run never got there).
 * `trace` is run-step.js's: a sample every second, `n` of them. The frame reaches over the highest
 * of the samples, the run's `peak` (which can fall between two samples) and every line judged.
 */
export function barogram(trace, lifts, { width = 320, height = 96, horn = 110, peak = 0 } = {}) {
  const n = Math.max(2, trace.n);
  let top = Math.max(1, peak);
  for (let i = 0; i < trace.n; i++) top = Math.max(top, trace.alt[i]);
  for (const lift of lifts) top = Math.max(top, lift.line);
  // Headroom over the highest point, rounded up to the next line.
  const ceiling = Math.ceil((top + 30) / 250) * 250;
  const x = (i) => ((i / (n - 1)) * width).toFixed(1);
  const y = (metresUp) => (height - (Math.max(0, Math.min(ceiling, metresUp)) / ceiling) * height).toFixed(1);
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
