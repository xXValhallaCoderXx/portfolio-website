import { isMesh } from './mesh.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HELMET, buildHelmet, helmetPlacement, makeHelmet, measureHead, wearHelmet } from './helmet.ts';
import { loadModel } from '../../test/helpers/test-models.ts';

const triangles = (object: THREE.Object3D) => {
  let count = 0;
  object.traverse((part) => {
    if (isMesh(part)) count += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
  });
  return count;
};
// Every point of an object in the frame of `frame` (one of its ancestors).
const pointsIn = (object: THREE.Object3D, frame: THREE.Object3D) => {
  frame.updateMatrixWorld(true);
  const into = frame.matrixWorld.clone().invert();
  const points: THREE.Vector3[] = [];
  object.traverse((part) => {
    if (!isMesh(part)) return;
    const place = part.geometry.attributes.position;
    const to = into.clone().multiply(part.matrixWorld);
    for (let i = 0; i < place.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(place, i).applyMatrix4(to));
  });
  return points;
};
const boxIn = (object: THREE.Object3D, frame: THREE.Object3D) => new THREE.Box3().setFromPoints(pointsIn(object, frame));

test('the helmet made here is a rounded iron cap with a ridge, bands, a spike, rivets and a spectacle guard, in 1,000 to 2,000 triangles', () => {
  const helmet = buildHelmet();
  assert.equal(helmet.name, 'helmet');
  for (const name of ['cap', 'brow', 'ridge', 'band', 'spike', 'rivets', 'guard']) assert.ok(helmet.getObjectByName(name) instanceof THREE.Mesh, name);
  const count = triangles(helmet);
  assert.ok(count >= 1000 && count <= 2000, `${count} triangles`);
  helmet.traverse((part) => {
    if (isMesh(part)) assert.ok(part.geometry.attributes.position.array.every(Number.isFinite), `${part.name} is all numbers`);
  });
  // Two materials, iron and trim, with a little light of their own to read at night.
  const materials = new Set<THREE.MeshStandardMaterial>();
  helmet.traverse((part) => isMesh(part) && materials.add(part.material));
  assert.equal(materials.size, 2);
  for (const material of materials) assert.ok(material.emissiveIntensity > 0);
  assert.notEqual((helmet.getObjectByName('cap') as THREE.Mesh).material, (helmet.getObjectByName('guard') as THREE.Mesh).material);
  // The cap's outside faces outward, so it is drawn from outside.
  const cap = (helmet.getObjectByName('cap') as THREE.Mesh).geometry;
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let outward = 0;
  let faces = 0;
  for (let t = 0; t < cap.index!.count; t += 3) {
    a.fromBufferAttribute(cap.attributes.position, cap.index!.getX(t));
    b.fromBufferAttribute(cap.attributes.position, cap.index!.getX(t + 1));
    c.fromBufferAttribute(cap.attributes.position, cap.index!.getX(t + 2));
    const normal = new THREE.Vector3().subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b));
    if (normal.lengthSq() < 1e-12) continue;
    faces += 1;
    if (normal.dot(a.clone().add(b).add(c)) > 0) outward += 1;
  }
  assert.equal(outward, faces);
});

test('it has no horns: above the brow band nothing stands out from the dome, and nothing anywhere is wider than the band', () => {
  const helmet = buildHelmet();
  const box = boxIn(helmet, helmet);
  assert.ok(box.max.x <= 1.1 && box.min.x >= -1.1 && box.max.z <= 1.1 && box.min.z >= -1.1, 'no wider than the brow band');
  // Above the band, everything is inside a dome a strap's thickness bigger than the cap: the ridge,
  // the band and the spike lie on it, and a horn would stand out of it.
  for (const point of pointsIn(helmet, helmet)) {
    if (point.y <= 0.2) continue;
    const out = (Math.hypot(point.x, point.z) / 1.12) ** 2 + (point.y / (HELMET.dome + 0.25)) ** 2;
    assert.ok(out <= 1, `${point.toArray()} stands out from the dome`);
  }
  assert.ok(box.max.y < HELMET.dome + 0.3, 'and the spike is short');
});

