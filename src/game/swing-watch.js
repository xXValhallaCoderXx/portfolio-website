// What the wing's swings are doing, watched step by step: the peaks of its swing fore and aft and
// of its wingovers, a swing being pumped bigger, a surge caught, the pilot's hands on time, and
// anything that breaks a trick off. It only reads the flight (flight.js), so a run, its replays and the fjord
// all see the same tricks; a run's style is scored from it (meet-style.js), and the swing gauge
// (swing-gauge.js) and the sounds read it. Kept small and free of page code: the fjord carries it.

import { PITCH, pitchPeak } from './flight.js';

// The bands a trick is judged in, in degrees: a pitched swing by how far ahead it peaks, a wingover
// by how far it banks at its top. Each top band sits a few degrees under the fold the swing risks
// (PITCH.line, 57°, and ROLL.limit, 78°), and the first above anything one move of ordinary flying
// does: a brake let go swings the wing some 17° ahead, and one hard reversal of a held turn banks it
// 45°, so a wingover's first swap is its run-up and the second its first to count. A dodge turned
// straight back is two swaps, and can make that one (51-56°): alone, it is no set in hand
// (meet-style.js STYLE.inHand).
export const BANDS = Object.freeze({ pitch: Object.freeze([20, 30, 40, 50]), roll: Object.freeze([50, 58, 66, 72]) });

// How the swings are read. Angles in radians, times in seconds.
//   half     a peak of the swing fore and aft counts from this far either way
//   grow     a forward peak still builds the swing if it falls short of the last by no more than this
//   surge    a swing going forward toward a peak this far ahead or further is a surge heading for
//            the fold (the tuck line less a margin to brake in): braked as it goes, it is caught as
//            it turns back short of the line
//   calm     under this much pitch, and `still` rad/s of it, the swing fore and aft is calm
//   top      a wingover's top counts from this much bank
//   gap      wingovers' tops on alternate sides this close together are one chain of them
//   level    under this much bank, with the swing fore and aft calm, the wing is level again
//   wing     a top this steep is a wingover's, its swap there on time from `early` before it to
//            `late` after it, and so is any top the turn was reversed into (within `gap`): one
//            reversal of a held turn swings the bank 37° to 47°, as it is timed, where rolling into
//            a turn from straight flight overshoots to some 41°, which is no wingover
//   straight flown straight this long, the turn last asked is forgotten: a turn into a circle from
//            straight flight reverses nothing, whichever way the last one went
//   pump     a press of the brake this long after a pitched swing's forward peak, or a let-go
//            after its back peak, is on time, the forward peak at least `pumped` ahead
//   within   a swing is being pumped while its last forward peak and the pilot's last press or
//            let-go of the brake are no older than this
export const WATCH = Object.freeze({
  half: 0.26, grow: 0.05, surge: PITCH.line - 0.21, calm: 0.175, still: 0.3, within: 4, top: 0.7, gap: 2, level: 0.785,
  wing: 0.759, early: 0.12, late: 0.2, pump: 0.45, pumped: 0.35, straight: 1,
});

const DEG = Math.PI / 180;
// The band a peak reaches (0 for none, 1 to 4), in BANDS' degrees.
export function bandOf(bands, angle) {
  let band = 0;
  while (band < bands.length && angle >= bands[band] * DEG - 1e-9) band += 1;
  return band;
}

