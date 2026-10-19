import type { AirSample } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ATMOSPHERE, createTerrainAir, fjordWindAt, sampleAtmosphere, sampleFjordAir } from './atmosphere.ts';
import { surfaceAt } from './ground.ts';

const near = (a: number, b: number, e = 1e-10) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const cliff = (x: number) => 80 * Math.max(0, Math.min(1, (x + 8) / 16));
test('flat terrain contributes no ridge lift or lee and a steady wind keeps its speed', () => {
  const flat = createTerrainAir(() => 0);
  const a = flat.sample({ x: 0, y: 100, z: 0 }, 2, -1);
  assert.equal(a.ridge, 0); assert.equal(a.lee, 0); near(a.windX, 2); near(a.windZ, -1);
  for (const y of [2, 5, 10, 20]) {
    const low = flat.sample({ x: 0, y, z: 0 }, 2, -1);
    assert.equal(low.windY, 0); assert.equal(low.lee, 0);
  }
});
test('lift follows the windward face, reverses with wind, and weakens with clearance', () => {
  const slope = createTerrainAir((x) => Math.max(0, x * 0.5));
  const low = slope.sample({ x: 50, y: 45, z: 0 }, 3, 0);
  const high = slope.sample({ x: 50, y: 300, z: 0 }, 3, 0);
  const reverse = slope.sample({ x: 50, y: 45, z: 0 }, -3, 0);
  const cross = slope.sample({ x: 50, y: 45, z: 0 }, 0, 3);
  assert.ok(low.ridge > 1); assert.ok(high.ridge < low.ridge * 0.1);
  assert.equal(reverse.ridge, 0); assert.ok(reverse.lee > 0); assert.equal(cross.ridge, 0);
});
test('a broad cliff lifts a usable lane thirty to sixty metres before its face', () => {
  const terrain = createTerrainAir(cliff);
  for (const wind of [3, 3.5, 4]) for (const x of [-60, -45, -30]) {
    const air = terrain.sample({ x, y: 100, z: 0 }, wind, 0);
    assert.ok(air.ridge >= 2 && air.ridge <= 3.5, `${wind}m/s wind at x=${x} gives ${air.ridge}m/s lift`);
    assert.equal(air.crestHeight, 80);
    assert.ok(air.windX > 0 && air.windX < wind, 'normal flow bends gradually before the wall');
    assert.equal(air.lee, 0);
  }
});
test('ridge air has a crest-relative ceiling and several probes cannot multiply one obstacle', () => {
  const terrain = createTerrainAir(cliff);
  const low = terrain.sample({ x: -45, y: 80 + 55, z: 0 }, 3.5, 0);
  const middle = terrain.sample({ x: -45, y: 80 + 90, z: 0 }, 3.5, 0);
  const high = terrain.sample({ x: -45, y: 80 + 120, z: 0 }, 3.5, 0);
  near(low.ridge, terrain.sample({ x: -45, y: 100, z: 0 }, 3.5, 0).ridge);
  assert.ok(low.ridge > 2 && low.ridge <= 3.5 * ATMOSPHERE.ridge.fraction);
  assert.ok(middle.ridge > 0 && middle.ridge < low.ridge);
  assert.equal(high.ridge, 0);
  near(high.windX, 3.5);
});
test('reversed, oblique and parallel wind respond to the actual face normal', () => {
  const terrain = createTerrainAir(cliff);
  const pos = { x: -45, y: 100, z: 0 };
  const favorable = terrain.sample(pos, 3.5, 0);
  const reverse = terrain.sample({ ...pos, y: 40 }, -3.5, 0);
  const oblique = terrain.sample(pos, 2.5, 2.5);
  const parallel = terrain.sample(pos, 0, 3.5);
  assert.equal(reverse.ridge, 0);
  assert.ok(reverse.lee > 0 && Math.abs(reverse.windX) < 3.5);
  assert.ok(oblique.ridge > 1 && oblique.ridge < favorable.ridge);
  near(oblique.windZ, 2.5, 1e-8);
  assert.ok(oblique.windX > 0 && oblique.windX < 2.5);
  assert.equal(parallel.ridge, 0); assert.equal(parallel.lee, 0);
  near(parallel.windX, 0); near(parallel.windZ, 3.5);
  const mirrored = createTerrainAir((x) => cliff(-x)).sample({ ...pos, x: 45 }, -3.5, 0);
  near(mirrored.ridge, favorable.ridge); near(mirrored.windX, -favorable.windX);
});
test('isolated rocks remain quiet even when every obstacle probe hits their tall peak exactly', () => {
  for (const height of [8, 20, 30]) for (const distance of ATMOSPHERE.probes) {
    const terrain = createTerrainAir((x) => height * Math.max(0, 1 - Math.abs(x - distance) / 8));
    const air = terrain.sample({ x: 0, y: height + 20, z: 0 }, 3.5, 0);
    assert.equal(air.ridge, 0, `${height}m rock under the ${distance}m probe is not a broad ridge`);
    near(air.windX, 3.5);
  }
});
test('still air and ground clipping reset every diagnostic on caller-owned output', () => {
  const terrain = createTerrainAir(cliff), out: AirSample = {};
  terrain.sample({ x: -45, y: 100, z: 0 }, 3.5, 0, out);
  assert.equal(terrain.sample({ x: -45, y: 100, z: 0 }, 0, 0, out), out);
  for (const key of ['windX', 'windY', 'windZ', 'ridge', 'lee', 'thermal', 'rough', 'ambientX', 'ambientZ'] as const) assert.equal(out[key], 0);
  terrain.sample({ x: 30, y: 79, z: 0 }, 3.5, 1, out);
  for (const key of ['windX', 'windY', 'windZ', 'ridge', 'lee', 'thermal', 'rough'] as const) assert.equal(out[key], 0);
  assert.equal(out.ambientX, 3.5); assert.equal(out.ambientZ, 1); assert.equal(out.crestHeight, 80);
});
test('upstream ridges shelter lee air and smoothing keeps the face continuous', () => {
  const ridge = createTerrainAir((x) => 100 * Math.max(0, 1 - Math.abs(x) / 60));
  const lee = ridge.sample({ x: 50, y: 35, z: 0 }, 3, 0);
  const open = ridge.sample({ x: 160, y: 35, z: 0 }, 3, 0);
  assert.ok(lee.windX < open.windX); assert.ok(lee.lee > 0 && lee.rough > 0);
  let previous;
  for (let x = -80; x <= 80; x += 0.25) {
    const a = ridge.sample({ x, y: 130, z: 0 }, 3, 0);
    if (previous !== undefined) assert.ok(Math.abs(a.windY - previous) < 0.15);
    previous = a.windY;
  }
});
test('actual terrain flow stays continuous when obstacle probes exchange rank or a local normal flattens', () => {
  const terrain = createTerrainAir(), a: AirSample = {}, b: AirSample = {};
  const difference = () => Math.hypot(b.windX! - a.windX!, b.windY! - a.windY!, b.windZ! - a.windZ!);
  const wx = 3.5 * Math.sin(70 * Math.PI / 180), wz = -3.5 * Math.cos(70 * Math.PI / 180);
  for (const pos of [{ x: 114, y: 87.68334420150177, z: 273 },
    { x: 166, y: 168.2513978, z: 300 }, { x: 68, y: 111.55131597, z: -174 }]) {
    terrain.sample(pos, wx, wz, a);
    terrain.sample({ ...pos, x: pos.x + 0.01 }, wx, wz, b);
    assert.ok(difference() < 0.01, 'a centimetre cannot abruptly rotate the local wind');
  }
  for (const speed of [3.5, 4]) for (const heading of [0, 35, 70, 90, 145, 215, 270]) {
    const wx = speed * Math.sin(heading * Math.PI / 180), wz = -speed * Math.cos(heading * Math.PI / 180);
    for (let z = -340; z <= 340; z += 17) for (let x = -240; x <= 240; x += 16) for (const agl of [20, 60, 150]) {
      const pos = { x, y: terrain.heightAt(x, z) + agl, z };
      terrain.sample(pos, wx, wz, a);
      for (const axis of ['x', 'y', 'z'] as const) {
        terrain.sample({ ...pos, [axis]: pos[axis] + 0.25 }, wx, wz, b);
        assert.ok(difference() <= 0.15, `quarter-metre ${axis} step at ${x},${z} in ${heading}° wind changes by ${difference()}m/s`);
      }
    }
  }
});
test('thermals add to terrain air once and the shared vertical vector is capped', () => {
  const pos = { x: 0, y: 500, z: 0 };
  const thermals = [{ x: 0, z: 0, r: 60, s: 5.5 }, { x: 0, z: 0, r: 60, s: 5.5 }];
  const a = sampleAtmosphere(pos, { windX: 0, windZ: 0, thermals });
  assert.equal(a.windY, ATMOSPHERE.maximumLift); assert.equal(a.lift, a.windY); assert.equal(a.sink, 0);
  assert.equal(a.thermal, 11); assert.equal(a.ridge, 0); assert.equal(a.lee, 0);
  const below = sampleAtmosphere({ ...pos, y: -1 }, { windX: 2, windZ: 1, thermals });
  assert.equal(below.windY, 0);
});
test('the fjord draws exactly the air the wing feels, including upward air', () => {
  for (const pos of [{ x: 120, y: 90, z: 250 }, { x: 100, y: 50, z: -100 }, { x: 0, y: 120, z: 285 }]) {
    const a = sampleFjordAir(pos), drawn = fjordWindAt(pos.x, pos.y, pos.z);
    near(a.windX, drawn.x); near(a.windY, drawn.y); near(a.windZ, drawn.z);
    assert.equal(a.windY, a.lift - a.sink);
  }
});
test('all terrain sampling stays finite across the world and follows the caller-owned result', () => {
  const out: AirSample = {};
  for (let z = -450; z <= 450; z += 45) for (let x = -320; x <= 320; x += 32) {
    const pos = { x, z, y: surfaceAt(x, z) + 25 };
    assert.equal(sampleFjordAir(pos, 10, out), out);
    for (const n of ['windX', 'windY', 'windZ', 'lift', 'sink', 'rough', 'ridge', 'lee', 'thermal', 'crestHeight', 'ambientX', 'ambientZ'] as const) assert.ok(Number.isFinite(out[n]));
    assert.ok(out.windY! <= 6);
  }
});


test('mirrored cliff profiles stay symmetric throughout the cached terrain cells', () => {
  const west = createTerrainAir(cliff), east = createTerrainAir(x => cliff(-x));
  for (let x = -100; x <= 24; x += 0.5) for (const y of [40, 100, 165]) {
    const a = west.sample({ x, y, z: 0 }, 3.5, 0);
    const b = east.sample({ x: -x, y, z: 0 }, -3.5, 0);
    near(a.ridge, b.ridge); near(a.lee, b.lee);
    near(a.windX, -b.windX); near(a.windY, b.windY); near(a.rough, b.rough);
  }
});
