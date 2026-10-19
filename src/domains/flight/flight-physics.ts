import type { AirSample, FlightInput, PhysicsBodies, PhysicalState, Quaternion, Vector3 } from './models.ts';
import { stepEnvelope, WING } from './wing-envelope.ts';

// A reduced rigid canopy and suspended pilot. Metres, seconds, kg, radians.
// The four aerodynamic samples and the suspension do all of the moving; tricks only observe it.
// The canopy body's lumped mass/inertia includes entrained air. These are game calibration
// coefficients, not cloth weight or a claim to reproduce a particular certified wing.
export const PHYSICS = Object.freeze({
  pilotMass: 87, canopyMass: 26, area: 27.4, span: 10.8, chord: 2.2, line: 7, attachment: 0.35,
  density: 1.225, gravity: 9.81, substeps: 4, quantum: 1e7,
  inertia: Object.freeze({ x: 24, y: 90, z: 90 }),
  liftZero: 0.19, liftSlope: 3, dragZero: 0.025, induced: 0.1, steeringDrag: 0.35,
  pilotDrag: 0.2, pilotSideDrag: 0.45, pilotNormalDrag: 0.6,
  suspensionStiffness: 1400, suspensionDamping: 100,
  angularDamping: Object.freeze({ x: 420, y: 150, z: 40 }),
  brake: 0.4, deepBrake: 0.6, brakeTake: 0.14, brakeRelease: 0.10, steerTime: 0.22, steerRelease: 2,
  controls: Object.freeze({ bank: 0.66, gain: 1.2, damping: 0.08, relativeDamping: 0.3, relativeRelease: 1.575, differential: 0.55,
    reversal: 3, swingRate: 0.3, swingRateRange: 0.6, swingAngle: 0.7, swingAngleRange: 0.6,
    relativeBank: 0.75, relativeBankRange: 0.35, earsTake: 0.35, earsOpen: 0.7, earsBrake: 0.15, barTime: 0.3 }),
  directBrakes: Object.freeze({ differentialLift: 0.065, differentialDrag: 0.1, dihedral: 2 }),
  coordination: Object.freeze({ bank: 0.52, gain: 1.6, damping: 0.12, steerTime: 0.15,
    take: 0.15, release: 0.25, turn: 0.2, rolloutBank: 0.08726646259971647,
    pressureTrim: 0.30, lean: 0.22 }),
  acro: Object.freeze({ steadyBank: 0.175, steadyPitch: 0.175, steadyRate: 0.3, steady: 1 }),
  envelope: Object.freeze({ stallAngle: 0.45, brakeIncidence: 1.38, warningMargin: 0.05, stallHold: 0.32,
    separateTime: 0.16, stalledInflation: 0.7, stallLift: 0.65, stallDrag: 1, stallPressure: 0.25,
    entryHold: 0.35, underPitch: 0.18, backflyBrake: Object.freeze([0.30, 0.48]),
    reverseSpeed: -0.5, backflyPitch: 0.30, backflyRate: 0.40, backflyHold: 0.5,
    releaseBrake: 0.18, releaseHold: 0.18, attachTime: 0.35, reattached: 0.05,
    flyingSpeed: 3, inletSpeed: 0.2, attachedAngle: 0.25, inflateTime: 0.45, opened: 0.98, ears: 0.2,
    frontAngle: -0.025, frontWarning: 0.05, frontBrakeIncidence: 0.7, frontPitch: 0.75, frontLoad: 0.55, frontHold: 0.25,
    foldInflation: 0.2, foldedMargin: 0.08, foldTime: 0.075, foldDrag: 0.7,
    catchIncidence: 0.08, catchPressure: 0.5, reattachLift: 0.45 }),
  aero: Object.freeze({ spanSample: 0.24, chordSample: 0.25, rollRelief: 0.8, barIncidence: 0.075,
    brakeLift: 0.6, differentialLift: 0.65, maxLift: 1.25, separation: 0.35, separationLoss: 18,
    earsLift: 0.35, brakeDrag: 0.25, earsDrag: 0.24, separationDrag: 0.8,
    pressureStability: 3.0, pressureTrim: 0.105, pressureBrake: 0.012, pressureLimit: 0.8,
    rearSlip: 1.4, frontSlip: 0.025 }),
  suspension: Object.freeze({ take: 0.9, takeRange: 0.1, tolerance: 0.0001 }),
  orbit: Object.freeze({ entryY: -0.7, entryRate: 0.4, maxOffPlane: 0.7, maxAge: 12, aboveY: 0.2 }),
  telemetry: Object.freeze({ headingSpeed: 0.25, stallStart: 0.25, stallRange: 0.25, climbRate: 2.5 }),
  solver: Object.freeze({ courseSpeed: 0.01, sampleSpeed: 0.001, length: 1e-6,
    trimSpeed: 11.5, trimClimb: -1.3, trimPitch: -0.015, trimLine: 0.02,
    trimIterations: 30, trimTolerance: 1e-8, trimSpeedDelta: 1e-4, trimAngleDelta: 1e-6,
    trimSingular: 1e-12, trimSpeedStep: 2, trimAngleStep: 0.1 }),
});

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const vec = () => ({ x: 0, y: 0, z: 0 });
const set = (v: Vector3, x: number, y: number, z: number) => { v.x = x; v.y = y; v.z = z; return v; };
const copy = (a: Vector3, b: Vector3) => set(a, b.x, b.y, b.z);
export function rotate(out: Vector3, q: Quaternion, x: number, y: number, z: number) {
  const tx = 2 * (q.y * z - q.z * y);
  const ty = 2 * (q.z * x - q.x * z);
  const tz = 2 * (q.x * y - q.y * x);
  return set(out, x + q.w * tx + q.y * tz - q.z * ty,
    y + q.w * ty + q.z * tx - q.x * tz,
    z + q.w * tz + q.x * ty - q.y * tx);
}
function inverseInertia(out: Vector3, q: Quaternion, x: number, y: number, z: number, w: Vector3) {
  rotateInverse(w, q, x, y, z);
  return rotate(out, q, w.x / PHYSICS.inertia.x, w.y / PHYSICS.inertia.y, w.z / PHYSICS.inertia.z);
}
function rotateInverse(out: Vector3, q: Quaternion, x: number, y: number, z: number) {
  const tx = 2 * (q.z * y - q.y * z), ty = 2 * (q.x * z - q.z * x), tz = 2 * (q.y * x - q.x * y);
  return set(out, x + q.w * tx - q.y * tz + q.z * ty,
    y + q.w * ty - q.z * tx + q.x * tz, z + q.w * tz - q.x * ty + q.y * tx);
}
const quantize = (number: number) => Math.round(number * PHYSICS.quantum) / PHYSICS.quantum;
function quantizeVector(v: Vector3) { v.x = quantize(v.x); v.y = quantize(v.y); v.z = quantize(v.z); }
function advanceQuaternion(q: Quaternion, omega: Vector3, dt: number) {
  const { x, y, z, w } = q;
  const h = dt * 0.5;
  q.x += h * (omega.x * w + omega.y * z - omega.z * y);
  q.y += h * (-omega.x * z + omega.y * w + omega.z * x);
  q.z += h * (omega.x * y - omega.y * x + omega.z * w);
  q.w += h * (-omega.x * x - omega.y * y - omega.z * z);
  const n = 1 / Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  q.x *= n; q.y *= n; q.z *= n; q.w *= n;
}

