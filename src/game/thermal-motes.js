import * as THREE from 'three';
import { CLOUD_HUNT } from './cloudbase-state.js';

// Rising air made visible. Each thermal of a Good Lift run is a stream of small warm comets, a soft
// head with a short tail below it, the wind streaks' idea (wind-streaks.js) turned upright: pale
// blue going sideways is wind, gold going up is lift. The motes are fixed in the world and carried
// up by the run's own lift at their radius, so a circling pilot sees them stream up on the core's
// side and hold or sink past on the far one, which is the centring cue. They crowd the core, rise
// and swirl fastest there, fill out from it as a thermal blooms and thin from the rim as it wears
// or ages. This module only draws: what each thermal is doing comes from the run's state on every
// update, and nothing here is read back by the run. Distances are metres, speeds metres/second,
// sizes CSS pixels, times seconds, and alpha runs from 0 to 1 before the glow, which starts at 0.3.
export const THERMAL_MOTES = Object.freeze({
  // Motes per thermal: the launch column's, and each hunted thermal's (3,584 vertices in all).
  count: Object.freeze({ launch: 384, hunted: 256 }),
  // The window each is drawn in: `span` metres tall from `below` metres under the pilot, as the
  // sparks before them. The launch column is tall enough to read as a column from the gate.
  launch: Object.freeze({ span: 240, below: 100 }), hunted: Object.freeze({ span: 120, below: 40 }),
  // Metres from a hunted thermal's axis at which its motes are whole, and gone: from further off it
  // is the ravens that give it away. Ansuz stretches both (BLESSING.sparks in meet-runes.js).
  sight: Object.freeze([46, 85]),
  // Motes lie out to where the lift is this share of its best (30.6 m out in a hunted thermal, 30.3
  // m in the launch column), as many to a square metre as the lift to the power `crowd`: in a hunted
  // thermal 48% of them lie within 14 m and 77% within 20 m.
  reach: 0.1, crowd: 1.5,
  // A mote rises `flow` times as fast as the run's lift where it is, the wind streaks' flow: the
  // pilot is carried up by that same air, less the wing's own sink, so at 1 a centred circle would
  // see the core's motes all but hold still.
  flow: 1.5,
  // rad/s at the axis, turning the way the flock does; `eye` is the vortex's core as a share of the
  // thermal's radius, inside which it turns as one and outside which it slows: a full hunted
  // thermal goes round at 3.8 to 4.6 m/s from 8 m out to 24 m, so its tails lean 6° to 18°.
  swirl: 0.6, eye: 0.4,
  // The strength at which the first core motes start to show, and over how much of it each comes in.
  first: 0.08, soft: 0.08,
  // A head is `size` / metres away CSS pixels across (larger under Ansuz), never less than `width[0]`
  // nor more than `width[1]`. A tail is the last `exposure` seconds of the mote's own path on the
  // screen, `tail[0]` to `tail[1]` CSS pixels long, so a fast core mote draws a long one.
  size: 170, width: Object.freeze([1.5, 4]), tail: Object.freeze([4, 16]), exposure: 0.035,
  // Fades, each from dark at the first number to whole at the second: metres up from the foot of
  // the window and down from its top (`edge`), metres from the camera (`near`), and metres from the
  // line of sight between the camera and the middle of the glider, `rise` above the pilot (`clear`),
  // so that no mote crosses the wing in view.
  edge: Object.freeze([22, 28]), near: Object.freeze([6, 14]), clear: Object.freeze([1.5, 4]), rise: 3,
  // A tail's root is `trail` times as bright as its head, and a mote at the rim keeps `dim` of the
  // alpha of one at the core, so the core is where the heads are brightest.
  trail: 0.6, dim: 0.3,
  // Each mote dims by up to `twinkle` of itself and back, at `shimmer` radians a second.
  twinkle: 0.3, shimmer: Object.freeze([0.5, 1.3]),
  // A thermal cools from its look's gold to its ash as its strength falls from `cool[1]` to `cool[0]`.
  cool: Object.freeze([0.15, 0.7]),
  // The two looks, for the owner to choose between by `look`: warm gold, whose core heads at full
  // strength just reach the glow (linear luma 0.81 at alpha 0.5, 0.405), and pale dust, which never
  // does (0.76 at alpha 0.34, 0.26). `head` is a head's alpha; `gold` the head, `amber` the tail,
  // `ash` what a dying thermal cools to.
  looks: Object.freeze({
    gold: Object.freeze({ head: 0.5, gold: 0xffe6b0, amber: 0xffb45e, ash: 0xa9b4c0 }),
    dust: Object.freeze({ head: 0.34, gold: 0xe9e3d3, amber: 0xc9bfac, ash: 0x95a3b4 }),
  }),
  look: 'gold',
  // Each thermal's motes start this far up their ladder (m) and round their axis (rad) from the
  // slot before's, so the two hunted thermals, which share one layout, are never seen as copies.
  phase: Object.freeze([37, 2.4]),
  // The most seconds one frame moves the motes, so a stalled tab does not throw them.
  step: 0.1,
  // How much brighter the motes are drawn once the game has dropped its glow.
  unbloomed: 1.4,
  // Under reduced motion: the motes still rise and swirl, because both say something, but at the
  // air's own pace, slower round, and without a twinkle.
  calm: Object.freeze({ flow: 1, swirl: 0.36, twinkle: 0 }),
});

