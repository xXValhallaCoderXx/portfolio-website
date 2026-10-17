import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LIGHTNING, createLightning, flashAt, glowAt, layBolt, revealAt, ribbon } from './run-lightning.js';
import { CLOUD_STORM, CLOUD_ZONE, createCloudbaseRun } from './cloudbase-state.js';
import { ORDER, createCloudbase } from './cloudbase.js';
import { createGlideRing } from './run-glide.js';
import { createMeet } from './meet-state.js';
import { createBells } from './bells.js';
import { createRunWorld, startRun, stepRun } from './run-step.js';
import { createReferencePilot } from './pilots.js';

const FRAME = 1 / 60;
const MAIN = (1 << LIGHTNING.levels) + 1;
const FORK = (1 << LIGHTNING.forkLevels) + 1;
const close = (actual, expected, slack) => assert.ok(Math.abs(actual - expected) <= slack, `${actual} is within ${slack} of ${expected}`);
// Random numbers from 0 to 1 that come out the same on every run of the tests.
const dice = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// A sky with every storm cloud cleared away and the fog at 300 m, the pilot at 900 m over the zone's
// middle facing north, and the chase camera behind and above them. One cloud fit to strike from is
// parked ahead, up and well in view: 238 m off over the ground, with 680 m of room under it.
function stormy() {
  const sky = createCloudbaseRun();
  sky.reset(80, 1);
  for (const cloud of sky.state.clouds) cloud.fade = 0;
  sky.state.fogHeight = 300;
  park(sky, 0, { x: CLOUD_ZONE.x, y: 1000, z: CLOUD_ZONE.z - 238 });
  const pos = new THREE.Vector3(CLOUD_ZONE.x, 900, CLOUD_ZONE.z);
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 5000);
  aim(camera, pos);
  return { sky, pos, camera };
}
const park = (sky, slot, place) => Object.assign(sky.state.clouds[slot], { rx: 40, ry: 20, rz: 30, turn: 0, fade: 1, ...place });
// The chase camera of a pilot facing north: 26 m behind and 9.5 m above, looking just ahead.
function aim(camera, pos) {
  camera.position.set(pos.x, pos.y + 9.5, pos.z + 26);
  camera.lookAt(pos.x, pos.y + 3, pos.z - 14);
  camera.updateMatrixWorld();
}
const named = (lightning, name) => lightning.root.getObjectByName(name);
// Drives `lightning` frame by frame from run time `from` for `seconds`, and lists the strikes: when,
// and from which cloud.
function fly(lightning, { sky, pos, camera }, from, seconds, seen = null) {
  const struck = [];
  for (let n = 1; n <= Math.round(seconds / FRAME); n++) {
    const time = from + n * FRAME;
    const before = lightning.state.strikes;
    lightning.update(time, pos, sky, camera, seen);
    if (lightning.state.strikes > before) struck.push({ at: time, slot: lightning.state.slot });
  }
  return struck;
}

test('nothing is built before a run; begin builds once, reset hides it, and dispose releases its shapes and materials exactly once', () => {
  const host = new THREE.Scene();
  const lightning = createLightning({ scene: host });
  assert.equal(lightning.root, null);
  const { sky, pos, camera } = stormy();
  lightning.update(1, pos, sky, camera);
  assert.equal(lightning.fire(), -1, 'nothing to strike with before a run');
  lightning.begin();
  const { root } = lightning;
  lightning.begin();
  assert.equal(lightning.root, root, 'a second run reuses the same bolt');
  assert.equal(host.children.filter((child) => child.name === 'Lightning').length, 1);
  lightning.reset();
  assert.equal(root.visible, false);
  const counts = new Map();
  root.traverse((part) => {
    for (const owned of [part.geometry, part.material].filter(Boolean)) {
      counts.set(owned, 0);
      owned.addEventListener('dispose', () => counts.set(owned, counts.get(owned) + 1));
    }
  });
  lightning.dispose();
  lightning.dispose();
  assert.equal(counts.size, 4);
  assert.deepEqual([...counts.values()], [1, 1, 1, 1]);
  assert.equal(host.children.length, 0);
  lightning.begin();
  assert.equal(lightning.root, null, 'nothing comes back after dispose');
});

