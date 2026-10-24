import test from 'node:test';
import assert from 'node:assert/strict';
import { freeFormStatus } from './free-form-status.ts';

const calm = { stalled: false, collapsed: false, outside: false, destination: null };

test('ordinary manual flight is quiet; automatic travel reports its destination without instruction', () => {
  assert.equal(freeFormStatus(calm), '');
  assert.equal(freeFormStatus({ ...calm, destination: 'projects' }), 'Flying to projects');
});

test('physical failure and boundary correction take priority over automatic travel', () => {
  const auto = { ...calm, destination: 'experience', outside: true };
  assert.equal(freeFormStatus(auto), 'Returning to fjord');
  assert.equal(freeFormStatus({ ...auto, collapsed: true }), 'collapsed');
  assert.equal(freeFormStatus({ ...auto, collapsed: true, stalled: true }), 'stalled');
  assert.equal(freeFormStatus(calm), '', 'cleared conditions leave no lingering navigation tip');
});
