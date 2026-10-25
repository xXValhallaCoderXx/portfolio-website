import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudbaseRun, cloudThermalRemaining } from '../../domains/good-lift/cloudbase-state.ts';
import { createRunWorld, startRun, stepRun } from '../../domains/good-lift/run-step.ts';
import { createLiftActivity } from '../../domains/coaching/lift-activity.ts';
import { movingLiftIntercept } from '../../domains/flight/glide-math.ts';
import { shore, surfaceAt } from '../../domains/flight/ground.ts';
import { PHYSICS } from '../../domains/flight/flight.ts';
import type { Vector2 } from '../../domains/flight/models.ts';

const STEP = 1 / 60;
const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
const bearing = (from: Vector2, to: Vector2) => Math.atan2(to.x - from.x, -(to.z - from.z));

// Start normally, make a simple digital departure onto the favorable cliff, then choose a live
// thermal and physically fly across to it. Sources keep their seeded movement/lifetime; no
// height, pose, weather or source is modified after startRun. Random hazards are excluded so this
// regression measures the ridge/glide/capture height budget rather than a coincidental strike.
// The route and its budgets were laid out for the classic wing's speed and circles, and it flies
// that wing: a glider's own pilot would fly them otherwise.
function ridgeToThermal(seed: number, departAt: number) {
  const sky = createCloudbaseRun({ hazards: false });
  const world = createRunWorld({ sky, wing: 'classic' });
  startRun(world, seed);
  const g = world.g, side = sky.state.weather.side;
  const activity = createLiftActivity({
    heightAt: surfaceAt,
    sources: () => sky.state.thermals.map((source, id) => ({
      ...source, id, remaining: cloudThermalRemaining(source),
    })),
    inside: (pos: { x: number; z: number; }, margin: number) => Math.hypot(pos.x, pos.z - 80) < 320 - margin,
  });
  const held = side < 0 ? 4 : 1.5, align = side < 0 ? 8 : 3;
  let target = null, targetId = null, targetGeneration = null, circling = false, departingHeight = null;
  let minimumTransitHeight = Infinity, clearance = Infinity, lockedAt = Infinity;
  let ridgeClimbing = 0, thermalClimbing = 0, stallFrames = 0, consecutiveStalls = 0, longestStall = 0;
  for (let tick = 0; tick < 60 * 60; tick++) {
    const time = tick * STEP, air = world.air;
    let turn = 0, brake = false;
    if (time < departAt) {
      if (time < held) turn = side;
      else if (time >= align) {
        const targetZ = g.pos.z - 50, targetX = shore(targetZ, side, 40);
        const dx = targetX - g.pos.x, dz = targetZ - g.pos.z, distance = Math.hypot(dx, dz);
        const wanted = Math.atan2(dx / distance * 11.5 - air.windX!, -(dz / distance * 11.5 - air.windZ!));
        const error = wrap(wanted - g.yaw) - g.yawRate * 0.8;
        turn = Math.abs(error) < 0.3 ? 0 : Math.sign(error);
      }
    } else {
      if (departingHeight === null) departingHeight = g.pos.y;
      if (!target || target.generation !== targetGeneration || target.move > 0 || target.strength <= 0.5) {
        let nearest = Infinity, candidate = null;
        for (const source of sky.state.thermals.slice(1)) {
          if (source.move > 0 || source.strength <= 0.5 || cloudThermalRemaining(source) <= 20) continue;
          const aim = movingLiftIntercept(g.pos, source, { x: air.windX, z: air.windZ }, {}, g.speed);
          if (aim.seconds < nearest) { nearest = aim.seconds; candidate = source; }
        }
        target = candidate;
        assert.ok(target, 'a real live hunted thermal is available');
        targetId = sky.state.thermals.indexOf(target);
        targetGeneration = target.generation; circling = false;
      }
      if (Math.hypot(g.pos.x - target.x, g.pos.z - target.z) < target.r * 0.65) circling = true;
      let wanted;
      if (circling) {
        const angle = bearing(target, g.pos) + target.dir * 0.8;
        const aim = {
          x: target.x + Math.sin(angle) * 25 - air.windX! * 1.5 + target.vx * 2,
          z: target.z - Math.cos(angle) * 25 - air.windZ! * 1.5 + target.vz * 2,
        };
        wanted = bearing(g.pos, aim); brake = true;
      } else {
        const aim = movingLiftIntercept(g.pos, target, { x: air.windX, z: air.windZ }, {}, g.speed);
        const dx = aim.x - g.pos.x, dz = aim.z - g.pos.z, distance = Math.hypot(dx, dz);
        wanted = Math.atan2(dx / distance * 11.5 - air.windX!, -(dz / distance * 11.5 - air.windZ!));
      }
      const error = wrap(wanted - g.yaw) - g.yawRate * 0.8;
      turn = Math.abs(error) < 0.15 ? 0 : Math.sign(error);
    }
    assert.ok(turn === -1 || turn === 0 || turn === 1, 'the route uses ordinary digital steering');
    assert.equal(stepRun(world, { turn, brake }, STEP), null, 'the whole transfer stays airborne');
    assert.equal(world.controls.steered, false, 'boundary assistance cannot rescue the route');
    assert.equal(world.controls.deepBrake, false, 'ordinary capture inputs never request a deep pull');
    assert.equal(g.deepBrake, false);
    assert.equal(g.acro, false, 'thermal centering stays in the normal flight configuration');
    assert.ok(g.brakeTarget <= PHYSICS.brake, 'a sustained capture brake stays at working depth');
    clearance = Math.min(clearance, g.pos.y - surfaceAt(g.pos.x, g.pos.z));
    if (g.stall > 0) {
      stallFrames++; consecutiveStalls++;
      longestStall = Math.max(longestStall, consecutiveStalls);
    } else consecutiveStalls = 0;
    assert.equal(g.tuck, 0, 'the route needs no fold recovery');
    const state = activity.step(STEP, { g, air, clock: sky.state.elapsed });
    if (time < departAt && air.ridge! >= 1.5 && air.thermal! < 0.1 && g.vy > 0.5) ridgeClimbing += STEP;
    if (time >= departAt) minimumTransitHeight = Math.min(minimumTransitHeight, g.pos.y);
    if (time >= departAt && state.activity === 'thermal' && state.sourceId === targetId && state.sourceGeneration === targetGeneration) {
      lockedAt = Math.min(lockedAt, (tick + 1) * STEP);
      if (g.vy > 0.5) thermalClimbing += STEP;
    }
  }
  return { ridgeClimbing, lockedAt, thermalClimbing, clearance, stallFrames, longestStall,
    transitLoss: departingHeight! - minimumTransitHeight, finalHeight: g.pos.y };
}

