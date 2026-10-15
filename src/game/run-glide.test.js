import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLIDE, GLIDE_LINES, breezeAt, createGlideRing, glideRing, glideTime, glideWord } from './run-glide.js';
import { CLOUD_POOL, CLOUD_WIND, CLOUD_ZONE, createCloudbaseRun } from './cloudbase-state.js';
import { FOG_SURFACE, ORDER } from './cloudbase.js';
import { FLIGHT } from './flight.js';
import { MEET } from './meet-state.js';
import { HINT_WIDTH, URGENT } from './hints.js';
import { RUN, createRunWorld, startRun, stepRun } from './run-step.js';
import { createReferencePilot } from './pilots.js';

const STEP = RUN.step;
const close = (actual, expected, slack) => assert.ok(Math.abs(actual - expected) <= slack, `${actual} is within ${slack} of ${expected}`);

// A run's sky stepped, with nobody in its way, until `at` seconds in: the fog as the run has it then.
function skyAt(seed, at, options = { hazards: false }) {
  const sky = createCloudbaseRun(options);
  sky.reset(80, seed);
  const high = { x: CLOUD_ZONE.x, y: 5000, z: CLOUD_ZONE.z };
  while (sky.state.elapsed < at - 1e-9) sky.step(STEP, high);
  return sky;
}

// Sinks a wing at trim from `gap` metres over the fog until the run's own step says the fog has it:
// the seconds that took, and the height it was caught at.
function caught(sky, gap) {
  const pos = { x: CLOUD_ZONE.x, y: sky.state.fogHeight + gap, z: CLOUD_ZONE.z };
  const from = sky.state.elapsed;
  for (let ended = null; !ended;) {
    pos.y -= GLIDE.sink * STEP;
    ended = sky.step(STEP, pos);
  }
  return { seconds: sky.state.elapsed - from, height: pos.y };
}

test('a glide hands up lasts until the run\'s own fog catches the wing, at any time in a run and however fast the fog is climbing', () => {
  const moments = [[0, 60], [30, 90], [60, 150], [100, 300], [112, 300], [125, 250], [135, 120]];
  for (const seed of [3, 41]) {
    for (const [at, gap] of moments) {
      const sky = skyAt(seed, at);
      const { fogHeight, elapsed } = sky.state;
      const predicted = glideTime(fogHeight + gap, fogHeight, elapsed, 200);
      const run = caught(sky, gap);
      // The run steps in sixtieths and notices the fog at the end of a step.
      close(predicted, run.seconds, STEP + 0.005);
      // Were the fog to stand still, the same height would last longer.
      assert.ok(predicted < (gap - GLIDE.catch) / GLIDE.sink, `${predicted.toFixed(2)} s from ${gap} m at ${at} s`);
    }
  }
});

test('a glide at or under the height the fog takes the wing lasts no time, and one past the limit asked for stops there', () => {
  assert.equal(glideTime(103, 100, 50), 0);
  assert.equal(glideTime(90, 100, 50), 0);
  assert.ok(glideTime(103.5, 100, 50) > 0);
  assert.equal(glideTime(5000, 0, 0, 25), 25);
  assert.ok(glideTime(5000, 0, 0) <= 60);
});

test('the ring\'s radius is how far the wing goes at trim in that time, at the height the fog will have climbed to, carried downwind by the breeze meanwhile', () => {
  const sky = skyAt(7, 70);
  const pos = { x: 100, y: sky.state.fogHeight + 180, z: 250 };
  const still = glideRing(sky, pos, { x: 0, z: 0 }, {});
  const t = glideTime(pos.y, sky.state.fogHeight, sky.state.elapsed);
  assert.equal(still.t, t);
  close(still.r, FLIGHT.speed.trim * t, 1e-9);
  assert.deepEqual([still.x, still.z], [pos.x, pos.z], 'in still air it is centred under the pilot');
  close(still.y, pos.y - FLIGHT.sink.trim * t, 1e-9);
  // Height lost at trim, times the trim glide (about 9.6): what is left of the height over the fog
  // once the fog's own climb is taken off it.
  close(still.r / (pos.y - still.y), FLIGHT.speed.trim / FLIGHT.sink.trim, 1e-9);
  const run = caught(sky, pos.y - sky.state.fogHeight);
  close(still.y, run.height, 0.05);
  // The breeze moves the middle, never the size: everywhere a shorter glide reaches lies inside.
  const blown = glideRing(skyAt(7, 70), pos, { x: 3, z: -2 }, {});
  assert.equal(blown.r, still.r);
  close(blown.x, pos.x + 3 * t, 1e-9);
  close(blown.z, pos.z - 2 * t, 1e-9);
  for (const share of [0.25, 0.5, 0.75]) {
    const sooner = { x: pos.x + 3 * t * share, z: pos.z - 2 * t * share, r: still.r * share };
    assert.ok(Math.hypot(sooner.x - blown.x, sooner.z - blown.z) + sooner.r <= blown.r + 1e-9);
  }
});

