import type { MoteParameters } from './thermal-motes.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { THERMAL_MOTES, createThermalMotes, layoutMotes, liftShare, moteAt } from './thermal-motes.ts';
import { CLOUD_HUNT, CLOUD_LAUNCH, CLOUD_POOL, CLOUD_ZONE, createCloudbaseRun } from '../../../domains/good-lift/cloudbase-state.ts';
import { CLOUD_LIT } from './cloudbase.ts';

const M = THERMAL_MOTES;
const STEP = 1 / 60;
// The brightness at which the game's glow starts (the bloom pass in game.js), and how bright a
// colour is by that measure.
const GLOW = 0.3;
const luma = (colour: THREE.Color) => 0.2126 * colour.r + 0.7152 * colour.g + 0.0722 * colour.b;
const close = (actual: number, expected: number, slack = 1e-9) => assert.ok(Math.abs(actual - expected) <= slack, `${actual} is within ${slack} of ${expected}`);

const hunted = layoutMotes(true, M.count.hunted);
const launch = layoutMotes(false, M.count.launch);
// Each mote's distance from its thermal's axis, in metres.
const radii = (layout: ReturnType<typeof layoutMotes>) => Array.from({ length: layout.count }, (_, i) => layout.seed[i * 4] * (layout.hunted ? CLOUD_HUNT.r : CLOUD_LAUNCH.r));
const share = (values: number[], test: (value:number)=>boolean) => values.filter(test).length / values.length;
// A set of motes for a test, with registries that keep nothing.
const makeMotes = (options: Partial<Parameters<typeof createThermalMotes>[0]> = {}) => createThermalMotes({ sites: CLOUD_POOL.thermals, ownGeometry: (geometry) => geometry, ownMaterial: (material) => material, ...options });
// A thermal's uniforms as plain numbers, with where its mesh stands: what moteAt reads.
function shaderMesh(object: THREE.Object3D | undefined): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  assert.ok(object instanceof THREE.Mesh && object.material instanceof THREE.ShaderMaterial);
  return object;
}
const valuesOf = (object: THREE.Object3D | undefined): MoteParameters => {
  const mesh = shaderMesh(object);
  const values: Record<string,number> = { x: mesh.position.x, z: mesh.position.z };
  for (const [name, uniform] of Object.entries(mesh.material.uniforms)) values[name] = uniform.value;
  return values as unknown as MoteParameters;
};
// How strongly a mote shows at `strength`, from 0 to 1, before anything else dims it.
const showing = (layout: ReturnType<typeof layoutMotes>, i: number, strength: number) => {
  const from = layout.seed[i * 4 + 3];
  const t = Math.min(1, Math.max(0, (strength - from) / M.soft));
  return t * t * (3 - 2 * t);
};

test('a hunted thermal\'s motes crowd its core: over half lie within 45% of the radius, three in four within 60%, none beyond where the lift is a tenth of its best', () => {
  const metres = radii(hunted);
  assert.equal(metres.length, 256);
  const inner = share(metres, (r: number) => r < CLOUD_HUNT.r * 0.45);
  assert.ok(inner > 0.55 && inner < 0.65, `${(100 * inner).toFixed(1)}% within the broad strongest region`);
  assert.ok(share(metres, (r: number) => r < CLOUD_HUNT.r * 0.6) >= 0.75);
  // The motes thin to a tenth of the best lift, so the edge
  // of the lift reads by their thinning: no ring is needed.
  const edge = CLOUD_HUNT.r * (1 - 0.1958 * CLOUD_HUNT.core);
  assert.ok(Math.max(...metres) <= edge && Math.max(...metres) > edge - CLOUD_HUNT.r / 15, `the furthest mote is ${Math.max(...metres).toFixed(1)} m out`);
  for (let i = 0; i < hunted.count; i++) assert.ok(hunted.trait[i * 4] >= M.reach - 1e-6, `mote ${i} has ${hunted.trait[i * 4]} of the best lift`);
  // The launch column is flat across its core, so fewer motes crowd the middle.
  const column = radii(launch);
  assert.equal(column.length, 384);
  assert.ok(share(column, (r: number) => r <= CLOUD_LAUNCH.r * 0.45) > 0.43);
  assert.ok(Math.max(...column) <= CLOUD_LAUNCH.r * 0.895);
});

