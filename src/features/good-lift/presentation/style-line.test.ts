import test from 'node:test';
import assert from 'node:assert/strict';
import { createStyle } from '../../../domains/good-lift/meet-style.ts';
import { styleLine } from './style-line.ts';

test('an under-band catch refreshes the combo multiplier while retaining pending points', () => {
  const style = createStyle();
  const watch = { clock: 0, moves: 0, moveKind: 1, moveBand: 1, moveSize: 1, breaks: 0, broke: 0, calm: 0 };
  const move = (band: number) => {
    Object.assign(watch, { clock: watch.clock + 1 / 60, moves: watch.moves + 1, moveBand: band });
    style.step(1 / 60, { watch: { state: watch } });
  };
  move(1); move(1); move(1);
  const before = styleLine('', 0, 'pitch ×3', style.state.pending, style.state.links);
  const pending = style.state.pending;
  assert.equal(before, 'pitch ×3 · ×1.5 · 35 pending');
  move(0);
  assert.equal(style.state.links, 0);
  assert.equal(style.state.pending, pending);
  const after = styleLine('', 0, 'pitch ×3', style.state.pending, style.state.links);
  assert.equal(after, 'pitch ×3 · ×1 · 35 pending');
  assert.notEqual(after, before, 'rendered text changes even when pending points do not');
});

test('style stamps and the saturated combo keep the existing compact wording', () => {
  assert.equal(styleLine('landed', 1234, '', -1, 0), 'BANKED +1,234');
  assert.equal(styleLine('lost', 35, '', -1, 0), 'lost +35');
  assert.equal(styleLine('', 0, '', -1, 0), '');
  assert.equal(styleLine('', 0, 'loop ×8', 1200, 8), 'loop ×8 · ×3 · 1,200 pending');
});
