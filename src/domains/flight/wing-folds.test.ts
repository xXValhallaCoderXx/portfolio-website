import test from 'node:test';
import assert from 'node:assert/strict';
import { FAILURES, canInduce, copyFlight, createFlight, induceFailure, settleFlight, stepFlight } from './flight.ts';
import { GLIDERS } from '../good-lift/gliders.ts';
import { LAB_STEP, pair } from '../../test/helpers/flight-lab.ts';
import { flyFailure } from '../../test/helpers/test-failures.ts';

const WINGS = ['classic', ...GLIDERS];

test('what each wing can be made to have: the classic wing a front collapse and a stall, the gliders as they are certified', () => {
  const can = (wing: string) => FAILURES.filter(kind => canInduce(wing, kind));
  assert.deepEqual(can('classic'), ['frontal', 'stall']);
  assert.deepEqual(can('en-a'), ['asym', 'frontal'], 'the A folds but cannot be stalled');
  assert.deepEqual(can('en-b'), ['asym', 'frontal', 'stall', 'deep']);
  assert.deepEqual(can('en-c'), ['asym', 'frontal', 'stall', 'spin', 'cravat', 'deep']);
  assert.deepEqual(can('en-d'), ['asym', 'frontal', 'stall', 'spin', 'cravat', 'deep']);
  assert.deepEqual(can('acro'), [...FAILURES], 'and only the acro wing twists its lines');
});

test('a failure a wing cannot have is refused and changes nothing', () => {
  for (const wing of WINGS) for (const kind of FAILURES) {
    if (canInduce(wing, kind)) continue;
    const g = createFlight({ x: 0, y: 2000, z: 0 }, wing), before = structuredClone(g);
    assert.equal(induceFailure(g, kind, -1, 0.5), false, `${wing} ${kind}`);
    assert.deepEqual(g, before);
  }
});

test('a front collapse started on any wing folds it at once and, hands up, it opens and flies on', () => {
  for (const wing of WINGS) {
    const g = createFlight({ x: 0, y: 3000, z: 0 }, wing);
    assert.ok(induceFailure(g, 'frontal'), wing);
    assert.equal(g.wingPhase, 'frontal'); assert.ok(g.tuck > 0.75, 'folded at once');
    let open = 0;
    while (g.tuck > 0 && open < 600) { stepFlight(g, pair(0), {}, LAB_STEP); open += 1; }
    // A glider's opens as its class does (glider-recovery.test.js), the D's the slowest.
    assert.ok(open * LAB_STEP < 4, `${wing} opens hands up as a front collapse does: ${open * LAB_STEP} s`);
    // Left to itself it surges and swings: the classic wing, undamped, for a long time; it flies on all the same.
    const flight = flyFailure(wing, 'frontal', { seconds: 40 });
    assert.deepEqual(flight.seen, ['frontal'], `${wing}: a front collapse and nothing else`);
    assert.ok(flight.seconds < (wing === 'classic' ? 30 : 15), `${wing} flies steady again: ${flight.seconds}`);
    assert.ok(flight.turned < 20, `${wing} straight on: ${flight.turned}°`);
  }
});

test('a glider\'s new readouts start at 0, settle back to 0, and the classic wing never has any', () => {
  for (const wing of WINGS) {
    const g = createFlight({ x: 0, y: 2000, z: 0 }, wing);
    const readouts = () => [g.foldLeft, g.foldRight, g.cravatLeft, g.cravatRight, g.deepStall, g.twist, g.twisted];
    assert.deepEqual(readouts(), [0, 0, 0, 0, 0, 0, 0], wing);
    // Through a stall held and let go, a spiral and a front collapse: nothing the classic wing can do folds a half.
    for (let i = 0; i < 300; i++) stepFlight(g, pair(1), {}, LAB_STEP);
    for (let i = 0; i < 600; i++) stepFlight(g, pair(i < 300 ? 0 : 0.82, 0), {}, LAB_STEP);
    induceFailure(g, 'frontal');
    for (let i = 0; i < 300; i++) stepFlight(g, pair(0), {}, LAB_STEP);
    if (wing === 'classic') assert.deepEqual(readouts(), [0, 0, 0, 0, 0, 0, 0]);
    settleFlight(g, undefined, wing);
    assert.deepEqual(readouts(), [0, 0, 0, 0, 0, 0, 0], `${wing} settles clear`);
    const s = g.physical;
    assert.deepEqual([s.foldL, s.foldR, s.tipL, s.tipR, s.pumpL, s.pumpR, s.deepStall, s.creep, s.twist, s.twistRate, s.twistYaw],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  }
});

test('a copy of a failing wing carries its failure and flies on exactly as the wing does', () => {
  for (const [wing, kind] of [['en-d', 'asym'], ['en-c', 'cravat'], ['acro', 'twist'], ['en-b', 'deep']] as const) {
    const g = createFlight({ x: 0, y: 3000, z: 0 }, wing);
    induceFailure(g, kind, -1);
    for (let i = 0; i < 30; i++) stepFlight(g, pair(0, 0.3), {}, LAB_STEP);
    const copy = copyFlight(createFlight({ x: 0, y: 0, z: 0 }, wing), g);
    for (let i = 0; i < 120; i++) { stepFlight(g, pair(0.82, 0), {}, LAB_STEP); stepFlight(copy, pair(0.82, 0), {}, LAB_STEP); }
    assert.deepEqual(copy.physical, g.physical, `${wing} ${kind}`);
    assert.deepEqual([copy.foldLeft, copy.cravatLeft, copy.deepStall, copy.twist], [g.foldLeft, g.cravatLeft, g.deepStall, g.twist]);
  }
});
