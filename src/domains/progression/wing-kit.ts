import type { WornKit } from './models.ts';
// What the visitor flies in, wherever they fly: the wing and harness colours, the Gjermundbu helmet and the
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

// The themes available independently for the wing and cocoon harness, in kit order.
export const KIT_THEMES = Object.freeze(['standard', 'raven', 'calibrated', 'sheetless', 'flyte', 'hird', 'valkyrie']);

/** The kit a visitor starts with: standard colours, no helmet and no chalk. */
export const emptyKit = (): WornKit => ({ wing: 'standard', harness: 'standard', helmet: false, chalk: false });

/**
 * A valid kit from anything: unknown wing or harness themes become standard independently; helmet
 * and chalk are on only when they are `true`. Never throws, and shares nothing with `raw`.
 */
export function normalizeKit(raw: unknown): WornKit {
  const kit = emptyKit();
  try {
    if (raw === null || typeof raw !== 'object') return kit;
    const value = raw as Record<string, unknown>;
    if (typeof value.wing === 'string' && KIT_THEMES.includes(value.wing)) kit.wing = value.wing;
    if (typeof value.harness === 'string' && KIT_THEMES.includes(value.harness)) kit.harness = value.harness;
    kit.helmet = value.helmet === true;
    kit.chalk = value.chalk === true;
  } catch {
    // Only an object built to throw when read gets here; JSON never does.
    return emptyKit();
  }
  return kit;
}