export function makePhysics(pos: Vector3): PhysicsBodies {
  return {
    pilot: { pos, vel: vec() },
    canopy: { pos: vec(), vel: vec(), q: { x: 0, y: 0, z: 0, w: 1 }, omega: vec() },
    physical: { steer: 0, differential: 0, brake: 0, brakeTarget: 0, deepBrake: false, bar: 0, ears: 0,
      controlMode: 'legacy', leftBrake: 0, rightBrake: 0, leftBrakeTarget: 0, rightBrakeTarget: 0,
      acro: false, acroSteady: 0,
      coordination: 0, coordinated: 0, bankTarget: 0,
      orbit: 0, angle: 0, inverted: false, previousYaw: 0,
      lineReady: false, lineX: 0, lineY: -1, lineZ: 0, orbitActive: false, orbitPlaneX: 0, orbitPlaneY: 0, orbitPlaneZ: 1,
      orbitPhase: 0, orbitAge: 0, orbitAbove: false, orbitArc: 0, orbitProjection: 1,
      lastOrbitAngle: 0, lastOrbitArc: 0, lastOrbitProjection: 0,
      windX: 0, windY: 0, windZ: 0, tension: 0, alpha: 0, energy: 0,
      wingPhase: 'flying', recoverySource: '', inflation: 1, separation: 0, stallExposure: 0, frontExposure: 0,
      releaseExposure: 0, backflyFor: 0, recoveryFor: 0, stallAge: 0, stallWarning: 0, frontalRisk: 0,
      forwardAirspeed: 0, linePitch: 0, linePitchRate: 0, folded: false,
      flow: { alpha: 0, forward: 0, pilotForward: 0, pitch: 0, pitchRate: 0, load: 1, under: true, bank: 0 },
      work: Array.from({ length: 12 }, vec), force: vec(), moment: vec(), pilotForce: vec() } as PhysicalState,
  };
}

