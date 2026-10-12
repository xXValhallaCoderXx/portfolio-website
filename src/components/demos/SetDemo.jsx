import { useState } from 'react';

// The last set of a sample session, and what the next session becomes because of it. The session
// is the one on Sheetless's "Today" card. The rule below is a simplified stand-in written for this
// preview; it is not the app's own programming logic.

const PLAN = { lift: 'Competition Bench Press', sets: 4, reps: 5, effort: 7, weight: 100, rest: 3 };
const EFFORTS = [6, 7, 8, 9, 10];

/** What the next top set is, and why, after the last set went for `reps` at an effort of `effort`. */
function nextSession(reps, effort) {
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

export default function SetDemo() {
  const [reps, setReps] = useState(PLAN.reps);
  const [effort, setEffort] = useState(PLAN.effort);
  const [done, setDone] = useState(false);
  const next = nextSession(reps, effort);
  return (
    <div className="demo set-demo">
      <p className="demo-ask">
        <span className="dim">today · week 3 · day 2</span> {PLAN.lift}
      </p>
      <p className="prescription">
        {PLAN.sets} × {PLAN.reps} @ RPE {PLAN.effort} · top set {PLAN.weight} kg · rest {PLAN.rest} min
      </p>

      <ol className="sets">
        {Array.from({ length: PLAN.sets - 1 }, (_, i) => (
          <li className="logged" key={i}>
            <span>set {i + 1}</span>
            <span>
              {PLAN.weight} kg × {PLAN.reps}
            </span>
            <span className="dim">RPE {PLAN.effort}</span>
            <b aria-label="done">✓</b>
          </li>
        ))}
        <li className={done ? 'logged' : 'live'}>
          <span>set {PLAN.sets}</span>
          <span className="stepper">
            {PLAN.weight} kg ×{' '}
            <button onClick={() => setReps(Math.max(1, reps - 1))} disabled={done || reps <= 1} aria-label="One rep fewer">
              −
            </button>
            <output aria-label="Reps">{reps}</output>
            <button onClick={() => setReps(Math.min(PLAN.reps, reps + 1))} disabled={done || reps >= PLAN.reps} aria-label="One rep more">
              +
            </button>
          </span>
          <span className="efforts" role="group" aria-label="How hard it was, as RPE">
            <span className="dim">RPE</span>
            {EFFORTS.map((value) => (
              <button
                className={value === effort ? 'on' : undefined}
                aria-pressed={value === effort}
                onClick={() => setEffort(value)}
                disabled={done}
                key={value}
              >
                {value}
              </button>
            ))}
          </span>
          {done && <b aria-label="done">✓</b>}
        </li>
      </ol>

      <div className={`next-session${done ? ' shown' : ''}`} aria-live="polite">
        <span className="dim">next session</span>
        {done ? (
          <>
            <p>
              {PLAN.lift} · {PLAN.sets} × {PLAN.reps} @ RPE {PLAN.effort} · top set{' '}
              <b className={next.change > 0 ? 'up' : next.change < 0 ? 'down' : undefined}>
                {PLAN.weight + next.change} kg{next.change !== 0 && ` (${next.change > 0 ? '+' : '−'}${Math.abs(next.change)})`}
              </b>
            </p>
            <p className="why">{next.why}</p>
          </>
        ) : (
          <p className="dim">// finish the last set to see what comes next</p>
        )}
      </div>

      <div className="demo-bar">
        {done ? (
          <button onClick={() => setDone(false)}>[ ↺ try another outcome ]</button>
        ) : (
          <button className="primary" onClick={() => setDone(true)}>
            [ ✓ complete set ]
          </button>
        )}
      </div>
      <p className="demo-note">// a simplified rule for this preview, not the app's own programming</p>
    </div>
  );
}
