import type { PresentationOptions } from './rendering.types.ts';
import type { CloudbaseRun } from '../../../domains/good-lift/models.ts';
import type { AirSample, Vector2, Vector3 } from '../../../domains/flight/models.ts';
type SkyState = CloudbaseRun['state'];
export interface GlideRingData extends Vector3 { startX: number; startY: number; startZ: number; windX: number; windZ: number; t: number; r: number }
export interface GlideReach { target: number; margin: number; word: string }
// The glide ring: how far the wing can glide hands up before the fog catches it, and whether that
// reaches lift. It is drawn where that glide meets the fog: a ring round the pilot as wide as the
// glide reaches, carried downwind by the breeze, hung at the height the fog will have climbed to by
// then, and only where there is fog under it. Cyan says go: a flock lies inside it. Amber, broken
// into dashes so that the colour is never the only sign, says climb first: none does. It shows in
// full while the pilot is out of lift and faintly while they climb.
//
// Hung where the glide meets the fog, rather than on the fog's surface as it is now, the ring is
// always a few degrees under the pilot's own level, where the chase camera looks (it looks 9° down
// and sees about 30° either way). On the surface it would be out of the bottom of the picture
// when the fog is close below the wing, just when the ring matters most. The maths is plain
// functions, tested by themselves; the view is one
// band. It only ever reads the run, so nothing a run flies depends on it.
import * as THREE from 'three';
import { FLIGHT } from '../../../domains/flight/flight.ts';
import { CLOUD_ZONE, cloudFogSpeed, cloudThermalRemaining } from '../../../domains/good-lift/cloudbase-state.ts';
import { FOG_SURFACE, ORDER } from './cloudbase.ts';
import { MEET } from '../../../domains/good-lift/meet-state.ts';
import { sampleAtmosphere } from '../../../domains/flight/atmosphere.ts';
import { surfaceAt } from '../../../domains/flight/ground.ts';
import { glideDuration, glidePathClear, movingLiftIntercept } from '../../../domains/flight/glide-math.ts';

export const GLIDE = Object.freeze({
  // The computed hands-up trim (flight.js) is about 11.6 m/s through the air and 1.3 m/s down.
  // The forecast uses that ordinary glide; moving lift, terrain clearance and the gently rising
  // fog decide whether a source remains reachable.
  speed: FLIGHT.speed.trim, sink: FLIGHT.sink.trim,
  // m over its surface at which the fog takes the wing: where the run's own step ends a run.
  catch: 3,
  // s: the fog's climb is walked forward this much at a time, its speed taken at both ends of each
  // step. The fog's speed rises smoothly to its five-minute cap, so half a second is
  // within centimetres of the run's own sixtieths.
  step: 0.5,
  // m: once the word is said, the flock has to be this far the other side of the ring to change it,
  // so a circle swinging the ring to and fro across a flock does not make it flicker.
  hold: 10,
  // s: a flock the pilot was in this lately is the one being ridden, and the word is about the next.
  leave: 8,
  // m: a ring smaller than this (half a second's glide) is drawn no more: the fog is there.
  least: 6,
  // The band: `tall` metres high and `grow` more for every metre of radius, so that it looks about
  // as thick at any size; `segments` round it, and `dashes` dashes when it is broken for climb first.
  tall: 0.5, grow: 0.01, segments: 128, dashes: 48,
  // How strongly it is drawn: `opacity[0]` out of lift and `opacity[1]` in it, out of lift being
  // under `lift[0]` m/s of rising air and in it over `lift[1]`. The view eases toward its opacity
  // at `ease` a second, and to a new word's colour and dashes at `turn` a second.
  opacity: Object.freeze([0.8, 0.22]), lift: Object.freeze([1, 3]), ease: 3, turn: 8,
  // Cyan for go, the site's own; amber for climb first, the colour this game gives lift.
  go: 0x2dd4ee, climb: 0xffb04a,
  // s: how long in all, each visit, the ring's word is said as a line of advice (good-lift.js).
});

// The ring's word as a line of advice, for a visitor still learning what its colours mean. Each
// fits one line of a narrow phone (hints.js's HINT_WIDTH).
export const GLIDE_LINES = Object.freeze({
  go: 'cyan ring: a flock is within glide reach',
  climb: 'amber ring: climb first, no flock in reach',
});

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const ease = (value: number) => value * value * (3 - 2 * value);
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;
const smoothstep = (from: number, to: number, value: number) => ease(clamp((value - from) / (to - from), 0, 1));
// m from the zone's middle to halfway across the fog's fading rim: a ring that only crosses the
// fog beyond this is too faint there to be worth drawing.
const FOG_SEEN = (FOG_SURFACE.radius * (1 + FOG_SURFACE.edge)) / 2;

