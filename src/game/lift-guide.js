// Directional advice only. The guide owns its memory, never the wing, its controls or a sky.
import { FLIGHT } from './flight.js';
import { actionMessage } from './coach-actions.js';
import { glideDuration, glidePathClear, movingLiftIntercept } from './glide-math.js';
import { createLiftActivity, ridgeTangent } from './lift-activity.js';
import { createSoaringTurn } from './soaring-turn.js';
import { createRidgeTransfer } from './ridge-transfer.js';

export const LIFT_GUIDE = Object.freeze({
  searchEvery: 0.25, distances: Object.freeze([24, 48, 72, 96]),
  angles: Object.freeze([0, -Math.PI / 6, Math.PI / 6, -Math.PI / 3, Math.PI / 3, -Math.PI / 2, Math.PI / 2]),
  useful: FLIGHT.sink.trim + 0.25, clearance: 15, footprint: 6, boundary: 20,
  horizon: 6, pathStep: 0.25, lag: 0.8, turnRate: FLIGHT.turn.trim, turnAcceleration: 0.8,
  bankSink: 0.5, circle: 25, lock: 2, improvement: 0.4, improveFor: 1,
  enter: Math.PI / 12, exit: Math.PI / 30, cueHold: 0.75, anticipate: 0.8,
  sourceStrength: 0.35, sourceReserve: 12, sourceLife: 20,
});
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const bearing = (from, to) => Math.atan2(to.x - from.x, -(to.z - from.z));
const distance = (from, to) => Math.hypot(to.x - from.x, to.z - from.z);
const vertical = (air) => air.windY ?? ((air.lift || 0) - (air.sink || 0));
const flightSpeed = (g) => clamp(g.speed || FLIGHT.speed.trim, 6, FLIGHT.speed.bar + 3);
const windHeading = (angle, air, speed) => Math.atan2(Math.sin(angle) * speed - (air.windX || 0),
  Math.cos(angle) * speed + (air.windZ || 0));
const sourceKey = (source, index) => `${typeof (source.id ?? index)}:${source.id ?? index}:${source.generation ?? 0}`;

/**
 * adapter: sampleAir(pos,out), heightAt(x,z), sources(), inside(pos,margin), fog(), cloudDepth(pos).
 * Sources may be static {x,z,r,s}, or live {id,generation,strength,remaining,vx,vz,dir,...}.
 * fog may supply speedAt(height,elapsed), allowing its exact forecast without importing a game.
 * Call step once for each fixed flight step; drawing only reads message. A paused clock is inert.
 */
