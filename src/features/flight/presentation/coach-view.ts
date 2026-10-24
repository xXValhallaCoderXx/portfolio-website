import type { CoachFields } from '../../../domains/coaching/models.ts';
import type { FlightInput } from '../../../domains/flight/models.ts';
import type { BrakeDevice } from '../../../domains/flight/brake-input.ts';
import { compactCoachCue } from './coach-cue.ts';
import { safetyAlertText } from './flight-message.ts';
import type { lessonStage } from './menu-model.ts';
import type { TrainingInputFeedback } from './training-input-feedback.ts';
// The coach only presents resolved instructions and raw held inputs. It never changes flight.
import { summarizeControls } from '../../../domains/flight/brake-controls.ts';

export interface CoachNode<T> {
  textContent: string | null; hidden: string | boolean; className: string;
  dataset: { [key: string]: string | undefined }; style: { transform: string };
  ownerDocument: { createElement(tag: string): T };
  append(...nodes: T[]): void; querySelector(selector: string): unknown;
  setAttribute(name: string, value: string): void; getAttribute(name: string): string | null;
}
type PresentedCoach = CoachFields & { canCancelLesson?: boolean; intentId?: string; acknowledged?: boolean };
export type CoachPresentation = 'lesson' | 'safety';
export function coachGesture(message: PresentedCoach | null, name: 'left' | 'right' | 'brake', advice: string, device: BrakeDevice, soften = false) {
  if (device === 'mouse') return soften ? 'ease toward center' : advice === 'release' ? name === 'brake' ? 'slide up / let go' : `ease ${name}` : name === 'brake' ? 'drag down' : `drag ${name}`;
  if (device === 'touch') return soften ? 'ease both handles up' : advice === 'release' ? name === 'brake' ? 'lift both thumbs' : `lift ${name} thumb` : name === 'brake' ? 'pull both handles down' : `pull ${name} handle down`;
  if (soften) return message?.context === 'thermal' && message?.dragAction === 'ease' ? 'W · gentle both brakes' : 'release Shift · keep Space';
  if (advice === 'release') return name === 'left' ? 'release A / ←' : name === 'right' ? 'release D / →' : 'release the keys';
  if (message?.context === 'thermal' && message?.dragAction === 'ease') return 'W · gentle both brakes';
  const targets = message?.brakeTargets;
  const thermalCircle = message?.context === 'thermal' &&
    (['circle', 'ease'].includes(message.phase ?? '') || message.hold?.includes('brake') || message.dragAction === 'ease');
  const left = targets?.left ?? 0, right = targets?.right ?? 0;
  if (name === 'brake') return Math.min(left, right) >= 0.95 || message?.brakeDepth === 'deep' ? 'Shift + Space'
    : thermalCircle || Math.min(left, right) > 0 && Math.min(left, right) <= 0.35 ? 'W · gentle both brakes' : 'Space · both brakes';
  const side = name === 'left' ? left : right, outside = name === 'left' ? right : left;
  const key = name === 'left' ? 'A / ←' : 'D / →';
  return side >= 0.95 ? `Shift + ${name === 'left' ? 'A' : 'D'}` : side > 0.70 ? `${name === 'left' ? 'Q' : 'E'} · swing brake`
    : outside > 0 || !targets && thermalCircle ? `${name === 'left' ? 'A' : 'D'} + W · circle` : key;
}
const clamp = (x: unknown) => Math.max(0, Math.min(1, typeof x === 'number' && Number.isFinite(x) ? x : 0));
const write = (node: { textContent: string | null }, value: string) => { if (node.textContent !== value) node.textContent = value; };
const attribute = (node: { getAttribute(name: string): string | null; setAttribute(name: string, value: string): void }, name: string, value: string) => { if (node.getAttribute(name) !== value) node.setAttribute(name, value); };
const hide = (node: { hidden: string | boolean }, value: boolean) => { if (node.hidden !== value) node.hidden = value; };

