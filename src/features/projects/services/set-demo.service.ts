// The last set of a sample session, and what the next session becomes because of it. The session
// is the one on Sheetless's "Today" card. The rule below is a simplified stand-in written for this
// preview; it is not the app's own programming logic.

export const PLAN = { lift: 'Competition Bench Press', sets: 4, reps: 5, effort: 7, weight: 100, rest: 3 };
export const EFFORTS = [6, 7, 8, 9, 10];

/** What the next top set is, and why, after the last set went for `reps` at an effort of `effort`. */
export function nextSession(reps: number, effort: number) {
  if (reps < PLAN.reps) {
    return { change: -2.5, why: `You got ${reps} of ${PLAN.reps} reps, so the top set comes down 2.5 kg and you build back up.` };
  }
  if (effort >= 9) {
    return { change: -2.5, why: `All ${PLAN.reps} reps, but at RPE ${effort}: well above the plan. The top set comes down 2.5 kg.` };
  }
  if (effort === 8) {
    return { change: 0, why: `All ${PLAN.reps} reps at RPE 8: a little harder than planned, so the weight stays where it is.` };
  }
  if (effort === 7) {
    return { change: 2.5, why: `All ${PLAN.reps} reps at RPE 7: exactly on plan, so the top set goes up 2.5 kg.` };
  }
  return { change: 5, why: `All ${PLAN.reps} reps at RPE ${effort}: easier than planned, so the top set goes up 5 kg.` };
}

