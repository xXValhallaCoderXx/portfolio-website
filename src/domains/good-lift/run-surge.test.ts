import type { AirSample } from '../flight/models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { SURGE, createSurge } from './run-surge.ts';
import { CLOUD_HUNT, CLOUD_ZONE, createCloudbaseRun } from './cloudbase-state.ts';
import { thermalProfile } from '../flight/atmosphere.ts';

const STEP = 1 / 60;
const TAU = Math.PI * 2;
const ease = (value: number) => value * value * (3 - 2 * value);
// The same plausible air profile the game now flies, checked against the actual sky below.
const lift = (d: number) => CLOUD_HUNT.s * thermalProfile(d, CLOUD_HUNT.r, CLOUD_HUNT.core);

// Flies `laps` circles whose middle is `off` metres from the core, starting on the far side: hands
// up (14.4 m round at 0.8 rad/s) unless told otherwise. `strength(t)` and `riding(t)` say how the
// thermal and the wing are at `t` seconds.
function circle({ off, laps = 4, radius = 25, rate = 0.5, strength = () => 1, riding = () => true }: {off: number; laps?: number; radius?: number; rate?: number; strength?: (time: number) => number; riding?: (time: number) => boolean}) {
  const surge = createSurge();
  const at = [];
  const steps = Math.round((laps * TAU) / rate / STEP);
  for (let i = 0; i < steps; i++) {
    const t = i * STEP;
    const a = rate * t;
    const d = Math.hypot(off + radius * Math.cos(a), radius * Math.sin(a));
    const s = strength(t);
    if (surge.step(STEP, lift(d) * s, s, rate, riding(t))) at.push(t);
  }
  return { surge, at };
}

test('a circle centred on the core never surges, nor one off it by less than a pilot can feel', () => {
  for (const off of [0, 1, 2]) assert.deepEqual(circle({ off }).at, [], `${off} m off, hands up`);
  for (const off of [0, 1, 2]) assert.deepEqual(circle({ off, radius: 20, rate: 0.55 }).at, [], `${off} m off, on the light brake`);
});

test('a circle off the core surges once a circle, as it closes on the core, from the second circle on', () => {
  for (const [radius, rate] of [[25, 0.5], [20, 0.55]]) {
    const lap = TAU / rate;
    for (const off of [6, 10, 14]) {
      const { at } = circle({ off, radius, rate });
      assert.equal(at.length, 3, `${off} m off a ${radius} m circle: surges at ${at.map((t) => t.toFixed(2))}`);
      for (let i = 0; i < at.length; i++) {
        // On the half of the circle that closes on the core (the far side is at 0), once in each.
        const into = (at[i] % lap) / lap;
        assert.ok(into > 0 && into < 0.5, `surge ${i} at ${into.toFixed(2)} of its circle`);
        assert.ok(at[i] > (i + 1) * lap && at[i] < (i + 2) * lap, 'one in each circle after the first');
      }
    }
  }
});

test('flying straight into a thermal is not a surge, however fast the lift builds', () => {
  const surge = createSurge();
  for (let d = 60; d > 0; d -= 11.5 * STEP) assert.equal(surge.step(STEP, lift(d), 1, 0, true), false);
  assert.equal(surge.state.surges, 0);
});

test('a thermal waxing as it starts, or wearing out, is not felt as a surge', () => {
  // Blooming from half strength to full over 4 s, and wearing out from full, under a centred circle.
  assert.deepEqual(circle({ off: 0, strength: (t: number) => Math.min(1, 0.5 + t / 8) }).at, []);
  assert.deepEqual(circle({ off: 0, strength: (t: number) => Math.max(SURGE.weak, 1 - t / 20), laps: 3 }).at, []);
});

test('a fold, a stall or cloud starts it over: half a circle must be flown again before a surge counts', () => {
  const lap = TAU / 0.5;
  const from = lap * 1.05;
  const to = from + 2;
  // Folded for two seconds in the second circle, just before its surge would come.
  const { at, surge } = circle({ off: 6, riding: (t: number) => t < from || t > to });
  assert.ok(at.length >= 1, 'it surges again once settled');
  assert.ok(at.every((t) => t < from || t > to + SURGE.settle / 0.5), `surges at ${at.map((t) => t.toFixed(2))}`);
  surge.step(STEP, 0, 1, 0.5, false);
  assert.equal(surge.state.turned, 0);
  assert.ok(Number.isNaN(surge.state.felt));
});

test('a thermal too far gone to centre in is not felt at all', () => {
  assert.deepEqual(circle({ off: 6, strength: () => SURGE.weak - 0.01 }).at, []);
});

test('a surge is one beat, not one for every step the lift climbs', () => {
  const surge = createSurge();
  // Half a circle flown in steady lift, then a long climb in it.
  for (let i = 0; i < 300; i++) surge.step(STEP, 2, 1, 0.5, true);
  let count = 0;
  for (let i = 0; i < 180; i++) if (surge.step(STEP, 2 + i * 0.008, 1, 0.5, true)) count += 1;
  assert.equal(count, 1);
  // Only once the lift has stopped climbing may the next come.
  for (let i = 0; i < 60; i++) surge.step(STEP, 3.44 - i * 0.005, 1, 0.5, true);
  for (let i = 0; i < 60; i++) if (surge.step(STEP, 3.14 + i * 0.008, 1, 0.5, true)) count += 1;
  assert.equal(count, 2);
});

test('on a hunted thermal of the sky itself, a centred circle is quiet and one 6 m off surges once a circle', () => {
  // One hunted thermal at full strength in the middle of the zone, in still air with nothing else.
  const sky = createCloudbaseRun({ hazards: false, wind: false });
  sky.reset(80, 1);
  for (const thermal of sky.state.thermals) thermal.live = false;
  const core = Object.assign(sky.state.thermals[2], { live: true, strength: 1, move: 0, x: CLOUD_ZONE.x, z: CLOUD_ZONE.z });
  const air: AirSample = {};
  const pos = { x: 0, y: 300, z: 0 };
  const surges = (off: number, radius: number, rate: number) => {
    const surge = createSurge();
    let count = 0;
    for (let i = 0; i < Math.round((4 * TAU) / rate / STEP); i++) {
      const a = rate * i * STEP;
      pos.x = core.x + off + radius * Math.cos(a);
      pos.z = core.z + radius * Math.sin(a);
      sky.sample(pos, a, air);
      if (surge.step(STEP, air.lift!, core.strength, rate, true)) count += 1;
    }
    return count;
  };
  for (const [radius, rate] of [[25, 0.5], [20, 0.55]]) {
    assert.equal(surges(0, radius, rate), 0, `a centred ${radius} m circle`);
    assert.equal(surges(1.5, radius, rate), 0, `a ${radius} m circle 1.5 m off`);
    assert.equal(surges(6, radius, rate), 3, `a ${radius} m circle 6 m off`);
  }
});
