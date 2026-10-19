import type { ControlSummary, DirectControlSummary, FlightInput } from './models.ts';
// Device-independent meanings of actual brake demands. Observers use these meanings; the
// solver and recorder keep the original pair, including direct-mode neutral.
export const BRAKE_CONTROLS = Object.freeze({ turnOn: 0.08, turnOff: 0.04,
  brakeOn: 0.08, brakeOff: 0.04, deepOn: 0.70, deepOff: 0.65, released: 0.04, working: 2 / 3 });
const depth = (value: unknown): number => Number.isFinite(value) ? Math.max(0, Math.min(1, value as number)) : 0;
// One fixed-step demand precision for both manual flight modes, recordings and visual targets.
export const brakeByte = (value: unknown): number => Math.round(depth(value) * 255);

export function summarizeControls(input: FlightInput & {controlMode: 'brakes'}, previous?: ControlSummary | null): DirectControlSummary;
export function summarizeControls(input?: FlightInput, previous?: ControlSummary | null): ControlSummary;
export function summarizeControls(input: FlightInput = {}, previous: ControlSummary | null = null): ControlSummary {
  const C = BRAKE_CONTROLS;
  if (input.controlMode !== 'brakes') {
    const ears = !!input.ears, deepBrake = !ears && !!input.deepBrake;
    const brake = !ears && !!(input.brake || deepBrake);
    const turn = Number.isFinite(input.turn) ? input.turn! : Number(!!input.right) - Number(!!input.left);
    const commonBrake = deepBrake ? 1 : brake ? C.working : 0;
    return { ...input, left: !!input.left || turn < 0, right: !!input.right || turn > 0,
      turn, brake, deepBrake, ears, bar: !brake && !ears && !!(input.bar || input.left && input.right),
      anyBrake: brake, bothReleased: !brake, commonBrake, maxBrake: commonBrake };
  }
  const ears = !!input.ears;
  const leftBrake = ears ? 0 : depth(input.leftBrake), rightBrake = ears ? 0 : depth(input.rightBrake);
  const commonBrake = Math.min(leftBrake, rightBrake), maxBrake = Math.max(leftBrake, rightBrake);
  const turn = rightBrake - leftBrake;
  const prior = previous?.controlMode === 'brakes' ? previous : null;
  const left = turn < -(prior?.left ? C.turnOff : C.turnOn);
  const right = turn > (prior?.right ? C.turnOff : C.turnOn);
  const brake = commonBrake > (prior?.brake ? C.brakeOff : C.brakeOn);
  const deepBrake = commonBrake > (prior?.deepBrake ? C.deepOff : C.deepOn);
  return { ...input, controlMode: 'brakes', leftBrake, rightBrake, left, right, turn,
    brake, deepBrake, ears, bar: !ears && maxBrake === 0 && !!input.bar,
    anyBrake: maxBrake > C.released, bothReleased: maxBrake <= C.released, commonBrake, maxBrake };
}

export function createControlSummary() {
  let previous: ControlSummary | null = null;
  return {
    step(input: FlightInput) { previous = summarizeControls(input, previous); return previous; },
    reset() { previous = null; },
  };
}