/**
 * Seconds a glide hands up lasts before the fog catches the wing: from `y` metres, over fog at
 * `fogHeight` that is `elapsed` seconds into its run. The fog is walked forward with its own speed
 * (cloudFogSpeed), which increases gently to its five-minute cap, and
 * the wing sinks at trim. In still fog this would be the height to lose over the sink, so the
 * ring's radius would be that height times the trim glide ratio; the fog's climb shortens it.
 * At most `limit` seconds: a caller who stops caring past some radius says so.
 */
export function glideTime(y: number, fogHeight: number, elapsed: number, limit = 60, wing: Glide = GLIDE) {
  return glideDuration(y, fogHeight, elapsed, limit, {
    fogSpeed: cloudFogSpeed, sink: wing.sink, catchHeight: GLIDE.catch, step: GLIDE.step,
  });
}

/** How a wing glides hands up: its trim speed and sink (m/s). The classic wing's is GLIDE's own. */
export interface Glide { speed: number; sink: number }

/** Local ambient drift, with the same terrain shelter as the wing; brief gusts are not forecast. */
const breezePoint = { x: 0, y: 0, z: 0 };
const breezeWeather = { windX: 0, windZ: 0, thermals: [] };
export function breezeAt(state: SkyState, y: number, output: AirSample & Partial<Vector3> = {}, pos: Vector2 = state.pilot) {
  const out = output as ReturnType<typeof sampleAtmosphere> & Vector3;
  const levels = state.wind;
  let i = 0;
  while (i < levels.length - 2 && y >= levels[i + 1].y) i++;
  const amount = clamp((y - levels[i].y) / (levels[i + 1].y - levels[i].y), 0, 1);
  breezeWeather.windX = state.windEnabled === false ? 0 : mix(levels[i].x, levels[i + 1].x, amount);
  breezeWeather.windZ = state.windEnabled === false ? 0 : mix(levels[i].z, levels[i + 1].z, amount);
  breezePoint.x = pos?.x ?? CLOUD_ZONE.x; breezePoint.y = y; breezePoint.z = pos?.z ?? CLOUD_ZONE.z;
  sampleAtmosphere(breezePoint, breezeWeather, out);
  out.x = out.windX; out.y = out.windY; out.z = out.windZ;
  return out;
}

/**
 * Where a glide hands up from `pos` meets the fog, into `out`: after `t` seconds, `r` metres out
 * from (`x`, `z`), which is where the breeze `wind` ({ x, z } in m/s) has carried the pilot's own
 * place by then, at height `y`, which the fog will have climbed to. Since the breeze is slower
 * than the wing, every circle a shorter glide would draw lies inside this one: everywhere inside it
 * the wing reaches with height to spare, and on it just as the fog does. `run` is the run (or its
 * state); `limit` is as for glideTime.
 */
export function glideRing(run: CloudbaseRun | SkyState, pos: Vector3, wind: Vector2, output: Partial<GlideRingData>, limit = 60, wing: Glide = GLIDE): GlideRingData {
  const out = output as GlideRingData;
  const state = 'state' in run ? run.state : run;
  const t = glideTime(pos.y, state.fogHeight, state.elapsed, limit, wing);
  out.startX = pos.x; out.startY = pos.y; out.startZ = pos.z;
  out.windX = wind.x; out.windZ = wind.z;
  out.t = t;
  out.r = wing.speed * t;
  out.x = pos.x + wind.x * t;
  out.z = pos.z + wind.z * t;
  out.y = pos.y - wing.sink * t;
  return out;
}

/**
 * What the ring says, into `out`: `word` is 'go' while a flock lies inside it and 'climb' while
 * none does; `target` is the flock that lies furthest inside (a hunted thermal's slot, or -1 when
 * no flock counts) and `margin` how far inside its middle lies (m, negative outside). A flock counts
 * once its ravens have settled and its lift is up to MEET.alive, what the meet counts as lift; the
 * one in slot `skip` (the one being ridden, or -1) does not, since the question is where to go
 * next. `was` is the last word, which holds until the margin is GLIDE.hold metres the other way.
 */
