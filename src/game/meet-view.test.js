import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BELL_LOOK, LINES, PLATE, createMeetView } from './meet-view.js';
import { CLOUD_MILESTONES, CLOUD_STRIKE, CLOUD_ZONE, createCloudbaseRun } from './cloudbase-state.js';
import { ORDER } from './cloudbase.js';
import { RAVEN } from './ravens.js';
import { MEET_POOL, createMeet } from './meet-state.js';
import { BELLS, BELL_POOL, createBells } from './bells.js';
import { createRunWorld, startRun, stepRun } from './run-step.js';
import { createReferencePilot } from './pilots.js';
import { createTestLoader } from './test-models.js';

// States in the shapes the meet and the bells keep, filled by hand.
function quietMeet() {
  return {
    next: 250, count: 0,
    trail: { plates: Array.from({ length: MEET_POOL.plates }, () => ({ x: 0, y: 0, z: 0, kg: 5, live: false })) },
    lifts: Array.from({ length: MEET_POOL.lifts }, () => ({ line: 0, kg: 0, red: 0, good: false, double: false, at: 0 })),
  };
}
function quietBells() {
  return {
    warning: -1,
    bells: Array.from({ length: BELL_POOL }, () => ({
      phase: 0, at: 0, fromX: 0, fromY: 0, fromZ: 0, aimX: 0, aimY: 0, aimZ: 0, x: 0, y: 0, z: 0, kg: BELLS.kg[0], near: Infinity, result: 0, circling: false,
    })),
  };
}
const pilot = new THREE.Vector3(CLOUD_ZONE.x, 400, CLOUD_ZONE.z);
const eye = new THREE.Vector3(CLOUD_ZONE.x, 404, CLOUD_ZONE.z + 12);
const named = (view, name) => view.root.getObjectByName(name);

test('with no loader the view builds once on begin, hides on reset and releases everything it made exactly once', () => {
  const scene = new THREE.Scene();
  const view = createMeetView({ scene });
  assert.equal(view.root, null, 'nothing is built before a run');
  view.begin();
  const root = view.root;
  view.begin();
  assert.equal(view.root, root, 'a second run reuses the same parts');
  assert.equal(scene.children.filter((child) => child.name === 'GoodLift').length, 1);
  view.reset();
  assert.equal(root.visible, false);
  const released = new Map();
  root.traverse((part) => {
    for (const owned of [part.geometry, part.material].filter(Boolean)) {
      if (released.has(owned)) continue;
      released.set(owned, 0);
      owned.addEventListener('dispose', () => released.set(owned, released.get(owned) + 1));
    }
  });
  view.dispose();
  view.dispose();
  assert.ok(released.size > 10);
  assert.deepEqual([...released.values()].filter((count) => count !== 1), [], 'every part is released once');
  assert.equal(scene.children.length, 0);
});

test('the pieces are named for what they are, and every ring is drawn after the fog', () => {
  const view = createMeetView({ scene: new THREE.Scene() });
  view.begin();
  for (let i = 0; i < MEET_POOL.plates; i++) assert.ok(named(view, `plate-${i}`), `plate-${i}`);
  for (let i = 0; i < BELL_POOL; i++) for (const part of ['bell', 'aim', 'closing', 'embers']) assert.ok(named(view, `${part}-${i}`), `${part}-${i}`);
  for (const name of ['line-next', 'line-judged']) assert.ok(named(view, name), name);
  view.root.traverse((part) => {
    if (part.isLine) assert.equal(part.renderOrder, ORDER.aboveFog, `${part.name} is drawn after the fog`);
  });
  view.dispose();
});

