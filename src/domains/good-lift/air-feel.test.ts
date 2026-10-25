import type { AirSample } from '../flight/models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { AIR_FEEL, TURBULENCE, roughness, turbulenceAt, valueNoise, type Gusting, type NoiseSample } from './air-feel.ts';
import { sampleAtmosphere, type WeatherField } from '../flight/atmosphere.ts';
import { createCloudbaseRun, CLOUD_ZONE } from './cloudbase-state.ts';
import { createFlight, stepFlight } from '../flight/flight.ts';
import { pair } from '../../test/helpers/flight-lab.ts';
import './gliders.ts';

const thermal = { x: 0, z: 0, r: 110, s: 5.5, fade: 0.7, strength: 1, live: true };
const felt = (thermals = [thermal], wind = { x: 0, z: 0 }): WeatherField => ({ windX: wind.x, windZ: wind.z, thermals, feel: AIR_FEEL });
const air = (x: number, z: number, y = 1200, weather = felt()) => sampleAtmosphere({ x, y, z }, weather, {});

test('value noise stays within [-1, 1], is continuous, and its slopes are its own', () => {
  const at: NoiseSample = { value: 0, dx: 0, dz: 0 }, near: NoiseSample = { value: 0, dx: 0, dz: 0 };
  for (let i = 0; i < 2000; i++) {
    const x = (i * 0.731) % 37 - 18, y = (i * 0.173) % 5, z = (i * 0.417) % 41 - 20;
    valueNoise(99, x, y, z, at);
    assert.ok(Math.abs(at.value) <= 1);
    valueNoise(99, x + 1e-5, y, z, near);
    assert.ok(Math.abs(near.value - at.value) < 1e-4, 'continuous');
    assert.ok(Math.abs((near.value - at.value) / 1e-5 - at.dx) < 2e-3, 'its x slope');
    valueNoise(99, x, y, z + 1e-5, near);
    assert.ok(Math.abs((near.value - at.value) / 1e-5 - at.dz) < 2e-3, 'its z slope');
  }
});

test('turbulence is the same everywhere it is asked for again, scales with its strength, and its w slope is true', () => {
  const a: Gusting = { w: 0, u: 0, v: 0, gradX: 0, gradZ: 0 }, b: Gusting = { ...a }, c: Gusting = { ...a };
  turbulenceAt(7, 120, 800, -40, 33.25, 0.6, 3, -2, a);
  turbulenceAt(7, 120, 800, -40, 33.25, 0.6, 3, -2, b);
  assert.deepEqual(a, b);
  turbulenceAt(7, 120, 800, -40, 33.25, 0, 3, -2, c);
  assert.ok([c.w, c.u, c.v, c.gradX, c.gradZ].every(value => value === 0));
  turbulenceAt(7, 120, 800, -40, 33.25, 1.2, 3, -2, c);
  assert.ok(Math.abs(c.w - 2 * a.w) < 1e-12 && Math.abs(c.u - 2 * a.u) < 1e-12);
  assert.ok(Math.abs(a.w) <= 0.6 && Math.abs(a.u) <= TURBULENCE.horizontal * 0.6);
  const step: Gusting = { ...a };
  turbulenceAt(7, 120 + 1e-4, 800, -40, 33.25, 0.6, 3, -2, step);
  assert.ok(Math.abs((step.w - a.w) / 1e-4 - a.gradX) < 1e-3);
  // Drifted with the wind, the same bump is found where the wind took it.
  turbulenceAt(7, 125, 800, -40, 33.25, 0.6, 8, -2, step);
  assert.ok(Math.abs(step.w - a.w) < 1e-12);
});

test('the air is as rough as the place, never past its cap, and calm below the launch climb\'s top', () => {
  assert.equal(roughness(0, 0, 0, 0, 0, 2000), TURBULENCE.floor);
  assert.equal(roughness(0, 1, 0, 0, 0, 2000), TURBULENCE.edge);
  assert.equal(roughness(0, 0, 0, 0, 1, 2000), TURBULENCE.cap);
  assert.equal(roughness(0, 0, 1, 0, 0, 2000), TURBULENCE.cap, 'the roughest lee is capped');
  assert.equal(roughness(1, 1, 1, 1, 1, TURBULENCE.low), 0);
  assert.ok(roughness(0, 1, 0, 0, 0, TURBULENCE.low + TURBULENCE.blend / 2) < TURBULENCE.edge);
});

