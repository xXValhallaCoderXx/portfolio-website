// What every one-line hint shares, over the fjord and in a run: how wide a line may be, how long
// it stays up, and which navigation lines cannot wait their turn. Flight advice uses the coach.

// Every line must fit on one row of a 360 px phone, which is this many characters of the HUD's type.
export const HINT_WIDTH = 43;
// A line stays up at least this many seconds, so that it can be read before the next.
export const HINT_HOLD = 1.5;

// Navigation to a boundary needs an immediate update. Flight safety uses the coach card.
const urgentHint = line => line.startsWith('the fog turns you back');

/**
 * Decides which line is on screen. `held` is `{ line, since }`, the line showing and the time it
 * appeared; `line` is what the chain says now and `now` the clock it is held on: a run's own time
 * (which the map pauses, and which never runs fast), or the frame clock over the fjord, where time
 * can be boosted. A line gives way at once to an urgent one or when there was none, and otherwise
 * only after HINT_HOLD, so that a moment's change of mind in the air does not flash text too fast
 * to read.
 */
export function holdHint(held, line, now) {
  if (line !== held.line && (held.line === '' || urgentHint(line) || now - held.since >= HINT_HOLD)) {
    held.line = line;
    held.since = now;
  }
  return held.line;
}
