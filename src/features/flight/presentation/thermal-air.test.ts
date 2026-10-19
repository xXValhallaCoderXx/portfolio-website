import type { AirSample } from '../../../domains/flight/models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createThermalAir, showThermalAir } from './thermal-air.ts';
import { createFlight, stepFlight } from '../../../domains/flight/flight.ts';
import { sampleAtmosphere } from '../../../domains/flight/atmosphere.ts';

test('sustained lift is readable in under two seconds at low, ordinary and high frame rates', () => {
  for (const dt of [1 / 15, 1 / 30, 1 / 60, 1 / 144, 1 / 240]) {
    const meter = createThermalAir(); meter.reset(2);
    for (let t = 0; t < 0.6 - 1e-8; t += dt) meter.step(5, Math.min(dt, 0.6 - t));
    assert.ok(Math.abs(meter.value - (5 - 3 / Math.E)) < 1e-8);
    assert.equal(meter.trend, 'STRONGER');
    for (let t = 0; t < 4; t += dt) meter.step(5, dt);
    assert.equal(meter.trend, 'STEADY');
    for (let t = 0; t < 0.6 - 1e-8; t += dt) meter.step(2, Math.min(dt, 0.6 - t));
    assert.equal(meter.trend, 'WEAKER');
  }
});

test('a quarter-metre deadband ignores small fluctuations and pause freezes the entire history', () => {
  const meter = createThermalAir(); meter.reset(3);
  for (let i = 0; i < 180; i++) meter.step(3 + Math.sin(i) * 0.2, 1 / 60);
  assert.equal(meter.trend, 'STEADY');
  meter.step(5, 0.6); const before = [meter.value, meter.trend, meter.fill];
  for (let i = 0; i < 600; i++) meter.step(0, 0);
  assert.deepEqual([meter.value, meter.trend, meter.fill], before);
  meter.step(5, 0.4); assert.equal(meter.trend, 'STRONGER');
  meter.reset(); assert.equal(meter.value, 0); assert.equal(meter.trend, 'STEADY');
  meter.step(NaN, 1); meter.step(5, NaN); assert.equal(meter.value, 0);
  meter.step(-5, 1); assert.equal(meter.value, 0);
  meter.step(12, 6); assert.equal(meter.fill, 1);
});

test('the opening turn can show air while maps, lessons and urgent instructions take priority', () => {
  const frame = { airborne: true, manual: true, circling: true, lift: 4 };
  assert.equal(showThermalAir(frame), true);
  assert.equal(showThermalAir({ ...frame, instruction: { activity: 'thermalling' } }), true);
  for (const key of ['map', 'briefing', 'portal']) assert.equal(showThermalAir({ ...frame, [key]: true }), false);
  for (const key of ['airborne', 'manual', 'circling']) assert.equal(showThermalAir({ ...frame, [key]: false }), false);
  for (const instruction of [{ lessonId: 'pitch' }, { warning: true }, ...['lesson', 'recover', 'hazard', 'descent', 'timing', 'building'].map(state => ({ state }))])
    assert.equal(showThermalAir({ ...frame, instruction }), false);
  assert.equal(showThermalAir({ ...frame, lift: 0 }), false);
});

test('ordinary left and right brake circles report air changes while vario can still show descent', () => {
  for (const dir of [-1, 1]) {
    const g = createFlight({ x: 0, y: 1000, z: 0 });
    const cell = { x: 0, z: 0, r: 300, s: 5.5, strength: 0.8, live: true, fade: 0.55 };
    const weather = { thermals: [cell] }, air: AirSample = {}, meter = createThermalAir();
    const input = { turn: dir, brake: true, bar: false, ears: false };
    for (let i = 0; i < 720; i++) {
      sampleAtmosphere(g.pos, weather, air); stepFlight(g, input, air, 1 / 60); meter.step(air.thermal!, 1 / 60);
    }
    cell.strength = 0.2;
    for (let i = 0; i < 60; i++) {
      sampleAtmosphere(g.pos, weather, air); stepFlight(g, input, air, 1 / 60); meter.step(air.thermal!, 1 / 60);
    }
    assert.equal(meter.trend, 'WEAKER'); assert.ok(g.vy < 0 && meter.value > 0);
    cell.strength = 0.9;
    for (let i = 0; i < 60; i++) {
      sampleAtmosphere(g.pos, weather, air); stepFlight(g, input, air, 1 / 60); meter.step(air.thermal!, 1 / 60);
    }
    assert.equal(meter.trend, 'STRONGER');
  }
});
