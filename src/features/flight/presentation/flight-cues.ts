import type { CoachFields } from '../../../domains/coaching/models.ts';
import type { FlightInput } from '../../../domains/flight/models.ts';
import type { RenderedFlight } from './flight-view.ts';
import type { createBrakeDrag } from '../../../domains/flight/brake-drag.ts';
// Presentation only: reads snapshots, resolved coach messages and pointer intent. No flight,
// coach, input or recording clock is advanced here. All retained vectors/DOM nodes are bounded.
import { PerspectiveCamera, Vector3 } from 'three';
import { BRAKE_DRAG, dragBrakes } from '../../../domains/flight/brake-drag.ts';
import { BRAKE_CONTROLS, brakeByte } from '../../../domains/flight/brake-controls.ts';
import { actionMessage } from '../../../domains/coaching/coach-actions.ts';

export interface CuePoint { dx: number; dy: number }
export interface CueBounds { left: number; right: number; top: number; bottom: number }
export interface ControlLayout extends CueBounds { x: number; y: number; travel: number }
export interface CoachTarget extends CuePoint { leftBrake: number; rightBrake: number; handsUp: boolean; accepted: boolean }
export interface CueFacts { blocked: boolean; noseYaw: number; forwardAirspeed: number; stall: number; collapse: number; inverted: boolean; recovering: boolean; wingPhase: string }
type CuePose = Pick<RenderedFlight, 'pilot' | 'motion'>;
type CueMessage = CoachFields & { controlMode?: 'legacy' | 'brakes' };
type DragIntent = ReturnType<typeof createBrakeDrag>['state'];
const emptyBounds = (): CueBounds => ({ left: 0, right: 0, top: 0, bottom: 0 });
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
export const dragTravel = (type: string): number => type === 'mouse' ? BRAKE_DRAG.mouseTravel : BRAKE_DRAG.touchTravel;
export const cueBrake = (value: number): number => brakeByte(value) / 255;
export const brakeDistance = (value: number): number => value > 0 ? BRAKE_DRAG.deadzone + (1 - BRAKE_DRAG.deadzone) * value : 0;
const upperTravel = (travel: number): number => travel * 0.6;
const handsUpY = (travel: number): number => -travel * 0.3;

// Clip the kite at a maximum hand demand. Its upper centre is genuinely hands up:
// both drag equations are below their dead zone throughout this polygon.
export function brakeRegionPoints(depth: number, pointerType = 'mouse') {
  const T = dragTravel(pointerType), U = upperTravel(T);
  const distance = (BRAKE_DRAG.deadzone + (1 - BRAKE_DRAG.deadzone) * depth) * T;
  const x = (U + distance) / (1 + U / T), y = distance - x;
  return [{ x: 0, y: -U }, { x, y }, { x: 0, y: distance }, { x: -x, y }];
}

export function dragCuePoint(dx: number, dy: number, pointerType = 'mouse', output: Partial<CuePoint> = {}): CuePoint {
  const out = output as CuePoint;
  const T = dragTravel(pointerType), length = Math.abs(dx) / T + Math.abs(dy) / (dy < 0 ? upperTravel(T) : T);
  if (length > 1) {
    const { leftBrake, rightBrake } = dragBrakes(dx, dy, pointerType);
    if (leftBrake && rightBrake) return brakeDragPoint(leftBrake, rightBrake, pointerType, out);
    if (leftBrake || rightBrake) {
      // Slide a one-hand pull along its demand contour onto the kite. Radial clipping near
      // the upper corners could incorrectly draw a small live pull inside the neutral zone.
      const distance = brakeDistance(Math.max(leftBrake, rightBrake)) * T, U = upperTravel(T);
      const x = Math.min(Math.abs(dx), (U + distance) / (1 + U / T));
      out.dx = leftBrake ? -x : x; out.dy = distance - x;
      return out;
    }
  }
  const scale = 1 / Math.max(1, length);
  out.dx = dx * scale; out.dy = dy * scale;
  return out;
}

