import { namedFixture, renderFixture, type SceneFixture } from '../../../test/helpers/test-scene.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BELL_LOOK, GLANCE, LINES, LOOSE_LOOK, PLATE, createMeetView } from './meet-view.ts';
import { RUNE_STROKES, STONE_LOOK } from './meet-stones.ts';
import { BEAST_LOOK } from './meet-beast.ts';
import { CLOUD_MILESTONES, CLOUD_STRIKE, CLOUD_ZONE, createCloudbaseRun } from '../../../domains/good-lift/cloudbase-state.ts';
import { ORDER } from './cloudbase.ts';
import { RAVEN } from './ravens.ts';
import { MEET_POOL, PLATE_KIND, SCATTER, THUNDER, TRAIL, createMeet } from '../../../domains/good-lift/meet-state.ts';
import { BEAST, BELLS, BELL_POOL, BELL_RESULT, createBells } from '../../../domains/good-lift/bells.ts';
import { BLESSING, GATE, GATES, RUNE } from '../../../domains/good-lift/meet-runes.ts';
import { createRunWorld, startRun, stepRun } from '../../../domains/good-lift/run-step.ts';
import { TST, createReferencePilot } from '../../../domains/good-lift/pilots.ts';
import { createTestLoader } from '../../../test/helpers/test-models.ts';

// The meet's and the bells' own states, as a run starts them: nothing loaded, laid or thrown.
const quietMeet = () => createMeet().state;
const quietBells = () => createBells().state;
const pilot = new THREE.Vector3(CLOUD_ZONE.x, 400, CLOUD_ZONE.z);
const eye = new THREE.Vector3(CLOUD_ZONE.x, 404, CLOUD_ZONE.z + 12);
const named = (view: ReturnType<typeof createMeetView>, name: string) => namedFixture(view.root, name);
const near = (actual: number, expected: number, slack = 1e-6) => assert.ok(Math.abs(actual - expected) <= slack, `${actual} is within ${slack} of ${expected}`);
const where = (object: THREE.Object3D) => object.getWorldPosition(new THREE.Vector3());
const facing = (object: THREE.Object3D) => object.getWorldDirection(new THREE.Vector3());
// A sky's state with one gust band blowing toward +x (east), for the wind plates to ride.
const blowing = () => {
  const sky = createCloudbaseRun();
  for (const band of sky.state.gusts) Object.assign(band, { strength: 4, ux: 1, uz: 0, born: 3, lane: 0, at: 0 });
  return sky.state;
};
// Puts a plate in a loose slot, as the meet lays one.
const lay = (meet: ReturnType<typeof quietMeet>, slot: number, plate: { kind: 2|3|4|5; kg: number; x?: number; y?: number; z?: number; born?: number; slot?: number; live?: boolean; held?: boolean; }) => Object.assign(meet.loose[slot], { slot: -1, ox: 0, oz: 0, vx: 0, vz: 0, still: false, held: false, live: true }, plate);
// A set of three stones raised for `line`, 22 m round `middle` from bearing `bearing`, as meet-runes.js raises them.
function raise(meet: ReturnType<typeof quietMeet>, { line = 500, middle = pilot, bearing = 0.4, at = 10, runes = [RUNE.fehu, RUNE.algiz, RUNE.tiwaz] }: { line?: number; middle?: THREE.Vector3; bearing?: number; at?: number; runes?: number[] } = {}) {
  const set = meet.runes;
  set.line = line;
  set.raised = GATES.lines.indexOf(line) + 1;
  set.gates.forEach((gate, i: number) => {
    const angle = bearing + (i * Math.PI * 2) / 3;
    Object.assign(gate, {
      x: middle.x + Math.sin(angle) * GATES.ring, y: line, z: middle.z - Math.cos(angle) * GATES.ring,
      nx: Math.sin(angle), nz: -Math.cos(angle), rune: runes[i], state: GATE.waiting, at, ended: -1,
    });
  });
  return set;
}

test('with no loader the view builds once on begin, hides on reset and releases everything it made exactly once', () => {
  const scene = new THREE.Scene();
  const view = createMeetView({ scene });
  assert.equal(view.root, null, 'nothing is built before a run');
  view.begin();
  const root = view.root as THREE.Group | null;
  assert.ok(root);
  view.begin();
  assert.equal(view.root, root, 'a second run reuses the same parts');
  assert.equal(scene.children.filter((child) => child.name === 'GoodLift').length, 1);
  view.reset();
  assert.equal(root.visible, false);
  const released = new Map<THREE.BufferGeometry | THREE.Material | THREE.Texture, number>();
  const watch = (owned: THREE.BufferGeometry | THREE.Material | THREE.Texture | null | undefined) => {
    if (!owned || released.has(owned)) return;
    released.set(owned, 0);
    owned.addEventListener('dispose', () => released.set(owned, released.get(owned)! + 1));
  };
  root.traverse((part) => {
    if (!renderFixture(part)) return;
    watch(part.geometry);
    watch(part.material);
    // The Beast's stone is painted by the view itself, and released with it.
    watch(part.material?.map);
    watch(part.material?.emissiveMap);
  });
  view.dispose();
  view.dispose();
  assert.ok(released.size > 10);
  assert.ok([...released.keys()].some((owned) => ('isDataTexture' in owned && owned.isDataTexture)), 'the Beast\'s stone is among them');
  assert.deepEqual([...released.values()].filter((count) => count !== 1), [], 'every part is released once');
  assert.equal(scene.children.length, 0);
});

