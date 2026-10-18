// Presentation policy for the fixed-step coach.
import { actionMessage } from './coach-actions.js';

export const interruptsLift = message => !!message && ['recover', 'descent', 'building', 'timing'].includes(message.state);

export function resolveCoachMessage(primary, { warning = null, notice = null } = {}, input = {}) {
  if (!primary) return warning ? actionMessage({ state: 'hazard', context: 'FLIGHT SAFETY',
    phase: 'warning', action: 'none', title: warning.context, detail: warning.detail, warning: true }, input) : null;
  if (warning) return { ...primary, warning: true, warningLabel: warning.context, feedback: warning.detail };
  return primary.activity && notice && !(primary.transfer && notice.state === 'plates') && !primary.feedback
    ? { ...primary, feedback: `${notice.title} · ${notice.detail}` } : primary;
}
