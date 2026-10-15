// What the meet adds to a run's picture: the plates laid along a trail and the iron loose in the
// sky (riding a gust front, hanging under a storm cloud, rising on the fog, or sprayed off the bar
// by a strike), the line the next lift is judged at and the flash of the one just judged, the rune
// gates (meet-stones.js), Hrungnir's kettlebells and his Beast (meet-beast.js), and the ring where
// each is going to land. Built like the run's own view (cloudbase.js): nothing until the first
// begin(), one root of its own, and nothing allocated while a run is drawn.
import * as THREE from 'three';
import { CLOUD_STRIKE, CLOUD_ZONE } from './cloudbase-state.js';
import { ORDER } from './cloudbase.js';
import { RAVEN } from './ravens.js';
import { MEET_POOL, PLATE_KIND, SCATTER, THUNDER, TRAIL } from './meet-state.js';
import { BELLS, BELL_POOL, BELL_RESULT } from './bells.js';
import { BLESSING, GATES } from './meet-runes.js';
import { createStones } from './meet-stones.js';
import { BEAST_LOOK, beastStone, paintBeast, wrapBeast } from './meet-beast.js';

// A plate is a competition bumper about four times life size (a real one is 45 cm across), so it
// reads from a circle or two away, as the ravens do. Its face is near white, bright enough for the
// glow (whose threshold is 0.3), so from afar every plate is a light; its rim takes the colour of
// its weight as the pilot closes in, fully within `near[0]` metres and not at all beyond `near[1]`
// (a strike can spray a 2.5 kg change plate, which has no colour of its own and stays silver).
// A plate faces the camera but for a slow sway of `sway` radians, so it seems to turn in the air.
// A plate loaded onto the bar leaves a ring that spreads to `pop` times its size in `popFor` s. One
// loaded from beyond the usual reach (TRAIL.reach: Fehu's blessing reaches twice as far) flies in
// to the wing over `fly` seconds instead, as one of `ghosts` copies, and its ring spreads round it.
export const PLATE = Object.freeze({
  radius: 1.8, thick: 0.42, hub: 0.32, face: 0xe6edf5,
  colours: Object.freeze({ 5: 0xf4f6fa, 10: 0x37c06a, 15: 0xf5c533, 20: 0x3a7ff0, 25: 0xf04848 }),
  near: Object.freeze([18, 40]), sway: 0.35, pop: 3.2, popFor: 0.4, fly: 0.25, ghosts: 4,
});

// What marks out each plate off the trail beside its rim (PLATE_KIND). One riding a gust front
// trails `wake` metres of the front's pale streaks (`wind`) behind it; the one under a storm cloud
// crackles (`bolt`) up to the base it hangs from, jumping `flicker` times a second (or, for a
// visitor who asks for reduced motion, holding lit at `steady`); the fog's bait sits in an ember
// ring that breathes `lure` times a second between `ring` times a plate's size; and a strike's own
// plates tumble at `tumble` rad/s and shrink away over the last `fade` seconds they have.
export const LOOSE_LOOK = Object.freeze({
  wake: 7, wind: 0xbfe6ff, bolt: 0xe2d6ff, flicker: 9, steady: 0.8, bait: 0xff7a2e, lure: 0.8, ring: Object.freeze([1.5, 2.3]), tumble: 4, fade: 0.8,
});

// The line the next lift is judged at, and the one just judged: rings `inset` metres inside the
// milestone rings, so never drawn over one. A judged line flashes white for a good lift and red
// for none, and is gone after `flash` seconds.
export const LINES = Object.freeze({ inset: 3, next: 0xf3efe2, good: 0xffffff, flash: 1.2 });

// Hrungnir's kettlebells: the forge's model, glowing like iron from the fire, `size` metres tall
// for each weight in BELLS.kg. Each tumbles as it falls and leaves `trail` embers `gap` metres apart
// behind it. The ring where it will land closes in from `closing` times the strike's size as it comes.
export const BELL_LOOK = Object.freeze({
  size: Object.freeze([2.2, 2.6, 3]), ember: 0xff7a2e, glow: 0.55, tumble: 2.2, trail: 14, gap: 2.2, closing: 3,
});

// A kettlebell that glances off Algiz is knocked aside at `speed` m/s from the moment it does, and
// a ward in Algiz's cyan spreads round the wing to `ward` times a plate's size in `wardFor` s.
export const GLANCE = Object.freeze({ speed: 9, colour: 0x5ee6ff, ward: 3, wardFor: 0.5 });