test('the pieces are named for what they are, and every line, ring and rune is drawn after the fog', () => {
  const view = createMeetView({ scene: new THREE.Scene() });
  assert.ok(view);
  view.begin();
  for (let i = 0; i < MEET_POOL.plates; i++) for (const part of ['plate', 'pop']) assert.ok(named(view, `${part}-${i}`), `${part}-${i}`);
  for (let i = 0; i < MEET_POOL.loose; i++) for (const part of ['loose', 'loose-pop', 'loose-mark']) assert.ok(named(view, `${part}-${i}`), `${part}-${i}`);
  for (let i = 0; i < PLATE.ghosts; i++) for (const part of ['ghost', 'ghost-pop']) assert.ok(named(view, `${part}-${i}`), `${part}-${i}`);
  for (let i = 0; i < BELL_POOL; i++) for (const part of ['bell', 'beast', 'aim', 'closing', 'beast-ring', 'embers']) assert.ok(named(view, `${part}-${i}`), `${part}-${i}`);
  for (let i = 0; i < GATES.count; i++) {
    for (const part of ['gate', 'stone', 'rune', 'beams', 'gate-flash']) assert.ok(named(view, part === 'stone' ? `stone-${i}-1` : `${part}-${i}`), `${part}-${i}`);
    for (let k = 0; k < 2 * STONE_LOOK.chunks; k++) assert.ok(named(view, `rubble-${i}-${k}`), `rubble-${i}-${k}`);
  }
  for (const name of ['line-next', 'line-judged', 'ward', 'gates']) assert.ok(named(view, name), name);
  view.root!.traverse((part) => {
    if (('isLine' in part && part.isLine) || /^rune-/.test(part.name)) assert.equal(part.renderOrder, ORDER.aboveFog, `${part.name} is drawn after the fog`);
  });
  view.dispose();
});

