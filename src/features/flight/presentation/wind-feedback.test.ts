import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlateNotice, createWindNotice, ridgeFeedback, windReadout } from './wind-feedback.ts';
import { FLIGHT } from '../../../domains/flight/flight.ts';

test('the world wind destination stays fixed when turning the wing; the relative arrow turns', () => {
  const air = Object.freeze({ windX: 2, windZ: 0 });
  assert.equal(windReadout(air, 0), '→ to E 7 km/h');
  assert.equal(windReadout(air, Math.PI), '← to E 7 km/h');
  assert.equal(windReadout({ windX: -2, windZ: -2 }), '↖ to NW 10 km/h');
  assert.equal(windReadout({ windX: 0, windZ: 0 }), 'calm · 0 km/h');
});
test('ridge and lee cues describe the air even when the wing is descending or climbing transiently', () => {
  assert.equal(ridgeFeedback({ ridge: 2, lee: 0, thermal: 0, windY: 2, vy: -1 })!.title, 'RIDGE LIFT');
  assert.equal(ridgeFeedback({ ridge: 0, lee: 2, thermal: 0, windY: -2, vy: 1 })!.title, 'SINKING AIR');
  assert.equal(ridgeFeedback({ ridge: 0, lee: 0, windY: 0, vy: -2 }), null, 'normal glider sink is not lee sink');
  assert.equal(ridgeFeedback({ ridge: 0.5, thermal: 4, lee: 0, windY: 4.5 }), null, 'a dominant thermal is not mislabeled ridge lift');
});
test('weak rising air is distinguished from air strong enough to support a gentle glide', () => {
  const usable = FLIGHT.sink.trim + 0.25;
  const air = { ridge: 2, lee: 0.5, thermal: 0, windY: usable - 0.01, vy: 4 };
  assert.equal(ridgeFeedback(air)!.title, 'WEAK RISING AIR', 'a transient climb cannot make weak air strong');
  assert.match(ridgeFeedback(air)!.detail, /slows your descent/);
  assert.equal(ridgeFeedback({ ...air, windY: usable, vy: -4 })!.title, 'RIDGE LIFT', 'the cue classifies air, not pilot momentum');
  assert.equal(ridgeFeedback({ ridge: 0.5, lee: 0, thermal: 4, windY: 4.5 }), null, 'strong thermal air is not called ridge lift');
});
test('the first plate trail explains optional bonus kg once and resets for a fresh run', () => {
  const notice = createPlateNotice();
  assert.equal(notice.step(0, 80, true), null);
  assert.equal(notice.step(1, 90, false), null, 'a hazard or active maneuver defers the explanation');
  const first = notice.step(1, 94, true);
  assert.ok(first);
  assert.equal(first.title, 'OPTIONAL PLATES');
  assert.match(first.detail, /bonus kg.*next thermal.*or keep soaring/);
  assert.equal(notice.step(2, 99, true)!.title, 'OPTIONAL PLATES');
  assert.equal(notice.step(2, 100, true), null);
  assert.equal(notice.step(3, 130, true), null, 'later trails do not repeat the first lesson');
  notice.step(0, 0, true);
  assert.equal(notice.step(1, 90, true)!.title, 'OPTIONAL PLATES');
  notice.reset();
  assert.equal(notice.step(2, 200, true)!.title, 'OPTIONAL PLATES', 'the first observed count can exceed one');
});
test('a wind shift gets the shared coach before a queued plate lesson and unseen plates expire', () => {
  const wind = createWindNotice(), plates = createPlateNotice();
  const weather = { transition: 1, shifting: true, toHeading: Math.PI / 2, progress: 0 };
  const shift = wind.step(weather, 90, true);
  assert.ok(shift);
  assert.equal(shift.title, 'WIND SHIFT');
  assert.equal(plates.step(1, 90, !shift), null);
  assert.equal(wind.step(weather, 96, true), null);
  assert.equal(plates.step(1, 96, true)!.title, 'OPTIONAL PLATES');
  const expired = createPlateNotice();
  assert.equal(expired.step(1, 90, false), null);
  assert.equal(expired.step(1, 110, true), null, 'a trail that has timed out is not announced');
  assert.equal(expired.step(2, 111, true), null, 'expiry also consumes the first lesson');
});
test('a gradual shift is announced once, deferred behind a hazard and not restarted by sampling', () => {
  const notice = createWindNotice();
  const weather = { transition: 0, shifting: false, heading: 0 };
  assert.equal(notice.step(weather, 0, true), null);
  Object.assign(weather, { transition: 1, shifting: true, toHeading: Math.PI / 2, progress: 0 });
  assert.equal(notice.step(weather, 90, false), null);
  const before = structuredClone(weather);
  assert.match(notice.step(weather, 94, true)!.detail, /toward the east/);
  for (let t = 94; t < 100; t += 0.1) assert.equal(notice.step(weather, t, true)!.title, 'WIND SHIFT');
  assert.equal(notice.step(weather, 100, true), null);
  assert.equal(notice.step(weather, 115, true), null);
  assert.deepEqual(weather, before);
  Object.assign(weather, { transition: 2, toHeading: -Math.PI / 2 });
  assert.match(notice.step(weather, 205, true)!.detail, /toward the west/);
});
test('a deferred announcement describes the completed wind rather than claiming it is still turning', () => {
  const notice = createWindNotice();
  const weather = { transition: 1, shifting: true, toHeading: Math.PI / 2, progress: 0 };
  assert.equal(notice.step(weather, 90, false), null);
  Object.assign(weather, { shifting: false, heading: Math.PI / 2, progress: 1 });
  assert.match(notice.step(weather, 116, true)!.detail, /Wind now blows toward the east/);
});
test('old deferred shifts expire, restart resets notice identity and urgent hints retain priority', () => {
  const notice = createWindNotice();
  const weather = { transition: 3, toHeading: Math.PI / 2 };
  assert.equal(notice.step(weather, 300, false), null);
  assert.equal(notice.step(weather, 336, true), null);
  notice.step(null, 0, false);
  assert.equal(notice.step({ transition: 0 }, 0, true), null);
  assert.ok(notice.step({ transition: 1, toHeading: 0 }, 90, true));
});
