// Test helper: a 2-D canvas for plain Node, where there is no browser to paint in. It draws nothing
// and keeps a log of every call and setting instead; whatever a real 2-D context lacks it lacks
// too, so a painter that reaches for it fails. Not part of the game, and deliberately not named
// *.test.js.
const METHODS = [
  'save', 'restore', 'fillRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc',
  'ellipse', 'fill', 'stroke', 'putImageData', 'drawImage',
];
const SETTINGS = ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'globalAlpha', 'imageSmoothingQuality'];

/** A canvas `width` x `height` whose 2-D context logs into `calls` ([name, ...arguments]). */
export function createSketchpad(width = 300, height = 150) {
  const calls = [];
  const ctx = {};
  for (const name of METHODS) ctx[name] = (...args) => void calls.push([name, ...args]);
  for (const name of SETTINGS) {
    let value;
    Object.defineProperty(ctx, name, {
      get: () => value,
      set: (next) => {
        calls.push([name, next]);
        value = next;
      },
    });
  }
  ctx.createLinearGradient = (...args) => {
    calls.push(['createLinearGradient', ...args]);
    const stops = [];
    return { stops, addColorStop: (at, colour) => void stops.push([at, colour]) };
  };
  ctx.createImageData = (w, h) => {
    calls.push(['createImageData', w, h]);
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  };
  return { width, height, calls, getContext: (kind) => (kind === '2d' ? ctx : null) };
}
