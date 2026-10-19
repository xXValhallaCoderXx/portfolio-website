import type { ApiBody, ApiReply, BoardChange, BoardDocument, BoardOptions, BoardRequest, DayBoard, JudgmentOptions, PublicBoard, ServerRow } from './board.types.ts';
import type { WorldRow } from '../../src/domains/good-lift/board.types.ts';
// Good Lift's world board: everything its one Firebase function does but the wiring (index.js). A
// run sent to it, a day's board asked for and a device taking its run off are each answered here,
// against a store of documents handed in, so the tests run all of it with a store of their own and
// no Firebase at all. tools/build-functions.mjs bundles this with the game's own pure modules
// (src/game), which it imports by path, into the one file the function deploys.
//
// A run is never taken at its word. Its log (recorder.js) is flown again here, through the very
// step the game flies (replay.js), and only what that replay comes to is ranked. A run is turned
// away unless it was flown under these rules (SIM_VERSION), on the Daily Sky of today or yesterday
// (UTC), under initials the board will show, and ended by the fog or a touchdown; and unless the
// total and peak its log claims are what its replay comes to, which they always are for a run the
// game itself flew and checked (good-lift.js replays every run as it ends).
//
// A Daily Sky's board is one document for each version of the rules and UTC day: its best
// WORLD_BOARD.keep rows, best first and at most one from each device (that device's best), and how
// many runs each device has sent that day. It is changed only in a transaction, by a change that
// reads the document and hands back the next one, never touching the one it was given, so a
// transaction tried again comes to the same. A row (board-world.js) keeps the pilot's initials and
// byname, what the run banked and its lights, when it came, its run's id and the device it came
// from, as a digest of the device's token with the day's key, so nothing stored ties a device's days
// together. Never the token, never the log, and never the address a request came from, which is
// counted in this instance's memory for the clock minute it asks in, to limit how often it may ask,
// and forgotten with the first request of a later minute (createLimiter), and kept nowhere else.
//
// Tokens are the client's to make, so nothing here trusts one to stand for a person: a device's count
// limits only what one token can send, and nothing a stranger sends under token after token may
// shut anyone else out (judge).
import { MAX_LINK, decodeLog } from '../../src/domains/good-lift/recorder.ts';
import { replayLog } from '../../src/domains/good-lift/replay.ts';
import { seedFor } from '../../src/domains/good-lift/daily.ts';
import { SIM_VERSION } from '../../src/domains/good-lift/sim-version.ts';
import { DAILY_EPOCH, DAY_MS, dayOf } from '../../src/domains/good-lift/good-lift-address.ts';
import { isBlocked } from '../../src/domains/good-lift/meet-initials.ts';
import { bynameFor } from '../../src/domains/good-lift/meet-bynames.ts';
import { BOARD, boardKey, outranks } from '../../src/domains/good-lift/board.ts';
import { byRank } from '../../src/domains/good-lift/score.ts';
import { WORLD_BOARD, normalizeWorldRow } from '../../src/domains/good-lift/board-world.ts';
import { digest, runId } from '../../src/adapters/crypto/run-identity.service.ts';
import { isJudgedEnding } from '../../src/domains/good-lift/run-rules.ts';

export const LIMITS = Object.freeze({
  // Requests from one client in a minute, by route: an IPv4 address, or an IPv6 address's /64
  // (clientKey). A run takes minutes to fly and the page sends only a day's new best, so `runs` is
  // never met by a pilot, nor by a dozen on one network.
  minute: Object.freeze({ runs: 10, board: 30, remove: 6 }),
  runs: 50, // runs one device may send a day, counted in the day's document
  devices: 2000, // devices a day's document counts runs from: a new one past that takes the count of one with no run on the board
  body: MAX_LINK + 256, // bytes of a request's body: the longest log a link can hold, and the JSON round it
  token: Object.freeze([22, 128]), // characters of base64url in a device token: 128 bits or more
  cache: 30, // s a day's board is served from an instance's memory, and kept by browsers
});