test('the bolt and the sky\'s flash are named see-through light that writes no depth, the bolt drawn after the fog and the sky before all else see-through, both hidden until a strike', () => {
  const lightning = createLightning({ scene: new THREE.Scene() });
  lightning.begin();
  const bolt = named(lightning, 'bolt');
  const sky = named(lightning, 'sky-flash');
  for (const part of [bolt, sky]) {
    assert.ok(part.isMesh);
    assert.equal(part.visible, false);
    assert.deepEqual([part.material.transparent, part.material.depthWrite, part.material.fog, part.material.blending], [true, false, false, THREE.AdditiveBlending]);
    assert.equal(part.frustumCulled, false);
  }
  assert.equal(bolt.renderOrder, ORDER.aboveFog);
  assert.ok(sky.renderOrder < 0);
  assert.equal(sky.material.side, THREE.BackSide);
  assert.equal(sky.scale.x, LIGHTNING.dome);
  // A ribbon of triangles, two a piece of stroke, for the main stroke and the most forks a bolt has.
  assert.equal(bolt.geometry.index.count, 6 * (MAIN - 1 + LIGHTNING.forks[1] * (FORK - 1)));
  assert.equal(bolt.geometry.attributes.position.count, 2 * (MAIN + LIGHTNING.forks[1] * FORK));
  lightning.dispose();
});

test('a strike flashes, dips, strikes again and dies away within LIGHTNING.last: two flashes, and strikes far enough apart that no second ever holds three', () => {
  assert.equal(flashAt(0), 1);
  assert.equal(flashAt(-0.01), 0);
  assert.ok(flashAt(0.07) < 0.5, 'the dip');
  assert.ok(flashAt(0.12) > 0.8, 'the restrike');
  for (let t = 0.15; t < LIGHTNING.last - 0.01; t += 0.01) assert.ok(flashAt(t + 0.01) <= flashAt(t), `fading at ${t.toFixed(2)} s`);
  assert.ok(flashAt(LIGHTNING.last - 0.001) < 0.02, 'nearly gone at the end');
  assert.equal(flashAt(LIGHTNING.last), 0);
  assert.equal(flashAt(Infinity), 0);
  // A flash is the light coming up through a half from under it.
  let flashes = 0;
  for (let t = 0; t < 1; t += 0.001) if (flashAt(t) >= 0.5 && !(flashAt(t - 0.001) >= 0.5)) flashes += 1;
  assert.equal(flashes, 2);
  assert.ok(LIGHTNING.every[0] >= 1, 'a strike a second at most, so two flashes a second at most');
});

test('for a visitor who asks for less motion a strike is one soft swell that never passes 0.55, and the sky never flashes', () => {
  let peak = 0;
  let rising = true;
  for (let t = 0; t < LIGHTNING.last; t += 0.005) {
    const now = flashAt(t, true);
    const next = flashAt(t + 0.005, true);
    peak = Math.max(peak, now);
    if (next < now) rising = false;
    else assert.ok(rising || next === now, `one swell, rising again at ${t.toFixed(3)} s`);
  }
  assert.ok(peak > 0.3 && peak <= 0.55, `at most ${peak}`);
  const { sky, pos, camera } = stormy();
  const lightning = createLightning({ scene: new THREE.Scene(), calm: true, random: dice(4) });
  lightning.begin();
  lightning.update(1, pos, sky, camera);
  assert.equal(lightning.fire(), 0);
  let lit = 0;
  for (let n = 1; n < 60; n++) {
    lightning.update(1 + n * FRAME, pos, sky, camera);
    lit += named(lightning, 'bolt').visible ? 1 : 0;
    assert.equal(named(lightning, 'sky-flash').visible, false);
  }
  assert.ok(lit > 20, 'the bolt is still seen');
  lightning.dispose();
});

test('the struck cloud glows with the strike and fades more slowly; every hidden thermal shows for half a second and is gone by three quarters', () => {
  for (const calm of [false, true]) {
    for (let t = 0.15; t < LIGHTNING.last; t += 0.01) assert.ok(glowAt(t, calm) >= flashAt(t, calm) - 1e-9, `the cloud outlasts the bolt at ${t.toFixed(2)} s`);
    assert.equal(glowAt(LIGHTNING.last, calm), 0);
    assert.equal(glowAt(-1, calm), 0);
  }
  assert.equal(glowAt(0), 1);
  for (const t of [0, 0.1, 0.25, 0.49]) assert.equal(revealAt(t), 1);
  close(revealAt(LIGHTNING.reveal[0] + LIGHTNING.reveal[1] / 2), 0.5, 1e-9);
  assert.equal(revealAt(LIGHTNING.reveal[0] + LIGHTNING.reveal[1]), 0);
  assert.equal(revealAt(-0.1), 0);
  assert.equal(revealAt(Infinity), 0);
  assert.deepEqual(LIGHTNING.reveal, [0.5, 0.25]);
});