/** `now` is a presentation clock, injectable for announcement tests; no simulation clock advances. */
export function createCoachView<T extends CoachNode<T>>({ element, input = () => ({}), device = () => 'mouse', presentation = () => 'lesson', now = () => performance.now(), canAnnounce = () => true, brakeFeedback = () => null, lessonProgress = () => null }: { element: T; input?: () => FlightInput; device?: () => BrakeDevice; presentation?: () => CoachPresentation; now?: () => number; canAnnounce?: () => boolean; brakeFeedback?: () => Readonly<TrainingInputFeedback> | null; lessonProgress?: () => { stage: ReturnType<typeof lessonStage>; caption: string; value: number | null } | null }) {
  const query = (root: T, selector: string): T => { const node = root.querySelector(selector); if (!node) throw new Error(`Coach view is missing ${selector}`); return node as T; };
  const kicker = query(element, '.fj-coach-kicker');
  const symbol = element.querySelector('.fj-action-symbol') as T | null;
  const lessonHeader = element.querySelector('.fj-coach-lesson') as T | null;
  const warningStrip = element.querySelector('[data-coach="warning"]') as T | null;
  const action = query(element, '[data-coach="action"]');
  const reason = query(element, '[data-coach="reason"]');
  const cue = element.querySelector('[data-coach="cue"]') as T | null;
  const lesson = element.querySelector('[data-coach="lesson"]') as T | null;
  const stages = element.querySelector('[data-coach="stages"]') as T | null;
  const phaseLabel = element.querySelector('[data-coach="stage"]') as T | null;
  const brakePosition = element.querySelector('[data-coach="brake-position"]') as T | null;
  const pips: T[] = [];
  let phaseCount = 0;
  const controls = query(element, '[data-coach="controls"]');
  const feedback = query(element, '[data-coach="feedback"]');
  const acknowledgement = query(element, '[data-coach="acknowledgement"]');
  const progress = query(element, '[data-coach="progress"]');
  const progressLabel = query(progress, 'span');
  const progressFill = query(progress, 'i > b');
  const announce = query(element, '[data-coach="announce"]');
  const cancel = query(element, '[data-coach="cancel"]');
  const chips: { name: 'left' | 'right' | 'brake'; chip: T; label: T; gesture: T }[] = [];
  for (const name of ['left', 'right', 'brake'] as const) {
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

  function syncInputs(message: PresentedCoach | null, raw: FlightInput | undefined) {
    const hold = message?.hold ?? [], release = (message?.release ?? []).filter((name) => ['left', 'right', 'brake'].includes(name));
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
      const sideExplainsBoth = brake && message?.context === 'thermal' &&
        hold.some(name => name === 'left' || name === 'right') &&
        (hold.includes('brake') || message.brakeDepth === 'working' || ['circle', 'ease'].includes(message.phase ?? ''));
      const show = !!message && !sideExplainsBoth && (pressed || advice === 'hold' || (advice === 'release' && release.length === 1 && hold.length === 0));
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
        write(gesture, coachGesture(message, name, advice, device(), soften));
      }
    }
    const allReleased = !!message && !shown && !heldAny && release.length > 0;
    hide(released, !allReleased);
    const showControls = shown || allReleased;
    hide(controls, !showControls);
  }

  function update(message: PresentedCoach | null) {
    if (disposed) return;
    const format = presentation();
    if (element.dataset.presentation !== format) {
      reset();
      element.dataset.presentation = format;
      attribute(element, 'aria-label', format === 'safety' ? 'Flight safety' : 'Flight coach');
      if (symbol) write(symbol, format === 'safety' ? '⚠' : '◇');
    }
    if (format === 'safety') {
      updateSafety(message);
      return;
    }
    hide(kicker, false);
    if (lessonHeader) hide(lessonHeader, false);
    if (cue) hide(cue, false);
    syncInputs(message, input() ?? {});
    if (cancel) hide(cancel, !message?.canCancelLesson);
    if (!message) {
      if (visible) element.hidden = true;
      visible = false; semantic = pending = '';
      write(announce, '');
      write(acknowledgement, ''); hide(acknowledgement, true);
      element.dataset.brakeFeedback = acknowledgement.dataset.brakeFeedback = '';
      return;
    }
    if (!visible) { element.hidden = false; visible = true; }
    const activity = message.activity === 'ridge-soaring' ? 'RIDGE SOARING'
      : message.activity === 'thermalling' ? 'THERMALLING'
        : message.activity === 'soaring-turn' ? 'SOARING TURN' : '';
    const context = activity || message.heading || message.context || 'Flight coach', phase = message.phase || '';
    const title = message.title || '', detail = message.detail || '';
    const warningLabel = message.warning ? message.warningLabel || '' : '';
    const secondary = warningStrip && message.warning ? '' : [warningLabel, message.feedback || ''].filter(Boolean).join(' · ');
    if (warningStrip) {
      write(warningStrip, message.warning ? `⚠ ${warningLabel || 'FLIGHT SAFETY'}${message.feedback ? ` · ${message.feedback}` : ''}` : '');
      hide(warningStrip, !message.warning);
    }
    write(kicker, activity || (message.owner !== 'navigation' && phase && phase.toLowerCase() !== context.toLowerCase() ? `${context} · ${phase}` : context));
    const compact = compactCoachCue(message, input() ?? {}, device());
    const measured = lessonProgress();
    if (cue) write(cue, compact.cue);
    element.dataset.lesson = message.lessonId ?? '';
    if (lesson) write(lesson, message.lessonId ? message.lessonId === 'thermal' ? 'THERMAL CLIMB' : message.context ?? '' : '');
    if (phaseLabel) write(phaseLabel, measured ? `${Math.max(1, measured.stage.index + 1)}/${measured.stage.count}` : '');
    if (stages && measured) {
      const { index, count, label } = measured.stage;
      // Counts belong to the physical lesson phases; these pips are indicators, never controls.
      if (phaseCount !== count) {
        for (const pip of pips) hide(pip, true);
        while (pips.length < count) { const pip = element.ownerDocument.createElement('i'); stages.append(pip); pips.push(pip); }
        phaseCount = count;
      }
      pips.forEach((pip, n) => { hide(pip, n >= count); pip.dataset.phase = n < index ? 'done' : n === index ? 'active' : 'pending'; });
      attribute(stages, 'aria-label', `Phase ${Math.max(1, index + 1)} of ${count}: ${label}`);
    }
    if (brakePosition) {
      hide(brakePosition, compact.position === null || !message.lessonId);
      const label = brakePosition.querySelector('span') as T | null, bar = brakePosition.querySelector('i > b') as T | null;
      if (label) write(label, `BRAKE POSITION · ${Math.round((compact.position ?? 0) * 100)}% of target`);
      if (bar) bar.style.transform = `scaleX(${compact.position ?? 0})`;
    }
    write(action, title); write(reason, detail); hide(reason, !detail);
    const accepted = !!message.acknowledged && !!message.action && message.action !== 'none' &&
      !message.action.startsWith('prepare-') && !message.warning;
    const acceptance = message.action === 'release-all' || message.action === 'release-turns' || message.action === 'straight' && !message.hold?.length
      ? 'Good · keep this line' : 'Good · keep that pull';
    const position = message.lessonId === 'steering' && !message.warning ? brakeFeedback() : null;
    const positionVisible = !!position && position.status !== 'idle';
    element.dataset.brakeFeedback = acknowledgement.dataset.brakeFeedback = positionVisible ? position.status : '';
    write(acknowledgement, positionVisible ? position.label : message.lessonId && message.brakeTargets ? compact.callout : accepted ? acceptance : '');
    hide(acknowledgement, !!cue && !!message.lessonId && compact.status === 'pull' || !positionVisible && !accepted && !(message.lessonId && message.brakeTargets));
    write(feedback, secondary); hide(feedback, !secondary);
    const state = message.state || '';
    if (element.dataset.state !== state) element.dataset.state = state;
    const warning = String(!!message.warning);
    if (element.dataset.warning !== warning) element.dataset.warning = warning;
    const intent = message.action || 'none';
    if (element.dataset.action !== intent) element.dataset.action = intent;
    const measurement = lessonProgress();
    const caption = measurement?.caption || message.progressLabel || '';
    hide(progress, !caption);
    if (caption) {
      const value = clamp(measurement?.value ?? message.progress);
      // A duration-labelled steady-flight bar reports elapsed time, never an unlabeled percent.
      const duration = caption.match(/^(.*?)\s*·\s*(\d+(?:\.\d+)?)\s*s$/i);
      const seconds = duration ? Number(duration[2]) : 0;
      const measured = seconds > 0 ? `${duration![1]} · ${(value * seconds).toFixed(1)} / ${seconds.toFixed(1)} s` : caption;
      write(progressLabel, measured);
      attribute(progress, 'aria-label', measured);
      attribute(progress, 'aria-valuenow', String(Math.round(value * 100)));
      const transform = `scaleX(${value})`;
      if (fill !== transform) { progressFill.style.transform = transform; fill = transform; }
      if (measurement?.value === null) { hide(progressFill, true); attribute(progress, 'role', 'group'); }
      else { hide(progressFill, false); attribute(progress, 'role', 'progressbar'); }
    }
    // Acceptance, progress and preparation/hold wording are not new flying instructions.
    const identity = `${message.intentId || `${state}|${context}|${phase}|${intent}|${message.brakeDepth || ''}|${(message.hold ?? []).join(',')}|${(message.release ?? []).join(',')}`}|${message.warning ? warningLabel || 'warning' : ''}`;
    announceMessage(identity, `${context}. ${phase ? `${phase}. ` : ''}${title}${detail ? `. ${detail}` : ''}${message.warning ? `. ${[warningLabel, message.feedback || ''].filter(Boolean).join(' · ')}` : ''}`, !!message.warning || !!message.urgent);
  }

  function updateSafety(message: PresentedCoach | null) {
    if (!message) {
      if (visible || semantic || pending) reset();
      return;
    }
    hide(kicker, true);
    if (lessonHeader) hide(lessonHeader, true);
    if (cue) { write(cue, ''); hide(cue, true); }
    if (cancel) hide(cancel, true);
    syncInputs(null, {});
    for (const node of [reason, feedback, acknowledgement, progress]) hide(node, true);
    if (warningStrip) hide(warningStrip, true);
    if (brakePosition) hide(brakePosition, true);
    const text = safetyAlertText(message);
    write(action, text);
    element.dataset.state = message.state ?? '';
    element.dataset.action = message.action ?? 'none';
    element.dataset.warning = String(!!message.warning);
    if (!visible) { element.hidden = false; visible = true; }
    announceMessage(`safety|${text}`, text, true);
  }

  function announceMessage(identity: string, text: string, urgent: boolean) {
    if (identity !== semantic) { semantic = identity; pending = text; }
    const clock = now();
    if (!canAnnounce()) write(announce, '');
    if (pending && canAnnounce() && (urgent || clock - announcedAt >= 800)) {
      write(announce, pending); pending = ''; announcedAt = clock;
    }
  }

  function reset() {
    if (cancel) hide(cancel, true);
    element.hidden = true; visible = false; semantic = pending = ''; announcedAt = -Infinity;
    element.dataset.state = element.dataset.action = element.dataset.warning = '';
    element.dataset.lesson = '';
    element.dataset.brakeFeedback = acknowledgement.dataset.brakeFeedback = '';
    for (const node of [kicker, action, reason, feedback, acknowledgement, progressLabel, announce]) write(node, '');
    if (warningStrip) { write(warningStrip, ''); hide(warningStrip, true); }
    for (const node of [cue, lesson, phaseLabel]) if (node) write(node, '');
    if (lessonHeader) hide(lessonHeader, true);
    if (brakePosition) hide(brakePosition, true);
    for (const pip of pips) hide(pip, true);
    reason.hidden = feedback.hidden = acknowledgement.hidden = progress.hidden = controls.hidden = released.hidden = true;
    progressFill.style.transform = ''; fill = '';
    for (const { chip } of chips) chip.hidden = true;
  }
  function dispose() { if (disposed) return; reset(); disposed = true; }
  reset();
  return { update, reset, dispose };
}
