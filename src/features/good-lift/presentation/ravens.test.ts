import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RAVEN, RAVEN_WINGS, rigRaven, poseRaven, seatRaven, ravenEffort } from './ravens.ts';
import { loadModel, readModel } from '../../../test/helpers/test-models.ts';

// Every test here flies the real public/models/raven.glb, because the rig is only right if it is
// right for that file: its bone names, its mirror plane and the way its bird rears up.
const BEAT = 1 / RAVEN.beat;
type RavenWing = NonNullable<ReturnType<typeof rigRaven>>[number];
const jointsOf = (wing: RavenWing) => [wing.shoulder, wing.elbow, wing.wrist, wing.hand];
const skinOf = (model: THREE.Object3D): THREE.SkinnedMesh | null => {
  let skin: THREE.SkinnedMesh | null = null;
  model.traverse((part) => { if (part instanceof THREE.SkinnedMesh) skin = part; });
  return skin;
};

// A raven as the game holds it: rigged, turned to fly forward, and inside a holder that carries
// the glider's yaw and bank. Lengths come out in metres.
async function perch() {
  const model = await loadModel('raven', RAVEN.span, RAVEN.glow);
  const wings = rigRaven(model);
  assert.ok(wings);
  seatRaven(model);
  const holder = new THREE.Group();
  holder.rotation.order = 'YXZ';
  holder.add(model);
  holder.updateMatrixWorld(true);
  // The outermost bone of each wing: the first of the feather bones on its hand.
  const tips = wings.map((wing) => wing.hand.bone.children[0]);
  const at = (bone: THREE.Object3D | undefined) => { holder.updateMatrixWorld(true); return bone!.getWorldPosition(new THREE.Vector3()); };
  return { model, wings, holder, tips, at, skin: skinOf(model) };
}

test('the raven file has the eight wing bones, and rigRaven hands back a joint for each of them', async () => {
  const { scene } = await readModel('raven');
  const names = RAVEN_WINGS.flatMap((wing) => wing.bones);
  assert.deepEqual(names, ['bone_13', 'bone_14', 'bone_15', 'bone_16', 'bone_22', 'bone_23', 'bone_24', 'bone_25']);
  for (const name of names) assert.equal((scene.getObjectByName(name) as THREE.Bone | undefined)?.isBone, true, `${name} is a bone in the file`);
  const wings = rigRaven(scene);
  assert.ok(wings);
  assert.equal(wings.length, 2);
  assert.deepEqual(wings.map((wing) => wing.side), [1, -1]);
  assert.deepEqual(wings.flatMap(jointsOf).map((joint) => joint.bone.name), names);
  // Each chain runs outward from the body, on its own side of the file.
  scene.updateMatrixWorld(true);
  for (const wing of wings) {
    const reach = jointsOf(wing).map((joint) => wing.side * joint.bone.getWorldPosition(new THREE.Vector3()).x);
    assert.deepEqual(reach, [...reach].sort((a, b) => a - b));
    assert.ok(reach[3] > 0.25, 'the hand is far out along the wing');
  }
});

test('both wings of the real raven rise together and fall together through a beat', async () => {
  const { wings, tips, at } = await perch();
  poseRaven(wings, 0, 0, 0);
  const rest = at(tips[0]).y;
  for (const effort of [0.5, 1]) {
    let highest = -Infinity;
    let lowest = Infinity;
    let before = null;
    for (let n = 0; n <= 48; n++) {
      poseRaven(wings, (n / 48) * BEAT, 0, effort);
      for (const pick of [(wing: RavenWing) => wing.hand.bone, (wing: RavenWing) => wing.hand.bone.children[0]]) {
        const one = at(pick(wings[0]));
        const other = at(pick(wings[1]));
        // Mirrored to within 1% of the span: the same height, the same way along the body, and
        // the same distance out to either side.
        assert.ok(Math.abs(one.y - other.y) < 0.01 * RAVEN.span, `wings level with each other at step ${n}`);
        assert.ok(Math.abs(one.z - other.z) < 0.01 * RAVEN.span);
        assert.ok(Math.abs(one.x + other.x) < 0.01 * RAVEN.span);
      }
      const heights = tips.map((tip) => at(tip).y);
      if (before && Math.abs(heights[0] - before[0]) > 0.005) {
        assert.equal(Math.sign(heights[0] - before[0]), Math.sign(heights[1] - before[1]), `both tips move the same way at step ${n}`);
      }
      before = heights;
      highest = Math.max(highest, Math.min(...heights));
      lowest = Math.min(lowest, Math.max(...heights));
    }
    // A real beat: both tips well above where they rest, then both well below.
    assert.ok(highest > rest + 0.07 * effort * RAVEN.span, `effort ${effort} lifts both tips to ${highest.toFixed(2)} m`);
    assert.ok(lowest < rest - 0.1 * effort * RAVEN.span, `effort ${effort} drops both tips to ${lowest.toFixed(2)} m`);
  }
});

