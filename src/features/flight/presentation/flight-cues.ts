import type { CoachFields } from '../../../domains/coaching/models.ts';
import type { FlightInput } from '../../../domains/flight/models.ts';
import type { RenderedFlight } from './flight-view.ts';
// Presentation only: reads snapshots, resolved coach messages and brake inputs. No flight,
// coach, input or recording clock is advanced here. All retained vectors/DOM nodes are bounded.
import { PerspectiveCamera, Vector3 } from 'three';
import { BRAKE_DRAG, dragBrakes } from '../../../domains/flight/brake-drag.ts';
import { BRAKE_CONTROLS, brakeByte } from '../../../domains/flight/brake-controls.ts';
import { BRAKE_HANDLE, handleProgress } from '../../../domains/flight/brake-input.ts';
import { actionMessage } from '../../../domains/coaching/coach-actions.ts';

export interface CuePoint { dx: number; dy: number }
export interface CueBounds { left: number; right: number; top: number; bottom: number }
export interface ControlLayout extends CueBounds { x: number; y: number; travel: number }
export interface CoachTarget extends CuePoint { leftBrake: number; rightBrake: number; handsUp: boolean; accepted: boolean }
export interface CueFacts { blocked: boolean; noseYaw: number; forwardAirspeed: number; stall: number; collapse: number; inverted: boolean; recovering: boolean; wingPhase: string }
type CuePose = Pick<RenderedFlight, 'pilot' | 'motion'>;
type CueMessage = CoachFields & { controlMode?: 'legacy' | 'brakes' };
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

