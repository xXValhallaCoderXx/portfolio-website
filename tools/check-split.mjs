// Proves, on a real build, that the page never carries the game beyond the arch: no chunk the
// page can load before the arch holds a run-only module (see src/game/split.test.js, which checks
// the source's own imports). Prints each chunk's size. Run with `npm run check:split`.
import { build } from 'vite';
import { gzipSync } from 'node:zlib';
import { basename } from 'node:path';

const RUN_ONLY = /^(cloudbase|ravens|run-|good-lift|pilots|meet-|bells|recorder|replay|daily|board)/;
const PAGE_MAY = new Set(['good-lift-address.js', 'sim-version.js']);
const runOnly = (id) => id.includes('/src/game/') && RUN_ONLY.test(basename(id)) && !PAGE_MAY.has(basename(id));

const out = await build({ logLevel: 'silent', build: { write: false } });
const chunks = new Map();
for (const output of Array.isArray(out) ? out : [out]) {
  for (const item of output.output) if (item.type === 'chunk') chunks.set(item.fileName, item);
}
const door = [...chunks.values()].find((chunk) => chunk.facadeModuleId?.endsWith('/src/game/good-lift.js'));
if (!door) throw new Error('No chunk starts at good-lift.js: is it still loaded with import()?');

// The page: the entry, what it imports, and every chunk it can import() later, but the door.
const home = new Set();
const queue = [...chunks.values()].filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName);
while (queue.length) {
  const name = queue.shift();
  if (home.has(name) || name === door.fileName) continue;
  home.add(name);
  const chunk = chunks.get(name);
  queue.push(...chunk.imports, ...chunk.dynamicImports);
}

let leaks = 0;
for (const name of home) {
  for (const id of chunks.get(name).moduleIds) {
    if (!runOnly(id)) continue;
    leaks += 1;
    console.error(`LEAK: ${name} carries ${id.split('/src/')[1]}`);
  }
}
for (const [name, chunk] of chunks) {
  const gzip = gzipSync(chunk.code, { level: 9 }).length;
  console.log(`${home.has(name) ? 'page ' : 'game '} ${name.padEnd(36)} ${(chunk.code.length / 1024).toFixed(1).padStart(7)} KB  ${(gzip / 1024).toFixed(1).padStart(6)} KB gzip`);
}
if (leaks) {
  console.error(`${leaks} run-only module(s) in the page's chunks`);
  process.exit(1);
}
console.log('split ok: the page carries none of the game beyond the arch');
