import type { ThermalFlowState } from './thermal-flow.ts';
import type { ThermalSource, Vector2 } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createThermalFlowState, stepThermalFlow, resetThermalFlow, THERMAL_FLOW } from './thermal-flow.ts';
type TestThermal = ThermalSource & {vx: number; vz: number};

const dt = 1 / 60;
const source = (extra: Partial<ThermalSource> = {}): TestThermal => ({ x: 0, z: 0, r: 80, s: 5.5, strength: 1, live: true,
  generation: 1, dir: 1, vx: 0, vz: 0, ...extra });
function orbit(flow: ThermalFlowState, cells: TestThermal[], seconds: number, { start = 0, dir = -1, drift = false, eligible = true, y = 600 } = {}) {
  const moving = cells[1];
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const t = start + i * dt, angle = dir * t * 0.4;
    if (drift) { moving.x = moving.vx * t; moving.z = moving.vz * t; }
    const pos = { x: moving.x + Math.sin(angle) * 25, z: moving.z - Math.cos(angle) * 25, y };
    stepThermalFlow(flow, dt, pos, cells, Math.cos(angle) * 10 * dir + moving.vx,
      Math.sin(angle) * 10 * dir + moving.vz, eligible);
  }
  return flow;
}
const setup = (extra = {}) => [source({ live: false }), source(extra)];

for (const dir of [-1, 1]) test(`moving-flock direction ${dir}: actual orbit earns a grace period and correct flow clears pressure`, () => {
  const cells = setup({ dir, vx: 2, vz: -0.5 }), flow = createThermalFlowState(2);
  orbit(flow, cells, 3, { dir: -dir, drift: true });
  assert.equal(flow.pressure, false);
  orbit(flow, cells, 0.1, { start: 3, dir: -dir, drift: true });
  assert.equal(flow.source, 1); assert.equal(flow.dir, dir); assert.equal(flow.sense, -1);
  assert.equal(flow.pressure, true);
  const copy = structuredClone(flow);
  assert.deepEqual(stepThermalFlow(flow, 0, {} as Vector2, cells, 0, 0), copy, 'a paused observer is inert');
  orbit(flow, cells, 0.4, { start: 3.1, dir, drift: true });
  assert.equal(flow.pressure, true, 'a short correction does not reset the sustained history');
  orbit(flow, cells, 0.2, { start: 3.5, dir, drift: true });
  assert.equal(flow.pressure, false); assert.equal(flow.against, 0);
});

test('straight passes, the flock-free launch source and ineligible recovery never build pressure', () => {
  const cells = setup(), flow = createThermalFlowState(2);
  for (let i = 0; i < 300; i++)
    stepThermalFlow(flow, dt, { x: 10, y: 600, z: -25 + i * dt * 10 }, cells, 0, 10);
  assert.equal(flow.against, 0); assert.equal(flow.pressure, false);
  orbit(flow, cells, 4, { eligible: false });
  assert.equal(flow.source, -1); assert.equal(flow.pressure, false);
  cells[0] = source(); cells[1].live = false;
  for (let i = 0; i < 300; i++) {
    const angle = -i * dt * 0.4;
    stepThermalFlow(flow, dt, { x: Math.sin(angle) * 25, y: 600, z: -Math.cos(angle) * 25 }, cells,
      -Math.cos(angle) * 10, -Math.sin(angle) * 10);
  }
  assert.equal(flow.source, 0); assert.equal(flow.dir, 0); assert.equal(flow.pressure, false);
});

test('brief neutral gaps freeze accumulation; departure, replacement and relocation clear it', () => {
  const cells = setup(), flow = createThermalFlowState(2);
  orbit(flow, cells, 2);
  const accumulated = flow.against;
  for (let i = 0; i < 20; i++) stepThermalFlow(flow, dt, { x: 25, y: 600, z: 0 }, cells, 0, 0);
  assert.equal(flow.against, accumulated);
  for (let i = 0; i < 20; i++) stepThermalFlow(flow, dt, { x: 25, y: 600, z: 0 }, cells, 0, 0);
  assert.equal(flow.against, 0);
  for (const change of [() => cells[1].generation!++, () => { cells[1].move = 2; }, () => { cells[1].live = false; }]) {
    cells[1].live = true; cells[1].move = 0;
    orbit(flow, cells, 4); assert.equal(flow.pressure, true);
    change();
    stepThermalFlow(flow, dt, { x: 25, y: 600, z: 0 }, cells, 0, 0);
    assert.equal(flow.pressure, false); assert.equal(flow.against, 0);
  }
  resetThermalFlow(flow); assert.equal(flow.source, -1);
});

test('overlap switches only after a stronger source persists, and observers survive a plain-state copy', () => {
  const cells = setup(), flow = createThermalFlowState(3);
  cells.push(source({ s: 5.4, dir: -1 }));
  orbit(flow, cells, 1);
  assert.equal(flow.source, 1);
  cells[2].s = cells[1].s! * (THERMAL_FLOW.improvement - 0.01);
  orbit(flow, cells, 2, { start: 1 }); assert.equal(flow.source, 1);
  cells[2].s = 7;
  orbit(flow, cells, 0.9, { start: 3 }); assert.equal(flow.source, 1);
  const copy = structuredClone(flow);
  orbit(flow, cells, 0.2, { start: 3.9 }); orbit(copy, cells, 0.2, { start: 3.9 });
  assert.equal(flow.source, 2); assert.deepEqual(flow, copy);
});
