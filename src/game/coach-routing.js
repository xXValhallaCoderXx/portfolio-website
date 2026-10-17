// Presentation policy shared by the fixed-step coach and its legacy hint surface.
import { actionMessage } from './coach-actions.js';
import { urgentAirHint } from './wind-feedback.js';

export const interruptsLift = message => !!message && ['recover', 'descent', 'building', 'timing'].includes(message.state);

export function resolveCoachMessage(primary, { warning = null, notice = null } = {}, input = {}) {
  if (!primary) return warning ? actionMessage({ state: 'hazard', context: 'FLIGHT SAFETY',
    phase: 'warning', action: 'none', title: warning.context, detail: warning.detail, warning: true }, input) : null;
  if (warning) return { ...primary, warning: true, warningLabel: warning.context, feedback: warning.detail };
  return primary.activity && notice && !(primary.transfer && notice.state === 'plates') && !primary.feedback
    ? { ...primary, feedback: `${notice.title} · ${notice.detail}` } : primary;
}

/** Quiet travel never exposes the previous generation of lift/trick prompts underneath it. */
export function quietFlightHint(line = '', { inRun = false, coached = false } = {}) {
  if (coached) return '';
  // These two legacy urgent categories describe a source invitation or a reward, not danger.
  if (urgentAirHint(line) && !/^(turn [▶◀] now|Gjallarhorn)/.test(line)) return line;
  if (!inRun && /^(Good Lift →|through the arch:|flying itself to |the fog turns you back|hold (ears|E) to descend into the ring|lit pillars are places to land|(?:tap|click) a pillar for automatic travel)/.test(line)) return line;
  return '';
}