test('a wing flown hands up and straight through a run\'s own air, with nothing lifting it, is caught by the fog on the ring', () => {
  for (const [seed, at, gap] of [[2, 60, 80], [9, 95, 140], [9, 120, 280]]) {
    const world = startRun(createRunWorld({ sky: createCloudbaseRun({ hazards: false, wind: false }) }), seed);
    const { sky, g } = world;
    // No lift anywhere, so the glide is the wing's alone.
    const dead = () => {
      for (const thermal of sky.state.thermals) Object.assign(thermal, { live: false, strength: 0, move: 0 });
    };
    dead();
    const intent = { turn: 0, brake: false, bar: false };
    while (sky.state.elapsed < at - 1e-9) {
      g.pos.y = Math.max(g.pos.y, 4000);
      stepRun(world, intent);
    }
    // From the zone's west side, flying east through its middle: a straight line well inside it.
    Object.assign(g.pos, { x: CLOUD_ZONE.x - 120, y: sky.state.fogHeight + gap, z: CLOUD_ZONE.z });
    Object.assign(g, { yaw: Math.PI / 2, yawRate: 0, bank: 0, speed: FLIGHT.speed.trim, vy: -FLIGHT.sink.trim });
    const ring = glideRing(sky, g.pos, { x: 0, z: 0 }, {}, 200);
    assert.ok(ring.r > 60 && ring.r < 250, `a ring of ${ring.r.toFixed(0)} m fits across the zone`);
    let flown = 0;
    let ended = null;
    while (!ended) {
      const { x, z } = g.pos;
      ended = stepRun(world, intent);
      flown += Math.hypot(g.pos.x - x, g.pos.z - z);
    }
    assert.equal(ended, 'fog');
    close(flown, ring.r, 0.01 * ring.r + 0.5);
    close(Math.hypot(g.pos.x - ring.x, g.pos.z - ring.z), ring.r, 0.01 * ring.r + 0.5);
  }
});

test('the breeze a ring drifts on is the run\'s own wind wherever no gust and no lift is touching it, and nothing under the launch hill\'s lee', () => {
  for (const seed of [1, 12, 77]) {
    const sky = createCloudbaseRun();
    sky.reset(80, seed);
    // Before the first gust sets off, at points well clear of every thermal.
    const clear = [];
    for (let x = CLOUD_ZONE.x - 100; x <= CLOUD_ZONE.x + 100; x += 20) {
      for (let z = CLOUD_ZONE.z - 100; z <= CLOUD_ZONE.z + 100; z += 20) {
        if (Math.hypot(x - CLOUD_ZONE.x, z - CLOUD_ZONE.z) > CLOUD_ZONE.r - 5) continue;
        if (sky.state.thermals.every((thermal) => Math.hypot(x - thermal.x, z - thermal.z) > thermal.r + 5)) clear.push({ x, z });
      }
    }
    assert.ok(clear.length > 10);
    const mine = {};
    const theirs = {};
    for (const y of [0, CLOUD_WIND.lee[0] - 1, 200, 450, ...sky.state.wind.map((level) => level.y), 1000, 1500, 2600]) {
      for (const point of clear.slice(0, 6)) {
        breezeAt(sky.state, y, mine);
        sky.windAt(point.x, y, point.z, theirs);
        close(mine.x, theirs.x, 1e-12);
        close(mine.z, theirs.z, 1e-12);
      }
      if (y < CLOUD_WIND.lee[0]) assert.ok(mine.x === 0 && mine.z === 0, `no breeze at ${y} m`);
    }
    assert.ok(Math.hypot(mine.x, mine.z) > 1, 'high up the breeze blows');
  }
});

