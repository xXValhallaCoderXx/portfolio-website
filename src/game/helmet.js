// The Gjermundbu helmet: Good Lift's for the 1,000 lb club, worn wherever the visitor flies. The
// page fetches this only once the helmet is worn (scenery.js). It is public/models/helmet.glb if the
// owner has made one, and otherwise this file's own, low-poly after the helmet found at Gjermundbu in
// Norway: a rounded iron cap with a ridge over it from brow to nape, a band round its brow and
// another across its crown, a short spike where they meet, rivets, and the spectacle guard over the
// eyes and nose. No horns: no helmet of the Viking age had any.
import * as THREE from 'three';

export const HELMET = Object.freeze({
  // The bones the pilot's head is skinned to: the helmet is fitted over their vertices.
  bones: Object.freeze(['Head', 'FacialBone', 'L_Eye', 'R_Eye']),
  // How much wider and deeper than the head the cap is (it sits on a padded lining), and how far
  // above the top of the head its crown is and how far up the head its brow, both as shares of the
  // head's height from chin to crown.
  room: 1.12,
  crown: 0.05,
  brow: 0.57,
  // Where the head is when the pilot has no head bone to find, as a box in the pilot file's own
  // units (1 long, facing +x): pilot-skeleton.glb's own head, measured at rest.
  fallback: Object.freeze({ min: Object.freeze([-0.315, 0.48, -0.093]), max: Object.freeze([-0.116, 0.674, 0.093]) }),
  // The cap's iron and the trim's (bands, ridge, spike, rivets and guard), and how much light of
  // their own each has, so the helmet still reads at night as the pilot does (0.2).
  iron: 0x454b55,
  trim: 0x8d949e,
  glow: 0.22,
  // This file's own helmet is built in units of its cap's radius, facing +z: the brow at 0 and the
  // top of the cap at `dome`, a little flatter than half a sphere.
  dome: 0.9,
});

// The cap's outline from the brow at angle 0 to the crown at a quarter turn, as [radius, height]:
// a rounded dome that comes to a slight point.
function dome(angle) {
  const s = Math.sin(angle);
  return [Math.cos(angle), (HELMET.dome * (s + 0.05 * s ** 8)) / 1.05];
}

// The outward direction of the cap at `angle` up from the brow, as [across, up].
function outward(angle) {
  const across = HELMET.dome * Math.cos(angle);
  const up = Math.sin(angle);
  const length = Math.hypot(across, up);
  return [across / length, up / length];
}