// Kept at the aerodynamic sample's velocity: lift does no work, drag always removes energy.
function forces(g: PhysicsBodies, air: AirSample, dt = 0) {
  const C = PHYSICS;
  const H = C.controls, A = C.aero, K = C.coordination;
  const { canopy: c, pilot: p, physical: s } = g;
  const [r, right, up, forward] = s.work;
  rotate(right, c.q, 1, 0, 0); rotate(up, c.q, 0, 1, 0); rotate(forward, c.q, 0, 0, -1);
  const wx = air.windX || 0, wz = air.windZ || 0;
  const wy = (air.windY ?? ((air.lift || 0) - (air.sink || 0))) - (air.hazardSink || 0);
  s.windX = wx; s.windY = wy; s.windZ = wz;
  const horizontal = Math.hypot(p.vel.x - wx, p.vel.z - wz);
  const courseX = horizontal > C.solver.courseSpeed ? (p.vel.x - wx) / horizontal : forward.x;
  const courseZ = horizontal > C.solver.courseSpeed ? (p.vel.z - wz) / horizontal : forward.z;
  const bank = Math.atan2(-courseZ * up.x + courseX * up.z, up.y);
  const rate = c.omega.x * forward.x + c.omega.y * forward.y + c.omega.z * forward.z;
  // Familiar digital steering asks for a modest bank. Feedback works the physical brakes; it
  // never commands rotation, and momentum may carry the suspended system well beyond the ask.
  const arm = s.work[4];
  rotate(arm, c.q, 0, -C.attachment, 0);
  const dx = p.pos.x - c.pos.x - arm.x, dy = p.pos.y - c.pos.y - arm.y, dz = p.pos.z - c.pos.z - arm.z;
  const rvx = p.vel.x - c.vel.x - c.omega.y * arm.z + c.omega.z * arm.y;
  const rvy = p.vel.y - c.vel.y - c.omega.z * arm.x + c.omega.x * arm.z;
  const rvz = p.vel.z - c.vel.z - c.omega.x * arm.y + c.omega.y * arm.x;
  s.swingRate = ((dy * rvz - dz * rvy) * forward.x + (dz * rvx - dx * rvz) * forward.y +
    (dx * rvy - dy * rvx) * forward.z) / Math.max(1, dx * dx + dy * dy + dz * dz);
  if (s.controlMode !== 'brakes') {
    const reversingSwing = clamp(-s.angle * s.steer * H.reversal, 0, 1);
    const energetic = s.acro ? Math.max(clamp((Math.abs(s.swingRate) - H.swingRate) / H.swingRateRange, 0, 1) * reversingSwing,
      clamp((Math.abs(s.angle) - H.swingAngle) / H.swingAngleRange, 0, 1)) * Math.abs(s.steer) : 0;
    // Brake and turn load the wing in a coordinated configuration. Its pitch trim, differential
    // brake response and bank request change together; no force commands a trajectory or climb.
    // Only explicit deep-brake intent opens energetic authority. Ordinary correction/reversal
    // keeps the same bank controller even if momentum temporarily exceeds its requested bank.
    s.coordinated = s.coordination * (1 - energetic);
    s.bankTarget = s.steer * (H.bank + (K.bank - H.bank) * s.coordinated);
    const error = Math.atan2(Math.sin(s.bankTarget - bank), Math.cos(s.bankTarget - bank));
    const gain = H.gain + (K.gain - H.gain) * s.coordinated;
    const rollDamping = H.damping + (K.damping - H.damping) * s.coordinated;
    // The line rate comes from the pilot's velocity relative to the canopy attachment. Resist
    // that swing during ordinary flight, with a little more damping as the steering eases out.
    // Deep/acro flight keeps its existing momentum and maneuver authority.
    const relativeDamping = s.acro ? 0 : H.relativeDamping * s.swingRate *
      (1 + (H.relativeRelease - 1) * (1 - Math.abs(s.steer)));
    s.differential = clamp(gain * (error * (1 - energetic) + s.steer * H.bank * energetic) -
      rollDamping * rate * (1 - energetic) - relativeDamping, -H.differential, H.differential);
    const lineLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const relativeBank = Math.atan2(((-dy * up.z + dz * up.y) * forward.x +
      (-dz * up.x + dx * up.z) * forward.y + (-dx * up.y + dy * up.x) * forward.z) / lineLength,
    -(up.x * dx + up.y * dy + up.z * dz) / lineLength);
    if (s.differential * relativeBank > 0) s.differential *= clamp((H.relativeBank - Math.abs(relativeBank)) / H.relativeBankRange, 0, 1);
  } else {
    // Direct brake travel is authoritative. No bank target or automatic opposite-hand
    // correction is synthesized; the local aerodynamic forces and suspension do the turning.
    s.coordinated = s.bankTarget = 0;
    s.differential = s.rightBrake - s.leftBrake;
  }
  if (dt > 0) {
    const flow = s.flow;
    const avx = c.vel.x - wx, avy = c.vel.y - wy, avz = c.vel.z - wz;
    flow.forward = avx * forward.x + avy * forward.y + avz * forward.z;
    flow.alpha = Math.atan2(-(avx * up.x + avy * up.y + avz * up.z), flow.forward) - A.barIncidence * s.bar;
    const headingLength = Math.hypot(forward.x, forward.z);
    const ahead = headingLength > C.solver.courseSpeed ? (dx * forward.x + dz * forward.z) / headingLength : 0;
    const relativeAhead = headingLength > C.solver.courseSpeed ? (rvx * forward.x + rvz * forward.z) / headingLength : 0;
    flow.pilotForward = headingLength > C.solver.courseSpeed ? ((p.vel.x - wx) * forward.x + (p.vel.z - wz) * forward.z) / headingLength : 0;
    flow.pitch = Math.atan2(ahead, -dy);
    flow.pitchRate = (-dy * relativeAhead + ahead * rvy) / Math.max(1, ahead * ahead + dy * dy);
    flow.under = dy < 0; flow.load = g.load ?? 1; flow.bank = bank;
    stepEnvelope(s, flow, dt, C);
  }
  set(s.force, 0, -C.canopyMass * C.gravity, 0);
  set(s.moment, 0, 0, 0);
  let alphaSum = 0;
  for (let side = -1; side <= 1; side += 2) {
    for (let fore = -1; fore <= 1; fore += 2) {
      rotate(r, c.q, side * C.span * A.spanSample, 0, -fore * C.chord * A.chordSample);
      const vx = c.vel.x + c.omega.y * r.z - c.omega.z * r.y - wx;
      const vy = c.vel.y + c.omega.z * r.x - c.omega.x * r.z - wy;
      const vz = c.vel.z + c.omega.x * r.y - c.omega.y * r.x - wz;
      const speed2 = vx * vx + vy * vy + vz * vz;
      const speed = Math.sqrt(speed2);
      if (speed < C.solver.sampleSpeed) continue;
      const along = vx * forward.x + vy * forward.y + vz * forward.z;
      const normal = vx * up.x + vy * up.y + vz * up.z;
      // A flexible canopy sheds most of a rigid wing's spanwise rotational incidence. Keep the
      // actual point velocity for force direction/work; use the relieved incidence for loading.
      const incidenceNormal = normal + A.rollRelief * rate * side * C.span * A.spanSample;
      const alpha = Math.atan2(-incidenceNormal, along);
      alphaSum += alpha;
      const direct = s.controlMode === 'brakes';
      const brake = direct ? side < 0 ? s.leftBrake : s.rightBrake : s.brake + Math.max(0, side * s.differential);
      const differential = direct ? brake - s.brake : Math.max(0, side * s.differential);
      const incidence = alpha - A.barIncidence * s.bar;
      let cl = direct ? clamp(C.liftZero + C.liftSlope * incidence + A.brakeLift * s.brake -
        C.directBrakes.differentialLift * differential, 0, A.maxLift) :
        clamp(C.liftZero + C.liftSlope * incidence + A.brakeLift * s.brake - A.differentialLift * side * s.differential, 0, A.maxLift);
      // Canopy dihedral turns a sideslip into restoring lift. It is a passive local
      // aerodynamic response, not a bank target or an unrequested brake correction.
      if (direct) cl = clamp(cl + side * C.directBrakes.dihedral *
        (vx * right.x + vy * right.y + vz * right.z) / speed, 0, A.maxLift);
      const separated = Math.max(0, Math.abs(incidence) - A.separation);
      cl *= 1 / (1 + A.separationLoss * separated * separated);
      cl *= 1 - A.earsLift * s.ears;
      // Reconstructing cloth retains a broad positive-incidence polar until forward flow
      // reattaches. Without this transition the reduced rigid wing could get trapped in a
      // parachutal equilibrium even after all controls were released.
      if ((s.wingPhase === WING.exit || s.wingPhase === WING.surge || s.wingPhase === WING.opening) &&
          (direct ? Math.max(s.leftBrake, s.rightBrake) : s.brake) < C.envelope.releaseBrake && along > 0 && incidence > C.envelope.attachedAngle)
        cl = Math.max(cl, C.envelope.reattachLift * (1 - A.earsLift * s.ears));
      let cd = C.dragZero + C.induced * cl * cl + A.brakeDrag * brake * brake +
        (direct ? C.directBrakes.differentialDrag : C.steeringDrag) * differential + A.earsDrag * s.ears +
        A.separationDrag * clamp(separated, 0, 1);
      // Shift the pressure center smoothly to give the inflated wing a stable trim incidence.
      const pitchTrim = A.pressureTrim + K.pressureTrim * s.brake * Math.abs(s.steer) * s.coordinated;
      let cp = -A.pressureStability * (alpha - pitchTrim) - A.pressureBrake * (direct ? brake : s.brake);
      // The separated cloth has a broad drag polar and a different pressure centre. It can
      // support a descending reverse glide; no backwards velocity or sink rate is prescribed.
      const E = C.envelope, separatedFlow = s.separation;
      // Refilled cloth retains a different pressure response until the first steady recovery.
      // The brake can oppose its low-incidence exit dive; attached ordinary handling is unchanged.
      if (s.wingPhase === WING.surge) cp += E.catchPressure * s.brake * clamp((E.catchIncidence - incidence) / E.catchIncidence, 0, 1);
      if (separatedFlow > 0) {
        cl += (E.stallLift - cl) * separatedFlow;
        cd += (E.stallDrag - cd) * separatedFlow;
        cp += (E.stallPressure - cp) * separatedFlow;
      }
      if (s.inflation < 1) {
        cl *= s.inflation * s.inflation;
        cd += E.foldDrag * (1 - s.inflation);
      }
      const weight = 1 + fore * clamp(cp / (C.chord * A.chordSample), -A.pressureLimit, A.pressureLimit);
      const pressure = 0.5 * C.density * speed2 * (C.area / 4) * weight;
      const dot = normal / speed;
      let nx = up.x - (vx / speed) * dot;
      let ny = up.y - (vy / speed) * dot;
      let nz = up.z - (vz / speed) * dot;
      const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const lift = length > C.solver.length ? pressure * cl / length : 0;
      const drag = pressure * cd / speed;
      let fx = nx * lift - vx * drag;
      let fy = ny * lift - vy * drag;
      let fz = nz * lift - vz * drag;
      // Sideslip resistance is dissipative and gives the canopy a weathercock response.
      const slip = vx * right.x + vy * right.y + vz * right.z;
      const sideForce = -(fore < 0 ? A.rearSlip : A.frontSlip) * pressure * slip / speed;
      fx += sideForce * right.x; fy += sideForce * right.y; fz += sideForce * right.z;
      s.force.x += fx; s.force.y += fy; s.force.z += fz;
      s.moment.x += r.y * fz - r.z * fy;
      s.moment.y += r.z * fx - r.x * fz;
      s.moment.z += r.x * fy - r.y * fx;
    }
  }
  s.alpha = alphaSum / 4;
  // This damps rotation; it never commands an attitude or supplies a maneuver's energy.
  const bodyRate = s.work[5], damping = s.work[6];
  rotateInverse(bodyRate, c.q, c.omega.x, c.omega.y, c.omega.z);
  rotate(damping, c.q, C.angularDamping.x * bodyRate.x, C.angularDamping.y * bodyRate.y, C.angularDamping.z * bodyRate.z);
  s.moment.x -= damping.x; s.moment.y -= damping.y; s.moment.z -= damping.z;
  const px = p.vel.x - wx, py = p.vel.y - wy, pz = p.vel.z - wz;
  const drag = 0.5 * C.density * C.pilotDrag * Math.sqrt(px * px + py * py + pz * pz);
  set(s.pilotForce, -px * drag, -C.pilotMass * C.gravity - py * drag, -pz * drag);
  // Distributed risers resist the canopy turning independently of its suspension. This spring
  // stores explicit potential energy; equal/opposite tangential forces conserve momentum.
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (length > C.solver.length) {
    const ux = dx / length, uy = dy / length, uz = dz / length;
    const normalSpeed = px * ux + py * uy + pz * uz;
    const normalDrag = -0.5 * C.density * C.pilotNormalDrag * Math.abs(normalSpeed) * normalSpeed;
    const along = right.x * ux + right.y * uy + right.z * uz;
    const sx = right.x - along * ux, sy = right.y - along * uy, sz = right.z - along * uz;
    const sideLength = Math.sqrt(sx * sx + sy * sy + sz * sz);
    const sideSpeed = sideLength > C.solver.length ? (px * sx + py * sy + pz * sz) / sideLength : 0;
    const sideDrag = sideLength > C.solver.length ? -0.5 * C.density * C.pilotSideDrag * Math.abs(sideSpeed) * sideSpeed / sideLength : 0;
    s.pilotForce.x += normalDrag * ux + sideDrag * sx;
    s.pilotForce.y += normalDrag * uy + sideDrag * sy;
    s.pilotForce.z += normalDrag * uz + sideDrag * sz;
  }
  if (length > C.line * C.suspension.take) {
    const ux = dx / length, uy = dy / length, uz = dz / length;
    const take = clamp((length / C.line - C.suspension.take) / C.suspension.takeRange, 0, 1);
    const weight = take * take * (3 - 2 * take);
    const gradient = 6 * take * (1 - take) / (C.line * C.suspension.takeRange);
    const lineX = (dy * rvz - dz * rvy) / (length * length);
    const lineY = (dz * rvx - dx * rvz) / (length * length);
    const lineZ = (dx * rvy - dy * rvx) / (length * length);
    let ox = c.omega.x - lineX, oy = c.omega.y - lineY, oz = c.omega.z - lineZ;
    const axial = ox * ux + oy * uy + oz * uz;
    ox -= axial * ux; oy -= axial * uy; oz -= axial * uz;
    const tx = weight * (-C.suspensionStiffness * (up.y * uz - up.z * uy) - C.suspensionDamping * ox);
    const ty = weight * (-C.suspensionStiffness * (up.z * ux - up.x * uz) - C.suspensionDamping * oy);
    const tz = weight * (-C.suspensionStiffness * (up.x * uy - up.y * ux) - C.suspensionDamping * oz);
    const radial = C.suspensionStiffness * (1 + up.x * ux + up.y * uy + up.z * uz) * gradient;
    const fx = (uy * tz - uz * ty) / length - radial * ux;
    const fy = (uz * tx - ux * tz) / length - radial * uy;
    const fz = (ux * ty - uy * tx) / length - radial * uz;
    s.pilotForce.x += fx; s.pilotForce.y += fy; s.pilotForce.z += fz;
    s.force.x -= fx; s.force.y -= fy; s.force.z -= fz;
    s.moment.x += tx - (arm.y * fz - arm.z * fy);
    s.moment.y += ty - (arm.z * fx - arm.x * fz);
    s.moment.z += tz - (arm.x * fy - arm.y * fx);
  }
}

