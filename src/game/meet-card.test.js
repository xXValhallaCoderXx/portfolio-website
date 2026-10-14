import test from 'node:test';
import assert from 'node:assert/strict';
import { FEATS, JUDGES, THOUSAND_POUNDS, barogram, featsFor, kilos, lightsOf, metres, shareText } from './meet-card.js';

const lift = (line, red, { kg = 25, double = false } = {}) => ({ line, kg, red, good: (red & (red - 1)) === 0, double, at: 0 });
const run = (lifts, { total = 0, stats = {} } = {}) => ({
  total, peak: 0, lifts, stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, trails: 0, close: 0, thrown: 0, dodged: 0, hits: 0, ...stats },
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
    'Good Lift · Daily #12 · 512.5 kg · 1,412 m · ⚪⚪⚪ ⚪🔴⚪ ⚪⚪⚪ 🔴🔴⚪\nhttps://example.test/good-lift/daily#vs=AQGv',
  );
  // A run that never reached a line has no lights to show, and no dangling dot for them.
  assert.equal(shareText({ ...run([], { total: 0 }), peak: 80 }, { label: 'Sky 7f3a2c1e' }), 'Good Lift · Sky 7f3a2c1e · 0 kg · 80 m');
  assert.equal(lightsOf(0b101), '🔴⚪🔴');
  assert.deepEqual(JUDGES, ['contact', 'control', 'airspace']);
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
  // Earned in FEATS order, and the streak's is never a single run's.
  const all = featsFor(run([...clean.slice(0, 4).map((each, i) => ({ ...each, double: i === 3 })), lift(0, 0)], { total: 500, stats: { thrown: 4, hits: 0 } }));
  assert.deepEqual(all, FEATS.map((feat) => feat.id).filter((id) => id !== 'training-block'));
});

test('the barogram stays in its frame, with the fog under the flight and the horn where it sounded', () => {
  const n = 150;
  const trace = { alt: new Float32Array(241), fog: new Float32Array(241), total: new Float32Array(241), n };
  for (let i = 0; i < n; i++) {
    trace.alt[i] = 80 + i * 8;
    trace.fog[i] = Math.max(0, i * 5 - 100);
  }
  const lifts = [lift(250, 0), lift(500, 0b011), lift(750, 0), lift(1000, 0), lift(0, 0)];
  const chart = barogram(trace, lifts, { width: 320, height: 96 });
  const points = (list) => list.split(' ').map((pair) => pair.split(',').map(Number));
  const alt = points(chart.alt);
  const fog = points(chart.fog);
  assert.equal(alt.length, n);
  for (const [x, y] of [...alt, ...fog]) assert.ok(x >= 0 && x <= 320 && y >= 0 && y <= 96, `${x},${y}`);
  // In SVG a smaller y is higher: the glider flies over its fog all the way.
  for (let i = 0; i < n; i++) assert.ok(alt[i][1] <= fog[i + 1][1]);
  assert.deepEqual(fog[0], [0, 96], 'the fog is filled from the floor');
  assert.deepEqual(chart.lines.map((each) => [each.line, each.good]), [[250, true], [500, false], [750, true], [1000, true]]);
  assert.ok(Math.abs(chart.horn - (110 / (n - 1)) * 320) < 0.1);
  assert.equal(barogram({ ...trace, n: 60 }, lifts).horn, null, 'a run over before the horn has none');
  assert.ok(chart.ceiling >= 80 + (n - 1) * 8);
  // A peak reached between two samples, and a line judged above every sample, both stay inside.
  const short = { ...trace, n: 4 };
  const reaching = barogram(short, [lift(250, 0), lift(500, 0)], { peak: 519 });
  assert.ok(reaching.ceiling >= 519 && reaching.lines.every((each) => each.y >= 0 && each.y <= 96));
  assert.equal(reaching.lines.length, 2);
});