const TAU = Math.PI * 2;
const { trail: TRAIL_PLATE, wind: WIND_PLATE, thunder: THUNDER_PLATE, bait: BAIT_PLATE, scatter: SCATTER_PLATE } = PLATE_KIND;
// How far from the pilot a plate that goes can be and still have been loaded, with a frame's
// flying to spare: Fehu's reach and a little more.
const GONE = BLESSING.reach + 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothstep = (from, to, value) => {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};
const fract = (value) => value - Math.floor(value);
// Distances worked out by hand rather than by Math.hypot, which the engine can only reach by
// boxing every number it is handed: drawn for every plate on every frame, that would add up.
const distance = (dx, dy, dz) => Math.sqrt(dx * dx + dy * dy + dz * dz);

// Lines in one colour, bright where they start and gone where they end: pairs of points, each pair
// one segment ([x1, y1, z1, x2, y2, z2]), the second end dark (they are added to the picture).
function fading(segments, colour, fade = true) {
  const lit = new THREE.Color(colour);
  const points = [];
  const colours = [];
  for (const segment of segments) {
    points.push(...segment);
    colours.push(lit.r, lit.g, lit.b, ...(fade ? [0, 0, 0] : [lit.r, lit.g, lit.b]));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  return geometry;
}

// The marks of the loose plates, each in its own colour, by PLATE_KIND. A wake looks back along
// -z from behind the plate (the way a front blows is turned to +z); the crackle runs from the
// plate up to its cloud's base in three jagged forks; the lure is a level ring one metre across.
function markGeometries() {
  const wake = [[-1.1, 0.6, 1], [0, -0.8, 0.8], [1.1, 0.3, 0.65]].map(([x, y, share]) => [x, y, -PLATE.radius, x, y, -PLATE.radius - LOOSE_LOOK.wake * share]);
  const bolt = [];
  for (const lean of [-1, 0, 1]) {
    let x = 0;
    let y = PLATE.radius * 0.5;
    for (let k = 1; k <= 4; k++) {
      const nx = lean * 0.4 * k + (k % 2 ? 0.35 : -0.35);
      const ny = PLATE.radius * 0.5 + ((THUNDER.below - PLATE.radius * 0.5) * k) / 4;
      bolt.push([x, y, 0, nx, ny, 0]);
      x = nx;
      y = ny;
    }
  }
  const lure = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * TAU;
    const b = ((i + 1) / 48) * TAU;
    return [Math.cos(a), 0, Math.sin(a), Math.cos(b), 0, Math.sin(b)];
  });
  const marks = [null, null, null, null, null, null];
  marks[WIND_PLATE] = fading(wake, LOOSE_LOOK.wind);
  marks[THUNDER_PLATE] = fading(bolt, LOOSE_LOOK.bolt, false);
  marks[BAIT_PLATE] = fading(lure, LOOSE_LOOK.bait, false);
  return marks;
}

/**
 * `loadModel` is scenery.js's loader (or a test's); without it, or until the kettlebell and the
 * rune stone arrive, or if they never do, the bells and stones are plain stand-ins, and the Beast is
 * the stand-in bell in its stone. The Beast's own model (kettlebell-beast.glb) is used if it exists.
 * `calm` is for a visitor who asks for reduced motion: the crackle under a storm cloud holds lit
 * instead of flickering.
 */
