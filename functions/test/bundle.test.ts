import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import * as GROUND from '../../src/domains/flight/ground.ts';
import * as TERRAIN from '../../src/adapters/rendering/terrain.ts';
import { closure } from '../../tools/source-graph.ts';
const ROOT = resolve(import.meta.dirname, '../..');
function reach(entry: string) {
  const files = new Set<string>(), packages = new Set<string>();
  function walk(file: string) {
    for (const reached of closure(file).files) files.add(reached);
  }
  walk(resolve(ROOT, entry));
  // Type-only imports never contribute runtime packages.
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/^import\s+(?!type\b)[^'"\n]*from\s+['"]([^.'"][^'"]+)['"]/gm)) packages.add(match[1]);
  }
  return { files: [...files].map(file => relative(ROOT, file)).sort(), packages: [...packages].sort() };
}
test('server judging reaches shared domains, the crypto adapter and server modules', () => {
  const { files, packages } = reach('functions/src/runs.ts');
  assert.deepEqual(packages, []);
  assert.deepEqual(files.filter(file => !/^(?:functions\/src|src\/domains|src\/adapters\/crypto)\//.test(file)), []);
  for (const needed of ['src/domains/good-lift/replay.ts', 'src/domains/good-lift/run-step.ts', 'src/domains/flight/ground.ts', 'src/domains/good-lift/board-world.ts']) assert.ok(files.includes(needed), needed);
});
test('the Firebase wiring adds only its declared packages and targets Node 22', () => {
  assert.deepEqual(reach('functions/src/index.ts').packages, ['firebase-admin/app', 'firebase-admin/firestore', 'firebase-functions/v2', 'firebase-functions/v2/https']);
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'functions/package.json'), 'utf8')) as { dependencies: Record<string,string>; type: string; main: string; engines: {node:string} };
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), ['firebase-admin', 'firebase-functions']);
  for (const version of Object.values(manifest.dependencies)) assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual([manifest.type, manifest.main, manifest.engines.node], ['module', 'lib/index.js', '22']);
});
test('rendered terrain and server simulation share identical ground functions and plateaus', () => {
  const source = readFileSync(resolve(ROOT, 'src/domains/flight/ground.ts'), 'utf8');
  assert.equal(/^\s*(?:import|export\s[^;]*\sfrom)\b/m.test(source), false);
  assert.equal(TERRAIN.GATEWAY, GROUND.GATEWAY);
  assert.equal(TERRAIN.centerX, GROUND.centerX); assert.equal(TERRAIN.heightAt, GROUND.heightAt); assert.equal(TERRAIN.surfaceAt, GROUND.surfaceAt);
  const shape = ({id,x,z,r,h}: {id:string;x:number;z:number;r:number;h:number}) => ({id,x,z,r,h});
  assert.deepEqual(TERRAIN.ZONES.map(shape), GROUND.PLATEAUS.map(shape));
});