/** The hands a recovery asks for (wing-cue.js) as a target on the handles, met within the coach's own tolerance (0.07). */
export function recoveryTarget(hands: Readonly<{ left: number; right: number }>, input: FlightInput, output: Partial<CoachTarget> = {}): CoachTarget {
  const out = output as CoachTarget;
  out.leftBrake = hands.left; out.rightBrake = hands.right; out.handsUp = hands.left === 0 && hands.right === 0;
  out.accepted = Math.abs((input.leftBrake ?? 0) - hands.left) <= 0.07 && Math.abs((input.rightBrake ?? 0) - hands.right) <= 0.07;
  out.dx = out.dy = 0;
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
  if (message.brakeTargets) {
    left = message.brakeTargets.left; right = message.brakeTargets.right; handsUp = left === 0 && right === 0;
  } else if (message.context === 'thermal' && message.phase === 'circle' && ['left', 'right'].includes(action)) {
    left = action === 'left' ? 0.50 : 0.20; right = action === 'right' ? 0.50 : 0.20;
  } else if (message.context === 'thermal' && action === 'straight' && message.dragAction === 'ease') {
    left = right = 0.20;
  } else if (['left', 'right'].includes(action) && message.context !== 'thermal') {
    left = action === 'left' ? 0.30 : 0; right = action === 'right' ? 0.30 : 0;
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
  // Keep the diagram centred and low, below the pilot. Short landscape views use the corner
  // because there is no room below the pilot; phones retain their lower-centre diagram.
  // Pointer origins, input device and coach messages never move this viewport anchor.
  const docked = width > 560;
  const x = docked && compact ? safe.right - half : safe.left + width / 2;
  const y = docked ? safe.bottom - bottom : clamp(safe.top + height * 0.80, safe.top + top, safe.bottom - bottom);
  Object.assign(out, { x, y, travel, left: x - half, right: x + half, top: y - top, bottom: y + bottom });
  return out;
}

const markup = `<div class="fj-cue-safe"></div>
  <div class="fj-travel" hidden><i></i><span>TRAVEL</span><div class="fj-travel-turn" hidden>
    <svg viewBox="-22 -14 44 28"><path d="M-17 8 Q-3-14 17 2 M9 1 L17 2 L15-6"/></svg><small></small></div></div>`;

export function createFlightCues({ element, stage, camera, reducedMotion = () => false }: { element: HTMLElement; stage: HTMLElement; camera: PerspectiveCamera; reducedMotion?: () => boolean }) {
  element.innerHTML = markup;
  const find = (selector: string): HTMLElement => { const found = element.querySelector<HTMLElement>(selector); if (!found) throw new Error(`Flight cue is missing ${selector}`); return found; };
  const travel = find('.fj-travel'), turn = find('.fj-travel-turn');
  const handles = stage.querySelector<HTMLElement>('.fj-brake-handles');
  const handleNodes = handles ? (['left', 'right'] as const).map(side => {
    const panel = handles.querySelector<HTMLElement>(`[data-hand="${side}"]`)!;
    return { side, panel, button: panel.querySelector<HTMLElement>('button')!, target: panel.querySelector<HTMLElement>('.fj-handle-target')!,
      working: panel.querySelector<HTMLElement>('.fj-handle-working')!, wingover: panel.querySelector<HTMLElement>('.fj-handle-wingover')!,
      full: panel.querySelector<HTMLElement>('.fj-handle-full')!, depth: panel.querySelector<HTMLElement>('.fj-handle-depth')! };
  }) : [];
  const handleBounds: CueBounds[] = [];
  const motion = createTravelCue(), suggestion: CoachTarget = { dx: 0, dy: 0, leftBrake: 0, rightBrake: 0, handsUp: false, accepted: false }, markerBox = emptyBounds();
  const obstacles: CueBounds[] = [];
  const exclusions = '.fj-hud-card, .fj-telemetry, .fj-coach, .fj-lights, .fj-gauge, .fj-cue, .fj-hint, .fj-toasts > *, .fj-title';
  function reset() { motion.reset(); travel.hidden = true; if (handles) handles.hidden = true; handleBounds.length = 0; }
  /**
   * `recovery`, where given, is the hands a run's fix for a failure asks for this step (wing-cue.js):
   * the handles light them, as they light a coach's, while the wing is in the very trouble that keeps
   * a coach's off them.
   */
  function update({ pose, facts, message, input, dt, quiet = false, recovery = null }: { pose: CuePose | null; facts: CueFacts; message: CueMessage | null;
    input: FlightInput; dt: number; quiet?: boolean; recovery?: Readonly<{ left: number; right: number }> | null }) {
    if (facts.blocked) { reset(); return; }
    const box = stage.getBoundingClientRect(), width = box.width, height = box.height;
    const safeBox = find('.fj-cue-safe').getBoundingClientRect();
    const safe = { left: safeBox.left - box.left, right: safeBox.right - box.left, top: safeBox.top - box.top, bottom: safeBox.bottom - box.top };
    if (width <= 0 || height <= 0) { reset(); return; }
    obstacles.length = 0;
    for (const node of stage.querySelectorAll(exclusions)) {
      const rect = node.getBoundingClientRect();
      // Clipped one-pixel live regions announce warnings but reserve no visible screen space.
      if (rect.width > 1 && rect.height > 1) obstacles.push({ left: rect.left - box.left, right: rect.right - box.left, top: rect.top - box.top, bottom: rect.bottom - box.top });
    }
    handleBounds.length = 0;
    if (handles) {
      handles.hidden = false;
      const travel = Number.parseFloat(getComputedStyle(handles).getPropertyValue('--brake-travel')) || BRAKE_HANDLE.travel;
      const advised = recovery ? recoveryTarget(recovery, input, suggestion) :
        !facts.recovering && !facts.collapse && !facts.stall ? coachDragTarget(message, 'touch', input, suggestion) : null;
      for (const item of handleNodes) {
        const value = cueBrake(input[`${item.side}Brake`] ?? 0);
        item.button.style.transform = `translateY(${handleProgress(value) * travel}px)`;
        item.working.style.top = `${32 + handleProgress(0.60) * travel}px`;
        item.wingover.style.top = `${32 + handleProgress(0.82) * travel}px`;
        item.full.style.top = `${32 + travel}px`;
        const depth = value <= BRAKE_CONTROLS.released ? 'released' : value >= 0.95 ? 'full' : value > 0.70 ? 'swing' : value >= 0.45 ? 'working' : 'gentle';
        item.panel.dataset.depth = depth; item.panel.dataset.held = String(value > BRAKE_CONTROLS.released);
        item.depth.textContent = depth === 'released' ? 'HANDS UP' : depth === 'full' ? 'FULL PULL' : depth.toUpperCase();
        item.target.hidden = !advised;
        if (advised) {
          item.target.style.top = `${32 + handleProgress(item.side === 'left' ? advised.leftBrake : advised.rightBrake) * travel}px`;
          item.target.dataset.accepted = String(advised.accepted);
        }
        const rect = item.panel.getBoundingClientRect();
        const bounds = { left: rect.left - box.left, right: rect.right - box.left, top: rect.top - box.top, bottom: rect.bottom - box.top };
        handleBounds.push(bounds); obstacles.push(bounds);
      }
    }
    travel.hidden = true;
    if (quiet) { motion.reset(); return; }
    const at = motion.sample(pose, facts, camera, width, height, dt, reducedMotion());
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
  return { update, reset,
    overlapsControl: (rect: CueBounds) => handleBounds.some(bounds => overlapsCue(bounds, rect)) };
}