const TAU = Math.PI * 2;
// The golden angle: each mote this far round from the one before, so no two line up.
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
// A weak thermal's motes keep this share of a full one's alpha at strength 0, all of it at 1.
const FAINT = 0.55;
// How much of a mote's place in the order it shows in is left to chance (the rest is its lift).
const JITTER = 0.3;
// The run's lift across a launch column fades over this outer share of it (cloudbase-state.js keeps
// the same number private in its `profile`; a test pins the two together through run.sample()).
const LAUNCH_FADE = 0.55;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ease = (value) => value * value * (3 - 2 * value);
const smoothstep = (from, to, value) => ease(clamp((value - from) / (to - from), 0, 1));
const mix = (from, to, amount) => from + (to - from) * amount;
const fract = (value) => value - Math.floor(value);
const wrap = (value, span) => value - span * Math.floor(value / span);

// Roberts' R3 sequence, as wind-streaks.js spreads its streaks: the n-th point of an even spread
// through the unit cube, never close to an earlier one. Two more irrationals (Roberts' R2) spread
// each mote's twinkle without a generator.
const R3 = Object.freeze([0.8191725133961644, 0.671043606703789, 0.5497004779019701]);
const spread = (n, axis) => (0.5 + R3[axis] * (n + 1)) % 1;
const R2 = Object.freeze([0.7548776662466927, 0.5698402909980532]);

/**
 * How much of its best lift a thermal has at `share` of its radius out from its axis, 0 to 1: a
 * hunted thermal peaks at its very middle and fades over the whole radius, and the launch column is
 * flat across its core and fades over its outer 55%. A copy of the run's own `profile`.
 */
export function liftShare(hunted, share) {
  return ease(clamp((1 - share) / (hunted ? CLOUD_HUNT.core : LAUNCH_FADE), 0, 1));
}

/**
 * Where `count` motes of a hunted thermal, or of the launch column, sit and how each behaves: the
 * same every time, from fixed sequences and no generator. Each mote has two vec4s:
 *   seed    x: its radius as a share of the thermal's; y: its angle round the axis (rad); z: its
 *           place up the window, 0 to 1; w: the strength at which it starts to show
 *   trait   x: its lift share (it rises that share of the core's speed); y: its swirl share (it
 *           turns that share of the axis's rate); z: its twinkle's phase (rad); w: its rate (rad/s)
 * Radii come from the R3 sequence through the inverse of the share of motes within each radius
 * (lift to the power `crowd`, per square metre), angles go round by the golden angle, and the core's
 * motes show first: the strength a mote needs is mostly its lack of lift, and a little chance.
 */
