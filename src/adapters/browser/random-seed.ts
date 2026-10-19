/** A seed nobody chose, for a practice run. */
export function randomSeed() {
  const one = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(one);
  else one[0] = Math.random() * 0x100000000;
  return one[0];
}

