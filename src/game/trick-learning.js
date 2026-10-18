// Device learning is presentation state. It never enters a recording or the shared simulation.
export const TRICK_LESSON_IDS = Object.freeze(['pitch', 'wingover']);
export const normalizeLearnedLessons = value => TRICK_LESSON_IDS.filter(id => Array.isArray(value) && value.includes(id));
