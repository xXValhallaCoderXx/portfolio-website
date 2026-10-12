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
];

// One belt per achievement earned, topping out at black. Swap in your own art's grading order.
export const BELTS = ['white', 'yellow', 'orange', 'green', 'blue', 'purple', 'brown', 'brown · 1st kyu', 'black · 1st dan'];

export const beltFor = (progress) => BELTS[Math.min(progress.unlocked.length, BELTS.length - 1)];

const STORE = 'fjord-glider-v1';

export function readProgress() {
  const progress = { unlocked: [], visited: [], stones: [] };
  try {
    Object.assign(progress, JSON.parse(localStorage.getItem(STORE) ?? '{}'));
  } catch {
    // Storage can be blocked; progress then lasts for the session only.
  }
  return progress;
}

export function writeProgress(progress) {
  try {
    localStorage.setItem(STORE, JSON.stringify(progress));
  } catch {
    // See above.
  }
}
