import type { CanvasSurface } from './rendering.types.ts';
// Wing liveries: the wings Good Lift's kit unlocks (good-lift-store.js), worn wherever the visitor
// flies. The page fetches this only once a livery is worn (scenery.js), so the standard wing costs
// it nothing; the game's kit tab brings it along, to paint its swatches. wing.glb's own texture
// coordinates are scrambled, so a livery is a flat picture laid over the wing by a second set of
// its own: tip to tip along the span, leading edge to trailing edge along the chord, worked out once
// from the wing's resting shape. The picture is the glow as well as the colour, so each is made of
// bold shapes that still read at 30 m at night.
//
// The owner's own paintings go in public/liveries/<id>.png (1024 x 512, the pilot's left tip on
// the left and the leading edge along the top, as the wing is seen from above flying up the
// picture). Until one is there, or while it loads, the livery is painted here to the same brief.
import { CanvasTexture, SRGBColorSpace } from 'three';

// Every livery: its name in the kit, what it looks like, and `glow`, how brightly its own picture
// lights the cloth at night (the material's emissive intensity; the standard wing's is 0.2). A pale
// livery glows less, since the bloom (threshold 0.3) would otherwise wash it out.
export const LIVERIES = Object.freeze({
  raven: Object.freeze({ name: 'Raven', look: 'black, with a violet leading edge', glow: 0.6 }),
  calibrated: Object.freeze({ name: 'Calibrated', look: 'plate colours, loaded from the middle out', glow: 0.32 }),
  sheetless: Object.freeze({ name: 'Sheetless', look: 'a log grid, a training line climbing it', glow: 0.45 }),
  flyte: Object.freeze({ name: 'Flyte', look: 'contour lines, a climb traced over them', glow: 0.4 }),
  hird: Object.freeze({ name: 'Hird', look: 'a knotwork band on each half', glow: 0.42 }),
  valkyrie: Object.freeze({ name: 'Valkyrie', look: 'white, with a gold trailing edge', glow: 0.16 }),
});

// The painted picture's size in pixels (its long side is the span), and how many stations along the
// span wingUv measures the wing at. `aspect` is how many of its middle chords long the wing is from
// tip to tip along its arc (wing.glb: 1.12 of span to 0.28 of chord, in the file's units), so that a
// painter can make a shape that comes out round on the cloth. `picture` is the most of the owner's
// own painting the graphics card is given, in pixels across the span and down the chord: a bigger
// one is drawn down to it. The 11.5 m wing is never much more than 800 pixels across even on a
// 4K screen (26 m behind it in the chase, under a 60° view), so more would only cost memory, about
// 2.8 MB at this size with its smaller copies and four times that at twice it.
export const LIVERY = Object.freeze({ width: 512, height: 256, stations: 64, aspect: 4, picture: Object.freeze([1024, 512]) });

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The livery's texture coordinates for a wing whose resting shape is `rest` (x, y, z for each point,
 * in the wing file's units: 1 wide along x, +x the pilot's left, leading edge at +z): a Float32Array
 * of u, v for each point, for the wing geometry's `uv1`.
 *
 *   u  0 at the pilot's left tip to 1 at the right, measured along the arc of the wing through the
 *      middle of its cloth, so a band a tenth of the picture wide is a tenth of the wing wide even
 *      where the tips curve down
 *   v  1 at the leading edge to 0 at the trailing edge (the picture's top row to its bottom, as a
 *      texture is turned the right way up), measured across the chord at that point of the span,
 *      so an edge painted along the picture runs right out to the narrow tips
 *
 * The wing is measured at LIVERY.stations stations across its span, and each point read between the
 * two nearest. Pure: the same shape always gives the same coordinates.
 */
