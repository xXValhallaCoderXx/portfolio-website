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

export const beltFor = (progress) => BELTS[Math.min(progress.unlocked.length, BELTS.length - 1)];

const STORE = 'fjord-glider-v1';
// Good Lift keeps its own store under this key (good-lift-store.js): its best, tonnage, feats, daily
// streak and board. It never moves the belt, and it stays out of the fjord's progress, which would
// drop a block it does not know; resetting progress clears both.
export const GAME_STORE = 'good-lift-v1';
const PLACE_IDS = ['about', 'experience', 'projects', 'contact'];
const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map(({ id }) => id));
let sessionProgress;

export function emptyProgress() {
  return { unlocked: [], visited: [], stones: [], landingBests: {}, cloudbase: { discovered: false, bestAltitude: 0 } };
}

export function normalizeProgress(saved) {
  const progress = emptyProgress();
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return progress;
  const unique = (value, accepts) => (Array.isArray(value) ? [...new Set(value.filter(accepts))] : []);
  const nonnegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  progress.unlocked = unique(saved.unlocked, (id) => ACHIEVEMENT_IDS.has(id));
  progress.visited = unique(saved.visited, (id) => PLACE_IDS.includes(id));
  progress.stones = unique(saved.stones, (id) => Number.isInteger(id) && id >= 0);
  for (const id of PLACE_IDS) {
    if (nonnegative(saved.landingBests?.[id])) progress.landingBests[id] = saved.landingBests[id];
  }
  progress.cloudbase.discovered = saved.cloudbase?.discovered === true;
  if (nonnegative(saved.cloudbase?.bestAltitude)) progress.cloudbase.bestAltitude = saved.cloudbase.bestAltitude;
  return progress;
}

export function readProgress() {
  let saved;
  try {
    saved = localStorage.getItem(STORE);
  } catch {
    // Storage can be blocked; progress then lasts for the session only.
    return normalizeProgress(sessionProgress);
  }
  try {
    return normalizeProgress(JSON.parse(saved ?? '{}'));
  } catch {
    return emptyProgress();
  }
}

export function writeProgress(progress) {
  sessionProgress = normalizeProgress(progress);
  try {
    localStorage.setItem(STORE, JSON.stringify(sessionProgress));
  } catch {
    // See above.
  }
}
