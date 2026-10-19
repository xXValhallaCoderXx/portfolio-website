import type { Vector3, AirSample } from '../../domains/flight/models.ts';
// Shared physical acceptance trace. The optional model lets a frozen prior simulation run the
// same experiment; no body, source strength, input response or air sample is patched after launch.
import { createFlight, stepFlight } from '../../domains/flight/flight.ts';
import { createLiftGuide } from '../../domains/coaching/lift-guide.ts';
import { sampleAtmosphere } from '../../domains/flight/atmosphere.ts';

export function measureThermalFlight({ dir, drifting, delay }: {dir:number;drifting:boolean;delay:number}, model: Partial<{createFlight:typeof createFlight;stepFlight:typeof stepFlight;createLiftGuide:typeof createLiftGuide;sampleAtmosphere:typeof sampleAtmosphere}> = {}) {
  const wing = model.createFlight ?? createFlight, fly = model.stepFlight ?? stepFlight;
  const guideFactory = model.createLiftGuide ?? createLiftGuide, sample = model.sampleAtmosphere ?? sampleAtmosphere;
  const dt = 1 / 60, warmup = 8, seconds = 40;
  const source = { id: 'measured-core', generation: 7, x: 0, z: 0, r: 60, s: 5.5,
    strength: 1, remaining: 180, live: true, dir, vx: drifting ? 2 : 0, vz: drifting ? 0.5 : 0 };
  const weather = { windX: source.vx, windZ: source.vz, thermals: [source] };
  const adapter = { heightAt: () => 0, inside: () => true, sources: () => [source],
    sampleAir: (pos: Vector3, out: AirSample) => sample(pos, weather, out) };
  const guide = guideFactory(adapter), g = wing({ x: -dir * 21, y: 1000, z: 0 }), air: AirSample = {};
  let input = { left: dir < 0, right: dir > 0, brake: true };
  const pending: Array<{at:number;input:typeof input}> = [];
  let startHeight: number | null = null, height = 0, arc = 0, previousAngle: number | null = null, changes = 0;
  let phase: string | null = null, phaseAt = 0, qualifiedAt = null, shown = 0, maxDistance = 0, stallFrames = 0;
  let minimumEase = Infinity, maximumEase = 0, minimumCircle = Infinity;
  for (let tick = 0; tick < (warmup + seconds) / dt; tick++) {
    while (pending.length && pending[0].at <= tick) input = pending.shift()!.input;
    source.x = source.vx * (tick + 1) * dt; source.z = source.vz * (tick + 1) * dt;
    adapter.sampleAir(g.pos, air);
    fly(g, { turn: Number(input.right) - Number(input.left), brake: input.brake }, air, dt);
    const now = (tick + 1) * dt;
    const message = guide.step(dt, { g, air, input, clock: now });
    if (message?.activity === 'thermalling') {
      qualifiedAt ??= now;
      const next = { left: message.hold.includes('left'), right: message.hold.includes('right'), brake: message.hold.includes('brake') };
      if (next.left && dir > 0 || next.right && dir < 0 || !next.brake || message.brakeDepth !== 'working')
        throw new Error('Thermal centering changed direction or released normal brake');
      const last = pending.at(-1)?.input ?? input;
      if (next.left !== last.left || next.right !== last.right || next.brake !== last.brake)
        pending.push({ at: tick + Math.round(delay / dt) + 1, input: next });
      const nextPhase = next.left || next.right ? 'circle' : 'ease';
      if (phase !== nextPhase) {
        const elapsed = now - phaseAt;
        if (phase === 'ease') { minimumEase = Math.min(minimumEase, elapsed); maximumEase = Math.max(maximumEase, elapsed); }
        if (phase === 'circle') minimumCircle = Math.min(minimumCircle, elapsed);
        if (now > warmup && phase) changes++;
        phase = nextPhase; phaseAt = now;
      }
      if (now > warmup) shown++;
    }
    const angle = Math.atan2(g.pos.x - source.x, -(g.pos.z - source.z));
    if (tick === warmup / dt - 1) { startHeight = g.pos.y; previousAngle = angle; }
    if (now > warmup) {
      arc += Math.atan2(Math.sin(angle - previousAngle!), Math.cos(angle - previousAngle!)) * dir;
      previousAngle = angle;
      maxDistance = Math.max(maxDistance, Math.hypot(g.pos.x - source.x, g.pos.z - source.z));
      stallFrames += g.stall > 0 ? 1 : 0;
    }
    if (g.acro || g.deepBrake || g.loops) throw new Error('Ordinary thermal flight became acro');
    height = g.pos.y;
  }
  return { dir, drifting, delay, seconds, gain: height - startHeight!, circles: arc / (2 * Math.PI),
    changes, qualifiedAt, shownSeconds: shown * dt, maxDistance, stallFrames,
    minimumEase: Number.isFinite(minimumEase) ? minimumEase : null, maximumEase,
    minimumCircle: Number.isFinite(minimumCircle) ? minimumCircle : null };
}