test('a plate shows only while it is live, where the meet put it, facing the camera, its rim coloured by its weight up close and silver from afar', () => {
  const view = createMeetView({ scene: new THREE.Scene() });
  view.begin();
  const meet = quietMeet();
  meet.trail.plates[2] = { x: pilot.x + 10, y: pilot.y - 1.5, z: pilot.z, kg: 25, live: true };
  meet.trail.plates[4] = { x: pilot.x + 80, y: pilot.y - 9, z: pilot.z, kg: 20, live: true };
  view.update(10, pilot, meet, quietBells(), eye);
  const shown = [...Array(MEET_POOL.plates).keys()].filter((i) => named(view, `plate-${i}`).visible);
  assert.deepEqual(shown, [2, 4]);
  const near = named(view, 'plate-2');
  assert.deepEqual(near.position.toArray(), [pilot.x + 10, pilot.y - 1.5, pilot.z]);
  // Its face looks along its own z, turned (but for its sway) toward the eye.
  const facing = Math.atan2(eye.x - near.position.x, eye.z - near.position.z);
  assert.ok(Math.abs(near.rotation.y - facing) <= PLATE.sway + 1e-9);
  const rim = (holder) => holder.children[1].material.color.getHex();
  assert.equal(rim(near), PLATE.colours[25], 'within 18 m the rim is the plate\'s colour');
  assert.equal(rim(named(view, 'plate-4')), PLATE.face, 'beyond 40 m it is silver');
  // Loaded: the plate goes, and a ring spreads where it was.
  meet.trail.plates[2].live = false;
  view.update(10.1, pilot, meet, quietBells(), eye);
  assert.equal(near.visible, false);
  const pop = named(view, 'pop-2');
  assert.equal(pop.visible, true);
  assert.equal(pop.material.color.getHex(), PLATE.colours[25]);
  view.update(10.1 + PLATE.popFor, pilot, meet, quietBells(), eye);
  assert.equal(pop.visible, false, 'and is gone in a moment');
  // One that runs out far from the pilot just goes.
  meet.trail.plates[4].live = false;
  view.update(11, pilot, meet, quietBells(), eye);
  assert.equal(named(view, 'pop-4').visible, false);
  view.dispose();
});

test('the next line rides at the meet\'s next height inside the milestone rings, and a judged line flashes white or red and is gone in 1.2 s', () => {
  const view = createMeetView({ scene: new THREE.Scene() });
  view.begin();
  const meet = quietMeet();
  meet.next = 500;
  view.update(1, pilot, meet, quietBells(), eye);
  const next = named(view, 'line-next');
  assert.deepEqual(next.position.toArray(), [CLOUD_ZONE.x, 500, CLOUD_ZONE.z]);
  const radius = Math.hypot(...next.geometry.attributes.position.array.slice(0, 3));
  assert.ok(Math.abs(radius - (CLOUD_ZONE.r - LINES.inset)) < 1e-6 && CLOUD_MILESTONES.includes(500), 'never on top of a milestone ring');
  const judged = named(view, 'line-judged');
  assert.equal(judged.visible, false);
  meet.count = 1;
  Object.assign(meet.lifts[0], { line: 250, kg: 47.5, red: 0b100, good: true, double: false, at: 20 });
  view.update(20, pilot, meet, quietBells(), eye);
  assert.equal(judged.visible, true);
  assert.equal(judged.position.y, 250);
  assert.equal(judged.material.color.getHex(), LINES.good);
  view.update(20 + LINES.flash + 0.01, pilot, meet, quietBells(), eye);
  assert.equal(judged.visible, false);
  meet.count = 2;
  Object.assign(meet.lifts[1], { line: 500, kg: 25, red: 0b011, good: false, double: false, at: 40 });
  view.update(40, pilot, meet, quietBells(), eye);
  const red = new THREE.Color(RAVEN.threat).multiplyScalar(RAVEN.flare);
  assert.ok(judged.visible && judged.material.color.equals(red), 'a no lift flashes the judges\' red');
  // The bar judged as the run ends has no line in the sky.
  meet.count = 3;
  Object.assign(meet.lifts[2], { line: 0, kg: 30, red: 0, good: true, double: false, at: 60 });
  view.update(60, pilot, meet, quietBells(), eye);
  assert.equal(judged.visible, false);
  view.dispose();
});