test('each mote\'s lift share is what the run samples at its radius, for the launch column and a hunted thermal alike', () => {
  const run = createCloudbaseRun({ hazards: false, wind: false });
  run.reset(80, 5);
  const { thermals } = run.state;
  for (const [slot, layout] of [[0, launch], [1, hunted]] as const) {
    // Only the thermal being measured is lifting.
    thermals.forEach((thermal, i) => Object.assign(thermal, { live: i === slot, move: 0, strength: i === slot ? 0.8 : 0 }));
    const thermal = thermals[slot];
    // Keep every sampled radius inside the arena so its boundary cannot clip the profile.
    Object.assign(thermal, { x: CLOUD_ZONE.x, z: CLOUD_ZONE.z });
    const best = thermal.s * thermal.strength * (slot ? CLOUD_HUNT.peak : 1);
    const place = { x: 0, y: 300, z: 0 };
    for (let i = 0; i < layout.count; i++) {
      const r = layout.seed[i * 4] * thermal.r;
      const angle = layout.seed[i * 4 + 1];
      place.x = thermal.x + Math.cos(angle) * r;
      place.z = thermal.z + Math.sin(angle) * r;
      const { lift } = run.sample(place, 0);
      close(best * layout.trait[i * 4], lift!, 1e-5 * best);
    }
    // The table and the copy agree at the axis and at the rim.
    close(liftShare(slot > 0, 0), 1);
    close(liftShare(slot > 0, 1), 0);
  }
});

test('motes nearer the axis rise and swirl faster, never the other way round', () => {
  for (const layout of [hunted, launch]) {
    const order = Array.from({ length: layout.count }, (_, i) => i).sort((a, b) => layout.seed[a * 4] - layout.seed[b * 4]);
    // A full thermal turning the flock's way: every mote moving as the shader moves it.
    const u = { radius: layout.hunted ? CLOUD_HUNT.r : CLOUD_LAUNCH.r, rise: 0, turn: 0, speed: 40, spin: 0.6, foot: 0, span: 120, strength: 1, near: 1, clock: 0, twinkle: 0 } as MoteParameters;
    let before = null;
    for (const i of order) {
      const mote = moteAt(layout, i, u);
      const r = layout.seed[i * 4] * u.radius;
      // How fast it goes round, in radians a second, from its own velocity across the axis.
      const rate = r > 0 ? Math.hypot(mote.vx, mote.vz) / r : u.spin;
      // Within what a 32-bit attribute holds: two motes almost the same distance out may swap.
      if (before) {
        assert.ok(mote.vy <= before.vy * (1 + 1e-6), `a mote ${r.toFixed(2)} m out rises no faster than one nearer`);
        assert.ok(rate <= before.rate * (1 + 1e-6), `a mote ${r.toFixed(2)} m out turns no faster than one nearer`);
      }
      before = { vy: mote.vy, rate };
    }
    // And the difference is real: the core rises several times as fast as the rim, and turns faster.
    const core = moteAt(layout, order[0], u);
    const rim = moteAt(layout, order.at(-1)!, u);
    assert.ok(core.vy > 4 * rim.vy, `${core.vy.toFixed(1)} m/s at the core, ${rim.vy.toFixed(1)} at the rim`);
  }
  // From 8 m out to 24 m a full hunted thermal goes round at 3.8 to 4.6 m/s, so its tails lean
  // a few degrees from upright in the core and under twenty at the rim.
  for (const metres of [8, 15.2, 24]) {
    const s = metres / CLOUD_HUNT.r;
    const across = M.swirl * metres * (M.eye * M.eye) / (s * s + M.eye * M.eye);
    const up = M.flow * CLOUD_HUNT.s * CLOUD_HUNT.peak * liftShare(true, s);
    assert.equal(across, 0, "air does not invent a decorative vortex");
    assert.ok(Math.atan2(across, up) < 0.33, `leaning ${(Math.atan2(across, up) * 180 / Math.PI).toFixed(0)}° at ${metres} m`);
  }
});