test('real launch, ridge climb and moving-thermal capture have usable headroom in both wind directions', () => {
  // The broader columns overlap the old early departure points. Fly farther along a real
  // clear ridge in each wind direction before testing the same transfer/capture budgets.
  const departures = [{ seed: 10, departAt: 25 }, { seed: 10, departAt: 28 },
    { seed: 2, departAt: 28 }, { seed: 2, departAt: 30 }];
  for (const { seed, departAt } of departures) {
    const route = ridgeToThermal(seed, departAt), label = `seed ${seed}, leave at ${departAt}s`;
    assert.ok(route.ridgeClimbing >= 1, `${label}: real ridge air produces ${route.ridgeClimbing}s of climb before departure`);
    assert.ok(route.lockedAt <= 50, `${label}: coherent climbing thermal orbit locks at ${route.lockedAt}s`);
    assert.ok(route.thermalClimbing >= 8, `${label}: the captured thermal supplies ${route.thermalClimbing}s of actual climb`);
    assert.ok(route.transitLoss <= 15, `${label}: height spent before capture is ${route.transitLoss}m`);
    assert.ok(route.clearance >= 30, `${label}: minimum terrain clearance is ${route.clearance}m`);
    assert.ok(route.finalHeight >= 180, `${label}: the flight ends at ${route.finalHeight}m`);
    // Entering a strong moving column can briefly separate the wing. A sustained stall or
    // repeated inefficient loading must fail even if the thermal eventually rescues the route.
    assert.ok(route.stallFrames <= 15 && route.longestStall <= 12,
      `${label}: stall loading lasts ${route.stallFrames} frames total, ${route.longestStall} consecutively`);
  }
});
