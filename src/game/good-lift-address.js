// Good Lift's addresses, read without loading any of the game: the page's router asks this whether
// an address is the game's and what it asks for. It imports nothing, so it can sit in the page's
// own bundle.
//
//   /good-lift/daily      today's Daily Sky, the same for everyone; R flies it again
//   /good-lift            practice: a sky of its own every run
//   …?sky=<hex>           that one sky, again and again (a practice run's share link)
//   …#vs=<log>            a challenge: a run to beat, whose sky comes from its log
//
// Any other address under /good-lift/ is not the game's, and the page shows it as missing.

export const GAME_PATH = '/good-lift';
export const DAILY_PATH = `${GAME_PATH}/daily`;
// One UTC day, in milliseconds. A day's sky changes at midnight UTC and nowhere else.
export const DAY_MS = 86_400_000;
// The UTC day of Daily #1: 15 October 2026, the day Good Lift shipped.
export const DAILY_EPOCH = 20_741;

/** The UTC day number of `now` (milliseconds since 1970). */
export const dayOf = (now = Date.now()) => Math.floor(now / DAY_MS);

/** The Daily Sky's number for a UTC day: 1 on DAILY_EPOCH. */
export const dailyNumber = (day) => day - DAILY_EPOCH + 1;

/**
 * Reads `place` ({ pathname, search, hash }: `location` will do) as one of Good Lift's addresses,
 * or null when it is not one. What comes back:
 *
 *   kind   'daily', 'practice', 'sky' or 'vs'
 *   sky    the seed `?sky=` names (a 32-bit number), or null
 *   vs     the challenge's log as the link carries it, or null; the game decodes it
 *   bad    'sky' when a sky was named that cannot be read: the day's sky is flown instead
 */
export function readGameAddress({ pathname = '', search = '', hash = '' } = {}) {
  const path = pathname.replace(/\/+$/, '');
  if (path !== GAME_PATH && path !== DAILY_PATH) return null;
  const named = new URLSearchParams(search).get('sky');
  // A log is base64url, which a query string reads as it is: no '+', '/' or '='.
  const vs = new URLSearchParams(hash.replace(/^#/, '')).get('vs') || null;
  const sky = named !== null && /^[0-9a-f]{1,8}$/i.test(named) ? parseInt(named, 16) >>> 0 : null;
  const bad = named !== null && sky === null ? 'sky' : null;
  const kind = vs ? 'vs' : sky !== null ? 'sky' : bad || path === DAILY_PATH ? 'daily' : 'practice';
  return { kind, sky, vs, bad };
}

/** The address of a Good Lift sky: `kind` as readGameAddress reads it, with its `sky` or `vs`. */
export function gameHref({ kind = 'daily', sky = null, vs = null } = {}) {
  if (kind === 'vs' && vs) return `${DAILY_PATH}#vs=${vs}`;
  if (kind === 'sky' && sky !== null) return `${GAME_PATH}?sky=${(sky >>> 0).toString(16).padStart(8, '0')}`;
  return kind === 'practice' ? GAME_PATH : DAILY_PATH;
}

/** Whether two addresses ask for the same sky the same way. */
export const sameGame = (a, b) => !!a && !!b && a.kind === b.kind && a.sky === b.sky && a.vs === b.vs;
