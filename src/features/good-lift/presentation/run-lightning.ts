import type { PresentationOptions } from './rendering.types.ts';
import type { CloudbaseRun } from '../../../domains/good-lift/models.ts';
import type { Vector3 } from '../../../domains/flight/models.ts';
type SkyState = CloudbaseRun['state'];
// Lightning in Good Lift's storm clouds. Once the pilot has climbed among them (above
// CLOUD_STORM.floor), every 9 to 20 seconds one they can see flashes: a bolt runs down out of it,
// the cloud lights from within (cloudbase.js), the sky behind it brightens, and the thunder comes
// as long after as sound takes from the bolt. For half a second every hidden thermal's motes show
// as if close by (cloudbase.js again): a glimpse of where the lift is, for whoever is looking. A
// visitor who asks for less motion gets the bolt, the cloud's glow and the glimpse in one soft
// swell, with no flicker and no flash of the sky.
//
// It is the view's alone. When and where it strikes come from random numbers of its own, which
// nothing in the run reads, so a run flies the same, bit for bit, with it or without (run-step.js).
// One bolt and one flash of the sky are made once and reused for every strike; nothing is made while
// a run is drawn, and with no strike showing nothing is drawn at all.
import * as THREE from 'three';
import { CLOUD_STORM } from '../../../domains/good-lift/cloudbase-state.ts';
import { ORDER } from './cloudbase.ts';

export const LIGHTNING = Object.freeze({
  // s spent above CLOUD_STORM.floor between one strike and the next, and s before looking again
  // when no cloud is fit to strike from.
  every: Object.freeze([9, 20]), retry: 1.5,
  // A cloud strikes once it has grown to `formed` of its size, while the run's view draws it whole
  // (not thinned for being in the camera's way), from `range` metres away over the ground, with
  // the place the bolt leaves it on the screen and `room` metres at least between that and the fog.
  formed: 0.6, range: Object.freeze([70, 420]), room: 80,
  // The main stroke leaves the cloud `inside` of the way down its lower half (hidden in it, so it
  // seems to come out of the cloud) and runs `drop` metres down, never lower than `above` metres
  // over the fog, its foot up to `lean` of its length aside. It is split in two `levels` times,
  // each middle pushed aside by up to `wander` of the piece's length (a third of that up or down),
  // which is what makes it jagged. `forks` branch off its upper two thirds, each `fork` metres long,
  // split `forkLevels` times and leaving at between `spread` radians from straight down.
  inside: 0.5, drop: Object.freeze([150, 280]), above: 12, lean: 0.3, levels: 4, wander: 0.3,
  forks: Object.freeze([1, 3]), fork: Object.freeze([30, 80]), forkLevels: 3, spread: Object.freeze([0.45, 1]),
  // m across the white-hot channel at the top of the main stroke and of a fork (`width`), narrowing
  // to `taper` of that at the foot, as its heat does; the ribbon drawn is `halo` times as wide, for
  // the light round it. Widths are for a bolt `seen` metres off and grow with distance, held between
  // `grow` times that, so a far bolt is still a line and a near one never a slab. WebGL draws lines
  // one pixel wide whatever is asked, so the bolt is a ribbon of triangles.
  width: Object.freeze({ main: 1.4, fork: 0.6 }), taper: 0.4, halo: 4, seen: 200, grow: Object.freeze([0.6, 1.8]),
  // How much brighter than its colour the channel is drawn, for the glow pass (which starts at 0.3).
  hot: 2,
  // s a strike lasts on screen, the restrike and the glow after it included.
  last: 0.6,
  // How bright the sky gets toward the bolt at the strike, added to the night, and `wide` of that
  // away from it. The sky is lit on a dome `dome` metres round the camera, inside its far plane.
  sky: 0.3, wide: 0.15, dome: 2400,
  // s: every hidden thermal's motes show as if close for `reveal[0]`, then fade out over `reveal[1]`.
  reveal: Object.freeze([0.5, 0.25]),
  // s a calm visitor's strike takes to come up: the bolt, the cloud's glow and the glimpse of the
  // lift all swell in together over it, with nothing shown at once.
  swell: 0.12,
  // m/s: the thunder comes this much later for every metre to the nearest part of the bolt.
  sound: 343,
  // The bolt's violet-white light and white core, and the sky's flash: never amber or red, which
  // in this game mean lift and danger.
  colour: 0xa9b2ff, core: 0xffffff, skyColour: 0x8f9cff,
});