// A sky held still by hand: the launch column and two hunted thermals at their places, and the pilot
// in none of them.
function heldSky() {
  const sky = createCloudbaseRun();
  sky.reset(80, 3);
  const [column, one, two] = sky.state.thermals;
  Object.assign(column, { x: 125, z: 320, live: true, move: 0, strength: 1 });
  Object.assign(one, { x: 60, z: 240, live: true, move: 0, strength: 1 });
  Object.assign(two, { x: 200, z: 200, live: true, move: 0, strength: 1 });
  sky.state.pilot.thermal = -1;
  return sky;
}
const word = (sky, ring, was = '', skip = -1) => glideWord(sky, ring, was, skip, {});

test('the word is go while a settled flock with lift lies inside the ring and climb first while none does, judged by the one furthest inside', () => {
  const sky = heldSky();
  // Flock one is 65 m from (125, 240) and flock two 85 m.
  assert.deepEqual(word(sky, { x: 125, z: 240, r: 100 }), { target: 1, margin: 35, word: 'go' });
  const tight = word(sky, { x: 125, z: 240, r: 60 });
  assert.equal(tight.word, 'climb');
  assert.equal(tight.target, 1);
  close(tight.margin, -5, 1e-9);
  // Downwind the other flock can be the one inside.
  const leaning = word(sky, { x: 175, z: 210, r: 40 });
  assert.equal(leaning.word, 'go');
  assert.equal(leaning.target, 2);
  // The launch column is lift but no flock: inside the ring it does not count.
  const [column, one, two] = sky.state.thermals;
  Object.assign(one, { live: false });
  Object.assign(two, { live: false });
  assert.deepEqual(word(sky, { x: column.x, z: column.z, r: 200 }), { target: -1, margin: -Infinity, word: 'climb' });
});

test('a flock does not count while its ravens are still on the way, before its lift is up to what the meet calls lift, or while it is the one being ridden', () => {
  const ring = { x: 125, z: 240, r: 120 };
  const sky = heldSky();
  const [, one, two] = sky.state.thermals;
  two.live = false;
  assert.equal(word(sky, ring).word, 'go');
  for (const change of [{ move: 3 }, { live: false }, { strength: MEET.alive - 0.01 }]) {
    const held = heldSky();
    held.state.thermals[2].live = false;
    Object.assign(held.state.thermals[1], change);
    assert.deepEqual(word(held, ring), { target: -1, margin: -Infinity, word: 'climb' }, JSON.stringify(change));
  }
  one.strength = MEET.alive;
  assert.equal(word(sky, ring).word, 'go');
  // Ridden, it is not where to go next: the other one is judged.
  two.live = true;
  assert.equal(word(sky, ring, '', 1).target, 2);
  assert.equal(word(sky, { ...ring, r: 70 }, '', 1).word, 'climb');
  assert.equal(word(sky, { ...ring, r: 70 }, '', 2).word, 'go');
});

test('once said, the word holds until the flock is GLIDE.hold metres the other way, so a ring swung to and fro by a circle never flickers', () => {
  const sky = heldSky();
  sky.state.thermals[2].live = false;
  // Flock one is 65 m from the middle: the margin is the radius less 65.
  const at = (margin, was) => word(sky, { x: 125, z: 240, r: 65 + margin }, was).word;
  assert.equal(at(1, ''), 'go');
  assert.equal(at(-1, ''), 'climb');
  assert.equal(at(GLIDE.hold - 1, 'climb'), 'climb');
  assert.equal(at(GLIDE.hold + 1, 'climb'), 'go');
  assert.equal(at(1 - GLIDE.hold, 'go'), 'go');
  assert.equal(at(-1 - GLIDE.hold, 'go'), 'climb');
  assert.ok(GLIDE.hold >= 8, 'at least the light brake\'s circle, which swings the ring by its own size');
});

test('the ring\'s word said as a line fits one line of a narrow phone and is never one that cuts in on another', () => {
  for (const line of Object.values(GLIDE_LINES)) {
    assert.ok([...line].length <= HINT_WIDTH, `"${line}" is ${[...line].length} characters`);
    assert.ok(!URGENT.some((start) => line.startsWith(start)), line);
  }
  assert.match(GLIDE_LINES.go, /cyan/);
  assert.match(GLIDE_LINES.climb, /amber.*climb first/);
});

// A view, begun, over a sky held at `at` seconds, with the pilot `gap` metres over the fog at `place`.
function scene({ at = 120, gap = 200, place = { x: CLOUD_ZONE.x, z: CLOUD_ZONE.z }, seed = 6 } = {}) {
  const sky = skyAt(seed, at, undefined);
  const view = createGlideRing({ scene: new THREE.Scene() });
  view.begin();
  const pos = new THREE.Vector3(place.x, sky.state.fogHeight + gap, place.z);
  return { sky, view, pos, band: () => view.root.getObjectByName('glide-ring') };
}

