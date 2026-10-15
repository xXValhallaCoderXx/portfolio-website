import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The page's home must never carry the game beyond the arch: its sky, ravens, clouds, the meet,
// its meet sheet and the rest load only when a pilot is about to fly it (good-lift.js, through one
// import() in game.js). This walks the source's own imports to prove it, before any build is made.
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GAME = join(SRC, 'game');
const ENTRY = join(SRC, 'main.jsx');
const DOOR = join(GAME, 'good-lift.js');
// The components of the page's that belong to the game: the meet sheet, which comes with it, and
// the sheet's kit tab, which comes with the sheet.
const CARD = join(SRC, 'components', 'GoodLiftResult.jsx');
const KIT_TAB = join(SRC, 'components', 'GoodLiftKit.jsx');

// What only the game beyond the arch may load, by name: everything for the run's sky and its
// views, the shared step, the reference pilots, the meet and the game's music (which never plays
// over the fjord). The two leaf modules the page itself reads (the address and the sim version)
// are the exceptions.
const RUN_ONLY = /^(cloudbase|ravens|run-|good-lift|pilots|meet-|bells|recorder|replay|daily|board|music)/;
const PAGE_MAY = new Set(['good-lift-address.js', 'sim-version.js']);
const runOnly = (file) => file.startsWith(GAME + '/') && RUN_ONLY.test(file.slice(GAME.length + 1)) && !PAGE_MAY.has(file.slice(GAME.length + 1)) && !file.endsWith('.test.js');

// Every relative import of a file: static (`import … from`, `export … from`, bare `import '…'`)
// and dynamic (`import('…')`), resolved to files.
function importsOf(file) {
  const text = readFileSync(file, 'utf8');
  const near = (spec) => {
    const path = resolve(dirname(file), spec);
    for (const candidate of [path, `${path}.js`, `${path}.jsx`]) {
      try {
        if (readFileSync(candidate)) return candidate;
      } catch {}
    }
    throw new Error(`${file} imports ${spec}, which is not there`);
  };
  const statics = [...text.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"](\.[^'"]+)['"]|^\s*import\s+['"](\.[^'"]+)['"]/gm)].map((m) => near(m[1] ?? m[2]));
  const dynamics = [...text.matchAll(/import\(\s*['"](\.[^'"]+)['"]\s*\)/g)].map((m) => near(m[1]));
  return { statics, dynamics };
}

// Every file a root reaches, statically, and the dynamic import() targets met on the way.
function closure(root) {
  const seen = new Set();
  const doors = new Set();
  // Stylesheets count as reached too (the run's own good-lift.css is run-only), though only
  // scripts are read for imports of their own.
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!/\.(js|jsx)$/.test(file)) return;
    const { statics, dynamics } = importsOf(file);
    statics.forEach(walk);
    dynamics.forEach((target) => doors.add(target));
  };
  walk(root);
  return { files: seen, doors };
}

// The page as a visitor's browser loads it: the entry, and every chunk it can import() later,
// except the one door into the game.
function home() {
  const files = new Set();
  const queue = [ENTRY];
  const doors = new Set();
  while (queue.length) {
    const root = queue.shift();
    const reached = closure(root);
    reached.files.forEach((file) => files.add(file));
    for (const door of reached.doors) {
      if (door === DOOR || doors.has(door)) continue;
      doors.add(door);
      queue.push(door);
    }
  }
  return files;
}

test('the page, and everything it can load before the arch, carries none of the game beyond it', () => {
  const page = home();
  assert.ok(page.has(join(GAME, 'game.js')), 'the fjord is part of the page');
  const leaked = [...page].filter(runOnly).map((file) => file.slice(SRC.length + 1));
  assert.deepEqual(leaked, []);
  assert.deepEqual([CARD, KIT_TAB].filter((file) => page.has(file)), [], 'the meet sheet and its kit tab come only with the game');
});

test('the game beyond the arch is reached only through game.js, and none of it reaches back into the page', () => {
  const doorways = [];
  for (const name of readdirSync(SRC, { recursive: true })) {
    const file = join(SRC, name);
    if (!/\.(js|jsx)$/.test(file) || file.endsWith('.test.js')) continue;
    const { statics, dynamics } = importsOf(file);
    if (statics.includes(DOOR)) doorways.push(`${name} (static)`);
    if (dynamics.includes(DOOR)) doorways.push(name);
  }
  assert.deepEqual(doorways, ['game/game.js']);
  // The game reaches the page's shared pieces (flight, terrain, scenery, hints, the kit's leaf) and
  // its own meet sheet with the sheet's kit tab, never the engine or the page's other components.
  const { files } = closure(DOOR);
  assert.ok(files.has(CARD), 'the meet sheet comes with the game');
  assert.ok(files.has(KIT_TAB), 'and its kit tab with it');
  const back = [...files].filter((file) => file === join(GAME, 'game.js') || (file.startsWith(join(SRC, 'components')) && file !== CARD && file !== KIT_TAB) || file === join(SRC, 'App.jsx'));
  assert.deepEqual(back, []);
  // And nothing imports the meet sheet but the game, nor its kit tab but the sheet.
  const importers = { [CARD]: [], [KIT_TAB]: [] };
  for (const name of readdirSync(SRC, { recursive: true })) {
    const file = join(SRC, name);
    if (!/\.(js|jsx)$/.test(file) || file.endsWith('.test.js')) continue;
    const { statics, dynamics } = importsOf(file);
    for (const sheet of [CARD, KIT_TAB]) if (statics.includes(sheet) || dynamics.includes(sheet)) importers[sheet].push(name);
  }
  assert.deepEqual(importers[CARD], ['game/good-lift.js']);
  assert.deepEqual(importers[KIT_TAB], ['components/GoodLiftResult.jsx']);
});

test('the kit the page can wear loads only once it is worn: the livery and the helmet are imported, never carried', () => {
  // The engine and the glider read the kit worn from a leaf of its own, and fetch the livery and
  // the helmet with import() the first time either is worn, so the page of a visitor who wears
  // neither never loads them (the game's kit tab brings the livery, for its swatches); none of the
  // three is the game's.
  const page = home();
  const first = closure(ENTRY).files;
  const fjord = closure(join(GAME, 'game.js'));
  assert.ok(fjord.files.has(join(GAME, 'wing-kit.js')), 'the engine reads the kit worn');
  for (const lazy of ['livery.js', 'helmet.js']) {
    assert.ok(fjord.doors.has(join(GAME, lazy)), `${lazy} is fetched with import()`);
    assert.ok(!fjord.files.has(join(GAME, lazy)), `${lazy} is not in the engine's own bundle`);
    assert.ok(page.has(join(GAME, lazy)) && !runOnly(join(GAME, lazy)), `${lazy} is the page's, not the game's`);
  }
  for (const file of ['wing-kit.js', 'livery.js', 'helmet.js']) assert.ok(!first.has(join(GAME, file)), `${file} is not loaded with the page itself`);
});
