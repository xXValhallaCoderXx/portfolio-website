import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as GROUND from '../../src/game/ground.js';
import * as TERRAIN from '../../src/game/terrain.js';

// The world board's function flies runs with the game's own modules, bundled in by
// tools/build-functions.mjs, and deploys with nothing installed beside them but the firebase-*
// packages. So everything it reaches in the game must be pure: no package (three.js above all), none
// of the page's code. The build stops if that is ever not so; this says so first, in `npm test`.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Every module `entry` reaches by its static imports, and every package any of them names.
function reach(entry) {
  const files = new Set();
  const packages = new Set();
  const walk = (file) => {
    if (files.has(file)) return;
    files.add(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm)) {
      const spec = match[1] ?? match[2] ?? match[3];
      if (spec.startsWith('.')) walk(resolve(dirname(file), spec));
      else packages.add(spec);
    }
  };
  walk(entry);
  return { files: [...files].map((file) => relative(ROOT, file)).sort(), packages: [...packages].sort() };
}

test('what the function does reaches only pure modules of the game and its own, and no package', () => {
  const { files, packages } = reach(resolve(ROOT, 'functions/src/runs.js'));
  assert.deepEqual(packages, []);
  assert.deepEqual(files.filter((file) => !/^(?:functions\/src|src\/game)\/[\w-]+\.js$/.test(file)), []);
  // It replays runs, so it carries the step, and it never carries the ground's scenery.
  for (const needed of ['src/game/replay.js', 'src/game/run-step.js', 'src/game/ground.js', 'src/game/board-world.js']) assert.ok(files.includes(needed), needed);
  for (const page of ['src/game/terrain.js', 'src/game/scenery.js', 'src/game/game.js', 'src/game/good-lift.js']) assert.equal(files.includes(page), false, page);
});

test('the function\'s wiring adds only the firebase packages it deploys with', () => {
  const { packages } = reach(resolve(ROOT, 'functions/src/index.js'));
  assert.deepEqual(packages, ['firebase-admin/app', 'firebase-admin/firestore', 'firebase-functions/v2', 'firebase-functions/v2/https']);
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'functions/package.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), ['firebase-admin', 'firebase-functions']);
  // Pinned, so a deploy installs what was tested; the main file is the bundle, on Node 22.
  for (const version of Object.values(manifest.dependencies)) assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual([manifest.type, manifest.main, manifest.engines.node], ['module', 'lib/index.js', '22']);
});

test('ground.js imports nothing, and the page\'s terrain hands on its very functions, so the page and a replay stand on one ground', () => {
  const source = readFileSync(resolve(ROOT, 'src/game/ground.js'), 'utf8');
  assert.equal(/^\s*(?:import|export\s[^;]*\sfrom)\b/m.test(source), false);
  for (const name of ['GATEWAY', 'centerX', 'heightAt', 'surfaceAt']) assert.equal(TERRAIN[name], GROUND[name], name);
  // Every place to land is a plateau the ground cuts, where it cuts it.
  assert.deepEqual(TERRAIN.ZONES.map(({ id, x, z, r, h }) => ({ id, x, z, r, h })), GROUND.PLATEAUS.map(({ id, x, z, r, h }) => ({ id, x, z, r, h })));
});
