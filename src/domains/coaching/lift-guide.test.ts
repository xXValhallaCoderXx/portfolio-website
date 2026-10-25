import type { CloudbaseRun } from '../good-lift/models.ts';
import type { AirSample, FlightInput, ThermalSource, Vector3 } from '../flight/models.ts';
import type { CoachingAdapter, FlightObservation, LiftFrame } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiftGuide as createQualifiedLiftGuide, LIFT_GUIDE } from './lift-guide.ts';
import { glideDuration, movingLiftIntercept } from '../flight/glide-math.ts';
import { createFlight, stepFlight, FLIGHT } from '../flight/flight.ts';
import { createTerrainAir, thermalProfile } from '../flight/atmosphere.ts';
import { CLOUD_ZONE, cloudFogSpeed, cloudThermalRemaining, createCloudbaseRun } from '../good-lift/cloudbase-state.ts';
import { createRunWorld, startRun, stepRun } from '../good-lift/run-step.ts';
import { surfaceAt } from '../flight/ground.ts';
type TestAdapter = Omit<CoachingAdapter, 'sampleAir'> & {sampleAir: (position: Vector3, output: AirSample) => AirSample};

const STEP = 1 / 60;
// Route regression checks deliberately inspect private navigation, including hidden approaches.
// Visible coach behavior and manual handoffs are tested separately below and in coach-replay.
function navigationGuide(adapter: CoachingAdapter) {
  const guide = createQualifiedLiftGuide(adapter);
  return { reset: () => guide.reset(), step(dt: number, facts: LiftFrame) { guide.step(dt, facts); return guide.route; },
    get message() { return guide.route; } };
}
function wing({ x = 0, y = 150, z = 0, yaw = 0, rate = 0 } = {}): FlightObservation & {yawRate: number; pilot: {vel: Vector3}} {
  return { pos: { x, y, z }, yaw, track: yaw, yawRate: rate, trackRate: rate, speed: FLIGHT.speed.trim,
    vy: -FLIGHT.sink.trim, bank: 0, pitch: 0, stall: 0, tuck: 0, ears: 0,
    pilot: { vel: { x: Math.sin(yaw) * FLIGHT.speed.trim, y: -FLIGHT.sink.trim, z: -Math.cos(yaw) * FLIGHT.speed.trim } } };
}
function field(sources: readonly ThermalSource[] = [], options: Partial<TestAdapter> = {}): TestAdapter {
  return {
    sampleAir(pos: Vector3, out: AirSample) {
      const rising = sources.reduce((sum, source) => sum + (source.live === false ? 0 :
        (source.s ?? 5.5) * (source.strength ?? 1) * thermalProfile(Math.hypot(pos.x - source.x, pos.z - source.z), source.r ?? 60, 0.7)), 0);
      return Object.assign(out, { windX: 0, windZ: 0, windY: rising, thermal: rising, ridge: 0, lee: 0 });
    },
    heightAt: () => 0, sources: () => sources, inside: () => true, fog: () => null,
    ...options,
  };
}
function facts(g: FlightObservation, adapter: CoachingAdapter, clock: number, input: FlightInput = {}): LiftFrame { return { g, air: adapter.sampleAir(g.pos, {}) as AirSample, clock, input }; }
function ticks(guide: ReturnType<typeof navigationGuide>, g: FlightObservation, adapter: CoachingAdapter, seconds: number, from = 0, input: FlightInput = {}) {
  let message;
  for (let n = 1; n <= Math.round(seconds / STEP); n++) message = guide.step(STEP, facts(g, adapter, from + n * STEP, input));
  return message;
}
const freeze = <T extends object>(object: T): Readonly<T> => {
  Object.values(object).forEach(value => { if (value && typeof value === 'object') freeze(value); });
  return Object.freeze(object);
};

test('moving lift and fog forecasts are pure and retain the glide rules', () => {
  const pos = freeze({ x: 0, y: 100, z: 0 }), source = freeze({ x: 50, z: -40, vx: 2, vz: 1 });
  const reach = movingLiftIntercept(pos, source, { x: 2, z: 1 });
  assert.equal(reach.seconds, Math.hypot(50, 40) / FLIGHT.speed.trim);
  assert.equal(reach.x, 50 + 2 * reach.seconds);
  assert.equal(reach.z, -40 + reach.seconds);
  assert.equal(glideDuration(103, 100, 0), 0);
  assert.ok(glideDuration(200, 100, 360, 60, { fogSpeed: cloudFogSpeed }) < glideDuration(200, 100, 0, 60));
  assert.equal(glideDuration(20000, 0, 598, 60), 2);
});

