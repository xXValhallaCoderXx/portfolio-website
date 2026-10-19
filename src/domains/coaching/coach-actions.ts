import type { DirectControlSummary, FlightInput } from '../flight/models.ts';
import type { CoachFields, CoachMessage, ControlName } from './models.ts';
// Semantic instructions shared by the coach, reference pilots and presentation.
import { summarizeControls } from '../flight/brake-controls.ts';
const controlNames = new Set(['left', 'right', 'brake', 'bar', 'ears']);
const defaults: Record<string, {title: string; hold: ControlName[]; release: ControlName[]}> = {
  left: { title: 'TURN LEFT', hold: ['left'], release: ['right'] },
  right: { title: 'TURN RIGHT', hold: ['right'], release: ['left'] },
  straight: { title: 'HOLD THIS LINE', hold: [], release: ['left', 'right'] },
  brake: { title: 'HOLD BRAKE', hold: ['brake'], release: ['bar'] },
  'deep-brake': { title: 'PULL DEEP BRAKE', hold: ['brake'], release: ['bar'] },
  'release-brake': { title: 'RELEASE BRAKE', hold: [], release: ['brake'] },
  'release-turns': { title: 'RELEASE TURN AND BAR', hold: [], release: ['left', 'right', 'bar'] },
  'release-all': { title: 'HANDS UP', hold: [], release: ['left', 'right', 'brake', 'bar', 'ears'] },
  'prepare-left': { title: 'GET READY LEFT', hold: [], release: [] },
  'prepare-right': { title: 'GET READY RIGHT', hold: [], release: [] },
  none: { title: '', hold: [], release: [] },
};
const controls = (names: readonly string[]): ControlName[] => [...new Set(names)].filter((name): name is ControlName => controlNames.has(name));
export const controlHeld = (input: FlightInput, name: string) => {
  if (input.controlMode === 'brakes') {
    const summary = summarizeControls(input);
    // A release instruction checks either hand, even though a bilateral catch requires both.
    return name === 'brake' ? summary.anyBrake : !!summary[name as ControlName];
  }
  return name === 'bar' ? !!(input.bar || input.left && input.right)
    : name === 'brake' ? !!(input.brake || input.deepBrake) : !!input[name as ControlName];
};

function directMessage(fields: CoachFields, input: FlightInput): CoachMessage {
  const summary = summarizeControls(input) as DirectControlSummary, action = fields.action ?? 'none';
  const base = defaults[action] ?? defaults.none;
  let hold = controls(fields.hold ?? base.hold), release = controls(fields.release ?? base.release);
  let brakeDepth = fields.brakeDepth ?? (action === 'deep-brake' ? 'deep' : undefined);
  const side = hold.includes('left') ? 'left' : hold.includes('right') ? 'right' : null;
  const thermal = fields.context === 'thermal';
  const easing = action === 'straight' && (hold.includes('brake') || fields.dragAction === 'ease');
  const easeSide = side && release.includes('brake');
  if (side) {
    hold = hold.filter(name => name !== 'brake');
    if (easeSide) { release = release.filter(name => name !== 'brake'); brakeDepth = 'working'; }
  } else if (easing) {
    if (!thermal) {
      hold = hold.filter(name => name !== 'brake');
      release = controls([...release, 'brake']);
    }
    brakeDepth = undefined;
  }
  const depth = side ? summary.maxBrake : summary.commonBrake;
  const requestedBrake = !!side && !!brakeDepth || hold.includes('brake');
  const deep = depth > 0.70;
  let title = fields.title ?? base.title, detail = fields.detail ?? '';
  if (side) {
    title = thermal ? `PULL DOWN + ${side.toUpperCase()} · CIRCLE`
      : `${easeSide ? 'EASE' : 'PULL'} ${side.toUpperCase()}${brakeDepth === 'deep' ? ' DEEP' : ''}${easeSide ? ' · KEEP THE TURN' : ' BRAKE'}`;
    detail = thermal ? `Drag down and ${side}; keep some brake on both. Follow the ravens in this direction.`
      : brakeDepth === 'deep' ? `Pull farther toward ${side} to build the swing. Follow the next release cue.`
        : `Pull toward ${side}; use a smaller pull for a gentler turn.`;
  } else if (easing) {
    title = thermal ? 'EASE SIDE PULL · KEEP BOTH BRAKES' : 'EASE THE PULL · WIDEN THE CIRCLE';
    detail = thermal ? 'Ease the side pull and keep a gentle downward pull on both brakes to widen the circle.'
      : 'Return the handle toward its origin, or release, to widen the circle. Follow the ravens when you pull again.';
  } else if (hold.includes('brake')) {
    title = brakeDepth === 'deep' ? 'PULL BOTH BRAKES DEEP' : deep ? 'EASE BOTH TO WORKING BRAKE' : 'PULL BOTH BRAKES';
    detail = brakeDepth === 'deep' ? 'Drag straight down into the deep range. Follow the release cue as the wing moves.'
      : deep ? 'Move toward the handle origin until both indicators return to the working range.'
        : 'Drag straight down into the working range so both brakes pull together.';
  } else if (release.includes('brake') || action === 'release-all' || action === 'release-turns') {
    title = 'HANDS UP · RELEASE THE PULL';
    detail = 'Release the mouse or lift your finger so both brakes come up. ' + detail;
  }
  if (requestedBrake && input.ears) {
    title = 'RELEASE EARS, THEN PULL';
    if (!release.includes('ears')) release.push('ears');
  }
  if (['recover', 'hazard'].includes(fields.state!)) {
    // Keep the physical phase and environmental warning; the drag instruction supplements it.
    if (fields.title && fields.state === 'hazard') title = fields.title;
    if (fields.detail && !detail.includes(fields.detail)) detail += ` ${fields.detail}`;
  }
  const releasing = release.filter(name => controlHeld(input, name));
  const held = hold.every(name => name === 'brake' ? summary.commonBrake >= (thermal && easing ? 0.10 : 0.5) : controlHeld(input, name));
  const differential = Math.abs(summary.rightBrake - summary.leftBrake);
  const correctDepth = thermal && (side || easing) ? summary.commonBrake >= 0.10 &&
    summary.maxBrake <= (easing ? 0.35 : 0.65) && (easing ? differential <= 0.08 : differential >= 0.15 && differential <= 0.45)
    : !requestedBrake || (brakeDepth === 'deep' ? depth > 0.70
      : side ? depth >= 0.15 && depth <= 0.45 : depth >= 0.5 && summary.maxBrake <= 0.70);
  return { ...fields, action, title, detail, hold, release, controlMode: 'brakes', brakeDepth,
    ...(easing ? { dragAction: 'ease' } : {}),
    accepted: releasing.length === 0 && held && correctDepth };
}

