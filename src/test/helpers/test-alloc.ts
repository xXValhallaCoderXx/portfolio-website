// Test helper: counts the arrays a call makes, for the views that promise to make none while they
// draw. Not part of the game, and deliberately not named *.test.js.

// How many arrays and buffers a call makes by any constructor or array method (a literal is not
// seen): each is swapped for a counting stand-in while `draw` runs, and put back after.
const TYPED = Object.getPrototypeOf(Int8Array);
const MAKERS: Array<[object, string[]]> = [
  [globalThis, ['Array', 'ArrayBuffer', 'Float32Array', 'Float64Array', 'Uint8Array', 'Uint16Array', 'Uint32Array', 'Int32Array']],
  [Array, ['from', 'of']],
  [TYPED, ['from', 'of']],
  [Object, ['keys', 'values', 'entries']],
  [Array.prototype, ['concat', 'filter', 'flat', 'flatMap', 'map', 'slice', 'splice']],
  [TYPED.prototype, ['filter', 'map', 'slice', 'subarray']],
];

export function arraysMadeBy(draw: () => unknown) {
  let made = 0;
  const count = {
    apply(target: Function, self: unknown, args: unknown[]) { made += 1; return Reflect.apply(target, self, args); },
    construct(target: Function, args: unknown[], newTarget: Function) { made += 1; return Reflect.construct(target, args, newTarget); },
  };
  const swapped: Array<[object, string, PropertyDescriptor]> = [];
  try {
    for (const [owner, names] of MAKERS) {
      for (const name of names) {
        const real = Object.getOwnPropertyDescriptor(owner, name);
        if (typeof real?.value !== 'function') continue;
        Object.defineProperty(owner, name, { ...real, value: new Proxy(real.value, count) });
        swapped.push([owner, name, real]);
      }
    }
    draw();
  } finally {
    for (const [owner, name, real] of swapped) Object.defineProperty(owner, name, real);
  }
  return made;
}