// A strap over the crown, from the brow at `azimuth` (0 is the front) to the brow opposite:
// `width` across, standing `height` proud of the cap and `lift` off it. Each face is its own two
// triangles, so it shades flat whichever way it is wound.
function strap(azimuth, width, height, lift, samples = 24) {
  const ahead = [Math.sin(azimuth), Math.cos(azimuth)];
  const across = new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth)).multiplyScalar(width / 2);
  const rows = [];
  for (let i = 0; i <= samples; i++) {
    const t = -1 + (2 * i) / samples;
    const angle = ((1 - Math.abs(t)) * Math.PI) / 2;
    const side = t <= 0 ? 1 : -1;
    const [r, y] = dome(angle);
    const [out, up] = outward(angle);
    const normal = new THREE.Vector3(ahead[0] * side * out, up, ahead[1] * side * out);
    const base = new THREE.Vector3(ahead[0] * side * r, y, ahead[1] * side * r).addScaledVector(normal, lift);
    const top = base.clone().addScaledVector(normal, height);
    rows.push([base.clone().sub(across), base.clone().add(across), top.clone().add(across), top.clone().sub(across)]);
  }
  const points = [];
  const quad = (a, b, c, d) => points.push(a, b, c, a, c, d);
  for (let i = 0; i < samples; i++) {
    const [bl, br, tr, tl] = rows[i];
    const [nbl, nbr, ntr, ntl] = rows[i + 1];
    quad(tl, tr, ntr, ntl);
    quad(bl, tl, ntl, nbl);
    quad(tr, br, nbr, ntr);
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

// The spectacle guard: a plate hanging from under the brow band, round the eyes and down the nose,
// with an opening for each eye, bent round the face.
function guard() {
  const outline = new THREE.Shape();
  outline.moveTo(-0.66, 0.06);
  outline.lineTo(0.66, 0.06);
  outline.quadraticCurveTo(0.68, -0.2, 0.5, -0.34);
  outline.quadraticCurveTo(0.34, -0.42, 0.14, -0.32);
  outline.lineTo(0.1, -0.58);
  outline.lineTo(-0.1, -0.58);
  outline.lineTo(-0.14, -0.32);
  outline.quadraticCurveTo(-0.34, -0.42, -0.5, -0.34);
  outline.quadraticCurveTo(-0.68, -0.2, -0.66, 0.06);
  for (const side of [-1, 1]) {
    const eye = new THREE.Path();
    eye.absellipse(side * 0.36, -0.15, 0.17, 0.12, 0, Math.PI * 2, side < 0);
    outline.holes.push(eye);
  }
  const geometry = new THREE.ExtrudeGeometry(outline, { depth: 0.05, bevelEnabled: false, curveSegments: 6 });
  // Wrapped round the face: what was flat across the plate goes round an upright cylinder in front
  // of the eyes, keeping its length.
  const place = geometry.attributes.position;
  const radius = 0.97;
  for (let i = 0; i < place.count; i++) {
    const angle = place.getX(i) / radius;
    const r = radius + place.getZ(i);
    place.setXYZ(i, r * Math.sin(angle), place.getY(i), r * Math.cos(angle));
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Studs round the brow band, each a small octahedron, all in one geometry.
function rivets(count = 12) {
  const stud = new THREE.OctahedronGeometry(0.035);
  const parts = [];
  for (let i = 0; i < count; i++) {
    const around = ((i + 0.5) / count) * Math.PI * 2;
    parts.push(stud.clone().translate(Math.sin(around) * 1.09, 0.05, Math.cos(around) * 1.09));
  }
  const points = [];
  for (const part of parts) {
    const place = part.attributes.position;
    for (let i = 0; i < place.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(place, i));
    part.dispose();
  }
  stud.dispose();
  return new THREE.BufferGeometry().setFromPoints(points);
}

/**
 * This file's own helmet, about 1,200 triangles, in its own frame: its cap 1 across in radius, the
 * brow at y 0 and the top of the cap at HELMET.dome, facing +z. Its parts are named (cap, brow,
 * ridge, band, spike, rivets, guard); it owns its geometry and its two materials.
 */
export function buildHelmet() {
  const group = new THREE.Group();
  group.name = 'helmet';
  const iron = new THREE.MeshStandardMaterial({
    color: HELMET.iron, roughness: 0.55, metalness: 0.45, emissive: HELMET.iron, emissiveIntensity: HELMET.glow,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: HELMET.trim, roughness: 0.4, metalness: 0.6, emissive: HELMET.trim, emissiveIntensity: HELMET.glow,
    side: THREE.DoubleSide,
  });
  const steps = 9;
  const outline = [new THREE.Vector2(1, -0.04)];
  for (let k = 0; k <= steps; k++) {
    const [r, y] = dome((k / steps) * (Math.PI / 2));
    outline.push(new THREE.Vector2(k === steps ? 0 : r, y));
  }
  const band = [[1, -0.06], [1.075, -0.06], [1.085, 0.05], [1.075, 0.16], [1, 0.16]].map(([r, y]) => new THREE.Vector2(r, y));
  const parts = [
    ['cap', new THREE.LatheGeometry(outline, 20), iron],
    ['brow', new THREE.LatheGeometry(band, 24), trim],
    // The ridge stands tall from brow to nape; the band across the crown lies flatter.
    ['ridge', strap(0, 0.12, 0.07, 0.005), trim],
    ['band', strap(Math.PI / 2, 0.16, 0.035, 0.005), trim],
    ['spike', new THREE.ConeGeometry(0.06, 0.15, 6).translate(0, HELMET.dome + 0.11, 0), trim],
    ['rivets', rivets(), trim],
    ['guard', guard(), trim],
  ];
  for (const [name, geometry, material] of parts) {
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
  }
  // Where the cap is in this frame, for fitting it to a head.
  group.userData.cap = { radius: 1, brow: 0, crown: HELMET.dome };
  return group;
}

/**
 * The helmet to wear: the owner's public/models/helmet.glb through `load` (scenery.js's loadModel,
 * or a test's), or this file's own where there is none or it will not load.
 */
export async function makeHelmet(load) {
  try {
    const model = await load('helmet', 1, HELMET.glow);
    model.name = 'helmet';
    return model;
  } catch {
    return buildHelmet();
  }
}

/**
 * Where the head of `pilot` (the pilot model as loaded: the file's frame is its own) is, as a box in
 * that frame, and the bone it turns with: the vertices skinned mostly to HELMET.bones, as the pilot
 * stands now. A pilot with no skin or no head bone gives HELMET.fallback and no bone.
 */
export function measureHead(pilot) {
  pilot.updateMatrixWorld(true);
  const toPilot = pilot.matrixWorld.clone().invert();
  let skin = null;
  pilot.traverse((part) => {
    if (part.isSkinnedMesh) skin ??= part;
  });
  const bone = pilot.getObjectByName(HELMET.bones[0]) ?? null;
  const box = new THREE.Box3();
  if (skin && bone) {
    const marks = new Set(skin.skeleton.bones.flatMap((each, i) => (HELMET.bones.includes(each.name) ? [i] : [])));
    const { skinIndex, skinWeight } = skin.geometry.attributes;
    const index = new THREE.Vector4();
    const weight = new THREE.Vector4();
    const point = new THREE.Vector3();
    for (let i = 0; i < skinIndex.count; i++) {
      index.fromBufferAttribute(skinIndex, i);
      weight.fromBufferAttribute(skinWeight, i);
      let share = 0;
      for (let k = 0; k < 4; k++) if (marks.has(index.getComponent(k))) share += weight.getComponent(k);
      if (share < 0.5) continue;
      box.expandByPoint(skin.getVertexPosition(i, point).applyMatrix4(skin.matrixWorld).applyMatrix4(toPilot));
    }
  }
  if (!bone || box.isEmpty()) {
    box.min.fromArray(HELMET.fallback.min);
    box.max.fromArray(HELMET.fallback.max);
    return { box, bone: null };
  }
  return { box, bone };
}

/**
 * Where `helmet` goes over a head in `box` (measureHead's), as a matrix in the pilot file's frame:
 * turned to face +x as the pilot does, the cap HELMET.room times as wide and as deep as the head,
 * its brow HELMET.brow of the way up the head and its crown HELMET.crown over the top. A helmet from
 * a file has no cap marked in it, so it keeps its own shape: as wide as that, its top at the crown,
 * over the middle of the head.
 */
export function helmetPlacement(helmet, box) {
  const size = box.getSize(new THREE.Vector3());
  const middle = box.getCenter(new THREE.Vector3());
  const crown = box.max.y + HELMET.crown * size.y;
  const brow = box.min.y + HELMET.brow * size.y;
  const facing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const { cap } = helmet.userData;
  if (cap) {
    // Turned a quarter, the helmet's own x lies along the file's z and its z along the file's x.
    const scale = new THREE.Vector3(
      (size.z * HELMET.room) / (2 * cap.radius),
      (crown - brow) / (cap.crown - cap.brow),
      (size.x * HELMET.room) / (2 * cap.radius),
    );
    const at = new THREE.Vector3(middle.x, brow - cap.brow * scale.y, middle.z);
    return new THREE.Matrix4().compose(at, facing, scale);
  }
  helmet.position.set(0, 0, 0);
  helmet.quaternion.identity();
  helmet.scale.set(1, 1, 1);
  helmet.updateMatrixWorld(true);
  const own = new THREE.Box3().setFromObject(helmet);
  const ownSize = own.getSize(new THREE.Vector3());
  const ownMiddle = own.getCenter(new THREE.Vector3());
  const scale = (size.z * HELMET.room) / Math.max(ownSize.x, 1e-6);
  // A point (x, y, z) of the helmet's own goes to (z, y, -x) times the scale, before the move.
  const at = new THREE.Vector3(middle.x - ownMiddle.z * scale, crown - own.max.y * scale, middle.z + ownMiddle.x * scale);
  return new THREE.Matrix4().compose(at, facing, new THREE.Vector3(scale, scale, scale));
}

/**
 * Puts `helmet` on `pilot`'s head as the pilot stands now (the glider sets its joints back to rest
 * first): fitted there, then held by the head bone so it turns with the head and leans with the
 * body. With no head bone it is held by the pilot itself, over where the head is in the file.
 * Returns the helmet.
 */
export function wearHelmet(helmet, pilot) {
  const { box, bone } = measureHead(pilot);
  const onPilot = helmetPlacement(helmet, box);
  const holder = bone ?? pilot;
  const onHolder = holder.matrixWorld.clone().invert().multiply(pilot.matrixWorld).multiply(onPilot);
  onHolder.decompose(helmet.position, helmet.quaternion, helmet.scale);
  holder.add(helmet);
  return helmet;
}
