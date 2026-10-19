// The coach only presents resolved instructions and raw held inputs. It never changes flight.
import { summarizeControls } from './brake-controls.js';

const clamp = (x) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const write = (node, value) => { if (node.textContent !== value) node.textContent = value; };
const attribute = (node, name, value) => { if (node.getAttribute(name) !== value) node.setAttribute(name, value); };
const hide = (node, value) => { if (node.hidden !== value) node.hidden = value; };

/** `now` is a presentation clock, injectable for announcement tests; no simulation clock advances. */
export function createCoachView({ element, input = () => ({}), now = () => performance.now() }) {
  const kicker = element.querySelector('.fj-coach-kicker');
  const action = element.querySelector('[data-coach="action"]');
  const reason = element.querySelector('[data-coach="reason"]');
  const controls = element.querySelector('[data-coach="controls"]');
  const feedback = element.querySelector('[data-coach="feedback"]');
  const progress = element.querySelector('[data-coach="progress"]');
  const progressLabel = progress.querySelector('span');
  const progressFill = progress.querySelector('i > b');
  const announce = element.querySelector('[data-coach="announce"]');
  const cancel = element.querySelector('[data-coach="cancel"]');
  const chips = [];
  for (const name of ['left', 'right', 'brake']) {
    const chip = element.ownerDocument.createElement('span');
    const label = element.ownerDocument.createElement('span');
    const gesture = element.ownerDocument.createElement('span');
    chip.className = 'fj-coach-control';
    chip.dataset.control = name;
    chip.hidden = true;
    gesture.className = 'fj-coach-gesture';
    chip.append(label, gesture);
    controls.append(chip);
    chips.push({ name, chip, label, gesture });
  }
  const released = element.ownerDocument.createElement('span');
  released.className = 'fj-coach-released'; released.hidden = true;
  released.textContent = 'Hands up'; controls.append(released);
  attribute(progress, 'role', 'progressbar');
  attribute(progress, 'aria-valuemin', '0'); attribute(progress, 'aria-valuemax', '100');
  let disposed = false, visible = false, semantic = '', pending = '', announcedAt = -Infinity;
  let fill = '';

  function syncInputs(message, raw) {
    const hold = message?.hold ?? [], release = (message?.release ?? []).filter(name => ['left', 'right', 'brake'].includes(name));
    const effective = summarizeControls({ ...raw, controlMode: 'brakes' });
    let shown = false, heldAny = false;
    for (const item of chips) {
      const { name, chip, label, gesture } = item;
      const brake = name === 'brake';
      const pressed = brake ? effective.commonBrake > 0.04 || release.includes('brake') && effective.anyBrake : effective[name];
      const deep = brake && effective.deepBrake;
      const requestedDepth = brake && hold.includes('brake') ? message?.brakeDepth ?? (message?.action === 'deep-brake' ? 'deep' : '') : '';
      const deepen = requestedDepth === 'deep' && !deep;
      const soften = requestedDepth === 'working' && effective.maxBrake > 0.70;
      const advice = soften ? 'release' : hold.includes(name) ? 'hold' : release.includes(name) ? 'release' : '';
      const show = !!message && (pressed || advice === 'hold' || (advice === 'release' && release.length === 1));
      hide(chip, !show);
      shown ||= show; heldAny ||= pressed;
      if (chip.dataset.advice !== advice) chip.dataset.advice = advice;
      if (chip.dataset.held !== String(pressed)) chip.dataset.held = String(pressed);
      if (show) {
        const nameLabel = brake ? effective.commonBrake > 0.04 ? deep ? 'both deep brakes' : 'both brakes' : 'the pull' : `${name} brake`;
        const text = soften ? 'Ease the pull to working range'
          : deepen ? 'Pull both brakes deeper'
            : advice === 'release' ? pressed ? `Release ${nameLabel}` : `${nameLabel} released`
              : name === 'left' || name === 'right' ? `${pressed ? 'Pulling' : 'Pull'} ${name} brake`
                : `${pressed ? 'Holding' : 'Pull'} ${nameLabel}`;
        write(label, text);
        write(gesture, soften ? 'ease toward center' : advice === 'release' ? brake ? 'slide up / let go' : `ease ${name}`
          : brake ? 'drag down' : `drag ${name}`);
      }
    }
    const allReleased = !!message && !shown && !heldAny && release.length > 0;
    hide(released, !allReleased);
    const showControls = shown || allReleased;
    hide(controls, !showControls);
  }

  function update(message) {
    if (disposed) return;
    syncInputs(message, input() ?? {});
    if (cancel) hide(cancel, !message?.canCancelLesson);
    if (!message) {
      if (visible) element.hidden = true;
      visible = false; semantic = pending = '';
      write(announce, '');
      return;
    }
    if (!visible) { element.hidden = false; visible = true; }
    const activity = message.activity === 'ridge-soaring' ? 'RIDGE SOARING'
      : message.activity === 'thermalling' ? 'THERMALLING'
        : message.activity === 'soaring-turn' ? 'SOARING TURN' : '';
    const context = activity || message.heading || message.context || 'Flight coach', phase = message.phase || '';
    const title = message.title || '', detail = message.detail || '';
    const warningLabel = message.warning ? message.warningLabel || '' : '';
    const secondary = [warningLabel, message.feedback || ''].filter(Boolean).join(' · ');
    write(kicker, activity || (phase ? `${context} · ${phase}` : context));
    write(action, title); write(reason, detail); hide(reason, !detail);
    write(feedback, secondary); hide(feedback, !secondary);
    const state = message.state || '';
    if (element.dataset.state !== state) element.dataset.state = state;
    const warning = String(!!message.warning);
    if (element.dataset.warning !== warning) element.dataset.warning = warning;
    const intent = message.action || 'none';
    if (element.dataset.action !== intent) element.dataset.action = intent;
    const caption = message.progressLabel || '';
    hide(progress, !caption);
    if (caption) {
      const value = clamp(message.progress);
      // A duration-labelled steady-flight bar reports elapsed time, never an unlabeled percent.
      const duration = caption.match(/^(.*?)\s*·\s*(\d+(?:\.\d+)?)\s*s$/i);
      const seconds = duration ? Number(duration[2]) : 0;
      const measured = seconds > 0 ? `${duration[1]} · ${(value * seconds).toFixed(1)} / ${seconds.toFixed(1)} s` : caption;
      write(progressLabel, measured);
      attribute(progress, 'aria-label', measured);
      attribute(progress, 'aria-valuenow', String(Math.round(value * 100)));
      const transform = `scaleX(${value})`;
      if (fill !== transform) { progressFill.style.transform = transform; fill = transform; }
    }
    // Raw held states can change the visual title, but only a different resolved instruction is
    // announced. Numeric progress and strength never enter this identity.
    const identity = `${state}|${context}|${phase}|${intent}|${message.brakeDepth || ''}|${(message.hold ?? []).join(',')}|${(message.release ?? []).join(',')}|${message.warning ? warningLabel || 'warning' : ''}`;
    if (identity !== semantic) {
      semantic = identity;
      pending = `${context}. ${phase ? `${phase}. ` : ''}${title}${detail ? `. ${detail}` : ''}${message.warning && secondary ? `. ${secondary}` : ''}`;
    }
    const clock = now();
    const urgent = !!message.warning || state === 'recover' || state === 'hazard' || state === 'timing';
    if (pending && (urgent || clock - announcedAt >= 800)) {
      write(announce, pending); pending = ''; announcedAt = clock;
    }
  }

  function reset() {
    if (cancel) hide(cancel, true);
    element.hidden = true; visible = false; semantic = pending = ''; announcedAt = -Infinity;
    element.dataset.state = element.dataset.action = element.dataset.warning = '';
    for (const node of [kicker, action, reason, feedback, progressLabel, announce]) write(node, '');
    reason.hidden = feedback.hidden = progress.hidden = controls.hidden = released.hidden = true;
    progressFill.style.transform = ''; fill = '';
    for (const { chip } of chips) chip.hidden = true;
  }
  function dispose() { if (disposed) return; reset(); disposed = true; }
  reset();
  return { update, reset, dispose };
}
