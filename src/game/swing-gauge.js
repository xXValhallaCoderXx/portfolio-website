// The swing gauge: where the wing is over the pilot, as the pilot would see it, and the moment to
// act. A dot moves across a cross, up for the wing ahead and down for behind, left and right with
// the bank; ticks mark the bands a trick is judged in (swing-watch.js BANDS), and red ends the folds
// the wing can come to, where it can come to them. As a moment comes the dot lights up with what to
// do: pump a folded wing open, let go of a stalled one, brake to catch a surge, press or let go to
// pitch the swing bigger, swap the turn as a wingover tops out. Worked out here without a page, so
// it can be tested, and kept small: the fjord shows it too.
import { BRAKE, LOOP, PITCH, ROLL, TUCK, pitchPeak, pitchPhase, rollPhase } from './flight.js';
import { BANDS, WATCH, bandOf } from './swing-watch.js';

const DEG = Math.PI / 180;

// Angles in radians, times in seconds.
//   pitch, bank     the gauge comes up for a swing fore and aft heading this far either way, or
//                   this much bank, or a moment to act, and stays `linger` after the last of them
//   ahead, behind   how far ahead and behind the wing the arm up and down reaches, and `side`
//   side            how much bank the arm across reaches either way
//   near            this close to a fold, where the wing can come to it, the red ends warn
//   (a surge that wants catching, a pump's moment and a swap's are the watch's: WATCH)
//   fresh           a peak's band is shown this long after it
//   stalling        with this much stall load, nothing says brake: the brake meter's red says let go
//   lead            a moment to act is foretold this long before it comes
//   (a wingover's top, to swap at, is the watch's: WATCH.wing)
export const SWING_GAUGE = Object.freeze({
  pitch: 25 * DEG, bank: 45 * DEG, linger: 1.5, ahead: 65 * DEG, behind: 30 * DEG, side: 88 * DEG, near: 6 * DEG,
  fresh: 3, stalling: 0.6, lead: 0.8,
});

// The moments to act, as the gauge names them. `pump` is holding the brake into a fold, and
// `release` letting go: of a pump held long enough, of a stalled wing, or of a pitched swing's brake.
// `up` and `down` are a loop's: ▲ as the pilot passes over the wing, ▼ as they pass under it.
export const CUES = Object.freeze({ none: 0, catch: 1, press: 2, release: 3, left: 4, right: 5, pump: 6, up: 7, down: 8 });

// Steps of the loop's ring the dot goes round in.
export const LOOP_STEPS = 72;

// The pilot's hands, for a gauge that has none to read: no brake, and no struck wing.
const NO_HANDS = Object.freeze({ brake: false, fold: 0, held: 0, pumps: 0 });
// Half a step of the run's clock (1/60 s): a pump's hold counts from there, as run-step.js and
// stepFlight count it.
const HALF_STEP = 1 / 120;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
// Where a wingover's swing will next top out, and the swing fore and aft next turn, worked out once
// a frame into these.
const phase = { toPeak: Infinity, bank: 0, size: 0 };
const swing = { toPeak: Infinity, peak: 0, toLine: Infinity };

