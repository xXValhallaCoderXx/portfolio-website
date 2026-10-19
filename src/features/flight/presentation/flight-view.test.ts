import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlightView } from './flight-view.ts';
const fixture = () => { const pos = { x: 0, y: 100, z: 0 }; return { pos, pilot: { pos }, canopy: { pos: { x: 0, y: 107, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } }, yaw: 0 }; };
test('render rates interpolate the same physical endpoints without advancing simulation', () => {
  const g = fixture(); const view = createFlightView(g); view.capture();
  g.pos.x = 2; g.canopy.pos.x = 3; g.yaw = 0.1;
  const before = JSON.stringify(g);
  assert.equal(view.sample(0.5).pilot.pos.x, 1); assert.equal(view.sample(0.5).canopy.pos.x, 1.5);
  for (let n = 0; n <= 120; n++) view.sample(n / 120);
  assert.equal(JSON.stringify(g), before);
});
test('teleports snap, and quaternion interpolation takes the short arc', () => {
  const g = fixture(); const view = createFlightView(g); view.capture();
  g.pos.x = 100; g.canopy.pos.x = 100; g.canopy.q.w = -1;
  const drawn = view.sample(0.5);
  assert.equal(drawn.pilot.pos.x, 100); assert.ok(Math.abs(drawn.canopy.q.w) === 1);
});