test('a plate shows only while it is live, where the meet put it, facing the camera, its rim coloured by its weight up close and silver from afar', () => {
  const view = createMeetView({ scene: new THREE.Scene() });
  view.begin();
  const meet = quietMeet();
  meet.trail.plates[2] = { kind: PLATE_KIND.trail, x: pilot.x + 5, y: pilot.y - 1.5, z: pilot.z, kg: 25, live: true };
  meet.trail.plates[4] = { kind: PLATE_KIND.trail, x: pilot.x + 80, y: pilot.y - 9, z: pilot.z, kg: 20, live: true };
  meet.trail.plates[5] = { kind: PLATE_KIND.trail, x: pilot.x + 8, y: pilot.y - 3, z: pilot.z, kg: 15, live: true };
  view.update(10, pilot, meet, quietBells(), eye);
  const shown = [...Array(MEET_POOL.plates).keys()].filter((i) => named(view, `plate-${i}`).visible);
  assert.deepEqual(shown, [2, 4, 5]);
  const close = named(view, 'plate-2');
  assert.deepEqual(close.position.toArray(), [pilot.x + 5, pilot.y - 1.5, pilot.z]);
  // Its face looks along its own z, turned (but for its sway) toward the eye.
  const toward = Math.atan2(eye.x - close.position.x, eye.z - close.position.z);
  assert.ok(Math.abs(close.rotation.y - toward) <= PLATE.sway + 1e-9);
  const rim = (holder: SceneFixture) => holder.children[1].material.color.getHex();
  assert.equal(rim(close), PLATE.colours[25], 'within 18 m the rim is the plate\'s colour');
  assert.equal(rim(named(view, 'plate-4')), PLATE.face, 'beyond 40 m it is silver');
  // Loaded (the meet counts it): the plate goes, and a ring spreads where it was.
  meet.trail.plates[2].live = false;
  meet.plates += 1;
  view.update(10.1, pilot, meet, quietBells(), eye);
  assert.equal(close.visible, false);
  const pop = named(view, 'pop-2');
  assert.equal(pop.visible, true);
  assert.deepEqual(pop.position.toArray(), [pilot.x + 5, pilot.y - 1.5, pilot.z]);
  assert.equal(pop.material.color.getHex(), PLATE.colours[25]);
  view.update(10.1 + PLATE.popFor, pilot, meet, quietBells(), eye);
  assert.equal(pop.visible, false, 'and is gone in a moment');
  // One that runs out, near the pilot or far from them, just goes: the meet loaded nothing.
  meet.trail.plates[4].live = meet.trail.plates[5].live = false;
  view.update(11, pilot, meet, quietBells(), eye);
  assert.equal(named(view, 'pop-4').visible || named(view, 'pop-5').visible, false);
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

test('every plate off the trail shows where the meet put it, marked by its kind: a wake behind a gust front\'s, a crackle up to the cloud over the thunder\'s, an ember ring under the bait', () => {
  const view = createMeetView({ scene: new THREE.Scene() });
  view.begin();
  const meet = quietMeet();
  const sky = blowing();
  lay(meet, 9, { kind: PLATE_KIND.wind, kg: 15, x: pilot.x + 30, y: pilot.y, z: pilot.z, born: 3, slot: 1 });
  lay(meet, 14, { kind: PLATE_KIND.thunder, kg: THUNDER.kg, x: pilot.x - 6, y: pilot.y + 40, z: pilot.z, born: 3, slot: 7 });
  lay(meet, 15, { kind: PLATE_KIND.bait, kg: 25, x: pilot.x, y: pilot.y - 30, z: pilot.z + 20, born: 3 });
  // A strike's plate still held while the wing is folded is nowhere yet.
  lay(meet, 0, { kind: PLATE_KIND.scatter, kg: 25, live: false, held: true });
  view.update(5, pilot, meet, quietBells(), eye, sky);
  const shown = [...Array(MEET_POOL.loose).keys()].filter((i) => named(view, `loose-${i}`).visible);
  assert.deepEqual(shown, [9, 14, 15]);
  for (const slot of shown) assert.deepEqual(named(view, `loose-${slot}`).position.toArray(), [meet.loose[slot].x, meet.loose[slot].y, meet.loose[slot].z]);
  const [wake, bolt, lure] = shown.map((slot) => named(view, `loose-mark-${slot}`));
  assert.ok(wake.visible && bolt.visible && lure.visible);
  assert.deepEqual([wake.position.toArray(), bolt.position.toArray()], [named(view, 'loose-9').position.toArray(), named(view, 'loose-14').position.toArray()]);
  // The wake trails back from the plate, against the way its front blows (east here): every point
  // of it lies west of the plate.
  wake.updateMatrixWorld(true);
  const points = wake.geometry.attributes.position;
  const point = new THREE.Vector3();
  let furthest = 0;
  for (let k = 0; k < points.count; k++) {
    point.fromBufferAttribute(points, k).applyMatrix4(wake.matrixWorld);
    assert.ok(point.x < meet.loose[9].x - PLATE.radius + 1e-6, 'behind the plate, upwind');
    furthest = Math.max(furthest, meet.loose[9].x - point.x);
  }
  near(furthest, PLATE.radius + LOOSE_LOOK.wake, 1e-4);
  // The crackle reaches from the plate up to the cloud's base, THUNDER.below over it.
  bolt.geometry.computeBoundingBox();
  near(bolt.geometry.boundingBox!.max.y, THUNDER.below, 1e-6);
  assert.ok(bolt.geometry.boundingBox!.min.y > 0);
  // The lure lies level under the bait, wider than the plate, and breathes.
  assert.equal(lure.rotation.x, 0);
  assert.ok(lure.position.y < meet.loose[15].y && lure.scale.x >= PLATE.radius * LOOSE_LOOK.ring[0] - 1e-9);
  const breaths = new Set();
  for (let t = 5; t < 5 + 1 / LOOSE_LOOK.lure; t += 0.1) {
    view.update(t, pilot, meet, quietBells(), eye, sky);
    breaths.add(Math.round(lure.scale.x * 10));
  }
  assert.ok(breaths.size > 5, 'the ring breathes');
  // The crackle comes and goes.
  const lit = new Set();
  for (let t = 5; t < 7; t += 1 / 30) {
    view.update(t, pilot, meet, quietBells(), eye, sky);
    lit.add(bolt.material.opacity > 0.5);
  }
  assert.deepEqual([...lit].sort(), [false, true]);
  view.dispose();
});

test('for a visitor who asks for reduced motion, the crackle under a storm cloud holds lit and never flickers', () => {
  const view = createMeetView({ scene: new THREE.Scene(), calm: true });
  view.begin();
  const meet = quietMeet();
  lay(meet, 14, { kind: PLATE_KIND.thunder, kg: THUNDER.kg, x: pilot.x - 6, y: pilot.y + 40, z: pilot.z, born: 3, slot: 7 });
  const bolt = named(view, 'loose-mark-14');
  const shown = new Set();
  for (let t = 5; t < 7; t += 1 / 30) {
    view.update(t, pilot, meet, quietBells(), eye);
    shown.add(bolt.visible && bolt.material.opacity);
  }
  assert.deepEqual([...shown], [LOOSE_LOOK.steady]);
  view.dispose();
});

test('a strike\'s plates tumble as they fly, their rims coloured close to, and shrink away over their last 0.8 s', () => {
  const view = createMeetView({ scene: new THREE.Scene() });
  view.begin();
  const meet = quietMeet();
  lay(meet, 0, { kind: PLATE_KIND.scatter, kg: 25, x: pilot.x + 6.5, y: pilot.y, z: pilot.z, born: 20 });
  lay(meet, 1, { kind: PLATE_KIND.scatter, kg: 2.5, x: pilot.x - 6.5, y: pilot.y, z: pilot.z, born: 20 });
  view.update(21, pilot, meet, quietBells(), eye);
  const plate = named(view, 'loose-0');
  assert.equal(plate.visible, true);
  assert.equal(plate.scale.x, 1);
  const turned = [plate.rotation.x, plate.rotation.y];
  view.update(21.5, pilot, meet, quietBells(), eye);
  assert.notDeepEqual([plate.rotation.x, plate.rotation.y], turned, 'it tumbles');
  assert.equal(plate.children[1].material.color.getHex(), PLATE.colours[25]);
  assert.equal(named(view, 'loose-1').children[1].material.color.getHex(), PLATE.face, 'a change plate stays silver');
  assert.equal(named(view, 'loose-mark-0').visible, false, 'a sprayed plate has no mark');
  view.update(20 + SCATTER.life - LOOSE_LOOK.fade / 2, pilot, meet, quietBells(), eye);
  near(plate.scale.x, 0.5, 1e-9);
  view.update(20 + SCATTER.life, pilot, meet, quietBells(), eye);
  near(plate.scale.x, 0, 1e-9);
  view.dispose();
});

test('a loose plate the meet loaded pops where it was, by its kind\'s own count, and one whose time ran out, or whose slot took a new plate, just goes', () => {
  const view = createMeetView({ scene: new THREE.Scene() });
  view.begin();
  const meet = quietMeet();
  const sky = blowing();
  lay(meet, 8, { kind: PLATE_KIND.wind, kg: 15, x: pilot.x + 4, y: pilot.y, z: pilot.z, born: 3, slot: 0 });
  lay(meet, 9, { kind: PLATE_KIND.wind, kg: 15, x: pilot.x - 4, y: pilot.y, z: pilot.z, born: 3, slot: 0 });
  lay(meet, 15, { kind: PLATE_KIND.bait, kg: 25, x: pilot.x, y: pilot.y - 3, z: pilot.z + 3, born: 3 });
  view.update(5, pilot, meet, quietBells(), eye, sky);
  // One wind plate loaded; the other's front passed by in the same moment; the bait's slot taken by
  // a new bait, which counts the old as loaded.
  meet.loose[8].live = false;
  meet.loose[9].live = false;
  Object.assign(meet.loose[15], { born: 9, x: pilot.x + 40 });
  meet.wind += 1;
  meet.bait += 1;
  meet.plates += 2;
  view.update(5.1, pilot, meet, quietBells(), eye, sky);
  const pops = [8, 9, 15].map((slot) => named(view, `loose-pop-${slot}`).visible);
  assert.equal(pops[0] !== pops[1], true, 'one wind plate pops, the other just goes');
  assert.equal(pops[2], true, 'the bait taken pops, though a new bait already fills its slot');
  assert.equal(named(view, 'loose-15').visible, true);
  assert.deepEqual(named(view, 'loose-15').position.toArray(), [pilot.x + 40, pilot.y - 3, pilot.z + 3]);
  // Nothing pops for a trail plate: none of the plates loaded was one.
  assert.equal([...Array(MEET_POOL.plates).keys()].some((i) => named(view, `pop-${i}`).visible), false);
  view.dispose();
});

test('a plate loaded still pops when another of its kind runs out further off in the same moment, whichever slot comes first', () => {
  const view = createMeetView({ scene: new THREE.Scene() });
  view.begin();
  const meet = quietMeet();
  const sky = blowing();
  // One front's plate far off in the first slot, whose front is passing; another's at the wing.
  lay(meet, 8, { kind: PLATE_KIND.wind, kg: 15, x: pilot.x + 30, y: pilot.y, z: pilot.z, born: 3, slot: 0 });
  lay(meet, 11, { kind: PLATE_KIND.wind, kg: 15, x: pilot.x + 3, y: pilot.y, z: pilot.z - 2, born: 4, slot: 1 });
  meet.trail.plates[0] = { kind: PLATE_KIND.trail, x: pilot.x + 25, y: pilot.y - 2, z: pilot.z, kg: 5, live: true };
  meet.trail.plates[3] = { kind: PLATE_KIND.trail, x: pilot.x - 4, y: pilot.y - 1, z: pilot.z, kg: 20, live: true };
  view.update(5, pilot, meet, quietBells(), eye, sky);
  meet.loose[8].live = meet.loose[11].live = false;
  meet.trail.plates[0].live = meet.trail.plates[3].live = false;
  meet.wind += 1;
  meet.plates += 2;
  view.update(5.05, pilot, meet, quietBells(), eye, sky);
  assert.equal(named(view, 'loose-pop-8').visible, false);
  assert.equal(named(view, 'loose-pop-11').visible, true);
  assert.equal(named(view, 'pop-0').visible, false);
  assert.equal(named(view, 'pop-3').visible, true);
  view.dispose();
});

test('under Fehu a plate loaded from beyond a plate\'s own reach flies in to the wing and its ring spreads round the wing as it arrives, as do a strike\'s plates loaded the moment they spray', () => {
  const view = createMeetView({ scene: new THREE.Scene() });
  view.begin();
  const meet = quietMeet();
  meet.runes.blessing.rune = RUNE.fehu;
  const from = [pilot.x + 10, pilot.y, pilot.z];
  meet.trail.plates[0] = { kind: PLATE_KIND.trail, x: from[0], y: from[1], z: from[2], kg: 20, live: true };
  view.update(30, pilot, meet, quietBells(), eye);
  assert.ok(Math.hypot(10) > TRAIL.reach && 10 < BLESSING.reach);
  meet.trail.plates[0].live = false;
  meet.plates += 1;
  view.update(30.01, pilot, meet, quietBells(), eye);
  assert.equal(named(view, 'pop-0').visible, false, 'no ring where it was');
  const ghost = named(view, 'ghost-0');
  assert.equal(ghost.visible, true);
  assert.deepEqual(ghost.position.toArray(), from, 'it sets off from where it was');
  assert.equal(ghost.children[1].material.color.getHex(), PLATE.colours[20]);
  view.update(30.01 + PLATE.fly / 2, pilot, meet, quietBells(), eye);
  near(ghost.position.x, pilot.x + 5, 1e-6);
  view.update(30.01 + PLATE.fly + 0.05, pilot, meet, quietBells(), eye);
  assert.equal(ghost.visible, false);
  const ring = named(view, 'ghost-pop-0');
  assert.equal(ring.visible, true);
  assert.deepEqual(ring.position.toArray(), pilot.toArray(), 'round the wing');
  view.update(30.01 + PLATE.fly + PLATE.popFor + 0.01, pilot, meet, quietBells(), eye);
  assert.equal(ring.visible, false);
  // A strike's plates under Fehu go straight back on the bar the step they spray, never drawn:
  // copies of them fly in from round the wing, where they sprayed from.
  meet.recovered += 3;
  meet.plates += 3;
  view.update(31, pilot, meet, quietBells(), eye);
  const flying = [...Array(PLATE.ghosts).keys()].map((i) => named(view, `ghost-${i}`)).filter((each) => each.visible);
  assert.equal(flying.length, 3);
  for (const each of flying) near(Math.hypot(each.position.x - pilot.x, each.position.z - pilot.z), SCATTER.from, 1e-6);
  assert.equal(new Set(flying.map((each) => Math.round(Math.atan2(each.position.x - pilot.x, each.position.z - pilot.z) * 100))).size, 3, 'from all round');
  view.dispose();
});

test('a raised set of rune stones stands round the lift: two stones to a gate either side of its opening, facing the middle, its rune between them turned to the eye, and beams to the opening\'s full height', () => {
  const view = createMeetView({ scene: new THREE.Scene() });
  assert.ok(view);
  view.begin();
  const meet = quietMeet();
  const set = raise(meet);
  view.update(12, pilot, meet, quietBells(), eye);
  view.root!.updateMatrixWorld(true);
  const corner = new THREE.Vector3();
  set.gates.forEach((gate: { y: number; nz: number; nx: number; x: number; z: number; rune: string|number; }, i) => {
    const holder = named(view, `gate-${i}`);
    assert.equal(holder.visible, true);
    assert.ok(Math.abs(holder.position.y - gate.y) <= STONE_LOOK.bob + 1e-9);
    const across = { x: -gate.nz, z: gate.nx };
    for (const s of [0, 1]) {
      const stone = named(view, `stone-${i}-${s}`);
      assert.equal(stone.visible, true);
      // Its carved face looks back to the middle of the lift.
      const look = facing(stone);
      near(look.x, -gate.nx);
      near(look.z, -gate.nz);
      // Every part of it stands outside the opening, on its own side.
      stone.traverse((part) => {
        if (!renderFixture(part) || !('isMesh' in part)) return;
        const points = part.geometry.attributes.position;
        for (let k = 0; k < points.count; k++) {
          corner.fromBufferAttribute(points, k).applyMatrix4(part.matrixWorld);
          const aside = (corner.x - gate.x) * across.x + (corner.z - gate.z) * across.z;
          assert.ok((s === 0 ? -aside : aside) >= GATES.wide - 1e-6, `stone ${i}-${s} is ${aside} m aside`);
        }
      });
      near(Math.abs((where(stone).x - gate.x) * across.x + (where(stone).z - gate.z) * across.z), GATES.wide + (STONE_LOOK.wide * STONE_LOOK.tall) / 2);
    }
    // Its rune, three strokes, faces the eye whichever side it is seen from.
    const rune = named(view, `rune-${i}`);
    assert.equal(rune.visible, true);
    assert.equal(rune.geometry.attributes.position.count, RUNE_STROKES[Number(gate.rune)].length * 6);
    const look = facing(rune);
    const toEye = new THREE.Vector3(eye.x - gate.x, 0, eye.z - gate.z).normalize();
    near(look.x, toEye.x);
    near(look.z, toEye.z);
    // The beams run on from the stones' ends to the opening's top and foot.
    const beams = named(view, `beams-${i}`);
    beams.geometry.computeBoundingBox();
    near(beams.geometry.boundingBox!.max.y, GATES.tall);
    near(beams.geometry.boundingBox!.min.y, -GATES.tall);
    near(beams.geometry.boundingBox!.max.x, GATES.wide);
    assert.equal(named(view, `gate-flash-${i}`).visible, false);
    assert.equal(named(view, `rubble-${i}-0`).visible, false);
  });
  // Each rune's own strokes: no two runes cut alike.
  const shapes = set.gates.map((_, i) => named(view, `rune-${i}`).geometry);
  assert.equal(new Set(shapes).size, 3);
  view.dispose();
});

test('the stone flown through flares its rune and flashes, and crumbles a beat after the others, whose rubble falls and is gone within 1.8 s; the next set is placed afresh', () => {
  const view = createMeetView({ scene: new THREE.Scene() });
  view.begin();
  const meet = quietMeet();
  const set = raise(meet);
  view.update(12, pilot, meet, quietBells(), eye);
  set.gates.forEach((gate, i: number) => Object.assign(gate, { state: i === 1 ? GATE.taken : GATE.crumbled, ended: 20 }));
  view.update(20.1, pilot, meet, quietBells(), eye);
  const taken = (part: string) => named(view, `${part}-1`);
  assert.ok(taken('rune').visible && taken('rune').scale.x > STONE_LOOK.rune, 'the taken rune flares');
  assert.equal(taken('gate-flash').visible, true);
  assert.equal(named(view, 'stone-1-0').visible, true, 'its stones still stand');
  for (const i of [0, 2]) {
    assert.equal(named(view, `stone-${i}-0`).visible || named(view, `stone-${i}-1`).visible, false, `the stones of gate ${i} have broken`);
    assert.equal(named(view, `rubble-${i}-3`).visible, true);
    assert.equal(named(view, `gate-flash-${i}`).visible, false, 'only the one taken flashes');
  }
  const piece = named(view, 'rubble-0-3');
  const was = where(piece).y;
  view.update(20 + STONE_LOOK.after + 0.5, pilot, meet, quietBells(), eye);
  assert.ok(where(piece).y < was, 'rubble falls');
  assert.equal(named(view, 'stone-1-0').visible, false, 'then the taken gate\'s stones break too');
  assert.equal(named(view, 'rubble-1-0').visible, true);
  assert.equal(taken('rune').visible, false, 'its rune has flared out');
  view.update(20 + STONE_LOOK.crumbleFor, pilot, meet, quietBells(), eye);
  assert.equal(named(view, 'gate-0').visible || named(view, 'gate-2').visible, false);
  assert.equal(named(view, 'gate-1').visible, true);
  view.update(20 + STONE_LOOK.after + STONE_LOOK.crumbleFor, pilot, meet, quietBells(), eye);
  assert.equal(named(view, 'gate-1').visible, false);
  // The 1,000 m set: the same gates, raised again elsewhere with other runes.
  raise(meet, { line: 1000, bearing: 2, at: 60, runes: [RUNE.ansuz, RUNE.tiwaz, RUNE.algiz] });
  view.update(61, { ...pilot, y: 920 }, meet, quietBells(), eye);
  assert.ok(Math.abs(named(view, 'gate-0').position.y - 1000) <= STONE_LOOK.bob + 1e-9);
  assert.equal(named(view, 'rune-0').geometry.attributes.position.count, RUNE_STROKES[RUNE.ansuz].length * 6);
  assert.ok(named(view, 'stone-0-0').visible && named(view, 'rune-0').visible && !named(view, 'rubble-0-0').visible);
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
  assert.equal(named(view, 'beast-1').visible, false, 'a bell of the usual kind');
  assert.deepEqual(bell.position.toArray(), [bells.bells[1].x, bells.bells[1].y, bells.bells[1].z]);
  assert.equal(bell.scale.x, BELL_LOOK.size[2]);
  const ring = named(view, 'aim-1');
  assert.equal(ring.visible, true);
  assert.equal(named(view, 'beast-ring-1').visible, false);
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

test('the Beast falls half as big again as the heaviest bell, in its own cracked stone, tumbling slower, its ring closing over its own 3.2 s with a second ring of teeth turning round it', () => {
  const view = createMeetView({ scene: new THREE.Scene() });
  view.begin();
  const bells = quietBells();
  const aim = { aimX: pilot.x + 30, aimY: pilot.y, aimZ: pilot.z };
  Object.assign(bells.bells[0], aim, {
    phase: 1, at: 70, lead: BEAST.lead, beast: true, kg: BEAST.kg, result: 0,
    fromX: aim.aimX, fromY: aim.aimY + 128, fromZ: aim.aimZ - 34.7, x: aim.aimX, y: aim.aimY + 64, z: aim.aimZ - 17.35,
  });
  bells.warning = 0;
  view.update(70 + BEAST.lead / 2, pilot, quietMeet(), bells, eye);
  const holder = named(view, 'bell-0');
  const beast = named(view, 'beast-0');
  assert.ok(holder.visible && beast.visible);
  assert.equal(holder.scale.x, BEAST_LOOK.size);
  assert.equal(BEAST_LOOK.size, 1.5 * BELL_LOOK.size[2]);
  assert.equal(holder.children.filter((part) => part.visible).length, 1, 'the kettlebell it stands in for is hidden');
  near(holder.rotation.x, (BEAST.lead / 2) * BEAST_LOOK.tumble, 1e-9);
  assert.ok(BEAST_LOOK.tumble < BELL_LOOK.tumble);
  // Its stone: painted, glowing faintly all through as every bell glows, and with the full ember in
  // its cracks and runes.
  beast.traverse((part) => {
    if (!renderFixture(part) || !('isMesh' in part)) return;
    assert.ok(part.material.map instanceof THREE.DataTexture && part.material.emissiveMap instanceof THREE.DataTexture);
    assert.equal(part.material.emissive.getHex(), 0xffffff);
    const { data } = part.material.emissiveMap.image;
    assert.ok(data);
    let faintest = 255;
    let burning = 0;
    for (let i = 0; i < data.length; i += 4) {
      faintest = Math.min(faintest, data[i]);
      if (data[i] === 255) burning += 1;
    }
    assert.equal(faintest, Math.round(255 * BEAST_LOOK.warm[0]), 'no part of it is dark');
    assert.ok(burning > 0.01 * (data.length / 4), 'its cracks and runes burn at the full ember');
  });
  // Half its warning gone, the closing ring is half way in.
  const closing = named(view, 'closing-0');
  near(closing.scale.x, 1 + (BELL_LOOK.closing - 1) / 2, 1e-9);
  const teeth = named(view, 'beast-ring-0');
  assert.equal(teeth.visible, true);
  teeth.geometry.computeBoundingSphere();
  near(teeth.geometry.boundingSphere!.radius, CLOUD_STRIKE.radius * BEAST_LOOK.outer, 1e-4);
  const turned = teeth.rotation.y;
  view.update(70 + BEAST.lead * 0.75, pilot, quietMeet(), bells, eye);
  assert.notEqual(teeth.rotation.y, turned);
  // Decided, it falls on with no ring, still the Beast.
  Object.assign(bells.bells[0], { phase: 2, result: BELL_RESULT.dodged });
  view.update(70 + BEAST.lead + 0.2, pilot, quietMeet(), bells, eye);
  assert.ok(beast.visible && !named(view, 'aim-0').visible);
  view.dispose();
});

test('a kettlebell that glances off Algiz is knocked away from the wing from that moment, and Algiz\'s ward spreads round the wing and is gone in half a second', () => {
  const view = createMeetView({ scene: new THREE.Scene() });
  view.begin();
  const bells = quietBells();
  // Coming down on the pilot from the east.
  Object.assign(bells.bells[0], {
    phase: 1, at: 80, lead: BELLS.lead, kg: BELLS.kg[1], result: 0, aimX: pilot.x, aimY: pilot.y, aimZ: pilot.z,
    fromX: pilot.x + 26, fromY: pilot.y + 96, fromZ: pilot.z, x: pilot.x + 1, y: pilot.y + 3.7, z: pilot.z,
  });
  view.update(82.3, pilot, quietMeet(), bells, eye);
  Object.assign(bells.bells[0], { phase: 2, result: BELL_RESULT.glanced });
  view.update(82.35, pilot, quietMeet(), bells, eye);
  const ward = named(view, 'ward');
  assert.equal(ward.visible, true);
  assert.deepEqual(ward.position.toArray(), [pilot.x, pilot.y + CLOUD_STRIKE.rise, pilot.z]);
  // Half a second on, it has been knocked 4.5 m further east than the line it was falling on.
  Object.assign(bells.bells[0], { x: pilot.x + 0.5, y: pilot.y - 5 });
  view.update(82.85, pilot, quietMeet(), bells, eye);
  const bell = named(view, 'bell-0');
  near(bell.position.x, pilot.x + 0.5 + 0.5 * GLANCE.speed, 1e-9);
  near(bell.position.z, pilot.z, 1e-9);
  assert.equal(ward.visible, false);
  view.dispose();
});

test('a new run opens with nothing of the last one showing: no plate, ring, stone, bell or embers, and no pop for a plate gone between runs', () => {
  const view = createMeetView({ scene: new THREE.Scene() });
  assert.ok(view);
  view.begin();
  const meet = quietMeet();
  meet.trail.plates[0] = { kind: PLATE_KIND.trail, x: pilot.x + 3, y: pilot.y, z: pilot.z, kg: 10, live: true };
  lay(meet, 3, { kind: PLATE_KIND.scatter, kg: 20, x: pilot.x + 2, y: pilot.y, z: pilot.z, born: 1 });
  lay(meet, 15, { kind: PLATE_KIND.bait, kg: 25, x: pilot.x, y: pilot.y, z: pilot.z + 2, born: 1 });
  raise(meet);
  const bells = quietBells();
  Object.assign(bells.bells[0], { phase: 1, at: 1, beast: true, lead: BEAST.lead, fromX: pilot.x, fromY: pilot.y + 96, fromZ: pilot.z, aimX: pilot.x, aimY: pilot.y, aimZ: pilot.z, x: pilot.x, y: pilot.y + 50, z: pilot.z });
  meet.count = 1;
  Object.assign(meet.lifts[0], { line: 250, kg: 25, red: 0, good: true, double: false, at: 1 });
  view.update(1.2, pilot, meet, bells, eye);
  assert.ok(['plate-0', 'loose-3', 'loose-15', 'loose-mark-15', 'gate-0', 'bell-0', 'beast-ring-0', 'line-judged'].every((name) => named(view, name).visible));
  view.begin();
  const shown: string[] = [];
  view.root!.traverse((part) => {
    if (part !== view.root && /^(plate|pop|loose|ghost|gate-|bell|embers|aim|line-judged|ward)/.test(part.name) && part.visible) shown.push(part.name);
  });
  assert.deepEqual(shown, []);
  // The next run's first update starts from nothing: what was up is not a pickup.
  view.update(0, pilot, quietMeet(), quietBells(), eye);
  const popped: string[] = [];
  view.root!.traverse((part) => { if (/pop/.test(part.name) && part.visible) popped.push(part.name); });
  assert.deepEqual(popped, []);
  view.dispose();
});

test('loaded kettlebells and rune stones replace the stand-ins in copies of the files\' materials, the Beast is the kettlebell cut again in its stone, and dispose releases the view\'s own parts but nothing of the loader\'s', async () => {
  const loader = createTestLoader({ maps: true });
  // No Beast of its own has been made: asking for it fails, as a missing file does, and quietly.
  const asked: string[] = [];
  const loadModel = (name: string, size: number) => {
    asked.push(name);
    return name === 'kettlebell-beast' ? Promise.reject(new Error('There is no kettlebell-beast.glb.')) : loader.loadModel(name, size);
  };
  const view = createMeetView({ scene: new THREE.Scene(), loadModel });
  await view.begin();
  assert.deepEqual(view.loaded, { kettlebell: true, stone: true, beast: false });
  assert.deepEqual(['kettlebell', 'rune-stone', 'kettlebell-beast'].map((name) => asked.filter((each) => each === name).length), [BELL_POOL, 2 * GATES.count, BELL_POOL]);
  const owned = await loader.owned();
  const meshesOf = (names: string[]) => names.flatMap((name: string) => { const found: SceneFixture[] = []; named(view, name).traverse((part) => renderFixture(part) && found.push(part)); return found; });
  const bells = meshesOf(['bell-0', 'bell-1']).filter((mesh) => !/^beast/.test(mesh.parent?.parent?.name ?? '') && mesh.material.emissive.getHex() === BELL_LOOK.ember);
  assert.ok(bells.length >= BELL_POOL);
  for (const mesh of bells) {
    assert.ok(owned.geometries.has(mesh.geometry), 'the shape is the loader\'s, shared');
    assert.ok(!owned.materials.has(mesh.material), 'the material is the view\'s own copy');
  }
  // The file's own material, which the forge's kettlebell and the fjord's stones wear, is left as it was.
  for (const material of owned.materials) assert.notEqual(material.emissive.getHex(), BELL_LOOK.ember);
  const stones = meshesOf(['stone-0-0', 'stone-2-1']);
  assert.ok(stones.length >= 2);
  for (const mesh of stones) {
    assert.ok(owned.geometries.has(mesh.geometry));
    assert.ok(!owned.materials.has(mesh.material));
    assert.equal(mesh.material.emissiveMap, null);
    assert.equal(mesh.material.emissive.getHex(), STONE_LOOK.glow);
  }
  // The Beast: the kettlebell's shape, wrapped afresh for its stone (the view's own copy, its
  // pictures' coordinates on the stone, which repeats round the bell), in the Beast's material.
  const beasts = meshesOf(['beast-0', 'beast-1']);
  assert.ok(beasts.length >= BELL_POOL);
  for (const mesh of beasts) {
    assert.ok(!owned.geometries.has(mesh.geometry));
    assert.ok(mesh.material.map instanceof THREE.DataTexture);
    assert.equal(mesh.material.map.wrapS, THREE.RepeatWrapping);
    const { position, uv } = mesh.geometry.attributes;
    for (let i = 0; i < uv.count; i++) assert.ok(uv.getX(i) >= -1e-6 && uv.getX(i) < 2 && uv.getY(i) >= -1e-6 && uv.getY(i) <= 1 + 1e-6);
    // Off the bell's upright, where every way round is a long way, no triangle reaches even half way
    // round the stone: those across the seam at its back go on round past 1 instead of squeezing
    // the whole stone back across one strip.
    mesh.geometry.computeBoundingBox();
    const { min, max } = mesh.geometry.boundingBox!;
    const [cx, cz, half] = [(min.x + max.x) / 2, (min.z + max.z) / 2, Math.min(max.x - min.x, max.z - min.z) / 2];
    assert.equal(mesh.geometry.index, null, 'each triangle has corners of its own');
    let across = 0;
    for (let t = 0; t < position.count; t += 3) {
      const corners = [t, t + 1, t + 2];
      if (corners.some((k) => Math.hypot(position.getX(k) - cx, position.getZ(k) - cz) < 0.2 * half)) continue;
      const round = corners.map((k) => uv.getX(k));
      assert.ok(Math.max(...round) - Math.min(...round) < 0.5, `triangle ${t / 3} spans ${Math.max(...round) - Math.min(...round)} of the way round`);
      if (round.some((u) => u > 1)) across += 1;
    }
    assert.ok(across > 0, 'some go on round past the seam');
  }
  let theirs = 0;
  for (const thing of [...owned.geometries, ...owned.materials, ...owned.textures]) thing.addEventListener('dispose', () => (theirs += 1));
  view.dispose();
  assert.equal(theirs, 0, 'nothing of the loader\'s is released');
});

test('a Beast of its own, once there is a kettlebell-beast.glb, takes the place of the cut stone however the files arrive, glowing as the bells do but dimmer', async () => {
  const loader = createTestLoader();
  // The kettlebell's file stands in for one the owner has made.
  const loadModel = (name: string, size: number) => loader.loadModel(name === 'kettlebell-beast' ? 'kettlebell' : name, size);
  const view = createMeetView({ scene: new THREE.Scene(), loadModel });
  await view.begin();
  assert.deepEqual(view.loaded, { kettlebell: true, stone: true, beast: true });
  const owned = await loader.owned();
  for (const i of [0, 1]) {
    named(view, `beast-${i}`).traverse((part) => {
      if (!renderFixture(part) || !('isMesh' in part)) return;
      assert.ok(owned.geometries.has(part.geometry), 'its own file\'s shape, not the cut stone');
      assert.equal(part.material.emissive.getHex(), BELL_LOOK.ember);
      assert.equal(part.material.emissiveIntensity, BEAST_LOOK.model);
    });
  }
  view.dispose();
});

test('a real soaring run can be drawn frame by frame without invalid transforms or growing pools', () => {
  const view = createMeetView({ scene: new THREE.Scene() });
  assert.ok(view);
  const meet = createMeet();
  const bells = createBells();
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet, bells }), 1);
  view.begin();
  const flyer = createReferencePilot(TST);
  const intent = { turn: 0, brake: false, bar: false };
  const camera = new THREE.Vector3();
  let ended = null;
  let frames = 0;
  const shown = new Map();
  const count = (name: string) => shown.set(name, (shown.get(name) ?? 0) + 1);
  while (!ended && world.sky.state.elapsed < 600) {
    flyer.decide(world, intent);
    ended = stepRun(world, intent);
    if (world.steps % 4) continue;
    camera.set(world.g.pos.x - Math.sin(world.g.yaw) * 12, world.g.pos.y + 4, world.g.pos.z + Math.cos(world.g.yaw) * 12);
    view.update(world.sky.state.elapsed, world.g.pos, meet, bells, camera, world.sky);
    view.root!.updateMatrixWorld(true);
    view.root!.traverse((part) => {
      assert.ok(part.matrixWorld.elements.every(Number.isFinite), `${part.name} has a finite place`);
      if (!part.visible) return;
      const kind = /^loose-\d/.test(part.name) ? `loose ${meet.state.loose[Number(part.name.slice(6))].kind}` : part.name.replace(/-\d+(-\d+)?$/, '');
      count(kind);
    });
    frames += 1;
  }
  assert.ok(frames > 1000);
  assert.ok(ended, 'the full flight reaches a real ending');
  assert.ok(shown.get('line-next') > 0, 'the progression line is drawn during flight');
  view.dispose();
});
