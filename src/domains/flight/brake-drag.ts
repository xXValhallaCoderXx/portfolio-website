export interface DragPointer { pointerId: number; pointerType?: string; clientX: number; clientY: number; button?: number }
export interface BrakeDragState { active: boolean; moved: boolean; pointerId: number | null; pointerType: string; x: number; y: number; dx: number; dy: number; leftBrake: number; rightBrake: number; bar: boolean }
// Pointer events only store an intent. The run quantizes and samples it at its fixed step. Pushing
// the drag `barLift` pixels or more above where it was grabbed pushes the speed bar.
export const BRAKE_DRAG = Object.freeze({ mouseTravel: 120, touchTravel: 80, deadzone: 0.06, clickSlop: 6, barLift: 24 });
const demand = (value: number): number => Math.max(0, Math.min(1, (value - BRAKE_DRAG.deadzone) / (1 - BRAKE_DRAG.deadzone)));

export function dragBrakes(dx: number, dy: number, pointerType = 'mouse') {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { leftBrake: 0, rightBrake: 0 };
  const travel = pointerType === 'mouse' ? BRAKE_DRAG.mouseTravel : BRAKE_DRAG.touchTravel;
  return { leftBrake: demand((dy - dx) / travel), rightBrake: demand((dy + dx) / travel) };
}

export function createBrakeDrag() {
  const state: BrakeDragState = { active: false, moved: false, pointerId: null, pointerType: 'mouse', x: 0, y: 0,
    dx: 0, dy: 0, leftBrake: 0, rightBrake: 0, bar: false };
  function reset() {
    state.active = state.moved = state.bar = false; state.pointerId = null;
    state.dx = state.dy = state.leftBrake = state.rightBrake = 0;
  }
  return {
    state,
    start(event: DragPointer) {
      if (state.active || event.button !== 0 || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return false;
      Object.assign(state, { active: true, moved: false, pointerId: event.pointerId, pointerType: event.pointerType || 'mouse',
        x: event.clientX, y: event.clientY, dx: 0, dy: 0, leftBrake: 0, rightBrake: 0, bar: false });
      return true;
    },
    move(event: DragPointer) {
      if (!state.active || event.pointerId !== state.pointerId || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return false;
      state.dx = event.clientX - state.x; state.dy = event.clientY - state.y;
      // Navigation clicks and brake gestures share the canvas. Keep the full gesture's travel
      // even after returning to hands up, so its final click cannot select a place underneath.
      state.moved ||= Math.hypot(state.dx, state.dy) > BRAKE_DRAG.clickSlop;
      Object.assign(state, dragBrakes(state.dx, state.dy, state.pointerType));
      state.bar = state.dy <= -BRAKE_DRAG.barLift;
      return true;
    },
    reset,
  };
}
