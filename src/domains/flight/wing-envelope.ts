import type { FlowSample, PhysicalState } from './models.ts';
import type { WingTable } from './flight-physics.ts';
// Reduced fabric/flow memory for the coupled wing. Inputs are measured air-relative flow and
// suspension geometry. This changes aerodynamic coefficients, never a body's pose or velocity.
export const WING = Object.freeze({
  flying: 'flying', entry: 'stall-entry', stalled: 'full-stall', backfly: 'backfly',
  exit: 'reattaching', surge: 'exit-surge', frontal: 'frontal', opening: 'frontal-reopening',
});
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const approach = (v: number, target: number, dt: number, time: number) => v + (target - v) * Math.min(1, dt / time);

export function resetEnvelope(s: PhysicalState) {
  s.wingPhase = WING.flying;
  s.recoverySource = '';
  s.inflation = 1; s.separation = 0; s.sepL = s.sepR = 0;
  s.stallExposure = s.frontExposure = s.releaseExposure = s.backflyFor = s.recoveryFor = 0;
  s.stallAge = s.stallWarning = s.frontalRisk = 0;
  s.forwardAirspeed = s.linePitch = s.linePitchRate = 0;
  s.folded = false;
  s.foldL = s.foldR = s.tipL = s.tipR = s.pumpL = s.pumpR = 0;
  s.deepStall = s.creep = s.twist = s.twistRate = s.twistYaw = 0;
}