// Where the page is served from, the only origins whose pages may read what the function says
// (index.js hands these to the function's CORS): the site at its own domain and at Firebase's
// addresses, its Firebase preview channels, and a development server on this machine. Anyone may still ask it without a browser; nothing here is
// secret, and a run is judged the same whoever sends it.
export const ORIGINS = Object.freeze([
  'https://renate-gouveia.dev',
  'https://renate-gouveia-portfolio.web.app',
  'https://renate-gouveia-portfolio.firebaseapp.com',
  /^https:\/\/renate-gouveia-portfolio--[a-z0-9-]+\.web\.app$/,
  /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/,
]);

// The routes, with or without the function's own name in front of the path: a function deployed as
// `board` serves POST …/board/runs, GET …/board/board/<day> and DELETE …/board/runs/<day>, and
// whether the front end hands the function the path with that name or without it, the route reads
// the same. A day is a UTC day number (good-lift-address.js dayOf).
const ROUTES = Object.freeze([
  Object.freeze({ name: 'runs', method: 'POST', path: /^(?:\/board)?\/runs\/?$/ }),
  Object.freeze({ name: 'board', method: 'GET', path: /^(?:\/board)?\/board\/(\d{1,9})\/?$/ }),
  Object.freeze({ name: 'remove', method: 'DELETE', path: /^(?:\/board)?\/runs\/(\d{1,9})\/?$/ }),
]);

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const TOKEN = new RegExp(`^[A-Za-z0-9_-]{${LIMITS.token[0]},${LIMITS.token[1]}}$`);
const DEVICE = /^[0-9a-f]{32}$/;
const FLIGHT = new RegExp(`^[0-9a-f]{${WORLD_BOARD.id}}$`);
const judged = isJudgedEnding;

// What a run flew, as its replay came to it: where it went (its height each second), how it ended
// and what it lifted. Two logs whose keys differ only where the step cannot feel them (while the
// wing is folded the hands are off it) fly one flight, and come to one of these, which runId, read
// from the keys alone, cannot see through. Kept beside the device, never shown.
const flightOf = (sheet: Exclude<ReturnType<typeof replayLog>, {error: string}>) => digest(JSON.stringify([sheet.seed, sheet.reason, sheet.steps, sheet.total, sheet.peak, sheet.lifts, sheet.trace.alt]), WORLD_BOARD.id);

const reply = (status: number, body: ApiBody, cache = 'no-store'): ApiReply => ({ status, body, cache });
const refuse = (status: number, why: string, more = {}) => reply(status, { ok: false, why, ...more });

/**
 * Where a request came from, for the minute's limits and nothing else: the last address of its
 * X-Forwarded-For, which is the one Google's front end saw and added (any before it are whatever the
 * client chose to say), or else the connection's own (`fallback`).
 */
export function clientAddress(forwarded: string|undefined, fallback = '') {
  const hops = typeof forwarded === 'string' ? forwarded.split(',').map((hop) => hop.trim()).filter(Boolean) : [];
  return hops.length ? hops[hops.length - 1] : String(fallback ?? '');
}

// The eight 16-bit groups of an IPv6 address written out as text ('2001:db8::7', a last 32 bits
// written as IPv4 among them), or null for anything else.
function groupsOf(text: string) {
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const pieces = halves.map((half: string) => (half ? half.split(':') : []));
  const tail = pieces[pieces.length - 1];
  const dotted = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(tail[tail.length - 1] ?? '');
  if (dotted) {
    const bytes = dotted.slice(1).map(Number);
    if (bytes.some((byte) => byte > 255)) return null;
    tail.splice(-1, 1, ((bytes[0] << 8) | bytes[1]).toString(16), ((bytes[2] << 8) | bytes[3]).toString(16));
  }
  const written = pieces.reduce((sum, piece) => sum + piece.length, 0);
  if (pieces.length === 2 ? written > 7 : written !== 8) return null;
  const groups = pieces.length === 2 ? [...pieces[0], ...Array(8 - written).fill('0'), ...pieces[1]] : pieces[0];
  return groups.every((group: string) => /^[0-9a-f]{1,4}$/.test(group)) ? groups.map((group: string) => parseInt(group, 16)) : null;
}

