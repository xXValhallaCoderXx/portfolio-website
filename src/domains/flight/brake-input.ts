import type { DragPointer } from './brake-drag.ts';

export type BrakeSide = 'left' | 'right';
export type BrakeDevice = 'mouse' | 'touch' | 'keyboard';
export const BRAKE_HANDLE = Object.freeze({ travel: 140, deadzone: 0.06 });
export const KEYBOARD_SHIFT_RAMP_SECONDS = 0.45;
export const FLIGHT_KEYS = new Set(['KeyA', 'KeyD', 'KeyQ', 'KeyE', 'KeyW', 'ArrowLeft', 'ArrowRight', 'KeyS', 'ArrowDown', 'Space', 'ShiftLeft', 'ShiftRight']);

/** Most thumb travel belongs to ordinary flight; the final segment is a deliberate full pull. */
export function handleBrake(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  const p = Math.max(0, Math.min(1, progress));
  if (p <= BRAKE_HANDLE.deadzone) return 0;
  const depth = p <= 0.68 ? (p - BRAKE_HANDLE.deadzone) / (0.68 - BRAKE_HANDLE.deadzone) * 0.65
    : p <= 0.88 ? 0.65 + (p - 0.68) / 0.20 * 0.17 : 0.82 + (p - 0.88) / 0.12 * 0.18;
  return Math.round(depth * 1e12) / 1e12;
}

export function handleProgress(brake: number): number {
  const b = Number.isFinite(brake) ? Math.max(0, Math.min(1, brake)) : 0;
  return b === 0 ? 0 : b <= 0.65 ? BRAKE_HANDLE.deadzone + b / 0.65 * (0.68 - BRAKE_HANDLE.deadzone)
    : b <= 0.82 ? 0.68 + (b - 0.65) / 0.17 * 0.20 : 0.88 + (b - 0.82) / 0.18 * 0.12;
}

/** Digital shortcuts describe the same pair of physical brake demands as the thumb handles. */
export function keyboardBrakes(keys: ReadonlySet<string>, fullPull = true) {
  const left = keys.has('KeyA') || keys.has('ArrowLeft') || keys.has('KeyQ');
  const right = keys.has('KeyD') || keys.has('ArrowRight') || keys.has('KeyE');
  const gentle = keys.has('KeyW');
  const both = left && right || gentle || keys.has('KeyS') || keys.has('ArrowDown') || keys.has('Space');
  const deep = fullPull && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
  if (deep) return { leftBrake: both || left ? 1 : 0, rightBrake: both || right ? 1 : 0 };
  if (!both && (keys.has('KeyQ') || keys.has('KeyE'))) return { leftBrake: left ? 0.82 : 0, rightBrake: right ? 0.82 : 0 };
  if (both && left !== right) return { leftBrake: left ? 0.50 : 0.20, rightBrake: right ? 0.50 : 0.20 };
  const bilateral = gentle && !keys.has('KeyS') && !keys.has('ArrowDown') && !keys.has('Space') && !(left && right) ? 0.20 : 0.60;
  return { leftBrake: both ? bilateral : left ? 0.30 : 0, rightBrake: both ? bilateral : right ? 0.30 : 0 };
}