/** Keep the requested action separate from the player's current input and accepted state. */
export function actionMessage(fields: CoachFields, input: FlightInput = {}): CoachMessage {
  if (input.controlMode === 'brakes') return directMessage(fields, input);
  const action = fields.action ?? 'none';
  const brakeDepth = fields.brakeDepth ?? (action === 'deep-brake' ? 'deep' : undefined);
  const base = defaults[action] ?? defaults.none;
  const hold = controls(fields.hold ?? base.hold), release = controls(fields.release ?? base.release);
  if (hold.includes('brake') && input.ears && !release.includes('ears')) release.push('ears');
  if (release.includes('bar') && input.left && input.right) {
    for (const name of ['left', 'right'] as const) if (!hold.includes(name) && !release.includes(name)) release.push(name);
  }
  const releasing = release.filter(name => controlHeld(input, name));
  let title = fields.title ?? base.title, detail = fields.detail ?? '';
  if (hold.includes('brake') && input.ears) title = 'RELEASE EARS, THEN BRAKE';
  else if (brakeDepth === 'working' && input.deepBrake) title = 'RELEASE DEEP BRAKE, THEN BRAKE';
  else if (action === 'deep-brake') title = input.deepBrake ? 'HOLD DEEP BRAKE'
    : controlHeld(input, 'brake') ? 'RELEASE, THEN DEEP BRAKE' : fields.title ?? base.title;
  else if ((action === 'left' || action === 'right') && releasing.includes(action === 'left' ? 'right' : 'left')) {
    const opposite = action === 'left' ? 'right' : 'left';
    title = `RELEASE ${opposite.toUpperCase()}, THEN ${action.toUpperCase()}`;
  } else if (!fields.stableTitle && (action === 'left' || action === 'right') && input[action as ControlName]) {
    title = `HOLD ${action.toUpperCase()}`;
  } else if (!fields.stableTitle && action === 'straight' && releasing.length) title = 'RELEASE THE TURN';
  return { ...fields, action, title, detail, hold, release, ...(brakeDepth ? { brakeDepth } : {}),
    accepted: releasing.length === 0 && hold.every(name => controlHeld(input, name)) &&
      (brakeDepth !== 'deep' || !!input.deepBrake) && (brakeDepth !== 'working' || !input.deepBrake),
  };
}
