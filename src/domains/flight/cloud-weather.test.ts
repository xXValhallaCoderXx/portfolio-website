import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOUD_WEATHER as C, cloudWeatherAt } from './cloud-weather.ts';
const near = (a: number, b: number, e = 1e-10) => assert.ok(Math.abs(a - b) < e, `${a} differs from ${b}`);

test('seeded weather holds NE or NW for ninety seconds, then turns continuously to the opposite cliff', () => {
  const sides = new Set();
  for (let seed = 1; seed <= 64; seed++) {
    const first = cloudWeatherAt(seed, 0, {}); sides.add(first.side);
    assert.ok(Math.abs(first.heading) >= C.heading[0] && Math.abs(first.heading) <= C.heading[1]);
    assert.ok(first.speed >= 3 && first.speed <= 4);
    const held = cloudWeatherAt(seed, 89, {});
    near(first.heading, held.heading); near(first.speed, held.speed); assert.equal(held.shifting, false);
    const start = cloudWeatherAt(seed, 90, {}), middle = cloudWeatherAt(seed, 102.5, {}), end = cloudWeatherAt(seed, 115, {});
    assert.equal(start.transition, 1); assert.equal(start.shifting, true); near(start.heading, first.heading);
    assert.equal(middle.progress, 0.5); assert.equal(middle.until, 12.5);
    assert.equal(end.side, -first.side); assert.equal(end.shifting, false); assert.equal(end.until, 90);
    near(end.heading, start.toHeading); near(end.speed, start.toSpeed);
  }
  assert.deepEqual([...sides].sort(), [-1, 1]);
});

test('weather has no jumps or speed collapse across multiple turns and replaying a time is pure', () => {
  let previous = cloudWeatherAt(7, 0, {});
  for (let frame = 1; frame <= 600 * 60; frame++) {
    const next = cloudWeatherAt(7, frame / 60, {});
    assert.ok(Math.abs(next.heading - previous.heading) < 0.003);
    assert.ok(Math.abs(next.speed - previous.speed) < 0.002);
    assert.ok(next.speed >= 3 && next.speed <= 4); previous = next;
  }
  const first = cloudWeatherAt(1234, 311, {});
  cloudWeatherAt(9999, 12, {}); assert.deepEqual(cloudWeatherAt(1234, 311, {}), first);
});

test('fixed wind pins exact heading and speed, while disabled wind wins', () => {
  const wind = { x: -4, z: 0 };
  const fixed = cloudWeatherAt(3, 104, {}, wind);
  assert.equal(fixed.shifting, false); assert.equal(fixed.side, -1); near(fixed.speed, 4);
  near(fixed.heading, -Math.PI / 2); assert.equal(fixed.until, Infinity);
  const disabled = cloudWeatherAt(3, 104, {}, wind, false);
  assert.equal(disabled.speed, 0); assert.equal(disabled.side, 0); assert.equal(disabled.shifting, false);
});
