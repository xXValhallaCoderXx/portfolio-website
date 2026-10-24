// The world board from the page's side (board-world.js; the function that keeps it is in
// functions/): this browser's device token, a run sent up, a day's board fetched back, and this
// browser's run taken off again. It is off unless the build names the function (VITE_BOARD_URL,
// which good-lift.js hands in), and then it never stands in a run's way: plain fetch with no
// Firebase SDK, every request given up after ONLINE.wait, and offline, refused, slow or broken,
// what comes back is null and the sheet shows this browser's board alone, as it always has.
//
// The result controller sends only after the player explicitly submits a finished score. Asking
// for a day's board sends nothing of anyone's but the day.
import { runId } from '../../../adapters/crypto/run-identity.service.ts';
import type { WorldRow } from '../../../domains/good-lift/board.types.ts';
import type { StoragePort } from '../../../adapters/browser/storage.port.ts';
import { SIM_VERSION } from '../../../domains/good-lift/sim-version.ts';
import { decodeLog } from '../../../domains/good-lift/recorder.ts';
import { WORLD_BOARD, normalizeWorldRow } from '../../../domains/good-lift/board-world.ts';

/**
 * This browser's device token, under a localStorage key of its own: the one thing that can take its
 * runs off the world board again, so Reset progress, which clears Good Lift's store, leaves it be.
 */
export const DEVICE_KEY = 'good-lift-device';

export const ONLINE = Object.freeze({
  // ms before a request is given up: a cold function starts in a few seconds, and replays a run in
  // a fifth of one at most.
  wait: 8000,
  // Random bytes in a device token: 43 characters of base64url.
  token: 32,
});

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isDay = (day: unknown): day is number => typeof day === 'number' && Number.isSafeInteger(day) && day > 0;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
// The reasons the function gives for a run it did not rank (functions/src/runs.js), kept to words.
const WHY = /^[a-z-]{1,16}$/;

/**
 * Where the function is, from what the build was given: an https address (or http on this machine,
 * for an emulator) with no query or fragment and no trailing slash, or '' when there is none, and
 * the world board is off.
 */
export function boardUrl(text: unknown) {
  if (typeof text !== 'string' || !text.trim()) return '';
  let url;
  try {
    url = new URL(text.trim());
  } catch {
    return '';
  }
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !local) || url.search || url.hash || url.username || url.password) return '';
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/**
 * A day's board as the function sends it ({ version, day, rows }), held to what this build asked
 * for: rows of these rules and of `day`, each clean (board-world.js normalizeWorldRow) and each run
 * once, best first as sent, at most WORLD_BOARD.keep of them; or null for anything else.
 */
export function readBoard(raw: unknown, day: number) {
  if (!isRecord(raw) || raw.version !== SIM_VERSION || raw.day !== day || !Array.isArray(raw.rows)) return null;
  const rows: WorldRow[] = [];
  for (const candidate of raw.rows) {
    if (rows.length === WORLD_BOARD.keep) break;
    const row = normalizeWorldRow(candidate);
    if (row && !rows.some((other) => other.id === row.id)) rows.push(row);
  }
  return { version: SIM_VERSION, day, rows };
}

/**
 * Where this browser stands on a day's board: the place, from 1, of the best of `rows` that is one
 * of the runs whose logs are `logs` (link texts, this browser's own), or 0 for none. A run is known
 * by its id, which takes no notice of the initials it went under (board-world.js runId). 0 too where
 * the page cannot work a digest out (WebCrypto is only on https and this machine).
 */
export async function placeOf(rows: readonly Pick<WorldRow, 'id'>[], logs: readonly string[]) {
  try {
    const ids = new Set();
    for (const text of logs) {
      const read = decodeLog(text);
      if (read.ok) ids.add(await runId(read.log));
    }
    return rows.findIndex((row: { id: unknown; }) => ids.has(row.id)) + 1;
  } catch {
    return 0;
  }
}

/**
 * What the sheet's world board comes to once the function has answered for taking this browser's
 * run off it: `shown` is the board as the sheet shows it ({ rows, rank }, `rank` the place, from 1,
 * of the run this browser stands by) and `taken` the answer (remove()'s { removed, board }). The
 * function takes off only the run this device's token sent, so where it took nothing yet that run
 * is still on the board, another browser sent it (a copy of this one's challenge link, renamed):
 * it `stays`, at its place now. Otherwise it is `removed`, and this browser stands nowhere.
 * Returns { rows, rank, removed, stays }, `rows` as the function sent them back, if it did.
 */
export function takenOff<Row extends { id: string }>(shown: { rows: Row[]; rank: number }, taken: { removed: number; board?: { rows: Row[] } | null }) {
  const id = shown.rows[shown.rank - 1]?.id;
  const rows = taken.board?.rows ?? (taken.removed ? shown.rows.filter((row) => row.id !== id) : shown.rows);
  const rank = id === undefined ? 0 : rows.findIndex((row) => row.id === id) + 1;
  const stays = !taken.removed && rank > 0;
  return { rows, rank: stays ? rank : 0, removed: !stays, stays };
}