interface Hand { pointerId: number | null; origin: number; travel: number }
interface FullPull { active: boolean; from: number; elapsed: number }
/** Source ownership lives at the input boundary, independently of frame rate and the solver. */
export function createBrakeInput() {
  const keys = new Set<string>();
  const hands: Record<BrakeSide, Hand> = { left: { pointerId: null, origin: 0, travel: 140 }, right: { pointerId: null, origin: 0, travel: 140 } };
  const state = { source: null as 'mouse' | 'handles' | 'keyboard' | null, device: 'mouse' as BrakeDevice, leftBrake: 0, rightBrake: 0 };
  const pulls: Record<BrakeSide, FullPull> = { left: { active: false, from: 0, elapsed: 0 }, right: { active: false, from: 0, elapsed: 0 } };
  function keyboardDemand() {
    const ordinary = keyboardBrakes(keys, false), target = keyboardBrakes(keys);
    for (const side of ['left', 'right'] as const) {
      const brake = `${side}Brake` as const, pull = pulls[side];
      if (target[brake] === 1) {
        if (!pull.active) {
          pull.active = true; pull.elapsed = 0;
          pull.from = Math.max(state[brake], ordinary[brake]);
          state[brake] = pull.from;
        }
      } else {
        pull.active = false; pull.elapsed = 0; pull.from = 0;
        state[brake] = ordinary[brake];
      }
    }
  }
  const reset = () => {
    keys.clear(); hands.left.pointerId = hands.right.pointerId = null; state.source = null; state.leftBrake = state.rightBrake = 0;
    for (const pull of Object.values(pulls)) { pull.active = false; pull.from = pull.elapsed = 0; }
  };
  return { state, hands, reset,
    /** Called once before the simulation quantizes this step's issued brake pair. */
    step(dt: number) {
      if (state.source !== 'keyboard' || !Number.isFinite(dt) || dt <= 0) return;
      for (const side of ['left', 'right'] as const) {
        const pull = pulls[side];
        if (!pull.active) continue;
        const next = pull.elapsed + dt;
        pull.elapsed = next >= KEYBOARD_SHIFT_RAMP_SECONDS - 1e-12 ? KEYBOARD_SHIFT_RAMP_SECONDS : next;
        const t = pull.elapsed / KEYBOARD_SHIFT_RAMP_SECONDS;
        state[`${side}Brake`] = pull.from + (1 - pull.from) * t * t * (3 - 2 * t);
      }
    },
    keyDown(code: string) {
      if (!FLIGHT_KEYS.has(code) || state.source === 'mouse' || state.source === 'handles') return false;
      keys.add(code); state.source = 'keyboard'; state.device = 'keyboard'; keyboardDemand(); return true;
    },
    keyUp(code: string) {
      if (!keys.delete(code)) return false;
      keyboardDemand(); if (!keys.size) state.source = null; return true;
    },
    startMouse() {
      if (state.source === 'handles' || state.source === 'mouse') return false;
      reset(); state.source = 'mouse'; state.device = 'mouse'; return true;
    },
    moveMouse(leftBrake: number, rightBrake: number) {
      if (state.source !== 'mouse') return false;
      Object.assign(state, { leftBrake, rightBrake }); return true;
    },
    endMouse() { if (state.source !== 'mouse') return false; reset(); return true; },
    startHand(side: BrakeSide, event: DragPointer, travel: number = BRAKE_HANDLE.travel) {
      if (state.source === 'mouse' || hands[side].pointerId !== null || !Number.isFinite(event.clientY) ||
          event.button !== 0 || Object.values(hands).some(hand => hand.pointerId === event.pointerId)) return false;
      if (state.source !== 'handles') reset();
      state.source = 'handles'; state.device = event.pointerType === 'mouse' ? 'keyboard' : 'touch';
      Object.assign(hands[side], { pointerId: event.pointerId, origin: event.clientY, travel: Math.max(1, travel) });
      state[`${side}Brake`] = 0; return true;
    },
    moveHand(event: DragPointer) {
      const side = (['left', 'right'] as const).find(side => hands[side].pointerId === event.pointerId);
      if (!side || !Number.isFinite(event.clientY)) return false;
      state[`${side}Brake`] = handleBrake((event.clientY - hands[side].origin) / hands[side].travel); return true;
    },
    endHand(pointerId: number) {
      const side = (['left', 'right'] as const).find(side => hands[side].pointerId === pointerId);
      if (!side) return false;
      hands[side].pointerId = null; state[`${side}Brake`] = 0;
      if (hands.left.pointerId === null && hands.right.pointerId === null) state.source = null;
      return true;
    },
  };
}