function suspension(g: PhysicsBodies, dt: number) {
  const C = PHYSICS;
  const { canopy: c, pilot: p, physical: s } = g;
  const [r, u, torque, inverse, scratch] = s.work;
  rotate(r, c.q, 0, -C.attachment, 0);
  const dx = p.pos.x - c.pos.x - r.x, dy = p.pos.y - c.pos.y - r.y, dz = p.pos.z - c.pos.z - r.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (distance < C.solver.length) return;
  set(u, dx / distance, dy / distance, dz / distance);
  const relativeX = p.vel.x - c.vel.x - c.omega.y * r.z + c.omega.z * r.y;
  const relativeY = p.vel.y - c.vel.y - c.omega.z * r.x + c.omega.x * r.z;
  const relativeZ = p.vel.z - c.vel.z - c.omega.x * r.y + c.omega.y * r.x;
  const radial = relativeX * u.x + relativeY * u.y + relativeZ * u.z;
  if (distance + Math.max(0, radial) * dt < C.line - C.suspension.tolerance) return;
  set(torque, r.y * u.z - r.z * u.y, r.z * u.x - r.x * u.z, r.x * u.y - r.y * u.x);
  inverseInertia(inverse, c.q, torque.x, torque.y, torque.z, scratch);
  const inverseMass = 1 / C.pilotMass + 1 / C.canopyMass + torque.x * inverse.x + torque.y * inverse.y + torque.z * inverse.z;
  const impulse = Math.max(0, radial / inverseMass);
  p.vel.x -= impulse * u.x / C.pilotMass; p.vel.y -= impulse * u.y / C.pilotMass; p.vel.z -= impulse * u.z / C.pilotMass;
  c.vel.x += impulse * u.x / C.canopyMass; c.vel.y += impulse * u.y / C.canopyMass; c.vel.z += impulse * u.z / C.canopyMass;
  c.omega.x += impulse * inverse.x; c.omega.y += impulse * inverse.y; c.omega.z += impulse * inverse.z;
  s.tension += impulse / (dt * C.substeps);
  // Correct positional drift preserving the center of mass; do not derive velocity from this
  // correction, which would create energy at retension.
  if (distance > C.line) {
    const error = distance - C.line;
    const total = C.pilotMass + C.canopyMass;
    p.pos.x -= u.x * error * C.canopyMass / total;
    p.pos.y -= u.y * error * C.canopyMass / total;
    p.pos.z -= u.z * error * C.canopyMass / total;
    c.pos.x += u.x * error * C.pilotMass / total;
    c.pos.y += u.y * error * C.pilotMass / total;
    c.pos.z += u.z * error * C.pilotMass / total;
  }
}

