// The rune gates as a run draws them (meet-runes.js keeps them). Each gate is two standing stones
// floating either side of its opening, facing the middle of the lift they stand round, with the
// gate's rune glowing between them and a faint beam running on above and below each stone, so the
// whole height a pilot can fly through is shown. A gate flown through flares its rune, and then
// its stones crumble with the rest of the set; a set left waiting crumbles where it stands.
//
// A part of the meet's view (meet-view.js), made the way the ravens are for the run's own view
// (ravens.js): one group, built once, every shape and material handed to the view to own, and
// nothing allocated while it is drawn.
import * as THREE from 'three';
import { ORDER } from './cloudbase.js';
import { GATE, GATES } from './meet-runes.js';

// A stone is `tall` metres high and as wide as the file's own stone is for a height of 1 (`wide`),
// standing just outside the opening on either side, so the gap between their inner faces is the
// opening itself. A set bobs `bob` metres up and down every `bobFor` seconds. The rune between the
// stones is `rune` metres tall, its strokes `stroke` of that wide, in the cyan of the arch's carved
// runes (scenery.js), breathing a little while it waits. The beams fade out to the opening's full
// height (GATES.tall) from the stones' ends. A rune taken flares to `flare` times its size over
// `flareFor` seconds, and a rune passed over fades in `fade` seconds, as the beams of every gate
// do; its stones crumble `after` seconds after it is taken, and every other stone at once, each
// into `chunks` pieces that fall (`fall` m/s²) and are gone in `crumbleFor` seconds.
export const STONE_LOOK = Object.freeze({
  tall: 10,                         // m: a stone's height
  wide: 0.6,                        // the file's width for a height of 1 (rune-stone.glb is 0.6 × 1 × 0.44)
  bob: 0.35,                        // m up and down
  bobFor: 5,                        // s for one bob
  rune: 5,                          // m: the rune's height
  stroke: 0.1,                      // of the rune's height: its strokes' width
  colour: 0x5ee6ff,                 // the carved runes' cyan
  glow: 0x15333d,                   // the stones' own faint light, so they read against the night
  beams: 0.45,                      // the beams' opacity while the gate waits
  flare: 1.8,                       // times its size a taken rune flares to
  flareFor: 0.6,                    // s the flare and the flash take
  fade: 0.4,                        // s a rune passed over, and the beams, take to fade
  after: 0.35,                      // s from a gate taken to its own stones crumbling
  chunks: 6,                        // pieces to a stone
  crumbleFor: 1.8,                  // s from a stone breaking until its last piece is gone
  fall: 7,                          // m/s²: a little slower than a dropped stone, to be seen falling
});

// Each rune as the strokes it is cut with: [x1, y1, x2, y2] on a stave one unit tall standing at
// x = 0, by its number (RUNE). Every one is a stave and two branches.
export const RUNE_STROKES = Object.freeze([
  Object.freeze([]),
  // ᚠ Fehu: two branches rising to the right off the upper stave.
  Object.freeze([Object.freeze([0, 0, 0, 1]), Object.freeze([0, 0.72, 0.42, 1]), Object.freeze([0, 0.42, 0.42, 0.72])]),
  // ᛉ Algiz: two arms raised from the middle of the stave.
  Object.freeze([Object.freeze([0, 0, 0, 1]), Object.freeze([0, 0.6, -0.4, 1]), Object.freeze([0, 0.6, 0.4, 1])]),
  // ᚨ Ansuz: two branches falling to the right off the upper stave.
  Object.freeze([Object.freeze([0, 0, 0, 1]), Object.freeze([0, 1, 0.4, 0.72]), Object.freeze([0, 0.72, 0.4, 0.44])]),
  // ᛏ Tiwaz: an arrowhead on the stave.
  Object.freeze([Object.freeze([0, 0, 0, 1]), Object.freeze([0, 1, -0.4, 0.68]), Object.freeze([0, 1, 0.4, 0.68])]),
]);

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothstep = (from, to, value) => {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};
const fract = (value) => value - Math.floor(value);
// Half a stone's width, and how far its middle stands from the middle of the opening.
const HALF = (STONE_LOOK.wide * STONE_LOOK.tall) / 2;
const OUT = GATES.wide + HALF;