/**
 * The watch, made once and reset for every flight. Its `state` is plain numbers:
 *
 *   clock                 seconds watched
 *   fronts, backs         peaks of the swing fore and aft, ahead and behind, so far
 *   front, back           how far the last of each went (rad, as a size)
 *   frontAt, backAt       when they came
 *   building              forward peaks in a row, each at least `half`, none falling short of the
 *                         last by more than `grow`: two or more is a swing being pumped bigger
 *   catches, caughtPeak   surges caught, how far ahead the last turned back, and when
 *   caughtAt
 *   brakeAt               when the brake was last pressed or let go
 *   pumping               1 while a swing is being pumped bigger by the pilot's hands: `building`
 *                         two or more, its last forward peak at least `pumped` ahead and no older
 *                         than `within`, not caught since, and the brake worked within `within`
 *   tops, top, topSide    tops of the bank so far, how far the last banked (rad) and to which side
 *   topAt, chain          when it came, and wingovers' tops on alternate sides in a row, each
 *                         within `gap` of the last
 *   breaks, broke         things that broke a trick off so far, and the last: 1 tuck, 2 tip,
 *                         3 stall, 4 strike, 5 ears
 *   calm                  seconds the wing has been level and calm
 *   timed, timedKind      the pilot's hands on time so far, and the last: 1 a press just after a
 *   timedAt               pitched swing peaked ahead, 2 a let-go just after it peaked behind, 3 a
 *                         wingover's turn swapped at its top; and when
 *   swappedAt, wingTop    when the turn was last reversed, and whether the last top was a
 *                         wingover's (1) or not (0)
 *   linking               1 while a wingover is under way: its last top not long gone, and the
 *                         turn swapped back from it since, or just before it came
 */
