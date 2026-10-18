// Observed flying activity, separate from where a navigation guide would like the pilot to go.
import { FLIGHT } from './flight.js';
import { ATMOSPHERE, thermalProfile } from './atmosphere.js';

export const LIFT_ACTIVITY = Object.freeze({
  useful: FLIGHT.sink.trim + 0.25, smooth: 0.75, dip: 0.5,
  ridgeEnter: 1.5, ridgeExit: 1.5, thermalEnter: 3, thermalExit: 2,
  ridgeWeak: 1.2, thermalWeak: 1, netWeak: 1, descending: -0.3,
  alongEnter: Math.PI / 6, alongExit: 5 * Math.PI / 18,
  orbit: Math.PI / 6, turnRate: 0.08, orbitRate: 0.04, orbitMaximum: 1.5, orbitRadius: 6,
  groundSpeed: 4, departure: 1.2, clearance: 15, boundary: 20,
  normalReach: 48, normalSpan: 24, normalLeast: 0.1,
});
const C = LIFT_ACTIVITY;
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const vertical = air => air.windY ?? ((air.lift || 0) - (air.sink || 0));
const sourceKey = (source, index) => `${typeof (source.id ?? index)}:${source.id ?? index}:${source.generation ?? 0}`;

/** Bearing along the actual broad terrain face. A flat height field has no ridge tangent. */
export function ridgeTangent(g, air, heightAt) {
  const wx = air.ambientX ?? air.windX ?? 0, wz = air.ambientZ ?? air.windZ ?? 0;
  const speed = Math.hypot(wx, wz), ux = speed > 0 ? wx / speed : 0, uz = speed > 0 ? wz / speed : 0;
  const mx = g.pos.x + ux * C.normalReach, mz = g.pos.z + uz * C.normalReach;
  const nx = heightAt(mx + C.normalSpan, mz) - heightAt(mx - C.normalSpan, mz);
  const nz = heightAt(mx, mz + C.normalSpan) - heightAt(mx, mz - C.normalSpan);
  if (Number.isFinite(nx) && Number.isFinite(nz) && Math.hypot(nx, nz) > C.normalLeast) return Math.atan2(nz, nx);
  if (speed < 0.15 || !(air.ridge >= 0.35)) return null;
  // A flat stencil can sit between the valley and a distant face. Wind-normal fallback needs
  // the same sustained downstream obstacle support as the air field, rather than wind alone.
  const here = heightAt(g.pos.x, g.pos.z);
  for (const reach of ATMOSPHERE.probes) {
    const ahead = heightAt(g.pos.x + ux * reach, g.pos.z + uz * reach);
    const beyond = heightAt(g.pos.x + ux * (reach + ATMOSPHERE.ridge.support), g.pos.z + uz * (reach + ATMOSPHERE.ridge.support));
    const behind = heightAt(g.pos.x - ux * reach, g.pos.z - uz * reach);
    if (Math.min(ahead, beyond) - here > ATMOSPHERE.ridge.relief && (ahead - behind) / (2 * reach) > ATMOSPHERE.ridge.grade)
      return Math.atan2(wz, wx);
  }
  return null;
}

/**
 * The presentation adapter supplies sources(), heightAt(x,z), and optional inside/cloudDepth/fog.
 * step(dt,{g,air,clock,eligible,unsafe}) observes fixed flight steps. State snapshots are immutable;
 * reading or pausing them advances nothing. No navigation target or player's input is consulted.
 */
