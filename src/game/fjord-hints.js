// The one line of advice free flight over the fjord shows, chosen from what is happening right now.
// As in a run (cloudbase-hints.js) the first rule that matches wins, a stalled wing is said
// first, and a line is held long enough to read (hints.js). Kept free of game code so it can be tested.
import { pitchHint, stallHint, surgeHint, wingoverHint } from './hints.js';

// Over a ring this many metres up, there is still a way to come down to it worth saying.
export const RING_HIGH = 28;
// This low over the ground and sinking, rising air is worth looking for.
export const LOW = 45;

/**
 * `facts` describes the moment:
 *   stall, stallSide  seconds of stall left, and -1 or 1 in a spin (0 straight)
 *   auto              the name of the place the glider is flying itself to, or ''
 *   nearArch          closing on the arch into Good Lift, past which the brake can stall the wing
 *   arch              the arch into Good Lift is still to be found and this is the start of a flight
 *   outside           past the edge of the map
 *   nearRing          a ring is close, and `unvisited` whether its place is still to be read
 *   agl               metres above the ground
 *   sinking           the glider is going down
 *   airtime           seconds since take-off
 *   touch             the on-screen buttons are in use
 *   surging           the wing is surging toward its line and wants catching
 *   safeTricks        a trick is being flown for the first time this flight
 *   pitching          a swing is being pitched bigger, and `wingover` a wingover is under way
 */
export function fjordHint(facts) {
  const stalled = stallHint(facts.stall, facts.stallSide);
  if (stalled) return stalled;
  if (facts.auto) return `flying itself to ${facts.auto} · steer to take over`;
  // Over the fjord the wing never stalls; through the arch it can, and the pilot hears it first.
  if (facts.nearArch) return 'past the arch the brake can stall the wing';
  if (facts.arch) return 'Good Lift → hard right through the arch';
  if (facts.outside) return 'the fog turns you back toward the fjord';
  // Near a ring nothing else is said: there is one thing to do, and only if it is still to do.
  if (facts.nearRing) return facts.unvisited && facts.agl > RING_HIGH ? `hold ${facts.touch ? '▼' : 'space'} to brake down into the ring` : '';
  // The wing's swings, which nothing folds over the fjord: a surge caught as it is in a run, and the
  // first trick of a flight told it is safe here, then how to fly it.
  if (facts.surging) return surgeHint(facts.touch);
  if (facts.safeTricks) return 'safe here — past the arch, tricks can fold';
  if (facts.pitching) return pitchHint(facts.touch);
  if (facts.wingover) return wingoverHint(facts.touch);
  if (facts.agl < LOW && facts.sinking) return 'low — steer for the amber sparks to climb';
  if (facts.airtime < 9) return 'lit pillars are places to land · amber sparks are rising air';
  if (facts.airtime < 20) return `${facts.touch ? 'tap' : 'click'} a pillar to fly there by itself · hold ${facts.touch ? '»' : 'shift'} to speed up`;
  return '';
}
