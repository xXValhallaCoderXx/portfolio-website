import type { AirSample, FlightState } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleAtmosphere } from './atmosphere.ts';
import { createFlight, stepFlight, PHYSICS } from './flight.ts';
import { shore, surfaceAt } from './ground.ts';

const STEP = 1 / 60;
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
function ordinary(g: FlightState) {
  assert.equal(g.deepBrake, false, 'ordinary ridge controls never request a deep pull');
  assert.equal(g.acro, false, 'ordinary soaring cannot open the acro configuration');
  assert.ok(g.brakeTarget <= PHYSICS.brake, 'the brake stays within working depth');
}

// Follow the real cliff with ordinary left/right taps and hands off the brake/bar. Steering
// deliberately has a generous deadband: correcting every small heading error wastes height.
function ridgePass(side: number, speed: number) {
  const offset = 60, startHeight = 100;
  const g = createFlight({ x: shore(240, side, offset), y: startHeight, z: 240 });
  const weather = { windX: side * speed, windZ: 0, thermals: [] }, air: AirSample = {};
  let clearance = Infinity;
  for (let tick = 0; tick < 60 * 60; tick++) {
    sampleAtmosphere(g.pos, weather, air);
    const targetZ = g.pos.z - 50, targetX = shore(targetZ, side, offset);
    const dx = targetX - g.pos.x, dz = targetZ - g.pos.z, distance = Math.hypot(dx, dz);
    const wanted = Math.atan2(dx / distance * 11.5 - air.windX!, -(dz / distance * 11.5 - air.windZ!));
    const error = wrap(wanted - g.yaw) - g.yawRate * 0.8;
    const turn = Math.abs(error) < 0.3 ? 0 : Math.sign(error);
    assert.ok(turn === -1 || turn === 0 || turn === 1);
    stepFlight(g, { turn }, air, STEP);
    ordinary(g);
    clearance = Math.min(clearance, g.pos.y - surfaceAt(g.pos.x, g.pos.z));
    assert.equal(g.stall, 0);
    assert.equal(air.thermal, 0, 'the climb comes from the ridge, without thermals');
    assert.ok(g.pos.z > -405 && g.pos.z < 405, 'the pass needs no boundary intervention');
  }
  return { climb: (g.pos.y - startHeight) / 60, clearance };
}

test('both real fjord cliffs support sixty-second digital-control soaring passes', () => {
  for (const side of [-1, 1]) for (const speed of [3, 3.5, 4]) {
    const pass = ridgePass(side, speed);
    assert.ok(pass.climb >= 0.5, `${side < 0 ? 'west' : 'east'} ridge in ${speed}m/s wind climbs ${pass.climb}m/s`);
    assert.ok(pass.clearance >= 20, `the whole pass stays safely above terrain: ${pass.clearance}m`);
  }
});

// A narrow straight-line pass hides the cost of turning around. Fly through the weaker,
// oblique western section near z=0, with generous steering deadbands and two real outward
// returns. The atmosphere contains no thermals, so every metre gained needs wind over terrain.
function repeatedRidgePasses(side: number) {
  const startHeight = 100, offset = 40;
  const g = createFlight({ x: shore(120, side, offset), y: startHeight, z: 120 });
  const angle = 70 * Math.PI / 180;
  const weather = { windX: side * 3 * Math.sin(angle), windZ: -3 * Math.cos(angle), thermals: [] };
  const air: AirSample = {};
  let along = -1, phase = 'pass', direction = 0, arc = 0, previousYaw = g.yaw;
  let rollout = 0, returns = 0, clearance = Infinity, weakSection = 0;
  for (let tick = 0; tick < 60 * 60; tick++) {
    sampleAtmosphere(g.pos, weather, air);
    let turn = 0, brake = false;
    if (phase === 'pass' && (along < 0 ? g.pos.z < -40 : g.pos.z > 100)) {
      phase = 'return'; direction = side * along; arc = 0; previousYaw = g.yaw;
    }
    if (phase === 'return') {
      arc += wrap(g.yaw - previousYaw) * direction;
      previousYaw = g.yaw;
      if (arc >= Math.PI - Math.abs(g.yawRate) * 1.15) {
        phase = 'rollout'; rollout = 0;
      } else {
        turn = direction; brake = true;
      }
    } else if (phase === 'rollout') {
      rollout += STEP;
      if (rollout >= 2.5 || Math.abs(g.bank) < 0.14 && Math.abs(g.yawRate) < 0.12) {
        phase = 'pass'; along = -along; returns++;
      }
    }
    if (phase === 'pass') {
      const targetZ = g.pos.z + along * 50, targetX = shore(targetZ, side, offset);
      const dx = targetX - g.pos.x, dz = targetZ - g.pos.z, distance = Math.hypot(dx, dz);
      const wanted = Math.atan2(dx / distance * 11.5 - air.windX!, -(dz / distance * 11.5 - air.windZ!));
      const error = wrap(wanted - g.yaw) - g.yawRate * 0.8;
      turn = Math.abs(error) < 0.3 ? 0 : Math.sign(error);
    }
    assert.ok(turn === -1 || turn === 0 || turn === 1);
    stepFlight(g, { turn, brake }, air, STEP);
    ordinary(g);
    clearance = Math.min(clearance, g.pos.y - surfaceAt(g.pos.x, g.pos.z));
    if (Math.abs(g.pos.z) < 10) weakSection += STEP;
    assert.equal(g.stall, 0, 'the ordinary returns do not require a stall');
    assert.equal(air.thermal, 0, 'the gain comes entirely from the sampled ridge field');
    assert.ok(g.pos.z > -405 && g.pos.z < 405, 'no boundary recovery is involved');
  }
  return { gain: g.pos.y - startHeight, returns, clearance, weakSection };
}