export function layoutMotes(hunted, count) {
  const M = THERMAL_MOTES;
  // Out to where the lift falls to `reach` of its best, as a share of the radius.
  let inner = 0;
  let outer = 1;
  for (let n = 0; n < 60; n++) {
    const middle = (inner + outer) / 2;
    if (liftShare(hunted, middle) > M.reach) inner = middle;
    else outer = middle;
  }
  const edge = inner;
  // How many motes lie within each step out from the axis, summed: lift^crowd per square metre is
  // lift^crowd times the radius per metre of radius.
  const steps = 4096;
  const within = new Float64Array(steps + 1);
  const density = (share) => liftShare(hunted, share) ** M.crowd * share;
  for (let k = 1; k <= steps; k++) within[k] = within[k - 1] + (density(((k - 1) / steps) * edge) + density((k / steps) * edge)) / (2 * steps) * edge;
  const total = within[steps];

  const seed = new Float32Array(count * 4);
  const trait = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    // The radius below which this mote's share of all of them lies, found between two steps.
    const want = spread(i, 0) * total;
    let below = 0;
    let above = steps;
    while (above - below > 1) {
      const middle = (below + above) >> 1;
      if (within[middle] < want) below = middle;
      else above = middle;
    }
    const part = (want - within[below]) / (within[above] - within[below] || 1);
    const share = ((below + part) / steps) * edge;
    const lift = liftShare(hunted, share);
    const j = i * 4;
    seed[j] = share;
    seed[j + 1] = (i * GOLDEN) % TAU;
    seed[j + 2] = spread(i, 1);
    seed[j + 3] = M.first + (1 - M.first - M.soft) * mix(1 - lift, spread(i, 2), JITTER);
    trait[j] = lift;
    trait[j + 1] = (M.eye * M.eye) / (share * share + M.eye * M.eye);
    trait[j + 2] = TAU * fract(0.5 + R2[0] * (i + 1));
    trait[j + 3] = mix(M.shimmer[0], M.shimmer[1], fract(0.5 + R2[1] * (i + 1)));
  }
  return { hunted, count, seed, trait };
}

/**
 * Mote `i` of `layout` as the shader draws it, for tests and QA: a JavaScript twin of the vertex
 * shader, but for what the camera does to it. `u` holds the thermal's uniforms as plain numbers
 * (rise, turn, speed, spin, radius, foot, span, strength, near, clock, twinkle) and, optionally,
 * `x` and `z`, where its mesh stands. Into `out`: where the mote is (x, y, z, and `up` from the
 * window's foot), how it moves (vx, vy, vz, m/s), its alpha before the camera's fades (`alpha`) and
 * how far it has warmed from ash toward its look's colours (`warm`).
 */
export function moteAt(layout, i, u, out = {}) {
  const M = THERMAL_MOTES;
  const { seed, trait } = layout;
  const j = i * 4;
  const r = seed[j] * u.radius;
  const a = seed[j + 1] + u.turn * trait[j + 1];
  const up = wrap(seed[j + 2] * u.span + u.rise * trait[j] - u.foot, u.span);
  const round = r * u.spin * trait[j + 1];
  out.x = (u.x ?? 0) + Math.cos(a) * r;
  out.y = u.foot + up;
  out.z = (u.z ?? 0) + Math.sin(a) * r;
  out.up = up;
  out.vx = -Math.sin(a) * round;
  out.vy = u.speed * trait[j];
  out.vz = Math.cos(a) * round;
  out.alpha = u.near * smoothstep(seed[j + 3], seed[j + 3] + M.soft, u.strength)
    * smoothstep(0, M.edge[0], up) * (1 - smoothstep(u.span - M.edge[1], u.span, up))
    * (1 - u.twinkle * (0.5 + 0.5 * Math.sin(u.clock * trait[j + 3] + trait[j + 2])))
    * (M.dim + (1 - M.dim) * trait[j]) * (FAINT + (1 - FAINT) * u.strength);
  out.warm = smoothstep(M.cool[0], M.cool[1], u.strength);
  return out;
}

// A number as GLSL writes it, to six places and always with a point, so that it is never taken for
// an integer (and 1 - 0.55 is written 0.45).
const glsl = (value) => {
  const text = String(Number(value.toFixed(6)));
  return text.includes('.') ? text : `${text}.0`;
};

