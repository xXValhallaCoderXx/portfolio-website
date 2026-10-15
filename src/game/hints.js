// What every one-line hint shares, over the fjord and in a run: how wide a line may be, how long
// it stays up, the lines for a stalled wing, and which lines cannot wait their turn. Kept apart
// from the run's own chain (cloudbase-hints.js) so the fjord can say these without loading the run.

// Every line must fit on one row of a 360 px phone, which is this many characters of the HUD's type.
export const HINT_WIDTH = 43;
// A line stays up at least this many seconds, so that it can be read before the next.
export const HINT_HOLD = 1.5;

/**
 * The line for a wing that has stalled, in a run or over the fjord, or '' while it flies. A `harsh`
 * stall (high in a run) ends in a dive to catch, so it says both beats.
 */
export function stallHint(stall, stallSide, harsh = false) {
  if (!(stall > 0)) return '';
  if (harsh) return stallSide ? 'spin — let go, then tap as it dives' : 'stalled — let go, then tap as it dives';
  return stallSide ? 'spin — too much brake in the turn, let go' : 'stalled — let go, the wing flies again';
}

// The wing has folded, stalled, dived or tucked, is about to stall, a kettlebell is coming or the
// pilot is in cloud: these cannot wait their turn. Nor can Gjallarhorn, said with its call for its
// three seconds, nor the moment to turn into a core, which is gone within the second.
export const URGENT = Object.freeze([
  'raven strike', 'kettlebell', 'stalled', 'spin', 'wing diving', 'front tuck', 'brake in the red', 'gust coming', 'brake going deep',
  'in cloud', 'Gjallarhorn', 'turn ▶ now', 'turn ◀ now',
]);
const urgent = (line) => URGENT.some((start) => line.startsWith(start));

/**
 * Decides which line is on screen. `held` is `{ line, since }`, the line showing and the time it
 * appeared; `line` is what the chain says now and `now` the clock it is held on: a run's own time
 * (which the map pauses, and which never runs fast), or the frame clock over the fjord, where time
 * can be boosted. A line gives way at once to an urgent one or when there was none, and otherwise
 * only after HINT_HOLD, so that a moment's change of mind in the air does not flash text too fast
 * to read.
 */
export function holdHint(held, line, now) {
  if (line !== held.line && (held.line === '' || urgent(line) || now - held.since >= HINT_HOLD)) {
    held.line = line;
    held.since = now;
  }
  return held.line;
}
