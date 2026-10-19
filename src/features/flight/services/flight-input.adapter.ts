import type { createBrakeDrag } from '../../../domains/flight/brake-drag.ts';
import type { FlightInput } from '../../../domains/flight/models.ts';

interface DragControlsPort {
  canvas: HTMLElement; stage: HTMLElement; input: FlightInput; drag: ReturnType<typeof createBrakeDrag>; signal: AbortSignal;
  canStart(): boolean; beforeStart(): void; onActive(): void; release(options: { confirm: boolean }): void;
}

/** Native gesture coordinates stay in the input boundary; the fixed diagram only samples them. */
export function connectFlightDragControls({ canvas, stage, input, drag, signal, canStart, beforeStart, onActive, release }: DragControlsPort) {
  canvas.addEventListener('pointerdown', (event) => {
    if (!canStart() || drag.state.active || event.button !== 0) return;
    beforeStart();
    if (!drag.start(event)) return;
    event.preventDefault();
    input.controlMode = 'brakes';
    onActive();
    canvas.setPointerCapture(event.pointerId);
    stage.classList.add('brake-dragging');
  }, { signal });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag.move(event)) return;
    event.preventDefault();
    input.leftBrake = drag.state.leftBrake;
    input.rightBrake = drag.state.rightBrake;
  }, { signal });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    canvas.addEventListener(type, (event) => {
      if (event.pointerId === drag.state.pointerId) release({ confirm: type === 'pointerup' });
    }, { signal });
  }
}
