import * as THREE from 'three';

// The ravens that circle in Cloudbase's hidden thermals. Where each bird is, which way it faces
// and how hard it is working all come from the simulation (cloudbase-state.js); this module only
// draws them. Distances are metres, angles radians, and `beat` is wingbeats a second.
export const RAVEN = Object.freeze({
  // Wingtip to wingtip, about three and a half times life size: a real raven would be a few
  // pixels wide from across the zone.
  span: 4.6,
  // Self-light handed to loadModel. The file's feathers are near-black and would vanish against
  // the night; this much lifts them to a dark slate that still reads as a raven up close. Much
  // more and the bird turns into a gull. From across the zone it is the mark below that shows a
  // bird, not its body.
  glow: 1.6,
  // The bird in the file rears nose-up by about 32 degrees, wings and all; this levels it.
  tilt: 0.55,
  // Where the levelled, turned model goes so that the middle of the bird is on the simulated
  // point, in spans. The file's origin is the tip of the tail.
  centre: Object.freeze([0, -0.187, 0.085]),
  // Culling sphere in the file's own units: centred between the shoulders and wide enough for the
  // wingtips in every pose (the farthest feather reaches 0.51).
  sphere: Object.freeze([0.003, 0.263, 0.026, 0.56]),
  beat: 2.8,
  // Each bird is this fraction of a beat ahead of the one before, so a flock never flaps as one.
  stagger: 0.618,
  // A soaring bird gives a few beats at half effort every `lazy[0]` to `lazy[1]` seconds.
  lazy: Object.freeze([7, 11]),
  // The far-off mark on each bird as it shows on screen, and the red of one about to cross the
  // pilot's path before `flare` lights it up.
  glint: 0xc9a8ff,
  threat: 0xff546b,
  // A threat's marks are lit this many times over. Plain, the red is little more than half as
  // bright as the violet and falls under the brightness at which the game's glow starts (0.3),
  // so a bird would lose its halo and go dim just as it turned dangerous. Lit like this it is as
  // bright as a calm mark. Red is then past what a screen can show, so the heart of the mark
  // comes out a paler red (about 0xff6c89) and the glow around it carries the colour.
  flare: 1.7,
  // A mark is drawn this far toward the camera from the middle of its bird, so that the bird's
  // own body and wings never cover it.
  proud: 2.8,
});

// The four joints of each wing, from the body outward: shoulder, elbow, wrist, hand. `side` is +1
// for the wing on the file's +x and -1 for the other, and mirrors every turn.
export const RAVEN_WINGS = Object.freeze([
  Object.freeze({ side: 1, bones: Object.freeze(['bone_13', 'bone_14', 'bone_15', 'bone_16']) }),
  Object.freeze({ side: -1, bones: Object.freeze(['bone_22', 'bone_23', 'bone_24', 'bone_25']) }),
]);

const TAU = Math.PI * 2;
const smoothstep = (from, to, value) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};
const fract = (value) => value - Math.floor(value);

// The file's bird faces +z with +y up, reared back by `tilt`: this is the way its beak points,
// and the line each wing swings about.
const NOSE = new THREE.Vector3(0, Math.sin(RAVEN.tilt), Math.cos(RAVEN.tilt));

// `toLocal` turns an axis of the file's frame into the frame this bone is posed in.
function jointOf(bone) {
  return bone ? { bone, rest: bone.quaternion.clone(), toLocal: bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert() } : null;
}

const spin = new THREE.Quaternion();
const axis = new THREE.Vector3();

// Turns a joint away from its resting pose, about an axis given in the raven file's frame.
// With `more`, the turn is added to whatever the joint was last given instead.
function turnJoint(joint, about, angle, more = false) {
  axis.copy(about).applyQuaternion(joint.toLocal);
  if (!more) joint.bone.quaternion.copy(joint.rest);
  joint.bone.quaternion.premultiply(spin.setFromAxisAngle(axis, angle));
}

// Picks out the eight wing joints of a raven model, as two wings of { side, shoulder, elbow,
// wrist, hand }. Must run while the model is still unturned and not yet inside anything that is
// turned, so that its bones can be read in the file's own frame; its size does not matter. A
// file without the bones comes back with no rig at all.
export function rigRaven(model) {
  model.updateMatrixWorld(true);
  const wings = [];
  for (const { side, bones } of RAVEN_WINGS) {
    const [shoulder, elbow, wrist, hand] = bones.map((name) => jointOf(model.getObjectByName(name)));
    if (!shoulder || !elbow || !wrist || !hand) return null;
    wings.push({ side, shoulder, elbow, wrist, hand });
  }
  return wings;
}

// How hard bird number `index` is beating at `time`, from 0 (wings held out) to 1. `flap` is the
// effort the simulation asks for; on top of it a soaring bird gives two or three lazy beats every
// so often. The pulse is worked out from the clock alone, so nothing has to be remembered.
export function ravenEffort(time, index, flap) {
  const every = RAVEN.lazy[0] + (RAVEN.lazy[1] - RAVEN.lazy[0]) * fract(0.618 * index);
  const turn = fract(time / every + 0.37 * index);
  const lazy = smoothstep(0, 0.03, turn) * (1 - smoothstep(0.07, 0.1, turn));
  return Math.max(flap, 0.5 * lazy);
}