/**
 * The client an address is counted as by the minute's limits: an IPv4 address whole, and an IPv6
 * address by its first 64 bits, written '2001:db8:0:7::/64', since a home or a phone is handed a whole
 * /64 and may ask from any address in it. An IPv4 address written as IPv6 (::ffff:203.0.113.7) is
 * IPv4; a port or a zone is no part of an address; and anything else is counted as it came.
 */
export function clientKey(address: string) {
  const text = String(address ?? '').trim().toLowerCase().replace(/^\[([^\]]*)\](?::\d+)?$/, '$1').replace(/%.*$/, '');
  const v4 = /^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/.exec(text);
  if (v4) return v4[1];
  const groups = text.includes(':') ? groupsOf(text) : null;
  if (!groups) return text;
  if (groups.slice(0, 5).every((group: number) => group === 0) && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join('.');
  }
  return `${groups.slice(0, 4).map((group) => group.toString(16)).join(':')}::/64`;
}

/**
 * How often each client may ask, in windows of a clock minute, by route: `allow(route, address,
 * now)` counts one more request from `address` (as clientKey counts it) and says whether it is
 * within `perMinute[route]`. Held in this instance's memory only, and only for the minute: the
 * first request of a later minute forgets every count, so an address outlasts its minute only in
 * an instance that has had no request since, until Cloud Run lets that idle instance go. `held` is
 * how many counts it holds.
 */
export function createLimiter(perMinute: Record<string, number> = LIMITS.minute) {
  const counts = new Map<string, number>();
  let minute = NaN;
  return {
    allow(route: string, address: string, now: number) {
      const at = Math.floor(now / 60_000);
      if (at !== minute) {
        counts.clear();
        minute = at;
      }
      const key = `${route} ${clientKey(address)}`;
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n <= perMinute[route];
    },
    get held() {
      return counts.size;
    },
  };
}

// A device's name on one day's board: a digest of its token with the board's key, so one device is
// a different name on every day's board, and the token is never stored.
const deviceOn = (key: string, token: string) => digest(`${key} ${token}`, 32);


/**
 * A day's board as the function keeps it, cleanly read from the document the store holds (`doc`,
 * null for a day with no board yet): `rows`, best first, each with the `device` it came from, each
 * run once, each device once and no more than WORLD_BOARD.keep of them; and `devices`, how many runs
 * each device has sent that day. Damaged parts are dropped. Shares nothing with `doc`.
 */
export function readDay(doc: unknown): DayBoard {
  const rows: ServerRow[] = [];
  const devices: Record<string, number> = {};
  if (!isRecord(doc)) return { rows, devices };
  if (Array.isArray(doc.rows)) {
    const clean = [];
    for (const raw of doc.rows as Array<WorldRow & {device: string;flight: string}>) {
      const row = normalizeWorldRow(raw);
      if (row && DEVICE.test(raw.device)) clean.push({ ...row, device: raw.device, ...(FLIGHT.test(raw.flight) ? { flight: raw.flight } : {}) });
    }
    for (const row of clean.sort(byRank)) {
      if (rows.length === WORLD_BOARD.keep) break;
      if (!rows.some((other) => other.id === row.id || other.device === row.device || (row.flight && other.flight === row.flight))) rows.push(row);
    }
  }
  if (isRecord(doc.devices)) {
    for (const device of Object.keys(doc.devices)) {
      const sent = doc.devices[device];
      if (DEVICE.test(device) && typeof sent === 'number' && Number.isSafeInteger(sent) && sent > 0) devices[device] = sent;
    }
  }
  return { rows, devices };
}

