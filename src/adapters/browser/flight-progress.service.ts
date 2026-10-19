import { emptyProgress, normalizeProgress, FLIGHT_STORE } from '../../domains/progression/achievements.ts';
import type { FlightProgress } from '../../domains/progression/models.ts';
let sessionProgress: FlightProgress | undefined;
export function readProgress() {
  let saved;
  try {
    saved = localStorage.getItem(FLIGHT_STORE);
  } catch {
    // Storage can be blocked; progress then lasts for the session only.
    return normalizeProgress(sessionProgress);
  }
  try {
    return normalizeProgress(JSON.parse(saved ?? '{}'));
  } catch {
    return emptyProgress();
  }
}

export function writeProgress(progress: FlightProgress) {
  sessionProgress = normalizeProgress(progress);
  try {
    localStorage.setItem(FLIGHT_STORE, JSON.stringify(sessionProgress));
  } catch {
    // See above.
  }
}