export function createSwingWatch() {
  const state = {
    clock: 0, fronts: 0, backs: 0, front: 0, back: 0, frontAt: -Infinity, backAt: -Infinity, building: 0,
    catches: 0, caughtPeak: 0, caughtAt: -Infinity, brakeAt: -Infinity, pumping: 0, tops: 0, top: 0, topSide: 0, topAt: -Infinity, chain: 0, breaks: 0, broke: 0, calm: 0,
    timed: 0, timedKind: 0, timedAt: -Infinity, swappedAt: -Infinity, wingTop: 0, linking: 0,
  };
  // The swing as it was last step, to find its turns, whether a surge is heading for the fold, and
  // whether something has the wing.
  let pitchRate = 0;
  let bankWas = 0;
  let rolling = 0;
  let surging = false;
  let broken = false;
  // The pilot's hands: the way the turn was last asked (the last that was not straight, unless
  // straight for long since), when it last swapped and to which way, whether the brake was held,
  // and whether the last top's swap has been counted.
  let way = 0;
  let straightFor = 0;
  let swappedTo = 0;
  let braked = false;
  let topAnswered = true;

  function reset() {
    state.clock = state.fronts = state.backs = state.front = state.back = state.building = 0;
    state.catches = state.caughtPeak = state.tops = state.top = state.topSide = state.chain = state.breaks = state.broke = state.calm = 0;
    state.timed = state.timedKind = state.wingTop = state.linking = state.pumping = 0;
    state.frontAt = state.backAt = state.topAt = state.timedAt = state.swappedAt = state.caughtAt = state.brakeAt = -Infinity;
    pitchRate = bankWas = rolling = way = straightFor = swappedTo = 0;
    broken = braked = surging = false;
    topAnswered = true;
  }

  function onTime(kind, now) {
    state.timed += 1;
    state.timedKind = kind;
    state.timedAt = now;
    if (kind === 3) topAnswered = true;
  }

  /**
   * One step of `dt` seconds of the wing `g` (flight.js), taken after it flew. `struck` says a raven
   * or a kettlebell has the wing folded (a run's own; over the fjord, never), and `controls` are
   * what the pilot asked of it this step (flight.js's), for the hands on time; left out, none are.
   */
  function step(dt, g, struck = false, controls = null) {
    state.clock += dt;
    const now = state.clock;
    if (controls) {
      // A swap of the turn just after the wingover's top it answers, the way back from it. Flown
      // straight a while, the last turn is forgotten, and the next swaps nothing.
      const turn = Math.sign(controls.turn);
      straightFor = turn === 0 ? straightFor + dt : 0;
      if (straightFor > WATCH.straight) way = 0;
      if (turn !== 0 && turn !== way) {
        if (way !== 0) {
          state.swappedAt = now;
          swappedTo = turn;
          if (!topAnswered && turn === -state.topSide && now - state.topAt <= WATCH.late) onTime(3, now);
        }
        way = turn;
      }
      // A press just after a pitched swing peaks ahead, or a let-go just after it peaks behind.
      const brake = !!controls.brake;
      const pitched = state.building >= 1 && state.front >= WATCH.pumped;
      if (pitched && brake && !braked && state.frontAt > state.backAt && now - state.frontAt <= WATCH.pump) onTime(1, now);
      if (pitched && !brake && braked && state.backAt > state.frontAt && now - state.backAt <= WATCH.pump) onTime(2, now);
      if (brake !== braked) state.brakeAt = now;
      braked = brake;
    }
    // Anything that takes the wing out of the pilot's hands breaks off the trick in hand.
    const breaking = g.tuck > 0 ? 1 : g.tip > 0 ? 2 : g.stall > 0 ? 3 : struck ? 4 : g.ears > 0 ? 5 : 0;
    if (breaking && !broken) {
      state.breaks += 1;
      state.broke = breaking;
      state.building = state.chain = 0;
    }
    broken = breaking !== 0;
    // A surge heading for the fold, braked as it goes, is caught as it turns back short of the line;
    // one that turns back by itself, or tucks, was not.
    if (broken) surging = false;
    else if (g.pitchRate < 0 && pitchPeak(g) < -WATCH.surge) surging = true;
    else if (surging && g.pitchRate >= 0) {
      if (controls?.brake) {
        state.catches += 1;
        state.caughtPeak = -g.pitch;
        state.caughtAt = now;
      }
      surging = false;
    }

    // The swing fore and aft turns where its rate changes sign.
    if (pitchRate < 0 && g.pitchRate >= 0 && -g.pitch >= WATCH.half) {
      state.fronts += 1;
      const size = -g.pitch;
      state.building = state.building > 0 && size >= state.front - WATCH.grow ? state.building + 1 : 1;
      state.front = size;
      state.frontAt = now;
    } else if (pitchRate > 0 && g.pitchRate <= 0 && g.pitch >= WATCH.half) {
      state.backs += 1;
      state.back = g.pitch;
      state.backAt = now;
    }
    pitchRate = g.pitchRate;
    // A swing that has died away is no longer one being built.
    if (now - state.frontAt > 2 * WATCH.within) state.building = 0;
    // Being pumped bigger: built, of late, by the pilot's hands, and not caught since.
    const built = state.building >= 2 && state.front >= WATCH.pumped && state.caughtAt < state.frontAt;
    state.pumping = built && now - state.frontAt <= WATCH.within && now - state.brakeAt <= WATCH.within ? 1 : 0;

    // A wingover tops out where the bank stops rolling.
    const rate = g.bank - bankWas;
    if (rolling * rate < 0 && Math.abs(g.bank) >= WATCH.top) {
      const side = Math.sign(g.bank);
      // A wingover's top: a steep one, or one the turn was reversed into. Only these link, each on
      // the other side from the last and not long after it; the overshoot of a turn rolled into from
      // straight flight is no wingover, and nothing links to it.
      const wing = Math.abs(g.bank) >= WATCH.wing || now - state.swappedAt <= WATCH.gap ? 1 : 0;
      state.chain = wing === 1 && state.chain > 0 && side === -state.topSide && now - state.topAt <= WATCH.gap ? state.chain + 1 : wing;
      state.tops += 1;
      state.top = Math.abs(g.bank);
      state.topSide = side;
      state.topAt = now;
      // A wingover's top waits for its swap; one just before it, the way back from it, was on time.
      state.wingTop = wing;
      topAnswered = wing === 0;
      if (!topAnswered && swappedTo === -side && now - state.swappedAt <= WATCH.early) onTime(3, now);
    }
    if (rate !== 0) rolling = rate;
    bankWas = g.bank;
    if (now - state.topAt > WATCH.gap) state.chain = 0;
    // A wingover under way: its last top not long gone, and the turn swapped back from it since, or
    // just before it came.
    const recent = state.wingTop === 1 && now - state.topAt <= WATCH.gap;
    state.linking = recent && swappedTo === -state.topSide && state.swappedAt >= state.topAt - WATCH.early ? 1 : 0;

    // Level and calm: little bank, and the swing fore and aft all but still.
    const settled = !broken && Math.abs(g.bank) < WATCH.level && Math.abs(g.pitch) < WATCH.calm && Math.abs(g.pitchRate) < WATCH.still;
    state.calm = settled ? state.calm + dt : 0;
  }

  return { reset, step, get state() { return state; } };
}