test('coarse repeated ridge passes gain height through weak oblique air on both cliffs', () => {
  for (const side of [-1, 1]) {
    const pass = repeatedRidgePasses(side);
    assert.ok(pass.returns >= 2, `the ${side < 0 ? 'west' : 'east'} route completes ${pass.returns} outward half-turns`);
    assert.ok(pass.weakSection >= 1, 'the route actually crosses the weaker z=0 section');
    assert.ok(pass.gain >= 8, `the full minute, including returns, gains ${pass.gain}m`);
    assert.ok(pass.clearance >= 30, `the full route keeps ${pass.clearance}m terrain clearance`);
  }
});

test('the forgiving ridge field still needs wind directed into the actual cliff', () => {
  for (const side of [-1, 1]) {
    const pos = { x: shore(0, side, 40), y: 100, z: 0 }, air: AirSample = {};
    sampleAtmosphere(pos, { windX: side * 3, windZ: 0, thermals: [] }, air);
    assert.ok(air.ridge! > 2, 'the favorable face provides useful physical updraft');
    sampleAtmosphere(pos, { windX: -side * 3, windZ: 0, thermals: [] }, air);
    assert.equal(air.ridge, 0, 'reversing the wind does not preserve windward lift');
    assert.ok(air.windY! <= 0, 'the old windward lane is no longer a source of free height');
  }
});

test('a real ridge flight loses its climbing support after the prevailing wind reverses', () => {
  for (const side of [-1, 1]) {
    const g = createFlight({ x: shore(120, side, 40), y: 100, z: 120 });
    const weather = { windX: side * 3, windZ: 0, thermals: [] }, air: AirSample = {};
    let heightAtShift = null, clearance = Infinity;
    for (let tick = 0; tick < 20 * 60; tick++) {
      if (tick === 10 * 60) {
        heightAtShift = g.pos.y;
        weather.windX = -side * 3;
      }
      sampleAtmosphere(g.pos, weather, air);
      const targetZ = g.pos.z - 50, targetX = shore(targetZ, side, 40);
      const dx = targetX - g.pos.x, dz = targetZ - g.pos.z, distance = Math.hypot(dx, dz);
      const wanted = Math.atan2(dx / distance * 11.5 - air.windX!, -(dz / distance * 11.5 - air.windZ!));
      const error = wrap(wanted - g.yaw) - g.yawRate * 0.8;
      const turn = Math.abs(error) < 0.3 ? 0 : Math.sign(error);
      stepFlight(g, { turn }, air, STEP);
      ordinary(g);
      clearance = Math.min(clearance, g.pos.y - surfaceAt(g.pos.x, g.pos.z));
      assert.equal(g.stall, 0);
      if (tick >= 10 * 60) assert.equal(air.ridge, 0, 'the former windward lane cannot keep its old lift');
    }
    assert.ok(heightAtShift! >= 110, 'the wing first establishes a real ridge climb');
    assert.ok(g.pos.y <= heightAtShift! - 8, 'remaining in the old lane spends height after its wind supply ends');
    assert.ok(clearance >= 30, 'the reversal is observed with enough room to leave safely');
  }
});
