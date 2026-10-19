import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { sourceFiles } from './source-graph.ts';

const gate = process.argv[2] ?? 'all';
if (!['all', 'core', 'opening'].includes(gate)) throw new Error('Test gate must be all, core or opening');
const files = ['src', 'functions/test'].flatMap(root => sourceFiles(resolve(root))).filter(file => file.endsWith('.test.ts'))
  .filter(file => gate === 'all' || file.endsWith('opening-guidance.test.ts') === (gate === 'opening')).sort();
if (!files.length) throw new Error('No tests discovered');
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
