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
  const calls: unknown[][] = [];
  const ctx: Record<string, unknown> = {};
  for (const name of METHODS) ctx[name] = (...args: unknown[]) => void calls.push([name, ...args]);
  for (const name of SETTINGS) {
    let value: unknown;
    Object.defineProperty(ctx, name, {
      get: () => value,
      set: (next: unknown) => {
        calls.push([name, next]);
        value = next;
      },
    });
  }
  ctx.createLinearGradient = (...args: unknown[]) => {
    calls.push(['createLinearGradient', ...args]);
    const stops: Array<[number,string]> = [];
    return { stops, addColorStop: (at: number, colour: string) => void stops.push([at, colour]) };
  };
  ctx.createImageData = (w: number, h: number) => {
    calls.push(['createImageData', w, h]);
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  };
  return { width, height, calls, getContext: (kind: string) => (kind === '2d' ? ctx as unknown as CanvasRenderingContext2D : null) };
}
