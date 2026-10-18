import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIM_VERSION } from './sim-version.js';
import { BRAKE, FLIGHT, PITCH, STALL, PHYSICS } from './flight.js';
import { ATMOSPHERE } from './atmosphere.js';
import { RUN_RULES } from './run-rules.js';
import { BANDS, WATCH } from './swing-watch.js';
import { STYLE } from './meet-style.js';
import { SCORE } from './score.js';
import * as SKY from './cloudbase-state.js';
import { RUN } from './run-step.js';
import { BAIT, MEET, MEET_POOL, SCATTER, THUNDER, TRAIL, WIND } from './meet-state.js';
import { BLESSING, GATES, RUNE } from './meet-runes.js';
import { BEAST, BELLS, BELL_POOL } from './bells.js';
import { ZONES, surfaceAt } from './terrain.js';

// Pin the current release's tables. A physical or scoring change requires a new version and pin.
const FINGERPRINT = 'af831e72';

// Everything a run is flown by that is a number rather than code: the wing's tables, every one of
// the sky's, the step's, the meet's (its plates off the trail and its rune gates and blessings with
// it, and the runes' own numbers, which say what a seed's gates offer) and the kettlebells' (the
// Beast's with them), where each landing zone is cut into the ground (each its x, z, r and h), and
// the ground under the whole sky, to the centimetre, every 10 m across its square. And, since style
// multiplies the total a run is ranked by and the server works it out again from the log, what a
// trick is worth: the swing watch's and the style's tables and the score's. Code changes are caught
// elsewhere: by the goldens in run-step.test.js, the reference pilots' pins, and replays of logs
// recorded in browsers.
function material() {
  const zone = SKY.CLOUD_ZONE;
  const ground = [];
  for (let dz = -zone.r; dz <= zone.r; dz += 10) {
    for (let dx = -zone.r; dx <= zone.r; dx += 10) ground.push(Math.round(surfaceAt(zone.x + dx, zone.z + dz) * 100));
  }
  return {
    FLIGHT, BRAKE, STALL, PITCH, BANDS, WATCH, STYLE, SCORE, PHYSICS, ATMOSPHERE, RUN_RULES,
    ...Object.fromEntries(Object.entries(SKY).filter(([name]) => name.startsWith('CLOUD_'))),
    RUN, MEET, TRAIL, MEET_POOL, WIND, THUNDER, BAIT, SCATTER, GATES, BLESSING, RUNE, BELLS, BELL_POOL, BEAST,
    ZONES: ZONES.map(({ x, z, r, h }) => ({ x, z, r, h })),
    ground,
  };
}

// JSON with every object's keys in order, so the text says what the tables hold and nothing about
// the order they were written in. Every number is written the shortest way that reads back as
// itself, so two numbers that differ by a bit are written differently.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  return JSON.stringify(value);
}

// FNV-1a, 32 bits, over the canonical text, as eight hex digits.
function fingerprint(tables) {
  const text = canonical(tables);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

test('sim-version.js imports nothing, so the page can tell which rules a link was flown under without loading the game', () => {
  const source = readFileSync(new URL('./sim-version.js', import.meta.url), 'utf8');
  assert.equal(/^\s*(?:import|export\s[^;]*\sfrom)\b/m.test(source), false);
  assert.ok(Number.isSafeInteger(SIM_VERSION) && SIM_VERSION >= 0);
});

test('any change to how a run flies changes the fingerprint and needs a new SIM_VERSION', (t) => {
  const print = fingerprint(material());
  assert.equal(print, FINGERPRINT,
    `The tables a run is flown by are not the ones SIM_VERSION ${SIM_VERSION} shipped with (they now print ${print}), so every ` +
    `link and board row flown under it would replay to a different run. Put them back, or bump SIM_VERSION in ` +
    `sim-version.js and pin FINGERPRINT = '${print}' here (a new version is a new Daily Sky and a new board).`);
});

test('the fingerprint moves with every number in the tables, every landing zone and the ground under the sky, and with nothing else', () => {
  const tables = material();
  const print = fingerprint(tables);
  // Every table a run is flown by is in it, and the whole of the ground's grid.
  const names = Object.keys(tables);
  for (const name of ['FLIGHT', 'BRAKE', 'STALL', 'PITCH', 'CLOUD_ZONE', 'CLOUD_GATE', 'CLOUD_LAUNCH', 'CLOUD_WEAR', 'CLOUD_HUNT', 'CLOUD_RAVENS', 'CLOUD_STRIKE', 'CLOUD_STORM', 'CLOUD_WIND', 'CLOUD_GUST', 'CLOUD_POOL',
    'PHYSICS', 'ATMOSPHERE', 'CLOUD_WEATHER', 'RUN_RULES', 'MEET', 'TRAIL', 'MEET_POOL', 'WIND', 'THUNDER', 'BAIT', 'SCATTER', 'GATES', 'BLESSING', 'RUNE', 'BELLS', 'BELL_POOL', 'BEAST']) {
    assert.ok(names.includes(name), name);
  }
  assert.equal(tables.ground.length, (Math.floor(2 * SKY.CLOUD_ZONE.r / 10) + 1) ** 2);
  assert.equal(tables.ZONES.length, 4);
  // Each number nudged by itself, one at a time, gives another fingerprint.
  const copy = structuredClone(tables);
  const numbers = [];
  const seen = new WeakSet();
  const walk = (holder, path) => {
    // Weather and cloud drift share one speed table. Mutating a shared parameter twice is
    // the same mutation, even though canonical JSON includes it at two public paths.
    if (seen.has(holder)) return;
    seen.add(holder);
    for (const key of Object.keys(holder)) {
      const value = holder[key];
      if (typeof value === 'number') numbers.push([holder, key, `${path}.${key}`]);
      else if (value !== null && typeof value === 'object') walk(value, `${path}.${key}`);
    }
  };
  walk(copy, 'tables');
  assert.ok(numbers.length > 1000, `${numbers.length} numbers`);
  const prints = new Set([print]);
  for (const [holder, key, path] of numbers) {
    const was = holder[key];
    holder[key] = was === 0 ? 1e-6 : was * (1 + 1e-9);
    const moved = fingerprint(copy);
    holder[key] = was;
    assert.notEqual(moved, print, path);
    prints.add(moved);
  }
  assert.equal(prints.size, numbers.length + 1, 'every nudge a fingerprint of its own');
  assert.equal(fingerprint(copy), print);
  // The order the tables were written in is no part of them.
  const reversed = Object.fromEntries(Object.entries(tables).reverse().map(([name, table]) => [name,
    table !== null && typeof table === 'object' && !Array.isArray(table) ? Object.fromEntries(Object.entries(table).reverse()) : table]));
  assert.equal(fingerprint(reversed), print);
});