// Where bird number `index` is in its wingbeat at `time`, as an angle.
const beatOf = (time, index) => TAU * (time * RAVEN.beat + index * RAVEN.stagger);

// How far a wing is lifted at the shoulder: positive is up. A soaring wing only sways a little;
// a working one beats about a line just below level.
function wingLift(time, index, effort) {
  const sway = 0.03 * Math.sin(0.9 * time + 2.4 * index);
  return sway - 0.12 * effort + 0.62 * effort * Math.sin(beatOf(time, index));
}

// Poses both wings of a rigged raven: `wings` is what rigRaven returned, `time` is in seconds
// (the run's clock, so the birds freeze when the run is paused), `index` is the bird's number in
// the flock and sets its place in the beat, and `effort` runs from 0 (soaring) to 1 (flying
// hard). Each joint out along the wing follows a little behind the one before it, which is what
// makes the wing roll through its beat instead of swinging like a board.
export function poseRaven(wings, time, index, effort) {
  const beat = beatOf(time, index);
  const lift = wingLift(time, index, effort);
  for (let i = 0; i < wings.length; i++) {
    const wing = wings[i];
    turnJoint(wing.shoulder, NOSE, wing.side * lift);
    turnJoint(wing.elbow, NOSE, wing.side * 0.22 * effort * Math.sin(beat - 0.6));
    turnJoint(wing.wrist, NOSE, wing.side * 0.3 * effort * Math.sin(beat - 1.2));
    turnJoint(wing.hand, NOSE, wing.side * (0.08 * (1 - effort) + 0.26 * effort * Math.sin(beat - 1.7)));
  }
}

// Turns a loaded raven to fly the way its holder points (forward is -z, like the glider) and
// gives it a culling sphere that holds while it flaps: three would otherwise measure one in the
// resting pose and never again. The rig must already have been taken. The model's scale is its
// span in metres, as loadModel leaves it.
export function seatRaven(model) {
  const [x, y, z, radius] = RAVEN.sphere;
  model.rotation.order = 'YXZ';
  model.rotation.set(RAVEN.tilt, Math.PI, 0);
  model.position.set(RAVEN.centre[0], RAVEN.centre[1], RAVEN.centre[2]).multiplyScalar(model.scale.x);
  model.traverse((part) => {
    if (part.isSkinnedMesh) part.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, y, z), radius);
  });
  return model;
}