test('fitted to the real pilot it is held by the head bone, over the head: the cap round the top of it, the guard in front of the face', async () => {
  const pilot = await loadModel('pilot-skeleton', 2.7, 0.2);
  const { box: head, bone } = measureHead(pilot);
  assert.equal(bone?.name, 'Head');
  // pilot-skeleton.glb's head at rest, in the file's units, as HELMET.fallback keeps it.
  for (const [key, at] of [['min', HELMET.fallback.min], ['max', HELMET.fallback.max]] as const) {
    head[key].toArray().forEach((value: number, i: number) => assert.ok(Math.abs(value - at[i]) < 0.005, `the head's ${key} ${head[key].toArray()}`));
  }
  const helmet = wearHelmet(buildHelmet(), pilot);
  assert.equal(helmet.parent, bone);
  const worn = boxIn(helmet, pilot);
  const cap = boxIn(helmet.getObjectByName('cap')!, pilot);
  const size = head.getSize(new THREE.Vector3());
  // The cap is a little wider and deeper than the head, and its top just clears the top of it.
  assert.ok(cap.max.z - cap.min.z > size.z && cap.max.z - cap.min.z < size.z * 1.25, 'as wide as the head and a little more');
  assert.ok(cap.max.x - cap.min.x > size.x && cap.max.x - cap.min.x < size.x * 1.25, 'as deep as the head and a little more');
  assert.ok(cap.max.y > head.max.y && cap.max.y < head.max.y + 0.03, `its crown at ${cap.max.y} over the head's top at ${head.max.y}`);
  assert.ok(cap.min.y > head.min.y + 0.4 * size.y, 'it sits on the head, not over the face');
  assert.ok(Math.abs(worn.getCenter(new THREE.Vector3()).z - head.getCenter(new THREE.Vector3()).z) < 1e-3, 'square on the head');
  // The guard hangs at the front (the pilot faces +x), in front of the face and down to the nose.
  const guard = boxIn(helmet.getObjectByName('guard')!, pilot);
  assert.ok(guard.max.x > head.max.x, 'the guard is in front of the face');
  assert.ok(guard.min.y < cap.min.y && guard.min.y > head.min.y, 'and hangs below the brow, short of the chin');
});

test('the helmet turns with the head and leans with the body, keeping its place on the head', async () => {
  const pilot = await loadModel('pilot-skeleton', 2.7, 0.2);
  const helmet = wearHelmet(buildHelmet(), pilot);
  // The middle of all the guard's points, which moves with it as one piece.
  const guardAt = () => {
    const points = pointsIn(helmet.getObjectByName('guard')!, pilot);
    return points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
  };
  const boneAt = () => pilot.getObjectByName('Head')!.getWorldPosition(new THREE.Vector3()).applyMatrix4(pilot.matrixWorld.clone().invert());
  const before = guardAt();
  const reach = before.distanceTo(boneAt());
  pilot.getObjectByName('Head')!.rotateY(0.4);
  const turned = guardAt();
  assert.ok(before.distanceTo(turned) > 0.01, 'the guard went round with the head');
  pilot.getObjectByName('Spine02')!.rotateX(0.2);
  const leant = guardAt();
  assert.ok(turned.distanceTo(leant) > 0.01, 'and over with the body');
  assert.ok(Math.abs(leant.distanceTo(boneAt()) - reach) < 1e-6, 'as far from the head bone as it was fitted');
});

test('a pilot with no head bone wears it held by the pilot itself, over where the head is in the file', () => {
  const pilot = new THREE.Group();
  pilot.scale.setScalar(2.7);
  pilot.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.67, 0.56)));
  const helmet = wearHelmet(buildHelmet(), pilot);
  assert.equal(helmet.parent, pilot);
  const worn = boxIn(helmet.getObjectByName('cap')!, pilot);
  const head = new THREE.Box3(new THREE.Vector3(...HELMET.fallback.min), new THREE.Vector3(...HELMET.fallback.max));
  assert.ok(worn.max.y > head.max.y && worn.min.y > head.min.y, 'on top of the head');
  assert.ok(Math.abs(worn.getCenter(new THREE.Vector3()).x - head.getCenter(new THREE.Vector3()).x) < 0.01, 'over the middle of it');
});

test('the owner\'s helmet.glb is worn when there is one, fitted by its own box; without one, or if it will not load, this file\'s own is made', async () => {
  const asked: [string, number, number | undefined][] = [];
  // A stand-in for the owner's file, as the loader hands models over: 1 wide, its base at the origin.
  const file = new THREE.Group();
  file.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)));
  const theirs = await makeHelmet((name, size, light) => {
    asked.push([name, size, light]);
    return Promise.resolve(file);
  });
  assert.equal(theirs, file);
  assert.equal(theirs.name, 'helmet');
  assert.deepEqual(asked, [['helmet', 1, HELMET.glow]]);
  // Fitted by its box: as wide as the head and a little more, its top at the crown.
  const head = new THREE.Box3(new THREE.Vector3(...HELMET.fallback.min), new THREE.Vector3(...HELMET.fallback.max));
  const placed = helmetPlacement(theirs, head);
  const box = new THREE.Box3().setFromObject(theirs).applyMatrix4(placed);
  const size = head.getSize(new THREE.Vector3());
  assert.ok(Math.abs(box.max.z - box.min.z - size.z * HELMET.room) < 1e-6);
  assert.ok(Math.abs(box.max.y - (head.max.y + HELMET.crown * size.y)) < 1e-6);
  // With no file, or a loader that fails in any way, the helmet is this file's own.
  for (const load of [() => Promise.reject(new Error('404')), () => { throw new Error('no loader'); }, null]) {
    const ours = await makeHelmet(load);
    assert.ok(ours.getObjectByName('guard'), 'the helmet made here');
  }
  // As the test loader has it, there is no helmet.glb yet.
  assert.ok((await makeHelmet(loadModel)).getObjectByName('spike'));
});