// Joints in the main stroke and in each fork, and the most a bolt has.
const MAIN = (1 << LIGHTNING.levels) + 1;
const FORK = (1 << LIGHTNING.forkLevels) + 1;
const JOINTS = MAIN + LIGHTNING.forks[1] * FORK;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

/**
 * How bright a strike is `t` seconds after it struck, 0 to 1: a stroke, a dip, a restrike and a
 * glow dying away. That is two flashes, and strikes come at least nine seconds apart, well under
 * the three flashes a second that can bring on a seizure. For a visitor who asks for `calm`, one
 * soft swell, never more than 0.55.
 */
export function flashAt(t: number, calm = false) {
  if (!(t >= 0 && t < LIGHTNING.last)) return 0;
  if (calm) return 0.55 * Math.min(1, t / LIGHTNING.swell) * (1 - t / LIGHTNING.last) ** 2;
  if (t < 0.05) return 1;
  if (t < 0.09) return 0.3;
  if (t < 0.15) return 0.9;
  return 0.9 * Math.exp(-(t - 0.15) / 0.1);
}

/** How brightly the struck cloud is lit from within, 0 to 1: with the strike, but never fading faster. */
export function glowAt(t: number, calm = false) {
  if (!(t >= 0 && t < LIGHTNING.last)) return 0;
  if (calm) return 0.6 * Math.min(1, t / LIGHTNING.swell) * (1 - t / LIGHTNING.last) ** 1.5;
  return t < 0.15 ? flashAt(t) : Math.max(flashAt(t), 0.9 * (1 - (t - 0.15) / (LIGHTNING.last - 0.15)) ** 2);
}

/**
 * How much of every hidden thermal shows `t` seconds after a strike, 0 to 1: all of it at once,
 * then fading. For a visitor who asks for `calm` it comes up with the strike's swell instead, and
 * fades the same.
 */
export function revealAt(t: number, calm = false) {
  const [hold, fade] = LIGHTNING.reveal;
  if (!(t >= 0)) return 0;
  const shown = t < hold ? 1 : Math.max(0, 1 - (t - hold) / fade);
  return calm ? shown * Math.min(1, t / LIGHTNING.swell) : shown;
}

// Splits the stroke of 2^levels + 1 joints from joint `first` (its two ends already set) in two,
// and each half in two, `levels` times over: each new middle is pushed aside, and a little up or
// down, by up to `wander` of the length of the piece it splits.
function split(joints: ArrayLike<number> & { [index: number]: number }, first: number, levels: number, random: () => number) {
  const n = 1 << levels;
  for (let size = n; size > 1; size >>= 1) {
    const half = size >> 1;
    for (let i = half; i < n; i += size) {
      const a = (first + i - half) * 3;
      const b = (first + i + half) * 3;
      const m = (first + i) * 3;
      const dx = joints[b] - joints[a];
      const dy = joints[b + 1] - joints[a + 1];
      const dz = joints[b + 2] - joints[a + 2];
      const aside = LIGHTNING.wander * Math.sqrt(dx * dx + dy * dy + dz * dz);
      joints[m] = (joints[a] + joints[b]) / 2 + (random() * 2 - 1) * aside;
      joints[m + 1] = (joints[a + 1] + joints[b + 1]) / 2 + ((random() * 2 - 1) * aside) / 3;
      joints[m + 2] = (joints[a + 2] + joints[b + 2]) / 2 + (random() * 2 - 1) * aside;
    }
  }
}

