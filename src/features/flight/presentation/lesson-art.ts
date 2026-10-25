import type { TrainingLessonId } from '../../../domains/coaching/training-catalog.ts';

// Each lesson's flight path (a 200 × 86 sketch), its level, its name on a small chip, and the hands
// (left, right, keys) for each of its steps.
export const LESSON_ART: Record<TrainingLessonId, { path: string; level: string; chip: string; inputs: readonly [number, number, string][] }> = {
  steering: { chip: 'STEER', path: 'M15 58 C40 58 30 22 60 25 S90 72 115 56 C137 42 147 24 132 23 C116 22 112 44 138 46 L182 46', level: 'START HERE', inputs: [[.3, 0, 'A / ←'], [0, .3, 'D / →'], [0, .82, 'Q / E · then release'], [.6, .6, 'SPACE · then release']] },
  thermal: { chip: 'CLIMB', path: 'M20 70 C42 70 55 59 80 56 C145 50 140 14 100 15 C60 16 65 51 110 49 C160 46 153 12 116 8', level: 'FOUNDATION', inputs: [[0, 0, 'HANDS UP'], [.2, .5, 'W + D / →'], [.2, .5, 'W + D / →']] },
  pitch: { chip: 'PITCH', path: 'M15 58 L55 58 C90 58 86 14 117 17 C145 19 133 58 183 58', level: 'EASY', inputs: [[.6, .6, 'SPACE'], [.6, .6, 'RELEASE → SPACE'], [0, 0, 'RELEASE']] },
  spiral: { chip: 'SPIRAL', path: 'M25 62 C95 73 168 65 160 35 C154 8 85 9 82 34 C79 58 137 60 137 35 C137 19 106 22 108 35', level: 'MEDIUM', inputs: [[0, .82, 'E'], [0, .82, 'HOLD E'], [0, 0, 'RELEASE']] },
  wingover: { chip: 'WINGOVER', path: 'M15 43 C45 3 69 3 100 43 C132 83 158 83 186 43', level: 'MEDIUM', inputs: [[0, .82, 'E'], [.82, 0, 'Q'], [0, 0, 'RELEASE']] },
  loop: { chip: 'LOOP', path: 'M15 69 L55 69 C103 69 147 7 107 7 C65 7 88 69 145 69 L185 69', level: 'HARD', inputs: [[0, 1, 'SHIFT + D / →'], [1, 0, 'SHIFT + A / ←'], [0, 0, 'RELEASE']] },
  stall: { chip: 'STALL', path: 'M15 24 L70 24 C82 24 84 44 80 56 C76 68 92 74 114 66 C138 57 150 52 185 52', level: 'MEDIUM', inputs: [[1, 1, 'SHIFT + SPACE'], [1, 1, 'HOLD'], [.6, .6, 'RELEASE → SPACE'], [0, 0, 'RELEASE']] },
  'wing-spiral': { chip: 'WING-SPIRAL', path: 'M12 44 C26 16 42 16 56 44 C70 72 86 72 100 44 C112 22 160 20 162 44 C164 66 120 68 124 46 C127 32 150 34 148 48', level: 'COMBO', inputs: [[0, .82, 'E'], [.82, 0, 'Q'], [.82, 0, 'HOLD Q'], [0, 0, 'RELEASE']] },
  heli: { chip: 'HELICOPTER', path: 'M15 20 L60 20 C68 20 70 34 66 42 C60 54 48 44 58 38 C70 31 80 46 72 54 C64 62 54 52 64 48 C80 42 100 62 130 60 L185 60', level: 'EN-C+', inputs: [[1, 1, 'SHIFT + SPACE'], [1, .6, 'SHIFT + SPACE + A'], [1, 1, 'SHIFT + SPACE → RELEASE'], [.6, .6, 'SPACE · then release']] },
  sat: { chip: 'SAT', path: 'M15 30 C40 30 50 16 70 22 C92 30 84 56 64 52 C46 48 52 28 70 30 C86 32 86 50 74 52 C60 54 66 36 80 40 C110 48 150 56 185 56', level: 'ACRO', inputs: [[.82, 0, 'Q'], [1, 0, 'SHIFT + Q'], [1, 0, 'HOLD'], [.6, .6, 'RELEASE → SPACE']] },
  'spiral-exit': { chip: 'SPIRAL EXIT', path: 'M24 44 C22 18 64 16 66 40 C68 62 30 64 32 42 C34 30 52 30 54 44 C58 68 92 70 112 44 C130 20 160 22 182 44', level: 'COMBO', inputs: [[0, .82, 'HOLD E'], [1, 0, 'SHIFT + Q'], [0, 0, 'HANDS UP'], [0, 0, 'RELEASE']] },
  // The recovery lessons (recovery-lessons.js), drawn for a failure on the left: the steps of its fix.
  collapse: { chip: 'COLLAPSE', path: 'M15 40 L70 40 C90 40 96 62 112 62 C130 62 128 44 142 42 L185 42', level: 'SIV · EN-A+', inputs: [[0, .3, 'D · stop the turn'], [.82, 0, 'Q · pump'], [0, .3, 'D · between pumps'], [0, 0, 'HANDS UP']] },
  frontal: { chip: 'FRONTAL', path: 'M15 30 L70 30 C80 30 84 62 100 62 C116 62 118 40 135 38 L185 38', level: 'SIV · EN-A+', inputs: [[0, 0, 'HANDS UP'], [.6, .6, 'S · a short pump (C+)'], [.6, .6, 'S · catch the dive'], [0, 0, 'HANDS UP']] },
  'deep-stall': { chip: 'DEEP STALL', path: 'M15 20 L60 20 C64 20 66 30 66 40 L66 62 C66 70 74 72 86 70 L185 66', level: 'SIV · EN-B+', inputs: [[0, 0, 'HANDS UP'], [0, 0, '↑ · speed bar'], [0, 0, 'HOLD ↑'], [.6, .6, 'S · catch the dive']] },
  spin: { chip: 'SPIN', path: 'M15 22 L60 22 C82 22 84 44 70 46 C56 48 60 30 74 32 C90 34 88 56 104 58 L185 60', level: 'SIV · EN-C+', inputs: [[0, 0, 'HANDS UP · at once'], [.6, .6, 'S · catch the dive'], [0, 0, 'HANDS UP']] },
  cravat: { chip: 'CRAVAT', path: 'M15 30 L60 30 C88 30 96 60 76 64 C58 68 60 44 86 46 C110 48 120 56 185 56', level: 'SIV · EN-C+', inputs: [[0, .3, 'D · stop the turn'], [.82, 0, 'HOLD Q · pull it free'], [0, .3, 'D · between pulls'], [1, 1, 'SHIFT + S · if it stays']] },
  twist: { chip: 'TWIST', path: 'M15 44 L60 44 C70 30 80 58 90 44 C100 30 110 58 120 44 L185 44', level: 'SIV · ACRO', inputs: [[0, 0, 'HANDS UP'], [.3, 0, 'A · the side that unwinds'], [0, 0, 'HANDS UP']] },
};

