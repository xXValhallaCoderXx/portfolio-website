import type { FlightState, FlightInput } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlight, stepFlight } from './flight.ts';

const fly = (g: FlightState, seconds: number, controls: FlightInput|undefined, air = {}) => {
  for (let i = 0; i < seconds * 60; i++) stepFlight(g, controls, air, 1 / 60);
  return g;
};

test('ears are a common physical descent tool rather than a separate run handling model', () => {
  const plain = fly(createFlight({ x: 0, y: 1000, z: 0 }), 20, {});
  const ears = fly(createFlight({ x: 0, y: 1000, z: 0 }), 20, { ears: true });
  assert.ok(ears.ears > 0.99 && ears.vy < -4);
  assert.ok(ears.pos.y < plain.pos.y - 40);
  assert.ok(ears.speed > 7 && ears.speed < 14);
});

test('ears and bar cannot be held together and braking smoothly opens the ears', () => {
  const g = createFlight({ x: 0, y: 1000, z: 0 });
  fly(g, 3, { ears: true, bar: true });
  assert.ok(g.ears > 0.99 && g.bar < 0.001);
  fly(g, 1, { ears: true, brake: true });
  assert.ok(g.ears < 0.01 && g.brake > 0.39);
  fly(g, 3, {});
  assert.ok(g.ears < 0.001 && g.brake < 0.001);
});

test('rising air stays real with ears in; ears add drag rather than setting vertical velocity', () => {
  const a = createFlight({ x: 0, y: 1000, z: 0 }), b = createFlight({ x: 0, y: 1000, z: 0 });
  for (const part of [b.pilot, b.canopy]) part.vel.y += 3;
  fly(a, 20, { ears: true }); fly(b, 20, { ears: true }, { windY: 3 });
  assert.ok(Math.abs((b.pos.y - a.pos.y) - 60) < 0.005);
  assert.ok(Math.abs((b.vy - a.vy) - 3) < 0.005);
});