test('a kettlebell shows only while thrown, sized by its weight, and its ring is strike-sized at chest height and only while it is still coming', () => {
  const view = createMeetView({ scene: new THREE.Scene() });
  view.begin();
  const bells = quietBells();
  const aim = { aimX: pilot.x + 30, aimY: 600, aimZ: pilot.z - 20 };
  Object.assign(bells.bells[1], aim, {
    phase: 1, at: 50, fromX: aim.aimX - 26, fromY: aim.aimY + BELLS.drop, fromZ: aim.aimZ, kg: BELLS.kg[2], result: 0,
  });
  bells.bells[1].x = (bells.bells[1].fromX + aim.aimX) / 2;
  bells.bells[1].y = (bells.bells[1].fromY + aim.aimY) / 2;
  bells.bells[1].z = aim.aimZ;
  bells.warning = 1;
  view.update(50 + BELLS.lead / 2, pilot, quietMeet(), bells, eye);
  assert.equal(named(view, 'bell-0').visible, false);
  const bell = named(view, 'bell-1');
  assert.equal(bell.visible, true);
  assert.deepEqual(bell.position.toArray(), [bells.bells[1].x, bells.bells[1].y, bells.bells[1].z]);
  assert.equal(bell.scale.x, BELL_LOOK.size[2]);
  const ring = named(view, 'aim-1');
  assert.equal(ring.visible, true);
  assert.deepEqual(ring.position.toArray(), [aim.aimX, aim.aimY + CLOUD_STRIKE.rise, aim.aimZ]);
  assert.ok(Math.abs(Math.hypot(...ring.geometry.attributes.position.array.slice(0, 3)) - CLOUD_STRIKE.radius) < 1e-6);
  const closing = named(view, 'closing-1');
  assert.ok(closing.scale.x > 1.9 && closing.scale.x < 2.1, 'half way down, the closing ring is half way in');
  // The embers lie back up the way it came, and never past where it was thrown from.
  const places = named(view, 'embers-1').geometry.attributes.position.array;
  for (let k = 0; k < BELL_LOOK.trail; k++) assert.ok(places[k * 3 + 1] >= bells.bells[1].y - 1e-9 && places[k * 3 + 1] <= bells.bells[1].fromY + 1e-9);
  // Just thrown, every ember is where it was thrown from: none trails back past that.
  Object.assign(bells.bells[1], { x: bells.bells[1].fromX, y: bells.bells[1].fromY, z: bells.bells[1].fromZ });
  view.update(50, pilot, quietMeet(), bells, eye);
  const fresh = named(view, 'embers-1').geometry.attributes.position.array;
  for (let k = 0; k < BELL_LOOK.trail; k++) {
    assert.deepEqual([fresh[k * 3], fresh[k * 3 + 1], fresh[k * 3 + 2]], [bells.bells[1].fromX, bells.bells[1].fromY, bells.bells[1].fromZ]);
  }
  bells.bells[1].x = (bells.bells[1].fromX + aim.aimX) / 2;
  bells.bells[1].y = (bells.bells[1].fromY + aim.aimY) / 2;
  bells.bells[1].z = aim.aimZ;
  // Decided (a hit, a close call or a dodge): the ring goes, the bell falls on out of sight.
  Object.assign(bells.bells[1], { phase: 2, result: 3 });
  view.update(50 + BELLS.lead + 0.5, pilot, quietMeet(), bells, eye);
  assert.equal(ring.visible, false);
  assert.equal(bell.visible, true);
  bells.bells[1].phase = 0;
  view.update(50 + BELLS.lead + BELLS.fall, pilot, quietMeet(), bells, eye);
  assert.equal(bell.visible, false);
  view.dispose();
});