test('for a visitor who asks for less motion the glimpse of the lift comes up with the strike\'s one swell, never all at once, and goes as anyone\'s does', () => {
  // It comes up over the same time as the bolt and the cloud's glow, a frame's share at a time.
  assert.equal(revealAt(0, true), 0);
  let before = 0;
  for (let t = FRAME; t < LIGHTNING.swell; t += FRAME) {
    const now = revealAt(t, true);
    assert.ok(now > before && now - before <= FRAME / LIGHTNING.swell + 1e-9, `rising gently at ${t.toFixed(3)} s`);
    assert.ok(flashAt(t, true) > 0 && glowAt(t, true) > 0, 'with the strike');
    before = now;
  }
  // Once up, it is held and fades as anyone's does, and is gone by three quarters of a second.
  for (const t of [LIGHTNING.swell, 0.3, 0.49, 0.5, 0.6, 0.7, 0.75, 1]) close(revealAt(t, true), revealAt(t), 1e-9);
  assert.equal(revealAt(-0.1, true), 0);
  // So the sparks a calm visitor's strike reveals come up gently too.
  const { sky, pos, camera } = stormy();
  const lightning = createLightning({ scene: new THREE.Scene(), calm: true, random: dice(9) });
  lightning.begin();
  lightning.update(1, pos, sky, camera);
  assert.equal(lightning.fire(), 0);
  assert.equal(lightning.state.reveal, 0);
  lightning.update(1 + FRAME, pos, sky, camera);
  close(lightning.state.reveal, FRAME / LIGHTNING.swell, 1e-6);
  lightning.dispose();
});

test('a bolt runs down from where it leaves the cloud, jagged but unbroken, never into the fog, with its forks leaving the main stroke on the way', () => {
  const joints = new Float32Array((MAIN + LIGHTNING.forks[1] * FORK) * 3);
  const at = (i) => ({ x: joints[i * 3], y: joints[i * 3 + 1], z: joints[i * 3 + 2] });
  const seen = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const random = dice(seed);
    const drop = 150 + seed;
    const floor = seed % 4 ? 300 : 860;
    const forks = layBolt(100, 1000, 200, drop, floor, random, joints);
    seen.add(forks);
    assert.ok(forks >= LIGHTNING.forks[0] && forks <= LIGHTNING.forks[1]);
    assert.deepEqual([at(0).x, at(0).y, at(0).z], [100, 1000, 200]);
    const foot = at(MAIN - 1);
    close(foot.y, Math.max(1000 - drop, floor), 1e-3);
    assert.ok(Math.hypot(foot.x - 100, foot.z - 200) <= LIGHTNING.lean * drop + 1e-3, 'its foot leans aside no more than allowed');
    const used = MAIN + forks * FORK;
    for (let i = 0; i < used; i++) {
      const joint = at(i);
      assert.ok([joint.x, joint.y, joint.z].every(Number.isFinite), `seed ${seed}, joint ${i}`);
      assert.ok(joint.y >= floor - 1e-3, 'never into the fog');
    }
    // No piece of the main stroke is longer than half of it, nor any of a fork more than its length.
    for (let i = 1; i < MAIN; i++) assert.ok(Math.hypot(at(i).x - at(i - 1).x, at(i).y - at(i - 1).y, at(i).z - at(i - 1).z) < drop / 2);
    for (let f = 0; f < forks; f++) {
      const first = MAIN + f * FORK;
      // It leaves the main stroke at a joint of it, in its upper two thirds.
      const from = Array.from({ length: MAIN }, (_, i) => i).find((i) => at(i).x === at(first).x && at(i).y === at(first).y && at(i).z === at(first).z);
      assert.ok(from >= 2 && from <= MAIN - 5, `a fork leaves joint ${from}`);
      const tip = at(first + FORK - 1);
      assert.ok(tip.y < at(first).y || tip.y === floor, 'and runs down');
      const length = Math.hypot(tip.x - at(first).x, tip.y - at(first).y, tip.z - at(first).z);
      assert.ok(length <= LIGHTNING.fork[1] + 1e-3);
      for (let j = 1; j < FORK; j++) assert.ok(Math.hypot(at(first + j).x - at(first + j - 1).x, at(first + j).y - at(first + j - 1).y, at(first + j).z - at(first + j - 1).z) < LIGHTNING.fork[1]);
    }
    // Jagged: the main stroke strays from the straight line between its ends.
    let stray = 0;
    for (let i = 1; i < MAIN - 1; i++) {
      const share = (at(0).y - at(i).y) / (at(0).y - foot.y || 1);
      stray = Math.max(stray, Math.hypot(at(i).x - (100 + (foot.x - 100) * share), at(i).z - (200 + (foot.z - 200) * share)));
    }
    assert.ok(stray > 1, `the stroke wanders ${stray.toFixed(1)} m`);
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
});