export function brakeDragPoint(leftBrake: number, rightBrake: number, pointerType = 'mouse', output: Partial<CuePoint> = {}): CuePoint {
  const out = output as CuePoint;
  const travel = dragTravel(pointerType), left = brakeDistance(leftBrake) * travel, right = brakeDistance(rightBrake) * travel;
  // A single-hand suggestion follows the ordinary horizontal pull. Bilateral pulls solve both
  // demand equations, including the dead zone. Zero has many inverses, including the origin.
  out.dx = leftBrake === 0 ? right : rightBrake === 0 ? -left : (right - left) / 2;
  out.dy = leftBrake === 0 || rightBrake === 0 ? 0 : (right + left) / 2;
  return out;
}

export function coachDragTarget(message: CueMessage | null, pointerType = 'mouse', input: FlightInput = {}, output: Partial<CoachTarget> = {}): CoachTarget | null {
  const out = output as CoachTarget;
  if (!message || message.controlMode !== 'brakes' || message.warning || message.urgent || message.transfer ||
      message.heading === 'NEXT LIFT' || ['recover', 'hazard', 'descent', 'lee'].includes(message.state ?? '') ||
      ['approach', 'align', 'prepare', 'blocked', 'warning', 'recovery'].includes(message.phase ?? '')) return null;
  const hold = message.hold ?? [], release = message.release ?? [], action = message.action ?? '';
  if (hold.includes('bar') || hold.includes('ears') || ['bar', 'ears', 'none', 'prepare-left', 'prepare-right'].includes(action) || input.ears || input.bar) return null;
  let left = 0, right = 0, handsUp = false;
  if (message.context === 'thermal' && message.phase === 'circle' && ['left', 'right'].includes(action)) {
    left = action === 'left' ? 0.50 : 0.20; right = action === 'right' ? 0.50 : 0.20;
  } else if (message.context === 'thermal' && action === 'straight' && message.dragAction === 'ease') {
    left = right = 0.20;
  } else if (['left', 'right'].includes(action) && message.context !== 'thermal') {
    left = action === 'left' ? 0.20 : 0; right = action === 'right' ? 0.20 : 0;
  } else if (['brake', 'deep-brake'].includes(action) && hold.includes('brake')) {
    left = right = message.brakeDepth === 'deep' ? 1 : BRAKE_CONTROLS.working;
  } else if (['release-all', 'release-brake', 'release-turns'].includes(action) ||
      action === 'straight' && !hold.length && release.includes('brake')) handsUp = true;
  else return null;
  left = cueBrake(left); right = cueBrake(right);
  const suggested: FlightInput = { controlMode: 'brakes', leftBrake: left, rightBrake: right, bar: false, ears: false };
  // The real coach remains the authority, including any extra hold/release constraints.
  if (!actionMessage(message, suggested).accepted) return null;
  brakeDragPoint(left, right, pointerType, out);
  if (handsUp) out.dy = handsUpY(dragTravel(pointerType));
  out.leftBrake = left; out.rightBrake = right; out.handsUp = handsUp;
  out.accepted = actionMessage(message, { ...input, controlMode: 'brakes',
    leftBrake: cueBrake(input.leftBrake ?? 0), rightBrake: cueBrake(input.rightBrake ?? 0) }).accepted;
  return out;
}

export function groundTurn(motion: RenderedFlight['motion']) {
  const { from, to, seconds, discontinuity } = motion;
  if (discontinuity || !(seconds > 0) || Math.hypot(from.x, from.z) < 2 || Math.hypot(to.x, to.z) < 2) return 0;
  return Math.atan2(from.x * to.z - from.z * to.x, from.x * to.x + from.z * to.z) / seconds;
}