test('a growing thermal fills from its core out and a dying one empties from its rim in', () => {
  const metres = radii(hunted);
  // The motes at least half shown at a strength: how many, and out to where.
  const shown = (strength: number) => metres.filter((_, i) => showing(hunted, i, strength) >= 0.5);
  let previousCount = 0, previousEdge = 0;
  for (const strength of [0.2, 0.3, 0.5, 0.7]) {
    const now = shown(strength), edge = Math.max(...now);
    assert.ok(now.length > previousCount, `more core particles show at ${strength}`);
    assert.ok(edge > previousEdge && edge < CLOUD_HUNT.r * 0.9);
    previousCount = now.length; previousEdge = edge;
  }
  assert.ok(Math.max(...shown(0.2)) < CLOUD_HUNT.r * 0.5, 'a young cell first shows its core');
  assert.ok(Math.max(...shown(0.7)) > CLOUD_HUNT.r * 0.6, 'a mature cell reveals its broader lift');
  assert.ok(shown(0.5).length / metres.length > 0.55, 'nearly two in three by half strength');
  assert.equal(metres.every((_, i) => showing(hunted, i, 0.85) > 0), true, 'all of them from 0.85');
  assert.equal(metres.every((_, i) => showing(hunted, i, 1) === 1), true, 'and every one whole at full strength');
  assert.equal(metres.every((_, i) => showing(hunted, i, M.first) === 0), true, 'none at all until the first mote\'s strength');
  // Going up a tenth of strength at a time, each tenth's new motes lie further out than the last
  // tenth's; going down, the same motes go in the reverse order, rim first.
  let last = 0;
  for (let step = 1; step <= 9; step++) {
    const from = step / 10;
    const added = metres.filter((_, i) => showing(hunted, i, from + 0.1) >= 0.5 && showing(hunted, i, from) < 0.5);
    if (added.length < 2) continue;
    const middle = added.reduce((sum, r) => sum + r, 0) / added.length;
    assert.ok(middle > last, `motes added between ${from.toFixed(1)} and ${(from + 0.1).toFixed(1)} lie ${middle.toFixed(1)} m out on average`);
    last = middle;
  }
  // The shader's twin says the same: a mote below its strength draws nothing, one past it draws.
  const u = { radius: CLOUD_HUNT.r, rise: 0, turn: 0, speed: 0, spin: 0, span: M.hunted.span, strength: 0, near: 1, clock: 0, twinkle: 0 } as MoteParameters;
  for (let i = 0; i < hunted.count; i += 7) {
    u.foot = hunted.seed[i * 4 + 2] * u.span - u.span / 2;
    u.strength = hunted.seed[i * 4 + 3];
    assert.equal(moteAt(hunted, i, u).alpha, 0);
    u.strength = hunted.seed[i * 4 + 3] + M.soft;
    assert.ok(moteAt(hunted, i, u).alpha > 0.15);
  }
});

test('the same motes are laid out every time, with no randomness', (t) => {
  t.mock.method(Math, 'random', () => assert.fail('the layout rolls no dice'));
  const again = layoutMotes(true, M.count.hunted);
  assert.deepEqual(again, hunted);
  assert.deepEqual(layoutMotes(false, M.count.launch), launch);
  // Fewer motes are the first of the same motes: the sequences never go back over themselves.
  const few = layoutMotes(true, 40);
  assert.deepEqual(few.seed, hunted.seed.slice(0, 160));
  assert.deepEqual(few.trait, hunted.trait.slice(0, 160));
  // Every number is in range: shares of the radius, angles, places up the window and strengths.
  for (let i = 0; i < hunted.count; i++) {
    const [r, angle, up, from] = hunted.seed.slice(i * 4, i * 4 + 4);
    const [lift, swirl, phase, rate] = hunted.trait.slice(i * 4, i * 4 + 4);
    assert.ok(r > 0 && r < 1 && angle >= 0 && angle < 2 * Math.PI && up >= 0 && up < 1, `mote ${i} sits in its thermal`);
    assert.ok(from >= M.first && from + M.soft <= 1 + 1e-6, `mote ${i} shows from ${from}`);
    assert.ok(lift > 0 && lift <= 1 && swirl > 0 && swirl <= 1 && phase >= 0 && phase < 2 * Math.PI, `mote ${i}'s traits`);
    assert.ok(rate >= M.shimmer[0] && rate <= M.shimmer[1]);
  }
});

test('even drawn at their largest, a hunted thermal\'s motes cover under 8% of a 390 × 844 screen, and the launch column\'s under 10%', () => {
  // The widest a head is ever drawn (lightning's flare included), and the longest quad: half a head
  // in front of the mote and the longest tail behind it, in CSS pixels.
  const widest = Math.max(M.width[1], CLOUD_LIT.flare);
  const longest = 0.5 * widest + M.tail[1];
  const screen = 390 * 844;
  const cover = (count: number) => (count * widest * longest) / screen;
  assert.ok(cover(M.count.hunted) < 0.08, `${(100 * cover(M.count.hunted)).toFixed(1)}%`);
  assert.ok(cover(M.count.launch) < 0.1, `${(100 * cover(M.count.launch)).toFixed(1)}%`);
  // The quad is the whole of what is drawn: the shader lays it from those very numbers.
  const { vertexShader } = shaderMesh(makeMotes().group.children[0]).material;
  const glsl = (value: unknown) => (Number.isInteger(value) ? (value as number).toFixed(1) : String(value)).replace('.', '\\.');
  assert.match(vertexShader, new RegExp(`min\\(${glsl(M.size)} \\* sight / away, ${glsl(M.width[1])}\\)`));
  assert.match(vertexShader, new RegExp(`clamp\\(fast \\* ${glsl(M.exposure)} / dpr, ${glsl(M.tail[0])}, ${glsl(M.tail[1])}\\)`));
});