test('the ribbon lies square to the stroke and to the line of sight, as wide as asked at the top, narrowing and cooling to its foot', () => {
  const count = 5;
  const joints = new Float32Array(count * 3);
  // A plain stroke falling 100 m, leaning a little east.
  for (let j = 0; j < count; j++) joints.set([10 + j * 3, 800 - j * 25, 50], j * 3);
  const place = new Float32Array(count * 6);
  const heat = new Float32Array(count * 2);
  const eye = new THREE.Vector3(30, 760, 400);
  ribbon(joints, 0, count, eye, 2, 0.8, place, heat);
  const side = new THREE.Vector3();
  const along = new THREE.Vector3(3, -25, 0).normalize();
  const look = new THREE.Vector3();
  for (let j = 0; j < count; j++) {
    const left = new THREE.Vector3().fromArray(place, j * 6);
    const right = new THREE.Vector3().fromArray(place, j * 6 + 3);
    const middle = left.clone().add(right).multiplyScalar(0.5);
    close(middle.distanceTo(new THREE.Vector3().fromArray(joints, j * 3)), 0, 1e-3);
    side.subVectors(right, left);
    look.subVectors(eye, middle).normalize();
    close(side.clone().normalize().dot(along), 0, 1e-4);
    close(side.clone().normalize().dot(look), 0, 1e-4);
    const cool = 1 + (LIGHTNING.taper - 1) * (j / (count - 1));
    close(side.length(), 2 * cool * LIGHTNING.halo, 1e-3);
    close(heat[j * 2], 0.8 * cool, 1e-6);
    assert.equal(heat[j * 2], heat[j * 2 + 1]);
  }
  // Seen straight down its length a stroke has no sides; it is still drawn, level.
  const straight = new Float32Array([0, 100, 0, 0, 50, 0, 0, 0, 0]);
  ribbon(straight, 0, 3, new THREE.Vector3(0, 300, 0), 1, 1, place, heat);
  assert.ok(place.slice(0, 18).every(Number.isFinite));
  close(Math.abs(place[3] - place[0]), LIGHTNING.halo, 1e-6);
});

test('nothing strikes until the pilot is above the first clouds; then a strike every 9 to 20 seconds spent up there, never while the pilot is in cloud', () => {
  const scene = stormy();
  const lightning = createLightning({ scene: new THREE.Scene(), random: dice(11) });
  lightning.begin();
  // A minute just under the floor: nothing, and the clock has not even started.
  scene.pos.y = CLOUD_STORM.floor - 1;
  aim(scene.camera, scene.pos);
  assert.deepEqual(fly(lightning, scene, 0, 60), []);
  assert.ok(Number.isNaN(lightning.state.wait));
  // Up among the clouds for three minutes.
  scene.pos.y = 900;
  aim(scene.camera, scene.pos);
  const struck = fly(lightning, scene, 60, 180);
  assert.ok(struck.length >= 180 / LIGHTNING.every[1] - 1 && struck.length <= 180 / LIGHTNING.every[0], `${struck.length} strikes`);
  assert.ok(struck[0].at - 60 >= LIGHTNING.every[0] && struck[0].at - 60 <= LIGHTNING.every[1] + FRAME);
  for (let i = 1; i < struck.length; i++) {
    const gap = struck[i].at - struck[i - 1].at;
    assert.ok(gap >= LIGHTNING.every[0] - FRAME && gap <= LIGHTNING.every[1] + FRAME, `${gap.toFixed(2)} s between strikes`);
  }
  assert.ok(struck.every((strike) => strike.slot === 0));
  // In cloud, the clock stops; out again, it runs on from where it was.
  const left = lightning.state.wait;
  scene.sky.state.pilot.cloud = 0.4;
  assert.deepEqual(fly(lightning, scene, 240, 60), []);
  assert.equal(lightning.state.wait, left);
  scene.sky.state.pilot.cloud = 0;
  // Time spent below the floor does not count either.
  scene.pos.y = CLOUD_STORM.floor - 50;
  assert.deepEqual(fly(lightning, scene, 300, 40), []);
  assert.equal(lightning.state.wait, left);
  scene.pos.y = 900;
  const next = fly(lightning, scene, 340, left + 1);
  assert.equal(next.length, 1);
  close(next[0].at - 340, left, FRAME + 1e-9);
  lightning.dispose();
});