export function createLiftGuide(adapter) {
  if (typeof adapter?.sampleAir !== 'function' || typeof adapter?.heightAt !== 'function')
    throw new TypeError('lift guide requires an air sampler and terrain height');
  const C = LIFT_GUIDE;
  const activity = createLiftActivity(adapter);
  const soaringTurn = createSoaringTurn(adapter);
  const ridgeTransfer = createRidgeTransfer({ ...adapter, sources: () => adapter.sources?.() ?? [] });
  const point = { x: 0, y: 0, z: 0 }, sampled = {}, intercept = {};
  let clock = -Infinity, searchAt = -Infinity, lockedAt = -Infinity;
  let locked = null, challenger = '', challengeAt = -Infinity;
  let cue = null, cueAt = -Infinity, message = null, route = null, turnSide = 0;

  function reset() {
    clock = searchAt = lockedAt = challengeAt = cueAt = -Infinity;
    locked = cue = message = route = null; challenger = ''; turnSide = 0;
    activity.reset();
    soaringTurn.reset();
    ridgeTransfer.reset();
  }
  function sample(pos) {
    // Reset optional diagnostics so an adapter writing only the authoritative vector is safe.
    sampled.windX = sampled.windZ = sampled.ridge = sampled.thermal = sampled.lee = 0;
    sampled.windY = undefined;
    sampled.lift = sampled.sink = 0;
    return adapter.sampleAir(pos, sampled) ?? sampled;
  }
  function validPoint(pos, fog, clearance = C.clearance) {
    if (adapter.inside && !adapter.inside(pos, C.boundary)) return false;
    if (adapter.cloudDepth && adapter.cloudDepth(pos) > 0.1) return false;
    if (fog && pos.y <= fog.height + C.clearance) return false;
    return pos.y > adapter.heightAt(pos.x, pos.z) + clearance;
  }
  function fogLimit(g, fog, limit = C.horizon) {
    if (!fog) return limit;
    // A caller without a rising-fog forecast gets a short conservative route, never a long glide.
    return glideDuration(g.pos.y, fog.height, fog.elapsed ?? clock, limit, {
      fogSpeed: fog.speedAt ?? (() => 0), sink: Math.max(FLIGHT.sink.trim, -(g.vy || 0)) + C.bankSink,
      catchHeight: C.clearance,
    });
  }
  function pathSafe(g, air, target, fog, forcedSide = 0) {
    if (fogLimit(g, fog) < C.horizon) return false;
    const ground = g.pilot?.vel;
    const speed = flightSpeed(g);
    let heading = g.track ?? g.yaw ?? 0, rate = clamp(g.yawRate || 0, -0.8, 0.8);
    let x = g.pos.x, z = g.pos.z;
    const sink = Math.max(FLIGHT.sink.trim, -(g.vy || 0)) + C.bankSink;
    const vx = ground?.x ?? Math.sin(heading) * speed + (air.windX || 0);
    const vz = ground?.z ?? -Math.cos(heading) * speed + (air.windZ || 0);
    let want = typeof target === 'number' ? target : bearing(g.pos, target);
    for (let t = C.pathStep; t <= C.horizon + 1e-9; t += C.pathStep) {
      if (t <= C.lag) { x += vx * C.pathStep; z += vz * C.pathStep; heading += rate * C.pathStep; }
      else {
        point.x = x; point.y = g.pos.y - sink * t; point.z = z;
        const local = sample(point);
        if (target?.context === 'ridge') want = windHeading(target.angle ?? bearing(g.pos, target), local, speed);
        if (target?.circleSource) {
          const source = target.circleSource;
          const future = { ...source, x: source.x + source.vx * t, z: source.z + source.vz * t };
          const goal = circle(future, { pos: { x, z } }, target.dir, local);
          want = bearing({ x, z }, goal);
        }
        const error = wrap(want - heading - rate * C.anticipate);
        const circleRate = target?.circleSource ? error * target.dir > C.exit ? target.dir * C.turnRate : 0 : null;
        const desired = forcedSide && t <= C.lag + 1 ? forcedSide * C.turnRate :
          circleRate ?? (Math.abs(error) > C.exit ? Math.sign(error) * C.turnRate : 0);
        rate += clamp(desired - rate, -C.turnAcceleration * C.pathStep, C.turnAcceleration * C.pathStep);
        heading += rate * C.pathStep;
        x += (Math.sin(heading) * speed + (local.windX || 0)) * C.pathStep;
        z += (-Math.cos(heading) * speed + (local.windZ || 0)) * C.pathStep;
      }
      point.x = x; point.y = g.pos.y - sink * t; point.z = z;
      if (!validPoint(point, fog)) return false;
      const rightX = Math.cos(heading) * C.footprint, rightZ = Math.sin(heading) * C.footprint;
      point.x = x + rightX; point.z = z + rightZ;
      if (!validPoint(point, fog)) return false;
      point.x = x - rightX; point.z = z - rightZ;
      if (!validPoint(point, fog)) return false;
    }
    return true;
  }
  function sources() {
    return (adapter.sources?.() ?? []).map((source, index) => ({
      ...source, id: source.id ?? index, key: sourceKey(source, index), generation: source.generation ?? 0,
      r: source.r ?? 60, strength: source.strength ?? 1, live: source.live !== false,
      remaining: source.remaining ?? Infinity, vx: source.vx ?? 0, vz: source.vz ?? 0,
    }));
  }
  function alive(source, seconds = 0) {
    if (activity.state.activity === 'thermal' && source.id === activity.state.sourceId &&
        source.generation === activity.state.sourceGeneration)
      return source.live && !(source.move > 0) && source.strength > 0 && source.remaining > 0;
    return source.live && !(source.move > 0) && source.strength >= C.sourceStrength &&
      source.remaining >= Math.max(C.sourceLife, seconds + C.sourceReserve);
  }
  function approachSafe(g, target, seconds, fog) {
    if (fogLimit(g, fog, seconds + 4) < seconds + 4) return false;
    if (!glidePathClear(g.pos, target, seconds, adapter.heightAt, C.clearance, FLIGHT.sink.trim + C.bankSink)) return false;
    for (let k = 1; k <= 12; k++) {
      const share = k / 12;
      point.x = g.pos.x + (target.x - g.pos.x) * share;
      point.z = g.pos.z + (target.z - g.pos.z) * share;
      point.y = g.pos.y - (FLIGHT.sink.trim + C.bankSink) * seconds * share;
      if (!validPoint(point, fog)) return false;
    }
    return true;
  }
  function scorePoint(g, air, target, context, fog) {
    const seconds = distance(g.pos, target) / flightSpeed(g);
    if (!approachSafe(g, target, seconds, fog) || !pathSafe(g, air, target, fog)) return null;
    let total = 0, end = 0, ridge = 0;
    for (const share of [0.5, 0.75, 1]) {
      point.x = g.pos.x + (target.x - g.pos.x) * share;
      point.z = g.pos.z + (target.z - g.pos.z) * share;
      point.y = g.pos.y - FLIGHT.sink.trim * seconds * share;
      const local = sample(point);
      total += vertical(local); end = vertical(local); ridge = local.ridge || 0;
    }
    if (end < C.useful || (context === 'ridge' && ridge < 0.35)) return null;
    return { ...target, context, score: 0.5 * end + total / 6 - seconds * 0.025 };
  }
  function circle(source, g, dir, air) {
    const angle = bearing(source, g.pos) + dir * 0.8;
    return { x: source.x + source.vx * 2 + Math.sin(angle) * C.circle - (air.windX || 0) * 1.5,
      z: source.z + source.vz * 2 - Math.cos(angle) * C.circle - (air.windZ || 0) * 1.5 };
  }
  function refresh(target, live, g, air, fog) {
    if (!target) return null;
    if (target.context === 'thermal') {
      const source = live.find((item) => item.key === target.key);
      if (!source) return null;
      const reach = movingLiftIntercept(g.pos, source, { x: air.windX || 0, z: air.windZ || 0 }, intercept, flightSpeed(g));
      if (!alive(source, reach.seconds)) return null;
      const near = distance(g.pos, source);
      const occupied = near < source.r * 0.9 && vertical(air) >= C.useful;
      const circling = occupied || (target.circling && near < source.r * 1.5);
      const waypoint = circling ? circle(source, g, target.dir, air) : { x: reach.x, z: reach.z };
      const result = scorePoint(g, air, { ...waypoint, key: source.key, id: source.id,
        generation: source.generation, dir: target.dir, occupied, circling, circleSource: circling ? source : null, seconds: reach.seconds }, 'thermal', fog);
      // A circle's waypoint can lie beyond the core, but current good lift remains worth keeping.
      if (!result && (occupied || activity.state.activity === 'thermal' && circling) && pathSafe(g, air, { ...waypoint, dir: target.dir, circleSource: source }, fog))
        return { ...target, ...waypoint, occupied, circling, circleSource: source, seconds: reach.seconds, score: vertical(air) };
      return result;
    }
    const occupied = (air.ridge || 0) >= 0.35 && vertical(air) >= C.useful;
    const waypoint = occupied ? { ...target, x: g.pos.x + Math.sin(target.angle) * target.length,
      z: g.pos.z - Math.cos(target.angle) * target.length, occupied } : { ...target, occupied };
    const result = scorePoint(g, air, waypoint, 'ridge', fog);
    return result ?? (activity.state.activity === 'ridge' && pathSafe(g, air, waypoint, fog)
      ? { ...waypoint, score: vertical(air) } : null);
  }
  function search(g, air, live, fog, current) {
    // Stay with safe, useful lift. A distant stronger patch is not a reason to leave a good circle.
    if (current?.occupied || current?.circling) return current;
    const staying = activity.state.activity === 'ridge' ||
      (air.ridge || 0) >= 0.35 && vertical(air) >= C.useful && (air.thermal || 0) < C.useful;
    let best = staying && current?.context !== 'ridge' ? null : current;
    if (!staying) for (const source of live) {
      const reach = movingLiftIntercept(g.pos, source, { x: air.windX || 0, z: air.windZ || 0 }, intercept, flightSpeed(g));
      if (!alive(source, reach.seconds)) continue;
      const occupied = distance(g.pos, source) < source.r * 0.9 && vertical(air) >= C.useful;
      const dir = locked?.key === source.key ? locked.dir : Math.abs(g.bank || 0) > 0.2 && Math.abs(g.yawRate || 0) > 0.12 ? Math.sign(g.yawRate) : Math.sign(source.dir || 1);
      const candidate = refresh({ context: 'thermal', key: source.key, dir }, live, g, air, fog);
      if (!candidate) continue;
      if (occupied) return candidate;
      if (!best || candidate.score > best.score) best = candidate;
    }
    const tangent = staying ? ridgeTangent(g, air, adapter.heightAt) : null;
    const heading = g.track ?? g.yaw ?? 0;
    for (const length of C.distances) for (const offset of C.angles) {
      const angle = heading + offset;
      if (tangent !== null && Math.abs(Math.cos(angle - tangent)) < 0.94) continue;
      const target = { context: 'ridge', x: g.pos.x + Math.sin(angle) * length, z: g.pos.z - Math.cos(angle) * length,
        key: `ridge:${Math.round(angle / (Math.PI / 12))}`, id: 'ridge', generation: 0, occupied: staying, angle, length };
      const candidate = scorePoint(g, air, target, 'ridge', fog);
      if (candidate && (!best || candidate.score > best.score)) best = candidate;
    }
    if (current?.context === 'ridge' && staying) return current;
    return best;
  }
  function select(g, air, live, fog) {
    const confirmed = activity.state;
    if (confirmed.activity === 'thermal') {
      const source = live.find(item => item.id === confirmed.sourceId && item.generation === confirmed.sourceGeneration);
      return source ? refresh({ context: 'thermal', key: source.key, circling: true,
        dir: confirmed.sourceDir || locked?.dir || 1 }, live, g, air, fog) : null;
    }
    if (confirmed.activity === 'ridge') {
      const current = locked?.context === 'ridge' ? refresh(locked, live, g, air, fog) : null;
      return search(g, air, [], fog, current);
    }
    const current = refresh(locked, live, g, air, fog);
    const best = search(g, air, live, fog, current);
    if (best?.context === 'ridge' && best.occupied && current?.context !== 'ridge') {
      challenger = ''; lockedAt = clock; return best;
    }
    if (!current || best?.key === current.key || current.occupied) {
      if (!current || best?.key !== locked?.key) lockedAt = clock;
      challenger = ''; return best;
    }
    if (!best || clock - lockedAt < C.lock || best.score < current.score + C.improvement) {
      challenger = ''; return current;
    }
    if (challenger !== best.key) { challenger = best.key; challengeAt = clock; }
    if (clock - challengeAt < C.improveFor) return current;
    challenger = ''; lockedAt = clock; return best;
  }
  function follow(target, live, g, air) {
    // Per-tick work only follows a moving centre and invalidates its identity/lifetime. Full
    // terrain, cloud and turn-path forecasts are cached until the next quarter-second search.
    if (!target) return null;
    if (target.context === 'thermal') {
      const source = live.find(item => item.key === target.key);
      if (!source || !alive(source, target.seconds || 0)) return null;
      const near = distance(g.pos, source);
      const occupied = near < source.r * 0.9 && vertical(air) >= C.useful;
      const circling = occupied || (target.circling && near < source.r * 1.5);
      const waypoint = circling ? circle(source, g, target.dir, air) :
        { x: source.x + source.vx * (target.seconds || 0), z: source.z + source.vz * (target.seconds || 0) };
      return { ...target, ...waypoint, occupied, circling, circleSource: circling ? source : null };
    }
    const occupied = (air.ridge || 0) >= 0.35 && vertical(air) >= C.useful;
    return occupied ? { ...target, x: g.pos.x + Math.sin(target.angle) * target.length,
      z: g.pos.z - Math.cos(target.angle) * target.length, occupied } : { ...target, occupied };
  }
  function instruction(g, air, fog) {
    if (!locked) return { state: 'lift', context: 'search', phase: 'blocked', action: 'none',
      title: 'NO CLEAR LIFT ROUTE', detail: 'Keep the wing steady and look for rising streaks.' };
    const worldBearing = bearing(g.pos, locked);
    const want = locked.context === 'ridge' ? windHeading(worldBearing, air, flightSpeed(g)) : worldBearing;
    const raw = wrap(want - (g.track ?? g.yaw ?? 0));
    const anticipated = wrap(raw - (g.yawRate || 0) * C.anticipate);
    let side = Math.abs(anticipated) > (turnSide ? C.exit : C.enter) ? Math.sign(anticipated) : 0;
    let counter = false;
    if (locked.circling && locked.context === 'thermal') {
      // Centre by easing or tightening the established circle, never by swapping its direction.
      side = anticipated * locked.dir > C.exit ? locked.dir : 0;
    } else if (Math.abs(raw) < C.enter && Math.abs(g.yawRate || 0) > 0.18 &&
        Math.abs(anticipated) > C.exit && Math.sign(anticipated) !== Math.sign(g.yawRate)) {
      const opposite = -Math.sign(g.yawRate);
      if (opposite < 0 ? locked.leftSafe : locked.rightSafe) { side = opposite; counter = true; }
      else side = 0;
    }
    turnSide = side;
    const action = side < 0 ? 'left' : side > 0 ? 'right' : 'straight';
    const along = locked.context === 'ridge' && locked.occupied;
    const phase = counter ? 'align' : locked.circling ? 'centre' : locked.occupied ? 'hold' : side ? 'approach' : 'align';
    return { state: 'lift', context: locked.context, phase, action,
      ...(locked.circling ? { brakeDepth: 'working', hold: side ? [side < 0 ? 'left' : 'right', 'brake'] : ['brake'],
        release: side ? [side < 0 ? 'right' : 'left', 'bar'] : ['left', 'right', 'bar'] } : {
        release: side ? [side < 0 ? 'right' : 'left', 'brake', 'bar'] : ['left', 'right', 'brake', 'bar'],
      }),
      ...(counter ? { title: `CHECK ${side < 0 ? 'LEFT' : 'RIGHT'} — LEVEL THE TURN` } : {}),
      detail: counter ? 'A brief opposite input checks the turn; then release.' :
        locked.circling && locked.context === 'thermal' ? side ? 'Hold brake with the turn to stay around the rising core.' : 'Keep the brake; ease the turn for a beat to centre the circle.' :
          along ? side ? 'Follow the rising air along the cliff.' : 'Fly along the cliff; keep room between the wing and the face.' :
            locked.context === 'thermal' ? 'Aim beside the circling ravens, then settle into a gentle circle.' : 'Rising air is ahead along this cliff; turn toward the clear approach.',
      targetId: locked.id, targetGeneration: locked.generation,
    };
  }
  function step(dt, facts) {
    if (!(dt > 0) || !facts?.g?.pos) return message;
    const now = Number.isFinite(facts.clock) ? facts.clock : Number.isFinite(clock) ? clock + dt : 0;
    if (now < clock) reset();
    if (now === clock) return message;
    clock = now;
    const { g, input = {} } = facts;
    const air = facts.air ?? { ...sample(g.pos) };
    // Active flight/recovery coaching has precedence. Do not advertise a route through a swing.
    if (facts.suspended || facts.eligible === false || input.deepBrake || g.deepBrake || g.acro ||
        g.stall > 0 || g.tuck > 0 || g.ears > 0.1 || Math.abs(g.bank || 0) > 0.9 || Math.abs(g.pitch || 0) > 0.7) {
      reset(); return null;
    }
    const fog = adapter.fog?.() ?? null, live = sources();
    const before = activity.state;
    const turn = soaringTurn.step(dt, { g, air, input, clock, activity: before.activity });
    const confirmed = activity.step(dt, { g, air, clock, unsafe: !validPoint(g.pos, fog), turnSupported: turn.supported });
    const activityChanged = before.activity !== confirmed.activity || before.sourceId !== confirmed.sourceId ||
      before.sourceGeneration !== confirmed.sourceGeneration;
    if (activityChanged) { locked = cue = null; searchAt = -Infinity; turnSide = 0; }
    if (turn.message && confirmed.activity !== 'thermal') {
      message = confirmed.activity === 'ridge' ? { ...turn.message, activity: 'ridge-soaring' } : turn.message;
      route = message;
      return message;
    }
    const current = follow(locked, live, g, air);
    const unsafe = !!locked && (!current || !validPoint(g.pos, fog));
    if (unsafe || clock >= searchAt) {
      locked = select(g, air, live, fog);
      if (locked) {
        locked.leftSafe = pathSafe(g, air, locked, fog, -1);
        locked.rightSafe = pathSafe(g, air, locked, fog, 1);
      }
      if (!locked && confirmed.activity !== 'navigating') activity.reset();
      searchAt = clock + C.searchEvery;
    } else if (current) locked = current;
    const next = instruction(g, air, fog);
    if (confirmed.activity === 'ridge' && next.context === 'ridge' && locked?.occupied) {
      const transfer = ridgeTransfer.step(dt, { g, air, clock });
      next.transfer = transfer;
      if (vertical(air) >= C.useful && (air.ridge || 0) >= C.useful) {
        if (transfer.ready) {
          const source = live.find(item => item.id === transfer.targetId && item.generation === transfer.generation);
          const angle = source ? wrap(bearing(g.pos, source) - (g.track ?? g.yaw ?? 0)) : 0;
          const direction = Math.abs(angle) < Math.PI / 8 ? 'ahead' : angle < 0 ? 'to your left' : 'to your right';
          next.detail = `A thermal is within reach ${direction}. Keep this ridge line until you choose to cross.`;
        } else if (transfer.missingHeight > 0) {
          const height = Math.ceil(transfer.missingHeight / 5) * 5;
          next.detail = `Build about ${height} m more height along this ridge before crossing to a thermal.`;
        } else next.detail = 'Build height in the rising air along this ridge. Wait for a clear thermal within reach.';
      } else next.detail = 'Lift is weakening here. Follow the rising air along the cliff before crossing.';
    } else ridgeTransfer.reset();
    const changed = !cue || cue.action !== next.action || cue.phase !== next.phase || cue.context !== next.context ||
      cue.targetId !== next.targetId || cue.targetGeneration !== next.targetGeneration;
    const heldSide = cue?.action === 'left' ? -1 : cue?.action === 'right' ? 1 : 0;
    const heldUnsafe = changed && heldSide && locked && !(heldSide < 0 ? locked.leftSafe : locked.rightSafe);
    if (!cue || cue.action === 'none' || unsafe || heldUnsafe || !locked || !changed || clock - cueAt >= C.cueHold) {
      if (changed) cueAt = clock;
      cue = next;
    }
    route = actionMessage(cue, input);
    message = confirmed.activity === 'navigating' || !locked ? null : { ...route,
      activity: confirmed.activity === 'ridge' ? 'ridge-soaring' : 'thermalling' };
    return message;
  }
  return { reset, step, get message() { return message; }, get route() { return route; },
    get activity() { return activity.state; }, get turn() { return soaringTurn.state; },
    get transfer() { return ridgeTransfer.state; } };
}