export function wingUv(rest: ArrayLike<number>) {
  const count = Math.floor(rest.length / 3);
  const n = LIVERY.stations;
  let left = -Infinity;
  let right = Infinity;
  for (let i = 0; i < count; i++) {
    left = Math.max(left, rest[i * 3]);
    right = Math.min(right, rest[i * 3]);
  }
  const width = left - right || 1;
  const station = (x: number) => ((x - right) / width) * (n - 1);
  // At each station: the leading edge's z (the largest), the trailing edge's (the smallest), and
  // the top and bottom of the cloth.
  const lead = new Float64Array(n).fill(-Infinity);
  const trail = new Float64Array(n).fill(Infinity);
  const top = new Float64Array(n).fill(-Infinity);
  const bottom = new Float64Array(n).fill(Infinity);
  for (let i = 0; i < count; i++) {
    const k = clamp(Math.round(station(rest[i * 3])), 0, n - 1);
    const y = rest[i * 3 + 1];
    const z = rest[i * 3 + 2];
    lead[k] = Math.max(lead[k], z);
    trail[k] = Math.min(trail[k], z);
    top[k] = Math.max(top[k], y);
    bottom[k] = Math.min(bottom[k], y);
  }
  // A station no point fell near takes the measure of the nearest one that has one.
  for (let k = 0; k < n; k++) {
    if (lead[k] > -Infinity) continue;
    for (let reach = 1; reach < n; reach++) {
      const near = [k - reach, k + reach].find((j) => j >= 0 && j < n && lead[j] > -Infinity);
      if (near === undefined) continue;
      lead[k] = lead[near];
      trail[k] = trail[near];
      top[k] = top[near];
      bottom[k] = bottom[near];
      break;
    }
  }
  // How far along the arc each station is from the right tip, through the middle of the cloth.
  const along = new Float64Array(n);
  const step = width / (n - 1);
  for (let k = 1; k < n; k++) {
    const rise = (top[k] + bottom[k] - top[k - 1] - bottom[k - 1]) / 2;
    along[k] = along[k - 1] + Math.hypot(step, rise);
  }
  const span = along[n - 1] || 1;
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const at = clamp(station(rest[i * 3]), 0, n - 1);
    const k = Math.min(n - 2, Math.floor(at));
    const t = at - k;
    const s = along[k] + (along[k + 1] - along[k]) * t;
    const front = lead[k] + (lead[k + 1] - lead[k]) * t;
    const back = trail[k] + (trail[k + 1] - trail[k]) * t;
    const aft = clamp((front - rest[i * 3 + 2]) / Math.max(front - back, 1e-6), 0, 1);
    uv[i * 2] = 1 - s / span;
    uv[i * 2 + 1] = 1 - aft;
  }
  return uv;
}

// ---------------------------------------------------------------- the painters

