// Public flight API. The rigid canopy, suspended pilot and four aerodynamic samples live in
// flight-physics.js. Manual input changes physical brake/bar positions; maneuvers never prescribe
// a trajectory or grant energy. Both the fjord and Good Lift call this same solver.
import { PHYSICS, makePhysics, stepPhysics, physicsEnergy, copyPhysics, rotate, computeTrimPhysics } from './flight-physics.js';
import { resetEnvelope, WING } from './wing-envelope.js';
export { WING } from './wing-envelope.js';
export { PHYSICS, physicsEnergy } from './flight-physics.js';

// Nominal performance for navigation estimates, readouts and glide estimates. Actual
// motion comes entirely from PHYSICS; these summaries do not command speed, yaw or sink.
export const FLIGHT = Object.freeze({
  speed: Object.freeze({ trim: 11.50, bar: 15.3, light: 9.1 }),
  sink: Object.freeze({ least: 1.3, trim: 1.31 }),
  turn: Object.freeze({ trim: 0.5, hook: 0.6 }),
});
// Brake depths shared with the cloth animation and coach.
// Ordinary holds remain at working depth. A separate explicit input asks for deeper travel;
// gesture recognition belongs to the input adapter, never to this physical solver.
export const BRAKE = Object.freeze({ light: PHYSICS.brake, shelf: PHYSICS.deepBrake });
export const STALL = Object.freeze({ surge: 0.5 });
export const PITCH = Object.freeze({ period: 3 });
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Canonical world bodies are authoritative. The familiar flat fields are read-only telemetry.
let trim;
function trimmed() {
  if (trim) return trim;
  trim = computeTrimPhysics();
  return trim;
}

export function createFlight(pos = { x: 0, y: 0, z: 0 }) {
  const g = { ...makePhysics(pos), pos, yaw: 0, yawRate: 0, track: 0, trackRate: 0, bank: 0, speed: FLIGHT.speed.trim, sink: FLIGHT.sink.trim,
    vy: 0, turn: 0, lift: 0, liftSide: 0, brake: 0, deepBrake: false, brakeTarget: 0, acro: false, bar: 0, ears: 0,
    controlMode: 'legacy', leftBrake: 0, rightBrake: 0, leftBrakeTarget: 0, rightBrakeTarget: 0,
    coordination: 0, coordinatedLean: 0, pilotLean: 0, bankTarget: 0, pitch: 0, pitchRate: 0,
    lean: 0, roll: 0, rollRate: 0, stallLoad: 0, stall: 0,
    windX: 0, windZ: 0, felt: false,
    tuck: 0,
    wingPhase: WING.flying, recoverySource: '', inflation: 1, forwardAirspeed: 0, frontalRisk: 0,
    loop: 0, loopAngle: 0, loopRate: 0,
    loops: 0, tension: 0, load: 1,
  };
  return settleFlight(g);
}

export function releaseFlight(g) {
  g.physical.steer = g.physical.brake = g.physical.bar = g.physical.ears = 0;
  g.physical.coordination = g.physical.coordinated = g.physical.bankTarget = 0;
  g.physical.brakeTarget = g.physical.acroSteady = 0;
  g.physical.deepBrake = g.physical.acro = false;
  g.physical.controlMode = g.controlMode = 'legacy';
  g.physical.leftBrake = g.physical.rightBrake = g.physical.leftBrakeTarget = g.physical.rightBrakeTarget = 0;
  g.leftBrake = g.rightBrake = g.leftBrakeTarget = g.rightBrakeTarget = 0;
  resetEnvelope(g.physical);
  g.brake = g.bar = g.ears = g.stall = g.stallLoad = g.tuck = 0;
  g.coordination = g.coordinatedLean = g.pilotLean = g.bankTarget = 0;
  g.brakeTarget = 0; g.deepBrake = g.acro = false;
  g.wingPhase = WING.flying; g.recoverySource = ''; g.inflation = 1; g.frontalRisk = 0;
  return g;
}

