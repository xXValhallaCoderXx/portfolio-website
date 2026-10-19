// Bundles the world board's function (functions/src/index.ts) into the one file Firebase deploys,
// functions/lib/index.js. The function replays runs with the game's own pure modules (recorder,
// replay, the step, the sky, the meet, the kettlebells, the ground), which it imports from src/domains
// by path, and those are not in functions/, so they are bundled in here; the firebase-* packages
// stay outside, installed in functions/ (npm --prefix functions install). firebase.json runs this
// before `firebase deploy --only functions`; run it by hand with `npm run build:functions`.
//
// The bundle carries those domains and the portable crypto adapter: no package (three.js above all) and none of
// the page's code. A run is flown on ground.js, not terrain.js, so it needs neither, and if a change
// ever makes the step reach for them again, this stops with the module that did rather than ship it.
import { build } from 'vite';
import { gzipSync } from 'node:zlib';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = /^firebase-(?:functions|admin)(?:\/|$)/;
const BANNER = '// Built by tools/build-functions.ts from functions/src, src/domains and src/adapters/crypto: edit those, not this.';

const out = await build({
  root,
  configFile: false,
  publicDir: false,
  logLevel: 'warn',
  ssr: { noExternal: true },
  build: {
    ssr: resolve(root, 'functions/src/index.ts'),
    outDir: resolve(root, 'functions/lib'),
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rolldownOptions: {
      external: (id) => PACKAGES.test(id) || id.startsWith('node:'),
      output: { format: 'es', entryFileNames: 'index.js', banner: BANNER },
    },
  },
});

const chunks = (Array.isArray(out) ? out : [out]).flatMap(each => {
  if (!('output' in each)) throw new Error('Unexpected watch build');
  return each.output;
}).filter(item => item.type === 'chunk');
const problems = [];
if (chunks.length !== 1) problems.push(`${chunks.length} chunks, where the function deploys one file`);
for (const chunk of chunks) {
  for (const id of chunk.moduleIds) {
    const file = relative(root, id);
    if (!/^(?:functions\/src|src\/domains|src\/adapters\/crypto)\//.test(file)) problems.push(`it carries ${file}`);
  }
  for (const name of [...chunk.imports, ...chunk.dynamicImports]) {
    if (!PACKAGES.test(name) && !name.startsWith('node:')) problems.push(`it imports ${name}`);
  }
}
if (problems.length) {
  console.error(`The world board's function would not deploy as it should:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
const [chunk] = chunks;
const gzip = gzipSync(chunk.code, { level: 9 }).length;
console.log(`functions/lib/${chunk.fileName}  ${(chunk.code.length / 1024).toFixed(1)} KB  ${(gzip / 1024).toFixed(1)} KB gzip  from ${chunk.moduleIds.length} modules`);
