import type { LessonId } from '../good-lift/trick-lessons.ts';

export type FoundationLessonId = 'steering' | 'thermal';
// The recovery lessons (recovery-lessons.js): a failure started on the wing, flown out of, SIV-style.
export const RECOVERY_TRAINING_LESSONS = Object.freeze(['collapse', 'frontal', 'deep-stall', 'spin', 'cravat', 'twist'] as const);
export type RecoveryLessonId = typeof RECOVERY_TRAINING_LESSONS[number];
export type TrainingLessonId = LessonId | FoundationLessonId | RecoveryLessonId;
export const TRICK_TRAINING_LESSONS = Object.freeze(['pitch', 'spiral', 'wingover', 'stall', 'wing-spiral', 'spiral-exit', 'loop', 'heli', 'sat'] as const);
export const TRAINING_LESSONS = Object.freeze(['steering', 'thermal', ...TRICK_TRAINING_LESSONS, ...RECOVERY_TRAINING_LESSONS] as const);
export const isTrickLesson = (id: TrainingLessonId): id is LessonId => (TRICK_TRAINING_LESSONS as readonly string[]).includes(id);
export const isRecoveryLesson = (id: TrainingLessonId): id is RecoveryLessonId => (RECOVERY_TRAINING_LESSONS as readonly string[]).includes(id);

/**
 * What a lesson's move asks of the wing flown: one that can be fully stalled, helicoptered or taken
 * into a SAT, or one whose failures can be started (a glider's, for the recovery lessons).
 */