// The page's localStorage, or undefined where reading it throws (site data blocked).
function deviceStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function randomBytes(count: number) {
  const bytes = new Uint8Array(count);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * The world board for this page, at `url` (VITE_BOARD_URL; '' or anything boardUrl refuses leaves it
 * off, and then nothing is ever fetched or stored). `fetch`, `storage`, `random(count)` (bytes) and
 * `wait` (ms) stand in for the page's own in the tests.
 *
 *   on            whether there is a world board to ask
 *   send(log, day)  sends a run's log (its link's text) as this device: the function's word on it,
 *                 { ok, why, rank, board }, `rank` its place from 1 (0 if it did not make the board),
 *                 `why` the reason it was not ranked and `board` the day's board after it, if it came
 *                 back whole (readBoard); or null if the function could not be asked
 *   board(day)    the day's board (readBoard), or null
 *   remove(day)   takes this device's run off the day's board: { ok, removed, board }, or null,
 *                 at once and without asking for a device that has never sent a run
 *   token         this device's token as it stands, or null before it has sent anything
 *
 * The token is made the first time a run is submitted: reading a board never creates one.
 */
export type BoardFetch = (url: string, init: RequestInit) => Promise<{ json(): Promise<unknown> }>;
export interface OnlineBoardOptions {
  url?: unknown; fetch?: BoardFetch;
  storage?: Pick<StoragePort, 'getItem' | 'setItem'> | null;
  random?: (count: number) => Uint8Array; wait?: number;
}
export function createOnlineBoard({
  url = '',
  fetch = (url, init) => globalThis.fetch(url, init),
  storage = deviceStorage(),
  random = randomBytes,
  wait = ONLINE.wait,
}: OnlineBoardOptions = {}) {
  const base = boardUrl(url);
  // The visit's copy: storage can be blocked or refuse a write, and the token still serves the visit.
  let token: string|null = null;
  // Whether this browser has changed the board since it last looked: a day's board may be kept by
  // the browser for half a minute, and must not hide the change this browser has just made.
  let changed = false;

  function deviceToken(make: boolean) {
    if (token) return token;
    let kept = null;
    try {
      kept = storage!.getItem(DEVICE_KEY);
    } catch {
      // Blocked, or no storage at all: the visit makes do with its own.
    }
    if (typeof kept === 'string' && TOKEN.test(kept)) return (token = kept);
    if (!make) return null;
    token = base64url(random(ONLINE.token));
    try {
      storage!.setItem(DEVICE_KEY, token);
    } catch {
      // Kept for the visit only: its runs can be taken off until the page is left.
    }
    return token;
  }

  // One request to the function, given up after `wait`: its JSON body if it sent one, else null.
  async function ask(path: string, init: RequestInit) {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), wait);
    try {
      const response = await fetch(`${base}${path}`, { ...init, signal: stop.signal });
      const body = await response.json();
      return isRecord(body) ? body : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function send(log: unknown, day: unknown) {
    if (!base || typeof log !== 'string' || !log || !isDay(day)) return null;
    // Sent as text, which a browser sends to another origin without first asking whether it may,
    // and kept alive, so a run sent as the page is left still arrives.
    const body = await ask('/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ log, token: deviceToken(true) }),
      keepalive: true,
    });
    if (!body || typeof body.ok !== 'boolean') return null;
    changed = true;
    return {
      ok: body.ok,
      why: typeof body.why === 'string' && WHY.test(body.why) ? body.why : '',
      rank: typeof body.rank === 'number' && Number.isSafeInteger(body.rank) && body.rank > 0 && body.rank <= WORLD_BOARD.keep ? body.rank : 0,
      board: readBoard(body.board, day),
    };
  }

  async function board(day: unknown) {
    if (!base || !isDay(day)) return null;
    const body = await ask(`/board/${day}`, { method: 'GET', cache: changed ? 'reload' : 'default' });
    if (body?.ok !== true) return null;
    changed = false;
    return readBoard(body.board, day);
  }

  async function remove(day: number) {
    const mine = base && isDay(day) ? deviceToken(false) : null;
    if (!mine) return null;
    const body = await ask(`/runs/${day}`, { method: 'DELETE', headers: { Authorization: `Bearer ${mine}` } });
    if (body?.ok !== true) return null;
    changed = true;
    return { ok: true, removed: body.removed === 1 ? 1 : 0, board: readBoard(body.board, day) };
  }

  return {
    get on() {
      return !!base;
    },
    get token() {
      return base ? deviceToken(false) : null;
    },
    send,
    board,
    remove,
  };
}
