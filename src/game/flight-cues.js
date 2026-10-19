// Presentation only: reads snapshots, resolved coach messages and pointer intent. No flight,
// coach, input or recording clock is advanced here. All retained vectors/DOM nodes are bounded.
import { Vector3 } from 'three';
import { BRAKE_DRAG } from './brake-drag.js';
import { BRAKE_CONTROLS } from './brake-controls.js';
import { actionMessage } from './coach-actions.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
export const dragTravel = type => type === 'mouse' ? BRAKE_DRAG.mouseTravel : BRAKE_DRAG.touchTravel;
// Kept identical to the recorder's u8 demands without importing the run-only recorder into the fjord.
export const cueBrake = value => Math.round(clamp(value, 0, 1) * 255) / 255;
export const brakeDistance = value => value > 0 ? BRAKE_DRAG.deadzone + (1 - BRAKE_DRAG.deadzone) * value : 0;

export function brakeDragPoint(leftBrake, rightBrake, pointerType = 'mouse', out = {}) {
  const travel = dragTravel(pointerType), left = brakeDistance(leftBrake) * travel, right = brakeDistance(rightBrake) * travel;
  // A single-hand suggestion follows the ordinary horizontal pull. Bilateral pulls solve both
  // demand equations, including the dead zone. Zero has many inverses; the origin means hands up.
  out.dx = leftBrake === 0 ? right : rightBrake === 0 ? -left : (right - left) / 2;
  out.dy = leftBrake === 0 || rightBrake === 0 ? 0 : (right + left) / 2;
  return out;
}

export function coachDragTarget(message, pointerType = 'mouse', input = {}, out = {}) {
  if (!message || message.controlMode !== 'brakes' || message.warning || message.urgent || message.transfer ||
      message.heading === 'NEXT LIFT' || ['recover', 'hazard', 'descent', 'lee'].includes(message.state) ||
      ['approach', 'align', 'prepare', 'blocked', 'warning', 'recovery'].includes(message.phase)) return null;
  const hold = message.hold ?? [], release = message.release ?? [], action = message.action;
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
  const suggested = { controlMode: 'brakes', leftBrake: left, rightBrake: right, bar: false, ears: false };
  // The real coach remains the authority, including any extra hold/release constraints.
  if (!actionMessage(message, suggested).accepted) return null;
  brakeDragPoint(left, right, pointerType, out);
  out.leftBrake = left; out.rightBrake = right; out.handsUp = handsUp;
  out.accepted = actionMessage(message, { ...input, controlMode: 'brakes',
    leftBrake: cueBrake(input.leftBrake ?? 0), rightBrake: cueBrake(input.rightBrake ?? 0) }).accepted;
  return out;
}

export function groundTurn(motion) {
  const { from, to, seconds, discontinuity } = motion;
  if (discontinuity || !(seconds > 0) || Math.hypot(from.x, from.z) < 2 || Math.hypot(to.x, to.z) < 2) return 0;
  return Math.atan2(from.x * to.z - from.z * to.x, from.x * to.x + from.z * to.z) / seconds;
}

