import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrderBookService } from './orderbook.service.ts';

test('worker model preserves fractional update debt and stable initialization', () => {
  const model = createOrderBookService(() => 0.5);
  model.initialize();
  assert.equal(model.step(25).applied, 0);
  const next = model.step(25);
  assert.equal(next.applied, 1);
  assert.equal(next.mid, 100);
  assert.equal(next.bids.length, 12);
  assert.equal(next.asks.length, 12);
  assert.ok(next.asks.every((amount) => amount >= 0 && amount <= 1));
});