export function stepEnvelope(s: PhysicalState, flow: FlowSample, dt: number, C: WingTable) {
  // A glider's Recovery (flight-physics.js): how its front collapse opens and when it stalls deep.
  const E = C.envelope, alpha = flow.alpha, R = C.feel?.recovery;
  // Common travel loads a symmetric stall. Reattachment needs both hands up:
  // a held unilateral brake must not disappear in the common/minimum depth.
  const releaseDepth = s.controlMode === 'brakes' ? Math.max(s.leftBrake, s.rightBrake) : s.brake;
  const critical = E.stallAngle - E.brakeIncidence * Math.max(0, s.brake - C.brake);
  s.forwardAirspeed = flow.forward;
  s.linePitch = flow.pitch; s.linePitchRate = flow.pitchRate;
  // Positive incidence separates the upper flow; negative incidence can unload the leading
  // edge. The two are deliberately not combined with abs(alpha).
  s.stallWarning = clamp((alpha - critical + E.warningMargin) / E.warningMargin, 0, 1);
  const stalling = s.brake > E.backflyBrake[0] && alpha > critical && flow.forward > E.reverseSpeed && s.ears < E.ears;
  // One half stalled and the other flying is a spin or a SAT, not a parachutal wing.
  const parachutal = s.brake <= E.backflyBrake[0] && alpha > E.stallAngle && flow.forward > 0 && Math.abs(s.sepL - s.sepR) <= 0.5;
  s.stallExposure = stalling || parachutal ? s.stallExposure + dt : Math.max(0, s.stallExposure - 2 * dt);
  const stalled = s.wingPhase === WING.entry || s.wingPhase === WING.stalled || s.wingPhase === WING.backfly;
  const exiting = s.wingPhase === WING.exit || s.wingPhase === WING.surge;
  if (!stalled && stalling && s.separation < E.reattached && s.stallExposure >= E.stallHold &&
    (s.wingPhase === WING.flying || s.wingPhase === WING.surge || s.wingPhase === WING.exit && s.brake > E.backflyBrake[0])) {
    s.wingPhase = WING.entry; s.stallAge = s.backflyFor = s.releaseExposure = 0;
    s.recoverySource = 'stall';
    s.stallExposure = 0;
  }
  if (parachutal && s.stallExposure >= E.stallHold && (s.wingPhase === WING.flying || s.wingPhase === WING.surge)) {
    // High-incidence flow loss can also follow ears or a collapse without an overbraking
    // entry. Released controls should reattach that wing, never ask the pilot to hold a stall.
    s.wingPhase = WING.exit; s.recoverySource = 'stall'; s.recoveryFor = 0;
  }

  if (s.wingPhase === WING.entry || s.wingPhase === WING.stalled || s.wingPhase === WING.backfly) {
    s.stallAge += dt;
    s.separation = approach(s.separation, 1, dt, E.separateTime);
    s.inflation = approach(s.inflation, E.stalledInflation, dt, E.separateTime);
    if (s.wingPhase === WING.entry && s.stallAge >= E.entryHold && flow.pitch < E.underPitch && flow.pitchRate <= 0) {
      s.wingPhase = WING.stalled;
    }
    const backfly = s.brake >= E.backflyBrake[0] && s.brake <= E.backflyBrake[1] &&
      flow.forward < E.reverseSpeed && flow.pilotForward < E.reverseSpeed &&
      Math.abs(flow.pitch) < E.backflyPitch && Math.abs(flow.pitchRate) < E.backflyRate;
    s.backflyFor = backfly ? s.backflyFor + dt : 0;
    if (s.backflyFor >= E.backflyHold) s.wingPhase = WING.backfly;
    else if (s.wingPhase === WING.backfly && !backfly && s.brake >= E.backflyBrake[0]) s.wingPhase = WING.stalled;
    s.releaseExposure = releaseDepth < E.releaseBrake ? s.releaseExposure + dt : 0;
    // How long the hands have been on their way out of it: let go over Recovery's `creep` or more, a
    // wing that can stalls deep as it comes out.
    if (R) s.creep = releaseDepth >= E.backflyBrake[0] ? 0 : s.creep + dt;
    if (s.releaseExposure >= E.releaseHold) {
      s.wingPhase = WING.exit; s.recoveryFor = 0;
      if (R) { if (R.deep > 0 && s.creep >= R.creep) s.deepStall = 1; s.creep = 0; }
    }
  } else if (exiting || s.wingPhase === WING.exit) {
    // A brief hands-up transition between the existing deep and working gestures can be
    // captured back into backfly. Holding brake during a genuinely separated exit re-stalls it.
    if (s.separation > E.reattached && releaseDepth > E.backflyBrake[0]) {
      // Braked back in: a full stall again, and the other way out of a deep one.
      s.wingPhase = WING.stalled; s.releaseExposure = 0;
      if (R) s.deepStall = 0;
    } else if (R && s.deepStall > 0 && s.wingPhase === WING.exit) {
      // Stalled deep, the flow does not come back by itself: with the hands up it goes at `deepHands`
      // a second, and `deepBar` more on the speed bar; meanwhile the wing stays that much separated.
      if (releaseDepth < E.releaseBrake) s.deepStall = Math.max(0, s.deepStall - dt * (R.deepHands + R.deepBar * s.bar));
      s.separation = approach(s.separation, R.deep, dt, E.attachTime);
      s.inflation = approach(s.inflation, 1, dt, E.inflateTime);
    } else {
      s.separation = approach(s.separation, 0, dt, E.attachTime);
      s.inflation = approach(s.inflation, 1, dt, E.inflateTime);
      if (s.separation < E.reattached && flow.forward > E.flyingSpeed && alpha > E.frontAngle && alpha < E.attachedAngle) {
        s.separation = 0; s.inflation = 1; s.wingPhase = WING.surge;
      }
    }
  }

  const normalFlight = s.wingPhase === WING.flying || s.wingPhase === WING.surge;
  // Actual brake travel changes the inlet's effective incidence through camber. A working
  // catch can preserve pressure; a late catch at strongly negative incidence still cannot.
  const inletIncidence = alpha + E.frontBrakeIncidence * s.brake;
  const leadingEdge = normalFlight && flow.forward > E.flyingSpeed && flow.pitch < -E.frontPitch &&
    flow.pitchRate < 0 && flow.load < E.frontLoad && inletIncidence < E.frontAngle && flow.under && s.ears < E.ears;
  s.frontalRisk = normalFlight && flow.pitchRate < 0 ? clamp((-inletIncidence + E.frontWarning) / (E.frontWarning - E.frontAngle), 0, 1) : 0;
  s.frontExposure = leadingEdge ? s.frontExposure + dt : Math.max(0, s.frontExposure - 2 * dt);
  if (s.frontExposure >= E.frontHold) {
    s.wingPhase = WING.frontal; s.folded = false; s.frontExposure = 0; s.separation = 0;
    s.recoverySource = 'frontal';
  }
  if (s.wingPhase === WING.frontal || s.wingPhase === WING.opening) {
    // A glider's held hands slow its opening rather than stop it (Recovery's frontalHeld of their depth).
    const pressure = R ? flow.forward > E.inletSpeed && alpha > E.frontAngle && s.bar < E.releaseBrake :
      flow.forward > E.inletSpeed && alpha > E.frontAngle && releaseDepth < E.releaseBrake && s.bar < E.releaseBrake;
    if (!s.folded) {
      s.inflation = approach(s.inflation, E.foldInflation, dt, E.foldTime);
      if (s.inflation < E.foldInflation + E.foldedMargin) s.folded = true;
    } else if (pressure) {
      s.wingPhase = WING.opening;
      s.inflation = R ? approach(s.inflation, 1, dt * (1 - R.frontalHeld * clamp(releaseDepth / C.deepBrake, 0, 1)), R.frontalTime) :
        approach(s.inflation, 1, dt, E.inflateTime);
      if (s.inflation >= E.opened) {
        s.inflation = 1;
        // Opened with both hands held at deepHand or deeper, a wing that can stalls deep.
        if (R && R.deep > 0 && s.brake >= R.deepHand) {
          s.wingPhase = WING.exit; s.recoverySource = 'stall'; s.recoveryFor = 0; s.deepStall = 1;
        } else s.wingPhase = flow.forward > E.flyingSpeed && alpha < E.attachedAngle ? WING.surge : WING.exit;
      }
    } else {
      s.wingPhase = WING.frontal;
      if (alpha < E.frontAngle) s.inflation = approach(s.inflation, E.foldInflation, dt, E.foldTime);
    }
  }
  if (s.wingPhase === WING.surge) {
    const steady = Math.abs(flow.pitch) < C.acro.steadyPitch && Math.abs(flow.pitchRate) < C.acro.steadyRate &&
      Math.abs(flow.bank) < C.acro.steadyBank && flow.forward > E.flyingSpeed && alpha < E.attachedAngle;
    s.recoveryFor = steady ? s.recoveryFor + dt : 0;
    if (s.recoveryFor >= C.acro.steady) { s.wingPhase = WING.flying; s.recoverySource = ''; }
  }
}
