// The one line of advice a run shows, chosen from what is happening right now. The first rule
// that matches wins, so the order is the order of urgency. Kept free of game code so the chain
// can be read and tested by itself. What every hint shares with free flight (the width of a line,
// how long it stays up, the lines for a stalled wing) is in hints.js, and passed on from here.
import { BRAKE } from './flight.js';
import { stallHint } from './hints.js';

export { HINT_HOLD, HINT_WIDTH, holdHint, stallHint } from './hints.js';

// Fog this close below (m) is worth a warning: a raven strike alone costs about 60 m.
export const FOG_NEAR = 80;
// A gust front this near (m) is worth easing a held brake for, whichever way the pilot is facing:
// at the band's 12 m/s that is a few seconds' warning.
export const GUST_NEAR = 60;
// The brake has been past the light brake's shelf this long (s) before the pilot is told: the
// meter has already said it, and a moment's dip on purpose is not a mistake.
export const DEEP_WARN = 0.5;

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
 *
 * And the meet's, each of which says nothing when left out:
 *   bellHit       it was a kettlebell that folded the wing, not a raven
 *   bell          a kettlebell is coming: 1 while circling with the bar off, 2 otherwise (0 none)
 *   closeCall     seconds since a kettlebell missed by a whisker
 *   horn          seconds since Gjallarhorn sounded
 *   trail         plates lie on the bar's glide from the dying lift, waiting to be followed
 */
export function cloudbaseHint(facts) {
  if (facts.collapse > 0) return facts.bellHit ? 'kettlebell hit — wing collapsed, hold on' : 'raven strike — wing collapsed, hold on';
  const stalled = stallHint(facts.stall, facts.stallSide);
  if (stalled) return stalled;
  // A kettlebell is dodged by changing what the wing is doing. Circling, the bar is the change
  // that works (straightening fails in a gentle circle); flying straight, or on the bar, a turn is.
  if (facts.bell === 1) return facts.touch ? 'kettlebell — ◀▶ for the bar, or straighten' : 'kettlebell — push the bar or straighten';
  if (facts.bell === 2) return 'kettlebell — turn off your line';
  if (facts.load >= 0.6) return 'brake in the red — ease off or it stalls';
  // A front on the tail of a held brake is what tips it over; any front may come round to the tail.
  if (facts.gustAhead < GUST_NEAR && facts.brake > BRAKE.light) return 'gust coming — ease the brake';
  if (facts.deep >= DEEP_WARN) return 'brake going deep — ease off now';
  if (facts.cloud > 0.25) return 'in cloud — let go, fly straight out';
  if (facts.outside) return 'the wind turns you back toward the lift';
  // A moment's news from the meet, each said for a moment only.
  if (facts.closeCall < 2) return 'close call — 10 kg on the bar';
  if (facts.horn < 3) return 'Gjallarhorn — every lift counts double';
  if (facts.elapsed < 8) return 'circle in the amber column to climb';
  if (facts.fogClearance < FOG_NEAR) return facts.lift > 3 ? 'fog closing in — keep climbing' : 'fog closing in — fly to the ravens';
  if (facts.headroom < 70 && facts.climbing) return 'storm cloud above — lift ends at its base';
  // Leaving dying lift the short way round is not a mistake to correct.
  if (facts.thermal > 0 && facts.against > 1 && !facts.dying) return `ravens turn ${facts.flockDir > 0 ? '▶' : '◀'} here — turn with them`;
  if (facts.trail) return 'lift dying — follow the plates on the bar';
  if (facts.thermal >= 0 && facts.dying) return facts.thermal === 0 ? 'lift dying — fly to the circling ravens' : 'lift dying — leave when the ravens leave';
  if (facts.thermal > 0 && facts.rides <= 2) return 'climb beside the ravens, never through';
  // Then how the brake helps: held light it tightens the circle, and left on it goes deep.
  if (facts.thermal > 0 && facts.rides <= 4) return facts.touch ? 'ease off ▼ once a circle or it goes deep' : 'ease the brake each circle or it goes deep';
  if (facts.thermal === 0) return 'circling ravens mark the next lift';
  if (facts.searching > 4) return 'ravens circle where air rises — fly there';
  return '';
}