/**
 * Lays a bolt out into `joints` (x, y, z for each): its main stroke first, MAIN joints from
 * (x, y, z) down `drop` metres but never below `floor`, then its forks, FORK joints each, each from
 * a joint of the main stroke. `random` gives numbers from 0 to 1. Returns how many forks it laid.
 */
export function layBolt(x: number, y: number, z: number, drop: number, floor: number, random: { (): number; (): number; (): number; }, joints: number[]|Float32Array) {
  const L = LIGHTNING;
  const bottom = Math.max(y - drop, floor);
  const lean = L.lean * (y - bottom) * random();
  const turn = random() * Math.PI * 2;
  joints[0] = x;
  joints[1] = y;
  joints[2] = z;
  joints[(MAIN - 1) * 3] = x + Math.cos(turn) * lean;
  joints[(MAIN - 1) * 3 + 1] = bottom;
  joints[(MAIN - 1) * 3 + 2] = z + Math.sin(turn) * lean;
  split(joints, 0, L.levels, random);
  const forks = L.forks[0] + Math.floor(random() * (L.forks[1] - L.forks[0] + 1));
  for (let f = 0; f < forks; f++) {
    const first = MAIN + f * FORK;
    const from = (2 + Math.floor(random() * (MAIN - 6))) * 3;
    const length = mix(L.fork[0], L.fork[1], random());
    const tilt = mix(L.spread[0], L.spread[1], random());
    const way = random() * Math.PI * 2;
    const start = first * 3;
    const end = (first + FORK - 1) * 3;
    joints[start] = joints[from];
    joints[start + 1] = joints[from + 1];
    joints[start + 2] = joints[from + 2];
    joints[end] = joints[from] + Math.sin(tilt) * Math.cos(way) * length;
    joints[end + 1] = joints[from + 1] - Math.cos(tilt) * length;
    joints[end + 2] = joints[from + 2] + Math.sin(tilt) * Math.sin(way) * length;
    split(joints, first, L.forkLevels, random);
  }
  // Nothing of it reaches down into the fog.
  for (let i = 0; i < MAIN + forks * FORK; i++) joints[i * 3 + 1] = Math.max(joints[i * 3 + 1], floor);
  return forks;
}

/**
 * Writes the ribbon of the stroke of `count` joints from joint `first` into `place` (x, y, z) and
 * `heat` (how hot, 0 to 1), two vertices a joint from vertex 2 * `first`: either side of the stroke
 * as seen from `eye`, `width` metres of channel at the top narrowing to `taper` of it at the foot
 * (the ribbon `halo` times as wide), and as hot as `warmth` at the top, cooling the same way.
 */
export function ribbon(joints: number[]|Float32Array, first: number, count: number, eye: Vector3, width: number, warmth: number, place: Float32Array | number[], heat: number[]|Float32Array) {
  for (let j = 0; j < count; j++) {
    const i = (first + j) * 3;
    const a = (first + Math.max(0, j - 1)) * 3;
    const b = (first + Math.min(count - 1, j + 1)) * 3;
    // Along the stroke, and toward the eye: across is square to both.
    const tx = joints[b] - joints[a];
    const ty = joints[b + 1] - joints[a + 1];
    const tz = joints[b + 2] - joints[a + 2];
    const vx = eye.x - joints[i];
    const vy = eye.y - joints[i + 1];
    const vz = eye.z - joints[i + 2];
    let sx = ty * vz - tz * vy;
    let sy = tz * vx - tx * vz;
    let sz = tx * vy - ty * vx;
    let length = Math.sqrt(sx * sx + sy * sy + sz * sz);
    // Seen straight along its length a stroke has no sides, so any level line will do.
    if (length < 1e-9) {
      sx = 1;
      sy = sz = 0;
      length = 1;
    }
    const cool = mix(1, LIGHTNING.taper, j / (count - 1));
    const half = (width * cool * LIGHTNING.halo) / 2 / length;
    const v = (first + j) * 6;
    place[v] = joints[i] - sx * half;
    place[v + 1] = joints[i + 1] - sy * half;
    place[v + 2] = joints[i + 2] - sz * half;
    place[v + 3] = joints[i] + sx * half;
    place[v + 4] = joints[i + 1] + sy * half;
    place[v + 5] = joints[i + 2] + sz * half;
    heat[(first + j) * 2] = heat[(first + j) * 2 + 1] = warmth * cool;
  }
}

