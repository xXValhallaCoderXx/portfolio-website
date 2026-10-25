import { relative, resolve, sep } from 'node:path';

export const SOURCE_ROOT = resolve(import.meta.dirname, '../src');
export const ENTRY = resolve(SOURCE_ROOT, 'main.tsx');
export const GOOD_LIFT_ENTRY = resolve(SOURCE_ROOT, 'features/good-lift/services/good-lift-session.service.ts');
export const FLIGHT_ENTRY = resolve(SOURCE_ROOT, 'features/flight/services/flight-session.service.ts');
export const RESULT = resolve(SOURCE_ROOT, 'features/good-lift/components/GoodLiftResult.tsx');
export const KIT = resolve(SOURCE_ROOT, 'features/good-lift/components/GoodLiftKit.tsx');
// Good Lift's modules the page may hold before the game loads: each imports nothing.
const leaves = new Set(['domains/good-lift/good-lift-address.ts', 'domains/good-lift/sim-version.ts', 'domains/good-lift/glider-ids.ts']);
export const sourcePath = (file: string) => relative(SOURCE_ROOT, file.split('?')[0]).split(sep).join('/');
export function runOnly(file: string): boolean {
  const name = sourcePath(file);
  return name.startsWith('adapters/crypto/') || name.startsWith('features/good-lift/') || name.startsWith('domains/good-lift/') && !leaves.has(name) ||
    name === 'domains/progression/good-lift-store.ts' || name === 'adapters/browser/good-lift-storage.service.ts';
}
export function forbiddenDependency(from: string, to: string): string | null {
  const owner = sourcePath(from), dependency = to.startsWith('.') ? sourcePath(resolve(from, '..', to)) :
    to.startsWith('/') ? sourcePath(to) : to;
  if (owner.startsWith('domains/') && /^(?:features|app|components|adapters)\//.test(dependency)) return 'domain depends on presentation or an adapter';
  if (owner.startsWith('domains/') && /^(?:react(?:-dom)?(?:\/|$)|three(?:\/|$)|node:)/.test(dependency)) return 'domain depends on an environment';
  if (owner.startsWith('components/') && /^(?:features|app|domains)\//.test(dependency)) return 'shared UI depends on a feature or domain';
  return null;
}
