import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOURCE_ROOT, sourcePath, forbiddenDependency } from './architecture-policy.ts';
import { importsOf, sourceFiles } from './source-graph.ts';
import { domainEnvironmentUses } from './domain-environment.ts';
const failures: string[] = [];
for (const file of sourceFiles(SOURCE_ROOT).filter(file => !file.endsWith('.test.ts') && !file.includes('/test/'))) {
  const imports = importsOf(file);
  for (const dependency of [...imports.statics, ...imports.dynamics, ...imports.types]) {
    const reason = forbiddenDependency(file, dependency);
    if (reason) failures.push(`${file} → ${dependency}: ${reason}`);
  }
  if (sourcePath(file).startsWith('domains/')) {
    for (const name of domainEnvironmentUses(readFileSync(file, 'utf8')))
      failures.push(`${file}: domain reads environment ${name}; inject it through a port`);
  }
}
assert.deepEqual(failures, [], failures.join('\n'));
console.log('architecture ok: domains and shared UI respect their dependencies');