test('a strike comes only from a cloud the pilot can see: grown, drawn whole, in range over the ground, in the camera\'s view and with room under it', () => {
  const scene = stormy();
  const { sky, pos } = scene;
  // The fog not far under the pilot, so that a cloud can be in view with too little room under it.
  sky.state.fogHeight = 720;
  const at = (x, y, z) => ({ x: pos.x + x, y, z: pos.z + z });
  park(sky, 1, { ...at(60, 1000, -230), fade: LIGHTNING.formed - 0.1 });
  park(sky, 2, at(0, 1000, -LIGHTNING.range[1] - 30));
  park(sky, 3, at(0, 905, -LIGHTNING.range[0] + 30));
  park(sky, 4, at(0, 1000, 240));
  park(sky, 5, at(-70, 1000, -220));
  park(sky, 6, at(70, 800, -220));
  // Slot 5 is in the camera's way, and so is drawn thinned.
  const seen = (slot) => slot !== 5;
  const slots = new Set();
  for (const seed of [1, 2, 3, 4, 5]) {
    const lightning = createLightning({ scene: new THREE.Scene(), random: dice(seed) });
    lightning.begin();
    for (const strike of fly(lightning, scene, 0, 120, seen)) slots.add(strike.slot);
    lightning.dispose();
  }
  assert.deepEqual([...slots], [0]);
  // Every one of the others is fit once what it lacked is put right.
  const fixes = {
    1: { fade: 1 }, 2: at(0, 1000, -LIGHTNING.range[1] + 30), 3: at(0, 905, -LIGHTNING.range[0] - 30), 4: at(0, 1000, -240),
    6: { y: 900 },
  };
  for (const [slot, fix] of Object.entries(fixes)) {
    sky.state.clouds[0].fade = 0;
    for (const other of Object.keys(fixes)) sky.state.clouds[other].fade = 0;
    park(sky, Number(slot), { ...sky.state.clouds[slot], ...fix, fade: 1 });
    const lightning = createLightning({ scene: new THREE.Scene(), random: dice(9) });
    lightning.begin();
    const struck = fly(lightning, scene, 0, 30, seen);
    assert.ok(struck.length > 0 && struck.every((strike) => strike.slot === Number(slot)), `cloud ${slot}, fixed, strikes`);
    lightning.dispose();
    sky.state.clouds[slot].fade = 0;
  }
  const lightning = createLightning({ scene: new THREE.Scene(), random: dice(9) });
  lightning.begin();
  sky.state.clouds[5].fade = 1;
  assert.deepEqual(fly(lightning, scene, 0, 30, () => true).map((strike) => strike.slot).filter((slot) => slot !== 5), [], 'drawn whole, it strikes too');
  lightning.dispose();
});

test('with no cloud fit to strike from it looks again soon, rather than waiting out a whole spell', () => {
  const scene = stormy();
  scene.sky.state.clouds[0].fade = 0;
  const lightning = createLightning({ scene: new THREE.Scene(), random: dice(3) });
  lightning.begin();
  assert.deepEqual(fly(lightning, scene, 0, 25), []);
  assert.ok(lightning.state.wait > 0 && lightning.state.wait <= LIGHTNING.retry);
  scene.sky.state.clouds[0].fade = 1;
  const struck = fly(lightning, scene, 25, LIGHTNING.retry + FRAME);
  assert.equal(struck.length, 1);
  lightning.dispose();
});

