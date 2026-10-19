import type { WorldRow } from './board.types.ts';
// The world board: the best runs of each Daily Sky from every browser whose pilot opts in, kept by
// one Firebase function (functions/) that flies each run's log again before it ranks it. This is
// what that function and the page (board-online.js) share: what a row of it holds, and the id that
// names a run on it. Pure, like the local board (board.js): nothing here touches the network,
// storage or the clock. Its SHA-256 digest is injected by the browser/Node crypto adapter.
import { encodeLog, isDirectFrame } from './recorder.ts';
import { normalizeScore } from './board.ts';
import { bynameOf } from './meet-bynames.ts';
import { isBlocked } from './meet-initials.ts';

// What the world board keeps: the best `keep` runs of each day's Daily Sky, one at most from each
// device. A run's id is its first `id` hex digits of SHA-256, 96 bits: two runs that share one would
// take some 2^48 runs on one day to turn up.
export const WORLD_BOARD = Object.freeze({ keep: 100, id: 24 });

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const WHO = /^[A-Z]{3}$/;
const ID = new RegExp(`^[0-9a-f]{${WORLD_BOARD.id}}$`);

/**
 * The first `digits` hex digits of the SHA-256 of `text` (as UTF-8): what the function and the page
 * both name things by, a run (runId) and, in the function only, the device a run came from.
 */
export type Digest = (text: string | undefined, digits?: number) => Promise<string>;

// What the step makes of a step's five bits (run-step.js stepBits, flight.js): the brake and the bar
// bits together are the big ears, held straight when both arrows are held too; otherwise both
// arrows are the bar held straight, and the brake wins over the bar. Logs that differ only where the
// step cannot tell them apart fly one flight.
const flown = (bits: number) => {
  if (isDirectFrame(bits)) return bits;
  const both = (bits & 3) === 3;
  if ((bits & 12) === 12) return 12 | (both ? 0 : bits & 3);
  const deep = bits & 16;
  const brake = deep ? 4 : bits & 4;
  return (both ? 0 : bits & 3) | deep | brake | (!brake && (both || bits & 8) ? 8 : 0);
};

/**
 * A run's id on the world board, from its log (recorder.js decodeLog's): a digest of the log written
 * again with nothing in it but the run itself, the rules and the seed it was flown under and its
 * controls step by step, each step as the step reads it. The initials, the claims, the day and the
 * touch flag are no part of it, nor any way of writing a step's keys that flies the same, so one
 * flight has one id however its link is dressed: renamed, re-claimed, its keys rewritten or sent
 * from another device, it is the same run, and the board takes it once.
 */
export function runId(log: { simVersion: number; seed: number; steps: number; bits: Uint8Array | Uint32Array | number[] }, digest: Digest) {
  const frames = Uint32Array.from('subarray' in log.bits ? log.bits.subarray(0, log.steps) : log.bits.slice(0, log.steps), flown);
  // Controller mode is part of a flight's identity, including fully released direct brakes.
  return digest(encodeLog({ simVersion: log.simVersion, seed: log.seed }, frames, log.steps), WORLD_BOARD.id);
}

/**
 * A clean copy of a row of the world board, or null when any part of it is damaged. A row is
 *
 *   who      three capitals A to Z, never one meet-initials.js blocks, and never none: a run goes
 *            on the world board only under initials, since setting them is how a pilot opts in
 *   byname   the byname its run earned (meet-bynames.js), by its id, or '' for none
 *   total    kg, a whole number of 2.5 kg steps
 *   peak     m, whole metres
 *   red      each lift's lights in lift order, the mist last (board.js)
 *   at       ms since 1970 when the function took the run: of two that tie, the earlier ranks first
 *   id       its run's id (runId)
 *
 * Anything else is left behind, the device the run came from among it, which never leaves the
 * function. As on the local board, a byname this build does not know is blanked, not the row dropped.
 */
export function normalizeWorldRow(row: unknown): WorldRow | null {
  if (!isRecord(row)) return null;
  const { who, byname, at, id } = row;
  if (typeof who !== 'string' || !WHO.test(who) || isBlocked(who)) return null;
  const score = normalizeScore(row);
  if (!score) return null;
  if (typeof at !== 'number' || !Number.isFinite(at) || at < 0) return null;
  if (typeof id !== 'string' || !ID.test(id)) return null;
  return { who, byname: typeof byname === 'string' && bynameOf(byname) ? byname : '', ...score, at, id };
}