export function stepPhysics(g: PhysicsBodies, controls: FlightInput, air: AirSample, dt: number) {
  const C = PHYSICS;
  const s = g.physical, K = C.coordination;
  const direct = controls.controlMode === 'brakes' && !controls.locked && !controls.steered;
  const previousMode = s.controlMode;
  s.controlMode = direct ? 'brakes' : 'legacy';
  const left = direct && Number.isFinite(controls.leftBrake) ? clamp(controls.leftBrake!, 0, 1) : 0;
  const right = direct && Number.isFinite(controls.rightBrake) ? clamp(controls.rightBrake!, 0, 1) : 0;
  // The host has already replaced manual steering for a strike or boundary intervention.
  const steerWant = clamp(controls.turn || 0, -1, 1);
  const manual = direct ? left > 0 || right > 0 : !!controls.brake || !!controls.deepBrake;
  const earsRequested = controls.ears && !manual;
  const barRequested = controls.bar && !manual && !controls.ears;
  s.deepBrake = direct ? Math.max(left, right) * C.deepBrake > C.brake + 1e-9 : !!controls.deepBrake;
  if (controls.locked || controls.steered) { s.acro = false; s.acroSteady = 0; }
  else if (s.deepBrake) { s.acro = true; s.acroSteady = 0; }
  else if (s.acro) {
    const A = C.acro;
    const steady = Math.abs(g.bank || 0) < A.steadyBank && Math.abs(g.pitch || 0) < A.steadyPitch &&
      Math.abs(g.rollRate || 0) < A.steadyRate && Math.abs(g.pitchRate || 0) < A.steadyRate && !g.loop;
    s.acroSteady = steady ? s.acroSteady + dt : 0;
    if (s.acroSteady >= A.steady) { s.acro = false; s.acroSteady = 0; }
  }
  if (direct) {
    if (previousMode !== 'brakes') {
      s.leftBrake = clamp(s.brake + Math.max(0, -s.differential), 0, C.deepBrake);
      s.rightBrake = clamp(s.brake + Math.max(0, s.differential), 0, C.deepBrake);
    }
    s.leftBrakeTarget = left * C.deepBrake;
    s.rightBrakeTarget = right * C.deepBrake;
    s.leftBrake += (s.leftBrakeTarget - s.leftBrake) * Math.min(1, dt /
      (s.leftBrakeTarget > s.leftBrake ? C.brakeTake : C.brakeRelease));
    s.rightBrake += (s.rightBrakeTarget - s.rightBrake) * Math.min(1, dt /
      (s.rightBrakeTarget > s.rightBrake ? C.brakeTake : C.brakeRelease));
    s.brakeTarget = Math.min(s.leftBrakeTarget, s.rightBrakeTarget);
    s.brake = Math.min(s.leftBrake, s.rightBrake);
    s.steer = (s.rightBrake - s.leftBrake) / C.deepBrake;
    s.coordination = 0;
  } else {
    const available = !controls.locked && !controls.steered && !barRequested && !earsRequested && !g.loop;
    const requested = available && manual && !s.deepBrake && Math.abs(steerWant) > K.turn;
    // Keep the coordinated controller through a hands-up rollout, then ease back to normal.
    // Releasing only the brake while holding a direction returns to the ordinary turn.
    const rollingOut = available && s.coordination > 0 && Math.abs(steerWant) <= K.turn && Math.abs(g.bank || 0) > K.rolloutBank;
    const coordinationWant = requested || rollingOut ? 1 : 0;
    s.coordination += (coordinationWant - s.coordination) * Math.min(1, dt / (coordinationWant ? K.take : K.release));
    const steerTime = (C.steerTime + (K.steerTime - C.steerTime) * s.coordination) *
      (steerWant === 0 ? C.steerRelease : 1);
    s.steer += (steerWant - s.steer) * Math.min(1, dt / steerTime);
    const brakeWant = controls.locked ? 0 : s.deepBrake ? C.deepBrake : manual ? C.brake : 0;
    s.brakeTarget = brakeWant;
    s.brake += (brakeWant - s.brake) * Math.min(1, dt / (brakeWant > s.brake ? C.brakeTake : C.brakeRelease));
    s.leftBrakeTarget = s.rightBrakeTarget = brakeWant;
  }
  const earsWant = !controls.locked && earsRequested ? 1 : 0;
  s.ears += (earsWant - s.ears) * Math.min(1, dt / (manual ? C.controls.earsBrake : earsWant ? C.controls.earsTake : C.controls.earsOpen));
  const barWant = !controls.locked && barRequested ? 1 : 0;
  s.bar += (barWant - s.bar) * Math.min(1, dt / C.controls.barTime);
  const h = dt / C.substeps;
  const wx = air.windX || 0, wz = air.windZ || 0;
  const wy = (air.windY ?? ((air.lift || 0) - (air.sink || 0))) - (air.hazardSink || 0);
  s.tension = 0;
  for (let i = 0; i < C.substeps; i++) {
    const budget = physicsEnergy(g, wx, wy, wz) + (C.pilotMass + C.canopyMass) * C.gravity * wy * h;
    forces(g, air, h);
    const { canopy: c, pilot: p } = g;
    const a = s.work[6], b = s.work[7];
    rotateInverse(b, c.q, c.omega.x, c.omega.y, c.omega.z);
    rotate(a, c.q, b.x * C.inertia.x, b.y * C.inertia.y, b.z * C.inertia.z);
    const tx = s.moment.x - (c.omega.y * a.z - c.omega.z * a.y);
    const ty = s.moment.y - (c.omega.z * a.x - c.omega.x * a.z);
    const tz = s.moment.z - (c.omega.x * a.y - c.omega.y * a.x);
    inverseInertia(a, c.q, tx, ty, tz, b);
    c.omega.x += a.x * h; c.omega.y += a.y * h; c.omega.z += a.z * h;
    c.vel.x += s.force.x * h / C.canopyMass; c.vel.y += s.force.y * h / C.canopyMass; c.vel.z += s.force.z * h / C.canopyMass;
    p.vel.x += s.pilotForce.x * h / C.pilotMass; p.vel.y += s.pilotForce.y * h / C.pilotMass; p.vel.z += s.pilotForce.z * h / C.pilotMass;
    suspension(g, h);
    c.pos.x += c.vel.x * h; c.pos.y += c.vel.y * h; c.pos.z += c.vel.z * h;
    p.pos.x += p.vel.x * h; p.pos.y += p.vel.y * h; p.pos.z += p.vel.z * h;
    advanceQuaternion(c.q, c.omega, h);
    suspension(g, h);
    const after = physicsEnergy(g, wx, wy, wz);
    if (after > budget && s.kinetic > 0) {
      // A passive integrator: discard positive numerical work from stiff retension/rotation.
      // Moving air's legitimate work is included above; this can remove energy, never add it.
      const factor = Math.sqrt(Math.max(0, 1 - (after - budget) / s.kinetic));
      p.vel.x = wx + (p.vel.x - wx) * factor; p.vel.y = wy + (p.vel.y - wy) * factor; p.vel.z = wz + (p.vel.z - wz) * factor;
      c.vel.x = wx + (c.vel.x - wx) * factor; c.vel.y = wy + (c.vel.y - wy) * factor; c.vel.z = wz + (c.vel.z - wz) * factor;
      c.omega.x *= factor; c.omega.y *= factor; c.omega.z *= factor;
    }
    // Far below a visible millimetre, but above cross-engine transcendental roundoff.
    quantizeVector(p.pos); quantizeVector(c.pos); quantizeVector(p.vel); quantizeVector(c.vel); quantizeVector(c.omega);
    s.inflation = quantize(s.inflation); s.separation = quantize(s.separation);
    c.q.x = quantize(c.q.x); c.q.y = quantize(c.q.y); c.q.z = quantize(c.q.z); c.q.w = quantize(c.q.w);
  }
  if (!direct) {
    s.leftBrake = s.brake + Math.max(0, -s.differential);
    s.rightBrake = s.brake + Math.max(0, s.differential);
  }
  return g;
}

