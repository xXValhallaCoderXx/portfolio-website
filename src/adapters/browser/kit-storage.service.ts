import { KIT_KEY, emptyKit, normalizeKit } from '../../domains/progression/wing-kit.ts';
import type { WornKit } from '../../domains/progression/models.ts';
import { deviceStorage, type StoragePort } from './storage.port.ts';
// The kit as this visit last wrote it, and whether that write reached storage.
let memory: WornKit | null = null;
let landed = true;

/**
 * The kit `storage` holds. Storage that cannot be read, or that refused this visit's last write,
 * gives the visit's own copy; nothing stored gives the empty kit.
 */
export function readKit(storage: StoragePort | null | undefined = deviceStorage()) {
  let text;
  try {
    text = storage!.getItem(KIT_KEY);
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
export function writeKit(kit: unknown, storage: StoragePort | null | undefined = deviceStorage()) {
  memory = normalizeKit(kit);
  try {
    storage!.setItem(KIT_KEY, JSON.stringify(memory));
    landed = true;
  } catch {
    landed = false;
  }
  return landed;
}

/** Forgets the kit: the stored key and the visit's copy. Reset progress calls it. */
export function clearKit(storage: StoragePort | null | undefined = deviceStorage()) {
  memory = null;
  try {
    storage!.removeItem(KIT_KEY);
    landed = true;
  } catch {
    landed = false;
  }
}
