// The one line of advice a run shows, chosen from what is happening right now. The first rule
// that matches wins, so the order is the order of urgency. Kept free of game code so the chain
// can be read and tested by itself. What every hint shares with free flight (the width of a line,
// how long it stays up, the lines for a stalled wing) is in hints.js, and passed on from here.
import { BRAKE } from './flight.js';
import { stallHint } from './hints.js';
import { MEET } from './meet-state.js';
import { BLESSING, RUNE } from './meet-runes.js';

export { HINT_HOLD, HINT_WIDTH, holdHint, stallHint } from './hints.js';

// Fog this close below (m) is worth a warning: a raven strike alone costs about 60 m.
export const FOG_NEAR = 80;
// A gust front this near (m) is worth easing a held brake for, whichever way the pilot is facing:
// at the band's 12 m/s that is a few seconds' warning.
export const GUST_NEAR = 60;
// The brake has been past the light brake's shelf this long (s) before the pilot is told: the
// meter has already said it, and a moment's dip on purpose is not a mistake.
export const DEEP_WARN = 0.5;
// How to centre a circle on a thermal's core is taught from the second thermal ridden to this one.
export const CENTRE_RIDES = 6;
// How to fly into a thermal (past its core on the flock's side, turning as that wing lifts) is
// taught on the way to the first this many, and the moment to turn is said for `TURN_SAID` seconds.
export const ENTRY_RIDES = 4;
export const TURN_SAID = 1.5;
// A front tuck is explained for this many seconds after it, for the next dive.
export const TUCK_SAID = 2;
// Seconds of big ears held in climbing air before the pilot is told they will not beat it.
export const EARS_CLIMB = 1.5;
// The plates riding a gust front are pointed out on this many fronts of a run, and then left to be
// seen: some four fronts a run carry plates, and every one said would talk over the brake's lesson.
// A front that comes while circling beside the ravens is still being taught goes unsaid.
export const FRONTS_TAUGHT = 2;
// Seconds a set of rune stones is news, twice: as it is raised, and as the climb first comes level
// with it, this many metres under the foot of its opening (GATES.tall under the line), so that a
// dash out of the climb can start in time to meet the opening. Coming level is news only this many
// seconds or more after they were raised: a strong climb comes level some 3 s after, while their
// own news is still saying where they are. Said only then, the stones leave the hint to the climb's
// lessons the rest of the way past them.
export const STONES_NEWS = 4;
export const STONES_LEAD = 20;
export const STONES_AGAIN = 8;

// What each blessing does, said as it is taken, by its rune (RUNE).
export const BLESSED = Object.freeze([
  '',
  'ᚠ Fehu — plates come to you from further',
  'ᛉ Algiz — the next kettlebell glances off',
  'ᚨ Ansuz — thermal motes seen twice as far',
  'ᛏ Tiwaz — plates ×2; a hit takes the bar',
]);

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
 *   harsh         a stall here is the costly kind, with a dive to catch as it ends
 *   dive          seconds left to catch the wing as it dives (0 while it is not diving)
 *   tucked        seconds since the wing last tucked for a dive left uncaught
 *   ears          how far the big ears are in, 0 to 1; `earsUsed` they have been pulled this run,
 *                 and `earsClimb` seconds they have been held fully in climbing air
 *   approach      a hunted thermal's flock is ahead to fly into, turning `approachDir`
 *   turnIn        seconds since the moment came to turn into a core, `turnSide` the way to turn
 *   trailHigh     the next plate on a followed trail is too far under the wing for the bar, in air
 *                 the ears can sink through
 *
 * And the meet's, each of which says nothing when left out:
 *   bellHit       it was a kettlebell that folded the wing, not a raven
 *   bell          a kettlebell is coming: 1 while circling with the bar off, 2 otherwise (0 none)
 *   beast         that kettlebell is the Beast
 *   closeCall     seconds since a kettlebell missed by a whisker, and `beastClose` whether it was
 *                 the Beast (whose close call is worth MEET.beast)
 *   glanced       seconds since a kettlebell glanced off Algiz
 *   barLost       seconds since a strike took the whole bar under Tiwaz
 *   horn          seconds since Gjallarhorn sounded
 *   blessing      the blessing held (RUNE), and `blessed` seconds since it was taken
 *   double        Tiwaz is held, so whatever is loaded counts twice
 *   depth         seconds since the run's first rep to depth
 *   sprayed       a strike's plates are flying off the bar, to be caught
 *   stones        the line (m) the rune stones still waiting near the pilot stand at (0 for none),
 *                 `stonesNew` seconds since they were raised, and `stonesLevel` seconds since the
 *                 climb first came level with them (STONES_LEAD under the foot of their opening)
 *   thunder       a plate hangs under the storm cloud the pilot is near
 *   front         a gust front carrying plates is on its way to a pilot circling in lift, and
 *                 `fronts` how many fronts have carried plates this run
 *   bait          the fog's bait is waiting near the pilot to be brought up
 *   trail         plates lie on the bar's glide from the dying lift, waiting to be followed
 *   shallow       the last circle in this thermal was off its core: a rep, but not to depth
 */
