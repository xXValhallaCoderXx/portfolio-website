import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROACH_WINDS, FJORD_BREEZE, fjordBreeze, sampleApproach } from './approach.js';
import { START, WORLD, ZONES, centerX } from './terrain.js';

const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const yawOf = (wind) => Math.atan2(wind.x, -wind.z);
const degrees = (angle) => (angle * 180) / Math.PI;

test('the drawn breeze is each windsock exactly inside 1.4 radii of its ring, at twice the drift it gives', () => {
  const out = {};
  for (const zone of ZONES) {
    const sock = APPROACH_WINDS.find((wind) => wind.id === zone.id);
    for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
      for (const reach of [0, 0.6, 1, 1.39]) {
        fjordBreeze(zone.x + Math.sin(angle) * zone.r * reach, zone.h + 30, zone.z + Math.cos(angle) * zone.r * reach, out);
        assert.ok(Math.abs(out.x - sock.x * sock.speed * FJORD_BREEZE.show) < 1e-12);
        assert.ok(Math.abs(out.z - sock.z * sock.speed * FJORD_BREEZE.show) < 1e-12);
      }
    }
    // The drift a pilot really feels there points the same way, at half the size.
    const drift = sampleApproach(zone.x, zone.h + 20, zone.z);
    fjordBreeze(zone.x, zone.h + 20, zone.z, out);
    assert.ok(Math.abs(drift.x * FJORD_BREEZE.show - out.x) < 1e-9 && Math.abs(drift.z * FJORD_BREEZE.show - out.z) < 1e-9);
  }
});

test('away from the rings the breeze blows up the fjord over the water and up the slope on land', () => {
  const out = {};
  // z values well clear of every ring's reach.
  for (const z of [420, 90, -100, -420]) {
    const middle = centerX(z);
    fjordBreeze(middle, 0, z, out);
    assert.ok(Math.abs(Math.hypot(out.x, out.z) - FJORD_BREEZE.speed) < 1e-12);
    assert.ok(out.z < 0, 'northward over the water');
    // Along the channel: a step that way stays on its middle line.
    const step = 0.01 / Math.hypot(out.x, out.z);
    assert.ok(Math.abs(centerX(z + out.z * step) - (middle + out.x * step)) < 1e-5);
    for (const side of [-1, 1]) {
      fjordBreeze(middle + side * (FJORD_BREEZE.shore[1] + 60), 0, z, out);
      assert.ok(Math.abs(Math.hypot(out.x, out.z) - FJORD_BREEZE.speed) < 1e-12);
      assert.ok(out.x * side > 0, 'away from the water');
      // Straight up the slope, unless the fjord bends away from this shore: then a quarter turn
      // from the channel and no more.
      const lean = Math.abs(wrapAngle(yawOf(out) - (side * Math.PI) / 2));
      fjordBreeze(middle, 0, z, out);
      const bend = Math.abs(wrapAngle((side * Math.PI) / 2 - yawOf(out)));
      assert.ok(Math.abs(lean - Math.max(0, bend - FJORD_BREEZE.turn)) < 1e-9);
    }
  }
});

test('the breeze is never still and never turns sharply, anywhere on the map', () => {
  const here = {};
  const there = {};
  let slowest = Infinity;
  let sharpest = 0;
  for (let z = WORLD.north; z <= WORLD.south; z += 3) {
    for (let x = -WORLD.halfX; x <= WORLD.halfX; x += 3) {
      fjordBreeze(x, 0, z, here);
      assert.ok(Number.isFinite(here.x) && Number.isFinite(here.z));
      slowest = Math.min(slowest, Math.hypot(here.x, here.z));
      for (const [dx, dz] of [[2, 0], [0, 2]]) {
        fjordBreeze(x + dx, 0, z + dz, there);
        sharpest = Math.max(sharpest, Math.abs(wrapAngle(yawOf(there) - yawOf(here))));
      }
    }
  }
  // Measured: 0.55 m/s at its slowest (beside the hall, whose own wind is the gentlest) and 11
  // degrees over two metres at its sharpest, where the fjord's air comes round to a windsock.
  assert.ok(slowest > 0.4, `the breeze drops to ${slowest.toFixed(2)} m/s`);
  assert.ok(degrees(sharpest) < 16, `the breeze turns ${degrees(sharpest).toFixed(1)} degrees in two metres`);
  // Around the launch point, where the fjord leans hard away from the west shore, it bends gently.
  for (let x = START.x - 120; x <= START.x + 120; x += 2) {
    fjordBreeze(x, START.y, START.z, here);
    fjordBreeze(x + 10, START.y, START.z, there);
    assert.ok(degrees(Math.abs(wrapAngle(yawOf(there) - yawOf(here)))) < 25);
  }
});

test('the breeze has no gust front, takes no notice of height and writes into the object it is given', () => {
  const out = { x: 9, z: 9, front: 9 };
  assert.equal(fjordBreeze(START.x, START.y, START.z, out), out);
  assert.equal(out.front, 0);
  const high = fjordBreeze(START.x, 400, START.z, {});
  assert.deepEqual(high, { x: out.x, z: out.z, front: 0 });
});