/**
 * `calm` is a visitor who asks for less motion. `random` gives the view's own numbers from 0 to 1
 * (never the run's): Math.random in the game, a fixed sequence in tests.
 */
export function createLightning({ scene, calm = false, random = Math.random }: Pick<PresentationOptions, 'scene' | 'calm'> & { random?: () => number }) {
  let root: THREE.Group<THREE.Object3DEventMap>|null = null;
  let bolt: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null;
  let dome: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null;
  let disposed = false;
  // Whether a frame has been drawn with the bolt and the sky's flash in it yet (see draw()).
  let warmed = false;
  // The bolt's joints, as laid out (x, y, z), and its ribbon's vertices and their heat.
  const joints = new Float32Array(JOINTS * 3);
  let place!: Float32Array;
  let heat!: Float32Array;
  // The last strike and what it is doing now, for the run's view and sounds and for whoever asks
  // (QA): seconds above the floor before the next is tried (NaN until the pilot first climbs
  // there), strikes so far, when the last struck (run seconds) and from which cloud slot (-1 none),
  // where the bolt left it, how many forks it had, how far its nearest part was from the pilot (m),
  // when its thunder reaches the pilot (NaN once heard, or with none coming), and this frame's
  // brightness of the bolt, of the struck cloud and of the glimpse of the lift.
  const state = {
    wait: NaN, strikes: 0, at: -Infinity, slot: -1, x: 0, y: 0, z: 0, forks: 0, near: 0, thunder: NaN,
    flash: 0, glow: 0, reveal: 0,
  };
  // What the last update was handed, so a strike can be called by hand between updates.
  const last: { time: number; pos: Vector3 | null; sky: SkyState | null; camera: THREE.PerspectiveCamera | null; seen: ((slot: number) => boolean) | null } = { time: 0, pos: null, sky: null, camera: null, seen: null };
  const frustum = new THREE.Frustum();
  const sight = new THREE.Matrix4();
  const point = new THREE.Vector3();

  function build() {
    root = new THREE.Group();
    root.name = 'Lightning';
    scene.add(root);
    place = new Float32Array(JOINTS * 6);
    heat = new Float32Array(JOINTS * 2);
    // Which side of the channel each vertex is: -1 and 1 in turn, for good.
    const across = new Float32Array(JOINTS * 2);
    for (let v = 0; v < across.length; v++) across[v] = v % 2 ? 1 : -1;
    // Two triangles for each piece of each stroke: the main stroke's first, then each fork's.
    const order: number[] = [];
    const strip = (first: number, count: number) => {
      for (let j = 0; j < count - 1; j++) {
        const v = (first + j) * 2;
        order.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    };
    strip(0, MAIN);
    for (let f = 0; f < LIGHTNING.forks[1]; f++) strip(MAIN + f * FORK, FORK);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(place, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('heat', new THREE.BufferAttribute(heat, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('across', new THREE.BufferAttribute(across, 1));
    geometry.setIndex(order);
    // Nothing of it until a strike lays it out.
    geometry.setDrawRange(0, 0);
    // Light, so added to what is behind it: a white-hot channel down the middle of the ribbon (the
    // share 1 / `halo` of it), and its violet glow fading out to the edges.
    const material = new THREE.ShaderMaterial({
      uniforms: {
        flash: { value: 0 }, colour: { value: new THREE.Color(LIGHTNING.colour) }, core: { value: new THREE.Color(LIGHTNING.core) },
      },
      vertexShader: `attribute float across; attribute float heat; varying float offset; varying float warmth;
        void main() {
          offset = across;
          warmth = heat;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `uniform float flash; uniform vec3 colour; uniform vec3 core; varying float offset; varying float warmth;
        void main() {
          float d = abs(offset);
          float channel = 1.0 - smoothstep(${(0.5 / LIGHTNING.halo).toFixed(3)}, ${(1.5 / LIGHTNING.halo).toFixed(3)}, d);
          float glow = (1.0 - d) * (1.0 - d) * 0.5;
          float alpha = min(1.0, (channel + glow) * warmth * flash);
          if (alpha < 0.003) discard;
          gl_FragColor = vec4(mix(colour, core, channel) * ${LIGHTNING.hot.toFixed(1)}, alpha);
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    bolt = new THREE.Mesh(geometry, material);
    bolt.name = 'bolt';
    // Its vertices are rewritten for every strike, so the bounds it was built with mean nothing.
    bolt.frustumCulled = false;
    // It always ends above the fog, which would otherwise paint over it.
    bolt.renderOrder = ORDER.aboveFog;
    bolt!.visible = false;
    root.add(bolt);

    // The sky's flash: light added to the night behind everything solid, so the hills and the other
    // clouds stand dark against it, brightest toward the bolt and over the horizon.
    dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.ShaderMaterial({
      uniforms: {
        flash: { value: 0 }, toward: { value: new THREE.Vector3(0, 1, 0) }, colour: { value: new THREE.Color(LIGHTNING.skyColour) },
      },
      vertexShader: `varying vec3 direction;
        void main() {
          direction = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `uniform float flash; uniform vec3 toward; uniform vec3 colour; varying vec3 direction;
        void main() {
          vec3 d = normalize(direction);
          float facing = max(dot(d, toward), 0.0);
          float light = (${LIGHTNING.wide.toFixed(2)} + ${(1 - LIGHTNING.wide).toFixed(2)} * facing * facing * facing) * (0.4 + 0.6 * smoothstep(-0.2, 0.3, d.y));
          gl_FragColor = vec4(colour, light * flash);
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.BackSide,
    }));
    dome.name = 'sky-flash';
    dome.scale.setScalar(LIGHTNING.dome);
    dome.frustumCulled = false;
    // Before every other see-through thing: it is the sky they are seen against.
    dome.renderOrder = -1;
    dome!.visible = false;
    root.add(dome);
  }

  /** Builds on the first call and shows the group on every call; the next strike waits for the climb. */
  function begin() {
    if (disposed) return;
    if (!root) build();
    root!.visible = true;
    bolt!.visible = dome!.visible = false;
    state.wait = state.thunder = NaN;
    state.at = -Infinity;
    state.slot = -1;
    state.strikes = state.forks = state.near = state.flash = state.glow = state.reveal = 0;
    last.time = 0;
  }

  const between = ([from, to]: readonly number[]) => from + (to - from) * random();
  // Metres between where a bolt leaves a cloud and the lowest it may reach, over the fog.
  const roomUnder = (cloud: { y: number; ry: number; fade: number; }, sky: SkyState) => cloud.y - LIGHTNING.inside * cloud.ry * cloud.fade - sky.fogHeight - LIGHTNING.above;

  // A cloud fit to strike from, chosen evenly among all that are, or -1. Strictly (`loose` 0): the
  // run's view draws it whole, it is within range over the ground, and where the bolt leaves it is
  // in the camera's view. Looser, for a strike called by hand: 1 drops the range and the view, and 2
  // whether it is drawn. Every one is grown, with room under it for a bolt.
  function pick(sky: SkyState, pos: Vector3, camera: THREE.PerspectiveCamera, seen: ((slot: number) => boolean) | null, loose: number) {
    if (loose === 0) frustum.setFromProjectionMatrix(sight.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let chosen = -1;
    let fit = 0;
    for (let i = 0; i < sky.clouds.length; i++) {
      const cloud = sky.clouds[i];
      if (cloud.fade < LIGHTNING.formed) continue;
      if (loose < 2 && seen && !seen(i)) continue;
      if (roomUnder(cloud, sky) < LIGHTNING.room) continue;
      if (loose === 0) {
        const dx = cloud.x - pos.x;
        const dz = cloud.z - pos.z;
        const flat = Math.sqrt(dx * dx + dz * dz);
        if (flat < LIGHTNING.range[0] || flat > LIGHTNING.range[1]) continue;
        // Just under the cloud as it is drawn, where the bolt first shows.
        if (!frustum.containsPoint(point.set(cloud.x, cloud.y - 1.5 * cloud.ry * cloud.fade, cloud.z))) continue;
      }
      // Each fit cloud as likely as any other, with no list made: the n-th replaces the choice
      // with a chance of one in n.
      fit += 1;
      if (random() * fit < 1) chosen = i;
    }
    return chosen;
  }

  // Lays the bolt out of cloud `slot`, turns its ribbon to face `eye`, and starts its flash and its
  // thunder at run time `time`.
  function strike(sky: SkyState, slot: number, time: number, pos: Vector3, eye: { x: number; y: number; z: number; }) {
    const cloud = sky.clouds[slot];
    const x = cloud.x + (random() - 0.5) * cloud.rx * cloud.fade * 0.6;
    const z = cloud.z + (random() - 0.5) * cloud.rz * cloud.fade * 0.6;
    const y = cloud.y - LIGHTNING.inside * cloud.ry * cloud.fade;
    const drop = between(LIGHTNING.drop);
    const forks = layBolt(x, y, z, drop, sky.fogHeight + LIGHTNING.above, random, joints);
    const dx = x - eye.x;
    const dy = y - drop / 2 - eye.y;
    const dz = z - eye.z;
    const scale = clamp(Math.sqrt(dx * dx + dy * dy + dz * dz) / LIGHTNING.seen, LIGHTNING.grow[0], LIGHTNING.grow[1]);
    ribbon(joints, 0, MAIN, eye, LIGHTNING.width.main * scale, 1, place, heat);
    for (let f = 0; f < forks; f++) ribbon(joints, MAIN + f * FORK, FORK, eye, LIGHTNING.width.fork * scale, 0.7, place, heat);
    const { attributes } = bolt!.geometry;
    attributes.position.needsUpdate = true;
    attributes.heat.needsUpdate = true;
    bolt!.geometry.setDrawRange(0, 6 * (MAIN - 1 + forks * (FORK - 1)));
    // Thunder starts from the whole bolt at once, so the first of it is heard from the nearest part.
    let near = Infinity;
    for (let i = 0; i < MAIN + forks * FORK; i++) {
      const ax = joints[i * 3] - pos.x;
      const ay = joints[i * 3 + 1] - pos.y;
      const az = joints[i * 3 + 2] - pos.z;
      near = Math.min(near, Math.sqrt(ax * ax + ay * ay + az * az));
    }
    state.strikes += 1;
    state.at = time;
    state.slot = slot;
    state.x = x;
    state.y = y;
    state.z = z;
    state.forks = forks;
    state.near = near;
    state.thunder = time + near / LIGHTNING.sound;
    // The sky flashes brightest toward the upper part of the bolt, where it leaves the cloud.
    dome!.material.uniforms.toward.value.set(x - eye.x, y - drop * 0.3 - eye.y, z - eye.z).normalize();
  }

  // The strike as it is at run time `time`: how bright the bolt, the cloud and the sky are, and how
  // much of the lift shows. With none showing nothing is drawn.
  function draw(time: number, eye: Vector3) {
    const age = time - state.at;
    state.flash = flashAt(age, calm);
    state.glow = glowAt(age, calm);
    state.reveal = revealAt(age, calm);
    bolt!.visible = state.flash > 0;
    bolt!.material.uniforms.flash.value = state.flash;
    dome!.visible = !calm && state.flash > 0;
    dome!.material.uniforms.flash.value = state.flash * LIGHTNING.sky;
    if (dome!.visible) dome!.position.copy(eye);
    if (warmed) return;
    // The first frame of the first run draws both with nothing in them (no triangles of the bolt,
    // and no light in the sky), so that their shaders are built while the title card is up rather
    // than at the first strike, which a phone can stall on.
    warmed = true;
    bolt!.visible = true;
    dome!.visible = !calm;
    dome!.position.copy(eye);
  }

  /**
   * `time` is the run's clock, `pos` the pilot, `run` the run (or its state), `camera` the camera
   * drawn with, and `seen(slot)` whether the run's view drew that storm cloud whole last frame
   * (cloudbase.js's `shown`); without it every cloud is taken to be. Nothing is allocated here.
   */
  function update(time: number, pos: Vector3, run: CloudbaseRun | SkyState, camera: THREE.PerspectiveCamera, seen: ((slot: number) => boolean) | null = null) {
    if (!root || !root.visible || disposed) return;
    const sky = 'state' in run ? run.state : run;
    const dt = time > last.time ? time - last.time : 0;
    last.time = time;
    last.pos = pos;
    last.sky = sky;
    last.camera = camera;
    last.seen = seen;
    // The clock runs only while the pilot is up among the clouds and out of them.
    if (pos.y > CLOUD_STORM.floor && !(sky.pilot.cloud > 0)) {
      if (Number.isNaN(state.wait)) state.wait = between(LIGHTNING.every);
      state.wait -= dt;
      if (state.wait <= 0) {
        const slot = pick(sky, pos, camera, seen, 0);
        if (slot >= 0) strike(sky, slot, time, pos, camera.position);
        state.wait = slot >= 0 ? between(LIGHTNING.every) : LIGHTNING.retry;
      }
    }
    draw(time, camera.position);
  }

  /**
   * A strike now, for a look (QA): from storm cloud `slot` if it is grown with some room under it,
   * or else from one chosen as the clock would, or failing that any grown cloud with room under it,
   * however far, wherever it is and at whatever height. Returns the slot it struck from, or -1 with
   * no cloud to strike from (or before the first update). The clock then starts again.
   */
  function fire(slot = -1) {
    if (!root || !root.visible || disposed || !last.sky) return -1;
    const { sky, pos, camera, seen } = last;
    const asked = sky.clouds[slot];
    let chosen = asked && asked.fade >= LIGHTNING.formed && roomUnder(asked, sky) > LIGHTNING.room / 4 ? slot : -1;
    for (let loose = 0; chosen < 0 && loose < 3; loose++) chosen = pick(sky, pos!, camera!, seen, loose);
    if (chosen < 0) return -1;
    strike(sky, chosen, last.time, pos!, camera!.position);
    state.wait = between(LIGHTNING.every);
    draw(last.time, camera!.position);
    return chosen;
  }

  /** Whether the last strike's thunder has reached the pilot by run time `time`: true once, then not again. */
  function hear(time: number) {
    if (!(state.thunder <= time)) return false;
    state.thunder = NaN;
    return true;
  }

  function reset() {
    if (root) root.visible = false;
    state.thunder = NaN;
    state.flash = state.glow = state.reveal = 0;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    root?.removeFromParent();
    for (const mesh of [bolt, dome]) {
      mesh?.geometry.dispose();
      mesh?.material.dispose();
    }
    root = bolt = dome = null;
    last.pos = last.sky = last.camera = last.seen = null;
  }

  return {
    begin, update, fire, hear, reset, dispose,
    get root() { return root; },
    get state() { return state; },
  };
}
