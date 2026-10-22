// Foundation completion is local presentation state, independent of automatic trick lessons.
export const FOUNDATION_LESSON_IDS = Object.freeze(['steering', 'thermal'] as const);
export const normalizeFoundationLessons = (value: unknown) => FOUNDATION_LESSON_IDS.filter(id => Array.isArray(value) && value.includes(id));
