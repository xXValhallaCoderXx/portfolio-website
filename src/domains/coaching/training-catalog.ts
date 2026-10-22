import type { LessonId } from '../good-lift/trick-lessons.ts';

export type FoundationLessonId = 'steering' | 'thermal';
export type TrainingLessonId = LessonId | FoundationLessonId;
export const TRICK_TRAINING_LESSONS = Object.freeze(['pitch', 'spiral', 'wingover', 'loop'] as const);
export const TRAINING_LESSONS = Object.freeze(['steering', 'thermal', ...TRICK_TRAINING_LESSONS] as const);
export const isTrickLesson = (id: TrainingLessonId): id is LessonId => id !== 'steering' && id !== 'thermal';

interface TrainingLessonInfo {
  label: string; description: string; steps: readonly string[]; entry: number; abort: number;
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
});
