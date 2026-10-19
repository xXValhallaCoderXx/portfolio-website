import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore, kitSheet } from '../../../domains/progression/good-lift-store.ts';
import { emptyKit } from '../../../domains/progression/wing-kit.ts';
import { buildKitView } from './kit-view.service.ts';

test('kit view derives unlock progress and independent choices without changing progression', () => {
  const store = emptyStore();
  store.tonnage = 75;
  const sheet = kitSheet(store, { ...emptyKit(), wing: 'raven' }, ['raven']);
  const before = structuredClone(sheet);
  const view = buildKitView(sheet);
  assert.ok(view.fresh.has('raven'));
  assert.ok(view.wings.includes('standard'));
  assert.equal(view.piece('standard').earned, true);
  assert.ok(view.done >= 0 && view.done <= 1);
  view.state(view.piece('raven'));
  assert.deepEqual(sheet, before);
});
