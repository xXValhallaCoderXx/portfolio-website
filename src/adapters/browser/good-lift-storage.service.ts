import { GAME_STORE } from '../../domains/progression/good-lift-key.ts';
import { emptyStore, normalizeStore, recordRun as recordDomainRun, type GoodLiftStore, type RecordedRun, type RecordOptions } from '../../domains/progression/good-lift-store.ts';
import { normalizeLearnedLessons } from '../../domains/progression/trick-learning.ts';
import { deviceStorage, type StoragePort } from './storage.port.ts';
// The store as this visit last wrote it, and whether that write reached storage. While storage is
// missing, blocked or refusing writes (full, or a private window with no room), the visit carries
// on from `memory`. The next write that lands gives storage the last word again.
let memory: GoodLiftStore | null = null;
let landed = true;

/**
 * The store `storage` holds, normalised. What comes back:
 * - storage that is missing, blocked or failing to read, or that refused this visit's last write:
 *   the visit's own copy (empty if nothing was written);
 * - nothing stored: an empty store;
 * - stored text that cannot be parsed: the visit's copy, or an empty store.
 */
export function readStore(storage: StoragePort | null | undefined = deviceStorage()) {
  let text;
  try {
    text = storage!.getItem(GAME_STORE);
  } catch {
    return normalizeStore(memory);
  }
  if (!landed) return normalizeStore(memory);
  if (text === null || text === undefined) return emptyStore();
  try {
    return normalizeStore(JSON.parse(text));
  } catch {
    return normalizeStore(memory);
  }
}

/**
 * Writes `store`, normalised, under GAME_STORE, keeping a copy for the visit in case storage cannot
 * hold it. Returns true when it reached storage, false when it lasts only for this visit.
 */
export function writeStore(store: unknown, storage: StoragePort | null | undefined = deviceStorage()) {
  memory = normalizeStore(store);
  try {
    storage!.setItem(GAME_STORE, JSON.stringify(memory));
    landed = true;
  } catch {
    landed = false;
  }
  return landed;
}

/**
 * Forgets Good Lift's progress on this device: the stored key and the visit's copy. Reset progress
 * calls this, and clears the fjord's own key itself; this module never touches that key.
 */
export function clearStore(storage: StoragePort | null | undefined = deviceStorage()) {
  memory = null;
  try {
    storage!.removeItem(GAME_STORE);
    landed = true;
  } catch {
    // Storage that cannot be reached cannot be cleared. Whatever it still holds is no longer this
    // visit's, so reads get the empty copy until a write lands.
    landed = false;
  }
}

/**
 * Reads the store afresh, lets `change(store)` change it, writes it back, and returns what `change`
 * returned. This is the safe way to change the store: one read long before would write over
 * whatever another tab has recorded since.
 *
 *   const { feats, rank, best } = updateStore((store) => recordRun(store, run, { version, now }));
 */
export function updateStore<T>(change: (store: GoodLiftStore) => T, storage: StoragePort | null | undefined = deviceStorage()) {
  const store = readStore(storage);
  const result = change(store);
  writeStore(store, storage);
  return result;
}

/** Save learning as soon as style banks, even if this visit cannot write device storage. */
export function learnTrickLesson(id: string, storage: StoragePort | null | undefined = deviceStorage()) {
  return updateStore(store => {
    const before = store.learnedLessons.length;
    store.learnedLessons = normalizeLearnedLessons([...store.learnedLessons, id]);
    return store.learnedLessons.length > before;
  }, storage);
}

export function repeatTrickLessons(storage: StoragePort | null | undefined = deviceStorage()) {
  updateStore(store => { store.learnedLessons = []; }, storage);
}


/** Resolve the environment clock at the application boundary, never inside progression rules. */
export function recordRun(store: GoodLiftStore, run: RecordedRun, options: Partial<RecordOptions> = {}) {
  return recordDomainRun(store, run, { ...options, now: options.now ?? Date.now() });
}
