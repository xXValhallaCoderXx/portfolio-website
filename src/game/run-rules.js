// Pure run limits shared by recording, live flight and the server replay judge.
export const RUN_RULES = Object.freeze({ step: 1 / 60, seconds: 600, maxSteps: 36_000, horn: 300, grace: 60 });

/** Endings that judge the carried bar and may enter a daily board. */
export const isJudgedEnding = (reason) => reason === 'fog' || reason === 'landed' || reason === 'time';