export function createTravelCue() {
  let ready = false, heading = 0, turn = 0;
  const world = new Vector3(), projected = new Vector3();
  const result = { x: 0, y: 0, heading: 0, turn: 0, world };
  function reset() { ready = false; heading = turn = 0; }
  return { reset, sample(pose, facts, camera, width, height, dt, reducedMotion = false) {
    const velocity = pose?.pilot.vel, speed = velocity ? Math.hypot(velocity.x, velocity.z) : 0;
    const reverse = velocity && velocity.x * Math.sin(facts.noseYaw) - velocity.z * Math.cos(facts.noseYaw) <= 0;
    if (!pose || facts.blocked || speed < 2 || !Number.isFinite(speed) || reverse || facts.forwardAirspeed <= 0 ||
        facts.stall > 0 || facts.collapse > 0 || facts.inverted || facts.recovering ||
        facts.wingPhase && facts.wingPhase !== 'flying') { reset(); return null; }
    const next = Math.atan2(velocity.x, -velocity.z), rate = groundTurn(pose.motion);
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

export const overlapsCue = (a, b, gap = 6) => a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;

export function dragCueLayout(drag, safe, obstacles = [], out = {}) {
  const travel = dragTravel(drag.pointerType), half = travel + 22, top = 24, bottom = travel + 24;
  const rawX = drag.x, rawY = drag.y;
  let x = rawX, y = rawY;
  if (drag.pointerType !== 'mouse') {
    const lowX = safe.left + half, highX = safe.right - half, lowY = safe.top + top;
    // Reserve finger clearance before considering HUD avoidance. A short viewport can require
    // drawing the diagram under a HUD edge; HUD layers and target collision checks still win.
    const highY = Math.min(safe.bottom - bottom, Math.max(lowY, rawY - travel - 48));
    const boundedX = value => clamp(value, lowX, Math.max(lowX, highX));
    const boundedY = value => clamp(value, lowY, Math.max(lowY, highY));
    const preferredX = boundedX(rawX), preferredY = boundedY(rawY - travel - 64);
    x = preferredX; y = preferredY;
    let best = Infinity;
    // A fixed number of HUD rectangles supplies a bounded set of alternatives, with one common
    // translation for origin, live dot and target. Real pointer coordinates are never rewritten.
    const xs = new Set([x, boundedX(lowX), boundedX(highX)]), ys = new Set([y, boundedY(lowY), boundedY(highY)]);
    for (const rect of obstacles) {
      xs.add(boundedX(rect.left - half - 8)); xs.add(boundedX(rect.right + half + 8));
      ys.add(boundedY(rect.top - bottom - 8)); ys.add(boundedY(rect.bottom + top + 8));
    }
    for (const candidateX of xs) for (const candidateY of ys) {
      let penalty = 0;
      for (const rect of obstacles) penalty += Math.max(0, Math.min(candidateX + half, rect.right + 6) - Math.max(candidateX - half, rect.left - 6)) *
        Math.max(0, Math.min(candidateY + bottom, rect.bottom + 6) - Math.max(candidateY - top, rect.top - 6));
      const distance = Math.hypot(candidateX - preferredX, candidateY - preferredY);
      // If a press is too near the top for full clearance, retain the safest available position.
      const clearance = Math.max(0, candidateY + travel + 48 - rawY);
      const score = penalty * 1000 + clearance * 100 + distance;
      if (score < best) { best = score; x = candidateX; y = candidateY; }
    }
  }
  Object.assign(out, { x, y, travel, left: x - half, right: x + half, top: y - top, bottom: y + bottom });
  return out;
}

const markup = `<div class="fj-cue-safe"></div>
  <div class="fj-travel" hidden><i></i><span>TRAVEL</span><div class="fj-travel-turn" hidden>
    <svg viewBox="-22 -14 44 28"><path d="M-17 8 Q-3-14 17 2 M9 1 L17 2 L15-6"/></svg><small></small></div></div>
  <svg class="fj-brake-drag" hidden><path class="fj-drag-gentle"/><path class="fj-drag-deep"/>
    <path class="fj-drag-guide"/><text data-drag="left" text-anchor="middle">LEFT</text><text data-drag="right" text-anchor="middle">RIGHT</text>
    <text data-drag="down" text-anchor="middle">DOWN</text><text data-drag="gentle" text-anchor="middle">GENTLE</text><text data-drag="deep" text-anchor="middle">DEEP</text>
    <line class="fj-drag-line" x1="0" y1="0"/><circle class="fj-drag-origin" r="7"/><circle class="fj-drag-center" r="2"/>
    <g class="fj-drag-target" hidden><circle r="10"/><path d="M-14 0H-11 M11 0H14 M0-14V-11 M0 11V14"/><text text-anchor="middle" y="-15"></text></g>
    <circle class="fj-drag-dot" r="5"/></svg>`;

export function createFlightCues({ element, stage, camera, reducedMotion = () => false }) {
  element.innerHTML = markup;
  const find = selector => element.querySelector(selector), travel = find('.fj-travel'), turn = find('.fj-travel-turn');
  const drag = find('.fj-brake-drag'), line = find('.fj-drag-line'), dot = find('.fj-drag-dot'), target = find('.fj-drag-target');
  const motion = createTravelCue(), layout = {}, suggestion = {}, markerBox = {}, targetBox = {};
  const obstacles = [];
  const exclusions = '.fj-hud > dl, .fj-hud nav, .fj-coach, .fj-touch > span, .fj-lights, .fj-gauge, .fj-cue, .fj-hint, .fj-toasts > *, .fj-title, .fj-style';
  let size = 0;
  const attr = (node, name, value) => { const text = String(value); if (node.getAttribute(name) !== text) node.setAttribute(name, text); };
  const hide = (node, value) => node.toggleAttribute('hidden', value);
  function clearDrag() { hide(drag, true); hide(target, true); }
  function reset() { motion.reset(); travel.hidden = true; clearDrag(); }
  function update({ pose, facts, drag: intent, message, input, dt }) {
    if (facts.blocked) { reset(); return; }
    const box = stage.getBoundingClientRect(), width = box.width, height = box.height;
    const safeBox = find('.fj-cue-safe').getBoundingClientRect();
    const safe = { left: safeBox.left - box.left, right: safeBox.right - box.left, top: safeBox.top - box.top, bottom: safeBox.bottom - box.top };
    obstacles.length = 0;
    for (const node of stage.querySelectorAll(exclusions)) {
      const rect = node.getBoundingClientRect();
      // Clipped one-pixel live regions announce warnings but reserve no visible screen space.
      if (rect.width > 1 && rect.height > 1) obstacles.push({ left: rect.left - box.left, right: rect.right - box.left, top: rect.top - box.top, bottom: rect.bottom - box.top });
    }
    clearDrag();
    if (intent.active && input.controlMode === 'brakes') {
      // The input adapter stores viewport coordinates; every element uses this stage-local offset.
      dragCueLayout({ ...intent, x: intent.x - box.left, y: intent.y - box.top }, safe, obstacles, layout);
      const T = layout.travel, D = brakeDistance(BRAKE_CONTROLS.deepOn) * T;
      if (size !== T) {
        size = T;
        attr(drag, 'viewBox', `${-T - 22} -24 ${2 * T + 44} ${T + 48}`);
        drag.style.width = `${2 * T + 44}px`; drag.style.height = `${T + 48}px`;
        attr(find('.fj-drag-gentle'), 'd', `M${-D} 0L0 ${D}L${D} 0Z`);
        attr(find('.fj-drag-deep'), 'd', `M${-T} 0L0 ${T}L${T} 0L${D} 0L0 ${D}L${-D} 0Z`);
        const gentle = brakeDistance(0.20) * T;
        attr(find('.fj-drag-guide'), 'd', `M${-gentle} 0L0 ${gentle}L${gentle} 0 M${-D} 0L0 ${D}L${D} 0`);
        for (const [name, x, y] of [['left', -T * 0.64, -10], ['right', T * 0.64, -10], ['down', 0, T + 20], ['gentle', T * 0.4, T * 0.3], ['deep', T * 0.4, T * 0.55]]) {
          attr(find(`[data-drag="${name}"]`), 'x', x); attr(find(`[data-drag="${name}"]`), 'y', y);
        }
      }
      drag.style.left = `${layout.x - T - 22}px`; drag.style.top = `${layout.y - 24}px`;
      const { dx, dy } = intent;
      const scale = Math.min(1, T / Math.max(1, Math.hypot(dx, dy)), dy < -12 ? -12 / dy : 1);
      attr(line, 'x2', dx * scale); attr(line, 'y2', dy * scale);
      attr(dot, 'cx', dx * scale); attr(dot, 'cy', dy * scale);
      drag.dataset.depth = Math.max(intent.leftBrake, intent.rightBrake) > BRAKE_CONTROLS.deepOn ? 'deep' : 'gentle';
      hide(drag, false);
      const advised = !facts.recovering && !facts.inverted && !facts.collapse && !facts.stall &&
        (!facts.wingPhase || facts.wingPhase === 'flying') ? coachDragTarget(message, intent.pointerType, input, suggestion) : null;
      attr(find('[data-drag="gentle"]'), 'x', advised?.dx > 0 ? -T * 0.4 : T * 0.4);
      if (advised) {
        const x = layout.x + advised.dx, y = layout.y + advised.dy;
        Object.assign(targetBox, { left: x - (advised.handsUp ? 30 : 14), right: x + (advised.handsUp ? 30 : 14), top: y - (advised.handsUp ? 24 : 14), bottom: y + 14 });
        if (targetBox.left >= safe.left && targetBox.right <= safe.right && targetBox.top >= safe.top && targetBox.bottom <= safe.bottom && !obstacles.some(rect => overlapsCue(targetBox, rect))) {
          attr(target, 'transform', `translate(${advised.dx} ${advised.dy})`);
          target.dataset.accepted = String(advised.accepted); target.dataset.release = String(advised.handsUp);
          const label = target.querySelector('text'); label.textContent = advised.handsUp ? 'HANDS UP' : '';
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
        turn.querySelector('small').textContent = at.turn < 0 ? 'TURNING LEFT' : 'TURNING RIGHT';
      }
    }
  }
  return { update, reset, clearDrag };
}
