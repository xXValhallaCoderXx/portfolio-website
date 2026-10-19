import type { PresentationOptions } from './rendering.types.ts';
import type { Vector3 } from '../../../domains/flight/models.ts';
// Chalk: a small white puff from the pilot's hands as a plate or a rep loads onto the bar, as a
// lifter chalks up. It is Good Lift's first rung of kit, a tonne banked (good-lift-store.js), and is
// switched on and off in the kit tab. Built like the meet's own view (meet-view.js): nothing until
// the first begin(), one root of its own, a fixed pool of grains, and nothing allocated while a run
// is drawn. It only ever reads the meet. Visitors who ask for less motion never see it.
import * as THREE from 'three';
import { ORDER } from './cloudbase.ts';

// A puff is `grains` specks thrown out from the hands, `lift` metres above the pilot's middle, at up
// to `burst` m/s, which the air takes off them at `drag` a second while they sink at `sink` m/s.
// Each grows from `size` to `spread` metres across and fades out over `life` seconds, from an
// opacity of `opacity`. Up to `puffs` hang in the air at once (a pickup comes about every second
// at most): one more takes the oldest one's place. A grain `scale` metres across fills that many
// pixels a metre from the camera, before it is held to `pixels`.
export const CHALK = Object.freeze({
  puffs: 4, grains: 14, life: 0.9, burst: 2.6, drag: 3.2, sink: 0.5, size: 0.45, spread: 1.5,
  colour: 0xf4f6fa, opacity: 0.7, lift: 0.4, scale: 700, pixels: Object.freeze([1, 64]),
});

// Which way each grain of a puff flies and how hard, the same for every puff: spread round the
// hands more than up and down, as chalk clapped off the palms goes. A fixed sequence (the golden
// angle round, evenly up and down), so that no puff waits on a random number.
function directions() {
  const out = new Float32Array(CHALK.grains * 4);
  for (let g = 0; g < CHALK.grains; g++) {
    const up = 1 - (2 * (g + 0.5)) / CHALK.grains;
    const around = g * 2.399963;
    const flat = Math.sqrt(1 - up * up);
    out[g * 4] = Math.cos(around) * flat;
    out[g * 4 + 1] = up * 0.45;
    out[g * 4 + 2] = Math.sin(around) * flat;
    out[g * 4 + 3] = 0.55 + 0.45 * ((g * 7) % CHALK.grains) / CHALK.grains;
  }
  return out;
}