/**
 * Writes what the gauge shows into `out` for the wing `g` (flight.js) and its watch's `watch`
 * (swing-watch.js state), `folds` saying whether the wing can fold here (in a run) and `dt` the
 * seconds since the last frame. `hands` are the pilot's: `brake`, the brake key held, and for a wing
 * a raven or a kettlebell has folded, `fold`, the seconds of it left, `held`, how long the brake has
 * been held into it, and `pumps`, the pumps it has had (run-step.js); a front collapse's are the
 * wing's own (`g.tuck`, `tuckHeld`, `tuckPumps`).
 *
 *   on      whether it is up
 *   mode    'pitch' or 'roll': the arm that counts; or 'loop', round a loop, its ring
 *   round   round a loop, where the pilot is on its ring, in LOOP_STEPS from under the wing the
 *           way it goes
 *   loopable a wingover topping out steep enough that the brake there would loop it
 *   x, y    where the dot is: x from -100 (all the way left) to 100, y from -67 (as far ahead as the
 *           arm reaches) to 33 (as far behind), in whole steps
 *   cue     the moment to act (CUES), shown on the gauge
 *   coming  the moment to act that is coming or has come (CUES), and `soon`, how soon: from 1, `lead`
 *           seconds off or more, to 0 as it comes, and 0 while it lasts; for a catch, how soon the
 *           surge peaks, which it must be braked before; for a pump, how much of its hold is left.
 *           Only this is told aloud and by the wing:
 *           a swap only once a wingover is under way, so the first top after a reversal, which a
 *           circle turned the other way or a dodge makes too, shows its swap on the gauge alone
 *   band    the band the last peak reached, 0 to 4, while it is fresh
 *   near    the wing is within `near` of a fold it can come to
 *   safe    nothing it does here folds it: no red ends
 *   left    seconds it stays up for
 *
 * Keeps nothing of its own but `out`, and makes nothing.
 */