test('a mirrored reachable thermal produces matching left/right actions and releases the opposite key', () => {
  for (const side of [-1, 1]) {
    const adapter = field([{ id: 'next', generation: 4, x: side * 48, z: -48, r: 40, remaining: 60 }]);
    const g = wing(), guide = navigationGuide(adapter), action = side < 0 ? 'left' : 'right', opposite = side < 0 ? 'right' : 'left';
    const message = guide.step(STEP, facts(g, adapter, 0, { [opposite]: true }));
    assert.equal(message!.action, action); assert.equal(message!.context, 'thermal');
    assert.equal(message!.targetId, 'next'); assert.equal(message!.targetGeneration, 4);
    assert.deepEqual(message!.hold, [action]); assert.ok(message!.release.includes(opposite));
    assert.match(message!.title, /^RELEASE .* THEN /);
    assert.equal(message!.accepted, false);
    assert.equal(guide.step(STEP, facts(g, adapter, STEP, { [action]: true }))!.title, `HOLD ${action.toUpperCase()}`);
  }
});

test('a mirrored broad ridge is approached from its clear side without a source list', () => {
  for (const side of [-1, 1]) {
    const terrain = createTerrainAir((x) => 80 * Math.max(0, Math.min(1, (side * x - 120) / 16)));
    const adapter = field([], { sampleAir: (pos: { x: number; z: number; y: number; }, out: AirSample) => terrain.sample(pos, side * 3.5, 0, out), heightAt: terrain.heightAt });
    const g = wing({ y: 100 }), guide = navigationGuide(adapter), message = guide.step(STEP, facts(g, adapter, 0));
    assert.equal(message!.context, 'ridge'); assert.equal(message!.action, side < 0 ? 'left' : 'right');
  }
});

test('alignment releases a held turn and anticipates a safe opposite check before overshoot', () => {
  const adapter = field([{ id: 'next', x: 48, z: -48, r: 40, remaining: 60 }]), g = wing(), guide = navigationGuide(adapter);
  assert.equal(guide.step(STEP, facts(g, adapter, 0))!.action, 'right');
  g.yaw = g.track = Math.PI / 4;
  let message = ticks(guide, g, adapter, 1, 0, { right: true });
  assert.equal(message!.action, 'straight'); assert.equal(message!.title, 'RELEASE THE TURN');
  assert.deepEqual(message!.release, ['left', 'right', 'brake', 'bar']);
  g.trackRate = 0.3;
  message = ticks(guide, g, adapter, 1, 1, { right: true });
  assert.equal(message!.action, 'left'); assert.equal(message!.phase, 'align');
  assert.deepEqual(message!.hold, ['left']); assert.ok(message!.release.includes('right'));
});

test('useful ridge air keeps an along-cliff line instead of chasing stronger air into the face', () => {
  const terrain = createTerrainAir((x) => 80 * Math.max(0, Math.min(1, (x + 8) / 16)));
  const adapter = field([], { sampleAir: (pos: { x: number; z: number; y: number; }, out: AirSample) => terrain.sample(pos, 3.5, 0, out), heightAt: terrain.heightAt });
  const g = wing({ x: -45, y: 100 }), guide = navigationGuide(adapter);
  for (let n = 0; n < 180; n++) {
    g.pos.z -= FLIGHT.speed.trim * STEP;
    const message = guide.step(STEP, facts(g, adapter, n * STEP));
    assert.equal(message!.context, 'ridge'); assert.equal(message!.action, 'straight'); assert.equal(message!.phase, 'hold');
  }
});

test('ridge line cues compensate crosswind and release once the air heading holds the ground line', () => {
  for (const side of [-1, 1]) {
    const adapter = field([], { heightAt: (x: number): number => Math.max(0, side * x * 0.3),
      sampleAir: (_pos, out) => Object.assign(out, { windX: side * 4, windZ: 0, windY: 3,
        ridge: 3, thermal: 0, lee: 0, ambientX: side * 4, ambientZ: 0 }) });
    const g = wing(), guide = navigationGuide(adapter);
    g.pilot!.vel.x = side * 4;
    const direction = side > 0 ? 'left' : 'right';
    const message = guide.step(STEP, facts(g, adapter, 0));
    assert.equal(message!.context, 'ridge'); assert.equal(message!.action, direction,
      'holding a world-space cliff line needs an into-wind air heading');
    g.track = g.yaw = Math.atan2(-side * 4, FLIGHT.speed.trim);
    g.pilot!.vel.x = Math.sin(g.track) * g.speed! + side * 4;
    g.pilot!.vel.z = -Math.cos(g.track) * g.speed!;
    const aligned = guide.step(STEP, facts(g, adapter, 1, { [direction]: true }));
    assert.equal(aligned!.action, 'straight'); assert.ok(aligned!.release.includes(direction));
  }
});

