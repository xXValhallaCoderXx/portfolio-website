import { useState } from 'react';
import { EFFORTS, PLAN, nextSession } from '../../services/set-demo.service.ts';

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
