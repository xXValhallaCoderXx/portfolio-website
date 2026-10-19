/** The operations a progress store needs; usable with browser storage or an in-memory test double. */
export interface StoragePort {
  getItem(key: string): string | null | undefined;
  setItem(key: string, value: string): unknown;
  removeItem(key: string): unknown;
}

/** Reading the browser property can itself throw when site storage is blocked. */
export function deviceStorage(): StoragePort | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}