test('already useful ridge air takes priority over an attractive nearby thermal', () => {
  const source: ThermalSource = { id: 'inland', x: -20, z: -60, r: 24, remaining: 90 };
  const terrain = createTerrainAir((x) => 80 * Math.max(0, Math.min(1, (x + 8) / 16)));
  const thermal = field([source]);
  const adapter = field([source], { heightAt: terrain.heightAt, sampleAir(pos: { x: number; z: number; y: number; }, out: AirSample) {
    terrain.sample(pos, 3.5, 0, out);
    const rising = thermal.sampleAir(pos, {}).thermal!;
    out!.thermal = rising; out!.windY! += rising; return out;
  } });
  const g = wing({ x: -45, y: 150 }), guide = navigationGuide(adapter);
  const message = guide.step(STEP, facts(g, adapter, 0));
  assert.equal(message!.context, 'ridge'); assert.equal(message!.action, 'straight');
  assert.ok(message!.release.includes('brake'), 'ordinary ridge travel releases the thermal brake');
});

test('a moving occupied core keeps its identity and circle direction, then drops an expiring source immediately', () => {
  for (const dir of [-1, 1]) {
    const source: ThermalSource = { id: 'core', generation: 7, x: 0, z: 0, vx: 2, vz: 0.5, r: 60, dir, remaining: 90 };
    const adapter = field([source]), g = wing({ z: -25, yaw: dir * Math.PI / 2, rate: dir * 0.2 }), guide = navigationGuide(adapter);
    for (let n = 0; n < 180; n++) {
      source.x += source.vx! * STEP; source.z += source.vz! * STEP;
      const angle = n * STEP * dir * 0.2;
      g.pos.x = source.x + Math.sin(angle) * 25; g.pos.z = source.z - Math.cos(angle) * 25;
      g.yaw = g.track = angle + dir * Math.PI / 2;
      g.pilot!.vel.x = Math.sin(g.track) * g.speed!; g.pilot!.vel.z = -Math.cos(g.track) * g.speed!;
      const message = guide.step(STEP, facts(g, adapter, n * STEP));
      assert.equal(message!.context, 'thermal'); assert.equal(message!.targetId, 'core'); assert.equal(message!.targetGeneration, 7);
      assert.ok(message!.action === 'straight' || message!.action === (dir < 0 ? 'left' : 'right'));
      assert.ok(message!.hold.includes('brake'), 'ordinary brake remains held while the turn eases');
    }
    source.remaining = 0;
    const message = guide.step(STEP, facts(g, adapter, 3));
    assert.equal(message!.action, 'none'); assert.equal(message!.title, 'NO CLEAR LIFT ROUTE');
    source.remaining = 90; source.generation! += 1;
    assert.equal(ticks(guide, g, adapter, 0.3, 3)!.targetGeneration, 8);
  }
});

test('small improvements do not pull the pilot between sources, while sustained useful gains can replace a target', () => {
  const left = { id: 'left', x: -48, z: -80, r: 24, s: 3, remaining: 90 };
  const right = { id: 'right', x: 48, z: -80, r: 24, s: 2.9, remaining: 90 };
  const adapter = field([left, right]), g = wing(), guide = navigationGuide(adapter);
  assert.equal(guide.step(STEP, facts(g, adapter, 0))!.targetId, 'left');
  right.s = 3.2;
  assert.equal(ticks(guide, g, adapter, 3)!.targetId, 'left');
  right.s = 5;
  assert.equal(ticks(guide, g, adapter, 0.7, 3)!.targetId, 'left');
  assert.equal(ticks(guide, g, adapter, 1.5, 3.7)!.targetId, 'right');
});

test('terrain and wing-width obstructions, arena margins, fog and clouds veto attractive lift', () => {
  const source: ThermalSource = { x: 0, z: -80, r: 24, remaining: 90 };
  const g = wing({ y: 100 });
  const vetoes = [
    { heightAt: (_x: number, z: number) => z < -30 && z > -50 ? 200 : 0 },
    { heightAt: (x: number, z: number) => x > 5 && x < 8 && z < -15 ? 200 : 0 },
    { inside: (pos: { z: number; }, margin: unknown) => { assert.equal(margin, 20); return pos.z > -40; } },
    { cloudDepth: (pos: { z: number; }) => pos.z < -30 ? 0.5 : 0 },
    { fog: () => ({ height: 90, elapsed: 0, speedAt: cloudFogSpeed }) },
    { fog: () => ({ height: 50, elapsed: 590, speedAt: cloudFogSpeed }) },
  ];
  for (const veto of vetoes) {
    const adapter = field([source], veto), guide = navigationGuide(adapter);
    const message = guide.step(STEP, facts(g, adapter, 0));
    assert.equal(message!.action, 'none'); assert.equal(message!.phase, 'blocked');
    assert.deepEqual(message!.hold, []); assert.deepEqual(message!.release, []);
  }
});