test('felt thermals sink round their edge and a little everywhere, lift hardest upwind, and say their own slope', () => {
  assert.ok(air(0, 0).windY! > 5, 'the core lifts');
  assert.ok(air(140, 0).windY! < 0, 'beyond the edge is the sinking ring');
  assert.ok(air(140, 0).windY! > -1);
  assert.ok(Math.abs(air(400, 0).windY! + AIR_FEEL.background) < 1e-9, 'away from lift, the background sink');
  // Below the launch climb's top none of it is there: the plain thermal as ever.
  const plain = sampleAtmosphere({ x: 140, y: 300, z: 0 }, { windX: 0, windZ: 0, thermals: [thermal] }, {});
  assert.equal(air(140, 0, 300).windY, plain.windY);
  assert.equal(air(140, 0, 300).gradX, 0);
  // The slope it says is the slope of the air it gives.
  for (const [x, z] of [[60, 10], [95, -30], [-120, 40], [130, 0]]) {
    const here = air(x, z) as AirSample, east = air(x + 1e-4, z), south = air(x, z + 1e-4);
    assert.ok(Math.abs((east.windY! - here.windY!) / 1e-4 - here.gradX!) < 1e-3, `${x},${z} x slope`);
    assert.ok(Math.abs((south.windY! - here.windY!) / 1e-4 - here.gradZ!) < 1e-3, `${x},${z} z slope`);
  }
  // In a wind blowing east, the strongest lift sits west of the column's middle (upwind).
  const windy = felt([thermal], { x: 3, z: 0 });
  const west = sampleAtmosphere({ x: -70, y: 1200, z: 0 }, windy, {}), east = sampleAtmosphere({ x: 70, y: 1200, z: 0 }, windy, {});
  assert.ok(west.windY! > east.windY!);
});

test('a run\'s sky feels its air for the wing and gives plans a calm sample; a sky that does not feel it never does', () => {
  const lab = createCloudbaseRun(), today = createCloudbaseRun();
  lab.reset(100, 5, true); today.reset(100, 5);
  for (let i = 0; i < 600; i++) { lab.step(1 / 60, { x: CLOUD_ZONE.x, y: 900, z: CLOUD_ZONE.z }); today.step(1 / 60, { x: CLOUD_ZONE.x, y: 900, z: CLOUD_ZONE.z }); }
  const pos = { x: CLOUD_ZONE.x + 40, y: 900, z: CLOUD_ZONE.z - 30 };
  const felt = lab.sample(pos, 0, {}), calm = lab.sample(pos, 0, {}, true), wind = lab.windAt(pos.x, pos.y, pos.z, {});
  assert.ok(felt.turbulence! > 0);
  assert.equal(calm.turbulence, 0);
  assert.equal(wind.windY, felt.windY, 'what the wing feels is what the streaks are drawn from');
  assert.notEqual(calm.windY, felt.windY);
  assert.ok(Math.abs(lab.state.driftX) + Math.abs(lab.state.driftZ) > 0, 'the bumps drift with the breeze');
  const plain = today.sample(pos, 0, {});
  assert.equal(plain.turbulence, undefined);
  assert.equal(today.state.feel, false);
});

test('a glider feels lift under one tip and turns away from it; the classic wing feels none of that', () => {
  const pass = (wing: string) => {
    const g = createFlight({ x: -60, y: 1200, z: 0 }, wing), sample: AirSample = {};
    const weather = felt([{ ...thermal, z: -150 }]);
    const yaw = g.yaw;
    for (let i = 0; i < 20 * 60; i++) { sampleAtmosphere(g.pos, wing === 'classic' ? { ...weather, feel: undefined } : weather, sample); stepFlight(g, pair(0), sample, 1 / 60); }
    return (g.yaw - yaw) * 180 / Math.PI;
  };
  assert.ok(Math.abs(pass('classic')) < 0.5);
  const a = pass('en-a'), d = pass('en-d');
  assert.ok(a < -5, `the A turns away from lift on its right: ${a}°`);
  assert.ok(d < a, `the D feels it more: ${d}° against ${a}°`);
});