export function glideWord(run: CloudbaseRun | SkyState, ring: Partial<GlideRingData> & Pick<GlideRingData, 'r' | 'x' | 'z'>, was: string, skip: number, output: Partial<GlideReach>, wing: Glide = GLIDE): GlideReach {
  const out = output as GlideReach;
  const { thermals } = 'state' in run ? run.state : run;
  let target = -1;
  let margin = -Infinity;
  for (let i = 1; i < thermals.length; i++) {
    const thermal = thermals[i];
    if (i === skip || !thermal.live || thermal.move > 0 || thermal.strength < MEET.alive) continue;
    let intercept = 0;
    let tx = thermal.x, tz = thermal.z;
    if (Number.isFinite(ring.startX)) {
      const start = { x: ring.startX!, y: ring.startY!, z: ring.startZ! };
      const reach = movingLiftIntercept(start, thermal, { x: ring.windX!, z: ring.windZ! }, {}, wing.speed);
      intercept = reach.seconds; tx = reach.x; tz = reach.z;
      if (intercept > ring.t! || intercept >= cloudThermalRemaining(thermal) - 4) continue;
      if (!glidePathClear(start, { x: tx, z: tz }, intercept, surfaceAt, 8, wing.sink)) continue;
    }
    const dx = tx - ring.x;
    const dz = tz - ring.z;
    const inside = ring.r - Math.sqrt(dx * dx + dz * dz);
    if (inside > margin) {
      margin = inside;
      target = i;
    }
  }
  const bar = was === 'go' ? -GLIDE.hold : was === 'climb' ? GLIDE.hold : 0;
  out.target = target;
  out.margin = margin;
  out.word = margin > bar ? 'go' : 'climb';
  return out;
}

/**
 * The ring as a band round the pilot. Built like the run's other views (cloudbase.js): nothing
 * until the first begin(), one root of its own, one mesh whose shape never changes (only where it
 * is, its size and four numbers in its material do), and nothing allocated while a run is drawn.
 */