export function createTravelCue() {
  let ready = false, heading = 0, turn = 0;
  const world = new Vector3(), projected = new Vector3();
  const result = { x: 0, y: 0, heading: 0, turn: 0, world };
  function reset() { ready = false; heading = turn = 0; }
  return { reset, sample(pose: CuePose | null, facts: CueFacts, camera: PerspectiveCamera, width: number, height: number, dt: number, reducedMotion = false) {
    const velocity = pose?.pilot.vel, speed = velocity ? Math.hypot(velocity.x, velocity.z) : 0;
    const reverse = velocity && velocity.x * Math.sin(facts.noseYaw) - velocity.z * Math.cos(facts.noseYaw) <= 0;
    if (!pose || facts.blocked || speed < 2 || !Number.isFinite(speed) || reverse || facts.forwardAirspeed <= 0 ||
        facts.stall > 0 || facts.collapse > 0 || facts.inverted || facts.recovering ||
        facts.wingPhase && facts.wingPhase !== 'flying') { reset(); return null; }
    const next = Math.atan2(velocity!.x, -velocity!.z), rate = groundTurn(pose.motion);
    const mix = reducedMotion || !ready || pose.motion.discontinuity ? 1 : 1 - Math.exp(-Math.max(0, dt) / 0.12);
    heading = wrap(heading + wrap(next - heading) * mix); turn += (rate - turn) * mix; ready = true;
    world.set(pose.pilot.pos.x + Math.sin(heading) * 12, pose.pilot.pos.y, pose.pilot.pos.z - Math.cos(heading) * 12);
    camera.updateMatrixWorld();
    projected.copy(world).applyMatrix4(camera.matrixWorldInverse);
    if (projected.z >= -camera.near) return null;
    projected.copy(world).project(camera);
    if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || Math.abs(projected.z) > 1) return null;
    result.x = (projected.x + 1) * width / 2; result.y = (1 - projected.y) * height / 2;
    result.heading = heading; result.turn = turn;
    return result;
  } };
}

export const overlapsCue = (a: CueBounds, b: CueBounds, gap = 6) => a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;

export function flightControlLayout(safe: CueBounds, output: Partial<ControlLayout> = {}): ControlLayout {
  const out = output as ControlLayout;
  const width = safe.right - safe.left, height = safe.bottom - safe.top;
  const compact = width > height && height <= 500;
  const travel = Math.max(0, Math.min(compact ? 60 : BRAKE_DRAG.touchTravel, (width - 44) / 2, (height - 52) / 1.6));
  const half = travel + 22, top = upperTravel(travel) + 28, bottom = travel + 24;
  // Only the viewport determines this anchor. Pointer origins, input device and coach messages
  // cannot move it; raw gesture coordinates continue to belong exclusively to the input adapter.
  const x = safe.left + width / 2;
  const y = clamp(safe.top + height * (width <= 560 ? 0.80 : 0.76), safe.top + top, safe.bottom - bottom);
  Object.assign(out, { x, y, travel, left: x - half, right: x + half, top: y - top, bottom: y + bottom });
  return out;
}

const markup = `<div class="fj-cue-safe"></div>
  <div class="fj-travel" hidden><i></i><span>TRAVEL</span><div class="fj-travel-turn" hidden>
    <svg viewBox="-22 -14 44 28"><path d="M-17 8 Q-3-14 17 2 M9 1 L17 2 L15-6"/></svg><small></small></div></div>
  <span class="fj-hands-up" hidden>HANDS UP</span>
  <svg class="fj-brake-drag" hidden><path class="fj-drag-frame"/><path class="fj-drag-neutral"/><path class="fj-drag-gentle" fill-rule="evenodd"/><path class="fj-drag-deep" fill-rule="evenodd"/>
    <text data-drag="hands-up" text-anchor="middle">HANDS UP</text><text data-drag="release" text-anchor="middle">release / slide up</text>
    <path class="fj-drag-guide"/><text data-drag="left" text-anchor="middle">LEFT</text><text data-drag="right" text-anchor="middle">RIGHT</text>
    <text data-drag="down" text-anchor="middle">DOWN</text><text data-drag="gentle" text-anchor="middle">GENTLE</text><text data-drag="deep" text-anchor="middle">DEEP</text>
    <line class="fj-drag-line" x1="0" y1="0"/><circle class="fj-drag-origin" r="7"/><circle class="fj-drag-center" r="2"/>
    <g class="fj-drag-target" hidden><circle r="10"/><path d="M-14 0H-11 M11 0H14 M0-14V-11 M0 11V14"/></g>
    <circle class="fj-drag-dot" r="5"/></svg>`;

