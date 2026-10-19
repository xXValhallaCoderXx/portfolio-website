import type { FlightInput } from '../flight/models.ts';
import type { CoachFields, CoachMessage } from './models.ts';
// Presentation policy for the fixed-step coach.
import { actionMessage } from './coach-actions.ts';

export const interruptsLift = (message: CoachFields | null): boolean => !!message && ['recover', 'descent', 'building', 'timing'].includes(message.state!);

export function resolveCoachMessage(primary: CoachMessage | null, options?: {warning?: {context: string; detail: string} | null; notice?: CoachFields | null}, input?: FlightInput): CoachMessage | null;
export function resolveCoachMessage(primary: CoachFields | null, options?: {warning?: {context: string; detail: string} | null; notice?: CoachFields | null}, input?: FlightInput): CoachFields | null;
export function resolveCoachMessage(primary: CoachFields | null, { warning = null, notice = null }: {warning?: {context: string; detail: string} | null; notice?: CoachFields | null} = {}, input: FlightInput = {}) {
  if (!primary) return warning ? actionMessage({ state: 'hazard', context: 'FLIGHT SAFETY',
    phase: 'warning', action: 'none', title: warning.context, detail: warning.detail, warning: true }, input) : null;
  if (warning) return { ...primary, warning: true, warningLabel: warning.context, feedback: warning.detail };
  return primary.activity && notice && !(primary.transfer && notice.state === 'plates') && !primary.feedback
    ? { ...primary, feedback: `${notice.title} · ${notice.detail}` } : primary;
}