// The whole flock: one holder per simulated raven with a paper dart in it until the models come,
// and one set of far-off marks. `count` is how many ravens the run holds and `sites` how many
// thermals; `order` is the render order of the marks. `ownGeometry` and `ownMaterial` are the
// caller's registries; everything made here goes through them, so the caller releases it along
// with its own. The models belong to whoever loaded them, except for each one's skeleton, which
// dispose() releases.
export function createRavens({ count, sites, order = 0, ownGeometry, ownMaterial }) {
  const group = new THREE.Group();
  group.name = 'ravens';
  const birds = [];
  const skeletons = new Set();
  // For each thermal: whether its flock is leading the pilot to new lift (see update), and how
  // strong it was at the last update.
  const leading = new Uint8Array(sites);
  const before = new Float64Array(sites);

  // Half a dart: nose, tail and one wingtip. Each bird uses it twice, once mirrored, so that the
  // two halves can flap.
  const half = ownGeometry(new THREE.BufferGeometry());
  half.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, -0.26 * RAVEN.span,
    0, 0, 0.22 * RAVEN.span,
    0.5 * RAVEN.span, 0, 0.1 * RAVEN.span,
  ]), 3));
  const paper = ownMaterial(new THREE.MeshBasicMaterial({ color: 0x6c769c, side: THREE.DoubleSide }));
  for (let i = 0; i < count; i++) {
    const holder = new THREE.Group();
    holder.name = `raven-${i}`;
    holder.rotation.order = 'YXZ';
    holder.visible = false;
    const right = new THREE.Mesh(half, paper);
    const left = new THREE.Mesh(half, paper);
    left.scale.x = -1;
    const dart = new THREE.Group();
    dart.add(right, left);
    holder.add(dart);
    group.add(holder);
    birds.push({ holder, dart, right, left, wings: null });
  }

  // One point per bird, so a flock can be found from across the zone when the birds themselves
  // are a few dark pixels. It is not fogged, never smaller than four CSS pixels, and violet so
  // that it is neither a thermal's amber spark nor a star.
  const spots = ownGeometry(new THREE.BufferGeometry());
  const places = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const glows = new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
  const threats = new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
  spots.setAttribute('position', places);
  spots.setAttribute('glow', glows);
  spots.setAttribute('threat', threats);
  const glints = new THREE.Points(spots, ownMaterial(new THREE.ShaderMaterial({
    uniforms: {
      pixel: { value: 1 },
      proud: { value: RAVEN.proud },
      calm: { value: new THREE.Color(RAVEN.glint) },
      alarm: { value: new THREE.Color(RAVEN.threat).multiplyScalar(RAVEN.flare) },
    },
    vertexShader: `uniform float pixel; uniform float proud; attribute float glow; attribute float threat;
      varying float shine; varying float danger;
      void main() {
        shine = glow;
        danger = threat;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        float away = max(1.0, length(view.xyz));
        // 4 to 10 CSS pixels, and a bird about to cross the pilot's path a little larger.
        gl_PointSize = pixel * clamp(230.0 / away, 4.0, 10.0) * (1.0 + 0.6 * threat);
        view.xyz *= 1.0 - min(proud, 0.5 * away) / away;
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `uniform vec3 calm; uniform vec3 alarm; varying float shine; varying float danger;
      void main() {
        float reach = length(gl_PointCoord - 0.5) * 2.0;
        gl_FragColor = vec4(mix(calm, alarm, danger), (1.0 - smoothstep(0.0, 1.0, reach)) * shine);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: false,
  })));
  glints.name = 'glints';
  // The points are moved by rewriting the buffer, so their bounds are never right.
  glints.frustumCulled = false;
  // When the marks are drawn is for the caller to say. Cloudbase has them drawn after its fog,
  // which would otherwise paint over them: see ORDER in cloudbase.js.
  glints.renderOrder = order;
  // The renderer's pixel ratio can drop while the game runs; the floor is in CSS pixels.
  glints.onBeforeRender = (renderer) => {
    glints.material.uniforms.pixel.value = renderer.getPixelRatio();
  };
  group.add(glints);

  // Swaps the darts for loaded models, one per bird. Nothing is touched, and false comes back,
  // unless every model has its wing bones.
  function adopt(models) {
    if (models.length < birds.length) return false;
    const rigs = [];
    for (let i = 0; i < birds.length; i++) {
      const wings = rigRaven(models[i]);
      if (!wings) return false;
      rigs.push(wings);
    }
    for (let i = 0; i < birds.length; i++) {
      const bird = birds[i];
      const model = seatRaven(models[i]);
      model.traverse((part) => {
        if (part.isSkinnedMesh) skeletons.add(part.skeleton);
      });
      bird.holder.remove(bird.dart);
      bird.holder.add(model);
      bird.wings = rigs[i];
    }
    return true;
  }

  // Puts every bird where the simulation has it. `time` is the run's clock and `state` the run's
  // state: its ravens, the thermals they mark and the fog.
  function update(time, state) {
    const { ravens, thermals, fogHeight } = state;
    // A flock on its way to new lift has no lift under it at all and is exactly what the pilot
    // has to follow, so its marks are at their brightest. They stay there after it lands, until
    // the new lift is at full strength: left to the lift alone they would drop to their dimmest
    // in the frame the birds arrive, just when the pilot should commit. Lift that falters before
    // it is full lets go as well, so a mark never stays bright over lift that is dying.
    for (let i = 0; i < leading.length; i++) {
      const thermal = thermals[i];
      if (thermal.move > 0) leading[i] = 1;
      else if (thermal.strength >= 0.99 || thermal.strength < before[i]) leading[i] = 0;
      before[i] = thermal.strength;
    }
    for (let i = 0; i < birds.length; i++) {
      const bird = birds[i];
      const raven = ravens[i];
      const thermal = thermals[raven.thermal];
      const shown = raven.fade > 0.01 && raven.y > fogHeight + 2;
      // The glider's own convention: yaw runs clockwise from north, and a positive bank drops
      // the right wing.
      bird.holder.position.set(raven.x, raven.y, raven.z);
      bird.holder.rotation.set(0, -raven.heading, -raven.bank);
      bird.holder.scale.setScalar(raven.fade);
      bird.holder.visible = shown;
      places.setXYZ(i, raven.x, raven.y, raven.z);
      // The mark dims as the lift under the bird dies, unless its flock is leading the way.
      glows.setX(i, shown ? raven.fade * (leading[raven.thermal] ? 1 : 0.35 + 0.65 * thermal.strength) : 0);
      threats.setX(i, raven.threat ? 1 : 0);
      if (!shown) continue;
      const effort = ravenEffort(time, i, raven.flap);
      if (bird.wings) poseRaven(bird.wings, time, i, effort);
      else {
        bird.right.rotation.z = wingLift(time, i, effort);
        bird.left.rotation.z = -bird.right.rotation.z;
      }
    }
    places.needsUpdate = glows.needsUpdate = threats.needsUpdate = true;
  }

  // Hides the flock until the next update and forgets where the last run's flocks were going, so
  // a new run never opens on the last one's birds.
  function clear() {
    for (let i = 0; i < birds.length; i++) {
      birds[i].holder.visible = false;
      glows.setX(i, 0);
      threats.setX(i, 0);
    }
    glows.needsUpdate = threats.needsUpdate = true;
    leading.fill(0);
  }

  function dispose() {
    skeletons.forEach((skeleton) => skeleton.dispose());
    skeletons.clear();
  }

  return { group, adopt, update, clear, dispose };
}
