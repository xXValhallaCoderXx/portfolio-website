// The one line of advice a Cloudbase run shows, chosen from what is happening right now. The
// first rule that matches wins, so the order is the order of urgency. Kept free of game code so
// the chain can be read and tested by itself.

// Fog this close below (m) is worth a warning: a raven strike alone costs about 60 m.
export const FOG_NEAR = 80;
// Every line must fit on one row of a 360 px phone, which is this many characters of the HUD's type.
export const HINT_WIDTH = 43;
// A line stays up at least this many seconds of the run, so that it can be read before the next.
export const HINT_HOLD = 1.5;

/**
 * `facts` describes the moment:
 *   collapse      seconds of wing collapse left
 *   cloud         how deep in cloud the pilot is, 0 to 1
 *   outside       the pilot has left the zone
 *   elapsed       seconds into the run
 *   fogClearance  metres down to the fog
 *   lift          rising air at the pilot, m/s
 *   headroom      metres of clear air to a cloud base overhead
 *   climbing      the pilot is going up
 *   thermal       the column the pilot is in: 0 the launch column, 1 or 2 a hunted one, -1 none
 *   dying         that column is fading
 *   flockDir      which way its ravens turn: 1 right, -1 left
 *   against       seconds spent turning the other way from them
 *   rides         hunted thermals entered so far in this run
 *   searching     seconds without lift
 *   touch         the on-screen buttons are in use
 */
export function cloudbaseHint(facts) {
  if (facts.collapse > 0) return 'raven strike — wing collapsed, hold on';
  if (facts.cloud > 0.25) return facts.touch ? 'in cloud — let go, or hold ▼, to drop out' : 'in cloud — fly straight to drop out';
  if (facts.outside) return 'the wind turns you back into Cloudbase';
  if (facts.elapsed < 8) return 'circle in the amber column to climb';
  if (facts.fogClearance < FOG_NEAR) return facts.lift > 3 ? 'fog closing in — keep climbing' : 'fog closing in — fly to the ravens';
  if (facts.headroom < 70 && facts.climbing) return 'storm cloud above — lift ends at its base';
  // Leaving dying lift the short way round is not a mistake to correct.
  if (facts.thermal > 0 && facts.against > 1 && !facts.dying) return `ravens turn ${facts.flockDir > 0 ? '▶' : '◀'} here — turn with them`;
  if (facts.thermal >= 0 && facts.dying) return facts.thermal === 0 ? 'lift dying — fly to the circling ravens' : 'lift dying — leave when the ravens leave';
  if (facts.thermal > 0 && facts.rides <= 2) return 'climb beside the ravens, never through';
  if (facts.thermal === 0) return 'circling ravens mark the next lift';
  if (facts.searching > 4) return 'ravens circle where air rises — fly there';
  return '';
}

// The wing has folded, or the pilot is in cloud: these lines cannot wait their turn.
const urgent = (line) => line.startsWith('raven strike') || line.startsWith('in cloud');

/**
 * Decides which line is on screen. `held` is `{ line, since }`, the line showing and the run time
 * it appeared; `line` is what cloudbaseHint says now and `now` the run time. A line gives way at
 * once to an urgent one or when there was none, and otherwise only after HINT_HOLD, so that a
 * moment's change of mind in the air does not flash text too fast to read.
 */
export function holdHint(held, line, now) {
  if (line !== held.line && (held.line === '' || urgent(line) || now - held.since >= HINT_HOLD)) {
    held.line = line;
    held.since = now;
  }
  return held.line;
}