test('dead, travelling, faint and short-lived sources are excluded before a direction is advertised', () => {
  for (const condition of [{ live: false }, { move: 2 }, { strength: 0.2 }, { remaining: 8 }]) {
    const adapter = field([{ x: 48, z: -48, r: 35, ...condition }]), guide = navigationGuide(adapter), g = wing();
    assert.equal(guide.step(STEP, facts(g, adapter, 0))!.action, 'none');
  }
});

test('source lifetime and fog reach use the actual slower airspeed under brake', () => {
  for (const speed of [FLIGHT.speed.trim, 7]) {
    const g = wing(); g.speed = speed; g.pilot!.vel.z = -speed;
    const source: ThermalSource = { x: 0, z: -120, r: 24, remaining: 24 }, adapter = field([source]);
    const guide = navigationGuide(adapter), message = guide.step(STEP, facts(g, adapter, 0));
    assert.equal(message!.context, speed === 7 ? 'search' : 'thermal');
    source.remaining = Infinity;
    const fogAdapter = { ...adapter, fog: () => ({ height: 105, elapsed: 0, speedAt: cloudFogSpeed }) };
    const fogGuide = navigationGuide(fogAdapter), fogMessage = fogGuide.step(STEP, facts(g, fogAdapter, 0));
    assert.equal(fogMessage!.context, speed === 7 ? 'search' : 'thermal');
  }
});

test('ordinary direction cues hold through small heading noise, while target loss and recovery interrupt immediately', () => {
  const source: ThermalSource = { id: 'core', x: 48, z: -48, r: 35, remaining: 90 }, adapter = field([source]), g = wing();
  const guide = navigationGuide(adapter);
  assert.equal(guide.step(STEP, facts(g, adapter, 0))!.action, 'right');
  g.track = Math.PI / 4 + 0.02;
  assert.equal(guide.step(STEP, facts(g, adapter, 0.2))!.action, 'right');
  assert.equal(guide.step(STEP, facts(g, adapter, 0.8))!.action, 'straight');
  source.live = false;
  assert.equal(guide.step(STEP, facts(g, adapter, 0.81))!.action, 'none');
  source.live = true; g.stall = 0.5;
  assert.equal(guide.step(STEP, facts(g, adapter, 0.82)), null);
  guide.reset(); assert.equal(guide.message, null);
});

for (const dir of [-1, 1]) test(`thermal correction hysteresis, bounded ease and minimum circle hold, side ${dir}`, () => {
  const source: ThermalSource = { id: 'core', generation: 2, x: 0, z: 0, r: 60, dir, remaining: 90 };
  const adapter = field([source]), guide = navigationGuide(adapter), g = wing({ z: -21 });
  const direction = dir < 0 ? 'left' : 'right';
  let clock = 0;
  function advance(seconds: number, ahead: number, input = {}) {
    // On a 21m circle the chord to the point 0.8rad ahead leads the tangent by 0.4rad.
    // Set air-course telemetry independently of an arbitrarily rotating canopy nose.
    g.trackRate = dir * 0.45; g.yawRate = -dir * 2;
    g.track = dir * (Math.PI / 2 + 0.4 + ahead * Math.PI / 180) - g.trackRate * 0.8;
    let message;
    for (let tick = 0; tick < Math.round(seconds / STEP); tick++) {
      message = guide.step(STEP, facts(g, adapter, clock, input)); clock += STEP;
    }
    return message;
  }
  let message = advance(2, 11.9);
  assert.equal(message!.action, direction, 'less than 12 degrees ahead never requests easing');
  assert.equal(message!.title, `CIRCLE ${direction.toUpperCase()} + NORMAL BRAKE`);
  assert.equal(advance(0.4, 13)!.action, direction, 'a short excursion is insufficient');
  assert.equal(advance(0.1, 11.9)!.action, direction, 'returning inside the threshold clears the dwell');
  assert.equal(advance(0.5, 13)!.action, direction);
  message = advance(STEP, 13, { [direction]: true, brake: true, bar: true });
  assert.equal(message!.action, 'straight'); assert.equal(message!.phase, 'ease');
  assert.equal(message!.title, `EASE ${direction.toUpperCase()} · KEEP BRAKE`);
  assert.equal(message!.accepted, false); assert.deepEqual(message!.hold, ['brake']);
  message = advance(0.7, 2, { brake: true });
  assert.equal(message!.action, 'straight', 'an accepted ease remains visible for at least 0.75s');
  assert.equal(message!.accepted, true); assert.equal(message!.title, `EASE ${direction.toUpperCase()} · KEEP BRAKE`);
  message = advance(0.1, 2, { brake: true });
  assert.equal(message!.action, direction, 'back within 3 degrees resumes the established direction');
  assert.equal(advance(1, 30)!.action, direction, 'the turn is maintained for at least 1.25s');
  message = advance(0.4, 30);
  assert.equal(message!.action, 'straight');
  assert.equal(advance(0.5, 30)!.action, 'straight');
  assert.equal(advance(0.6, 30)!.action, direction, 'easing cannot last more than one second');
  source.live = false;
  assert.equal(advance(STEP, 30)!.action, 'none', 'source loss overrides circle timing immediately');
});