test('nothing is built before a run; begin builds once, reset hides it, and dispose releases its shape and material exactly once', () => {
  const host = new THREE.Scene();
  const view = createGlideRing({ scene: host });
  assert.equal(view.root, null);
  view.update(1, new THREE.Vector3(), skyAt(1, 0), 0);
  view.begin();
  const { root } = view;
  view.begin();
  assert.equal(view.root, root, 'a second run reuses the same band');
  assert.equal(host.children.filter((child) => child.name === 'GlideRing').length, 1);
  view.reset();
  assert.equal(root.visible, false);
  assert.equal(view.state.shown, false);
  const band = root.getObjectByName('glide-ring');
  let released = 0;
  band.geometry.addEventListener('dispose', () => (released += 1));
  band.material.addEventListener('dispose', () => (released += 1));
  view.dispose();
  view.dispose();
  assert.equal(released, 2);
  assert.equal(host.children.length, 0);
  view.begin();
  assert.equal(view.root, null, 'nothing comes back after dispose');
});

test('the ring is one open band, named, see-through and drawn after the fog without writing depth, only where the fog lies under it', () => {
  const { view, band } = scene();
  const ring = band();
  assert.ok(ring.isMesh);
  assert.equal(ring.geometry.type, 'CylinderGeometry');
  assert.deepEqual([ring.geometry.parameters.radialSegments, ring.geometry.parameters.openEnded], [GLIDE.segments, true]);
  assert.equal(ring.renderOrder, ORDER.aboveFog);
  assert.deepEqual([ring.material.transparent, ring.material.depthWrite, ring.material.fog, ring.material.side], [true, false, false, THREE.DoubleSide]);
  // Masked to the fog's own disc, and to its fading rim.
  assert.match(ring.material.fragmentShader, new RegExp(`smoothstep\\(${FOG_SURFACE.edge.toFixed(2)}, 1\\.0, length\\(ground - zone\\) / ${FOG_SURFACE.radius.toFixed(2)}\\)`));
  assert.deepEqual(ring.material.uniforms.zone.value.toArray(), [CLOUD_ZONE.x, CLOUD_ZONE.z]);
  view.dispose();
});

test('the band is drawn where the glide meets the fog, as wide as the ring, cyan and whole for go, amber and broken into dashes for climb first', () => {
  const { sky, view, pos, band } = scene({ at: 125, gap: 160 });
  const ring = band();
  const wind = breezeAt(sky.state, pos.y, {});
  const expected = glideRing(sky, pos, wind, {});
  const [, one, two] = sky.state.thermals;
  // One flock well inside the ring, one far off; the pilot in neither.
  Object.assign(one, { x: expected.x + 10, z: expected.z, live: true, move: 0, strength: 1 });
  Object.assign(two, { x: pos.x - 600, z: pos.z, live: true, move: 0, strength: 1 });
  sky.state.pilot.thermal = -1;
  for (let i = 0; i < 90; i++) view.update(1 / 60, pos, sky, 0);
  const { state } = view;
  assert.equal(state.shown, true);
  assert.equal(state.word, 'go');
  assert.equal(state.target, 1);
  assert.equal(ring.visible, true);
  for (const [axis, value] of [['x', expected.x], ['y', expected.y], ['z', expected.z]]) close(ring.position[axis], value, 1e-6);
  close(ring.scale.x, expected.r, 1e-6);
  close(ring.scale.z, expected.r, 1e-6);
  close(ring.scale.y, GLIDE.tall + GLIDE.grow * expected.r, 1e-6);
  assert.ok(ring.position.y < pos.y && pos.y - ring.position.y < 0.15 * expected.r, 'a few degrees under the pilot\'s level, where the camera looks');
  const { colour, broken, opacity } = ring.material.uniforms;
  assert.equal(colour.value.getHex(), GLIDE.go);
  assert.equal(broken.value, 0);
  close(opacity.value, GLIDE.opacity[0], 0.01);
  // The near flock goes: nothing is in reach, and the band turns amber and breaks up, soon but not at once.
  one.live = false;
  view.update(1 / 60, pos, sky, 0);
  assert.equal(state.word, 'climb');
  assert.ok(broken.value > 0 && broken.value < 1, 'turning');
  for (let i = 0; i < 240; i++) view.update(1 / 60, pos, sky, 0);
  assert.equal(colour.value.getHex(), GLIDE.climb);
  close(broken.value, 1, 1e-6);
  assert.match(ring.material.fragmentShader, new RegExp(`fract\\(around\\.x \\* ${GLIDE.dashes.toFixed(1)}\\)`));
  view.dispose();
});

