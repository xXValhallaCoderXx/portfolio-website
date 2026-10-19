import type { AirSample } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlight, stepFlight } from './flight.ts';
import { sampleAtmosphere } from './atmosphere.ts';

const dt = 1 / 60, seconds = 80, DEG = Math.PI / 180;
const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
const measured = new Map();

// These tests measure an established manual circle, separately from entry/centering.
// First hold the same literal pair for sixty seconds to obtain a naturally banked
// physical wing. Then introduce a standard thermal at that circle's measured centre.
// No bodies, controls, source strength or sampled air are patched during measurement.
function measure({ inside, outside, dir, drifting }: {inside: number; outside: number; dir: number; drifting: boolean}) {
  const key = `${inside}:${outside}:${dir}:${drifting}`;
  if (measured.has(key)) return measured.get(key);
  const windX = drifting ? dir * 2 : 0, windZ = drifting ? 0.5 : 0;
  const g = createFlight({ x: 0, y: 1000, z: 0 });
  const input = Object.freeze({ controlMode: 'brakes',
    leftBrake: dir < 0 ? inside : outside, rightBrake: dir > 0 ? inside : outside });
  // Initialise trim relative to the moving air before the physical preparation begins.
  for (const body of [g.pilot, g.canopy]) {
    body.vel.x += windX; body.vel.y += 3; body.vel.z += windZ;
  }
  for (let tick = 0; tick < 60 / dt; tick++) stepFlight(g, input, { windX, windZ, windY: 3 }, dt);
  const radius = Math.hypot(g.pilot.vel.x - windX, g.pilot.vel.z - windZ) / Math.abs(g.trackRate);
  const centre = { x: g.pos.x + dir * radius * Math.cos(g.track),
    z: g.pos.z + dir * radius * Math.sin(g.track) };
  const source = { ...centre, id: 'direct-measured-core', generation: 7, r: 60, s: 5.5,
    strength: 1, remaining: 180, live: true, dir, vx: windX, vz: windZ };
  const weather = { windX, windZ, thermals: [source] }, air: AirSample = {};
  const height = g.pos.y;
  let previousAngle = Math.atan2(g.pos.x - source.x, -(g.pos.z - source.z)), arc = 0;
  let maximumDistance = 0, peakBank = 0, meanLift = 0, meanSink = 0, failures = 0;
  for (let tick = 0; tick < seconds / dt; tick++) {
    const elapsed = (tick + 1) * dt;
    source.x = centre.x + source.vx * elapsed; source.z = centre.z + source.vz * elapsed;
    sampleAtmosphere(g.pos, weather, air);
    stepFlight(g, input, air, dt);
    const angle = Math.atan2(g.pos.x - source.x, -(g.pos.z - source.z));
    arc += wrap(angle - previousAngle) * dir; previousAngle = angle;
    maximumDistance = Math.max(maximumDistance, Math.hypot(g.pos.x - source.x, g.pos.z - source.z));
    peakBank = Math.max(peakBank, Math.abs(g.bank));
    meanLift += air.thermal! * dt / seconds; meanSink += (air.windY! - g.vy) * dt / seconds;
    failures += g.stall > 0 || g.tuck > 0 || g.loop || g.acro || g.deepBrake ? 1 : 0;
    assert.equal(g.bankTarget, 0, 'no keyboard bank controller steers the measured wing');
    assert.equal(g.coordination, 0);
    assert.ok(Number.isFinite(g.pos.x) && Number.isFinite(g.pos.y) && Number.isFinite(g.pos.z));
  }
  const result = { inside, outside, dir, drifting, seconds, initialRadius: radius,
    circles: arc / (2 * Math.PI), gain: g.pos.y - height, maximumDistance,
    peakBank: peakBank / DEG, meanLift, meanSink, failures,
    relativeX: g.pos.x - source.x, relativeZ: g.pos.z - source.z };
  measured.set(key, result);
  return result;
}

for (const [inside, outside] of [[0.45, 0.15], [0.5, 0.2]]) {
  for (const dir of [-1, 1]) for (const drifting of [false, true]) {
    test(`direct ${inside}/${outside} established ${drifting ? 'drifting' : 'stationary'} thermal circle, side ${dir}`, t => {
      const result = measure({ inside, outside, dir, drifting });
      assert.ok(result.circles >= 2, `${result.circles} complete source-relative circles`);
      assert.ok(result.gain >= 20, `${result.gain}m gained in the actual r60 / 5.5m/s profile`);
      assert.ok(result.maximumDistance < 36, 'the complete circle stays within the useful core');
      assert.ok(result.peakBank < 35, `${result.peakBank} degrees peak bank`);
      assert.equal(result.failures, 0);
      assert.ok(result.meanLift > result.meanSink, 'sampled rising air supports the measured climb');
      const mirror = measure({ inside, outside, dir: -dir, drifting });
      assert.ok(Math.abs(result.gain - mirror.gain) < 0.01, 'turn directions have equivalent climb');
      assert.ok(Math.abs(result.relativeX + mirror.relativeX) < 0.01);
      assert.ok(Math.abs(result.relativeZ - mirror.relativeZ) < 0.01);
      t.diagnostic(JSON.stringify(result));
    });
  }
}