export type LessonNeed = 'stall' | 'heli' | 'sat' | 'recovery';
interface TrainingLessonInfo {
  label: string; description: string; steps: readonly string[]; entry: number; abort: number; needs?: LessonNeed;
}
export const TRAINING_LESSON_INFO: Readonly<Record<TrainingLessonId, TrainingLessonInfo>> = Object.freeze({
  steering: { label: 'Steering & braking', description: 'Try gentle and sharper turns, slow down and return to steady flight.',
    steps: ['Pull one handle gently to turn, then release.', 'Repeat on the other side.',
      'For a sharper turn, pull one handle farther (Q / E). Release when cued; holding it builds a spiral.',
      'Pull both to slow down; release and settle.'], entry: 120, abort: 60 },
  thermal: { label: 'Thermal climb', description: 'Find rising air and stay with it for a climbing circle.',
    steps: ['Fly toward the rising air.', 'Keep some brake on both hands and pull the turning hand farther.', 'Circle once and gain 10 m in the same thermal.'], entry: 120, abort: 60 },
  pitch: { entry: 200, abort: 120, label: 'Pitch & catch', description: 'Build a fore-and-aft swing, catch it and settle.',
    steps: ['Pull both to working brake.', 'Release, then catch the forward swing.', 'Release and recover level for three seconds.'] },
  spiral: { entry: 300, abort: 200, label: 'Spiral 360', description: 'Fly a full banked circle and recover cleanly.',
    steps: ['Pull one handle into the spiral range; use Q or E on keyboard.', 'Hold through a complete banked circle.', 'Release and recover level for three seconds.'] },
  wingover: { entry: 250, abort: 180, label: 'Wingover', description: 'Build alternating swings across the wing.',
    steps: ['Build a swing with a deep side pull.', 'Release and change sides with the next cue.', 'Release and recover level for three seconds.'] },
  loop: { entry: 400, abort: 250, label: 'Loop', description: 'Build enough energy for a full rotation.',
    steps: ['Use a full side pull to build the swing.', 'Follow the release and catch cues through the rotation.', 'Release and recover level for three seconds.'] },
  stall: { entry: 400, abort: 250, needs: 'stall', label: 'Full stall & catch', description: 'Stall the whole wing on purpose, let it fly again and catch the surge.',
    steps: ['Pull both handles all the way down and keep them there.', 'Hold while the wing stalls and falls back, until READY ◆.', 'Let both hands up together, then catch the surge with both brakes.', 'Release and recover level for three seconds.'] },
  'wing-spiral': { entry: 400, abort: 250, label: 'Wing-Spiral', description: 'Link wingovers straight into a spiral dive.',
    steps: ['Build wingovers: pull one side, reverse at each cue.', 'Reverse once more, then keep that hand down.', 'Hold it as the wing dives into the spiral.', 'Release and recover level for three seconds.'] },
  'spiral-exit': { entry: 400, abort: 250, label: 'Spiral exit', description: 'Swing out of a spiral into a wingover on the other side.',
    steps: ['Pull one side into a spiral and hold it.', 'At the cue, let it up and pull the other fully.', 'Hands up as the wing tops out on the other side.', 'Release and recover level for three seconds.'] },
  heli: { entry: 400, abort: 250, needs: 'heli', label: 'Helicopter', description: 'Turn a held full stall flat on itself, then stop it and fly out.',
    steps: ['Pull both handles all the way down and hold until READY ◆.', 'Ease one hand to the middle: the wing turns flat on itself.', 'After two turns pull both fully again, then let both up together.', 'Catch the surge and recover level for three seconds.'] },
  sat: { entry: 400, abort: 250, needs: 'sat', label: 'SAT', description: 'Pull a spiral into a SAT: the wing turns on itself with you swung out.',
    steps: ['Pull one side into a spiral and hold it until READY ◆.', 'Pull that hand all the way down: the wing turns on itself.', 'Hold two turns, then let the hand up.', 'Catch the dive and recover level for three seconds.'] },
  collapse: { entry: 400, abort: 250, needs: 'recovery', label: 'Asymmetric collapse', description: 'One half folds: stop the turn, then pump it open.',
    steps: ['Fly level, hands up, through the instructor\'s count.', 'Brake the open side lightly to stop the turn.', 'Pump the folded side, back to the light brake between pumps.', 'Hands up and fly level for three seconds.'] },
  frontal: { entry: 400, abort: 250, needs: 'recovery', label: 'Frontal collapse', description: 'The leading edge tucks under: hands up, then catch the dive.',
    steps: ['Fly level, hands up, through the instructor\'s count.', 'Hands up: let the front open by itself (one short pump on a C or higher).', 'Catch the dive with both brakes.', 'Hands up and fly level for three seconds.'] },
  'deep-stall': { entry: 400, abort: 250, needs: 'recovery', label: 'Deep stall', description: 'Sinking with no forward speed: fly it out on the speed bar.',
    steps: ['Fly level, hands up, through the instructor\'s count.', 'Hands up, and push the speed bar.', 'Hold the bar until the wing flies again.', 'Catch the dive and fly level for three seconds.'] },
  spin: { entry: 400, abort: 250, needs: 'recovery', label: 'Spin recovery', description: 'One half stalled, the wing turning on itself: hands up at once.',
    steps: ['Fly level, hands up, through the instructor\'s count.', 'Hands up at once.', 'Catch the dive as the stalled half flies again.', 'Hands up and fly level for three seconds.'] },
  cravat: { entry: 400, abort: 250, needs: 'recovery', label: 'Cravat', description: 'A tip caught in the lines: stop the turn, then pull it free.',
    steps: ['Fly level, hands up, through the instructor\'s count.', 'Brake the open side lightly to stop the turn.', 'Pull the caught side deep and hold it until the tip comes free.', 'Hands up and fly level for three seconds.'] },
  twist: { entry: 400, abort: 250, needs: 'recovery', label: 'Line twist', description: 'Twisted under the lines, the brakes barely work: unwind first.',
    steps: ['Fly level, hands up, through the instructor\'s count.', 'Hands up but for the side that unwinds you.', 'Hold that light pull until you face the wing again.', 'Hands up and fly level for three seconds.'] },
});