/** What anyone may see of a day's board: its rows without the devices they came from or their flights. */
export function publicBoard({ rows }: Pick<DayBoard, 'rows'>, version: number, day: number): PublicBoard {
  return { version, day, rows: rows.map(({ device, flight, ...row }) => ({ ...row, red: [...row.red] })) };
}

// The document a day's board is written as. `expires` is when the day leaves the fortnight the board
// is served for (as the local board's, board.js BOARD.days), for a TTL policy to delete it by.
function documentOf({ rows, devices }: DayBoard, version: number, day: number, at: number): BoardDocument {
  return { version, day, rows, devices, updated: at, expires: new Date((day + BOARD.days) * DAY_MS) };
}

// Makes room in a day's count of devices for one more, where it already counts `most`: the counts
// of devices with no run on the board go, those that have sent the fewest first (of two alike, the
// first by name, so a transaction tried again lets the same ones go). Such a device could then send
// its fifty again, which is all a count was keeping from it. Whether there is room: there is none
// only if every device counted has a run on the board, which LIMITS.devices, far above
// WORLD_BOARD.keep, never allows.
function makeRoom({ rows, devices }: DayBoard, most: number) {
  const counted = Object.keys(devices);
  const over = counted.length - most + 1;
  if (over <= 0) return true;
  const ranked = new Set(rows.map((row) => row.device));
  const spare = counted.filter((device) => !ranked.has(device)).sort((a, b) => devices[a] - devices[b] || (a < b ? -1 : 1));
  if (spare.length < over) return false;
  for (const device of spare.slice(0, over)) delete devices[device];
  return true;
}

/**
 * A run come to a day's board: `entry` is { row, device }, the row as the replay made it
 * (board-world.js, the time it came as its `at`) and the device's name for the day. Returns
 * { doc, result }: the document to write, or null to leave it as it is, and the reply.
 *
 *   - a run already on the board changes nothing, so it is neither counted nor written: from its
 *     own device the reply is its place, as if it had come again; from any other it is a duplicate,
 *     a challenge link renamed, or one log sent under token after token, none of which takes a
 *     place in the day's count of devices
 *   - any other run counts against its device's runs for the day, whatever becomes of it, and past
 *     `limits.runs` of them it is turned away ('quota'). A device new to a day whose count is full
 *     takes the place of one with no run on the board (makeRoom), since a full count must never
 *     shut a pilot out; only where there is none to take is it turned away ('full')
 *   - a device's run that does not outrank the run of that device's already on the board is turned
 *     away ('not-best'): the board keeps each device's best
 *   - otherwise it takes that run's place, if there is one, and goes under every row that outranks
 *     or ties it (of two that tie, the earlier came first), and the board keeps its best
 *     WORLD_BOARD.keep; its rank is its place from 1, or 0 if it did not make them
 *
 * Never changes `doc` or `entry`: a transaction may call it again on the same document.
 */
export function judge(doc: unknown, { row, device }: {row: WorldRow & {flight?:string};device:string}, { version, day, at, limits = LIMITS }: JudgmentOptions): BoardChange {
  const board = readDay(doc);
  const { rows, devices } = board;
  const answer = (status: number, body: { ok: boolean; rank?: number; why?: string; }) => reply(status, { ...body, board: publicBoard(board, version, day) });

  const known = rows.findIndex((other) => other.id === row.id || (row.flight && other.flight === row.flight));
  if (known >= 0) return { doc: null, result: rows[known].device === device ? answer(200, { ok: true, rank: known + 1 }) : answer(409, { ok: false, why: 'duplicate' }) };
  const sent = devices[device] ?? 0;
  if (sent >= limits.runs) return { doc: null, result: refuse(429, 'quota') };
  if (sent === 0 && !makeRoom(board, limits.devices)) return { doc: null, result: refuse(429, 'full') };
  devices[device] = sent + 1;
  const written = (status: number, body: { ok: boolean; why?: string; rank: number; }) => ({ doc: documentOf(board, version, day, at), result: answer(status, body) });

  const own = rows.findIndex((other) => other.device === device);
  if (own >= 0 && !outranks(row, rows[own])) return written(409, { ok: false, why: 'not-best', rank: own + 1 });
  if (own >= 0) rows.splice(own, 1);
  let place = rows.findIndex((other) => outranks(row, other));
  if (place < 0) place = rows.length;
  rows.splice(place, 0, { ...row, red: [...row.red], device });
  if (rows.length > WORLD_BOARD.keep) rows.length = WORLD_BOARD.keep;
  return written(200, { ok: true, rank: place < WORLD_BOARD.keep ? place + 1 : 0 });
}

