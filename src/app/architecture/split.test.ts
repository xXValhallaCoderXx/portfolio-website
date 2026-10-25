import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { ENTRY, GOOD_LIFT_ENTRY, FLIGHT_ENTRY, RESULT, KIT, SOURCE_ROOT, runOnly, forbiddenDependency } from '../../../tools/architecture-policy.ts';
import { beforeDoor, closure, importsOf, sourceFiles } from '../../../tools/source-graph.ts';
import { domainEnvironmentUses } from '../../../tools/domain-environment.ts';

test('the portfolio and outdoor flight carry no Good Lift runtime or result UI before its lazy entry', () => {
  const page = beforeDoor(ENTRY, GOOD_LIFT_ENTRY);
  assert.ok(page.has(FLIGHT_ENTRY), 'outdoor flight is reachable');
  assert.deepEqual([...page].filter(runOnly), []);
  assert.equal(page.has(RESULT), false);
  assert.equal(page.has(KIT), false);
  assert.deepEqual(importsOf(resolve(SOURCE_ROOT, 'domains/progression/good-lift-key.ts')), { statics: [], dynamics: [], types: [] });
  // The game's own modules the page may hold, a link's rules and a glider's name among them, import nothing.
  for (const leaf of ['good-lift-address.ts', 'sim-version.ts', 'glider-ids.ts']) {
    assert.deepEqual(importsOf(resolve(SOURCE_ROOT, 'domains/good-lift', leaf)), { statics: [], dynamics: [], types: [] }, leaf);
  }
});
test('Good Lift has one dynamic entry and includes its result and kit presentation', () => {
  const importers = sourceFiles(SOURCE_ROOT).filter(file => !file.endsWith('.test.ts')).flatMap(file => {
    const imports = importsOf(file);
    assert.equal(imports.statics.includes(GOOD_LIFT_ENTRY), false, 'Good Lift cannot be imported eagerly');
    return imports.dynamics.includes(GOOD_LIFT_ENTRY) ? [file] : [];
  });
  assert.equal(importers.length, 1);
  const reached = closure(GOOD_LIFT_ENTRY).files;
  assert.ok(reached.has(RESULT)); assert.ok(reached.has(KIT));
  assert.equal(reached.has(FLIGHT_ENTRY), false, 'the run must not import its host controller');
  assert.equal(reached.has(resolve(SOURCE_ROOT, 'app/App.tsx')), false);
});
test('optional livery and helmet remain lazy and do not enter the initial portfolio bundle', () => {
  const first = closure(ENTRY).files;
  const flight = closure(FLIGHT_ENTRY);
  assert.ok(flight.files.has(resolve(SOURCE_ROOT, 'domains/progression/wing-kit.ts')));
  for (const module of ['livery', 'helmet']) {
    const file = resolve(SOURCE_ROOT, `adapters/rendering/${module}.ts`);
    assert.equal(first.has(file), false);
    assert.equal(flight.files.has(file), false);
    assert.ok(flight.doors.has(file));
  }
});
test('dependency policy rejects presentation in domains and feature dependencies in reusable UI', () => {
  const file = (name: string) => resolve(SOURCE_ROOT, name);
  for (const dependency of ['react', 'three', file('features/good-lift/presentation/cloudbase.ts'), file('adapters/browser/media-attention.service.ts')])
    assert.ok(forbiddenDependency(file('domains/flight/flight.ts'), dependency));
  assert.ok(forbiddenDependency(file('components/molecules/Sheet.tsx'), file('features/projects/pages/ProjectPage.tsx')));
  assert.equal(forbiddenDependency(file('domains/good-lift/replay.ts'), file('domains/flight/flight.ts')), null);
  assert.equal(runOnly(file('domains/good-lift/unrelated-name.ts')), true, 'classification follows ownership, not filename spelling');
});
test('domain purity checks reject environment reads without matching comments or data fields', () => {
  assert.deepEqual(domainEnvironmentUses('const window = Date.now(); const seed = Math.random(); fetch("/");'), ['Date.now', 'Math.random', 'fetch', 'window']);
  assert.deepEqual(domainEnvironmentUses('// window.fetch\nconst data = { window: 3 }; const elapsed = data.window; const text = "Date.now()";'), []);
});
