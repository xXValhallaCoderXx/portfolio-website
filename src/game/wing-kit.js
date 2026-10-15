// What the visitor flies in, wherever they fly: the wing's livery, the Gjermundbu helmet and the
// chalk on their hands. Good Lift earns them (good-lift-store.js holds the ladder) and writes the
// choice here, under a key of its own, so that the engine can dress the glider as the page opens
// without loading any of the game. It imports nothing, so it can sit in the page's own bundle.
//
// Only the game beyond the arch writes it, and it writes only what has been earned. The page cannot
// tell what was earned without the game, so a choice read back is checked only for being a kit.
// Where storage is missing, blocked or full, the choice lasts in this module for the visit, as the
// game's own store does.

/** The localStorage key the kit is kept under; the page's reset clears it by name. */
export const KIT_KEY = 'good-lift-kit';

// The wings there are, in the order the kit lists them. The standard wing is the one every visitor
// starts with, exactly as it has always been drawn; every other is a livery (livery.js).
export const WINGS = Object.freeze(['standard', 'raven', 'calibrated', 'sheetless', 'flyte', 'hird', 'valkyrie']);

/** The kit a visitor starts with: the standard wing, no helmet and no chalk. */
export const emptyKit = () => ({ wing: 'standard', helmet: false, chalk: false });

/**
 * A valid kit from anything: a wing that is not one of WINGS is the standard wing, and the helmet
 * and the chalk are on only when they are `true`. Never throws, and shares nothing with `raw`.
 */
export function normalizeKit(raw) {
  const kit = emptyKit();
  try {
    if (raw === null || typeof raw !== 'object') return kit;
    if (WINGS.includes(raw.wing)) kit.wing = raw.wing;
    kit.helmet = raw.helmet === true;
    kit.chalk = raw.chalk === true;
  } catch {
    // Only an object built to throw when read gets here; JSON never does.
    return emptyKit();
  }
  return kit;
}

// The kit as this visit last wrote it, and whether that write reached storage.
let memory = null;
let landed = true;

// The page's localStorage, or undefined where there is none: reading the property itself throws
// where the visitor blocks site data.
function deviceStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The kit `storage` holds. Storage that cannot be read, or that refused this visit's last write,
 * gives the visit's own copy; nothing stored gives the empty kit.
 */
export function readKit(storage = deviceStorage()) {
  let text;
  try {
    text = storage.getItem(KIT_KEY);
  } catch {
    return normalizeKit(memory);
  }
  if (!landed) return normalizeKit(memory);
  if (text === null || text === undefined) return emptyKit();
  try {
    return normalizeKit(JSON.parse(text));
  } catch {
    return normalizeKit(memory);
  }
}

/** Writes `kit`, normalised. Returns true when it reached storage, false when it lasts for the visit. */
export function writeKit(kit, storage = deviceStorage()) {
  memory = normalizeKit(kit);
  try {
    storage.setItem(KIT_KEY, JSON.stringify(memory));
    landed = true;
  } catch {
    landed = false;
  }
  return landed;
}

/** Forgets the kit: the stored key and the visit's copy. Reset progress calls it. */
export function clearKit(storage = deviceStorage()) {
  memory = null;
  try {
    storage.removeItem(KIT_KEY);
    landed = true;
  } catch {
    landed = false;
  }
}