test('out of lift the ring is drawn in full and offers its word as a line; climbing in lift it is faint and says nothing, easing between the two', () => {
  const { sky, view, pos, band } = scene({ at: 125, gap: 160 });
  const settle = (lift, frames = 120) => {
    for (let i = 0; i < frames; i++) view.update(1 / 60, pos, sky, lift);
  };
  settle(0);
  const { uniforms } = band().material;
  close(uniforms.opacity.value, GLIDE.opacity[0], 0.01);
  assert.equal(view.state.line, GLIDE_LINES[view.state.word]);
  settle(GLIDE.lift[1] + 5);
  close(uniforms.opacity.value, GLIDE.opacity[1], 0.01);
  assert.equal(view.state.shown, true, 'faint, but there');
  assert.equal(view.state.line, '');
  // Halfway between, it eases there rather than jumping.
  view.update(1 / 60, pos, sky, 0);
  const step = uniforms.opacity.value - GLIDE.opacity[1];
  assert.ok(step > 0 && step < 0.1 * (GLIDE.opacity[0] - GLIDE.opacity[1]));
  view.dispose();
});

test('the ring is not drawn while all the fog is within reach, nor when none of it is, nor once smaller than a wingspan or two, nor after the run', () => {
  const settle = ({ view, pos, sky }, frames = 120) => {
    for (let i = 0; i < frames; i++) view.update(1 / 60, pos, sky, 0);
    return view.state.shown;
  };
  // High over a slow fog: every bit of it is within reach.
  const high = scene({ at: 40, gap: 400 });
  assert.equal(settle(high), false);
  assert.ok(high.view.state.r - Math.hypot(high.view.state.x - CLOUD_ZONE.x, high.view.state.z - CLOUD_ZONE.z) > FOG_SURFACE.radius * (1 + FOG_SURFACE.edge) / 2);
  // Far outside the zone with only a little glide left: none of the fog is.
  const away = scene({ at: 125, gap: 60, place: { x: CLOUD_ZONE.x + 400, z: CLOUD_ZONE.z } });
  assert.equal(settle(away), false);
  // Just over where the fog takes the wing: there is nowhere left to go.
  const last = scene({ at: 125, gap: GLIDE.catch + 0.2 });
  assert.equal(settle(last), false);
  assert.ok(last.view.state.r < GLIDE.least);
  // Shown, then the run ends.
  const shown = scene({ at: 125, gap: 160 });
  assert.equal(settle(shown), true);
  shown.view.reset();
  assert.equal(shown.view.root.visible, false);
  assert.equal(shown.view.state.shown, false);
  assert.equal(shown.view.state.line, '');
  // The next run opens with nothing showing until the ring is wanted again.
  shown.view.begin();
  assert.equal(shown.band().visible, false);
  assert.deepEqual([shown.view.state.word, shown.view.state.opacity], ['', 0]);
  for (const each of [high, away, last, shown]) each.view.dispose();
});

test('the first frame of the first run draws the band with nothing in it, so its shader is built before the ring is wanted, and never again', () => {
  const { sky, view, pos, band } = scene({ at: 40, gap: 400 });
  view.update(1 / 60, pos, sky, 0);
  assert.equal(view.state.shown, false);
  assert.equal(band().visible, true, 'drawn');
  assert.equal(band().material.uniforms.opacity.value, 0, 'with every pixel of it thrown away');
  assert.equal(band().frustumCulled, false, 'and never left out for being somewhere off the screen');
  view.update(1 / 60, pos, sky, 0);
  assert.equal(band().visible, false);
  view.begin();
  view.update(1 / 60, pos, sky, 0);
  assert.equal(band().visible, false, 'once is enough');
  view.dispose();
});