test('canopy nose rotation alone cannot anticipate a course overshoot', () => {
  const adapter = field([{ id: 'next', x: 48, z: -48, r: 40, remaining: 90 }]);
  const g = wing({ yaw: Math.PI / 4 }), guide = navigationGuide(adapter);
  g.yawRate = 3; g.trackRate = 0;
  assert.equal(guide.step(STEP, facts(g, adapter, 0))!.action, 'straight');
  g.yawRate = 0; g.trackRate = 0.3;
  const message = ticks(guide, g, adapter, 1);
  assert.equal(message!.action, 'left'); assert.equal(message!.phase, 'align');
});

function runAdapter(sky: CloudbaseRun, includeSources = true): TestAdapter {
  return {
    sampleAir: (pos, out) => sky.sample(pos, 0, out), heightAt: surfaceAt,
    sources: () => includeSources ? sky.state.thermals.map((source, id) => ({ ...source, id, remaining: cloudThermalRemaining(source) })) : [],
    inside: (pos: { x: number; z: number; }, margin: number) => Math.hypot(pos.x - CLOUD_ZONE.x, pos.z - CLOUD_ZONE.z) < CLOUD_ZONE.r - margin,
    fog: () => ({ height: sky.state.fogHeight, elapsed: sky.state.elapsed, speedAt: cloudFogSpeed }),
    cloudDepth: (pos) => sky.depthAt(pos.x, pos.y + 3, pos.z),
  };
}
test('actual starts keep useful starter lift in both wind directions; ridge approaches account for crosswind', () => {
  for (const seed of [1, 2]) {
    const sky = createCloudbaseRun(), world = createRunWorld({ sky }); startRun(world, seed);
    const adapter = runAdapter(sky), guide = navigationGuide(adapter);
    let message = guide.step(STEP, facts(world.g, adapter, 0));
    assert.equal(message!.context, 'thermal'); assert.equal(message!.targetId, 0, 'keep the useful starter rather than cross the valley');
    const ridgeAdapter = runAdapter(sky, false), ridgeGuide = navigationGuide(ridgeAdapter);
    message = ridgeGuide.step(STEP, facts(world.g, ridgeAdapter, 0));
    assert.equal(message!.context, 'ridge');
    assert.equal(message!.action, 'left', seed === 1 ? 'approach the windward west cliff' :
      'check the eastward drift while following the clear ridge approach');
  }
});

test('guide calls cannot mutate frozen flight/input/source data or advance a paused clock', () => {
  const source = freeze({ id: 1, x: 48, z: -48, r: 35, remaining: 90 }), g = freeze(wing()), input = freeze({ left: true });
  let calls = 0;
  const base = field([source]), adapter = { ...base, sampleAir(pos: Vector3, out: AirSample) { calls++; return base.sampleAir(pos, out); } };
  const guide = navigationGuide(adapter), before = structuredClone({ source, g, input });
  guide.step(STEP, facts(g, adapter, 0, input));
  const message = guide.message, count = calls;
  for (let n = 0; n < 100; n++) { assert.equal(guide.message, message); guide.step(0, { g, clock: 0, input }); }
  assert.equal(calls, count); assert.deepEqual({ source, g, input }, before);
  assert.equal(guide.step(STEP, { g, clock: 0, input }), message); assert.equal(calls, count);
});

test('intentional deep braking and latched acro withdraw specialist lift coaching until it requalifies', () => {
  for (const blocked of ['input', 'deep', 'acro'] as const) {
    const adapter = field([], { heightAt: (x: number): number => Math.max(0, x * 0.3),
      sampleAir: (_pos, out) => Object.assign(out, { windX: 2, windZ: 0, windY: 3,
        ridge: 3, thermal: 0, lee: 0, ambientX: 2, ambientZ: 0 }) });
    const g = wing({ x: -45 }); g.vy = 1;
    const guide = createQualifiedLiftGuide(adapter);
    ticks(guide, g, adapter, 2);
    assert.equal(guide.activity.activity, 'ridge'); assert.ok(guide.message);
    if (blocked === 'deep') g.deepBrake = true;
    if (blocked === 'acro') g.acro = true;
    const input = blocked === 'input' ? { brake: true, deepBrake: true } : { brake: true };
    const before = structuredClone(g);
    assert.equal(guide.step(STEP, facts(g, adapter, 2.1, input)), null);
    assert.equal(guide.route, null); assert.equal(guide.activity.activity, 'navigating');
    assert.deepEqual(g, before, 'the guidance guard cannot change the physical configuration');
  }
});