export function createMeetView({ scene, loadModel = null, calm = false }) {
  let root = null;
  let disposed = false;
  let ready = null;
  let next = null;
  let judged = null;
  let ward = null;
  let gates = null;
  let skin = null;
  const loaded = { kettlebell: false, stone: false, beast: false };
  const plateViews = [];
  const looseViews = [];
  const ghostViews = [];
  const bellViews = [];
  let marks = null;
  // What the last update saw, to notice what has changed since: lifts judged, the plates loaded
  // of each kind (by PLATE_KIND, with every plate loaded at all in `plates`), and when Algiz last
  // turned a bell aside.
  const seen = { count: 0, flashAt: -Infinity, plates: 0, wardAt: -Infinity };
  const counted = [0, 0, 0, 0, 0, 0];
  const taken = [0, 0, 0, 0, 0, 0];
  const materials = new Set();
  const geometries = new Set();
  const textures = new Set();
  const ownGeometry = (geometry) => { geometries.add(geometry); return geometry; };
  const ownMaterial = (material) => { materials.add(material); return material; };
  const transparent = { transparent: true, depthWrite: false, fog: false };
  const silver = new THREE.Color(PLATE.face);
  const weights = new Map(Object.entries(PLATE.colours).map(([kg, colour]) => [Number(kg), new THREE.Color(colour)]));
  const threat = new THREE.Color(RAVEN.threat).multiplyScalar(RAVEN.flare);
  // The kettlebell's shape wrapped for the Beast's stone, made once for each shape the file has.
  const wrapped = new Map();

  // A ring lying level, or (`upright`) standing in the plane a plate's face is in.
  function ring(radius, color, opacity, upright = false) {
    const points = Array.from({ length: 96 }, (_, i) => {
      const angle = i / 96 * Math.PI * 2;
      return upright
        ? new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0)
        : new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    });
    const loop = new THREE.LineLoop(ownGeometry(new THREE.BufferGeometry().setFromPoints(points)),
      ownMaterial(new THREE.LineBasicMaterial({ color, opacity, ...transparent })));
    loop.renderOrder = ORDER.aboveFog;
    return loop;
  }

  function build() {
    root = new THREE.Group();
    root.name = 'GoodLift';
    scene.add(root);

    // One disc, rim and hub serve every plate; each plate has its own rim material, to colour.
    // The disc's faces look along its own z, the way a plate is turned to face the camera.
    const disc = ownGeometry(new THREE.CylinderGeometry(PLATE.radius, PLATE.radius, PLATE.thick, 40).rotateX(Math.PI / 2));
    const rim = ownGeometry(new THREE.TorusGeometry(PLATE.radius, PLATE.thick * 0.62, 8, 40));
    const hub = ownGeometry(new THREE.CylinderGeometry(PLATE.hub, PLATE.hub, PLATE.thick * 1.6, 16).rotateX(Math.PI / 2));
    const face = ownMaterial(new THREE.MeshBasicMaterial({ color: PLATE.face }));
    const iron = ownMaterial(new THREE.MeshBasicMaterial({ color: 0x1b2230 }));
    const plate = (name) => {
      const holder = new THREE.Group();
      holder.name = name;
      holder.visible = false;
      const band = ownMaterial(new THREE.MeshBasicMaterial({ color: PLATE.face }));
      holder.add(new THREE.Mesh(disc, face), new THREE.Mesh(rim, band), new THREE.Mesh(hub, iron));
      return { holder, band };
    };
    const popRing = (name) => {
      const pop = ring(PLATE.radius, PLATE.face, 0, true);
      pop.name = name;
      pop.visible = false;
      return pop;
    };
    for (let i = 0; i < MEET_POOL.plates; i++) {
      const { holder, band } = plate(`plate-${i}`);
      const pop = popRing(`pop-${i}`);
      root.add(holder, pop);
      plateViews.push({ holder, band, pop, live: false, kg: 0, x: 0, y: 0, z: 0, popAt: -Infinity });
    }
    // The loose plates, one for each slot the meet keeps them in, each with a mark of its kind.
    marks = markGeometries().map((geometry) => geometry && ownGeometry(geometry));
    for (let i = 0; i < MEET_POOL.loose; i++) {
      const { holder, band } = plate(`loose-${i}`);
      const pop = popRing(`loose-pop-${i}`);
      const mark = new THREE.LineSegments(marks[WIND_PLATE], ownMaterial(new THREE.LineBasicMaterial({
        vertexColors: true, opacity: 0.8, blending: THREE.AdditiveBlending, ...transparent,
      })));
      mark.name = `loose-mark-${i}`;
      mark.visible = false;
      mark.renderOrder = ORDER.aboveFog;
      root.add(holder, pop, mark);
      looseViews.push({ holder, band, pop, mark, live: false, kind: 0, kg: 0, born: 0, x: 0, y: 0, z: 0, popAt: -Infinity });
    }
    // Plates loaded from further off than a plate's own reach, flying in to the wing.
    for (let i = 0; i < PLATE.ghosts; i++) {
      const { holder, band } = plate(`ghost-${i}`);
      const pop = popRing(`ghost-pop-${i}`);
      root.add(holder, pop);
      ghostViews.push({ holder, band, pop, at: -Infinity, kg: 0, fromX: 0, fromY: 0, fromZ: 0 });
    }

    next = ring(CLOUD_ZONE.r - LINES.inset, LINES.next, 0.55);
    next.name = 'line-next';
    judged = ring(CLOUD_ZONE.r - LINES.inset, LINES.good, 0);
    judged.name = 'line-judged';
    judged.visible = false;
    ward = ring(PLATE.radius, GLANCE.colour, 0, true);
    ward.name = 'ward';
    ward.visible = false;
    root.add(next, judged, ward);

    gates = createStones({ ownGeometry, ownMaterial });
    root.add(gates.group);

    const body = ownGeometry(new THREE.SphereGeometry(0.36, 16, 12).translate(0, -0.08, 0));
    const handle = ownGeometry(new THREE.TorusGeometry(0.2, 0.06, 8, 20).translate(0, 0.3, 0));
    const standIn = ownMaterial(new THREE.MeshStandardMaterial({
      color: 0x2c2b30, roughness: 0.6, metalness: 0.4, emissive: BELL_LOOK.ember, emissiveIntensity: 0.35,
    }));
    const paint = paintBeast();
    textures.add(paint.colour);
    textures.add(paint.glow);
    skin = ownMaterial(beastStone(paint));
    // Its warning's second ring: teeth round the strike's ring, turning.
    const teeth = ownGeometry(fading(Array.from({ length: 24 }, (_, k) => {
      const a = (k / 24) * TAU;
      const b = a + TAU / 48;
      const r = CLOUD_STRIKE.radius * BEAST_LOOK.outer;
      return [Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(b) * r, 0, Math.sin(b) * r];
    }), BELL_LOOK.ember, false));
    for (let i = 0; i < BELL_POOL; i++) {
      const holder = new THREE.Group();
      holder.name = `bell-${i}`;
      holder.visible = false;
      const model = new THREE.Group();
      model.add(new THREE.Mesh(body, standIn), new THREE.Mesh(handle, standIn));
      // The Beast: the same stand-in bell in its own stone, until a better shape arrives.
      const beast = new THREE.Group();
      beast.name = `beast-${i}`;
      beast.visible = false;
      beast.add(new THREE.Mesh(body, skin), new THREE.Mesh(handle, skin));
      holder.add(model, beast);
      // The embers it leaves: fixed brightness from the bell back, only their places move.
      const places = new Float32Array(BELL_LOOK.trail * 3);
      const glow = new Float32Array(BELL_LOOK.trail * 3);
      const ember = new THREE.Color(BELL_LOOK.ember);
      for (let k = 0; k < BELL_LOOK.trail; k++) {
        const fade = (1 - k / BELL_LOOK.trail) ** 1.5;
        glow[k * 3] = ember.r * fade;
        glow[k * 3 + 1] = ember.g * fade;
        glow[k * 3 + 2] = ember.b * fade;
      }
      const trailGeometry = ownGeometry(new THREE.BufferGeometry());
      trailGeometry.setAttribute('position', new THREE.BufferAttribute(places, 3).setUsage(THREE.DynamicDrawUsage));
      trailGeometry.setAttribute('glow', new THREE.BufferAttribute(glow, 3));
      // Soft round sparks, added to what is behind them, a little larger close to.
      const trail = new THREE.Points(trailGeometry, ownMaterial(new THREE.ShaderMaterial({
        vertexShader: `attribute vec3 glow; varying vec3 tint;
          void main() {
            tint = glow;
            vec4 view = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * view;
            gl_PointSize = clamp(220.0 / max(1.0, -view.z), 1.5, 8.0);
          }`,
        fragmentShader: `varying vec3 tint;
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            gl_FragColor = vec4(tint, 1.0 - smoothstep(0.15, 1.0, d));
          }`,
        blending: THREE.AdditiveBlending,
        ...transparent,
      })));
      trail.name = `embers-${i}`;
      trail.visible = false;
      // Its places are written each frame, so the bounds it was built with mean nothing.
      trail.frustumCulled = false;
      // Where it will land, the size of a strike, as a raven's is; and a second ring closing in on it.
      const aim = ring(CLOUD_STRIKE.radius, threat, 0.9);
      aim.name = `aim-${i}`;
      aim.visible = false;
      const closing = ring(CLOUD_STRIKE.radius, threat, 0.45);
      closing.name = `closing-${i}`;
      const outer = new THREE.LineSegments(teeth, ownMaterial(new THREE.LineBasicMaterial({
        vertexColors: true, opacity: 0.85, blending: THREE.AdditiveBlending, ...transparent,
      })));
      outer.name = `beast-ring-${i}`;
      outer.visible = false;
      outer.renderOrder = ORDER.aboveFog;
      aim.add(closing, outer);
      root.add(holder, trail, aim);
      bellViews.push({
        holder, model, beast, trail, places, aim, closing, outer, result: BELL_RESULT.pending, glancedAt: -Infinity, awayX: 0, awayZ: 0,
      });
    }
  }

  // The Beast in a bell's holder: whatever stood in for it goes, and `model` takes its place.
  function dressBeast(view, model) {
    view.beast.clear();
    view.beast.add(model);
  }

  // The kettlebell from the file cut again in the Beast's stone: its shapes wrapped for the stone
  // (once each, and the view's own), worn under the Beast's material.
  function carveBeast(model) {
    const beast = model.clone();
    beast.traverse((part) => {
      if (!part.isMesh) return;
      if (!wrapped.has(part.geometry)) wrapped.set(part.geometry, ownGeometry(wrapBeast(part.geometry)));
      part.geometry = wrapped.get(part.geometry);
      part.material = skin;
    });
    return beast;
  }

  // Puts the kettlebell from the file in each holder in place of its stand-in. The file's material
  // is shared with the forge's prop, so the bells glow in a copy of their own. Unless its own file
  // has come, the Beast is the same bell in its stone.
  function adoptBells(models) {
    const copies = new Map();
    models.forEach((model, i) => {
      model.traverse((part) => {
        if (!part.isMesh) return;
        if (!copies.has(part.material)) {
          const copy = ownMaterial(part.material.clone());
          copy.emissive.set(BELL_LOOK.ember);
          copy.emissiveIntensity = BELL_LOOK.glow;
          copies.set(part.material, copy);
        }
        part.material = copies.get(part.material);
      });
      if (!copies.size) throw new Error('The kettlebell file has nothing to draw.');
      // The file stands on its base; the bell's point is the middle of it.
      model.position.y = -0.5;
      const view = bellViews[i];
      view.holder.remove(view.model);
      view.holder.add(model);
      view.model = model;
      if (!loaded.beast) dressBeast(view, carveBeast(model));
    });
  }

  // The Beast's own file, if the owner has made one: worn as the bells wear theirs, a little dimmer.
  function adoptBeasts(models) {
    const copies = new Map();
    models.forEach((model, i) => {
      model.traverse((part) => {
        if (!part.isMesh) return;
        if (!copies.has(part.material)) {
          const copy = ownMaterial(part.material.clone());
          copy.emissive.set(BELL_LOOK.ember);
          copy.emissiveIntensity = BEAST_LOOK.model;
          copies.set(part.material, copy);
        }
        part.material = copies.get(part.material);
      });
      if (!copies.size) throw new Error('The Beast\'s file has nothing to draw.');
      model.position.y = -0.5;
      dressBeast(bellViews[i], model);
    });
  }

  // Asks for the models once; a file that fails leaves the stand-ins up, and one that arrives after
  // dispose() is dropped untouched. The Beast's own file is optional: until there is one, asking
  // for it fails, quietly, and the Beast is cut from the kettlebell.
  function load() {
    if (!loadModel) return Promise.resolve();
    const ask = async (name) => loadModel(name, 1);
    const many = (name, count) => Promise.all(Array.from({ length: count }, () => ask(name)));
    const bells = many('kettlebell', BELL_POOL)
      .then((models) => {
        if (disposed) return;
        adoptBells(models);
        loaded.kettlebell = true;
      })
      .catch((error) => console.warn('The kettlebell model did not load; keeping the stand-ins.', error));
    const stones = many('rune-stone', 2 * GATES.count)
      .then((models) => {
        if (disposed) return;
        gates.adopt(models);
        loaded.stone = true;
      })
      .catch((error) => console.warn('The rune stone model did not load; keeping the stand-ins.', error));
    const beast = many('kettlebell-beast', BELL_POOL)
      .then((models) => {
        if (disposed) return;
        adoptBeasts(models);
        loaded.beast = true;
      })
      .catch(() => {});
    return Promise.all([bells, stones, beast]).then(() => {});
  }

  /** Builds on the first call and shows the group on every call; nothing of the last run shows. */
  function begin() {
    if (disposed) return Promise.resolve();
    if (!root) {
      build();
      ready = load();
    }
    root.visible = true;
    seen.count = seen.plates = 0;
    seen.flashAt = seen.wardAt = -Infinity;
    counted.fill(0);
    judged.visible = ward.visible = false;
    for (const view of [...plateViews, ...looseViews]) {
      view.holder.visible = view.pop.visible = view.live = false;
      view.popAt = -Infinity;
    }
    for (const view of looseViews) view.mark.visible = false;
    for (const ghost of ghostViews) {
      ghost.holder.visible = ghost.pop.visible = false;
      ghost.at = -Infinity;
    }
    for (const view of bellViews) {
      view.holder.visible = view.trail.visible = view.aim.visible = false;
      view.result = BELL_RESULT.pending;
      view.glancedAt = -Infinity;
    }
    gates.clear();
    return ready;
  }

  // A plate that has gone, of `kind`: if one of its kind was loaded since the last frame and it was
  // near enough to have been the one, it takes that count (so one whose time ran out further off in
  // the same frame never takes it from the plate loaded). A ring spreads where it was, or, loaded
  // from further off than a plate's own reach, a copy of it flies in to the wing.
  function wasLoaded(view, kind, time, pos) {
    const away = distance(view.x - pos.x, view.y - pos.y, view.z - pos.z);
    if (taken[kind] <= 0 || away > GONE) return;
    taken[kind] -= 1;
    if (away <= TRAIL.reach + 0.5) {
      view.popAt = time;
      view.pop.position.set(view.x, view.y, view.z);
      view.pop.material.color.copy(weights.get(view.kg) ?? silver);
      return;
    }
    flyIn(time, view.x, view.y, view.z, view.kg);
  }

  // A copy of a plate of `kg` sets off from where it was loaded to fly in to the wing: the copy
  // that has been free longest (or flown longest) goes.
  function flyIn(time, x, y, z, kg) {
    let ghost = ghostViews[0];
    for (let i = 1; i < ghostViews.length; i++) if (ghostViews[i].at < ghost.at) ghost = ghostViews[i];
    ghost.at = time;
    ghost.kg = kg;
    ghost.fromX = x;
    ghost.fromY = y;
    ghost.fromZ = z;
    ghost.band.color.copy(weights.get(kg) ?? silver);
    ghost.pop.material.color.copy(ghost.band.color);
  }

  // A plate's ring spreading as it is loaded, facing the eye.
  function popping(view, time, eye) {
    const t = (time - view.popAt) / PLATE.popFor;
    view.pop.visible = t >= 0 && t < 1;
    if (!view.pop.visible) return;
    view.pop.scale.setScalar(1 + (PLATE.pop - 1) * t);
    view.pop.material.opacity = 0.9 * (1 - t);
    view.pop.rotation.y = Math.atan2(eye.x - view.pop.position.x, eye.z - view.pop.position.z);
  }

  // A plate's face turned to the eye (but for its sway), and its rim coloured by its weight close to.
  function face(view, plate, pos, eye, time, i) {
    view.holder.rotation.set(0, Math.atan2(eye.x - plate.x, eye.z - plate.z) + Math.sin(time * 0.9 + i * 1.7) * PLATE.sway, 0);
    tint(view, plate, pos);
  }

  function tint(view, plate, pos) {
    const near = 1 - smoothstep(PLATE.near[0], PLATE.near[1], distance(pos.x - plate.x, pos.y - plate.y, pos.z - plate.z));
    view.band.color.copy(silver).lerp(weights.get(plate.kg) ?? silver, near);
  }

  // The kettlebells in the air, their embers and the rings where they will land. Drawn apart from
  // the rest of update(), which is long: left at its end, the engine had run out of room to fold in
  // the calls the bells make by the time it reached them, and boxed every number they were handed,
  // some 850 bytes a frame with two bells in the air.
  function drawBells(time, pos, thrown) {
    for (let i = 0; i < bellViews.length; i++) {
      const view = bellViews[i];
      const bell = thrown.bells[i];
      // A bell that glances off Algiz is knocked away from the wing from that moment, and the ward
      // flashes round the wing.
      if (bell.result !== view.result) {
        view.result = bell.result;
        if (bell.result === BELL_RESULT.glanced) {
          const dx = bell.x - pos.x;
          const dz = bell.z - pos.z;
          const across = Math.sqrt(dx * dx + dz * dz);
          view.glancedAt = seen.wardAt = time;
          view.awayX = across > 1e-6 ? dx / across : 1;
          view.awayZ = across > 1e-6 ? dz / across : 0;
        }
      }
      const flying = bell.phase !== 0;
      view.holder.visible = view.trail.visible = flying;
      // The ring stays only while the bell is still coming, and goes the moment it is decided.
      view.aim.visible = bell.phase === 1 && bell.result === 0;
      if (!flying) continue;
      const age = time - bell.at;
      const index = BELLS.kg.indexOf(bell.kg);
      view.model.visible = !bell.beast;
      view.beast.visible = bell.beast;
      const knocked = bell.result === BELL_RESULT.glanced ? Math.max(0, time - view.glancedAt) * GLANCE.speed : 0;
      const x = bell.x + view.awayX * knocked;
      const z = bell.z + view.awayZ * knocked;
      view.holder.position.set(x, bell.y, z);
      view.holder.scale.setScalar(bell.beast ? BEAST_LOOK.size : BELL_LOOK.size[index < 0 ? 0 : index]);
      view.holder.rotation.set(age * (bell.beast ? BEAST_LOOK.tumble : BELL_LOOK.tumble), Math.atan2(bell.aimX - bell.fromX, bell.aimZ - bell.fromZ), 0);
      // The embers lie back along the way it came, up toward where it was thrown from.
      const ux = bell.fromX - bell.aimX;
      const uy = bell.fromY - bell.aimY;
      const uz = bell.fromZ - bell.aimZ;
      const length = distance(ux, uy, uz) || 1;
      const travelled = distance(bell.x - bell.fromX, bell.y - bell.fromY, bell.z - bell.fromZ);
      for (let k = 0; k < BELL_LOOK.trail; k++) {
        // Never back past where it was thrown from.
        const back = Math.min(k * BELL_LOOK.gap, travelled);
        view.places[k * 3] = x + (ux / length) * back;
        view.places[k * 3 + 1] = bell.y + (uy / length) * back;
        view.places[k * 3 + 2] = z + (uz / length) * back;
      }
      view.trail.geometry.attributes.position.needsUpdate = true;
      view.outer.visible = view.aim.visible && bell.beast;
      if (view.aim.visible) {
        view.aim.position.set(bell.aimX, bell.aimY + CLOUD_STRIKE.rise, bell.aimZ);
        view.closing.scale.setScalar(1 + (BELL_LOOK.closing - 1) * clamp(1 - age / bell.lead, 0, 1));
        view.outer.rotation.y = time * BEAST_LOOK.spin;
      }
    }
  }

  /**
   * `time` is the run's clock, `pos` the pilot, `meet` and `bells` the meet's and Hrungnir's
   * states (or the modules that hold them), `eye` the camera's position, which the plates turn to
   * face, and `sky` the run's sky (or its state), whose gust fronts the wind plates ride. Nothing is
   * allocated here.
   */
  function update(time, pos, meet, bells, eye, sky = null) {
    if (!root || !root.visible || disposed) return;
    const lift = meet.state ?? meet;
    const thrown = bells.state ?? bells;
    const air = sky ? sky.state ?? sky : null;

    // What the meet loaded since the last frame, by kind: a plate that goes within reach with one of
    // its kind loaded was loaded (and pops, or flies in); any other went by itself, its time up.
    taken[WIND_PLATE] = lift.wind - counted[WIND_PLATE];
    taken[THUNDER_PLATE] = lift.thunder - counted[THUNDER_PLATE];
    taken[BAIT_PLATE] = lift.bait - counted[BAIT_PLATE];
    taken[SCATTER_PLATE] = lift.recovered - counted[SCATTER_PLATE];
    taken[TRAIL_PLATE] = lift.plates - seen.plates - taken[WIND_PLATE] - taken[THUNDER_PLATE] - taken[BAIT_PLATE] - taken[SCATTER_PLATE];
    counted[WIND_PLATE] = lift.wind;
    counted[THUNDER_PLATE] = lift.thunder;
    counted[BAIT_PLATE] = lift.bait;
    counted[SCATTER_PLATE] = lift.recovered;
    seen.plates = lift.plates;

    for (let i = 0; i < plateViews.length; i++) {
      const view = plateViews[i];
      const plate = lift.trail.plates[i];
      if (view.live && !plate.live) wasLoaded(view, TRAIL_PLATE, time, pos);
      view.live = plate.live;
      view.kg = plate.kg;
      view.x = plate.x;
      view.y = plate.y;
      view.z = plate.z;
      popping(view, time, eye);
      view.holder.visible = plate.live;
      if (!plate.live) continue;
      view.holder.position.set(plate.x, plate.y, plate.z);
      face(view, plate, pos, eye, time, i);
    }

    for (let i = 0; i < looseViews.length; i++) {
      const view = looseViews[i];
      const plate = lift.loose[i];
      // Gone, or another plate already laid in its slot.
      if (view.live && (!plate.live || plate.born !== view.born || plate.kind !== view.kind)) wasLoaded(view, view.kind, time, pos);
      view.live = plate.live;
      view.kind = plate.kind;
      view.kg = plate.kg;
      view.born = plate.born;
      view.x = plate.x;
      view.y = plate.y;
      view.z = plate.z;
      popping(view, time, eye);
      view.holder.visible = plate.live;
      const mark = view.mark;
      mark.visible = false;
      if (!plate.live) continue;
      view.holder.position.set(plate.x, plate.y, plate.z);
      if (plate.kind === SCATTER_PLATE) {
        // Thrown off the bar: it tumbles, and shrinks away as its time runs out.
        const age = time - plate.born;
        view.holder.rotation.set(age * LOOSE_LOOK.tumble + i, age * LOOSE_LOOK.tumble * 0.6, 0);
        view.holder.scale.setScalar(1 - smoothstep(SCATTER.life - LOOSE_LOOK.fade, SCATTER.life, age));
        tint(view, plate, pos);
        continue;
      }
      view.holder.scale.setScalar(1);
      face(view, plate, pos, eye, time, i);
      if (plate.kind === WIND_PLATE && air) {
        const band = air.gusts[plate.slot];
        mark.geometry = marks[WIND_PLATE];
        mark.position.set(plate.x, plate.y, plate.z);
        mark.rotation.set(0, Math.atan2(band.ux, band.uz), 0);
        mark.scale.setScalar(1);
        mark.material.opacity = 0.8;
        mark.visible = true;
      } else if (plate.kind === THUNDER_PLATE) {
        // It crackles: lit for a moment at a time, at no beat a pilot could count; or, calm, it
        // stays lit.
        const lit = fract(Math.sin(Math.floor(time * LOOSE_LOOK.flicker) * 91.7 + i) * 43758.5) > 0.45;
        mark.geometry = marks[THUNDER_PLATE];
        mark.position.set(plate.x, plate.y, plate.z);
        mark.rotation.set(0, view.holder.rotation.y, 0);
        mark.scale.setScalar(1);
        mark.material.opacity = calm ? LOOSE_LOOK.steady : lit ? 0.95 : 0.15;
        mark.visible = true;
      } else if (plate.kind === BAIT_PLATE) {
        const breath = 0.5 - 0.5 * Math.cos(time * LOOSE_LOOK.lure * TAU);
        mark.geometry = marks[BAIT_PLATE];
        mark.position.set(plate.x, plate.y - PLATE.radius * 0.3, plate.z);
        mark.rotation.set(0, 0, 0);
        mark.scale.setScalar(PLATE.radius * (LOOSE_LOOK.ring[0] + (LOOSE_LOOK.ring[1] - LOOSE_LOOK.ring[0]) * breath));
        mark.material.opacity = 0.9 - 0.45 * breath;
        mark.visible = true;
      }
    }

    // Plates loaded before they were ever drawn: a strike's, under Fehu, go straight back on the
    // bar as they spray, from SCATTER.from round the wing. Copies fly in from there, all silver,
    // their weights gone with them.
    for (let k = 0; k < taken[SCATTER_PLATE] && k < ghostViews.length; k++) {
      const angle = (k / taken[SCATTER_PLATE]) * TAU;
      flyIn(time, pos.x + Math.sin(angle) * SCATTER.from, pos.y, pos.z - Math.cos(angle) * SCATTER.from, 0);
    }

    // The copies flying in, homing on the wing, and the ring spreading round it as each arrives.
    for (let i = 0; i < ghostViews.length; i++) {
      const ghost = ghostViews[i];
      const t = (time - ghost.at) / PLATE.fly;
      ghost.holder.visible = t >= 0 && t < 1;
      if (ghost.holder.visible) {
        const e = t * t * (3 - 2 * t);
        const x = ghost.fromX + (pos.x - ghost.fromX) * e;
        const y = ghost.fromY + (pos.y - ghost.fromY) * e;
        const z = ghost.fromZ + (pos.z - ghost.fromZ) * e;
        ghost.holder.position.set(x, y, z);
        ghost.holder.scale.setScalar(1 - 0.5 * e);
        ghost.holder.rotation.set(0, Math.atan2(eye.x - x, eye.z - z), 0);
      }
      const p = (time - ghost.at - PLATE.fly) / PLATE.popFor;
      ghost.pop.visible = p >= 0 && p < 1;
      if (ghost.pop.visible) {
        ghost.pop.position.set(pos.x, pos.y, pos.z);
        ghost.pop.scale.setScalar(1 + (PLATE.pop - 1) * p);
        ghost.pop.material.opacity = 0.9 * (1 - p);
        ghost.pop.rotation.y = Math.atan2(eye.x - pos.x, eye.z - pos.z);
      }
    }

    next.position.set(CLOUD_ZONE.x, lift.next, CLOUD_ZONE.z);
    if (lift.count > seen.count) {
      const record = lift.lifts[Math.min(lift.count, lift.lifts.length) - 1];
      seen.count = lift.count;
      // The judging at the end of a run has no line in the sky to flash.
      if (record && record.line > 0) {
        seen.flashAt = time;
        judged.position.set(CLOUD_ZONE.x, record.line, CLOUD_ZONE.z);
        if (record.good) judged.material.color.set(LINES.good);
        else judged.material.color.copy(threat);
      }
    }
    const flashing = time - seen.flashAt;
    judged.visible = flashing >= 0 && flashing < LINES.flash;
    if (judged.visible) judged.material.opacity = 0.95 * (1 - flashing / LINES.flash) * (0.75 + 0.25 * Math.cos(flashing * 24));

    gates.update(time, lift.runes, eye);
    drawBells(time, pos, thrown);

    const warding = (time - seen.wardAt) / GLANCE.wardFor;
    ward.visible = warding >= 0 && warding < 1;
    if (ward.visible) {
      ward.position.set(pos.x, pos.y + CLOUD_STRIKE.rise, pos.z);
      ward.scale.setScalar(1 + (GLANCE.ward - 1) * warding);
      ward.material.opacity = 0.9 * (1 - warding);
      ward.rotation.y = Math.atan2(eye.x - pos.x, eye.z - pos.z);
    }
  }

  function reset() {
    if (root) root.visible = false;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    root?.removeFromParent();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    geometries.clear();
    materials.clear();
    textures.clear();
    wrapped.clear();
    plateViews.length = looseViews.length = ghostViews.length = bellViews.length = 0;
    root = next = judged = ward = gates = skin = marks = null;
  }

  return {
    begin, update, reset, dispose,
    get root() { return root; },
    get loaded() { return loaded; },
  };
}