export function createFlightCues({ element, stage, camera, reducedMotion = () => false }: { element: HTMLElement; stage: HTMLElement; camera: PerspectiveCamera; reducedMotion?: () => boolean }) {
  element.innerHTML = markup;
  const find = (selector: string): HTMLElement => { const found = element.querySelector<HTMLElement>(selector); if (!found) throw new Error(`Flight cue is missing ${selector}`); return found; };
  const travel = find('.fj-travel'), turn = find('.fj-travel-turn');
  const drag = find('.fj-brake-drag'), line = find('.fj-drag-line'), dot = find('.fj-drag-dot'), target = find('.fj-drag-target');
  const handsUp = find('.fj-hands-up');
  const motion = createTravelCue(), layout: ControlLayout = { ...emptyBounds(), x: 0, y: 0, travel: 0 }, suggestion: CoachTarget = { dx: 0, dy: 0, leftBrake: 0, rightBrake: 0, handsUp: false, accepted: false }, live: CuePoint = { dx: 0, dy: 0 }, markerBox = emptyBounds(), targetBox = emptyBounds();
  const obstacles: CueBounds[] = [];
  const exclusions = '.fj-hud > dl, .fj-hud nav, .fj-coach, .fj-lights, .fj-gauge, .fj-cue, .fj-hint, .fj-toasts > *, .fj-title, .fj-style';
  let size = 0, displayed = false, releasedFor = 0;
  const attr = (node: Element, name: string, value: string|number) => { const text = String(value); if (node.getAttribute(name) !== text) node.setAttribute(name, text); };
  const hide = (node: Element, value: boolean) => node.toggleAttribute('hidden', value);
  function hideDrag() { hide(drag, true); hide(target, true); }
  function clearDrag({ confirm = false } = {}) {
    releasedFor = confirm && displayed ? 0.65 : 0;
    displayed = false; handsUp.hidden = true; hide(target, true);
    attr(dot, 'cx', 0); attr(dot, 'cy', 0); attr(line, 'x2', 0); attr(line, 'y2', 0);
    drag.dataset.depth = 'released'; drag.dataset.active = 'false';
  }
  function reset() { motion.reset(); travel.hidden = true; clearDrag(); hideDrag(); }
  function update({ pose, facts, drag: intent, message, input, dt }: { pose: CuePose | null; facts: CueFacts; drag: DragIntent; message: CueMessage | null; input: FlightInput; dt: number }) {
    if (facts.blocked) { reset(); return; }
    const box = stage.getBoundingClientRect(), width = box.width, height = box.height;
    const safeBox = find('.fj-cue-safe').getBoundingClientRect();
    const safe = { left: safeBox.left - box.left, right: safeBox.right - box.left, top: safeBox.top - box.top, bottom: safeBox.bottom - box.top };
    flightControlLayout(safe, layout);
    if (!layout.travel) { reset(); return; }
    obstacles.length = 0;
    for (const node of stage.querySelectorAll(exclusions)) {
      const rect = node.getBoundingClientRect();
      // Clipped one-pixel live regions announce warnings but reserve no visible screen space.
      if (rect.width > 1 && rect.height > 1) obstacles.push({ left: rect.left - box.left, right: rect.right - box.left, top: rect.top - box.top, bottom: rect.bottom - box.top });
    }
    hideDrag(); handsUp.hidden = true;
    releasedFor = Math.max(0, releasedFor - Math.max(0, dt));
    if (!intent.active && input.controlMode === 'brakes' && releasedFor > 0 && !message?.warning) {
      const x = layout.x, y = layout.y + handsUpY(layout.travel);
      Object.assign(targetBox, { left: x - 44, right: x + 44, top: y - 14, bottom: y + 14 });
      if (targetBox.left >= safe.left && targetBox.right <= safe.right && targetBox.top >= safe.top && targetBox.bottom <= safe.bottom && !obstacles.some(rect => overlapsCue(targetBox, rect))) {
        handsUp.style.left = `${x}px`; handsUp.style.top = `${y}px`; handsUp.hidden = false;
        obstacles.push({ ...targetBox });
      }
    }
    {
      const active = intent.active && input.controlMode === 'brakes';
      if (active) releasedFor = 0;
      const T = layout.travel, U = upperTravel(T), top = U + 28;
      if (size !== T) {
        size = T;
        attr(drag, 'viewBox', `${-T - 22} ${-top} ${2 * T + 44} ${top + T + 24}`);
        drag.style.width = `${2 * T + 44}px`; drag.style.height = `${top + T + 24}px`;
        const points = (depth: number) => brakeRegionPoints(depth, 'touch').map(({ x, y }) => ({ x: x * T / BRAKE_DRAG.touchTravel, y: y * T / BRAKE_DRAG.touchTravel }));
        const path = (vertices: { x: number; y: number }[]) => vertices.map(({ x, y }, i) => `${i ? 'L' : 'M'}${x} ${y}`).join('') + 'Z';
        const neutral = path(points(0)), working = path(points(BRAKE_CONTROLS.deepOn)), frame = path(points(1));
        attr(find('.fj-drag-frame'), 'd', frame); attr(find('.fj-drag-neutral'), 'd', neutral);
        attr(find('.fj-drag-gentle'), 'd', working + neutral);
        attr(find('.fj-drag-deep'), 'd', frame + working);
        const guide = (depth: number): string => path(points(depth).slice(1)).slice(0, -1);
        attr(find('.fj-drag-guide'), 'd', guide(0.20) + guide(BRAKE_CONTROLS.deepOn));
        for (const [name, x, y] of [['hands-up', 0, -U - 14], ['release', 0, -U - 3], ['left', -T * 0.78, -10], ['right', T * 0.78, -10], ['down', 0, T + 20], ['gentle', T * 0.4, T * 0.3], ['deep', T * 0.4, T * 0.55]] as [string, number, number][]) {
          attr(find(`[data-drag="${name}"]`), 'x', x); attr(find(`[data-drag="${name}"]`), 'y', y);
        }
      }
      drag.style.left = `${layout.x - T - 22}px`; drag.style.top = `${layout.y - top}px`;
      let left = 0, right = 0, scale = T / BRAKE_DRAG.touchTravel;
      if (active) {
        dragCuePoint(intent.dx, intent.dy, intent.pointerType, live);
        scale = T / dragTravel(intent.pointerType);
        left = cueBrake(intent.leftBrake); right = cueBrake(intent.rightBrake);
      } else live.dx = live.dy = 0;
      live.dx *= scale; live.dy *= scale;
      attr(line, 'x2', live.dx); attr(line, 'y2', live.dy);
      attr(dot, 'cx', live.dx); attr(dot, 'cy', live.dy);
      const demand = Math.max(left, right);
      drag.dataset.depth = demand <= BRAKE_CONTROLS.released ? 'released' : demand > BRAKE_CONTROLS.deepOn ? 'deep' : 'gentle';
      drag.dataset.active = String(active);
      hide(drag, false); displayed = active;
      const advised = active && !facts.recovering && !facts.inverted && !facts.collapse && !facts.stall &&
        (!facts.wingPhase || facts.wingPhase === 'flying') ? coachDragTarget(message, intent.pointerType, input, suggestion) : null;
      attr(find('[data-drag="gentle"]'), 'x', (advised?.dx ?? 0) > 0 ? -T * 0.4 : T * 0.4);
      if (advised) {
        const scale = T / dragTravel(intent.pointerType);
        advised.dx *= scale; advised.dy *= scale;
        const x = layout.x + advised.dx, y = layout.y + advised.dy;
        Object.assign(targetBox, { left: x - 14, right: x + 14, top: y - 14, bottom: y + 14 });
        if (targetBox.left >= safe.left && targetBox.right <= safe.right && targetBox.top >= safe.top && targetBox.bottom <= safe.bottom && !obstacles.some(rect => overlapsCue(targetBox, rect))) {
          attr(target, 'transform', `translate(${advised.dx} ${advised.dy})`);
          target.dataset.accepted = String(advised.accepted); target.dataset.release = String(advised.handsUp);
          hide(target, false);
        }
      }
      obstacles.push(layout);
    }
    const at = motion.sample(pose, facts, camera, width, height, dt, reducedMotion());
    travel.hidden = true;
    if (at) {
      Object.assign(markerBox, { left: at.x - 44, right: at.x + 44, top: at.y - 8, bottom: at.y + 66 });
      if (markerBox.left >= safe.left && markerBox.right <= safe.right && markerBox.top >= safe.top && markerBox.bottom <= safe.bottom && !obstacles.some(rect => overlapsCue(markerBox, rect))) {
        travel.hidden = false; travel.style.left = `${at.x}px`; travel.style.top = `${at.y}px`;
        turn.hidden = Math.abs(at.turn) < 0.015;
        turn.dataset.direction = at.turn < 0 ? 'left' : 'right';
        turn.querySelector('small')!.textContent = at.turn < 0 ? 'TURNING LEFT' : 'TURNING RIGHT';
      }
    }
  }
  return { update, reset, clearDrag,
    overlapsControl: (rect: CueBounds) => !drag.hasAttribute('hidden') && overlapsCue(layout, rect) };
}