// Where each piece of a gate's crumbling stones starts in the gate's own frame (x along its width,
// y up, z toward the middle of the lift), the way it is thrown (m/s), how fast it tumbles (rad/s)
// and how big it is (m). The first `chunks` are the left stone's. Fixed, so a gate always breaks
// the same way and nothing is drawn at random while a run is drawn.
const PIECES = Object.freeze(Array.from({ length: 2 * STONE_LOOK.chunks }, (_, k) => {
  const side = k < STONE_LOOK.chunks ? -1 : 1;
  const n = k % STONE_LOOK.chunks;
  const draw = (salt) => fract(Math.sin((k + 1) * 12.9898 + salt * 78.233) * 43758.5453);
  return Object.freeze({
    x: side * OUT + (draw(1) - 0.5) * HALF * 1.4,
    y: ((n + 0.5) / STONE_LOOK.chunks - 0.5) * STONE_LOOK.tall * 0.9,
    z: (draw(2) - 0.5) * HALF,
    vx: side * (0.6 + draw(3) * 1.8),
    vy: draw(4) * 2.2,
    vz: (draw(5) - 0.5) * 2.4,
    spin: 1 + draw(6) * 2.5,
    size: 1.1 + draw(7) * 1.3,
  });
}));

// A rune as flat strips, one unit tall and centred on the origin, facing along +z: a stroke is a
// strip `stroke` wide, run on by half that past each end so its joins close.
function runeGeometry(strokes) {
  const width = STONE_LOOK.stroke;
  let left = 0;
  let right = 0;
  for (const [x1, , x2] of strokes) {
    left = Math.min(left, x1, x2);
    right = Math.max(right, x1, x2);
  }
  const middle = (left + right) / 2;
  const points = [];
  for (const [x1, y1, x2, y2] of strokes) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const ax = (x2 - x1) / length * (width / 2);
    const ay = (y2 - y1) / length * (width / 2);
    // Across the stroke, half its width.
    const nx = -ay;
    const ny = ax;
    const corners = [
      [x1 - ax + nx, y1 - ay + ny], [x1 - ax - nx, y1 - ay - ny], [x2 + ax - nx, y2 + ay - ny], [x2 + ax + nx, y2 + ay + ny],
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) points.push(corners[i][0] - middle, corners[i][1] - 0.5, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

// The beams in a gate's frame: from the top and the foot of each stone's inner face out to the
// opening's full height, bright where they leave the stone and gone at their far ends (they are
// added to the picture, so black is nothing).
function beamGeometry(colour) {
  const lit = new THREE.Color(colour);
  const points = [];
  const colours = [];
  for (const side of [-1, 1]) {
    for (const up of [-1, 1]) {
      points.push(side * GATES.wide, up * STONE_LOOK.tall / 2, 0, side * GATES.wide, up * GATES.tall, 0);
      colours.push(lit.r, lit.g, lit.b, 0, 0, 0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  return geometry;
}

/**
 * The gates' parts, in `group`. `ownGeometry` and `ownMaterial` are the view's: everything made
 * here is handed to them, to be released with the view. Until adopt() is handed the stone models,
 * the stones are plain five-sided stand-ins.
 */
export function createStones({ ownGeometry, ownMaterial }) {
  const L = STONE_LOOK;
  const group = new THREE.Group();
  group.name = 'gates';
  const transparent = { transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending };
  const glyphs = RUNE_STROKES.map((strokes) => ownGeometry(runeGeometry(strokes)));
  const beams = ownGeometry(beamGeometry(L.colour));
  // A stand-in the size of the file's stone: one unit tall on its base, 0.6 across and 0.44 deep.
  const standIn = ownGeometry(new THREE.CylinderGeometry(0.24, 0.3, 1, 5).scale(1, 1, 0.73).translate(0, 0.5, 0));
  const chunk = ownGeometry(new THREE.IcosahedronGeometry(0.5, 0));
  const rock = ownMaterial(new THREE.MeshStandardMaterial({
    color: 0x48505e, roughness: 1, metalness: 0, flatShading: true, emissive: L.glow, emissiveIntensity: 1,
  }));
  const flashPoints = Array.from({ length: 96 }, (_, i) => new THREE.Vector3(Math.cos(i / 96 * TAU) * GATES.wide, Math.sin(i / 96 * TAU) * GATES.wide, 0));
  const flashShape = ownGeometry(new THREE.BufferGeometry().setFromPoints(flashPoints));
  const views = [];

  for (let i = 0; i < GATES.count; i++) {
    const holder = new THREE.Group();
    holder.name = `gate-${i}`;
    holder.visible = false;
    const stones = [-1, 1].map((side, s) => {
      // The file stands on its base: the stone's middle is the gate's.
      const stone = new THREE.Group();
      stone.name = `stone-${i}-${s}`;
      stone.position.set(side * OUT, -L.tall / 2, 0);
      stone.scale.setScalar(L.tall);
      stone.add(new THREE.Mesh(standIn, rock));
      holder.add(stone);
      return stone;
    });
    const glyph = new THREE.Mesh(glyphs[0], ownMaterial(new THREE.MeshBasicMaterial({ color: L.colour, opacity: 0.9, side: THREE.DoubleSide, ...transparent })));
    glyph.name = `rune-${i}`;
    glyph.scale.setScalar(L.rune);
    const sides = new THREE.LineSegments(beams, ownMaterial(new THREE.LineBasicMaterial({ vertexColors: true, opacity: L.beams, ...transparent })));
    sides.name = `beams-${i}`;
    const flash = new THREE.LineLoop(flashShape, ownMaterial(new THREE.LineBasicMaterial({ color: L.colour, opacity: 0, ...transparent })));
    flash.name = `gate-flash-${i}`;
    flash.visible = false;
    // The glow is held above the fog, as every mark of the run's is (cloudbase.js).
    glyph.renderOrder = sides.renderOrder = flash.renderOrder = ORDER.aboveFog;
    holder.add(glyph, sides, flash);
    const pieces = PIECES.map((_, k) => {
      const piece = new THREE.Mesh(chunk, rock);
      piece.name = `rubble-${i}-${k}`;
      piece.visible = false;
      holder.add(piece);
      return piece;
    });
    group.add(holder);
    // `at` is the run second the set it shows was raised (NaN: none placed yet), `rune` its rune.
    views.push({ holder, stones, glyph, sides, flash, pieces, at: NaN, rune: 0 });
  }

  // Puts a gate where a newly raised set stands: its frame's x along the opening's width, its z
  // toward the middle of the lift (the way the file's carved face looks), and its rune between.
  function place(view, gate) {
    view.at = gate.at;
    view.rune = gate.rune;
    view.holder.position.set(gate.x, gate.y, gate.z);
    view.holder.rotation.set(0, Math.atan2(-gate.nx, -gate.nz), 0);
    view.glyph.geometry = glyphs[gate.rune] ?? glyphs[0];
  }

  /**
   * `time` is the run's clock, `runes` the meet's (meet.state.runes) and `eye` the camera's
   * position, which each rune turns to face, so it never reads backwards.
   */
  function update(time, runes, eye) {
    for (let i = 0; i < views.length; i++) {
      const view = views[i];
      const gate = runes.gates[i];
      if (gate.state === GATE.idle) {
        view.holder.visible = false;
        continue;
      }
      if (view.at !== gate.at || view.rune !== gate.rune) place(view, gate);
      const taken = gate.state === GATE.taken;
      // Seconds since it was taken or crumbled, and into its stones' crumbling: below nought while
      // the gate still waits, and while a taken one's rune flares.
      const since = gate.state === GATE.waiting ? -Infinity : time - gate.ended;
      const breaking = since - (taken ? L.after : 0);
      if (breaking >= L.crumbleFor) {
        view.holder.visible = false;
        continue;
      }
      view.holder.visible = true;
      view.holder.position.y = gate.y + Math.sin((time / L.bobFor) * TAU + i * 2.1) * L.bob;

      const whole = breaking < 0;
      view.stones[0].visible = view.stones[1].visible = whole;
      for (let k = 0; k < view.pieces.length; k++) {
        const piece = view.pieces[k];
        piece.visible = !whole;
        if (whole) continue;
        const motion = PIECES[k];
        piece.position.set(
          motion.x + motion.vx * breaking,
          motion.y + motion.vy * breaking - 0.5 * L.fall * breaking * breaking,
          motion.z + motion.vz * breaking,
        );
        piece.rotation.set(motion.spin * breaking, motion.spin * 0.7 * breaking, 0);
        piece.scale.setScalar(motion.size * (1 - smoothstep(0.55 * L.crumbleFor, L.crumbleFor, breaking)));
      }

      // The rune faces the camera about the upright, whichever side of the gate it is seen from.
      const glyph = view.glyph;
      glyph.rotation.y = Math.atan2(eye.x - gate.x, eye.z - gate.z) - view.holder.rotation.y;
      if (since < 0) {
        glyph.visible = true;
        glyph.scale.setScalar(L.rune);
        glyph.material.opacity = 0.8 + 0.15 * Math.sin(time * 2.4 + i);
      } else {
        // Taken, it flares and is gone; passed over, it fades where it is.
        const t = since / (taken ? L.flareFor : L.fade);
        glyph.visible = t < 1;
        glyph.scale.setScalar(L.rune * (taken ? 1 + (L.flare - 1) * smoothstep(0, 1, t) : 1));
        glyph.material.opacity = 0.95 * (1 - t);
      }
      view.sides.visible = since < L.fade;
      view.sides.material.opacity = since < 0 ? L.beams : L.beams * (1 - since / L.fade);
      // A taken gate's opening flashes out from it, in its own plane.
      const flashing = taken ? since / L.flareFor : 1;
      view.flash.visible = flashing >= 0 && flashing < 1;
      if (view.flash.visible) {
        view.flash.scale.setScalar(1 + 2 * flashing);
        view.flash.material.opacity = 0.9 * (1 - flashing);
      }
    }
  }

  /** Puts the file's stones in place of the stand-ins, all in one copy of its material of their own. */
  function adopt(models) {
    const copies = new Map();
    models.forEach((model, n) => {
      model.traverse((part) => {
        if (!part.isMesh) return;
        if (!copies.has(part.material)) {
          // The fjord's stones wear the file's material (their carvings lit by scenery.js): these
          // wear a copy, lit evenly and faintly, the rune between them being their light.
          const copy = ownMaterial(part.material.clone());
          copy.emissiveMap = null;
          copy.emissive.set(L.glow);
          copy.emissiveIntensity = 1;
          copies.set(part.material, copy);
        }
        part.material = copies.get(part.material);
      });
      if (!copies.size) throw new Error('The rune stone file has nothing to draw.');
      const stone = views[Math.floor(n / 2)]?.stones[n % 2];
      if (!stone) return;
      stone.clear();
      stone.add(model);
    });
  }

  /** Nothing of the last run's gates shows, and the next set raised is placed afresh. */
  function clear() {
    for (const view of views) {
      view.holder.visible = false;
      view.at = NaN;
      view.rune = 0;
    }
  }

  return { group, update, adopt, clear };
}