export function createGlideRing({ scene }: Pick<PresentationOptions, 'scene'>) {
  let root: THREE.Group<THREE.Object3DEventMap>|null = null;
  let band: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null;
  let disposed = false;
  // Whether a frame has been drawn with the band in it yet (see update()).
  let warmed = false;
  // What the ring shows, for the view and for whoever asks (QA): whether it is drawn, its word and
  // the line that says it (or ''), the flock it was judged by and how far inside the ring that lies
  // (m), the glide's seconds, the ring's middle, radius and height, the breeze that carries it, how
  // strongly it is drawn and how far broken into dashes, and the flock being ridden.
  const state = {
    shown: false, word: '', line: '', target: -1, margin: -Infinity, t: 0, r: 0, x: 0, y: 0, z: 0,
    windX: 0, windZ: 0, opacity: 0, broken: 0, riding: -1, rodeAt: -Infinity,
  };
  const ring = { t: 0, r: 0, x: 0, y: 0, z: 0 };
  const wind = { x: 0, z: 0 };
  const reach = { target: -1, margin: -Infinity, word: '' };
  // How the wing being flown glides hands up: the classic wing's until a run says otherwise.
  const wing: Glide = { speed: GLIDE.speed, sink: GLIDE.sink };
  const tints = { go: new THREE.Color(GLIDE.go), climb: new THREE.Color(GLIDE.climb) };

  function build() {
    root = new THREE.Group();
    root.name = 'GlideRing';
    scene.add(root);
    // A band one metre round, one tall and open at both ends, sized and placed on every frame. It
    // is drawn only where the fog lies under it, fading out with the fog's own rim (cloudbase.js),
    // brightest along its middle, and broken into dashes as `broken` comes on.
    const material = new THREE.ShaderMaterial({
      uniforms: {
        colour: { value: new THREE.Color(GLIDE.go) }, opacity: { value: 0 }, broken: { value: 0 },
        zone: { value: new THREE.Vector2(CLOUD_ZONE.x, CLOUD_ZONE.z) },
      },
      vertexShader: `varying vec2 around; varying vec2 ground;
        void main() {
          around = uv;
          vec4 world = modelMatrix * vec4(position, 1.0);
          ground = world.xz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: `uniform vec3 colour; uniform float opacity; uniform float broken; uniform vec2 zone;
        varying vec2 around; varying vec2 ground;
        void main() {
          float fog = 1.0 - smoothstep(${FOG_SURFACE.edge.toFixed(2)}, 1.0, length(ground - zone) / ${FOG_SURFACE.radius.toFixed(2)});
          float across = 1.0 - abs(around.y * 2.0 - 1.0);
          float dash = 1.0 - broken * step(0.5, fract(around.x * ${GLIDE.dashes.toFixed(1)}));
          float alpha = opacity * fog * across * across * dash;
          if (alpha < 0.004) discard;
          gl_FragColor = vec4(colour, alpha);
        }`,
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, GLIDE.segments, 1, true), material);
    band.name = 'glide-ring';
    // Drawn after the fog, which would otherwise paint over it where the pilot looks down on it.
    band.renderOrder = ORDER.aboveFog;
    // It rings the camera whenever it is up, so there is nothing to gain by testing it against the view.
    band.frustumCulled = false;
    band!.visible = false;
    root.add(band);
  }

  /** Builds on the first call and shows the group on every call, with nothing of the last run's ring. */
  function begin() {
    if (disposed) return;
    if (!root) build();
    root!.visible = true;
    band!.visible = false;
    state.shown = false;
    state.word = state.line = '';
    state.target = state.riding = -1;
    state.margin = state.rodeAt = -Infinity;
    state.t = state.r = state.opacity = state.broken = 0;
  }

  /**
   * `dt` is the frame's seconds (0 while paused), `pos` the pilot, `run` the run (or its state) and
   * `lift` the rising air at the pilot (m/s). Nothing is allocated here.
   */
  function update(dt: number, pos: Vector3, run: CloudbaseRun | SkyState, lift: number) {
    if (!root || !root.visible || disposed) return;
    const sky = 'state' in run ? run.state : run;
    if (sky.pilot.thermal > 0) {
      state.riding = sky.pilot.thermal;
      state.rodeAt = sky.elapsed;
    }
    const skip = sky.elapsed - state.rodeAt < GLIDE.leave ? state.riding : -1;
    breezeAt(sky, pos.y, wind, pos);
    // The glide is walked no further than it takes the ring to take in all the fog: past that a
    // bigger ring would show nothing more.
    const ax = pos.x - CLOUD_ZONE.x;
    const az = pos.z - CLOUD_ZONE.z;
    const drift = Math.sqrt(wind.x * wind.x + wind.z * wind.z);
    glideRing(sky, pos, wind, ring, (Math.sqrt(ax * ax + az * az) + FOG_SURFACE.radius) / Math.max(1, wing.speed - drift), wing);
    glideWord(sky, ring, state.word, skip, reach, wing);
    // Some of it lies over the fog: the fog is neither all inside it nor all outside it.
    const cx = ring.x - CLOUD_ZONE.x;
    const cz = ring.z - CLOUD_ZONE.z;
    const apart = Math.sqrt(cx * cx + cz * cz);
    const over = ring.r >= GLIDE.least && ring.r - apart < FOG_SEEN && apart - ring.r < FOG_SEEN;
    // How far out of lift the pilot is, 0 (climbing in it) to 1.
    const gliding = 1 - smoothstep(GLIDE.lift[0], GLIDE.lift[1], lift);
    const want = over ? mix(GLIDE.opacity[1], GLIDE.opacity[0], gliding) : 0;
    // A ring coming up from nothing wears its word's colour at once; one already up turns to it.
    const fresh = state.opacity < 0.01;
    state.opacity += (want - state.opacity) * Math.min(1, dt * GLIDE.ease);
    const colour = band!.material.uniforms.colour.value;
    const tint = reach.word === 'go' ? tints.go : tints.climb;
    const broken = reach.word === 'go' ? 0 : 1;
    if (fresh) {
      colour.copy(tint);
      state.broken = broken;
    } else {
      const turn = Math.min(1, dt * GLIDE.turn);
      colour.lerp(tint, turn);
      state.broken += (broken - state.broken) * turn;
    }
    state.word = reach.word;
    state.target = reach.target;
    state.margin = reach.margin;
    state.t = ring.t;
    state.r = ring.r;
    state.x = ring.x;
    state.y = ring.y;
    state.z = ring.z;
    state.windX = wind.x;
    state.windZ = wind.z;
    state.shown = state.opacity >= 0.01;
    state.line = state.shown && over && gliding > 0.5 ? GLIDE_LINES[reach.word as keyof typeof GLIDE_LINES] : '';
    band!.visible = state.shown;
    band!.material.uniforms.opacity.value = state.shown ? state.opacity : 0;
    band!.material.uniforms.broken.value = state.broken;
    if (state.shown) {
      band!.position.set(ring.x, ring.y, ring.z);
      band!.scale.set(ring.r, GLIDE.tall + GLIDE.grow * ring.r, ring.r);
    }
    // The first frame of the first run draws it with nothing in it (each of its pixels is thrown
    // away), so that its shader is built while the title card is up rather than when the fog first
    // comes within reach, which a phone can stall on.
    if (warmed) return;
    warmed = true;
    band!.visible = true;
  }

  function reset() {
    if (root) root!.visible = false;
    state.shown = false;
    state.line = '';
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    root?.removeFromParent();
    band?.geometry.dispose();
    band?.material.dispose();
    root = band = null;
  }

  /** Glides the ring by the wing a run is flown in (gliders.js's nominalFor: its trim speed and sink). */
  function fly(speed: number, sink: number) {
    wing.speed = speed; wing.sink = sink;
  }

  return {
    fly,
    begin, update, reset, dispose,
    get root() { return root; },
    get state() { return state; },
  };
}