test('only a core head at full strength reaches the glow; rim heads and every tail stay under it', () => {
  const metres = radii(hunted);
  // How bright mote i's head and the root of its tail are at `strength`, halfway up its window and
  // at the top of its twinkle, in the given look.
  const brightest = (look: Readonly<{ head: 0.58; gold: 16770736; amber: 16757854; ash: 11121856; }>|Readonly<{ head: 0.34; gold: 15328211; amber: 13221804; ash: 9806772; }>, i: number, strength: number) => {
    const u = { radius: CLOUD_HUNT.r, rise: 0, turn: 0, speed: 0, spin: 0, span: M.hunted.span, strength, near: 1, clock: 0, twinkle: 0 } as MoteParameters;
    u.foot = hunted.seed[i * 4 + 2] * u.span - u.span / 2;
    const { alpha, warm } = moteAt(hunted, i, u);
    const ash = new THREE.Color(look.ash);
    return {
      head: luma(ash.clone().lerp(new THREE.Color(look.gold), warm)) * look.head * alpha,
      tail: luma(ash.clone().lerp(new THREE.Color(look.amber), warm)) * look.head * alpha * M.trail,
    };
  };
  const gold = M.looks.gold;
  assert.equal(M.look, 'gold', 'warm gold is the look shown unless the owner picks the other');
  close(luma(new THREE.Color(gold.gold)), 0.81, 0.005);
  const glowing = [];
  for (let i = 0; i < hunted.count; i++) {
    const full = brightest(gold, i, 1);
    if (full.head >= GLOW) glowing.push(metres[i]);
    if (metres[i] < 8) assert.ok(full.head >= GLOW, `a core head ${metres[i].toFixed(1)} m out is ${full.head.toFixed(3)} bright`);
    if (hunted.trait[i * 4] < 0.25) assert.ok(full.head < 0.2, `a rim head ${metres[i].toFixed(1)} m out is ${full.head.toFixed(3)} bright`);
    assert.ok(full.tail < 0.2, `a tail is ${full.tail.toFixed(3)} bright`);
    assert.ok(brightest(gold, i, 0.5).head < GLOW, 'nothing glows in a thermal at half strength');
  }
  // The glow marks the core: about the hands-up circle, and no further.
  assert.ok(Math.max(...glowing) < CLOUD_HUNT.r * 0.65, `heads glow out to ${Math.max(...glowing).toFixed(1)} m`);
  assert.ok(glowing.length > 0.3 * hunted.count && glowing.length < 0.9 * hunted.count, `${glowing.length} heads glow`);
  // Pale dust never glows at all.
  for (let i = 0; i < hunted.count; i++) {
    const full = brightest(M.looks.dust, i, 1);
    assert.ok(full.head < 0.27 && full.tail < GLOW, `dust ${metres[i].toFixed(1)} m out is ${full.head.toFixed(3)} bright`);
  }
});

test('motes follow thermal drift and rise at physical speed without a decorative vortex', () => {
  const run = createCloudbaseRun({ hazards: false }); run.reset(80, 3);
  const thermal = run.state.thermals[2];
  const motes = makeMotes(), mesh = shaderMesh(motes.group.getObjectByName('motes-2'));
  assert.ok(mesh);
  const pos = { x: thermal.x, y: 400, z: thermal.z };
  motes.update(0, run.state, pos);
  const before = moteAt(hunted, 100, valuesOf(mesh));
  run.step(STEP, pos); motes.update(STEP, run.state, pos);
  const after = moteAt(hunted, 100, valuesOf(mesh));
  close(after.x - before.x, thermal.vx * STEP, 1e-8);
  close(after.z - before.z, thermal.vz * STEP, 1e-8);
  close(after.vx, thermal.vx); close(after.vz, thermal.vz);
  close(mesh.material.uniforms.spin.value, 0);
  close(mesh.material.uniforms.speed.value, thermal.s * thermal.strength);
});

