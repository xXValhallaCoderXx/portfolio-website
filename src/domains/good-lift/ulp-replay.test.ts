import type receiptFixture from '../../test/fixtures/good-lift-chromium.json';
import type brakeFixture from '../../test/fixtures/good-lift-brakes-chromium.json';
import type gliderFixture from '../../test/fixtures/good-lift-gliders-chromium.json';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeLog } from './recorder.ts';
import { replayLog } from './replay.ts';
import { classicScript, flyScript } from '../../test/helpers/flight-lab.ts';

// A run flown in one browser is judged again by another engine and by the board's Node function.
// JavaScript only promises correctly rounded + − × ÷ and √: an engine may round a sine, an
// arctangent or a power differently in the last bit. The solver quantizes its state every substep
// so such a difference never grows into another run. This holds every transcendental result one unit
// in the last place off, alternately up and down, and asks for the very same flights and sheets.
const TRANSCENDENTAL = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'exp', 'expm1', 'log', 'log1p', 'log2', 'log10',
  'pow', 'hypot', 'sinh', 'cosh', 'tanh', 'cbrt'] as const;

function offByOneUlp<T>(fly: () => T): T {
  const value = new Float64Array(1), low = new Uint32Array(value.buffer);
  const maths = Math as unknown as Record<string, (...args: number[]) => number>;
  const real = TRANSCENDENTAL.map(name => [name, maths[name]] as const);
  for (const [name, exact] of real) {
    maths[name] = (...args: number[]) => {
      const result = exact(...args);
      if (!Number.isFinite(result) || result === 0) return result;
      // Toggling the lowest mantissa bit moves a double by exactly one ulp and never carries.
      value[0] = result; low[0] ^= 1;
      return value[0];
    };
  }
  try {
    return fly();
  } finally {
    for (const [name, exact] of real) maths[name] = exact;
  }
}

const read = <T>(file: string) => JSON.parse(readFileSync(new URL(`../../test/fixtures/${file}`, import.meta.url), 'utf8')) as T;

test('the classic wing flies the same flight when every transcendental result is one ulp off', () => {
  const exact = flyScript(classicScript()).hash;
  assert.equal(offByOneUlp(() => flyScript(classicScript()).hash), exact);
});

test('recorded browser runs replay to the very same sheets when every transcendental result is one ulp off', () => {
  const runs = [
    ...read<typeof receiptFixture>('good-lift-chromium.json').records.filter(record => !record.pureFlight),
    ...read<typeof brakeFixture>('good-lift-brakes-chromium.json').records.filter(record => !record.pureFlight),
    // A run on every glider, each with a combo banked and strikes flown out.
    ...read<typeof gliderFixture>('good-lift-gliders-chromium.json').records,
  ];
  assert.ok(runs.length >= 11);
  for (const run of runs) {
    const decoded = decodeLog(run.link);
    assert.ok(decoded.ok, decoded.why!);
    assert.deepEqual(offByOneUlp(() => replayLog(decoded.log)), run.sheet, `${'name' in run ? run.name : 'kind' in run ? run.kind : run.glider}`);
  }
});