export function settleFlight(g, speed) {
  const t = trimmed();
  const x = g.pos.x, y = g.pos.y, z = g.pos.z, yaw = g.yaw || 0;
  copyPhysics(g, t);
  Object.assign(g.pos, { x, y, z });
  const q = { x: 0, y: -Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
  const v = g.physical.work[11];
  rotate(v, q, t.canopy.pos.x - t.pilot.pos.x, t.canopy.pos.y - t.pilot.pos.y, t.canopy.pos.z - t.pilot.pos.z);
  Object.assign(g.canopy.pos, { x: x + v.x, y: y + v.y, z: z + v.z });
  rotate(g.pilot.vel, q, t.pilot.vel.x, t.pilot.vel.y, t.pilot.vel.z);
  rotate(g.canopy.vel, q, t.canopy.vel.x, t.canopy.vel.y, t.canopy.vel.z);
  const tq = t.canopy.q;
  Object.assign(g.canopy.q, { x: q.w * tq.x + q.y * tq.z, y: q.w * tq.y + q.y * tq.w,
    z: q.w * tq.z - q.y * tq.x, w: q.w * tq.w - q.y * tq.y });
  Object.assign(g.canopy.omega, { x: 0, y: 0, z: 0 });
  releaseFlight(g);
  if (speed != null) {
    const factor = speed / Math.hypot(g.pilot.vel.x, g.pilot.vel.z);
    g.pilot.vel.x *= factor; g.pilot.vel.z *= factor;
    g.canopy.vel.x *= factor; g.canopy.vel.z *= factor;
  }
  g.yaw = yaw; g.physical.previousYaw = yaw;
  g.physical.orbit = g.physical.angle = 0; g.physical.inverted = false;
  g.loops = 0; g.loop = 0; g.felt = false;
  // Keep the actual settled suspension as the orbit's upright reference. Its small trim pitch
  // must not count as angular travel; copying a prediction preserves these immutable numbers.
  rotate(v, g.canopy.q, 0, -PHYSICS.attachment, 0);
  const rx = g.pilot.pos.x - g.canopy.pos.x - v.x;
  const ry = g.pilot.pos.y - g.canopy.pos.y - v.y;
  const rz = g.pilot.pos.z - g.canopy.pos.z - v.z;
  const referenceLength = Math.hypot(rx, ry, rz);
  g.physical.referenceLineX = rx / referenceLength;
  g.physical.referenceLineY = ry / referenceLength;
  g.physical.referenceLineZ = rz / referenceLength;
  telemetry(g, {}, {}, 0);
  g.yawRate = g.trackRate = g.rollRate = g.pitchRate = 0;
  return g;
}

export function copyFlight(out, source) {
  for (const key in source) if (source[key] === null || typeof source[key] !== 'object') out[key] = source[key];
  copyPhysics(out, source);
  out.pos = out.pilot.pos;
  return out;
}

function telemetry(g, controls, air, dt) {
  const s = g.physical, p = g.pilot, c = g.canopy;
  const T = PHYSICS.telemetry, O = PHYSICS.orbit;
  const previousBank = g.bank, previousPitch = g.pitch, previousTrack = g.track;
  const wx = air.windX || 0, wz = air.windZ || 0;
  const wy = air.windY ?? ((air.lift || 0) - (air.sink || 0));
  const vx = p.vel.x - wx, vz = p.vel.z - wz;
  const horizontal = Math.hypot(vx, vz);
  g.track = horizontal > T.headingSpeed ? Math.atan2(vx, -vz) : g.yaw;
  g.trackRate = dt > 0 ? Math.atan2(Math.sin(g.track - previousTrack), Math.cos(g.track - previousTrack)) / dt : 0;
  const nose = s.work[7];
  rotate(nose, c.q, 0, 0, -1);
  const heading = Math.hypot(nose.x, nose.z) > T.headingSpeed ? Math.atan2(nose.x, -nose.z) : g.yaw;
  const delta = Math.atan2(Math.sin(heading - g.yaw), Math.cos(heading - g.yaw));
  g.yaw += delta;
  g.yawRate = dt > 0 ? delta / dt : 0;
  const rightX = Math.cos(g.yaw), rightZ = Math.sin(g.yaw);
  const forwardX = Math.sin(g.yaw), forwardZ = -Math.cos(g.yaw);
  const up = s.work[8], attachment = s.work[9];
  rotate(up, c.q, 0, 1, 0);
  rotate(attachment, c.q, 0, -PHYSICS.attachment, 0);
  const dx = p.pos.x - c.pos.x - attachment.x;
  const dy = p.pos.y - c.pos.y - attachment.y;
  const dz = p.pos.z - c.pos.z - attachment.z;
  g.bank = Math.atan2(up.x * rightX + up.z * rightZ, up.y);
  g.pitch = Math.atan2(dx * forwardX + dz * forwardZ, -dy);
  const angle = Math.atan2(-(dx * rightX + dz * rightZ), -dy);
  s.angle = angle;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const ux = dx / length, uy = dy / length, uz = dz / length;
  if (s.lineReady && dt > 0) {
    const cx = s.lineY * uz - s.lineZ * uy;
    const cy = s.lineZ * ux - s.lineX * uz;
    const cz = s.lineX * uy - s.lineY * ux;
    const cross = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (!s.orbitActive && uy > O.entryY && cross / dt > O.entryRate) {
      s.orbitPlaneX = cx / cross; s.orbitPlaneY = cy / cross; s.orbitPlaneZ = cz / cross;
      s.orbitActive = true; s.orbitAge = 0;
      const previousOff = s.lineX * s.orbitPlaneX + s.lineY * s.orbitPlaneY + s.lineZ * s.orbitPlaneZ;
      const referenceOff = s.referenceLineX * s.orbitPlaneX + s.referenceLineY * s.orbitPlaneY + s.referenceLineZ * s.orbitPlaneZ;
      // Include the entry arc already flown before the observation threshold. Start from the
      // previous line so this frame's measured angular increment is added exactly once.
      s.orbitPhase = Math.atan2(
        (s.referenceLineY * s.lineZ - s.referenceLineZ * s.lineY) * s.orbitPlaneX +
        (s.referenceLineZ * s.lineX - s.referenceLineX * s.lineZ) * s.orbitPlaneY +
        (s.referenceLineX * s.lineY - s.referenceLineY * s.lineX) * s.orbitPlaneZ,
        s.referenceLineX * s.lineX + s.referenceLineY * s.lineY + s.referenceLineZ * s.lineZ - referenceOff * previousOff);
      s.orbitArc = Math.abs(s.orbitPhase);
      s.orbitAbove = false; s.orbitProjection = 1;
    }
    if (s.orbitActive) {
      const off = ux * s.orbitPlaneX + uy * s.orbitPlaneY + uz * s.orbitPlaneZ;
      if (Math.abs(off) > O.maxOffPlane || s.orbitAge > O.maxAge) {
        s.orbitActive = false; s.orbitPhase = 0;
      } else {
        const previousOff = s.lineX * s.orbitPlaneX + s.lineY * s.orbitPlaneY + s.lineZ * s.orbitPlaneZ;
        const step = Math.atan2(cx * s.orbitPlaneX + cy * s.orbitPlaneY + cz * s.orbitPlaneZ,
          s.lineX * ux + s.lineY * uy + s.lineZ * uz - previousOff * off);
        s.orbitPhase += step; s.orbitArc += Math.abs(step); s.orbitAge += dt;
        s.orbitProjection = Math.min(s.orbitProjection, Math.sqrt(1 - off * off));
        s.orbitAbove ||= uy > O.aboveY;
        // A fixed world plane prevents a turning chase heading or mesh rotation earning a loop.
        // Require a complete orbit, a clear inverted portion and return beneath the canopy.
        if (Math.abs(s.orbitPhase) >= 2 * Math.PI && s.orbitAbove && uy < O.entryY) {
          g.loops += 1;
          s.lastOrbitAngle = s.orbitPhase; s.lastOrbitArc = s.orbitArc; s.lastOrbitProjection = s.orbitProjection;
          s.orbitActive = false; s.orbitPhase = 0;
        }
      }
    }
  }
  s.lineX = ux; s.lineY = uy; s.lineZ = uz; s.lineReady = true;
  s.orbit = s.orbitPhase;
  g.loop = uy > 0 ? Math.sign(s.orbitPhase) || Math.sign(s.swingRate) || 1 : 0;
  g.loopAngle = s.orbitActive ? s.orbitPhase : angle;
  g.loopRate = s.swingRate || 0;
  g.rollRate = dt > 0 ? Math.atan2(Math.sin(g.bank - previousBank), Math.cos(g.bank - previousBank)) / dt : 0;
  g.pitchRate = dt > 0 ? Math.atan2(Math.sin(g.pitch - previousPitch), Math.cos(g.pitch - previousPitch)) / dt : 0;
  g.bankTarget = s.bankTarget;
  g.coordination = s.coordinated;
  g.coordinatedLean = s.steer * s.coordinated;
  g.pilotLean = PHYSICS.coordination.lean * g.coordinatedLean;
  g.lean = s.bankTarget;
  g.roll = g.bank - g.lean;
  g.speed = Math.sqrt(vx * vx + (p.vel.y - wy) ** 2 + vz * vz);
  g.vy = p.vel.y;
  g.sink = Math.max(0, wy - p.vel.y);
  g.turn = s.steer;
  g.brake = s.brake; g.bar = s.bar; g.ears = s.ears;
  g.deepBrake = s.deepBrake; g.brakeTarget = s.brakeTarget; g.acro = s.acro;
  g.controlMode = s.controlMode;
  g.leftBrake = s.leftBrake; g.rightBrake = s.rightBrake;
  g.leftBrakeTarget = s.leftBrakeTarget; g.rightBrakeTarget = s.rightBrakeTarget;
  g.tension = s.tension;
  g.load = s.tension / (PHYSICS.pilotMass * PHYSICS.gravity);
  g.wingPhase = s.wingPhase; g.recoverySource = s.recoverySource; g.inflation = s.inflation;
  g.forwardAirspeed = (c.vel.x - wx) * nose.x + (c.vel.y - wy) * nose.y + (c.vel.z - wz) * nose.z;
  g.frontalRisk = s.frontalRisk;
  g.stallLoad = Math.max(clamp((s.alpha - T.stallStart) / T.stallRange, 0, 1), s.stallWarning);
  const separated = s.wingPhase === WING.entry || s.wingPhase === WING.stalled || s.wingPhase === WING.backfly || s.wingPhase === WING.exit;
  g.stall = separated && s.recoverySource === 'stall' ? Math.max(s.separation, 0.01) : 0;
  g.tuck = s.wingPhase === WING.frontal || s.wingPhase === WING.opening ? 1 - s.inflation : 0;
  g.windX = wx; g.windZ = wz; g.felt = true;
  g.lift = air.lift ?? Math.max(0, wy);
  s.energy = physicsEnergy(g);
}

export function stepFlight(g, controls = {}, air = {}, dt = 1 / 60) {
  if (!(dt > 0)) return g;
  // Explicit site navigation is assistance. It changes the requested glide after the common
  // manual physics; it is never used by Good Lift, scored tricks or manual landing claims.
  stepPhysics(g, controls, air, dt);
  if (controls.climb != null) {
    const change = (controls.climb - g.pilot.vel.y) * Math.min(1, dt * PHYSICS.telemetry.climbRate);
    g.pilot.vel.y += change; g.canopy.vel.y += change;
  }
  telemetry(g, controls, air, dt);
  return g;
}

export function pitchPeak(g) {
  const frequency = 2 * Math.PI / PITCH.period;
  const amplitude = Math.hypot(g.pitch, g.pitchRate / frequency);
  return (g.pitchRate < 0 ? -1 : 1) * amplitude;
}

// Read-only short predictions for presentation. These follow the same physical model.
let predicted;
function predict(g, out, pitch, horizon) {
  predicted ||= createFlight({ x: 0, y: 1000, z: 0 });
  copyFlight(predicted, g);
  const controls = { turn: g.turn, brake: g.brakeTarget > 0, deepBrake: g.deepBrake,
    bar: g.bar > 0.5, ears: g.ears > 0.5 };
  if (g.controlMode === 'brakes') Object.assign(controls, { controlMode: 'brakes',
    leftBrake: g.leftBrakeTarget / PHYSICS.deepBrake, rightBrake: g.rightBrakeTarget / PHYSICS.deepBrake });
  const air = { windX: g.physical.windX, windY: g.physical.windY, windZ: g.physical.windZ };
  out.toPeak = out.toLine = Infinity;
  out.peak = g.pitch; out.bank = g.bank; out.size = Math.abs(g.roll);
  let rate = pitch ? g.pitchRate : g.rollRate;
  let moving = Math.abs(rate) > 0.005;
  for (let i = 1; i <= horizon * 60; i++) {
    stepFlight(predicted, controls, air, 1 / 60);
    const now = pitch ? predicted.pitchRate : predicted.rollRate;
    moving ||= Math.abs(now) > 0.005;
    if (moving && rate !== 0 && rate * now <= 0) {
      out.toPeak = i / 60; out.peak = predicted.pitch; out.bank = predicted.bank; return out;
    }
    if (now !== 0) rate = now;
  }
  return out;
}
export function pitchPhase(g, out, horizon = 2) { return predict(g, out, true, horizon); }
export function rollPhase(g, out, horizon = 1.5) { return predict(g, out, false, horizon); }