test('a mote stays where the air carried it however the pilot climbs: the window only picks which copy is drawn', () => {
  const run = createCloudbaseRun({ hazards: false });
  run.reset(80, 3);
  const thermal = run.state.thermals[2];
  const motes = makeMotes();
  const mesh = shaderMesh(motes.group.getObjectByName('motes-2'));
  const pos = { x: thermal.x + 12, y: 300, z: thermal.z };
  // Let the air carry them a while.
  for (let n = 0; n < 90; n++) {
    run.step(STEP, pos);
    motes.update(run.state.elapsed, run.state, pos);
  }
  const all = () => Array.from({ length: hunted.count }, (_, i) => moteAt(hunted, i, valuesOf(mesh)));
  const low = all();
  // The same moment, the pilot 45 m higher: the window moves up and nothing in the air moves.
  pos.y += 45;
  motes.update(run.state.elapsed, run.state, pos);
  const high = all();
  const span = M.hunted.span;
  let both = 0;
  for (let i = 0; i < hunted.count; i++) {
    close(high[i].x, low[i].x, 1e-9);
    close(high[i].z, low[i].z, 1e-9);
    const gap = (high[i].y - low[i].y) / span;
    close(gap, Math.round(gap), 1e-9);
    if (Math.round(gap) === 0) both += 1;
  }
  assert.ok(both > 0.5 * hunted.count && both < hunted.count, `${both} motes lie in both windows and are drawn where they were`);
  // A frame later the air has carried each mote up by its own lift, however far the pilot went.
  const before = all();
  pos.y += 7;
  run.step(STEP, pos);
  motes.update(run.state.elapsed, run.state, pos);
  const after = all();
  let moved = 0;
  for (let i = 0; i < hunted.count; i++) {
    if (after[i].up < 30 || after[i].up > span - 30 || before[i].up < 30) continue;
    close(after[i].y - before[i].y, after[i].vy * STEP, 1e-6);
    moved += 1;
  }
  assert.ok(moved > 0.3 * hunted.count, `${moved} motes followed`);
});

test('current profile and absolute air strength control brightness, rise and the broad glow without mutating cells', () => {
  const run = createCloudbaseRun({ hazards: false }); run.reset(300, 3);
  const thermal = run.state.thermals[1], motes = makeMotes();
  const pos = { x: thermal.x, y: 300, z: thermal.z }, mesh = shaderMesh(motes.group.getObjectByName('motes-1'));
  assert.ok(mesh);
  thermal.fade = 0.4; thermal.s = 3; thermal.strength = 1;
  const before = structuredClone(run.state);
  motes.update(0, run.state, pos, 1, 0, true);
  assert.deepEqual(run.state, before);
  close(mesh.material.uniforms.power.value, 3 / 5.5);
  close(mesh.material.uniforms.profileFade.value, 0.4);
  close(mesh.children[0].scale.x, thermal.r * (1 - 0.4 * 0.65));
  const sample = moteAt(hunted, 30, valuesOf(mesh));
  const r = hunted.seed[30 * 4];
  close(sample.vy, 3 * liftShare(true, r, 0.4));
  thermal.s = 0; motes.update(1, run.state, pos, 1, 1);
  assert.equal(mesh.visible, false, 'a cell with no rising air has no lift cue, even under lightning');
});

test('source replacement and clock reset discard old phases; overlapping cells stay independently sampled and bounded', () => {
  const run = createCloudbaseRun({ hazards: false }); run.reset(300, 3);
  const motes = makeMotes(), pos = { x: 0, y: 300, z: 80 };
  const mesh = shaderMesh(motes.group.getObjectByName('motes-1'));
  assert.ok(mesh);
  for (const cell of run.state.thermals) Object.assign(cell, { x: 0, z: 80, live: true, strength: 1, move: 0 });
  motes.update(0, run.state, pos); motes.update(0.1, run.state, pos);
  const prior = mesh.material.uniforms.rise.value;
  run.state.thermals[1] = { ...run.state.thermals[1], generation: 900, strength: 0.5 };
  motes.update(0.2, run.state, pos);
  assert.ok(mesh.material.uniforms.rise.value < prior);
  close(mesh.material.uniforms.speed.value, 2.75);
  assert.equal(motes.group.children.length, CLOUD_POOL.thermals);
  assert.equal(motes.group.children.filter(v => v.visible).length, CLOUD_POOL.thermals);
  motes.update(0, run.state, pos);
  close(mesh.material.uniforms.rise.value, M.phase[0]);
  motes.clear(); assert.ok(motes.group.children.every(v => !v.visible));
});
