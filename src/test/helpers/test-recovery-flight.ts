// Real digital-input acceptance flights, also imported by the Chromium replay capture. No
// failure is injected: the common solver must create it before the visible coach takes over.
import { createFlight, stepFlight, WING } from '../../domains/flight/flight.ts';
import { createSwingWatch } from '../../domains/coaching/swing-watch.ts';
import { createStyle } from '../../domains/good-lift/meet-style.ts';
import { createFlightCoach } from '../../domains/coaching/flight-coach.ts';
import { controlsOf, followInstruction, createVisiblePilot } from './test-guided-opening.ts';
import { inputBits } from '../../domains/good-lift/recorder.ts';
import { finishRun } from '../../domains/good-lift/run-step.ts';
import { summariseRun } from '../../domains/good-lift/meet-sheet.ts';
import { CLOUD_ZONE } from '../../domains/good-lift/cloudbase-state.ts';

const dt = 1 / 60;
const released = () => ({ left: false, right: false, brake: false, deepBrake: false, bar: false, ears: false });

export function recoveryFlight({ scenario = 'stall', delay = 0, height = 1000, record = false } = {}) {
  const origin = { x: 0, y: height, z: 0 }, g = createFlight({ ...origin });
  const watch = createSwingWatch(), style = createStyle(), coach = createFlightCoach();
  const controls = {}, world = { g, watch, style, controls }, phases = [], bits = [];
  let input = { ...released(), brake: scenario === 'stall', deepBrake: scenario === 'stall' };
  let pending = null, stalledAt = null, backflyAt = null, handedAt = null, exitAt = null, recoveredAt = null, exitHeight = height;
  let last = '', reverseSeconds = 0, stalledSeconds = 0, folds = 0, wasFolded = false, minimumInflation = 1, maxForwardPitch = 0;
  for (let tick = 0; tick < 70 * 60; tick++) {
    const time = tick * dt;
    if (handedAt === null) {
      if (scenario === 'stall') {
        if (stalledAt !== null && time - stalledAt >= 5) input = { ...released(), brake: true };
        if (backflyAt !== null && time - backflyAt >= 5) handedAt = time;
      } else {
        input = { ...released(), brake: time % 7 < 1.5, deepBrake: time % 7 < 1.5 };
        if (g.tuck > 0) { handedAt = time; input = released(); }
      }
    }
    if (pending && tick >= pending.at) { input = pending.input; pending = null; }
    Object.assign(controls, controlsOf(input));
    if (record) bits.push(inputBits(input));
    stepFlight(g, controls, {}, dt); watch.step(dt, g, false, controls); style.step(dt, world);
    if (g.stall > 0 && stalledAt === null) stalledAt = time;
    if (g.wingPhase === WING.backfly && backflyAt === null) backflyAt = time;
    const pilotForward = g.pilot.vel.x * Math.sin(g.yaw) - g.pilot.vel.z * Math.cos(g.yaw);
    if (g.wingPhase === WING.backfly && g.forwardAirspeed < -0.5 && pilotForward < -0.5 && g.vy < 0) reverseSeconds += dt;
    if (g.stall > 0) stalledSeconds += dt;
    if (g.tuck > 0 && !wasFolded) folds++;
    wasFolded = g.tuck > 0;
    minimumInflation = Math.min(minimumInflation, g.inflation);
    maxForwardPitch = Math.max(maxForwardPitch, -g.pitch);
    let message = null;
    if (handedAt !== null) {
      message = coach.step(dt, { g, watch: watch.state, style: style.state, input, clearance: g.pos.y,
        lift: { state: 'lift', context: 'next lift', action: 'straight', detail: 'Return to lift.' } });
      if (exitAt === null && (message?.action === 'release-all' || scenario === 'frontal')) {
        exitAt = time; exitHeight = g.pos.y;
      }
      if (message && !pending) {
        const next = followInstruction(message, input);
        if (JSON.stringify(next) !== JSON.stringify(input)) pending = { at: tick + Math.round(delay / dt) + 1, input: next };
      }
      if (g.wingPhase === WING.flying && watch.state.calm >= 1) { recoveredAt = time; }
    }
    const key = `${g.wingPhase}|${message?.phase ?? ''}|${message?.action ?? ''}`;
    if (key !== last) {
      phases.push({ time, wing: g.wingPhase, phase: message?.phase, action: message?.action, title: message?.title,
        pitch: g.pitch, forward: g.forwardAirspeed, pilotForward, height: g.pos.y, inflation: g.inflation }); last = key;
    }
    if (recoveredAt !== null || g.pos.y <= 0) break;
  }
  return { scenario, delay, origin, g, watch: watch.state, style: style.state, bits, phases,
    stalledAt, backflyAt, handedAt, exitAt, recoveredAt, stalledSeconds, reverseSeconds, folds, minimumInflation, maxForwardPitch,
    recoverySeconds: recoveredAt === null || exitAt === null ? null : recoveredAt - exitAt,
    heightLoss: height - g.pos.y, recoveryHeightLoss: exitHeight - g.pos.y };
}

