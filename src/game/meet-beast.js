// The Beast's look: Hrungnir's 48 kg bell, drawn half as big again as his heaviest, in dark stone
// cracked through with the forge's ember and cut with three of the giant's own rune, ᚦ (Thurisaz).
// No model of it exists yet, so it is the kettlebell's own shape wrapped in a stone painted here,
// once, as plain numbers: no picture to fetch and no canvas, so the tests see what the game shows.
// If public/models/kettlebell-beast.glb is ever made, the meet's view wears that instead
// (meet-view.js), glowing as the other bells do.
import * as THREE from 'three';

// Between its cracks the stone glows faintly all through (`warm`): at `glow` that is a quarter to a
// half of the glow every other bell has all over, a third on the whole, so that from afar the Beast
// reads as one great bell of hot iron and not as a scatter of burning lines.
export const BEAST_LOOK = Object.freeze({
  size: 4.5,                        // m tall: half as big again as the 32 kg bell's 3 m (BELL_LOOK.size)
  tumble: 1.1,                      // rad/s as it falls: half as fast as the others, for its weight
  glow: 1.4,                        // how bright its cracks and runes burn
  warm: Object.freeze([0.34, 0.46]), // of the ember, all through the stone: its darkest to its palest
  model: 0.4,                       // how bright the ember glow over a model of its own is (the bells' is 0.55)
  outer: 1.35,                      // its warning's second ring, in strike radii
  spin: 0.8,                        // rad/s that second ring turns
  paint: Object.freeze([256, 128]), // texels round the bell and up it
});

const TAU = Math.PI * 2;
// The ember the cracks burn with: the forge's (BELL_LOOK.ember).
const EMBER = Object.freeze([255, 122, 46]);
// ᚦ as the strokes it is cut with, on a stave one unit tall: the giant's rune.
const THURISAZ = Object.freeze([[0, 0, 0, 1], [0, 0.78, 0.42, 0.5], [0.42, 0.5, 0, 0.22]]);

/**
 * The Beast's stone, painted round the bell (u, from its back all the way round) and up it (v, from
 * its foot to the top of its handle): `colour`, mottled dark stone with darker grooves, and `glow`,
 * a faint ember all through it (BEAST_LOOK.warm) and the full ember in its cracks and its runes.
 * Two new textures, for the caller to own. Its own little generator draws it, so the stone is the
 * same every time.
 */
export function paintBeast([w, h] = BEAST_LOOK.paint) {
  const colour = new Uint8Array(w * h * 4);
  const glow = new Uint8Array(w * h * 4);
  const [cool, warm] = BEAST_LOOK.warm;
  let seed = 0x2545f491;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < w * h; i++) {
    const pale = random();
    const shade = 30 + pale * 16;
    colour[i * 4] = shade + 7;
    colour[i * 4 + 1] = shade + 3;
    colour[i * 4 + 2] = shade;
    colour[i * 4 + 3] = 255;
    // The paler the stone, the warmer it glows.
    for (let c = 0; c < 3; c++) glow[i * 4 + c] = Math.round(EMBER[c] * (cool + (warm - cool) * pale));
    glow[i * 4 + 3] = 255;
  }
  // A groove at one texel, burning at `heat` (0 to 1); round the bell it wraps, up it it stops.
  const burn = (x, y, heat) => {
    const u = ((Math.round(x) % w) + w) % w;
    const v = Math.round(y);
    if (v < 0 || v >= h) return;
    const i = (v * w + u) * 4;
    colour[i] = 18;
    colour[i + 1] = 14;
    colour[i + 2] = 12;
    for (let c = 0; c < 3; c++) glow[i + c] = Math.max(glow[i + c], Math.round(EMBER[c] * heat));
  };
  // Cracks: wandering lines, some hotter than others.
  for (let crack = 0; crack < 14; crack++) {
    let x = random() * w;
    let y = random() * h;
    let angle = random() * TAU;
    const heat = 0.45 + random() * 0.55;
    const steps = 30 + Math.floor(random() * 60);
    for (let s = 0; s < steps; s++) {
      burn(x, y, heat);
      angle += (random() - 0.5) * 0.9;
      x += Math.cos(angle);
      y += Math.sin(angle) * 0.7;
    }
  }
  // Its runes, three times round its belly, two texels wide and burning brightest.
  const tall = h * 0.3;
  for (let r = 0; r < 3; r++) {
    const left = ((r + 0.5) / 3) * w - tall * 0.2;
    for (const [x1, y1, x2, y2] of THURISAZ) {
      const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * tall * 2);
      for (let s = 0; s <= steps; s++) {
        const x = left + (x1 + (x2 - x1) * (s / steps)) * tall;
        const y = h * 0.18 + (y1 + (y2 - y1) * (s / steps)) * tall;
        burn(x, y, 1);
        burn(x + 1, y, 1);
      }
    }
  }
  const texture = (data) => {
    const made = new THREE.DataTexture(data, w, h);
    made.colorSpace = THREE.SRGBColorSpace;
    made.wrapS = THREE.RepeatWrapping;
    made.magFilter = made.minFilter = THREE.LinearFilter;
    made.needsUpdate = true;
    return made;
  };
  return { colour: texture(colour), glow: texture(glow) };
}

/**
 * A copy of `geometry` (the kettlebell's) wrapped for the Beast's stone: its texture coordinates go
 * round the bell's upright and up it from foot to handle, whatever the file's own ones were, so
 * the cracks wrap it whole and the runes stand on its belly. The copy is the caller's to own.
 *
 * Every triangle has corners of its own, so that one straddling the seam at the bell's back (where
 * the way round comes back to where it started, from 1 to 0) can go on round past 1, the stone
 * repeating there, instead of squeezing the whole stone backwards across that one strip.
 */
export function wrapBeast(geometry) {
  const wrapped = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const position = wrapped.attributes.position;
  wrapped.computeBoundingBox();
  const { min, max } = wrapped.boundingBox;
  const cx = (min.x + max.x) / 2;
  const cz = (min.z + max.z) / 2;
  const tall = max.y - min.y || 1;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    uv[i * 2] = 0.5 + Math.atan2(position.getX(i) - cx, position.getZ(i) - cz) / TAU;
    uv[i * 2 + 1] = (position.getY(i) - min.y) / tall;
  }
  // A triangle reaching more than half way round has crossed the seam: its corners short of half
  // way go round once more.
  for (let t = 0; t + 2 < position.count; t += 3) {
    const a = uv[t * 2];
    const b = uv[t * 2 + 2];
    const c = uv[t * 2 + 4];
    if (Math.max(a, b, c) - Math.min(a, b, c) <= 0.5) continue;
    for (let k = 0; k < 3; k++) if (uv[(t + k) * 2] < 0.5) uv[(t + k) * 2] += 1;
  }
  wrapped.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return wrapped;
}

/** The Beast's stone as a material, over the two textures paintBeast() made. The caller owns it. */
export function beastStone({ colour, glow }) {
  return new THREE.MeshStandardMaterial({
    map: colour, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: BEAST_LOOK.glow, roughness: 0.95, metalness: 0.08,
  });
}
