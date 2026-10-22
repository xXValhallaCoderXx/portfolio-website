import test from 'node:test';
import assert from 'node:assert/strict';
import { styleLine, type ComboFacts } from './style-line.ts';

const facts: ComboFacts = { phase: 'move', move: 1, elements: 1, links: 1, pending: 10, points: 10, sequence: [1], bankProgress: 0 };
test('move sequence and chain multiplier stay distinct from additive banked acro', () => {
  assert.deepEqual(styleLine(facts), { label: 'PITCH', detail: '+10 · chain ×1 · 10 pending' });
  assert.deepEqual(styleLine({ ...facts, elements: 2, links: 2, pending: 50, points: 30, sequence: [4, 2] }), {
    label: 'SPIRAL 360 → WINGOVER', detail: '+30 · chain ×1 · 50 pending',
  });
  assert.deepEqual(styleLine({ ...facts, phase: 'multiplier', elements: 3, links: 3, points: 100, pending: 150, sequence: [4, 2, 3] }), {
    label: 'SPIRAL 360 → WINGOVER → LOOP', detail: '+100 · chain ×1.5 · 150 pending',
  });
  assert.deepEqual(styleLine({ ...facts, phase: 'banked', elements: 3, points: 150, sequence: [4, 2, 3] }), {
    label: 'BANKED +150 ACRO', detail: 'SPIRAL 360 → WINGOVER → LOOP',
  });
});
test('a reset chain and bounded sequence retain truthful pending and banking wording', () => {
  assert.deepEqual(styleLine({ ...facts, phase: 'pending', elements: 3, links: 0, pending: 35, sequence: [1, 1, 1] }), {
    label: 'PITCH → PITCH → PITCH', detail: 'chain ×1 · 35 pending',
  });
  assert.deepEqual(styleLine({ ...facts, phase: 'pending', move: 3, elements: 8, links: 8, pending: 1235, sequence: [4, 2, 3], bankProgress: 0.5 }), {
    label: '+5 · SPIRAL 360 → WINGOVER → LOOP', detail: 'chain ×3 · 1,235 pending · banking',
  });
  assert.deepEqual(styleLine({ ...facts, phase: 'lost' }), { label: 'COMBO ENDED', detail: 'pending acro lost' });
});