export function swingGauge(g, watch, folds, dt, out, hands = NO_HANDS) {
  const G = SWING_GAUGE;
  const now = watch.clock;
  const peak = pitchPeak(g);
  // A wingover is under way: much bank, the turn reversed not long ago, or a wingover's top not long
  // gone.
  const swapped = now - watch.swappedAt <= WATCH.gap;
  const rolling = Math.abs(g.bank) >= G.bank || swapped || (watch.wingTop === 1 && now - watch.topAt <= WATCH.gap);
  let cue = CUES.none;
  let coming = CUES.none;
  let soon = 1;
  const struck = hands.fold > 0;
  if (struck || g.tuck > 0) {
    // A folded wing, struck or collapsed, is pumped open: the brake held, its ring filling as the
    // hold does, then let go, while pumps are left.
    const held = struck ? hands.held : g.tuckHeld;
    if ((struck ? hands.pumps : g.tuckPumps) < TUCK.pump.most) {
      cue = coming = held >= TUCK.pump.hold - HALF_STEP ? CUES.release : CUES.pump;
      soon = cue === CUES.pump ? 1 - held / TUCK.pump.hold : 0;
    }
  } else if (g.stall > 0 && hands.brake) {
    // Stalled with the brake still held: the wing flies again sooner let go, and a costly stall's
    // brake bites again only once it has been.
    cue = coming = CUES.release;
    soon = 0;
  } else if (g.loop !== 0) {
    // Round a loop: ▲ as the pilot passes over the wing, ▼ as they pass under it, foretold as each
    // moment comes and lit from LOOP.window before it to as long after, until it has its press.
    // Falling out, nothing.
    if (!g.loopOut) {
      const topNext = Math.round(g.loopNext / Math.PI) % 2 === 1;
      const toNext = g.loopRate > 0 ? (g.loopNext - g.loopAngle) / g.loopRate : Infinity;
      if (g.loopLate) {
        cue = coming = topNext ? CUES.down : CUES.up;
        soon = 0;
      } else if (!g.loopEarly && toNext <= LOOP.window) {
        cue = coming = topNext ? CUES.up : CUES.down;
        soon = 0;
      } else if (!g.loopEarly && toNext <= G.lead) {
        coming = topNext ? CUES.up : CUES.down;
        soon = toNext / G.lead;
      }
    }
  } else if (g.tip === 0 && g.stall === 0 && g.stallLoad < SWING_GAUGE.stalling) {
    // Nothing to do but fly out of a tip, or let go of a brake near the stall.
    if (g.pitchRate < 0 && peak < -WATCH.surge) {
      // A surge heading for the fold: brake till it swings back, and before it peaks.
      cue = coming = CUES.catch;
      pitchPhase(g, swing);
      soon = clamp(swing.toPeak / G.lead, 0, 1);
    } else if (rolling) {
      // The swap: as the bank tops out, the turn the other way, unless it is already asked for;
      // foretold as the top comes. Told only for a top a wingover under way comes to: one swapped
      // into from the last top (the watch's `linking`), or, once it has come, linked to it.
      rollPhase(g, phase);
      const steep = Math.abs(phase.bank) >= (swapped ? WATCH.top : WATCH.wing);
      const near = steep && g.turn * Math.sign(phase.bank) >= 0 ? Math.sign(phase.bank) : 0;
      const gone = now - watch.topAt <= WATCH.late && watch.wingTop === 1 ? watch.topSide : 0;
      const ahead = phase.toPeak <= WATCH.early ? near : 0;
      const side = ahead || gone;
      if (side !== 0 && g.turn * side >= 0) {
        cue = side > 0 ? CUES.left : CUES.right;
        if (ahead !== 0 ? watch.linking === 1 : watch.chain >= 2) coming = cue;
        soon = 0;
      } else if (near !== 0 && phase.toPeak <= G.lead && watch.linking === 1) {
        coming = near > 0 ? CUES.left : CUES.right;
        soon = phase.toPeak / G.lead;
      }
    } else if (watch.pumping === 1) {
      // A swing being pumped bigger (the watch's `pumping`: not one the air or a wingover rocks, nor
      // one caught): press just after it peaks ahead, let go just after it peaks behind; foretold as
      // each peak comes.
      if (now - watch.frontAt <= WATCH.pump && now - watch.frontAt < now - watch.backAt && g.pitchRate > 0 && g.brake < BRAKE.light / 2) cue = CUES.press;
      else if (now - watch.backAt <= WATCH.pump && now - watch.backAt < now - watch.frontAt && g.pitchRate < 0 && g.brake > 0) cue = CUES.release;
      if (cue !== CUES.none) {
        coming = cue;
        soon = 0;
      } else {
        pitchPhase(g, swing);
        const ahead = g.pitchRate < 0;
        if (swing.toPeak <= G.lead && (ahead ? g.brake < BRAKE.light / 2 : g.brake > 0)) {
          coming = ahead ? CUES.press : CUES.release;
          soon = swing.toPeak / G.lead;
        }
      }
    }
  }
  const asked = coming !== CUES.none || Math.abs(peak) >= G.pitch || Math.abs(g.bank) >= G.bank || g.loop !== 0;
  out.left = asked ? G.linger : Math.max(0, (out.left ?? 0) - dt);
  out.on = out.left > 0;
  // Round a loop its ring; falling out of one, the bank it swings back with, and any fold it ended in.
  const round = g.loop !== 0 && !g.loopOut;
  out.mode = round ? 'loop' : rolling ? 'roll' : 'pitch';
  // Round a loop, the dot's step on its ring, the way the loop goes, from under the wing.
  const turned = round ? g.loopAngle / (2 * Math.PI) : 0;
  out.round = (((Math.round((turned - Math.floor(turned)) * LOOP_STEPS) % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS) * (round && g.loop < 0 ? -1 : 1);
  // A wingover under way, topping out past a loop's entry or just back from it: the brake there
  // loops it (flight.js `steepLeft`).
  out.loopable = g.loop === 0 && rolling && watch.linking === 1 && (g.steepLeft > 0 || Math.abs(phase.bank) >= LOOP.entry);
  out.cue = cue;
  out.coming = coming;
  out.soon = soon;
  out.x = Math.round(clamp(g.bank / G.side, -1, 1) * 100);
  out.y = g.pitch < 0 ? -Math.round(clamp(-g.pitch / G.ahead, 0, 1) * 67) : Math.round(clamp(g.pitch / G.behind, 0, 1) * 33);
  if (rolling) out.band = now - watch.topAt <= G.fresh ? bandOf(BANDS.roll, watch.top) : 0;
  else out.band = now - watch.frontAt <= G.fresh ? bandOf(BANDS.pitch, watch.front) : 0;
  const line = PITCH.line + PITCH.held * clamp(g.brake / BRAKE.light, 0, 1);
  out.safe = !folds;
  out.near = !!folds && g.loop === 0 && ((g.pitch < 0 && -g.pitch >= line - G.near) || Math.abs(g.bank) >= ROLL.limit - G.near);
  return out;
}
