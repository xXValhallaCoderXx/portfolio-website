// The gliders by name, and the byte a run's log names its wing by: kept free of imports, so a log,
// a board row or the page can name a glider without loading any of them (gliders.js flies them).

/** The gliders, in the order they are earned. */
export const GLIDERS = Object.freeze(['en-a', 'en-b', 'en-c', 'en-d', 'acro'] as const);
export type GliderId = typeof GLIDERS[number];

/** Whether `id` names one of the gliders. */
export const isGlider = (id: unknown): id is GliderId => typeof id === 'string' && (GLIDERS as readonly string[]).includes(id);

/** What each is called, its class and what it adds to the pilot's game. */
export const GLIDER_NAMES = Object.freeze({
  'en-a': Object.freeze({ name: 'Skjold', badge: 'EN-A', role: 'Floats and forgives: climbs best and recovers by itself.' }),
  'en-b': Object.freeze({ name: 'Fylgja', badge: 'EN-B', role: 'The all-rounder: a little more glide, and it can be stalled.' }),
  'en-c': Object.freeze({ name: 'Sleipnir', badge: 'EN-C', role: 'Sport: runs on the bar and swings big; mind the brakes.' }),
  'en-d': Object.freeze({ name: 'Gungnir', badge: 'EN-D', role: 'The racer: best glide and speed, short brakes, spins when slow.' }),
  'acro': Object.freeze({ name: 'Loki', badge: 'ACRO', role: 'Keeps every bit of energy for tricks; glides worst.' }),
});

/**
 * The wings a run's log can name (recorder.js), each by its place here: the classic wing the fjord
 * and the pure-flight receipts fly, then the gliders. Only ever added to at the end, so a byte once
 * given names that wing for good.
 */
export const LOG_WINGS = Object.freeze(['classic', 'en-a', 'en-b', 'en-c', 'en-d', 'acro'] as const);
export type LogWing = typeof LOG_WINGS[number];

/** Whether `id` is a wing a log can name. */
export const isLogWing = (id: unknown): id is LogWing => typeof id === 'string' && (LOG_WINGS as readonly string[]).includes(id);
