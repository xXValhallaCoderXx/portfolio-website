import type { AirSample, Vector3 } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlight, copyFlight, stepFlight } from './flight.ts';
import { centeringControls, heldControls, createThermalCentering, THERMAL_CENTERING } from './thermal-centering.ts';

test('direct centering candidates blend both brakes and ease while keeping gentle common brake', () => {
  const input = Object.freeze({ controlMode: 'brakes', leftBrake: .24, rightBrake: .10 });
  assert.deepEqual(heldControls(input), { ...input, bar: false, ears: false });
  assert.deepEqual(centeringControls(input, -1), { controlMode: 'brakes', leftBrake: .50, rightBrake: .20, bar: false, ears: false });
  assert.deepEqual(centeringControls(input, 1), { controlMode: 'brakes', leftBrake: .20, rightBrake: .50, bar: false, ears: false });
  assert.deepEqual(centeringControls(input, 0), { controlMode: 'brakes', leftBrake: .20, rightBrake: .20, bar: false, ears: false });
  assert.deepEqual(centeringControls(input, 1, false), { controlMode: 'brakes', leftBrake: 0, rightBrake: .20, bar: false, ears: false });
  assert.deepEqual(centeringControls({}, -1), { turn: -1, brake: true });
});

test('centering reaction forecast holds the raw pair on a private wing and leaves live state unchanged', () => {
  const g = createFlight({ x: 0, y: 1500, z: 0 }), copy = createFlight(), positions: Vector3[] = [];
  const input = Object.freeze({ controlMode: 'brakes', leftBrake: .24, rightBrake: .10 });
  const air = { windX: 1, windY: 4, windZ: 0, thermal: 4 };
  const adapter = { sampleAir(pos: Vector3, out: AirSample) { positions.push({ ...pos }); Object.assign(out, air); } };
  const before = structuredClone(g), C = THERMAL_CENTERING;
  createThermalCentering(adapter, () => true).choose(g, { key: 'core', x: 0, z: 0, vx: 0, vz: 0 }, -1, input, null, 0);
  copyFlight(copy, g);
  for (let n = 0; n < Math.floor(C.reaction / C.step) - 1; n++) {
    assert.deepEqual(positions[n], copy.pos, `reaction step ${n} uses the actual pair`);
    stepFlight(copy, heldControls(input), air, C.step);
  }
  assert.deepEqual(g, before);
  assert.deepEqual(input, { controlMode: 'brakes', leftBrake: .24, rightBrake: .10 });
});
