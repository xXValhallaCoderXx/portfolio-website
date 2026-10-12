// The map the route is drawn over: contour lines of a made-up landscape, as one square picture that
// repeats without a seam.

const TILE = 640; // the picture's side, in CSS pixels
const STEP = 8; // how finely the landscape is sampled
const LEVELS = 11; // how many contour heights are drawn

// A small repeatable random source, so the landscape is the same on every visit.
function random(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Smooth noise that wraps around after `period` cells, which is what lets the picture tile.
function wrappingNoise(period, next) {
  const lattice = Array.from({ length: period * period }, next);
  const at = (x, y) => lattice[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
  const ease = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = ease(x - x0);
    const ty = ease(y - y0);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return top + (bottom - top) * ty;
  };
}

/** Draws the contour picture and returns it as an image address, with the side it should repeat at. */
export function contourTile(seed = 11) {
  const next = random(seed);
  const broad = wrappingNoise(3, next);
  const fine = wrappingNoise(7, next);
  const cells = TILE / STEP;
  const height = (i, j) => broad((i / cells) * 3, (j / cells) * 3) * 0.72 + fine((i / cells) * 7, (j / cells) * 7) * 0.28;

  const scale = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE * scale;
  const pen = canvas.getContext('2d');
  pen.scale(scale, scale);
  pen.lineWidth = 1;

  for (let level = 1; level < LEVELS; level += 1) {
    const cut = level / LEVELS;
    // Every fourth line is drawn stronger, the way a map marks its index contours.
    pen.strokeStyle = `rgba(59, 158, 255, ${level % 4 === 0 ? 0.13 : 0.06})`;
    pen.beginPath();
    for (let j = 0; j < cells; j += 1) {
      for (let i = 0; i < cells; i += 1) {
        const corners = [height(i, j), height(i + 1, j), height(i + 1, j + 1), height(i, j + 1)];
        // Where the contour crosses each side of this cell, if it does: top, right, bottom, left.
        const crossings = [];
        const cross = (a, b, ax, ay, bx, by) => {
          if (a < cut === b < cut) return;
          const t = (cut - a) / (b - a);
          crossings.push([(i + ax + (bx - ax) * t) * STEP, (j + ay + (by - ay) * t) * STEP]);
        };
        cross(corners[0], corners[1], 0, 0, 1, 0);
        cross(corners[1], corners[2], 1, 0, 1, 1);
        cross(corners[3], corners[2], 0, 1, 1, 1);
        cross(corners[0], corners[3], 0, 0, 0, 1);
        for (let k = 0; k + 1 < crossings.length; k += 2) {
          pen.moveTo(crossings[k][0], crossings[k][1]);
          pen.lineTo(crossings[k + 1][0], crossings[k + 1][1]);
        }
      }
    }
    pen.stroke();
  }
  return { image: canvas.toDataURL('image/png'), size: TILE };
}
