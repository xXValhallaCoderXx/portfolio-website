import test from 'node:test';
import assert from 'node:assert/strict';
import { RUN_EFFECTS, runEffects } from './run-effects.ts';

const struck = { collapse: 2.4, shield: 8, cloud: 1 };
const target = (mode: string, pilot: { collapse: number; cloud: number } | null = struck, verticalSpeed = 15, fogClearance = 300, eyeDepth = 0) =>
  runEffects(mode, pilot, verticalSpeed, fogClearance, eyeDepth, { fold: 9, veil: 9, shake: 9, gaze: 9 });

test('nothing of a run reaches free flight, the result screen, the backdrop or the missing page', () => {
  for (const mode of ['intro', 'flying', 'cloudbase-ended', 'landed', 'launching', 'lost']) {
    assert.deepEqual(target(mode, struck, 15, 300, 1), { fold: 0, veil: 0, shake: 0, gaze: 0 });
    // The pilot state is not even looked at, so a stale or missing one cannot leak through.
    assert.deepEqual(target(mode, null), { fold: 0, veil: 0, shake: 0, gaze: 0 });
  }
});

test('a struck wing folds at once and reopens half a second before control returns', () => {
  assert.equal(target('cloudbase', { collapse: 2.4, cloud: 0 }).fold, 1);
  assert.equal(target('cloudbase', { collapse: RUN_EFFECTS.reopen + 0.01, cloud: 0 }).fold, 1);
  assert.equal(target('cloudbase', { collapse: RUN_EFFECTS.reopen, cloud: 0 }).fold, 0);
  assert.equal(target('cloudbase', { collapse: 0, cloud: 0 }).fold, 0);
  assert.ok(target('cloudbase', { collapse: 2.4, cloud: 0 }).shake > target('cloudbase', { collapse: 0.5, cloud: 0 }).shake);
  assert.equal(target('cloudbase', { collapse: 0, cloud: 0 }).shake, 0);
});

test('the veil follows whichever is deeper in cloud, the pilot or the camera', () => {
  assert.equal(target('cloudbase', { collapse: 0, cloud: 0.3 }, 0, 300, 0.7).veil, 0.7);
  assert.equal(target('cloudbase', { collapse: 0, cloud: 0.9 }, 0, 300, 0.2).veil, 0.9);
  assert.equal(target('cloudbase', { collapse: 0, cloud: 0 }, 0, 300, 0).veil, 0);
});

test('the camera looks up with the climb, never down, and not while the fog is close', () => {
  const calm = { collapse: 0, cloud: 0 };
  assert.equal(target('cloudbase', calm, RUN_EFFECTS.climb).gaze, 1);
  assert.equal(target('cloudbase', calm, 30).gaze, 1);
  assert.equal(target('cloudbase', calm, RUN_EFFECTS.climb / 2).gaze, 0.5);
  assert.equal(target('cloudbase', calm, 0).gaze, 0);
  assert.equal(target('cloudbase', calm, -26).gaze, 0);
  assert.equal(target('cloudbase', calm, 15, RUN_EFFECTS.fog[0]).gaze, 0);
  assert.ok(target('cloudbase', calm, 15, 30).gaze > 0 && target('cloudbase', calm, 15, 30).gaze < 1);
});