export function physicsEnergy(g: PhysicsBodies, wx = 0, wy = 0, wz = 0) {
  const { canopy: c, pilot: p, physical: s } = g;
  const w = s.work[10];
  rotateInverse(w, c.q, c.omega.x, c.omega.y, c.omega.z);
  const up = s.work[8], attachment = s.work[9];
  rotate(up, c.q, 0, 1, 0); rotate(attachment, c.q, 0, -PHYSICS.attachment, 0);
  const dx = p.pos.x - c.pos.x - attachment.x, dy = p.pos.y - c.pos.y - attachment.y, dz = p.pos.z - c.pos.z - attachment.z;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const take = clamp((length / PHYSICS.line - PHYSICS.suspension.take) / PHYSICS.suspension.takeRange, 0, 1);
  const elastic = length > PHYSICS.solver.length ? PHYSICS.suspensionStiffness * take * take * (3 - 2 * take) *
    (1 + (up.x * dx + up.y * dy + up.z * dz) / length) : 0;
  s.kinetic = 0.5 * PHYSICS.pilotMass * ((p.vel.x - wx) ** 2 + (p.vel.y - wy) ** 2 + (p.vel.z - wz) ** 2) +
    0.5 * PHYSICS.canopyMass * ((c.vel.x - wx) ** 2 + (c.vel.y - wy) ** 2 + (c.vel.z - wz) ** 2) +
    0.5 * (PHYSICS.inertia.x * w.x ** 2 + PHYSICS.inertia.y * w.y ** 2 + PHYSICS.inertia.z * w.z ** 2);
  return elastic + s.kinetic + PHYSICS.gravity * (PHYSICS.pilotMass * p.pos.y + PHYSICS.canopyMass * c.pos.y);
}

