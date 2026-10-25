import type { LiftSummary, TrickStats } from './meet-card.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOK_FEATS, COMBO_SHOWN, FEATS, JUDGES, THOUSAND_POUNDS, TRICK_FEATS, barogram, bestComboSaid, bookFeatsFor, comboLine, featsFor, kilos, lightsOf, medalsSaid, metres, shareText, trickSaid, worldSaid } from './meet-card.ts';
import { FEAT_IDS } from '../progression/good-lift-store.ts';
import { LINKS, MOVE } from './trick-tables.ts';

const lift = (line: number, red: number, { kg = 25, double = false } = {}) => ({ line, kg, red, good: (red & (red - 1)) === 0, double, at: 0 });
const run = (lifts: LiftSummary[], { total = 0, stats = {} }: { total?: number; stats?: TrickStats & { thrown?: number; hits?: number } } = {}) => ({
  total, peak: 0, lifts, stats: {
    strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 0, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0,
    thrown: 0, dodged: 0, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0, ...stats,
  },
});

test('kilos print a decimal only for a half, and both mark their thousands', () => {
  assert.equal(kilos(182.5), '182.5');
  assert.equal(kilos(180), '180');
  assert.equal(kilos(1240), '1,240');
  assert.equal(kilos(1242.5), '1,242.5');
  assert.equal(kilos(0), '0');
  assert.equal(metres(1412.9), '1,412');
});

