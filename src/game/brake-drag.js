// Pointer events only store an intent. The run quantizes and samples it at its fixed step.
export const BRAKE_DRAG = Object.freeze({ mouseTravel: 120, touchTravel: 80, deadzone: 0.06 });
const demand = value => Math.max(0, Math.min(1, (value - BRAKE_DRAG.deadzone) / (1 - BRAKE_DRAG.deadzone)));

export function dragBrakes(dx, dy, pointerType = 'mouse') {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { leftBrake: 0, rightBrake: 0 };
  const travel = pointerType === 'mouse' ? BRAKE_DRAG.mouseTravel : BRAKE_DRAG.touchTravel;
  return { leftBrake: demand((dy - dx) / travel), rightBrake: demand((dy + dx) / travel) };
}

export function createBrakeDrag() {
  const state = { active: false, pointerId: null, pointerType: 'mouse', x: 0, y: 0,
    dx: 0, dy: 0, leftBrake: 0, rightBrake: 0 };
  function reset() {
    state.active = false; state.pointerId = null;
    state.dx = state.dy = state.leftBrake = state.rightBrake = 0;
  }
  return {
    state,
    start(event) {
      if (state.active || event.button !== 0 || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return false;
      Object.assign(state, { active: true, pointerId: event.pointerId, pointerType: event.pointerType || 'mouse',
        x: event.clientX, y: event.clientY, dx: 0, dy: 0, leftBrake: 0, rightBrake: 0 });
      return true;
    },
    move(event) {
      if (!state.active || event.pointerId !== state.pointerId || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return false;
      state.dx = event.clientX - state.x; state.dy = event.clientY - state.y;
      Object.assign(state, dragBrakes(state.dx, state.dy, state.pointerType));
      return true;
    },
    release(event) {
      if (!state.active || event.pointerId !== state.pointerId) return false;
      reset(); return true;
    },
    reset,
  };
}