test('thunder comes as long after the strike as sound takes from the nearest part of the bolt, and is heard once', () => {
  const scene = stormy();
  const lightning = createLightning({ scene: new THREE.Scene(), random: dice(5) });
  lightning.begin();
  assert.equal(lightning.hear(1000), false, 'no strike, no thunder');
  const [strike] = fly(lightning, scene, 0, 25);
  const { state } = lightning;
  // The nearest of the bolt's joints, which are the middles of its ribbon.
  const { position } = named(lightning, 'bolt').geometry.attributes;
  const pairs = named(lightning, 'bolt').geometry.drawRange.count / 6 + 1 + state.forks;
  let near = Infinity;
  for (let v = 0; v < 2 * pairs; v += 2) {
    const x = (position.getX(v) + position.getX(v + 1)) / 2;
    const y = (position.getY(v) + position.getY(v + 1)) / 2;
    const z = (position.getZ(v) + position.getZ(v + 1)) / 2;
    near = Math.min(near, Math.hypot(x - scene.pos.x, y - scene.pos.y, z - scene.pos.z));
  }
  close(state.near, near, 0.01);
  assert.ok(state.near > LIGHTNING.range[0] / 2 && state.near < 2 * LIGHTNING.range[1]);
  close(state.thunder, strike.at + state.near / LIGHTNING.sound, 1e-9);
  assert.equal(lightning.hear(state.thunder - 0.01), false);
  assert.equal(lightning.hear(state.thunder + 0.001), true);
  assert.equal(lightning.hear(state.thunder + 1), false);
  // A run that ends lets any thunder still on its way go unheard.
  lightning.fire();
  lightning.reset();
  assert.equal(lightning.hear(10_000), false);
  lightning.dispose();
});

