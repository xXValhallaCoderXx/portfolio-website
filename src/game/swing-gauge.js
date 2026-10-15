// The swing gauge: where the wing is over the pilot, as the pilot would see it, and the moment to
// act. A dot moves across a cross, up for the wing ahead and down for behind, left and right with
// the bank; ticks mark the bands a trick is judged in (swing-watch.js BANDS), and red ends the folds
// the wing can come to, where it can come to them. As a moment comes the dot lights up with what to
// do: brake to catch a surge, press or let go to pitch the swing bigger, swap the turn as a
// wingover tops out. Worked out here without a page, so it can be tested, and kept small: the fjord
// shows it too.
import { BRAKE, PITCH, ROLL, pitchPeak, pitchPhase, rollPhase } from './flight.js';
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

// The moments to act, as the gauge names them.
export const CUES = Object.freeze({ none: 0, catch: 1, press: 2, release: 3, left: 4, right: 5 });

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
// Where a wingover's swing will next top out, and the swing fore and aft next turn, worked out once
// a frame into these.
const phase = { toPeak: Infinity, bank: 0, size: 0 };
const swing = { toPeak: Infinity, peak: 0, toLine: Infinity };

/**
 * Writes what the gauge shows into `out` for the wing `g` (flight.js) and its watch's `watch`
 * (swing-watch.js state), `folds` saying whether the wing can fold here (high in a run) and `dt`
 * the seconds since the last frame:
 *
 *   on      whether it is up
 *   mode    'pitch' or 'roll': the arm that counts
 *   x, y    where the dot is: x from -100 (all the way left) to 100, y from -67 (as far ahead as the
 *           arm reaches) to 33 (as far behind), in whole steps
 *   cue     the moment to act (CUES), shown on the gauge
 *   coming  the moment to act that is coming or has come (CUES), and `soon`, how soon: from 1, `lead`
 *           seconds off or more, to 0 as it comes, and 0 while it lasts; for a catch, how soon the
 *           surge peaks, which it must be braked before. Only this is told aloud and by the wing:
 *           a swap only once a wingover is under way, so the first top after a reversal, which a
 *           circle turned the other way or a dodge makes too, shows its swap on the gauge alone
 *   band    the band the last peak reached, 0 to 4, while it is fresh
 *   near    the wing is within `near` of a fold it can come to
 *   safe    nothing it does here folds it: no red ends
 *   left    seconds it stays up for
 *
 * Keeps nothing of its own but `out`, and makes nothing.
 */
export function swingGauge(g, watch, folds, dt, out) {
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
  // Nothing to do but fly out of a fold or a stall, or let go of a brake near the stall.
  if (g.tuck === 0 && g.tip === 0 && g.stall === 0 && g.stallLoad < SWING_GAUGE.stalling) {
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
  const asked = coming !== CUES.none || Math.abs(peak) >= G.pitch || Math.abs(g.bank) >= G.bank;
  out.left = asked ? G.linger : Math.max(0, (out.left ?? 0) - dt);
  out.on = out.left > 0;
  out.mode = rolling ? 'roll' : 'pitch';
  out.cue = cue;
  out.coming = coming;
  out.soon = soon;
  out.x = Math.round(clamp(g.bank / G.side, -1, 1) * 100);
  out.y = g.pitch < 0 ? -Math.round(clamp(-g.pitch / G.ahead, 0, 1) * 67) : Math.round(clamp(g.pitch / G.behind, 0, 1) * 33);
  if (rolling) out.band = now - watch.topAt <= G.fresh ? bandOf(BANDS.roll, watch.top) : 0;
  else out.band = now - watch.frontAt <= G.fresh ? bandOf(BANDS.pitch, watch.front) : 0;
  const line = PITCH.line + PITCH.held * clamp(g.brake / BRAKE.light, 0, 1);
  out.safe = !folds;
  out.near = !!folds && ((g.pitch < 0 && -g.pitch >= line - G.near) || Math.abs(g.bank) >= ROLL.limit - G.near);
  return out;
}
