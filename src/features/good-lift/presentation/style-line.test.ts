import test from 'node:test';
import assert from 'node:assert/strict';
import { styleLine, type ComboFacts } from './style-line.ts';

const facts: ComboFacts = { phase: 'move', move: 1, elements: 1, links: 1, pending: 10, points: 10, scoreMultiplier: 1 };
test('move count, chain multiplier and banked score multiplier have distinct labels', () => {
  assert.deepEqual(styleLine(facts), { label: 'PITCH · +10', detail: '10 pending' });
  assert.deepEqual(styleLine({ ...facts, elements: 2, links: 2, pending: 20 }), {
    label: 'PITCH · +10', detail: '2 moves · chain ×1 · 20 pending',
  });
  assert.deepEqual(styleLine({ ...facts, phase: 'multiplier', elements: 3, links: 3, points: 15, pending: 35 }), {
    label: 'COMBO 3 · chain ×1.5', detail: 'PITCH +15 · 35 pending',
  });
  assert.deepEqual(styleLine({ ...facts, phase: 'banked', elements: 3, points: 35, scoreMultiplier: 1.035 }), {
    label: 'COMBO BANKED · +35 STYLE', detail: 'score ×1.03',
  });
});
test('a reset chain keeps finite pending wording and saturated chains stay capped', () => {
  assert.deepEqual(styleLine({ ...facts, phase: 'pending', elements: 3, links: 0, pending: 35 }), {
    label: 'COMBO 3 · chain ×1', detail: '35 pending',
  });
  assert.deepEqual(styleLine({ ...facts, phase: 'pending', move: 3, elements: 8, links: 8, pending: 1234 }), {
    label: 'COMBO 8 · chain ×3', detail: '1,234 pending',
  });
  assert.deepEqual(styleLine({ ...facts, phase: 'lost' }), { label: 'COMBO ENDED', detail: 'recover calmly' });
});