export function cloudbaseHint(facts) {
  // A folded wing is pumped open: the brake held a moment and let go, twice.
  if (facts.collapse > 0) {
    const pump = facts.touch ? 'hold ▼, let go, twice' : 'hold brake, let go, twice';
    return facts.bellHit ? `kettlebell hit — ${pump}` : `raven strike — ${pump}`;
  }
  const stalled = stallHint(facts.stall, facts.stallSide, facts.harsh);
  if (stalled) return stalled;
  // A dive is caught with a touch of the brake, and the tuck it ends in says so for the next one.
  if (facts.dive > 0) return facts.touch ? 'wing diving — tap ▼ to catch it' : 'wing diving — tap the brake to catch it';
  if (facts.tucked < TUCK_SAID) return facts.touch ? 'front tuck — tap ▼ as the wing dives' : 'front tuck — tap the brake as it dives';
  // A kettlebell is dodged by changing what the wing is doing. Circling, the bar is the change
  // that works (straightening fails in a gentle circle); flying straight, or on the bar, a turn is.
  // The Beast is dodged the same way, said in the fewest words: by the time it comes at 1,000 m
  // the pilot has dodged a few, and its line still has to start with the word that says it at once.
  // With the ears in, the bar is not to be had: the turn off the line is what dodges.
  const bell = facts.bell === 1 && facts.ears >= 0.5 ? 2 : facts.bell;
  if (bell === 1) {
    if (facts.beast) return facts.touch ? 'kettlebell — the Beast: ◀▶ or straighten' : 'kettlebell — the Beast: bar or straighten';
    return facts.touch ? 'kettlebell — ◀▶ for the bar, or straighten' : 'kettlebell — push the bar or straighten';
  }
  if (bell === 2) return facts.beast ? 'kettlebell — the Beast: turn off your line' : 'kettlebell — turn off your line';
  if (facts.load >= 0.6) return 'brake in the red — ease off or it stalls';
  // A front on the tail of a held brake is what tips it over; any front may come round to the tail.
  if (facts.gustAhead < GUST_NEAR && facts.brake > BRAKE.light) return 'gust coming — ease the brake';
  // Out of lift a deep brake is usually a way down being looked for: the ears are the one that
  // cannot stall, said until they have been tried.
  if (facts.deep >= DEEP_WARN) {
    if (facts.lift < 1 && !facts.earsUsed) return facts.touch ? 'brake going deep — let go; ▼▼ sinks fast' : 'brake going deep — let go; E to sink fast';
    return 'brake going deep — ease off now';
  }
  if (facts.cloud > 0.25) return 'in cloud — let go, fly straight out';
  if (facts.outside) return 'the wind turns you back toward the lift';
  // The moment a core passes beside the wing on the flock's side: turned into now, the first circle
  // goes round the core.
  if (facts.turnIn < TURN_SAID) return `turn ${facts.turnSide > 0 ? '▶' : '◀'} now — into the lifted wing`;
  // A moment's news from the meet, each said for a moment only, with what it put on the bar.
  const times = facts.double ? BLESSING.double : 1;
  if (facts.glanced < 2) return 'ᛉ Algiz turned the kettlebell aside';
  if (facts.closeCall < 2) {
    return facts.beastClose ? `close call, the Beast — ${MEET.beast * times} kg on the bar` : `close call — ${MEET.close * times} kg on the bar`;
  }
  // Said once the wing has opened again: while it is folded, that line comes first.
  if (facts.barLost < 5) return 'ᛏ Tiwaz — the strike took the whole bar';
  if (facts.horn < 3) return 'Gjallarhorn — every lift counts double';
  if (facts.blessed < 3 && BLESSED[facts.blessing]) return BLESSED[facts.blessing];
  if (facts.depth < 2.5) return `depth — centred circle, ${MEET.deep * times} kg on the bar`;
  if (facts.elapsed < 8) return 'circle in the amber column to climb';
  if (facts.fogClearance < FOG_NEAR) return facts.lift > 3 ? 'fog closing in — keep climbing' : 'fog closing in — fly to the ravens';
  if (facts.headroom < 70 && facts.climbing) return 'storm cloud above — lift ends at its base';
  if (facts.earsClimb > EARS_CLIMB) return 'ears won\'t beat this lift — fly out too';
  // What is there to be had for a few seconds, and gone if it waits: a strike's own plates, the
  // stones (as they are raised, and as the climb comes level with them), and the plate under a
  // storm cloud, which waits while the climb toward the cloud is still being warned off it.
  if (facts.sprayed) return 'your plates sprayed — catch any on the way';
  if (facts.stones > 0 && facts.stonesLevel < STONES_NEWS && facts.stonesNew - facts.stonesLevel >= STONES_AGAIN) return 'fly through a glowing rune for its blessing';
  if (facts.stones > 0 && facts.stonesNew < STONES_NEWS) {
    const at = `rune stones at ${facts.stones.toLocaleString('en-GB')} m`;
    return facts.blessing > RUNE.none ? `${at} — one replaces yours` : `${at} — fly through one`;
  }
  if (facts.thunder) return '25 kg under the cloud — grab it and leave';
  // Leaving dying lift the short way round is not a mistake to correct.
  if (facts.thermal > 0 && facts.against > 1 && !facts.dying) return `ravens turn ${facts.flockDir > 0 ? '▶' : '◀'} here — turn with them`;
  if (facts.trailHigh) return facts.touch ? 'too high for the plates — ▼▼ big ears' : 'too high for the plates — big ears (E)';
  if (facts.trail) return 'lift dying — follow the plates on the bar';
  if (facts.bait) return 'fog bait — be over it as the fog lifts it';
  if (facts.thermal >= 0 && facts.dying) return facts.thermal === 0 ? 'lift dying — fly to the circling ravens' : 'lift dying — leave when the ravens leave';
  // On the way into the first thermals, how to enter one: past its core on the side its ravens turn
  // to, turning as the wing on that side lifts, so the first circle goes round the core.
  if (facts.approach && facts.rides < ENTRY_RIDES) {
    const side = facts.approachDir > 0 ? '▶' : '◀';
    return `ravens on your ${side}; turn ${side} as that wing lifts`;
  }
  // Once circling is learnt, how to centre it: the lift surges on the side of a circle nearest the
  // core, and straightening there for a beat moves the circle onto it. Said while circles miss it.
  if (facts.thermal > 0 && facts.shallow && facts.rides >= 2 && facts.rides <= CENTRE_RIDES) {
    return facts.touch ? `surge — lift your thumb off ${facts.flockDir > 0 ? '▶' : '◀'} for a beat` : 'straighten in the surge, turn as it fades';
  }
  if (facts.thermal > 0 && facts.rides <= 2) return 'climb beside the ravens, never through';
  // Iron on the wind, once circling beside the ravens is learnt: a circle widened as the front comes
  // meets its plates. Said for the few seconds they are coming, before the brake's lesson, which a
  // pilot who climbs well hears for the rest of the run.
  if (facts.front && facts.fronts <= FRONTS_TAUGHT) return 'plates on the gust — widen your circle';
  // Then how the brake helps: held light it tightens the circle, and left on it goes deep.
  if (facts.thermal > 0 && facts.rides <= 4) return facts.touch ? 'ease off ▼ once a circle or it goes deep' : 'ease the brake each circle or it goes deep';
  if (facts.thermal === 0) return 'circling ravens mark the next lift';
  if (facts.searching > 4) return 'ravens circle where air rises — fly there';
  return '';
}