// Each paints its livery over the whole of a `w` x `h` canvas: x along the span from the pilot's
// left tip, y down the chord from the leading edge. `round(c)` is how many pixels along the span
// look as long on the wing as `c` of its middle chords, which are `h` pixels down the canvas.
const PAINTERS = {
  // Black with the faintest blue in it, flight feathers fanned back from a violet leading edge, and
  // their tips catching the same violet sheen a raven's do. Only the violet glows. From the chase
  // camera, a few degrees above the wing and behind it, the back third of the chord is most of
  // what shows, so the feather tips carry the colour there.
  raven(ctx: CanvasRenderingContext2D, w: number, h: number, round: (chord: number) => number) {
    ctx.fillStyle = '#0a0a11';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1a1a28';
    ctx.lineWidth = Math.max(1, h * 0.016);
    for (let i = 1; i < 28; i++) {
      const u = i / 28;
      ctx.beginPath();
      ctx.moveTo(u * w, h * 0.22);
      ctx.lineTo((u + (u - 0.5) * 0.1) * w, h);
      ctx.stroke();
    }
    const tooth = round(0.22);
    ctx.fillStyle = '#5b33d6';
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x < w; x += tooth) {
      ctx.lineTo(x + tooth * 0.5, h * 0.8);
      ctx.lineTo(x + tooth, h);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#05050a';
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x < w; x += tooth) {
      ctx.lineTo(x + tooth * 0.5, h * 0.88);
      ctx.lineTo(x + tooth, h);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6a3df0';
    ctx.fillRect(0, 0, w, h * 0.13);
    ctx.fillStyle = '#b39aff';
    ctx.fillRect(0, 0, w, h * 0.04);
    ctx.fillStyle = '#6a3df0';
    ctx.fillRect(0, h * 0.165, w, h * 0.022);
  },

  // A loaded bar seen from above: steel along the middle of the chord from tip to tip, a collar, and
  // the competition plates from the middle out on each half, heaviest first and thickest, each with
  // a dark gap to the next: red 25, blue 20, yellow 15, green 10, white 5.
  calibrated(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#141922';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#8f9bab';
    ctx.fillRect(0, h * 0.43, w, h * 0.14);
    ctx.fillStyle = '#c9d2dd';
    ctx.fillRect(0, h * 0.47, w, h * 0.03);
    const plates: [number, string][] = [
      [0.15, '#f04848'], [0.13, '#3a7ff0'], [0.12, '#f5c533'], [0.11, '#37c06a'], [0.1, '#f4f6fa'],
    ];
    // Shares of each half of the span, from the middle out.
    const band = (from: number, to: number, colour: string, side: number) => {
      const a = 0.5 + (side * from) / 2;
      const b = 0.5 + (side * to) / 2;
      ctx.fillStyle = colour;
      ctx.fillRect(Math.min(a, b) * w, h * 0.04, Math.abs(b - a) * w, h * 0.92);
    };
    for (const side of [-1, 1]) {
      band(0.07, 0.1, '#c9d2dd', side);
      let at = 0.11;
      for (const [thick, colour] of plates) {
        band(at, at + thick, colour, side);
        // A darker rim down each face of the plate, so neighbours read apart.
        band(at, at + 0.012, 'rgba(6, 10, 19, 0.45)', side);
        band(at + thick - 0.012, at + thick, 'rgba(6, 10, 19, 0.45)', side);
        at += thick + 0.012;
      }
      band(at + 0.01, at + 0.04, '#c9d2dd', side);
    }
  },

  // Graph paper at night, ink-blue with cyan rules: three decades of a log scale along the span,
  // each ruled at 1 to 9 with its first rule bold, a linear scale down the chord, and a training
  // line in ember climbing it, a session at each point and a deload where it dips.
  sheetless(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#0b1b2d';
    ctx.fillRect(0, 0, w, h);
    const rule = (x: number, y: number, along: boolean, thick: number, colour: string) => {
      ctx.fillStyle = colour;
      if (along) ctx.fillRect(0, y - thick / 2, w, thick);
      else ctx.fillRect(x - thick / 2, 0, thick, h);
    };
    for (let k = 1; k < 10; k++) rule(0, (k / 10) * h, true, k === 5 ? 2.5 : 1, k === 5 ? '#5ee6ff' : 'rgba(94, 230, 255, 0.4)');
    for (let decade = 0; decade < 3; decade++) {
      for (let k = 1; k < 10; k++) {
        const u = (decade + Math.log10(k)) / 3;
        rule(u * w, 0, false, k === 1 ? 3 : 1.2, k === 1 ? '#5ee6ff' : 'rgba(94, 230, 255, 0.4)');
      }
    }
    rule(w - 1.5, 0, false, 3, '#5ee6ff');
    const sessions = [[0.05, 0.84], [0.15, 0.76], [0.25, 0.69], [0.35, 0.6], [0.45, 0.54], [0.55, 0.62], [0.65, 0.47], [0.75, 0.38], [0.85, 0.3], [0.95, 0.2]];
    ctx.strokeStyle = '#ff9d4a';
    ctx.lineWidth = h * 0.045;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    sessions.forEach(([u, v], i) => (i ? ctx.lineTo(u * w, v * h) : ctx.moveTo(u * w, v * h)));
    ctx.stroke();
    ctx.fillStyle = '#ffd2a6';
    const dot = h * 0.05;
    for (const [u, v] of sessions) ctx.fillRect(u * w - dot / 2, v * h - dot / 2, dot, dot);
  },

  // A contour map at dusk: slate-green ground shading lighter up three summits, thin sand contours
  // with every fifth bold and bright, and a flight traced over it in cyan: a glide in from the left
  // tip, three turns climbing in a thermal, and on out to the right.
  flyte(ctx: CanvasRenderingContext2D, w: number, h: number, round: (arg0: number) => number) {
    const hills = [[0.24, 0.42, 1, 0.55], [0.6, 0.66, 0.8, 0.45], [0.86, 0.3, 0.65, 0.35], [0.42, 0.95, 0.4, 0.4]];
    const chord = round(1); // pixels along the span to one chord
    const field = new Float32Array(w * h);
    for (let py = 0; py < h; py++) {
      const v = (py + 0.5) / h;
      for (let px = 0; px < w; px++) {
        const along = (px + 0.5) / chord;
        let height = 0;
        for (const [u, hv, top, spread] of hills) {
          const dx = along - (u * w) / chord;
          const dy = v - hv;
          height += top * Math.exp(-(dx * dx + dy * dy) / (2 * spread * spread));
        }
        field[py * w + px] = height;
      }
    }
    const levels = 16;
    const image = ctx.createImageData(w, h);
    const { data } = image;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const i = py * w + px;
        const n = field[i] * levels;
        const gx = (field[py * w + Math.min(w - 1, px + 1)] - field[py * w + Math.max(0, px - 1)]) * levels / 2;
        const gy = (field[Math.min(h - 1, py + 1) * w + px] - field[Math.max(0, py - 1) * w + px]) * levels / 2;
        const slope = Math.max(Math.hypot(gx, gy), 1e-4);
        const f = n - Math.floor(n);
        const index = Math.round(n) % 5 === 0;
        // How far this pixel is from the nearest contour, in pixels, and so how much of the line it holds.
        const line = clamp((index ? 2.6 : 1.4) - Math.min(f, 1 - f) / slope, 0, 1);
        const up = clamp(field[i] / 1.1, 0, 1);
        const ground = [14 + 34 * up, 34 + 30 * up, 32 + 12 * up];
        const ink = index ? [255, 214, 130] : [205, 185, 138];
        for (let c = 0; c < 3; c++) data[i * 4 + c] = ground[c] + (ink[c] - ground[c]) * line;
        data[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    ctx.strokeStyle = '#5ee6ff';
    ctx.lineWidth = h * 0.035;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0.02 * w, 0.8 * h);
    ctx.bezierCurveTo(0.14 * w, 0.88 * h, 0.3 * w, 0.75 * h, 0.4 * w, 0.62 * h);
    // The climb: three turns, drifting downwind and narrowing as it goes up.
    const turns = 3;
    for (let a = 0; a <= turns * Math.PI * 2; a += 0.2) {
      const t = a / (turns * Math.PI * 2);
      const r = 0.22 * (1 - 0.35 * t);
      ctx.lineTo(0.4 * w + round(0.6 * t) + round(r) * (1 - Math.cos(a)), (0.62 - 0.32 * t) * h - r * h * Math.sin(a));
    }
    ctx.bezierCurveTo(0.7 * w, 0.2 * h, 0.85 * w, 0.18 * h, 0.98 * w, 0.24 * h);
    ctx.stroke();
  },

  // Night blue, and on each half a band of red bordered in gold, carrying a two-strand interlace in
  // gold outlined dark, over and under in turn, closed with a ring at each end. The bands lie in
  // the back of the chord, which is what the chase camera sees most of.
  hird(ctx: CanvasRenderingContext2D, w: number, h: number, round: (arg0: number) => number) {
    ctx.fillStyle = '#0f1624';
    ctx.fillRect(0, 0, w, h);
    const middle = h * 0.71;
    const half = h * 0.2;
    const period = round(0.62);
    const sway = h * 0.115;
    const thick = h * 0.07;
    const strand = (from: number, to: number, phase: number, start: number, end: number) => {
      ctx.beginPath();
      for (let x = Math.max(from, start); x <= Math.min(to, end) + 0.01; x += 2) {
        const y = middle + sway * Math.sin(((x - from) / period) * Math.PI * 2 + phase);
        if (x === Math.max(from, start)) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#1b0c06';
      ctx.lineWidth = thick + h * 0.035;
      ctx.stroke();
      ctx.strokeStyle = '#e2b04a';
      ctx.lineWidth = thick;
      ctx.stroke();
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const side of [-1, 1]) {
      const a = (0.5 + side * 0.045) * w;
      const b = (0.5 + side * 0.465) * w;
      const from = Math.min(a, b);
      const to = Math.max(a, b);
      ctx.fillStyle = '#5a1616';
      ctx.fillRect(from, middle - half, to - from, half * 2);
      ctx.fillStyle = '#d9a441';
      ctx.fillRect(from, middle - half - h * 0.03, to - from, h * 0.025);
      ctx.fillRect(from, middle + half + h * 0.005, to - from, h * 0.025);
      const inside = from + round(0.12);
      const end = inside + Math.floor((to - round(0.12) - inside) / (period / 2)) * (period / 2);
      strand(inside, end, 0, inside, end);
      strand(inside, end, Math.PI, inside, end);
      // Every other crossing, the first strand is drawn over again, so the two pass over and under in
      // turn. Cut square, so the piece's own outline leaves no mark across the strand it lies on.
      ctx.lineCap = 'butt';
      for (let x = inside + period / 2; x < end; x += period) strand(inside, end, 0, x - period * 0.12, x + period * 0.12);
      ctx.lineCap = 'round';
      for (const x of [inside, end]) {
        ctx.beginPath();
        ctx.ellipse(x, middle, round(0.1), sway * 0.95, 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#1b0c06';
        ctx.lineWidth = thick + h * 0.035;
        ctx.stroke();
        ctx.strokeStyle = '#e2b04a';
        ctx.lineWidth = thick;
        ctx.stroke();
      }
    }
  },

  // White with a breath of blue toward the tips, and a gold trailing edge whose forward edge is
  // scalloped like the ends of feathers, with a brighter line along the very edge.
  valkyrie(ctx: CanvasRenderingContext2D, w: number, h: number, round: (chord: number) => number) {
    const body = ctx.createLinearGradient(0, 0, w, 0);
    body.addColorStop(0, '#dfe6f0');
    body.addColorStop(0.5, '#f7f9fc');
    body.addColorStop(1, '#dfe6f0');
    ctx.fillStyle = body;
    ctx.fillRect(0, 0, w, h);
    const feather = round(0.3);
    ctx.fillStyle = '#d9a032';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.8);
    for (let x = 0; x < w; x += feather) {
      ctx.quadraticCurveTo(x + feather / 2, h * 0.68, x + feather, h * 0.8);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f6cf6a';
    ctx.fillRect(0, h * 0.95, w, h * 0.05);
  },
};

/** Paints livery `id` over the whole of a `width` x `height` 2-D canvas context. */
export function paintLivery(ctx: CanvasRenderingContext2D, id: string, width: number = LIVERY.width, height: number = LIVERY.height) {
  const paint = PAINTERS[id as keyof typeof PAINTERS];
  if (!paint) throw new Error(`There is no livery called ${id}.`);
  const round = (chords: number) => (chords * width) / LIVERY.aspect;
  ctx.save();
  paint(ctx, width, height, round);
  ctx.restore();
}

// The owner's own paintings, asked for once a visit each: the image once it has loaded, or null
// where there is none (yet) or nothing to load it with, and the painted livery stays.
const pictures = new Map<string, Promise<HTMLImageElement | null>>();

/** The owner's picture for livery `id`, from public/liveries/<id>.png under `base`, or null. */
export function liveryPicture(id: string, base = '/') {
  if (!pictures.has(id)) {
    pictures.set(id, new Promise<HTMLImageElement | null>((resolve) => {
      if (typeof Image === 'undefined') return resolve(null);
      const image = new Image();
      image.onload = () => resolve(image.naturalWidth > 0 ? image : null);
      image.onerror = () => resolve(null);
      image.src = `${base}liveries/${id}.png`;
      return undefined;
    }));
  }
  return pictures.get(id)!;
}

/**
 * Livery `id` as a texture for the wing's second set of coordinates (`uv1`, from wingUv), painted
 * at once on `canvas` and replaced by the owner's picture if one loads. The caller owns it, and
 * disposes of it once the wing no longer wears it.
 */
export function liveryTexture(id: string, { canvas = document.createElement('canvas'), base = '/', picture = liveryPicture }: { canvas?: CanvasSurface; base?: string; picture?: (id: string, base: string) => Promise<{ width: number; height: number } | null> } = {}) {
  canvas.width = LIVERY.width;
  canvas.height = LIVERY.height;
  const ctx = canvas.getContext('2d')!;
  paintLivery(ctx, id, canvas.width, canvas.height);
  const texture = new CanvasTexture(canvas);
  texture.name = `livery-${id}`;
  texture.channel = 1;
  texture.colorSpace = SRGBColorSpace;
  // The wing is mostly seen at a glancing angle, from behind and above.
  texture.anisotropy = 8;
  picture(id, base).then((found) => {
    if (!found) return;
    // The owner's picture is drawn over the painted one on the same canvas, at its own size or, if
    // it is bigger than LIVERY.picture, drawn down to fit it. three.js gave the texture its room on
    // the graphics card when the painted picture was first drawn, and would only write another into
    // that same room, which WebGL refuses for a picture of another size: the wing would stay
    // painted. Disposing of the texture gives that room back (the texture itself is kept), so the
    // next frame makes room for the picture as it now is.
    const [most, mostDown] = LIVERY.picture;
    const scale = Math.min(1, most / found.width, mostDown / found.height);
    texture.dispose();
    canvas.width = Math.max(1, Math.round(found.width * scale));
    canvas.height = Math.max(1, Math.round(found.height * scale));
    // Drawn down by more than half, the browser's plainest smoothing would skip whole rows.
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(found as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    texture.needsUpdate = true;
  });
  return texture;
}
