import type { CoachFields } from '../../../domains/coaching/models.ts';
import type { FlightInput } from '../../../domains/flight/models.ts';
import type { BrakeDevice } from '../../../domains/flight/brake-input.ts';

/** A single device cue from the canonical request, including a release before an opposite pull. */
export function compactCoachCue(message: CoachFields, input: FlightInput, device: BrakeDevice) {
  const target = message.brakeTargets;
  const left = target?.left ?? (message.hold?.includes('left') ? .3 : message.hold?.includes('brake') ? .6 : 0);
  const right = target?.right ?? (message.hold?.includes('right') ? .3 : message.hold?.includes('brake') ? .6 : 0);
  const both = left > 0 && right > 0 && left === right;
  const side = left > right ? 'left' : 'right';
  const depth = Math.max(left, right);
  const releaseSide = depth > 0 && !both && (side === 'left' ? right === 0 : left === 0) &&
    ((side === 'left' ? input.rightBrake ?? 0 : input.leftBrake ?? 0) > .04 || message.release?.includes(side === 'left' ? 'right' : 'left'));
  let cue: string;
  if (depth === 0) cue = device === 'keyboard' ? 'Release both turn and brake keys.' : device === 'touch' ? 'Lift both thumbs. Let the wing settle.' : 'Let go of the drag. Let the wing settle.';
  else if (device === 'keyboard') {
    const key = side === 'left' ? 'A / ←' : 'D / →';
    cue = both ? depth >= .95 ? 'Shift + Space · both full' : depth <= .35 ? 'W · both gently' : 'Space · both brakes'
      : Math.min(left, right) > 0 ? `${side === 'left' ? 'A' : 'D'} + W · circle`
        : depth >= .95 ? `Shift + ${side === 'left' ? 'A' : 'D'} · full pull`
          : depth > .7 ? `${side === 'left' ? 'Q' : 'E'} · swing mark` : `${key} · gentle pull`;
    const releaseKeys: string[] = [];
    if (depth < .95 && Math.max(input.leftBrake ?? 0, input.rightBrake ?? 0) >= .95) releaseKeys.push('Shift');
    if (both && depth <= .35 && Math.min(input.leftBrake ?? 0, input.rightBrake ?? 0) > .35 ||
        releaseSide && Math.min(input.leftBrake ?? 0, input.rightBrake ?? 0) > .04 ||
        !target && message.release?.includes('brake') && !message.hold?.includes('brake')) releaseKeys.push('Space / S / ↓');
    else if (releaseSide || !both && Math.min(left, right) > 0 &&
        (side === 'left' ? input.rightBrake ?? 0 : input.leftBrake ?? 0) > Math.min(left, right) + (target?.tolerance ?? .07)) releaseKeys.push(side === 'left' ? 'D / →' : 'A / ←');
    if (!both && depth <= .7 && (side === 'left' ? input.leftBrake ?? 0 : input.rightBrake ?? 0) > .7) releaseKeys.push('Q / E');
    if (releaseKeys.length) cue = `Release ${releaseKeys.join(' + ')}; ${cue}`;
  } else {
    cue = device === 'touch' ? both ? 'Pull both handles to the marks.' : Math.min(left, right) > 0 ? `Both down; ${side} farther to the mark.` : `Pull the ${side} handle to the mark.`
      : both ? 'Drag down to the mark.' : Math.min(left, right) > 0 ? `Drag down and ${side} to the mark.` : `Drag ${side} to the mark.`;
    if (releaseSide) cue = device === 'touch' ? `Release ${side === 'left' ? 'right' : 'left'}; ${cue.charAt(0).toLowerCase()}${cue.slice(1)}` : `Ease to centre; ${cue.charAt(0).toLowerCase()}${cue.slice(1)}`;
  }
  const extraRelease = [input.bar && message.release?.includes('bar') && 'Release speed bar', input.ears && message.release?.includes('ears') && 'release ears'].filter(Boolean);
  if (extraRelease.length) cue = `${extraRelease.join(' and ')}; ${cue}`;
  const over = !!target && ((input.leftBrake ?? 0) > left + target.tolerance || (input.rightBrake ?? 0) > right + target.tolerance);
  const matching = !!target && Math.abs((input.leftBrake ?? 0) - left) <= (left ? target.tolerance : .04) && Math.abs((input.rightBrake ?? 0) - right) <= (right ? target.tolerance : .04) && !input.bar && !input.ears;
  const position = depth > 0 ? Math.min(1, ...(left ? [(input.leftBrake ?? 0) / left] : []), ...(right ? [(input.rightBrake ?? 0) / right] : [])) : null;
  return { cue, side: depth === 0 ? 'both' : both || Math.min(left, right) > 0 ? 'both' : side,
    callout: over ? 'EASE ↑' : depth === 0 ? 'HANDS UP ↑' : matching ? 'HOLD HERE' : 'PULL ↓',
    status: over ? 'ease' : matching ? 'hold' : 'pull', position };
}