test('the share line reads exactly as expected, lights in judging order and the mist last', () => {
  const result = { ...run([lift(250, 0), lift(500, 0b010), lift(750, 0), lift(0, 0b011)], { total: 512.5 }), peak: 1412.4 };
  assert.equal(
    shareText(result, { label: 'Daily #12', link: 'https://example.test/good-lift/daily#vs=AQGv' }),
    'Good Lift · Daily #12 · 513 pts · 512.5 kg · 1,412 m · ⚪⚪⚪ ⚪🔴⚪ ⚪⚪⚪ 🔴🔴⚪\nhttps://example.test/good-lift/daily#vs=AQGv',
  );
  // A run that never reached a line has no lights to show, and no dangling dot for them.
  assert.equal(shareText({ ...run([], { total: 0 }), peak: 80 }, { label: 'Sky 7f3a2c1e' }), 'Good Lift · Sky 7f3a2c1e · 0 pts · 0 kg · 80 m');
  // Banked acro adds to the score the line leads with; the kilograms stay what was lifted.
  assert.match(shareText({ ...result, style: 260 }, { label: 'Daily #12' }), /^Good Lift · Daily #12 · 773 pts · 512\.5 kg · /);
  assert.equal(lightsOf(0b101), '🔴⚪🔴');
  assert.deepEqual(JUDGES, ['contact', 'control', 'airspace']);
});

test('sharing includes independently earned acro and a bounded verified best combo', () => {
  const bestCombo = { points: 150, base: 130, variety: 20, moves: 5, mask: 14, sequence: [4, 2, 3] };
  assert.equal(bestComboSaid(bestCombo), 'best combo: +2 earlier · Spiral 360 → Wingover → Loop · 150 pts');
  const text = shareText({ total: 100, style: 150, peak: 800, lifts: [], stats: { bestCombo } }, { label: 'Sky 1234' });
  assert.equal(text, 'Good Lift · Sky 1234 · 250 pts · 100 kg · +150 acro · 800 m · best combo: +2 earlier · Spiral 360 → Wingover → Loop · 150 pts');
  assert.equal(bestComboSaid(null), '');
});

test('each feat is earned by what the run did, and only by that', () => {
  assert.deepEqual(featsFor(run([])), [], 'a run that never reached a line earns nothing');
  assert.deepEqual(featsFor(run([lift(250, 0)])), ['opener']);
  assert.deepEqual(featsFor(run([lift(250, 0b011)])), [], 'an opener with two reds is no lock-out');
  assert.ok(!featsFor(run([lift(250, 0b011), lift(500, 0)])).includes('opener'), 'only the first line is the opener');
  assert.deepEqual(featsFor(run([lift(0, 0)])), [], 'the mist judging an empty bar is no line');
  assert.ok(featsFor(run([lift(250, 1), lift(500, 0, { double: true })])).includes('under-the-horn'));
  assert.ok(!featsFor(run([lift(250, 1), lift(500, 0b110, { double: true })])).includes('under-the-horn'), 'a no lift after the horn is not one');
  assert.ok(featsFor(run([lift(250, 0)], { stats: { thrown: 3, hits: 0 } })).includes('giant-dodger'));
  assert.ok(!featsFor(run([lift(250, 0)], { stats: { thrown: 2, hits: 0 } })).includes('giant-dodger'), 'three or more');
  assert.ok(!featsFor(run([lift(250, 0)], { stats: { thrown: 5, hits: 1 } })).includes('giant-dodger'));
  const clean = [lift(250, 0), lift(500, 0), lift(750, 0), lift(1000, 0), lift(0, 0)];
  assert.ok(featsFor(run(clean)).includes('clean-meet'));
  assert.ok(!featsFor(run(clean.slice(0, 3))).includes('clean-meet'), 'four lines at least');
  assert.ok(!featsFor(run([...clean.slice(0, 3), lift(0, 0)])).includes('clean-meet'), 'the mist is not one of the four');
  assert.ok(!featsFor(run([...clean.slice(0, 4), lift(0, 0b100)])).includes('clean-meet'), 'every light, the mist\'s too');
  assert.ok(featsFor(run([lift(250, 0)], { total: THOUSAND_POUNDS })).includes('thousand-pound-club'));
  assert.ok(!featsFor(run([lift(250, 0)], { total: 452.5 })).includes('thousand-pound-club'));
  // Earned in FEATS order; the streak's is never a single run's, nor the bot's, which only the bots
  // flying the sky can award, nor the trick book's, which the store reads off a sheet that keeps one.
  const all = featsFor(run([...clean.slice(0, 4).map((each, i) => ({ ...each, double: i === 3 })), lift(0, 0)], { total: 500, stats: { thrown: 4, hits: 0, wingovers: 5, pitch: 45 } }));
  assert.deepEqual(all, FEATS.filter((feat) => !feat.streak && !feat.bot && !feat.book).map((feat) => feat.id));
  assert.deepEqual(FEATS.filter((feat) => feat.streak || feat.bot).map((feat) => feat.id), ['training-block', 'beat-the-bot']);
  assert.deepEqual(FEATS.filter((feat) => feat.book).map((feat) => feat.id), ['first-link', 'flow-three', 'mirror', 'big-bank']);
});

test('the trick feats ask five linked wingovers or a pitched swing caught 45° ahead in a set landed, and the sheet says the tricks', () => {
  const tricked = (stats: {}|undefined) => featsFor(run([lift(250, 0)], { stats: { thrown: 0, hits: 0, ...stats } }));
  assert.ok(tricked({ wingovers: TRICK_FEATS.wingovers }).includes('wingover-five'));
  assert.ok(!tricked({ wingovers: TRICK_FEATS.wingovers - 1 }).includes('wingover-five'));
  assert.ok(tricked({ pitch: TRICK_FEATS.pitch }).includes('pitched-45'));
  assert.ok(!tricked({ pitch: TRICK_FEATS.pitch - 1 }).includes('pitched-45'));
  // A sheet from before style was kept says nothing of it, and earns neither.
  assert.deepEqual(tricked({}), ['opener']);
  assert.equal(trickSaid({ wingovers: 5, pitch: 47 }), 'tricks: wingover ×5 · pitched 47°');
  assert.equal(trickSaid({ wingovers: 3, pitch: 0 }), 'tricks: wingover ×3');
  assert.equal(trickSaid({ wingovers: 4, loops: 3, pitch: 0 }), 'tricks: wingover ×4 · loop ×3');
  assert.equal(trickSaid({ wingovers: 0, pitch: 0 }), '');
  assert.equal(trickSaid({}), '');
});

test('the trick book\'s feats ask a named link, three flows, a move flown both ways or 300 points in one combo banked', () => {
  assert.deepEqual(BOOK_FEATS, { flows: 3, points: 300 });
  const book = (fields = {}) => ({ links: new Array(LINKS.length + 1).fill(0), flows: 0, points: 0, mirror: 0, ...fields });
  assert.deepEqual(bookFeatsFor(book()), [], 'a book with nothing banked earns nothing');
  const linked = book().links.map((_: number, id: number) => (id === LINKS.length ? 1 : 0));
  assert.deepEqual(bookFeatsFor(book({ links: linked })), ['first-link']);
  assert.deepEqual(bookFeatsFor(book({ flows: BOOK_FEATS.flows })), ['flow-three']);
  assert.deepEqual(bookFeatsFor(book({ flows: BOOK_FEATS.flows - 1 })), []);
  assert.deepEqual(bookFeatsFor(book({ mirror: 1 })), ['mirror']);
  assert.deepEqual(bookFeatsFor(book({ points: BOOK_FEATS.points })), ['big-bank']);
  assert.deepEqual(bookFeatsFor(book({ points: BOOK_FEATS.points - 5 })), []);
  // In FEATS order, however they were met.
  assert.deepEqual(bookFeatsFor(book({ points: 900, mirror: 1, flows: 4, links: linked })), ['first-link', 'flow-three', 'mirror', 'big-bank']);
});

test('a run\'s best combo names its moves and named links; Training\'s is said as it always was', () => {
  const wing = LINKS.find((each) => each.name === 'WING-SPIRAL')!.id, exit = LINKS.find((each) => each.name === 'SPIRAL EXIT')!.id;
  const receipt = { points: 450, base: 120, variety: 2, moves: 3, mask: 12, sequence: [MOVE.wingover, MOVE.spiral, MOVE.wingover],
    links: [0, wing, exit], sides: [0, -1, 0], flows: 2, multiplier: 4 };
  assert.equal(bestComboSaid(receipt), 'best combo: WINGOVERS ⟨wing-spiral⟩ SPIRAL DIVE ⟨spiral exit⟩ WINGOVERS · +450');
  assert.equal(bestComboSaid({ ...receipt, sequence: [MOVE.loop, MOVE.pitch], links: [0, 0], moves: 2, points: 1250 }), 'best combo: LOOP → PITCH CATCH · +1,250');
  assert.equal(bestComboSaid({ ...receipt, points: 0 }), '', 'nothing banked');
  // A long combo names its latest COMBO_SHOWN moves and counts the rest.
  const long = Array.from({ length: COMBO_SHOWN + 2 }, (_, i) => (i % 2 ? MOVE.spiral : MOVE.wingover));
  const said = bestComboSaid({ ...receipt, sequence: long, links: long.map(() => 0), moves: long.length });
  assert.match(said, /^best combo: \+2 earlier · WINGOVERS → SPIRAL DIVE → /);
  assert.equal(said.split(' → ').length, COMBO_SHOWN);
  // The trick book keeps fewer moves than its best combo had, and counts the rest the same way.
  assert.equal(comboLine({ moves: 5, sequence: [MOVE.spiral, MOVE.wingover], links: [wing, exit] }), '+3 earlier · ⟨wing-spiral⟩ SPIRAL DIVE ⟨spiral exit⟩ WINGOVERS');
  // Today's receipt keeps no links: its wording is unchanged.
  assert.equal(bestComboSaid({ points: 150, base: 130, variety: 20, moves: 5, mask: 14, sequence: [4, 2, 3] }), 'best combo: +2 earlier · Spiral 360 → Wingover → Loop · 150 pts');
});

test('the store knows every feat the sheet lists, in the same order', () => {
  assert.deepEqual(FEATS.map((feat) => feat.id), FEAT_IDS);
});

test('once the bots land, the sheet says the medals lightest first, which one TST set, the medal taken and any feat it earned', () => {
  const medals = [
    { medal: 'bronze', total: 145, peak: 1152, by: 'holder' },
    { medal: 'silver', total: 237.5, peak: 1040, by: 'tst' },
    { medal: 'gold', total: 1240, peak: 1300, by: 'collector' },
  ];
  assert.equal(
    medalsSaid({ medals, medal: 'silver', fresh: ['beat-the-bot'] }),
    'Medals: bronze 145 pts, silver 238 pts, set by TST, gold 1,240 pts. Yours: silver. New feat: Beat the bot.',
  );
  assert.equal(medalsSaid({ medals, medal: '' }), 'Medals: bronze 145 pts, silver 238 pts, set by TST, gold 1,240 pts. Yours: none.');
});

test('the barogram stays in its frame, with the fog under the flight and the horn where it sounded', () => {
  const n = 401;
  const trace = { alt: new Float32Array(601), fog: new Float32Array(601), total: new Float32Array(601), n };
  for (let i = 0; i < n; i++) {
    trace.alt[i] = 80 + i * 8;
    trace.fog[i] = Math.max(0, i * 5 - 100);
  }
  const lifts = [lift(250, 0), lift(500, 0b011), lift(750, 0), lift(1000, 0), lift(0, 0)];
  const chart = barogram(trace, lifts, { width: 320, height: 96 });
  const points = (list: string) => list.split(' ').map((pair: string) => pair.split(',').map(Number));
  const alt = points(chart.alt);
  const fog = points(chart.fog);
  assert.equal(alt.length, n);
  for (const [x, y] of [...alt, ...fog]) assert.ok(x >= 0 && x <= 320 && y >= 0 && y <= 96, `${x},${y}`);
  // In SVG a smaller y is higher: the glider flies over its fog all the way.
  for (let i = 0; i < n; i++) assert.ok(alt[i][1] <= fog[i + 1][1]);
  assert.deepEqual(fog[0], [0, 96], 'the fog is filled from the floor');
  assert.deepEqual(chart.lines.map((each) => [each.line, each.good]), [[250, true], [500, false], [750, true], [1000, true]]);
  assert.ok(Math.abs(chart.horn! - (300 / (n - 1)) * 320) < 0.1);
  assert.equal(barogram({ ...trace, n: 60 }, lifts).horn, null, 'a run over before the horn has none');
  assert.ok(chart.ceiling >= 80 + (n - 1) * 8);
  // A peak reached between two samples, and a line judged above every sample, both stay inside.
  const short = { ...trace, n: 4 };
  const reaching = barogram(short, [lift(250, 0), lift(500, 0)], { peak: 519 });
  assert.ok(reaching.ceiling >= 519 && reaching.lines.every((each) => each.y >= 0 && each.y <= 96));
  assert.equal(reaching.lines.length, 2);
});

test('the world board\'s line says how many are on it, where this browser stands and what became of the run sent', () => {
  const rows = (count: number) => Array.from({ length: count }, () => ({}));
  assert.equal(worldSaid({ rows: [], rank: 0, sent: null }), 'nobody on it yet');
  assert.equal(worldSaid({ rows: rows(1), rank: 1, sent: null }), '1 pilot on it · you: #1');
  assert.equal(worldSaid({ rows: rows(57), rank: 3, sent: { ok: true, why: '', rank: 3 } }), '57 pilots on it · you: #3 · this run went up');
  assert.equal(worldSaid({ rows: rows(100), rank: 0, sent: { ok: true, why: '', rank: 0 } }), '100 pilots on it · this run went up, but not into the top 100');
  assert.equal(worldSaid({ rows: rows(9), rank: 4, sent: { ok: false, why: 'not-best', rank: 4 } }), '9 pilots on it · you: #4 · your better run is already on it');
  assert.equal(worldSaid({ rows: rows(9), rank: 0, sent: { ok: false, why: 'mismatch', rank: 0 } }), '9 pilots on it · its replay of this run came to another sheet, so it stays here');
  assert.equal(worldSaid({ rows: [], rank: 0, sent: { ok: false, why: 'version', rank: 0 } }), 'nobody on it yet · the world board is updating its flight rules; this run stays on this device');
  // A reason this build does not know is a plain no; a board that failed to judge the run said no to nothing.
  assert.equal(worldSaid({ rows: rows(2), rank: 0, sent: { ok: false, why: 'later', rank: 0 } }), '2 pilots on it · it turned this run down');
  for (const why of ['store', 'fault']) assert.equal(worldSaid({ rows: rows(2), rank: 0, sent: { ok: false, why, rank: 0 } }), '2 pilots on it · it could not be reached, so this run stays here', why);
  // Taken off, it says so, and nothing of where it stood or what became of it.
  assert.equal(worldSaid({ rows: rows(8), rank: 0, sent: { ok: true, why: '', rank: 2 }, removed: true }), '8 pilots on it · yours is taken off');
  // Sent from another browser, it stays where it stands, and the sheet says who can take it off.
  assert.equal(worldSaid({ rows: rows(8), rank: 2, sent: null, stays: true }), '8 pilots on it · you: #2 · only the browser that sent it can take it off');
  // Asked to take it off and not reached, it says so, and the button asks again.
  assert.equal(worldSaid({ rows: rows(8), rank: 2, sent: null, failed: true }), '8 pilots on it · you: #2 · it could not be taken off just now: try again');
});
