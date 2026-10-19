import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudbaseRun } from './cloudbase-state.ts';
import { createRunWorld, startRun, stepRun } from './run-step.ts';
import { shore, surfaceAt } from '../flight/ground.ts';

const STEP = 1 / 60;
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

// Depart from the actual reset pose: hold toward the favorable cliff, release, then use ordinary
// opposite-direction taps to turn along its face. No pose, wind or thermal is changed after reset.
function departure(seed: number, side: number) {
  const sky = createCloudbaseRun({ hazards: false });
  const world = createRunWorld({ sky });
  startRun(world, seed);
  const g = world.g;
  assert.equal(sky.state.weather.side, side, 'the seed supplies the intended windward cliff');
  assert.ok(g.pos.y >= 100 && g.pos.z < 285 && g.canopy.pos.z < 285, 'the complete rig starts above terrain and north of the stone arch');
  const held = side < 0 ? 4 : 1.5;
  const align = side < 0 ? 8 : 3;
  let clearance = Infinity, minimumAltitude = g.pos.y, reachedAt = Infinity, counterturned = false;
  let ridgeClimbing = 0, ridgeClimbingWithoutThermal = 0;
  for (let tick = 0; tick < 30 * 60; tick++) {
    let turn;
    if (tick < held * 60) turn = side;
    else if (tick < align * 60) turn = 0;
    else {
      const targetZ = g.pos.z - 50, targetX = shore(targetZ, side, 40);
      const dx = targetX - g.pos.x, dz = targetZ - g.pos.z, distance = Math.hypot(dx, dz);
      const air = world.air;
      const wanted = Math.atan2(dx / distance * 11.5 - air.windX!, -(dz / distance * 11.5 - air.windZ!));
      const error = wrap(wanted - g.yaw) - g.yawRate * 0.8;
      turn = Math.abs(error) < 0.3 ? 0 : Math.sign(error);
      counterturned ||= turn === -side;
    }
    assert.ok(turn === -1 || turn === 0 || turn === 1, 'only the familiar digital steering intent is used');
    assert.equal(stepRun(world, { turn }, STEP), null, 'the transfer and early ridge pass stay airborne');
    assert.equal(world.controls.steered, false, 'no boundary assistance can rescue the approach');
    assert.equal(world.controls.deepBrake, false, 'a normal departure never requests a deep pull');
    assert.equal(g.deepBrake, false);
    assert.equal(g.acro, false, 'ordinary steering cannot switch the departure into acro');
    // Eastward weather can briefly separate the wing as its still-air reset enters the strong
    // launch updraft. That initial air-entry transient must settle before the actual approach.
    if (tick >= 15) assert.equal(g.stall, 0);
    clearance = Math.min(clearance, g.pos.y - surfaceAt(g.pos.x, g.pos.z));
    minimumAltitude = Math.min(minimumAltitude, g.pos.y);
    const atCliff = side * (g.pos.x - shore(g.pos.z, side, 0)) > 15;
    if (atCliff && world.air.ridge! >= 1.5) reachedAt = Math.min(reachedAt, (tick + 1) * STEP);
    if (world.air.ridge! >= 1.5 && g.vy > 0.5) {
      ridgeClimbing += STEP;
      if (world.air.thermal! < 0.1) ridgeClimbingWithoutThermal += STEP;
    }
  }
  assert.ok(counterturned, 'the departure includes a real counterturn to align along the cliff');
  assert.ok(reachedAt <= 12, `seed ${seed} reaches usable ridge air in ${reachedAt}s`);
  assert.ok(clearance >= 25, `seed ${seed} keeps ${clearance}m terrain clearance`);
  assert.ok(minimumAltitude >= 85, `seed ${seed} retains transfer headroom: ${minimumAltitude}m`);
  assert.ok(ridgeClimbing >= 5, `seed ${seed} shows sustained real climb in ridge air: ${ridgeClimbing}s`);
  assert.ok(ridgeClimbingWithoutThermal >= 1, 'ridge lift produces actual height gain without relying only on the launch thermal');
}

test('the real Good Lift departure reaches the west cliff safely across west-weather seeds', () => {
  for (const seed of [1, 5, 7, 8]) departure(seed, -1);
});

test('the north-of-arch departure also preserves the nearer east-cliff approach', () => {
  for (const seed of [2, 3, 4, 6]) departure(seed, 1);
});