/**
 * The motes of every thermal in a run, as one group of instanced quads named `motes-0` (the launch
 * column) and `motes-1`, `motes-2` (hunted), drawn at render order `order`: cloudbase.js passes
 * ORDER.lift, after its fog and before every mark that must never be painted over. `sites` is how
 * many thermals the run holds (slot 0 the launch column), `calm` is for a visitor who asks for
 * reduced motion, and `flare` the least width in CSS pixels of a hunted thermal's heads while
 * lightning shows it (CLOUD_LIT.flare). `ownGeometry` and `ownMaterial` are the caller's
 * registries; everything made here goes through them, so the caller releases it with its own.
 *
 * All three draw with one shader text, so the launch column's first frame builds the program for
 * the lot. Each frame costs a few uniforms a thermal: no buffer is ever rewritten.
 */
export function createThermalMotes({ sites, order = 0, calm = false, flare = 3, ownGeometry, ownMaterial }) {
  const M = THERMAL_MOTES;
  const look = M.looks[M.look];
  const flow = calm ? M.calm.flow : M.flow;
  const swirl = calm ? M.calm.swirl : M.swirl;
  const group = new THREE.Group();
  group.name = 'thermals';

  // What every thermal's material shares, as the same objects: the screen's size and pixel ratio,
  // set as each is drawn, and the pilot, the clock and the look, set once a frame.
  const shared = {
    ndc: { value: new THREE.Vector2(1, 1) },
    dpr: { value: 1 },
    pilot: { value: new THREE.Vector3() },
    clock: { value: 0 },
    twinkle: { value: calm ? M.calm.twinkle : M.twinkle },
    boost: { value: 1 },
    opacity: { value: look.head },
    gold: { value: new THREE.Color(look.gold) },
    amber: { value: new THREE.Color(look.amber) },
    ash: { value: new THREE.Color(look.ash) },
  };
  // Seen from where the mote is: `pace` is how fast it crosses the screen (device pixels a second)
  // and `along` which way, from its own velocity in the world. The quad is laid along that way, its
  // head forward and its tail trailing back, so a head always leads and the tail says how fast the
  // air rises there. `ndc` is two over the size of what is drawn into, in device pixels.
  const vertexShader = `uniform float rise; uniform float turn; uniform float speed; uniform float spin;
    uniform float radius; uniform float foot; uniform float span; uniform float strength; uniform float near;
    uniform float sight; uniform float flare; uniform float clock; uniform float twinkle; uniform float dpr;
    uniform vec3 pilot; uniform vec2 ndc;
    attribute vec4 seed; attribute vec4 trait;
    varying vec3 vAt; varying float vTail; varying float vAlpha; varying float vWarm;
    void main() {
      float r = seed.x * radius;
      float a = seed.y + turn * trait.y;
      // The mote's height on a ladder that rises with the air, wrapped into the window at the foot.
      float up = mod(seed.z * span + rise * trait.x - foot, span);
      vec3 at = vec3(cos(a) * r, up, sin(a) * r);
      vec4 view = modelViewMatrix * vec4(at, 1.0);
      vec3 drift = mat3(modelViewMatrix) * vec3(-sin(a) * r * spin * trait.y, speed * trait.x, cos(a) * r * spin * trait.y);
      float w = max(0.5, -view.z);
      vec2 pace = vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * (drift.xy * w + view.xy * drift.z) / (w * w) / ndc;
      float fast = length(pace);
      vec2 along = fast > 1e-3 ? pace / fast : vec2(0.0, 1.0);
      float away = length(view.xyz);
      // Written as max(least, min(size, most)): GLSL leaves clamp() undefined once least > most.
      float head = dpr * max(mix(${glsl(M.width[0])}, ${glsl(flare)}, flare), min(${glsl(M.size)} * sight / away, ${glsl(M.width[1])}));
      float tail = dpr * clamp(fast * ${glsl(M.exposure)} / dpr, ${glsl(M.tail[0])}, ${glsl(M.tail[1])});
      vec4 clip = projectionMatrix * view;
      clip.xy += (vec2(-along.y, along.x) * position.x * 0.5 * head + along * mix(0.5 * head, -tail, position.y)) * ndc * clip.w;
      gl_Position = clip;
      vAt = vec3(position.x, mix(-0.5 * head, tail, position.y), 0.5 * head);
      vTail = tail;
      vec3 world = (modelMatrix * vec4(at, 1.0)).xyz;
      vec3 line = pilot - cameraPosition;
      vec3 nearest = cameraPosition + line * clamp(dot(world - cameraPosition, line) / max(dot(line, line), 1e-6), 0.0, 1.0);
      vAlpha = near * smoothstep(seed.w, seed.w + ${glsl(M.soft)}, strength)
        * smoothstep(0.0, ${glsl(M.edge[0])}, up) * (1.0 - smoothstep(span - ${glsl(M.edge[1])}, span, up))
        * smoothstep(${glsl(M.near[0])}, ${glsl(M.near[1])}, away) * smoothstep(${glsl(M.clear[0])}, ${glsl(M.clear[1])}, distance(world, nearest))
        * (1.0 - twinkle * (0.5 + 0.5 * sin(clock * trait.w + trait.z)))
        * (${glsl(M.dim)} + ${glsl(1 - M.dim)} * trait.x) * (${glsl(FAINT)} + ${glsl(1 - FAINT)} * strength);
      vWarm = smoothstep(${glsl(M.cool[0])}, ${glsl(M.cool[1])}, strength);
    }`;
  // A soft round head, and behind it a tail that narrows and fades: gold at the head and amber down
  // the tail, cooling to ash as the thermal weakens. Normal blending keeps the colour over the pale
  // fog and stops a crowded core from adding up into a blob.
  const fragmentShader = `uniform vec3 gold; uniform vec3 amber; uniform vec3 ash; uniform float opacity; uniform float boost;
    varying vec3 vAt; varying float vTail; varying float vAlpha; varying float vWarm;
    void main() {
      float disc = 1.0 - smoothstep(0.45 * vAt.z, vAt.z, length(vec2(vAt.x * vAt.z, vAt.y)));
      float trail = step(0.0, vAt.y) * (1.0 - smoothstep(0.5, 1.0, abs(vAt.x))) * pow(1.0 - clamp(vAt.y / vTail, 0.0, 1.0), 1.5);
      gl_FragColor = vec4(mix(ash, mix(amber, gold, disc), vWarm), min(1.0, max(disc, trail * ${glsl(M.trail)}) * opacity * vAlpha * boost));
      #include <colorspace_fragment>
    }`;

  // One quad, two triangles: across from -1 to 1, and from the head (0) back to the tail's end (1).
  function shape(layout) {
    const geometry = ownGeometry(new THREE.InstancedBufferGeometry());
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 2, 1, 2, 3, 1]), 1));
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0]), 3));
    geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(layout.seed, 4));
    geometry.setAttribute('trait', new THREE.InstancedBufferAttribute(layout.trait, 4));
    geometry.instanceCount = layout.count;
    return geometry;
  }

  // The renderer's pixel ratio can drop while the game runs, and the glow's buffers are the size of
  // the picture in device pixels; either way this is what the motes are drawn into.
  const drawn = new THREE.Vector2();
  function measure(renderer) {
    const target = renderer.getRenderTarget();
    if (target) drawn.set(target.width, target.height);
    else renderer.getDrawingBufferSize(drawn);
    shared.ndc.value.set(2 / Math.max(1, drawn.x), 2 / Math.max(1, drawn.y));
    shared.dpr.value = renderer.getPixelRatio();
  }

  // The launch column has a layout of its own; the hunted thermals share one, phased apart.
  const launch = layoutMotes(false, M.count.launch);
  const hunted = layoutMotes(true, M.count.hunted);
  const shapes = { launch: shape(launch), hunted: shape(hunted) };
  const views = [];
  for (let i = 0; i < sites; i++) {
    const isHunted = i > 0;
    const column = isHunted ? M.hunted : M.launch;
    const uniforms = {
      ...shared,
      rise: { value: 0 }, turn: { value: 0 }, speed: { value: 0 }, spin: { value: 0 },
      radius: { value: 1 }, foot: { value: 0 }, span: { value: column.span },
      strength: { value: 0 }, near: { value: 0 }, sight: { value: 1 }, flare: { value: 0 },
    };
    const material = ownMaterial(new THREE.ShaderMaterial({
      uniforms, vertexShader, fragmentShader,
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    }));
    const mesh = new THREE.Mesh(isHunted ? shapes.hunted : shapes.launch, material);
    mesh.name = `motes-${i}`;
    // The shader puts every mote far from the quad it starts as, so its bounds are never right.
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    mesh.visible = false;
    mesh.onBeforeRender = measure;
    group.add(mesh);
    views.push({ hunted: isHunted, mesh, uniforms, below: column.below, slot: i, rise: 0, turn: 0 });
  }
  // The run's clock at the last update, or -1 before a run's first.
  let clock = -1;

  /**
   * Draws every thermal for this frame. Nothing is allocated here.
   *
   *   time       the run's clock: it stands still while the run is paused, and so do the motes
   *   state      the run's state: its thermals and the fog
   *   pos        the pilot ({ x, y, z } or THREE.Vector3)
   *   sight      how many times as far as usual a hunted thermal's motes are seen, and as much
   *              larger for their distance: BLESSING.sparks under Ansuz, otherwise 1
   *   revealed   how much every hunted thermal shows from anywhere, 0 to 1: lightning's glimpse,
   *              which also holds its heads to `flare` pixels across
   *   bright     true once the game has dropped its glow, to make up for it
   */
  function update(time, state, pos, sight = 1, revealed = 0, bright = false) {
    // The phases are summed from the run's own steps, never worked out from the clock: lift that
    // weakens then slows its motes where they are, instead of making every one of them jump.
    const step = clock < 0 ? 0 : clamp(time - clock, 0, M.step);
    clock = time;
    shared.clock.value = time;
    shared.boost.value = bright ? M.unbloomed : 1;
    shared.pilot.value.set(pos.x, pos.y + M.rise, pos.z);
    for (let i = 0; i < views.length; i++) {
      const view = views[i];
      const thermal = state.thermals[i];
      // While a flock is still on its way, `x, z` is only where the lift is going to be.
      const strength = thermal.live && thermal.move === 0 ? thermal.strength : 0;
      // The core's speed: a mote rises its lift share of it, which is flow times the run's lift there.
      const speed = flow * thermal.s * (view.hunted ? CLOUD_HUNT.peak : 1) * strength;
      const spin = swirl * thermal.dir * strength;
      view.rise += speed * step;
      view.turn += spin * step;
      // A hunted thermal shows only from close by, or while lightning shows them all; the launch
      // column from anywhere.
      const near = view.hunted
        ? Math.max(1 - smoothstep(M.sight[0] * sight, M.sight[1] * sight, Math.hypot(pos.x - thermal.x, pos.z - thermal.z)), revealed)
        : 1;
      const u = view.uniforms;
      u.rise.value = view.rise;
      u.turn.value = view.turn;
      u.speed.value = speed;
      u.spin.value = spin;
      u.radius.value = thermal.r;
      u.strength.value = strength;
      u.near.value = near;
      u.sight.value = view.hunted ? sight : 1;
      u.flare.value = view.hunted ? revealed : 0;
      // The window starts under the pilot and never under the fog, which is drawn before the motes
      // and would otherwise be painted over by any that lay beneath it.
      const foot = Math.max(state.fogHeight, pos.y - view.below);
      u.foot.value = foot;
      view.mesh.position.set(thermal.x, foot, thermal.z);
      view.mesh.visible = strength > M.first && near > 0.01;
    }
  }

  // Hides every thermal until the next update, and starts each one's motes from its own place, so
  // a new run never opens on the last one's.
  function clear() {
    clock = -1;
    for (let i = 0; i < views.length; i++) {
      const view = views[i];
      view.mesh.visible = false;
      view.rise = view.slot * M.phase[0];
      view.turn = view.slot * M.phase[1];
    }
  }

  clear();
  return { group, update, clear };
}