test('full air and route queries run at the quarter-second search cadence, not every flight tick', () => {
  const base = field([{ x: 48, z: -48, r: 35, remaining: 90 }]); let calls = 0;
  const adapter = { ...base, sampleAir(pos: Vector3, out: AirSample) { calls++; return base.sampleAir(pos, out); } };
  const guide = navigationGuide(adapter), g = wing(), air = base.sampleAir(g.pos, {});
  guide.step(STEP, { g, air, clock: 0 }); assert.ok(calls > 0);
  calls = 0;
  for (let n = 1; n < 15; n++) guide.step(STEP, { g, air, clock: n * STEP });
  assert.equal(calls, 0, 'intervening ticks only update route geometry and current-point checks');
  guide.step(STEP, { g, air, clock: 0.25 }); assert.ok(calls > 0);
});

test('actual manual ridge departures hand off only to visible confirmed ridge guidance', () => {
  // These real seeded departures leave a clear cliff section beyond the wider cores.
  // Seed 1's west route now passes through a second broad thermal instead. Flown on the classic
  // wing, whose speeds the guide here reckons with.
  for (const seed of [10, 2]) {
    const sky = createCloudbaseRun(), world = createRunWorld({ sky, wing: 'classic' }); startRun(world, seed);
    const adapter = runAdapter(sky), guide = createQualifiedLiftGuide(adapter), side = sky.state.weather.side;
    const held = side < 0 ? 4 : 1.5, reversed = side < 0 ? 2 : 1, aligned = held + reversed;
    const pending: FlightInput[] = Array.from({ length: 12 }, () => ({ turn: 0, brake: false }));
    let clearance = Infinity, ridgeClimb = 0, ridgeGuidance = 0;
    for (let n = 0; n < 1800; n++) {
      const input = n < held * 60 ? { turn: side } : n < aligned * 60 ? { turn: -side } : pending.shift();
      assert.equal(stepRun(world, input!, STEP), null, `sky ${seed}, step ${n}`);
      assert.equal(world.controls.deepBrake, false);
      assert.equal(world.g.acro, false, 'following ordinary ridge cues never opens acro');
      const message = guide.step(STEP, { g: world.g, air: world.air, clock: sky.state.elapsed,
        input: { left: input!.turn! < 0, right: input!.turn! > 0, brake: !!input!.brake } });
      if (n >= aligned * 60) pending.push(message ? { turn: message.hold.includes('left') ? -1 : message.hold.includes('right') ? 1 : 0,
        brake: message.hold.includes('brake') } : input!);
      clearance = Math.min(clearance, world.g.pos.y - surfaceAt(world.g.pos.x, world.g.pos.z));
      if (world.air.ridge! > 1.5 && world.g.vy > 0.5 && world.air.thermal! < 0.1) ridgeClimb += STEP;
      if (message?.context === 'ridge') ridgeGuidance += STEP;
      assert.equal(world.controls.steered, false, 'no assisted boundary rescue');
    }
    assert.ok(clearance > 45, `sky ${seed}: ${clearance}m clearance`);
    assert.ok(world.g.pos.y > 100 && ridgeClimb > 4, `sky ${seed}: genuine ridge climb after a manual approach`);
    assert.ok(ridgeGuidance > 5, 'only confirmed physical ridge flight provides the handoff');
    if (side < 0) assert.ok(ridgeGuidance > 10, 'the far west-cliff handoff stays with useful ridge air');
    assert.equal(world.watch.state.moves, 0); assert.equal(world.g.loops, 0);
  }
});

test('actual fixed-step wing and sky remain identical with coaching and arbitrary render reads', () => {
  function fly(coaching: boolean) {
    const sky = createCloudbaseRun(), world = createRunWorld({ sky }); startRun(world, 1);
    const adapter = runAdapter(sky), guide = navigationGuide(adapter), input: FlightInput = { turn: 0, brake: false, bar: false, ears: false };
    for (let n = 0; n < 360; n++) {
      input.turn = n < 120 ? -1 : n < 180 ? 1 : 0;
      stepRun(world, input!, STEP);
      if (coaching) {
        guide.step(STEP, { g: world.g, air: world.air, clock: sky.state.elapsed, input });
        for (let read = 0; read < (n % 5); read++) void guide.message;
      }
    }
    return { g: world.g, sky: sky.state, air: world.air, controls: world.controls, watch: world.watch.state, trace: world.trace };
  }
  assert.deepEqual(fly(true), fly(false));
  assert.equal(LIFT_GUIDE.distances.length * LIFT_GUIDE.angles.length, 28);
});