test('a wingbeat swings about the bird\'s own nose, so the wings go up and down and not fore and aft', async () => {
  const { wings, at } = await perch();
  const hand = wings[0].hand.bone;
  poseRaven(wings, 0.25 * BEAT, 0, 1);
  const top = at(hand);
  poseRaven(wings, 0.75 * BEAT, 0, 1);
  const bottom = at(hand);
  assert.ok(top.y - bottom.y > 0.3 * RAVEN.span, 'the hand travels a long way up and down');
  assert.ok(Math.abs(top.z - bottom.z) < 0.01 * RAVEN.span, 'and stays where it is along the body');
});

test('each raven beats 0.618 of a beat ahead of the one before it, so a flock never flaps as one', async () => {
  const { wings, tips, at } = await perch();
  // How far through a beat the clock is when the wingtip of the bird at `index` is at its highest.
  const crest = (index: number) => {
    let highest = -Infinity;
    let when = 0;
    for (let n = 0; n < 400; n++) {
      poseRaven(wings, 20 + (n / 400) * BEAT, index, 1);
      const height = at(tips[0]).y;
      if (height > highest) [highest, when] = [height, n / 400];
    }
    return when;
  };
  const first = crest(0);
  const leads = [1, 2, 3, 4].map((index) => (((first - crest(index)) % 1) + 1) % 1);
  leads.forEach((lead, n) => {
    const due = ((n + 1) * RAVEN.stagger) % 1;
    assert.ok(Math.abs(lead - due) < 0.02, `bird ${n + 1} is ${lead.toFixed(3)} of a beat ahead of the first, for ${due.toFixed(3)}`);
  });
  // No two of the first five reach the top of a beat within a tenth of a beat of each other.
  const crests = [0, ...leads].sort((a, b) => a - b);
  crests.forEach((value, n) => assert.ok((n ? value - crests[n - 1] : value + 1 - crests.at(-1)!) > 0.1));
});

test('a soaring raven holds its wings nearly still', async () => {
  const { wings, at, skin } = await perch();
  const bones = wings.flatMap((wing) => [...jointsOf(wing).map((joint) => joint.bone), ...wing.hand.bone.children]);
  poseRaven(wings, 0, 0, 0);
  const start = bones.map(at);
  const feathers = Array.from({ length: skin!.geometry.attributes.position.count }, (_, i) => skin!.getVertexPosition(i, new THREE.Vector3()));
  const point = new THREE.Vector3();
  let strayed = 0;
  for (let time = 0; time < 30; time += 0.25) {
    poseRaven(wings, time, 0, 0);
    bones.forEach((bone, i) => { strayed = Math.max(strayed, at(bone).distanceTo(start[i]) / RAVEN.span); });
    // In the file's own units, where the span is 1.
    for (let i = 0; i < feathers.length; i++) strayed = Math.max(strayed, skin!.getVertexPosition(i, point).distanceTo(feathers[i]));
  }
  assert.ok(strayed > 0.001, 'the wings still sway a little');
  assert.ok(strayed < 0.02, `nothing strays more than 2% of the span (${strayed.toFixed(4)})`);
});

test('a soaring raven gives two or three lazy beats every seven to eleven seconds, and effort from the run overrides them', () => {
  for (let index = 0; index < 10; index++) {
    const seconds = 330;
    const dt = 0.01;
    let pulses = 0;
    let beating = 0;
    let peak = 0;
    let before = 0;
    for (let time = 0; time < seconds; time += dt) {
      const effort = ravenEffort(time, index, 0);
      if (effort > 0 && before === 0) pulses += 1;
      if (effort > 0) beating += dt;
      peak = Math.max(peak, effort);
      before = effort;
    }
    const every = seconds / pulses;
    const beats = (beating / pulses) * RAVEN.beat;
    assert.ok(every > 6.5 && every < 11.5, `bird ${index} beats every ${every.toFixed(1)} s`);
    assert.ok(beats > 1.8 && beats < 3.2, `bird ${index} gives ${beats.toFixed(1)} beats`);
    assert.ok(Math.abs(peak - 0.5) < 1e-9, 'a lazy beat is half effort');
  }
  for (let time = 0; time < 20; time += 0.37) {
    assert.equal(ravenEffort(time, 3, 0.8), 0.8);
    assert.equal(ravenEffort(time, 3, 1), 1);
  }
  // The pulse is worked out from the clock alone: the same moment always gives the same answer.
  assert.equal(ravenEffort(12.34, 5, 0), ravenEffort(12.34, 5, 0));
});

