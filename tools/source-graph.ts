import ts from 'typescript';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface SourceImports { statics: string[]; dynamics: string[]; types: string[] }
export function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ?
    sourceFiles(join(root, entry.name)) : /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [join(root, entry.name)] : []);
}
export function importsOf(file: string): SourceImports {
  if (!/\.(?:ts|tsx)$/.test(file)) return { statics: [], dynamics: [], types: [] };
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const result: SourceImports = { statics: [], dynamics: [], types: [] };
  const target = (name: string) => {
    if (!name.startsWith('.')) return name;
    const at = resolve(dirname(file), name);
    for (const path of [at, `${at}.ts`, `${at}.tsx`, join(at, 'index.ts'), join(at, 'index.tsx')]) if (existsSync(path)) return path;
    throw new Error(`${file} imports missing module ${name}`);
  };
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const names = clause?.namedBindings;
      const onlyTypes = clause?.isTypeOnly || !clause?.name && names && ts.isNamedImports(names) && names.elements.length > 0 && names.elements.every(item => item.isTypeOnly);
      result[onlyTypes ? 'types' : 'statics'].push(target(node.moduleSpecifier.text));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      result[node.isTypeOnly ? 'types' : 'statics'].push(target(node.moduleSpecifier.text));
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      result.dynamics.push(target(node.arguments[0].text));
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}
export function closure(root: string): { files: Set<string>; doors: Set<string> } {
  const files = new Set<string>(), doors = new Set<string>();
  function visit(file: string) {
    if (!file.startsWith('/') || files.has(file)) return;
    files.add(file);
    const imports = importsOf(file);
    imports.statics.forEach(visit);
    imports.dynamics.forEach(target => doors.add(target));
  }
  visit(root);
  return { files, doors };
}
export function beforeDoor(entry: string, door: string): Set<string> {
  const files = new Set<string>(), seen = new Set<string>(), queue = [entry];
  while (queue.length) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    const reached = closure(next);
    reached.files.forEach(file => files.add(file));
    for (const target of reached.doors) if (target !== door && target.startsWith('/')) queue.push(target);
  }
  return files;
}