function orbit(g: FlightObservation & {yawRate?: number; pilot?: {vel: Vector3}}, source: ThermalSource, seconds: number, dir = 1) {
  const angle = seconds * 0.4 * dir;
  g.pos.x = source.x + Math.sin(angle) * 25; g.pos.z = source.z - Math.cos(angle) * 25;
  g.yaw = g.track = angle + dir * Math.PI / 2; g.yawRate = g.trackRate = dir * 0.4;
  g.bank = dir * 0.4; g.vy = 2;
  g.pilot!.vel.x = Math.cos(angle) * 10 * dir; g.pilot!.vel.z = Math.sin(angle) * 10 * dir;
}

test('visible thermal coaching waits three seconds of actual circling while approach routes remain private', () => {
  for (const dir of [-1, 1]) {
    const source: ThermalSource = { id: 'core', generation: 4, x: 0, z: 0, r: 60, remaining: 90 }, adapter = field([source]);
    const guide = createQualifiedLiftGuide(adapter), g = wing();
    orbit(g, source, 0, dir); guide.step(0.01, facts(g, adapter, 0));
    for (let n = 1; n <= 300; n++) {
      orbit(g, source, n / 100, dir);
      const message = guide.step(0.01, facts(g, adapter, n / 100));
      if (n < 300) assert.equal(message, null, `quiet until locked: ${n / 100}s`);
      else {
        assert.equal(message!.activity, 'thermalling');
        assert.equal(message!.targetId, 'core'); assert.equal(message!.targetGeneration, 4);
        assert.ok(message!.hold.includes('brake'));
      }
      assert.ok(guide.route, 'navigation can be computed without advertising a coach');
    }
    source.generation!++;
    orbit(g, source, 3.01, dir);
    assert.equal(guide.step(0.01, facts(g, adapter, 3.01)), null, 'a reborn slot must qualify again');
    assert.equal(guide.activity.activity, 'navigating');
  }
});

for (const dir of [-1, 1]) test(`real normal-brake circles follow flock ${dir} without reversed centering cues`, () => {
  const source: ThermalSource = { id: 1, flock: true, generation: 1, x: 0, z: 0, r: 100, dir, remaining: 90 };
  const adapter = field([source], { navigation: true });
  const guide = createQualifiedLiftGuide(adapter), g = createFlight({ x: -dir * 21, y: 700, z: 0 });
  const action = dir < 0 ? 'left' : 'right', input = { [action]: true, brake: true };
  let shown = 0;
  for (let tick = 0; tick < 600; tick++) {
    const air = adapter.sampleAir(g.pos, {});
    stepFlight(g, { turn: dir, brake: true }, air, STEP);
    const message = guide.step(STEP, { g, air, input, clock: tick * STEP });
    if (!message) continue;
    shown++;
    assert.ok(message.action === action || message.action === 'straight', JSON.stringify(message));
    assert.match(message.detail, /Follow the ravens/);
    assert.ok(message.hold.includes('brake'));
  }
  assert.ok(shown > 200, 'actual sustained climbing flight qualifies and receives the consistent guide');
});

test('opposite traffic is asked to level first, and a new source generation can establish the other direction', () => {
  const source: ThermalSource = { id: 1, flock: true, generation: 1, x: 0, z: 0, r: 100, dir: 1, remaining: 90 };
  const adapter = field([source], { navigation: true });
  const guide = createQualifiedLiftGuide(adapter), g = createFlight({ x: 21, y: 700, z: 0 });
  for (let tick = 0; tick < 300; tick++) {
    const air = adapter.sampleAir(g.pos, {});
    stepFlight(g, { turn: -1, brake: true }, air, STEP);
    guide.step(STEP, { g, air, input: { left: true, brake: true }, clock: tick * STEP });
  }
  assert.equal(guide.message!.title, 'LEVEL THE TURN');
  assert.deepEqual(guide.message!.hold, ['brake']);
  assert.ok(guide.message!.release.includes('left'));
  assert.match(guide.message!.detail, /ravens and circle right/);
  source.generation!++; source.dir = -1;
  guide.step(STEP, facts(g, adapter, 5.1, { left: true, brake: true }));
  assert.equal(guide.message, null, 'the new identity needs fresh thermalling qualification');
  assert.equal(guide.route!.targetGeneration, 2);
  assert.match(guide.route!.title, /LEFT/);
});