export function createLiftActivity(adapter) {
  if (typeof adapter?.heightAt !== 'function') throw new TypeError('lift activity requires terrain height');
  let clock = -Infinity, climb = 0, smoothed = false, previousPosition = null;
  let history = new Map(), active = null, pending = null, exit = 0, state;
  function publish() {
    state = Object.freeze({
      activity: active?.type ?? 'navigating', sourceId: active?.id ?? null,
      sourceGeneration: active?.generation ?? null, sourceKey: active?.key ?? null,
      sourceDir: active?.dir ?? null, since: active?.since ?? null, climb,
      acquiring: pending?.type ?? null, acquireSeconds: pending?.seconds ?? 0,
      acquiringSourceId: pending?.id ?? null, exitSeconds: exit,
    });
    return state;
  }
  function reset() {
    clock = -Infinity; climb = 0; smoothed = false; previousPosition = null;
    history = new Map(); active = pending = null; exit = 0;
    return publish();
  }
  function clear() {
    active = pending = null; exit = 0; history.clear(); previousPosition = null; smoothed = false; climb = 0;
    return publish();
  }
  function groundVelocity(g, dt) {
    const velocity = g.pilot?.vel;
    if (Number.isFinite(velocity?.x) && Number.isFinite(velocity?.z)) return { x: velocity.x, z: velocity.z };
    return previousPosition ? { x: (g.pos.x - previousPosition.x) / dt, z: (g.pos.z - previousPosition.z) / dt } : { x: 0, z: 0 };
  }
  function observeSources(g, velocity, dt) {
    const nextHistory = new Map(), result = [];
    for (const [index, source] of (adapter.sources?.() ?? []).entries()) {
      const strength = source.strength ?? 1;
      if (source.live === false || source.move > 0 || !(strength > 0) || source.remaining <= 0) continue;
      const key = sourceKey(source, index), radius = source.r ?? 60;
      const dx = g.pos.x - source.x, dz = g.pos.z - source.z, near = Math.hypot(dx, dz);
      const angle = Math.atan2(dx, -dz);
      const vx = velocity.x - (source.vx ?? 0), vz = velocity.z - (source.vz ?? 0);
      const course = Math.atan2(vx, -vz), speed = Math.hypot(vx, vz), previous = history.get(key);
      let arc = previous ? wrap(angle - previous.angle) : 0;
      if (near < C.orbitRadius || (previous?.near ?? 0) < C.orbitRadius || Math.abs(arc) > C.orbitMaximum * dt) arc = 0;
      const rate = previous ? wrap(course - previous.course) / dt : 0;
      const coherent = speed >= C.groundSpeed && Math.abs(rate) >= C.turnRate &&
        Math.abs(arc) >= C.orbitRate * dt && Math.sign(rate) === Math.sign(arc);
      const agl = Math.max(0, g.pos.y - adapter.heightAt(g.pos.x, g.pos.z));
      const ground = clamp(agl / ATMOSPHERE.ground.thermal, 0, 1);
      const own = (source.s ?? 5.5) * strength * thermalProfile(near, radius, source.fade ?? 1) * ground * ground * (3 - 2 * ground);
      result.push({ key, id: source.id ?? index, generation: source.generation ?? 0,
        radius, near, own, arc, coherent, dir: coherent ? Math.sign(arc) : 0 });
      nextHistory.set(key, { angle, course, near });
    }
    history = nextHistory;
    return result;
  }
  function thermalQualifies(source, air) {
    return source.own >= C.useful && (air.thermal ?? source.own) >= C.useful &&
      vertical(air) >= C.useful && climb > 0 && source.coherent;
  }
  function ridgeQualifies(air, along, speed) {
    return speed >= C.groundSpeed && air.ridge >= C.useful && air.ridge > (air.thermal || 0) &&
      air.ridge > (air.lee || 0) && vertical(air) >= C.useful && climb >= 0 &&
      along !== null && along <= C.alongEnter;
  }
  function advanceAcquisition(candidate, qualifies, dt) {
    if (pending) {
      const same = candidate?.type === pending.type && candidate?.key === pending.key &&
        (pending.type !== 'thermal' || candidate.dir === pending.dir);
      if (!same || !qualifies) {
        pending.gap += dt;
        if (pending.gap <= C.dip + 1e-9) return;
        pending = null;
      }
    }
    if (!candidate || !qualifies) return;
    if (!pending) pending = { ...candidate, seconds: 0, arc: 0, gap: 0 };
    pending.seconds += dt; pending.gap = 0;
    if (pending.type === 'thermal') pending.arc += candidate.arc * pending.dir;
    const required = pending.type === 'thermal' ? C.thermalEnter : C.ridgeEnter;
    if (pending.seconds + 1e-9 >= required && (pending.type !== 'thermal' || pending.arc + 1e-9 >= C.orbit)) {
      active = { type: pending.type, id: pending.id ?? null, generation: pending.generation ?? null,
        key: pending.key ?? null, dir: pending.type === 'thermal' ? pending.dir : null, since: clock };
      pending = null; exit = 0;
    }
  }
  function step(dt, frame) {
    if (!(dt > 0) || !frame?.g?.pos) return state;
    const now = Number.isFinite(frame.clock) ? frame.clock : Number.isFinite(clock) ? clock + dt : 0;
    if (now < clock) reset();
    if (now === clock) return state;
    clock = now;
    const { g, air = {} } = frame;
    const fog = adapter.fog?.();
    const unsafe = frame.eligible === false || frame.unsafe || g.stall > 0 || g.tuck > 0 || g.ears > 0.1 ||
      Math.abs(g.bank || 0) > 0.9 || Math.abs(g.pitch || 0) > 0.7 ||
      g.pos.y <= adapter.heightAt(g.pos.x, g.pos.z) + C.clearance ||
      (adapter.inside && !adapter.inside(g.pos, C.boundary)) ||
      (adapter.cloudDepth && adapter.cloudDepth(g.pos) > 0.1) || (fog && g.pos.y <= fog.height + C.clearance);
    if (unsafe) return clear();
    const vy = Number.isFinite(g.vy) ? g.vy : g.pilot?.vel?.y ?? 0;
    climb = smoothed ? climb + (vy - climb) * (1 - Math.exp(-dt / C.smooth)) : vy;
    smoothed = true;
    const velocity = groundVelocity(g, dt), speed = Math.hypot(velocity.x, velocity.z);
    const course = Math.atan2(velocity.x, -velocity.z), tangent = ridgeTangent(g, air, adapter.heightAt);
    const along = tangent === null ? null : Math.acos(clamp(Math.abs(Math.cos(course - tangent)), 0, 1));
    const sources = observeSources(g, velocity, dt);
    previousPosition = { x: g.pos.x, y: g.pos.y, z: g.pos.z };
    if (pending?.type === 'thermal') {
      const source = sources.find(item => item.key === pending.key);
      if (!source || source.near > source.radius * C.departure) pending = null;
    }
    const current = active?.type === 'thermal' ? sources.find(source => source.key === active.key) : null;
    // Rebirth, death and clear departure invalidate an identity immediately, regardless of dwell.
    if (active?.type === 'thermal' && (!current || current.near > current.radius * C.departure)) {
      if (pending?.key === active.key) pending = null;
      active = null; exit = 0;
    }
    if (active) {
      const retaining = active.type === 'thermal' ? current.own >= C.thermalWeak &&
        (air.thermal ?? current.own) >= C.thermalWeak && vertical(air) >= C.netWeak && climb >= C.descending :
        speed >= C.groundSpeed && air.ridge >= C.ridgeWeak && vertical(air) >= C.ridgeWeak &&
        (frame.turnSupported || climb >= C.descending && along !== null && along <= C.alongExit);
      exit = retaining ? 0 : exit + dt;
      if (exit + 1e-9 >= (active.type === 'thermal' ? C.thermalExit : C.ridgeExit)) { active = null; exit = 0; }
    }
    let thermal = sources.find(source => source.key === pending?.key && thermalQualifies(source, air));
    if (!thermal) for (const source of sources) if (thermalQualifies(source, air) && (!thermal || source.own > thermal.own)) thermal = source;
    if (active) {
      // Mixed lift does not rename an established activity. Its own exit grace must finish
      // before another activity begins acquisition; easing a thermal turn is not an exit.
      pending = null;
    } else if (thermal) {
      advanceAcquisition({ type: 'thermal', ...thermal }, true, dt);
    } else if (active?.type !== 'ridge' && ridgeQualifies(air, along, speed)) {
      advanceAcquisition({ type: 'ridge', key: null, dir: null }, true, dt);
    } else {
      advanceAcquisition(null, false, dt);
    }
    return publish();
  }
  reset();
  return { reset, step, get state() { return state; } };
}
