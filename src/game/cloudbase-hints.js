// The one line of advice a Cloudbase run shows, chosen from what is happening right now. The
// first rule that matches wins, so the order is the order of urgency. Kept free of game code so
// the chain can be read and tested by itself. The lines for a stalled wing are shared with free
// flight (fjord-hints.js), and so is the rule for how long a line stays up.
import { BRAKE } from './flight.js';

// Fog this close below (m) is worth a warning: a raven strike alone costs about 60 m.
export const FOG_NEAR = 80;
// Every line must fit on one row of a 360 px phone, which is this many characters of the HUD's type.
export const HINT_WIDTH = 43;
// A line stays up at least this many seconds of the run, so that it can be read before the next.
export const HINT_HOLD = 1.5;
// A gust front this near (m) is worth easing a held brake for, whichever way the pilot is facing:
// at the band's 12 m/s that is a few seconds' warning.
export const GUST_NEAR = 60;
// The brake has been past the light brake's shelf this long (s) before the pilot is told: the
// meter has already said it, and a moment's dip on purpose is not a mistake.
export const DEEP_WARN = 0.5;

/** The line for a wing that has stalled, in a run or over the fjord, or '' while it flies. */
export function stallHint(stall, stallSide) {
  if (!(stall > 0)) return '';
  return stallSide ? 'spin — too much brake in the turn, let go' : 'stalled — let go, the wing flies again';
}

/**
 * `facts` describes the moment:
 *   collapse      seconds of wing collapse left
 *   stall         seconds of stall left, and `stallSide` -1 or 1 in a spin (0 straight)
 *   brake         how far the brake is down, 0 to 1
 *   deep          seconds the brake has been past the light brake's shelf
 *   load          how near the stall is, 0 to 1
 *   gustAhead     metres to the next gust front coming at the pilot (0 inside one, 999 none)
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
  const stalled = stallHint(facts.stall, facts.stallSide);
  if (stalled) return stalled;
  if (facts.load >= 0.6) return 'brake in the red — ease off or it stalls';
  // A front on the tail of a held brake is what tips it over; any front may come round to the tail.
  if (facts.gustAhead < GUST_NEAR && facts.brake > BRAKE.light) return 'gust coming — ease the brake';
  if (facts.deep >= DEEP_WARN) return 'brake going deep — ease off now';
  if (facts.cloud > 0.25) return 'in cloud — let go, fly straight out';
  if (facts.outside) return 'the wind turns you back into Cloudbase';
  if (facts.elapsed < 8) return 'circle in the amber column to climb';
  if (facts.fogClearance < FOG_NEAR) return facts.lift > 3 ? 'fog closing in — keep climbing' : 'fog closing in — fly to the ravens';
  if (facts.headroom < 70 && facts.climbing) return 'storm cloud above — lift ends at its base';
  // Leaving dying lift the short way round is not a mistake to correct.
  if (facts.thermal > 0 && facts.against > 1 && !facts.dying) return `ravens turn ${facts.flockDir > 0 ? '▶' : '◀'} here — turn with them`;
  if (facts.thermal >= 0 && facts.dying) return facts.thermal === 0 ? 'lift dying — fly to the circling ravens' : 'lift dying — leave when the ravens leave';
  if (facts.thermal > 0 && facts.rides <= 2) return 'climb beside the ravens, never through';
  // Then how the brake helps: held light it tightens the circle, and left on it goes deep.
  if (facts.thermal > 0 && facts.rides <= 4) return facts.touch ? 'ease off ▼ once a circle or it goes deep' : 'ease the brake each circle or it goes deep';
  if (facts.thermal === 0) return 'circling ravens mark the next lift';
  if (facts.searching > 4) return 'ravens circle where air rises — fly there';
  return '';
}

// The wing has folded or stalled, is about to, or the pilot is in cloud: these cannot wait their turn.
const URGENT = ['raven strike', 'stalled', 'spin', 'brake in the red', 'gust coming', 'brake going deep', 'in cloud'];
const urgent = (line) => URGENT.some((start) => line.startsWith(start));

/**
 * Decides which line is on screen. `held` is `{ line, since }`, the line showing and the time it
 * appeared; `line` is what the chain says now and `now` the flight's own clock (the run's, or the
 * flight's over the fjord, so the map pauses it). A line gives way at once to an urgent one or
 * when there was none, and otherwise only after HINT_HOLD, so that a moment's change of mind in
 * the air does not flash text too fast to read.
 */
export function holdHint(held, line, now) {
  if (line !== held.line && (held.line === '' || urgent(line) || now - held.since >= HINT_HOLD)) {
    held.line = line;
    held.since = now;
  }
  return held.line;
}
