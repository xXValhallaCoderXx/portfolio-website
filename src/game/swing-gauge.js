// Presentation reads physical angular motion and the maneuver observer; cues never drive flight.
import { WATCH, BANDS, bandOf } from './swing-watch.js';
import { WING } from './wing-envelope.js';
export const SWING_GAUGE = Object.freeze({ pitch: 0.35, bank: Math.PI / 4, linger: 1.5, ahead: 1.2, behind: 0.7, side: Math.PI, near: 0.1, fresh: 3, stalling: 0.65, lead: 0.6 });
export const CUES = Object.freeze({ none: 0, catch: 1, press: 2, release: 3, left: 4, right: 5, pump: 6, up: 7, down: 8 });
export const LOOP_STEPS = 72;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function swingGauge(g, watch, folds, dt, out, hands = {}) {
  let cue = CUES.none;
  let coming = CUES.none;
  let soon = 1;
  const roll = Math.abs(g.bank) > SWING_GAUGE.bank || watch.linking === 1;
  if (g.wingPhase === WING.entry || g.wingPhase === WING.stalled) {
    cue = coming = CUES.press; soon = 0;
  } else if (g.wingPhase === WING.backfly || g.wingPhase === WING.exit || g.tuck > 0) {
    cue = coming = CUES.release; soon = 0;
  } else if (hands.fold > 0) {
    const held = hands.fold > 0 ? hands.held : g.tuckHeld;
    cue = coming = held >= 0.3 - 1 / 120 ? CUES.release : CUES.pump;
    soon = cue === CUES.pump ? clamp(1 - (held || 0) / 0.3, 0, 1) : 0;
  } else if (g.stall > 0 || g.stallLoad > SWING_GAUGE.stalling) {
    cue = coming = CUES.release;
    soon = 0;
  } else if (g.loop !== 0) {
    // Inversion is a real orbit, not a sequence of prescribed key presses.
    soon = 0;
  } else if (g.pitch < -0.35 && g.pitchRate < -0.1) {
    cue = coming = CUES.catch;
    soon = 0;
  } else if (roll) {
    const rate = g.rollRate ?? 0;
    const accel = watch.rollAcceleration ?? 0;
    const time = rate * accel < 0 ? -rate / accel : Infinity;
    const justPeaked = watch.clock - watch.topAt <= WATCH.late;
    const side = justPeaked ? watch.topSide : Math.sign(g.bank);
    const useful = Math.abs(g.bank) >= WATCH.wing && (g.turn ?? 0) * side >= 0;
    if (useful && (time <= SWING_GAUGE.lead || justPeaked || Math.abs(rate) < 0.25)) {
      coming = side > 0 ? CUES.left : CUES.right;
      soon = justPeaked ? 0 : clamp(time / SWING_GAUGE.lead, 0, 1);
      if (justPeaked || time <= WATCH.early || Math.abs(rate) < 0.25) cue = coming;
    }
  } else if (watch.pumping === 1) {
    if (watch.clock - watch.frontAt <= WATCH.pump && !hands.brake) cue = coming = CUES.press;
    else if (watch.clock - watch.backAt <= WATCH.pump && hands.brake) cue = coming = CUES.release;
    if (cue) soon = 0;
  }
  const active = coming !== 0 || Math.abs(g.pitch) >= SWING_GAUGE.pitch || roll || g.loop !== 0;
  out.left = active ? SWING_GAUGE.linger : Math.max(0, (out.left ?? 0) - dt);
  out.on = out.left > 0;
  out.mode = g.loop !== 0 ? 'loop' : roll ? 'roll' : 'pitch';
  const angle = g.loopAngle || 0;
  out.round = Math.round(((angle / (2 * Math.PI)) % 1) * LOOP_STEPS);
  out.loopable = !g.loop && Math.abs(g.bank) > 1.15 && g.speed > 12;
  Object.assign(out, { cue, coming, soon });
  out.x = Math.round(clamp(g.bank / SWING_GAUGE.side, -1, 1) * 100);
  out.y = g.pitch < 0 ? -Math.round(clamp(-g.pitch / SWING_GAUGE.ahead, 0, 1) * 67) : Math.round(clamp(g.pitch / SWING_GAUGE.behind, 0, 1) * 33);
  out.band = roll ? bandOf(BANDS.roll, watch.top) : bandOf(BANDS.pitch, watch.front);
  out.safe = !folds;
  out.near = !!folds && (g.stallLoad > 0.5 || (Number.isFinite(g.tension) && g.tension < 60));
  return out;
}
