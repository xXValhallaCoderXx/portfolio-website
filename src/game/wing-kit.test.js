import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { GAME_STORE as RESET_KEY } from './achievements.js';
import { KIT_KEY, WINGS, clearKit, emptyKit, normalizeKit, readKit, writeKit } from './wing-kit.js';

// A storage that keeps what it is given, as the page's localStorage does.
function memoryStorage(entries = {}) {
  const items = new Map(Object.entries(entries));
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
// The module keeps the visit's copy from test to test, so each starts from nothing.
beforeEach(() => clearKit(memoryStorage()));
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else delete globalThis.localStorage;
});

test('a visitor starts on the standard wing with no helmet and no chalk, and that is what a missing, damaged or foreign kit reads as', () => {
  assert.deepEqual(emptyKit(), { wing: 'standard', helmet: false, chalk: false });
  assert.equal(WINGS[0], 'standard');
  assert.deepEqual(readKit(memoryStorage()), emptyKit());
  for (const text of ['{broken', 'null', '[]', '"raven"', '7', JSON.stringify({ wing: 'golden', helmet: 'yes', chalk: 1 })]) {
    assert.deepEqual(readKit(memoryStorage({ [KIT_KEY]: text })), emptyKit(), text);
  }
  for (const nonsense of [null, undefined, 'raven', 3, [], new Proxy({}, { get() { throw new Error('no'); } })]) {
    assert.deepEqual(normalizeKit(nonsense), emptyKit());
  }
  // Each part stands on its own: a known wing is kept even beside a broken helmet.
  assert.deepEqual(normalizeKit({ wing: 'hird', helmet: 'on', chalk: true, extra: 1 }), { wing: 'hird', helmet: false, chalk: true });
});

test('a kit written is read back as written, under its own key, sharing nothing with what it was given', () => {
  const storage = memoryStorage();
  const kit = { wing: 'valkyrie', helmet: true, chalk: true };
  assert.equal(writeKit(kit, storage), true);
  assert.deepEqual(JSON.parse(storage.items.get(KIT_KEY)), kit);
  const read = readKit(storage);
  assert.deepEqual(read, kit);
  read.wing = 'raven';
  assert.equal(kit.wing, 'valkyrie');
  // Every wing there is can be worn, and only those.
  for (const wing of WINGS) {
    writeKit({ wing }, storage);
    assert.equal(readKit(storage).wing, wing);
  }
  // Kept apart from the fjord's progress and from Good Lift's own store, so neither's normaliser
  // ever drops it, and the page's reset clears it by its own name.
  assert.notEqual(KIT_KEY, RESET_KEY);
  assert.notEqual(KIT_KEY, 'fjord-glider-v1');
  clearKit(storage);
  assert.equal(storage.items.has(KIT_KEY), false);
  assert.deepEqual(readKit(storage), emptyKit());
});

test('where storage is blocked or full, the kit lasts for the visit, and the next write that lands has the last word', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  assert.deepEqual(readKit(), emptyKit());
  assert.equal(writeKit({ wing: 'raven', chalk: true }), false);
  assert.deepEqual(readKit(), { wing: 'raven', helmet: false, chalk: true });
  assert.deepEqual(readKit(null), { wing: 'raven', helmet: false, chalk: true });
  // Storage that reads but refuses writes keeps the visit's copy rather than what it held before.
  clearKit(memoryStorage());
  const full = memoryStorage({ [KIT_KEY]: JSON.stringify({ wing: 'hird' }) });
  const setItem = full.setItem;
  full.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  writeKit({ wing: 'flyte' }, full);
  assert.equal(readKit(full).wing, 'flyte');
  full.setItem = setItem;
  writeKit({ wing: 'sheetless' }, full);
  full.items.set(KIT_KEY, JSON.stringify({ wing: 'calibrated' }));
  assert.equal(readKit(full).wing, 'calibrated', 'another tab\'s write is read once storage works again');
  // Clearing forgets the visit's copy too.
  clearKit(full);
  assert.deepEqual(readKit(full), emptyKit());
});
