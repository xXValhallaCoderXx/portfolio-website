import test from 'node:test';
import assert from 'node:assert/strict';
import { NOISE, WIND_TONE, noiseReach, windLevelDb, windTone } from './wind-tone.ts';
import { FLIGHT } from '../../../domains/flight/flight.ts';

test('at trim in smooth air the classic wing\'s wind is exactly as it was', () => {
  const tone = windTone(FLIGHT.speed.trim, FLIGHT.speed.trim, 1, 0);
  assert.equal(tone.loud, 0.02 + FLIGHT.speed.trim * 0.004);
  assert.equal(tone.bright, 480);
  assert.equal(tone.whistle, 0);
  assert.equal(tone.buffet, 0);
  // Below the old cap the brightness is the old line, and above it the wind keeps brightening.
  assert.equal(windTone(20, 11.5, 1, 0).bright, 480 + 8.5 * 28);
  assert.ok(windTone(30, 11.5, 1, 0).bright > 900);
  assert.equal(windTone(80, 11.5, 1, 0).bright, WIND_TONE.bright.high);
});

test('the whistle grows with the square of the speed over the wing\'s own trim, rising in pitch', () => {
  const w = (over: number) => windTone(12 + over, 12, 1, 0);
  assert.equal(w(0).whistle, 0);
  assert.ok(Math.abs(w(6).whistle - WIND_TONE.whistle.gain / 4) < 1e-12, 'half way over, a quarter as loud');
  assert.equal(w(12).whistle, WIND_TONE.whistle.gain);
  assert.equal(w(30).whistle, WIND_TONE.whistle.gain);
  assert.ok(w(9).whistleAt > w(3).whistleAt);
  assert.equal(windTone(12, 13, 1, 0).whistle, 0, 'slower than trim, no whistle');
});

test('the buffet comes with the load or the rough air, whichever is more, and never in smooth level flight', () => {
  assert.equal(windTone(12, 12, 1.2, 0.1).buffet, 0);
  assert.ok(windTone(12, 12, 2, 0).buffet > 0);
  assert.equal(windTone(12, 12, 3.5, 0).buffet, WIND_TONE.buffet.gain);
  assert.ok(windTone(12, 12, 1, 0.6).buffet > 0);
  assert.equal(windTone(12, 12, 1, 2).buffet, WIND_TONE.buffet.gain);
  const out = { loud: 0, bright: 0, whistle: 0, whistleAt: 0, buffet: 0 };
  assert.equal(windTone(12, 12, 1, 0, out), out, 'written in place');
});

test('the wind\'s level is worked out as Chromium measured it, and holds at any sample rate', () => {
  // Measured in Chromium (BS.1770 RMS) before the noise was scaled: -42.8 dBFS for the classic wing at trim.
  const trim = FLIGHT.speed.trim;
  for (const rate of [44100, 48000]) assert.ok(Math.abs(windLevelDb(trim, trim, rate) + 42.8) < 0.3, String(rate));
  assert.equal(noiseReach(NOISE.rate), 1, 'at 48 kHz the noise is as it always was');
  for (const rate of [44100, 96000, 192000]) assert.ok(Math.abs(windLevelDb(trim, trim, rate) - windLevelDb(trim, trim, NOISE.rate)) < 0.05, String(rate));
  // Slower is quieter and duller; the bar is louder.
  assert.ok(windLevelDb(9.1, trim, 48000) < windLevelDb(trim, trim, 48000) - 1.5);
  assert.ok(windLevelDb(15.3, trim, 48000) > windLevelDb(trim, trim, 48000) + 2);
});