/**
 * A device takes its run off a day's board: { doc, result } as judge's, the document written only if
 * a row went. Its count of runs sent that day stays, so taking a run off never buys more.
 */
export function withdraw(doc: unknown, device: string, { version, day, at }: JudgmentOptions): BoardChange {
  const board = readDay(doc);
  const before = board.rows.length;
  board.rows = board.rows.filter((row) => row.device !== device);
  const removed = before - board.rows.length;
  return {
    doc: removed ? documentOf(board, version, day, at) : null,
    result: reply(200, { ok: true, removed, board: publicBoard(board, version, day) }),
  };
}

// A request's body as text, or null when it is longer than any run's: a string as it came, the bytes
// the functions framework keeps (rawBody), or an object a parser already read.
function bodyText(body: unknown, most: number): string | null {
  if (typeof body === 'string') return body.length <= most ? body : null;
  if (body instanceof Uint8Array) return body.length <= most ? new TextDecoder().decode(body) : null;
  if (isRecord(body)) return bodyText(JSON.stringify(body), most);
  return '';
}

/**
 * The world board's function, all but the wiring: `handle(request)` answers one request,
 * { method, path, body, ip, authorization }, with { status, body, cache }: the HTTP status, the JSON
 * to send and its Cache-Control. Every body has `ok`; a refusal says `why`.
 *
 *   POST /runs           { log, token }, sent as text: the run judged ('rank' its place from 1, or 0
 *                        if it did not make the board) and the day's `board`, or why it was refused
 *   GET /board/<day>     the day's `board`, { version, day, rows }: any day of the last fortnight
 *   DELETE /runs/<day>   with `Authorization: Bearer <token>`: the device's run taken off the day's
 *                        board (`removed`, 0 or 1) and the `board` without it
 *
 * `store` is { read(key), update(key, change) }: read hands back the document under a board key
 * (board.js boardKey) or null, and update runs `change(doc)` in a transaction, writes the `doc` it
 * returns unless that is null, and hands back its `result`. `now` is the clock (ms), `log(message,
 * detail)` where the function notes what its owner should know, and `limits` stands in for LIMITS.
 */