// Canonical launch-to-recovery counterpart. The pilot climbs using visible directions, levels
// through ordinary released controls, creates a failure manually and follows recovery advice.
export function recoveryRun({ scenario = 'stall', seed = 1, delay = 0.3, wing = undefined as string | undefined } = {}) {
  const pilot = createVisiblePilot(seed, delay, { learned: () => ['pitch', 'wingover'] }, { wing });
  const world = pilot.world, bits = [], phases = [];
  let stage = 'climb', stageAt = 0, stalledAt = null, backflyAt = null, handedAt = null, ended = null;
  while (world.sky.state.elapsed < 230 && !ended) {
    let input = null;
    const now = world.sky.state.elapsed, g = world.g;
    // The coach may reach 450 m on either side of a circle. Start the deliberate failure
    // setup on an inward heading, with room for its unsteered surge and recovery.
    const inward = Math.atan2(CLOUD_ZONE.x - g.pos.x, -(CLOUD_ZONE.z - g.pos.z));
    const headingError = Math.atan2(Math.sin(inward - g.track), Math.cos(inward - g.track));
    if (stage === 'climb' && g.pos.y >= 450 && Math.abs(headingError) < 0.2) {
      stage = 'level'; stageAt = now;
    }
    if (stage === 'level') {
      input = released();
      if (world.watch.state.calm >= 1) { stage = 'entry'; stageAt = now; }
    }
    if (stage === 'entry') {
      if (scenario === 'stall') {
        input = { ...released(), brake: true, deepBrake: true };
        if (g.stall > 0 && stalledAt === null) stalledAt = now;
        if (stalledAt !== null && now - stalledAt >= 5) input = { ...released(), brake: true };
        if (g.wingPhase === WING.backfly && backflyAt === null) backflyAt = now;
        if (backflyAt !== null && now - backflyAt >= 5) { stage = 'recover'; handedAt = now; input = null; }
      } else {
        input = { ...released(), brake: (now - stageAt) % 7 < 1.5, deepBrake: (now - stageAt) % 7 < 1.5 };
        if (g.tuck > 0) { stage = 'recover'; handedAt = now; input = null; }
      }
    }
    const before = g.wingPhase;
    ended = pilot.step(input);
    bits.push(inputBits(pilot.input));
    if (before !== g.wingPhase) phases.push({ time: world.sky.state.elapsed, phase: g.wingPhase, height: g.pos.y });
    if (stage === 'recover' && g.wingPhase === WING.flying && world.watch.state.calm >= 1) break;
  }
  const recovered = stage === 'recover' && world.g.wingPhase === WING.flying && world.watch.state.calm >= 1;
  finishRun(world, ended ?? 'quit');
  return { scenario, seed, delay, bits, phases, handedAt, recovered, assisted: pilot.stats.assisted,
    minimumClearance: pilot.stats.minimumClearance, stalls: world.stalls, tucks: world.tucks,
    g: world.g, watch: world.watch.state, style: world.style!.state, sheet: summariseRun(world, world.ended) };
}