test('overlapping opening air keeps its useful circle before traffic can select a different flock', () => {
  const cells = [{ id: 0, x: 0, z: 0, r: 100, s: 2, remaining: 90 },
    { id: 1, generation: 1, x: -40, z: 0, r: 100, s: 2.5, dir: -1, remaining: 90 }];
  let protectedOpening = true;
  const adapter = field(cells, { navigation: true, openingProtected: () => protectedOpening,
    thermalFlow: () => ({ source: 1, generation: 1 }) });
  const guide = createQualifiedLiftGuide(adapter), g = createFlight({ x: -21, y: 150, z: 0 });
  guide.step(STEP, facts(g, adapter, 0));
  assert.equal(guide.route!.targetId, 0, 'the neighbouring stronger cell does not pull the opening circle away');
  protectedOpening = false;
  guide.step(STEP, facts(g, adapter, 1));
  assert.equal(guide.route!.targetId, 1, 'ordinary soaring follows the observed flock after the opening');
});

test('a selected thermal and straight rising fly-through never activate the specialist coach', () => {
  const adapter = field([{ id: 1, x: 0, z: -50, r: 100, remaining: 90 }]);
  const guide = createQualifiedLiftGuide(adapter), g = wing(); g.vy = 2;
  for (let n = 0; n < 360; n++) {
    g.pos.z = -n * STEP * g.speed!;
    assert.equal(guide.step(STEP, facts(g, adapter, n * STEP)), null);
  }
});

test('an already ridden useful thermal bypasses destination reserves while keeping physical identity checks', () => {
  for (const condition of [{ remaining: 15 }, { strength: 0.32, fade: 0.55 }]) {
    const source: ThermalSource = { id: 3, generation: 1, x: 0, z: 0, r: 60, remaining: 90, ...condition };
    const adapter = field([source]), g = wing(), guide = createQualifiedLiftGuide(adapter);
    for (let n = 0; n <= 180; n++) {
      orbit(g, source, n * STEP);
      guide.step(STEP, facts(g, adapter, n * STEP));
    }
    assert.equal(guide.message?.activity, 'thermalling', 'actual useful occupied lift needs no travel reserve');
    assert.equal(guide.message.targetId, 3);
    source.live = false;
    assert.equal(guide.step(STEP, facts(g, adapter, 181 * STEP)), null);
    assert.equal(guide.activity.activity, 'navigating');
  }
});

test('visible ridge advice requires sustained useful parallel flight and reacquires after a maneuver', () => {
  const terrain = createTerrainAir(x => 80 * Math.max(0, Math.min(1, (x + 8) / 16)));
  const adapter = field([], { sampleAir: (pos: { x: number; z: number; y: number; }, out: AirSample) => terrain.sample(pos, 3.5, 0, out), heightAt: terrain.heightAt });
  const g = wing({ x: -45, y: 100 }), guide = createQualifiedLiftGuide(adapter); g.vy = 2;
  for (let n = 1; n <= 150; n++) {
    g.pos.z -= g.speed! * 0.01;
    const message = guide.step(0.01, facts(g, adapter, n / 100));
    if (n < 150) assert.equal(message, null);
    else { assert.equal(message!.activity, 'ridge-soaring'); assert.equal(message!.action, 'straight'); }
  }
  assert.equal(guide.step(0.01, { ...facts(g, adapter, 1.51), suspended: true }), null);
  assert.equal(guide.activity.activity, 'navigating');
  assert.equal(guide.step(0.01, facts(g, adapter, 1.52)), null, 'no immediate stale ridge card after recovery');
});


test('ridge advice explains a conservative thermal height budget only after the ridge qualifies', () => {
  for (const height of [45, 120]) {
    const sources = [{ id: 1, generation: 2, x: 30, z: -150, r: 60, s: 5.5,
      strength: 1, live: true, remaining: 120 }];
    const adapter = field(sources, { heightAt: (x: number): number => Math.max(0, x * 0.3),
      sampleAir: (_pos, out) => Object.assign(out, { windX: 3, windZ: 0, ambientX: 3, ambientZ: 0,
        windY: 3, ridge: 3, thermal: 0, lee: 0 }) });
    const g = wing({ y: height }); g.vy = 1;
    const guide = createQualifiedLiftGuide(adapter);
    assert.equal(ticks(guide, g, adapter, 1), null, 'readiness does not invite thermalling during quiet acquisition');
    const message = ticks(guide, g, adapter, 1, 1);
    assert.equal(message!.activity, 'ridge-soaring'); assert.equal(message!.context, 'ridge');
    assert.equal(guide.transfer.targetId, 1);
    if (height < 100) {
      assert.equal(guide.transfer.ready, false); assert.ok(guide.transfer.missingHeight! > 0);
      assert.match(message!.detail, /^Build about \d+ m more height/);
    } else {
      assert.equal(guide.transfer.ready, true); assert.match(message!.detail, /thermal is within reach/);
    }
    sources[0].live = false;
    const lost = ticks(guide, g, adapter, 0.1, 2);
    assert.equal(guide.transfer.targetId, null); assert.doesNotMatch(lost!.detail, /thermal is within reach/);
    assert.equal(lost!.activity, 'ridge-soaring', 'a route opportunity never renames the observed activity');
  }
});
