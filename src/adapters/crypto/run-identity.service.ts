import { runId as identifyRun } from '../../domains/good-lift/board-world.ts';

/** WebCrypto is available in HTTPS browsers and the deployed Node runtime. */
export async function digest(text: string | undefined, digits = 64): Promise<string> {
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  let hex = '';
  for (const byte of hash) hex += byte.toString(16).padStart(2, '0');
  return hex.slice(0, digits);
}

export function runId(log: Parameters<typeof identifyRun>[0]): Promise<string> {
  return identifyRun(log, digest);
}