/** `calm` is the visitor asking for less motion: then no chalk is ever drawn. */
export function createChalk({ scene, calm = false }: Pick<PresentationOptions, 'scene' | 'calm'>) {
  let root: THREE.Group | null = null;
  let points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null;
  let disposed = false;
  // Whether the kit has the chalk on, and what the last update saw: the plates and reps loaded,
  // and the run's clock.
  let wearing = false;
  const seen = { loads: 0, time: 0 };
  // Where each puff started and when, oldest first to be taken.
  const puffs = Array.from({ length: CHALK.puffs }, () => ({ x: 0, y: 0, z: 0, at: -Infinity }));
  const ways = directions();
  let place!: Float32Array;
  let fade!: Float32Array;
  let size!: Float32Array;
  // Whether any grain was drawn last frame, so that a sky with no chalk in it costs nothing.
  let shown = false;

  function build() {
    root = new THREE.Group();
    root.name = 'Chalk';
    scene.add(root);
    const count = CHALK.puffs * CHALK.grains;
    place = new Float32Array(count * 3);
    fade = new Float32Array(count);
    size = new Float32Array(count);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(place, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('fade', new THREE.BufferAttribute(fade, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    // Soft round specks of dust laid over what is behind them: chalk is no light, so it is drawn as
    // white, not added.
    const material = new THREE.ShaderMaterial({
      uniforms: { colour: { value: new THREE.Color(CHALK.colour) }, scale: { value: CHALK.scale } },
      vertexShader: `attribute float fade; attribute float size; uniform float scale; varying float shade;
        void main() {
          shade = fade;
          vec4 view = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * view;
          gl_PointSize = fade > 0.0 ? clamp(scale * size / max(1.0, -view.z), ${CHALK.pixels[0].toFixed(1)}, ${CHALK.pixels[1].toFixed(1)}) : 0.0;
        }`,
      fragmentShader: `uniform vec3 colour; varying float shade;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = shade * (1.0 - smoothstep(0.3, 1.0, d));
          if (a <= 0.0) discard;
          gl_FragColor = vec4(colour, a);
        }`,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    points = new THREE.Points(geometry, material);
    points.name = 'chalk-grains';
    points.renderOrder = ORDER.aboveFog;
    // Its places are written each frame, so the bounds it was built with mean nothing.
    points.frustumCulled = false;
    root.add(points);
  }

  /** Whether the kit has the chalk on (from the next pickup); never for a visitor asking for calm. */
  function wear(on: boolean) {
    wearing = on === true && !calm;
  }

  /** Builds on the first call and shows the group on every call, with no chalk in the air. */
  function begin() {
    if (disposed) return;
    if (!root) build();
    root!.visible = true;
    seen.loads = 0;
    seen.time = 0;
    for (const puff of puffs) puff.at = -Infinity;
    fade.fill(0);
    points!.geometry.attributes.fade.needsUpdate = true;
    shown = false;
  }

  /** Starts a puff at (x, y, z) at run time `time` (the last update's, by default) in the oldest one's place. */
  function puff(x: number, y: number, z: number, time = seen.time) {
    if (!root || disposed || calm) return;
    let oldest = puffs[0];
    for (const each of puffs) if (each.at < oldest.at) oldest = each;
    oldest.x = x;
    oldest.y = y;
    oldest.z = z;
    oldest.at = time;
  }

  /**
   * `time` is the run's clock, `pos` the pilot and `meet` the meet's state (or the module that
   * holds it): a plate or a rep loaded since the last update puffs from the hands. Nothing is
   * allocated here.
   */
  function update(time: number, pos: Vector3, meet: { plates: number; reps: number } | { state: { plates: number; reps: number } }) {
    if (!root || !root.visible || disposed) return;
    const lift = 'state' in meet ? meet.state : meet;
    const loads = lift.plates + lift.reps;
    if (loads > seen.loads && wearing) puff(pos.x, pos.y + CHALK.lift, pos.z, time);
    seen.loads = loads;
    seen.time = time;
    let any = false;
    for (let p = 0; p < puffs.length; p++) {
      const { x, y, z, at } = puffs[p];
      const age = time - at;
      const alive = age >= 0 && age < CHALK.life;
      any ||= alive;
      // Out from the hands as the air slows them, and sinking all the while.
      const out = alive ? (CHALK.burst * (1 - Math.exp(-CHALK.drag * age))) / CHALK.drag : 0;
      const t = alive ? age / CHALK.life : 1;
      const left = 1 - t;
      for (let g = 0; g < CHALK.grains; g++) {
        const i = p * CHALK.grains + g;
        if (!alive) {
          fade[i] = 0;
          continue;
        }
        const reach = out * ways[g * 4 + 3];
        place[i * 3] = x + ways[g * 4] * reach;
        place[i * 3 + 1] = y + ways[g * 4 + 1] * reach - CHALK.sink * age;
        place[i * 3 + 2] = z + ways[g * 4 + 2] * reach;
        // In within a few hundredths of a second, then thinning out as it spreads.
        fade[i] = CHALK.opacity * Math.min(1, age / 0.05) * left * Math.sqrt(left);
        size[i] = CHALK.size + (CHALK.spread - CHALK.size) * (1 - left * left);
      }
    }
    if (!any && !shown) return;
    shown = any;
    const { attributes } = points!.geometry;
    attributes.position.needsUpdate = true;
    attributes.fade.needsUpdate = true;
    attributes.size.needsUpdate = true;
  }

  function reset() {
    if (root) root!.visible = false;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    root?.removeFromParent();
    points?.geometry.dispose();
    points?.material.dispose();
    root = points = null;
  }

  return {
    begin, wear, puff, update, reset, dispose,
    get root() { return root; },
    get wearing() { return wearing; },
    /** How many puffs are in the air at the last update's time. */
    get live() {
      return puffs.filter((each) => seen.time - each.at >= 0 && seen.time - each.at < CHALK.life).length;
    },
  };
}