test('fire() strikes at once for a look, from the cloud asked for or else the best there is, even below the clouds, and starts the clock again', () => {
  const scene = stormy();
  park(scene.sky, 6, { x: CLOUD_ZONE.x + 80, y: 420, z: CLOUD_ZONE.z - 150 });
  const lightning = createLightning({ scene: new THREE.Scene(), random: dice(8) });
  lightning.begin();
  scene.pos.y = 450;
  lightning.update(3, scene.pos, scene.sky, scene.camera);
  assert.equal(lightning.fire(6), 6);
  assert.deepEqual([lightning.state.strikes, lightning.state.at, lightning.state.slot], [1, 3, 6]);
  assert.equal(named(lightning, 'bolt').visible, true, 'drawn at once');
  assert.ok(lightning.state.wait >= LIGHTNING.every[0] && lightning.state.wait <= LIGHTNING.every[1]);
  // A cloud not grown is not struck from; the one the clock would choose is.
  scene.sky.state.clouds[6].fade = 0.3;
  assert.equal(lightning.fire(6), 0);
  // With nothing in view (the camera still looks north from 900 m), any grown cloud with room under
  // it will do: here the only one is behind and far off.
  scene.sky.state.clouds[0].fade = 0;
  park(scene.sky, 9, { x: CLOUD_ZONE.x, y: 1000, z: CLOUD_ZONE.z + 600 });
  assert.equal(lightning.fire(), 9);
  for (const cloud of scene.sky.state.clouds) cloud.fade = 0;
  assert.equal(lightning.fire(), -1);
  assert.equal(lightning.state.strikes, 3);
  lightning.dispose();
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

test('a strike lights the bolt and the sky toward it for as long as it lasts; with none showing nothing is drawn, and drawing makes no arrays, strikes and all', () => {
  assert.ok(arraysMadeBy(() => new Float32Array(1)) > 0, 'the counter sees what it should');
  const scene = stormy();
  const lightning = createLightning({ scene: new THREE.Scene(), random: dice(2) });
  lightning.begin();
  const bolt = named(lightning, 'bolt');
  const sky = named(lightning, 'sky-flash');
  const { position } = bolt.geometry.attributes;
  let made = 0;
  let strikes = 0;
  let lit = 0;
  for (let n = 1; n <= 60 * 60; n++) {
    const time = n * FRAME;
    made += arraysMadeBy(() => lightning.update(time, scene.pos, scene.sky, scene.camera));
    // The first frame is the one that builds their shaders (see the test after this one).
    if (n === 1) continue;
    const age = time - lightning.state.at;
    assert.equal(bolt.visible, age < LIGHTNING.last);
    assert.equal(sky.visible, age < LIGHTNING.last);
    if (!bolt.visible) continue;
    lit += 1;
    if (age === 0) {
      strikes += 1;
      assert.ok(position.array.slice(0, 6 * (MAIN + lightning.state.forks * FORK)).every(Number.isFinite));
    }
    assert.equal(bolt.material.uniforms.flash.value, flashAt(age));
    close(sky.material.uniforms.flash.value, flashAt(age) * LIGHTNING.sky, 1e-12);
    assert.deepEqual(sky.position.toArray(), scene.camera.position.toArray());
    // Toward the bolt, which is up and ahead.
    const toward = sky.material.uniforms.toward.value;
    close(toward.length(), 1, 1e-6);
    assert.ok(toward.z < -0.5 && toward.y > 0, `the sky flashes toward ${toward.toArray().map((v) => v.toFixed(2))}`);
  }
  assert.equal(made, 0, `${made} arrays were made while drawing`);
  assert.ok(strikes >= 2, `${strikes} strikes in a minute`);
  assert.ok(lit < 0.15 * 60 * 60, 'lit only now and then');
  assert.equal(bolt.geometry.attributes.position.array, position.array, 'into the same buffers');
  lightning.dispose();
});

test('the first frame of the first run draws the bolt and the sky\'s flash with nothing in them, so their shaders are built before any strike, and never again', () => {
  for (const calm of [false, true]) {
    const scene = stormy();
    const lightning = createLightning({ scene: new THREE.Scene(), calm, random: dice(6) });
    lightning.begin();
    const bolt = named(lightning, 'bolt');
    const sky = named(lightning, 'sky-flash');
    lightning.update(0, scene.pos, scene.sky, scene.camera);
    assert.equal(bolt.visible, true);
    assert.equal(bolt.geometry.drawRange.count, 0, 'not one triangle of it');
    assert.equal(bolt.material.uniforms.flash.value, 0);
    assert.equal(sky.visible, !calm, 'the sky never flashes for a calm visitor, so is never built for one');
    assert.equal(sky.material.uniforms.flash.value, 0, 'and adds no light');
    lightning.update(FRAME, scene.pos, scene.sky, scene.camera);
    assert.deepEqual([bolt.visible, sky.visible], [false, false]);
    // A second run needs no second warming: the shaders are built for good.
    lightning.begin();
    lightning.update(0, scene.pos, scene.sky, scene.camera);
    assert.deepEqual([bolt.visible, sky.visible], [false, false]);
    lightning.dispose();
  }
});

test('nothing of it reaches the run: one flown with the lightning, the lit sky and the glide ring drawn every frame comes out exactly as one flown without', () => {
  const fly = (drawn) => {
    const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells() }), 17);
    const host = new THREE.Scene();
    const view = createCloudbase({ scene: host });
    const lightning = createLightning({ scene: host, random: dice(17) });
    const glide = createGlideRing({ scene: host });
    for (const part of [view, lightning, glide]) part.begin();
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 5000);
    const flyer = createReferencePilot({ brake: 'eased' });
    const intent = { turn: 0, brake: false, bar: false };
    let ended = null;
    let last = 0;
    let strikes = 0;
    while (!ended) {
      flyer.decide(world, intent);
      ended = stepRun(world, intent);
      if (!drawn) continue;
      const { g } = world;
      const { elapsed } = world.sky.state;
      camera.position.set(g.pos.x - 26 * Math.sin(g.yaw), g.pos.y + 9.5, g.pos.z + 26 * Math.cos(g.yaw));
      camera.lookAt(g.pos.x + 14 * Math.sin(g.yaw), g.pos.y + 3, g.pos.z - 14 * Math.cos(g.yaw));
      camera.updateMatrixWorld();
      // As good-lift.js draws a frame.
      lightning.update(elapsed, g.pos, world.sky, camera, view.shown);
      view.light(lightning.state.slot, lightning.state.glow);
      view.reveal(lightning.state.reveal);
      view.update(elapsed, g.pos, world.sky, camera.position);
      glide.update(elapsed - last, g.pos, world.sky, g.lift);
      lightning.hear(elapsed);
      if (world.steps % 600 === 0) lightning.fire();
      last = elapsed;
      strikes = lightning.state.strikes;
    }
    const copy = (value) => JSON.parse(JSON.stringify(value));
    return { ended, strikes, sky: copy(world.sky.state), meet: copy(world.meet.state), bells: copy(world.bells.state), g: copy(world.g), steps: world.steps };
  };
  const plain = fly(false);
  const drawn = fly(true);
  assert.ok(drawn.strikes >= 5, `${drawn.strikes} strikes on the way`);
  for (const part of ['ended', 'sky', 'meet', 'bells', 'g', 'steps']) assert.deepEqual(drawn[part], plain[part], part);
});