export function copyPhysics<T extends PhysicsBodies>(out: T, source: PhysicsBodies): T {
  copy(out.pilot.pos, source.pilot.pos); copy(out.pilot.vel, source.pilot.vel);
  copy(out.canopy.pos, source.canopy.pos); copy(out.canopy.vel, source.canopy.vel);
  copy(out.canopy.omega, source.canopy.omega); Object.assign(out.canopy.q, source.canopy.q);
  for (const key in source.physical) if (typeof (source.physical as unknown as Record<string, unknown>)[key] !== 'object') (out.physical as unknown as Record<string, unknown>)[key] = (source.physical as unknown as Record<string, unknown>)[key];
  Object.assign(out.physical.flow, source.physical.flow);
  return out;
}

// Solve the coupled force/moment balance once. Starting with a settled equilibrium avoids
// choosing a convenient point in a long pendulum transient as the launch pose.
export function computeTrimPhysics() {
  const S = PHYSICS.solver;
  const g = makePhysics({ x: 0, y: 1000, z: 0 });
  const x = [S.trimSpeed, S.trimClimb, S.trimPitch, S.trimLine];
  const residual = (values: number[]) => {
    const [speed, climb, pitch, lineAngle] = values;
    Object.assign(g.canopy.q, { x: Math.sin(pitch / 2), y: 0, z: 0, w: Math.cos(pitch / 2) });
    const r = g.physical.work[11];
    rotate(r, g.canopy.q, 0, -PHYSICS.attachment, 0);
    const uy = -Math.cos(lineAngle), uz = Math.sin(lineAngle);
    Object.assign(g.canopy.pos, { x: 0, y: 1000 - r.y - PHYSICS.line * uy, z: -r.z - PHYSICS.line * uz });
    Object.assign(g.pilot.vel, { x: 0, y: climb, z: -speed });
    Object.assign(g.canopy.vel, g.pilot.vel);
    forces(g, {});
    const s = g.physical;
    const tension = s.pilotForce.y * uy + s.pilotForce.z * uz;
    s.tension = tension;
    return [s.force.y + s.pilotForce.y, s.force.z + s.pilotForce.z,
      s.pilotForce.y * uz - s.pilotForce.z * uy,
      s.moment.x + r.y * tension * uz - r.z * tension * uy];
  };
  for (let iteration = 0; iteration < S.trimIterations; iteration++) {
    const base = residual(x);
    if (Math.max(...base.map(Math.abs)) < S.trimTolerance) return g;
    const matrix = Array.from({ length: 4 }, (_, i) => [0, 0, 0, 0, -base[i]]);
    for (let j = 0; j < 4; j++) {
      const epsilon = j < 2 ? S.trimSpeedDelta : S.trimAngleDelta;
      const next = [...x]; next[j] += epsilon;
      const value = residual(next);
      for (let i = 0; i < 4; i++) matrix[i][j] = (value[i] - base[i]) / epsilon;
    }
    for (let column = 0; column < 4; column++) {
      let pivot = column;
      for (let row = column + 1; row < 4; row++) if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
      [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
      const divisor = matrix[column][column];
      if (Math.abs(divisor) < S.trimSingular) throw new Error('Flight trim has a singular force balance');
      for (let j = column; j < 5; j++) matrix[column][j] /= divisor;
      for (let row = 0; row < 4; row++) if (row !== column) {
        const amount = matrix[row][column];
        for (let j = column; j < 5; j++) matrix[row][j] -= amount * matrix[column][j];
      }
    }
    for (let i = 0; i < 4; i++) x[i] += clamp(matrix[i][4], i < 2 ? -S.trimSpeedStep : -S.trimAngleStep, i < 2 ? S.trimSpeedStep : S.trimAngleStep);
  }
  throw new Error('Flight trim did not converge');
}