test('a new run opens with nothing of the last one showing: no plate, ring, bell or embers, and no pop for a plate gone between runs', () => {
  const view = createMeetView({ scene: new THREE.Scene() });
  view.begin();
  const meet = quietMeet();
  meet.trail.plates[0] = { x: pilot.x + 3, y: pilot.y, z: pilot.z, kg: 10, live: true };
  const bells = quietBells();
  Object.assign(bells.bells[0], { phase: 1, at: 1, fromX: pilot.x, fromY: pilot.y + 96, fromZ: pilot.z, aimX: pilot.x, aimY: pilot.y, aimZ: pilot.z, x: pilot.x, y: pilot.y + 50, z: pilot.z });
  meet.count = 1;
  Object.assign(meet.lifts[0], { line: 250, kg: 25, red: 0, good: true, double: false, at: 1 });
  view.update(1.2, pilot, meet, bells, eye);
  assert.ok(named(view, 'plate-0').visible && named(view, 'bell-0').visible && named(view, 'line-judged').visible);
  view.begin();
  const shown = [];
  view.root.traverse((part) => { if (part !== view.root && /^(plate|pop|bell|embers|aim|line-judged)/.test(part.name) && part.visible) shown.push(part.name); });
  assert.deepEqual(shown, []);
  // The next run's first update starts from nothing: the plate that was up is not a pickup.
  view.update(0, pilot, quietMeet(), quietBells(), eye);
  assert.equal(named(view, 'pop-0').visible, false);
  view.dispose();
});

test('loaded kettlebells replace the stand-ins in an ember copy of the file\'s material, and dispose releases the view\'s own parts but nothing of the loader\'s', async () => {
  const loader = createTestLoader({ maps: true });
  const view = createMeetView({ scene: new THREE.Scene(), loadModel: loader.loadModel });
  await view.begin();
  assert.equal(view.loaded.kettlebell, true);
  assert.deepEqual(loader.calls.map(([name]) => name), Array(BELL_POOL).fill('kettlebell'));
  const owned = await loader.owned();
  const bells = [0, 1].map((i) => named(view, `bell-${i}`));
  const meshes = bells.flatMap((bell) => { const found = []; bell.traverse((part) => part.isMesh && found.push(part)); return found; });
  assert.ok(meshes.length >= BELL_POOL);
  for (const mesh of meshes) {
    assert.ok(owned.geometries.has(mesh.geometry), 'the shape is the loader\'s, shared');
    assert.ok(!owned.materials.has(mesh.material), 'the material is the view\'s own copy');
    assert.equal(mesh.material.emissive.getHex(), BELL_LOOK.ember);
  }
  // The file's own material, which the forge's kettlebell wears, is left as it was.
  for (const material of owned.materials) assert.notEqual(material.emissive.getHex(), BELL_LOOK.ember);
  let theirs = 0;
  for (const thing of [...owned.geometries, ...owned.materials, ...owned.textures]) thing.addEventListener('dispose', () => (theirs += 1));
  view.dispose();
  assert.equal(theirs, 0, 'nothing of the loader\'s is released');
});

test('a whole run with the meet and the bells can be drawn frame by frame without a number going astray', () => {
  const view = createMeetView({ scene: new THREE.Scene() });
  const meet = createMeet();
  const bells = createBells();
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet, bells }), 7);
  view.begin();
  const flyer = createReferencePilot({ brake: 'eased' });
  const intent = { turn: 0, brake: false, bar: false };
  const camera = new THREE.Vector3();
  let ended = null;
  let frames = 0;
  let shown = { plates: 0, bells: 0 };
  while (!ended && world.sky.state.elapsed < 200) {
    flyer.decide(world, intent);
    ended = stepRun(world, intent);
    if (world.steps % 4) continue;
    camera.set(world.g.pos.x - Math.sin(world.g.yaw) * 12, world.g.pos.y + 4, world.g.pos.z + Math.cos(world.g.yaw) * 12);
    view.update(world.sky.state.elapsed, world.g.pos, meet, bells, camera);
    view.root.updateMatrixWorld(true);
    view.root.traverse((part) => {
      assert.ok(part.matrixWorld.elements.every(Number.isFinite), `${part.name} has a finite place`);
      if (part.visible && /^plate-/.test(part.name)) shown.plates += 1;
      if (part.visible && /^bell-/.test(part.name)) shown.bells += 1;
    });
    frames += 1;
  }
  assert.ok(frames > 1000);
  assert.ok(shown.bells > 0, 'kettlebells were drawn');
  view.dispose();
});