export function createBoard({ store, now = Date.now, log = () => {}, limits = LIMITS }: BoardOptions) {
  const limiter = createLimiter(limits.minute);
  // Each day's board as last read or written here, until it is LIMITS.cache seconds old.
  const cache = new Map<string, {until:number;board:PublicBoard}>();
  const fresh = (status: number, body: ApiBody) => reply(status, body, `public, max-age=${limits.cache}`);

  function remember(key: string, board: PublicBoard, at: number) {
    cache.set(key, { until: at + limits.cache * 1000, board });
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
  }

  // The days a board is served and taken from: the last fortnight's, none before Daily #1.
  const served = (day: number, at: number) => day >= Math.max(DAILY_EPOCH, dayOf(at) - BOARD.days + 1) && day <= dayOf(at);

  async function change(key: string, update: (doc:unknown) => BoardChange, at: number): Promise<ApiReply> {
    try {
      const result = await store.update(key, update);
      if (result.body.board) remember(key, result.body.board, at);
      return result;
    } catch (error) {
      log('Good Lift world board: the store could not be changed', error);
      return refuse(503, 'store');
    }
  }

  async function submit(body: unknown, at: number): Promise<ApiReply> {
    const text = bodyText(body, limits.body);
    if (text === null) return refuse(413, 'long');
    let sent: unknown = null;
    try {
      sent = JSON.parse(text);
    } catch {
      return refuse(400, 'body');
    }
    if (!isRecord(sent) || typeof sent.log !== 'string' || typeof sent.token !== 'string') return refuse(400, 'body');
    if (!TOKEN.test(sent.token)) return refuse(400, 'token');
    const read = decodeLog(sent.log);
    if (!read.ok) return refuse(read.why === 'long' ? 413 : 400, read.why);
    const { log: run } = read;
    if (run.simVersion !== SIM_VERSION) return refuse(422, 'version');
    // Today's sky, or yesterday's for a run begun before midnight: no other day's is a race still on.
    const today = dayOf(at);
    if (run.day !== today && run.day !== today - 1) return refuse(422, 'day');
    if (run.seed !== seedFor(run.day, run.simVersion)) return refuse(422, 'seed');
    if (!run.initials || isBlocked(run.initials)) return refuse(400, 'initials');
    const sheet = replayLog(run);
    if (sheet.error) return refuse(422, sheet.error);
    if (!judged(sheet.reason)) return refuse(422, 'ending');
    const id = await runId(run);
    if (sheet.total !== run.total || sheet.peak !== run.peak) {
      // The browser that flew it came to another sheet than this replay: two engines parting ways
      // (or a log someone wrote), which is worth knowing about.
      log('Good Lift world board: a run replayed to another sheet here', { id, day: run.day, steps: run.steps, claimed: { total: run.total, peak: run.peak }, replayed: { total: sheet.total, peak: sheet.peak } });
      return refuse(422, 'mismatch');
    }
    const key = boardKey(SIM_VERSION, run.day);
    // The style is the replay's own: a log claims none, and the score the board ranks by is the total
    // lifted by it (score.js), so the board's order is this replay's, never a browser's say-so.
    const row = { who: run.initials, byname: bynameFor(sheet), total: sheet.total, style: sheet.stats.style, peak: sheet.peak, red: sheet.lifts.map((lift: {red:number}) => lift.red), at, id, flight: await flightOf(sheet) };
    const entry = { row, device: await deviceOn(key, sent.token) };
    return change(key, (doc) => judge(doc, entry, { version: SIM_VERSION, day: run.day, at, limits }), at);
  }

  async function serve(day: number, at: number) {
    if (!served(day, at)) return refuse(422, 'day');
    const key = boardKey(SIM_VERSION, day);
    const kept = cache.get(key);
    if (kept && kept.until > at) return fresh(200, { ok: true, board: kept.board });
    let doc;
    try {
      doc = await store.read(key);
    } catch (error) {
      log('Good Lift world board: the store could not be read', error);
      return refuse(503, 'store');
    }
    const board = publicBoard(readDay(doc), SIM_VERSION, day);
    remember(key, board, at);
    return fresh(200, { ok: true, board });
  }

  async function remove(day: number, authorization: string, at: number) {
    const token = /^Bearer (\S+)$/.exec(typeof authorization === 'string' ? authorization.trim() : '')?.[1] ?? '';
    if (!TOKEN.test(token)) return refuse(400, 'token');
    if (!served(day, at)) return refuse(422, 'day');
    const key = boardKey(SIM_VERSION, day);
    const device = await deviceOn(key, token);
    return change(key, (doc) => withdraw(doc, device, { version: SIM_VERSION, day, at }), at);
  }

  async function handle({ method = '', path = '', body = null, ip = '', authorization = '' }: BoardRequest = {}): Promise<ApiReply> {
    const at = now();
    const route = ROUTES.find((each) => each.path.test(path));
    if (!route) return refuse(404, 'route');
    if (route.method !== method) return refuse(405, 'method');
    if (!limiter.allow(route.name, ip, at)) return refuse(429, 'rate');
    if (route.name === 'runs') return submit(body, at);
    const day = Number(route.path.exec(path)![1]);
    return route.name === 'board' ? serve(day, at) : remove(day, authorization, at);
  }

  return { handle };
}