test('every pose keeps every feather and every wing bone inside the culling sphere', async () => {
  const { wings, skin, holder } = await perch();
  const [x, y, z, radius] = RAVEN.sphere;
  assert.deepEqual(skin!.boundingSphere!.center.toArray(), [x, y, z]);
  assert.equal(skin!.boundingSphere!.radius, radius);
  const point = new THREE.Vector3();
  const toSkin = new THREE.Matrix4();
  const bones = wings.flatMap((wing) => [...jointsOf(wing).map((joint) => joint.bone), ...wing.hand.bone.children]);
  let farthest = 0;
  for (const effort of [0, 0.5, 1]) {
    for (const index of [0, 3, 7]) {
      for (let n = 0; n < 24; n++) {
        poseRaven(wings, 11 + (n / 24) * BEAT, index, effort);
        holder.updateMatrixWorld(true);
        // The sphere is in the skinned mesh's own frame, which is also where three tests it.
        toSkin.copy(skin!.matrixWorld).invert();
        for (let i = 0; i < skin!.geometry.attributes.position.count; i++) {
          farthest = Math.max(farthest, skin!.getVertexPosition(i, point).distanceTo(skin!.boundingSphere!.center));
        }
        for (const bone of bones) {
          farthest = Math.max(farthest, bone.getWorldPosition(point).applyMatrix4(toSkin).distanceTo(skin!.boundingSphere!.center));
        }
      }
    }
  }
  assert.ok(farthest > 0.45, 'the wings do reach most of the way out');
  assert.ok(farthest < radius, `the farthest feather is ${farthest.toFixed(3)} from the centre, inside ${radius}`);
});

test('a seated raven is centred on its holder, flies beak first and drops its right wing in a right bank', async () => {
  const { wings, holder, skin, at } = await perch();
  for (const joint of wings.flatMap(jointsOf)) joint.bone.quaternion.copy(joint.rest);
  const outline = () => {
    holder.updateMatrixWorld(true);
    return Array.from({ length: skin!.geometry.attributes.position.count }, (_, i) => skin!.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(skin!.matrixWorld));
  };
  // Level and heading north: 4.6 m across, its middle on the holder, beak toward -z.
  let points = outline();
  const box = new THREE.Box3().setFromPoints(points);
  const size = box.getSize(new THREE.Vector3());
  const middle = box.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(size.x - RAVEN.span) < 0.01);
  assert.ok(middle.length() < 0.02 * RAVEN.span, `the middle of the bird is ${middle.length().toFixed(3)} m from the holder`);
  const beak = points.reduce((a, b) => (b.z < a.z ? b : a));
  const tail = points.reduce((a, b) => (b.z > a.z ? b : a));
  const head = at(holder.getObjectByName('bone_12'));
  assert.ok(head.z < -0.15 * RAVEN.span, 'the head is at the front');
  assert.ok(head.distanceTo(beak) < head.distanceTo(tail), 'and the frontmost point is the beak');
  const pitch = Math.atan2(beak.y - tail.y, tail.z - beak.z);
  assert.ok(Math.abs(pitch) < 0.1, `the body lies within a few degrees of level (${pitch.toFixed(3)} rad)`);

  // Heading east and banked to the right, exactly as the game turns the glider.
  holder.rotation.set(0, -Math.PI / 2, -0.5);
  points = outline();
  const front = points.reduce((a, b) => (b.x > a.x ? b : a));
  assert.ok(front.distanceTo(at(holder.getObjectByName('bone_12'))) < 0.25 * RAVEN.span, 'the beak leads to the east');
  const hands = wings.map((wing) => at(wing.hand.bone));
  const [south, north] = hands[0].z > hands[1].z ? hands : [hands[1], hands[0]];
  assert.ok(south.y < north.y - 0.2 * RAVEN.span, 'the right wing, to the south, is the low one');
});

test('a model without the wing bones gets no rig', async () => {
  const cloud = await loadModel('clouds', 1);
  assert.equal(rigRaven(cloud), null);
  // One missing bone is enough: a half-rigged bird would flap one wing.
  const raven = await loadModel('raven', 1);
  raven.getObjectByName('bone_24')!.name = 'renamed';
  assert.equal(rigRaven(raven), null);
  const whole = await loadModel('raven', 1);
  assert.notEqual(rigRaven(whole), null);
});
