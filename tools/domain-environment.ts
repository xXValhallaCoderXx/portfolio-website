import ts from 'typescript';

const globals = new Set(['window', 'document', 'localStorage', 'sessionStorage', 'globalThis', 'fetch', 'crypto', 'performance', 'Audio', 'AudioContext', 'setTimeout', 'setInterval', 'requestAnimationFrame']);

/** Inspect executable references, ignoring comments, strings and similarly named data fields. */
export function domainEnvironmentUses(text: string): string[] {
  const source = ts.createSourceFile('domain.ts', text, ts.ScriptTarget.Latest, true);
  const found = new Set<string>();
  function visit(node: ts.Node) {
    if (ts.isIdentifier(node) && globals.has(node.text)) {
      const parent = node.parent;
      const property = ts.isPropertyAccessExpression(parent) && parent.name === node ||
        (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) && parent.name === node;
      if (!property) found.add(node.text);
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) &&
      (node.expression.text === 'Date' && node.name.text === 'now' || node.expression.text === 'Math' && node.name.text === 'random'))
      found.add(node.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  return [...found].sort();
}
