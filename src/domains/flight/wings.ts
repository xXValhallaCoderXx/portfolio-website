import type { Recovery, SideFlow, WingFeel, WingTable } from './flight-physics.ts';
// Wings other than the classic one. A wing is the classic table (PHYSICS) with some of its numbers
// changed: defineWing takes just the changes and makes a whole frozen table, with PHYSICS's own keys
// in PHYSICS's own order and nothing else, so the solver reads every wing the same way. The pilot,
// the lines and the way a pair of hands becomes brake travel are the same under every wing
// (SHARED_KEYS): only the canopy and its air differ. The solver flies a wing by its id
// (registerWing, flight-physics.js); Good Lift's classes are registered by the game, so the page,
// the fjord and Training only ever carry the classic wing.
import { PHYSICS, RECOVERY_KEYS, wingLayout } from './flight-physics.ts';

/** What every wing shares: the pilot, the suspension, the solver and the meaning of the hands. */
export const SHARED_KEYS = Object.freeze(['pilotMass', 'line', 'attachment', 'density', 'gravity', 'substeps', 'quantum',
  'pilotDrag', 'pilotSideDrag', 'pilotNormalDrag', 'suspensionStiffness', 'suspensionDamping', 'brake', 'deepBrake',
  'brakeTake', 'brakeRelease', 'steerTime', 'steerRelease', 'controls', 'coordination', 'acro', 'suspension', 'orbit',
  'telemetry', 'solver'] as const);

type Changes<T> = { [K in keyof T]?: T[K] extends number ? number : Changes<T[K]> };
export type WingChanges = Changes<Omit<WingTable, typeof SHARED_KEYS[number]>>;

function merge(base: Record<string, unknown>, changes: Record<string, unknown>, path: string): Record<string, unknown> {
  for (const key of Object.keys(changes)) if (!(key in base)) throw new Error(`A wing has no ${path}${key} to change`);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(base)) {
    const change = changes[key];
    if (change === undefined) out[key] = value;
    else if (value !== null && typeof value === 'object') {
      if (change === null || typeof change !== 'object') throw new Error(`A wing's ${path}${key} is a table, not a number`);
      out[key] = merge(value as Record<string, unknown>, change as Record<string, unknown>, `${path}${key}.`);
    } else {
      if (typeof change !== 'number' || !Number.isFinite(change)) throw new Error(`A wing's ${path}${key} must be a finite number`);
      out[key] = change;
    }
  }
  return Object.freeze(out);
}

/**
 * The classic table with `changes` made: a whole frozen wing, its tables frozen with it, and, given
 * one, the `feel` the classic wing does not have (flight-physics.js's WingFeel).
 */
export function defineWing(changes: WingChanges, feel?: WingFeel): WingTable {
  for (const key of SHARED_KEYS) if (key in changes) throw new Error(`Every wing shares ${key}; a wing cannot change it`);
  const wing = merge(PHYSICS as unknown as Record<string, unknown>, changes as Record<string, unknown>, '');
  if (feel) {
    const { flow, recovery, ...rest } = feel;
    checkFeel(rest, 'feel');
    if (flow) checkFeel(flow, 'flow');
    if (recovery) checkRecovery(recovery, flow);
    // The damping fades by its turn rate, so a damped wing needs one to fade by.
    if (feel.pitchDamping > 0 && !(feel.turnFade > 0)) throw new Error('A wing\'s pitch damping needs a turnFade above 0');
  }
  // Laid out as every wing is (flight-physics.js wingLayout), so the solver reads them all alike.
  return wingLayout(wing as unknown as typeof PHYSICS, feel);
}

function checkFeel(numbers: object, name: string) {
  for (const value of Object.values(numbers)) if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`A wing's ${name} must be finite and not negative`);
}

// Every one of a Recovery's numbers, each in its range, and every failure it allows with a way out.
function checkRecovery(R: Readonly<Recovery>, flow: Readonly<SideFlow> | null | undefined) {
  const keys = Object.keys(R);
  if (keys.length !== RECOVERY_KEYS.length || !RECOVERY_KEYS.every(key => keys.includes(key))) throw new Error('A wing\'s recovery must give every one of its numbers');
  checkFeel(R, 'recovery');
  // A fold is felt by its own half's flow, which only a wing with SideFlow keeps.
  if (!flow) throw new Error('A wing\'s recovery needs its halves\' flow');
  if (!(R.pumpFull > R.pumpFrom)) throw new Error('A wing\'s pump must count over some travel');
  for (const key of ['foldLift', 'frontalHeld', 'twistLoss', 'tuckMax', 'deep'] as const) if (R[key] > 1) throw new Error(`A wing's recovery ${key} cannot pass 1`);
  if (!(R.refillSpeed > 0) || !(R.frontalTime > 0)) throw new Error('A wing\'s folds must fill again');
  if (R.cravatFold > 0 && !(R.cravatPull > 0 && R.cravatStall > 0 && R.cravatFloor < R.cravatFold)) throw new Error('A cravat must have a way out');
  if (R.deep > 0 && !(R.creep > 0 && R.deepBar > 0)) throw new Error('A deep stall must have a way out');
  if (R.twistInertia > 0 && !(R.twistStiff > 0 && R.twistBind > 0 && R.twistBand > 0)) throw new Error('A line twist must unwind');
}
