// Semantic instructions shared by the coach and its input highlights. Nothing here presses a key.
export const COACH_CONTROLS = Object.freeze({
  left: Object.freeze({ label: 'left', keyboard: '← / A', touch: '◀' }),
  right: Object.freeze({ label: 'right', keyboard: '→ / D', touch: '▶' }),
  brake: Object.freeze({ label: 'brake', keyboard: '↓ / Space', touch: '▼' }),
  bar: Object.freeze({ label: 'bar', keyboard: '↑ / W', touch: '▲' }),
  ears: Object.freeze({ label: 'ears', keyboard: 'E', touch: 'ears' }),
});
const defaults = {
  left: { title: 'TURN LEFT', hold: ['left'], release: ['right'] },
  right: { title: 'TURN RIGHT', hold: ['right'], release: ['left'] },
  straight: { title: 'HOLD THIS LINE', hold: [], release: ['left', 'right'] },
  brake: { title: 'HOLD BRAKE', hold: ['brake'], release: ['bar'] },
  'deep-brake': { title: 'DOUBLE-TAP + HOLD BRAKE', hold: ['brake'], release: ['bar'] },
  'release-brake': { title: 'RELEASE BRAKE', hold: [], release: ['brake'] },
  'release-turns': { title: 'RELEASE TURN AND BAR', hold: [], release: ['left', 'right', 'bar'] },
  'release-all': { title: 'HANDS UP', hold: [], release: ['left', 'right', 'brake', 'bar', 'ears'] },
  'prepare-left': { title: 'GET READY LEFT', hold: [], release: [] },
  'prepare-right': { title: 'GET READY RIGHT', hold: [], release: [] },
  none: { title: '', hold: [], release: [] },
};
const controls = (names) => [...new Set(names)].filter(name => Object.hasOwn(COACH_CONTROLS, name));
export const controlHeld = (input, name) => name === 'bar' ? !!(input.bar || input.left && input.right)
  : name === 'brake' ? !!(input.brake || input.deepBrake) : !!input[name];

/** Keep the requested action separate from the player's current input and accepted state. */
export function actionMessage(fields, input = {}) {
  const action = fields.action ?? 'none';
  const brakeDepth = fields.brakeDepth ?? (action === 'deep-brake' ? 'deep' : undefined);
  const base = defaults[action] ?? defaults.none;
  const hold = controls(fields.hold ?? base.hold), release = controls(fields.release ?? base.release);
  if (hold.includes('brake') && input.ears && !release.includes('ears')) release.push('ears');
  if (release.includes('bar') && input.left && input.right) {
    for (const name of ['left', 'right']) if (!hold.includes(name) && !release.includes(name)) release.push(name);
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
  } else if ((action === 'left' || action === 'right') && input[action]) {
    title = `HOLD ${action.toUpperCase()}`;
  } else if (action === 'straight' && releasing.length) title = 'RELEASE THE TURN';
  return { ...fields, action, title, detail, hold, release, ...(brakeDepth ? { brakeDepth } : {}),
    accepted: releasing.length === 0 && hold.every(name => controlHeld(input, name)) &&
      (brakeDepth !== 'deep' || !!input.deepBrake) && (brakeDepth !== 'working' || !input.deepBrake),
  };
}
