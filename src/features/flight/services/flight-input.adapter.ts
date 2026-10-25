import type { createBrakeDrag } from '../../../domains/flight/brake-drag.ts';
import type { FlightInput } from '../../../domains/flight/models.ts';
import { BRAKE_HANDLE, CONFIG_KEYS, createBrakeInput, FLIGHT_KEYS, type BrakeSide, type WingConfig } from '../../../domains/flight/brake-input.ts';

interface ControlsPort {
  canvas: HTMLElement; stage: HTMLElement; handles: HTMLElement; input: FlightInput;
  drag: ReturnType<typeof createBrakeDrag>; controller: ReturnType<typeof createBrakeInput>; signal: AbortSignal;
  canStart(): boolean; beforeStart(): void; releaseMouse(options: { confirm: boolean }): void;
}

/** Events store intent only. The fixed-step boundary quantizes both physical brakes. */
export function connectFlightControls({ canvas, stage, handles, input, drag, controller, signal, canStart, beforeStart, releaseMouse }: ControlsPort) {
  const buttons = [...handles.querySelectorAll<HTMLElement>('[data-brake-handle]')];
  const configs = [...handles.querySelectorAll<HTMLElement>('[data-config]')];
  const syncInput = () => {
    input.controlMode = 'brakes'; input.leftBrake = controller.state.leftBrake; input.rightBrake = controller.state.rightBrake;
    input.bar = controller.state.bar; input.ears = controller.state.ears;
  };
  const sync = () => {
    syncInput();
    stage.dataset.flightDevice = controller.state.device;
    stage.classList.toggle('brake-dragging', controller.state.source === 'mouse' || controller.state.source === 'handles');
    for (const button of configs) button.setAttribute('aria-pressed', String(controller.state[button.dataset.config as WingConfig]));
  };
  canvas.addEventListener('pointerdown', (event) => {
    if (!canStart() || drag.state.active || controller.state.source === 'handles' || event.button !== 0 || event.pointerType === 'touch') return;
    beforeStart();
    if (!controller.startMouse() || !drag.start(event)) return;
    event.preventDefault(); sync(); canvas.setPointerCapture(event.pointerId);
  }, { signal });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag.move(event)) return;
    event.preventDefault();
    controller.moveMouse(drag.state.leftBrake, drag.state.rightBrake, drag.state.bar); sync();
  }, { signal });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    canvas.addEventListener(type, (event) => {
      if (event.pointerId !== drag.state.pointerId) return;
      controller.endMouse(); releaseMouse({ confirm: type === 'pointerup' }); sync();
    }, { signal });
  }
  for (const button of buttons) {
    const side = button.dataset.brakeHandle as BrakeSide;
    button.addEventListener('pointerdown', event => {
      if (!canStart() || event.button !== 0 || controller.state.source === 'mouse' || controller.hands[side].pointerId !== null) return;
      if (controller.state.source !== 'handles') beforeStart();
      const travel = Number.parseFloat(getComputedStyle(handles).getPropertyValue('--brake-travel')) || BRAKE_HANDLE.travel;
      if (!controller.startHand(side, event, travel)) return;
      event.preventDefault(); event.stopPropagation(); button.setPointerCapture(event.pointerId); sync();
    }, { signal });
    button.addEventListener('pointermove', event => {
      if (!controller.moveHand(event)) return;
      event.preventDefault(); sync();
    }, { signal });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) button.addEventListener(type, event => {
      if (!controller.endHand(event.pointerId)) return;
      event.preventDefault(); event.stopPropagation();
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      sync();
    }, { signal });
    // A focused handle is momentary with Space or Enter, just as it is under a thumb.
    button.addEventListener('keydown', event => {
      if (!['Space', 'Enter'].includes(event.code) || !canStart()) return;
      event.preventDefault(); event.stopPropagation();
      if (event.repeat || controller.state.source === 'mouse' || controller.state.source === 'handles') return;
      beforeStart(); controller.keyDown(side === 'left' ? 'KeyA' : 'KeyD');
      if (event.shiftKey) controller.keyDown('ShiftLeft'); sync();
    }, { signal });
    button.addEventListener('keyup', event => {
      if (!['Space', 'Enter'].includes(event.code)) return;
      event.preventDefault(); event.stopPropagation(); controller.keyUp(side === 'left' ? 'KeyA' : 'KeyD'); controller.keyUp('ShiftLeft'); sync();
    }, { signal });
    button.addEventListener('blur', () => { if (controller.state.source === 'keyboard') { controller.reset(); sync(); } }, { signal });
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); }, { signal });
  }
  // The bar and the ears are held like a handle: a thumb on the button, or Space/Enter on it focused.
  for (const button of configs) {
    const config = button.dataset.config as WingConfig;
    button.addEventListener('pointerdown', event => {
      if (!canStart() || event.button !== 0 || controller.state.source === 'mouse') return;
      if (controller.state.source !== 'handles') beforeStart();
      if (!controller.startConfig(config, event)) return;
      event.preventDefault(); event.stopPropagation(); button.setPointerCapture(event.pointerId); sync();
    }, { signal });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) button.addEventListener(type, event => {
      if (!controller.endConfig(event.pointerId)) return;
      event.preventDefault(); event.stopPropagation();
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      sync();
    }, { signal });
    button.addEventListener('keydown', event => {
      if (!['Space', 'Enter'].includes(event.code) || !canStart()) return;
      event.preventDefault(); event.stopPropagation();
      if (event.repeat || controller.state.source === 'mouse' || controller.state.source === 'handles') return;
      beforeStart(); controller.keyDown(CONFIG_KEYS[config]); sync();
    }, { signal });
    button.addEventListener('keyup', event => {
      if (!['Space', 'Enter'].includes(event.code)) return;
      event.preventDefault(); event.stopPropagation(); controller.keyUp(CONFIG_KEYS[config]); sync();
    }, { signal });
    button.addEventListener('blur', () => { if (controller.state.source === 'keyboard') { controller.reset(); sync(); } }, { signal });
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); }, { signal });
  }
  const reset = () => {
    const captured = [...buttons.map(button => ({ button, id: controller.hands[button.dataset.brakeHandle as BrakeSide].pointerId })),
      ...configs.map(button => ({ button, id: controller.held[button.dataset.config as WingConfig] }))];
    controller.reset();
    for (const { button, id } of captured) if (id !== null && button.hasPointerCapture(id)) button.releasePointerCapture(id);
    sync();
  };
  window.addEventListener('resize', () => { if (controller.state.source === 'handles') reset(); }, { signal });
  signal.addEventListener('abort', reset, { once: true });
  return { reset,
    step(dt: number) {
      if (controller.state.source !== 'keyboard') return;
      controller.step(dt); syncInput();
    },
    keyDown(event: KeyboardEvent) {
      if (!canStart() || !FLIGHT_KEYS.has(event.code)) return false;
      event.preventDefault();
      if (event.repeat || controller.state.source === 'mouse' || controller.state.source === 'handles') return true;
      if (controller.state.source !== 'keyboard') beforeStart();
      controller.keyDown(event.code); sync(); return true;
    },
    keyUp(event: KeyboardEvent) {
      if (!controller.keyUp(event.code)) return false;
      event.preventDefault(); sync(); return true;
    },
  };
}
