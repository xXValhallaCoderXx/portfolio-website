import type { TrainingLessonId } from '../../../domains/coaching/training-catalog.ts';

export const LESSON_ART: Record<TrainingLessonId, { path: string; level: string; inputs: readonly [number, number, string][] }> = {
  steering: { path: 'M15 58 C40 58 30 22 60 25 S90 72 115 56 C137 42 147 24 132 23 C116 22 112 44 138 46 L182 46', level: 'START HERE', inputs: [[.3, 0, 'A / ←'], [0, .3, 'D / →'], [0, .82, 'Q / E · then release'], [.6, .6, 'SPACE · then release']] },
  thermal: { path: 'M20 70 C42 70 55 59 80 56 C145 50 140 14 100 15 C60 16 65 51 110 49 C160 46 153 12 116 8', level: 'FOUNDATION', inputs: [[0, 0, 'HANDS UP'], [.2, .5, 'W + D / →'], [.2, .5, 'W + D / →']] },
  pitch: { path: 'M15 58 L55 58 C90 58 86 14 117 17 C145 19 133 58 183 58', level: 'EASY', inputs: [[.6, .6, 'SPACE'], [.6, .6, 'RELEASE → SPACE'], [0, 0, 'RELEASE']] },
  spiral: { path: 'M25 62 C95 73 168 65 160 35 C154 8 85 9 82 34 C79 58 137 60 137 35 C137 19 106 22 108 35', level: 'MEDIUM', inputs: [[0, .82, 'E'], [0, .82, 'HOLD E'], [0, 0, 'RELEASE']] },
  wingover: { path: 'M15 43 C45 3 69 3 100 43 C132 83 158 83 186 43', level: 'MEDIUM', inputs: [[0, .82, 'E'], [.82, 0, 'Q'], [0, 0, 'RELEASE']] },
  loop: { path: 'M15 69 L55 69 C103 69 147 7 107 7 C65 7 88 69 145 69 L185 69', level: 'HARD', inputs: [[0, 1, 'SHIFT + D / →'], [1, 0, 'SHIFT + A / ←'], [0, 0, 'RELEASE']] },
};

