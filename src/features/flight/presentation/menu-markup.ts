import { TRAINING_LESSONS, TRAINING_LESSON_INFO, type TrainingLessonId } from '../../../domains/coaching/training-catalog.ts';
import { LESSON_ART } from './lesson-art.ts';

/** Local catalogue strings only; never interpolate saved names or external data into markup. */
export function brakeDiagram(left: number, right: number) {
  return `<svg viewBox="0 0 44 48" width="36" height="40" aria-hidden="true">${[left, right].map((depth, i) => `<g transform="translate(${i * 23} 0)"><rect x="2" y="2" width="17" height="44" rx="8" fill="#0b1a2c" stroke="#3a5574"/><rect x="4" y="${4 + depth * 28}" width="13" height="12" rx="5" fill="${depth > .7 ? '#b6a1ff' : depth > 0 ? '#29c7e3' : '#9fb2c6'}"/></g>`).join('')}</svg>`;
}
export const lessonTiles = TRAINING_LESSONS.map(id => `<label class="fj-pause-lesson"><input type="radio" name="paused-lesson" value="${id}"><svg viewBox="0 0 200 86" width="42" height="26" aria-hidden="true"><path d="${LESSON_ART[id].path}" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/></svg><strong>${TRAINING_LESSON_INFO[id].label}</strong><small>${LESSON_ART[id].level}</small><span data-active-lesson="${id}" hidden>NOW</span></label>`).join('');
export function lessonGuidance(id: TrainingLessonId) {
  return TRAINING_LESSON_INFO[id].steps.map((step, index) => {
    const [left, right, keys] = LESSON_ART[id].inputs[index];
    return `<li><b>${index + 1}</b><span>${step}</span>${brakeDiagram(left, right)}<kbd>${keys}</kbd></li>`;
  }).join('');
}
// The lessons every wing is taught, for the hub's overview: the rotations are a glider's alone.
export const HUB_LESSONS = TRAINING_LESSONS.filter(id => !['heli', 'sat', 'recovery'].includes(TRAINING_LESSON_INFO[id].needs ?? ''));
export const menuMoves = HUB_LESSONS.map(id => `<span><svg viewBox="0 0 200 86" width="40" height="24" aria-hidden="true"><path d="${LESSON_ART[id].path}" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/></svg><span>${LESSON_ART[id].chip}</span></span>`).join('');