test('the flock being ridden is left out of the word while the pilot circles in and out of its edge, and counts again once they have left it', () => {
  const { sky, view, pos } = scene({ at: 60, gap: 60 });
  const [, one, two] = sky.state.thermals;
  Object.assign(one, { x: pos.x + 20, z: pos.z, live: true, move: 0, strength: 1 });
  two.live = false;
  sky.state.pilot.thermal = 1;
  view.update(1 / 60, pos, sky, 10);
  assert.deepEqual([view.state.word, view.state.target], ['climb', -1], 'climbing in it, there is nowhere else to go');
  // Out past its edge for most of a circle: still the one being ridden.
  sky.state.pilot.thermal = -1;
  sky.state.elapsed += GLIDE.leave - 1;
  view.update(1 / 60, pos, sky, 0);
  assert.equal(view.state.word, 'climb');
  // Gone from it for longer than any circle takes: it is lift within reach like any other.
  sky.state.elapsed += 2;
  view.update(1 / 60, pos, sky, 0);
  assert.deepEqual([view.state.word, view.state.target], ['go', 1]);
  view.dispose();
});

// How many arrays and buffers a call makes by any constructor or array method (a literal is not
// seen): each is swapped for a counting stand-in while `draw` runs, and put back after.
const TYPED = Object.getPrototypeOf(Int8Array);
const MAKERS = [
  [globalThis, ['Array', 'ArrayBuffer', 'Float32Array', 'Float64Array', 'Uint8Array', 'Uint16Array', 'Uint32Array', 'Int32Array']],
  [Array, ['from', 'of']],
  [TYPED, ['from', 'of']],
  [Object, ['keys', 'values', 'entries']],
  [Array.prototype, ['concat', 'filter', 'flat', 'flatMap', 'map', 'slice', 'splice']],
  [TYPED.prototype, ['filter', 'map', 'slice', 'subarray']],
];
function arraysMadeBy(draw) {
  let made = 0;
  const count = {
    apply(target, self, args) { made += 1; return Reflect.apply(target, self, args); },
    construct(target, args, newTarget) { made += 1; return Reflect.construct(target, args, newTarget); },
  };
  const swapped = [];
  try {
    for (const [owner, names] of MAKERS) {
      for (const name of names) {
        const real = Object.getOwnPropertyDescriptor(owner, name);
        if (typeof real?.value !== 'function') continue;
        Object.defineProperty(owner, name, { ...real, value: new Proxy(real.value, count) });
        swapped.push([owner, name, real]);
      }
    }
    draw();
  } finally {
    for (const [owner, name, real] of swapped) Object.defineProperty(owner, name, real);
  }
  return made;
}

test('drawing the ring makes no arrays and never swaps its shape, frame after frame', () => {
  assert.ok(arraysMadeBy(() => new Float32Array(1)) > 0, 'the counter sees what it should');
  const { sky, view, pos, band } = scene({ at: 118, gap: 260 });
  const { geometry, material } = band();
  let made = 0;
  for (let n = 0; n < 600; n++) {
    sky.step(STEP, pos);
    pos.y -= 0.05;
    made += arraysMadeBy(() => view.update(STEP, pos, sky, n % 200 < 100 ? 0 : 8));
  }
  assert.ok(view.state.shown, 'and it was drawing all the while');
  assert.equal(made, 0, `${made} arrays were made while drawing`);
  assert.equal(band().geometry, geometry);
  assert.equal(band().material, material);
  assert.equal(geometry.attributes.position.version, 0, 'the band is moved and sized, never rewritten');
  view.dispose();
});

test('a whole run drawn frame by frame never puts a number astray, and the ring has come up before the fog takes the pilot', () => {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun() }), 21);
  const view = createGlideRing({ scene: new THREE.Scene() });
  view.begin();
  const flyer = createReferencePilot({ brake: 'eased' });
  const intent = { turn: 0, brake: false, bar: false };
  let ended = null;
  let shown = 0;
  let last = 0;
  while (!ended) {
    flyer.decide(world, intent);
    ended = stepRun(world, intent);
    const { elapsed } = world.sky.state;
    view.update(elapsed - last, world.g.pos, world.sky, world.g.lift);
    last = elapsed;
    const ring = view.root.getObjectByName('glide-ring');
    for (const value of [ring.position.x, ring.position.y, ring.position.z, ring.scale.x, ring.scale.y, view.state.opacity, view.state.broken]) {
      assert.ok(Number.isFinite(value), `a number astray at ${elapsed.toFixed(2)} s`);
    }
    if (view.state.shown) shown += 1;
  }
  assert.ok(['fog', 'landed'].includes(ended));
  assert.ok(shown > 60, `the ring was up for ${shown} frames`);
  assert.equal(CLOUD_POOL.thermals, world.sky.state.thermals.length);
  view.dispose();
});
