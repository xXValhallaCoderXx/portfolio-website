import { TRAINING_LESSON_INFO, type TrainingLessonId } from '../../../domains/coaching/training-catalog.ts';

export type MenuContext = 'free-form' | 'game' | 'training';
export interface MenuStats {
  best: number; streak: number;
  medals: { medal: string; score: number; by: string }[];
  // The gliders the next run can be flown on, once they fly (null until then).
  glider?: GliderMenu | null;
}
/** A glider as the launch hub offers it: its names, and what it still asks when it is not yet earned. */
export interface GliderOption { id: string; name: string; badge: string; role: string; earned: boolean; lock: string }
/** The glider the next run flies (`worn`), and every one there is. */
export interface GliderMenu { worn: string; options: GliderOption[] }
export function menuContext(mode: string): MenuContext {
  return mode === 'training' ? 'training' : mode === 'cloudbase' || mode === 'cloudbase-ended' ? 'game' : 'free-form';
}

/** A preview selection has no authority to change the active lesson. */
export function lessonSelection(active: TrainingLessonId, selected: TrainingLessonId, flying = true) {
  const same = active === selected;
  return { active, selected, same, resume: same && flying,
    action: same && flying ? 'Resume lesson' : `Start ${TRAINING_LESSON_INFO[selected].label}` };
}

const STEERING_PHASES = ['level', 'turn-first', 'release-first', 'turn-second', 'release-second', 'turn-sharp', 'release-sharp', 'brake', 'recovery'];
const STEERING_LABELS = ['Settle the wing', 'Gentle first turn', 'Release and settle', 'Gentle other turn', 'Release and settle', 'Sharper turn', 'Release and settle', 'Slow down', 'Recover level'];

/** Group only phases that belong to the same physical task. No elapsed-time inference. */
export function lessonStage(lesson: TrainingLessonId, phase: string, status = 'flying') {
  if (lesson === 'steering') {
    const index = STEERING_PHASES.indexOf(phase);
    return { index, count: STEERING_PHASES.length, label: status === 'complete' ? 'Complete' : STEERING_LABELS[index] ?? 'Awaiting flight cue' };
  }
  if (lesson === 'thermal') {
    const index = phase === 'level' ? 0 : phase === 'circle' || phase === 'ease' ? 2 : phase ? 1 : -1;
    return { index, count: 3, label: status === 'complete' ? 'Complete' : ['Settle the wing', 'Find and join rising air', 'Circle and climb'][index] ?? 'Awaiting flight cue' };
  }
  const index = phase === 'level' ? 0 : ['recover', 'recovery', 'complete', 'banked'].includes(phase) ? 2 : phase ? 1 : -1;
  return { index, count: 3, label: status === 'complete' ? 'Complete' : ['Settle the wing', 'Build and complete the move', 'Recover level to bank'][index] ?? 'Awaiting flight cue' };
}
