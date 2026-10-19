import type { FlightProgress } from './models.ts';
// Flight progress. Kept free of any 3D code so the page can show the belt without loading the game.

export const ACHIEVEMENTS = [
  { id: 'airborne', name: 'Airborne', text: 'Take off.' },
  { id: 'touchdown', name: 'Touchdown', text: 'Land inside a ring.' },
  { id: 'thermal', name: 'Thermal hunter', text: 'Gain 60 m in a single climb.' },
  { id: 'aegir', name: "Ægir's guest", text: 'Land in the fjord.' },
  { id: 'goat', name: 'Mountain goat', text: 'Land on open hillside.' },
  { id: 'runes', name: 'Rune reader', text: 'Fly past every rune stone.' },
  { id: 'valkyrie', name: 'Valkyrie', text: 'Climb above 330 m.' },
  { id: 'tour', name: 'Grand tour', text: 'Land at all four places.' },
  { id: 'reserve', name: 'Reserve ride', text: 'Throw your reserve when a page goes missing.' },
  { id: 'bullseye', name: 'Bullseye', text: 'Land manually within 1 m of the centre.' },
  { id: 'four-for-four', name: 'Four for four', text: 'Land a manual bullseye at all four places.' },
  { id: 'cloudbase-500', name: 'Above the mist', text: 'Reach 500 m in Good Lift.' },
  { id: 'cloudbase-1000', name: 'Cloud climber', text: 'Reach 1,000 m in Good Lift.' },
  { id: 'cloudbase-1500', name: 'Skyward', text: 'Reach 1,500 m in Good Lift.' },
];

// One belt per achievement earned, topping out at black. Swap in your own art's grading order.
export const BELTS = ['white', 'yellow', 'orange', 'green', 'blue', 'purple', 'brown', 'brown · 1st kyu', 'black · 1st dan'];

export const beltFor = (progress: Pick<FlightProgress, 'unlocked'>) => BELTS[Math.min(progress.unlocked.length, BELTS.length - 1)];

export const FLIGHT_STORE = 'fjord-glider-v1';
// Good Lift keeps its own store under this key (good-lift-store.js): its best, tonnage, feats, daily
// streak and board. It never moves the belt, and it stays out of the fjord's progress, which would
// drop a block it does not know; resetting progress clears both.
export { GAME_STORE } from './good-lift-key.ts';
const PLACE_IDS = ['about', 'experience', 'projects', 'contact'];
const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map(({ id }) => id));


export function emptyProgress(): FlightProgress {
  return { unlocked: [], visited: [], stones: [], landingBests: {}, cloudbase: { discovered: false, bestAltitude: 0 } };
}

export function normalizeProgress(saved: unknown): FlightProgress {
  const progress = emptyProgress();
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return progress;
  const value = saved as { unlocked?: unknown; visited?: unknown; stones?: unknown; landingBests?: Record<string, unknown>; cloudbase?: {discovered?:unknown;bestAltitude?:unknown} };
  const unique = <T>(value: unknown, accepts: (item: unknown) => item is T): T[] => (Array.isArray(value) ? [...new Set(value.filter(accepts))] : []);
  const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  progress.unlocked = unique(value.unlocked, (id): id is string => typeof id === 'string' && ACHIEVEMENT_IDS.has(id));
  progress.visited = unique(value.visited, (id): id is string => typeof id === 'string' && PLACE_IDS.includes(id));
  progress.stones = unique(value.stones, (id): id is number => typeof id === 'number' && Number.isInteger(id) && id >= 0);
  for (const id of PLACE_IDS) {
    if (nonnegative(value.landingBests?.[id])) progress.landingBests[id] = value.landingBests![id] as number;
  }
  progress.cloudbase.discovered = value.cloudbase?.discovered === true;
  if (nonnegative(value.cloudbase?.bestAltitude)) progress.cloudbase.bestAltitude = value.cloudbase.bestAltitude;
  return progress;
}

