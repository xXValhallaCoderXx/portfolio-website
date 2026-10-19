import { useEffect, useState } from 'react';
import { BEAT, BUDGET, SCRIPT, SEATS, STAGES, TOPIC, stateAt, type SeatId, type SeatStatus } from '../../services/hird-demo.service.ts';

function Seat({ id, state, picked, onPick }: { id: SeatId; state?: SeatStatus; picked: boolean; onPick: (id: SeatId) => void }) {
  const result = id === 'report';
  return (
    <button
      type="button"
      className={`seat ${state ?? 'waiting'}${result ? ' result' : ''}${picked ? ' picked' : ''}`}
      onClick={() => onPick(id)}
      aria-pressed={picked}
    >
      <i aria-hidden="true" />
      {result && state === 'done' ? 'Council: Pass · report ready' : SEATS[id].name}
    </button>
  );
}

/** Cards use a shorter timeline; the detail page also gets a stage selector on small screens. */
export default function HirdDemo({ compact = false, detail = false }) {
  const [beat, setBeat] = useState(0);
  const [running, setRunning] = useState(false);
  const [picked, setPicked] = useState<SeatId | null>(detail ? 's' : null);
  const [stage, setStage] = useState('synthesize');
  const { seats, report, spend } = stateAt(beat);

  useEffect(() => {
    if (!running) return undefined;
    if (beat >= SCRIPT.length) {
      setRunning(false);
      return undefined;
    }
    const timer = setTimeout(() => setBeat(beat + 1), BEAT);
    return () => clearTimeout(timer);
  }, [running, beat]);

  const launch = () => {
    setPicked(null);
    setStage('investigate');
    setBeat(0);
    setRunning(true);
  };

  const pickSeat = (id: SeatId) => {
    setPicked(id);
    setStage(SEATS[id].step);
  };
  const seatState = (id: SeatId) => (id === 'report' ? (report ? 'done' : 'waiting') : seats[id]);
  const seat = (id: SeatId) => <Seat id={id} state={seatState(id)} picked={picked === id} onPick={pickSeat} key={id} />;
  const timeline = SCRIPT.slice(0, beat).slice(compact ? -3 : -6);
  const inspected = picked ? SEATS[picked] : null;
  const activeStage = STAGES.find((item) => item.key === stage) ?? STAGES[0];
  return (
    <div className={`demo hird-demo${detail ? ' detail' : ''}`}>
      <p className="demo-ask">
        <span className="dim">research topic</span> {TOPIC}
      </p>
      <div className="swarm">
        {STAGES.map((item) => (
          <div className="stage" key={item.key}>
            <span className="stage-name">{item.key}</span>
            {item.key === 'report' && !detail ? (
              <span className={`seat result ${report ? 'done' : 'waiting'}`}>
                <i aria-hidden="true" />
                {report ? 'Council: Pass · report ready' : 'research report'}
              </span>
            ) : (
              item.seats.map(seat)
            )}
          </div>
        ))}
      </div>
      {detail && (
        <div className="swarm-mobile">
          <div className="swarm-track" role="group" aria-label="Research stages">
            {STAGES.map((item, index) => (
              <button type="button" key={item.key} aria-pressed={stage === item.key} onClick={() => pickSeat(item.seats[0])}>
                <span aria-hidden="true">{index + 1}</span>
                {item.key}
              </button>
            ))}
          </div>
          <div className="swarm-seats" role="group" aria-label={`${stage} seats`}>
            {activeStage.seats.map(seat)}
          </div>
        </div>
      )}

      {inspected ? (
        <div className="inspect" aria-live="polite">
          <p>
            <b>{inspected.name}</b>{' '}
            <span className="dim">
              · {inspected.step} · {seatState(picked!) ?? 'waiting'}
            </span>
          </p>
          {seatState(picked!) === 'done' ? (
            <>
              <p>{inspected.said}</p>
              <p className="dim">{inspected.cites.join(' · ')}</p>
            </>
          ) : (
            <p className="dim">// nothing to read yet: this seat has not answered</p>
          )}
        </div>
      ) : (
        <ol className="timeline" aria-live="off">
          {timeline.length === 0 && <li className="dim">// launch the swarm, then click any seat to read what it found</li>}
          {timeline.map((step) => (
            <li key={step.line}>{step.line}</li>
          ))}
        </ol>
      )}

      <div className="demo-bar">
        <button type="button" className={`launch${beat === 0 ? ' primary' : ''}`} onClick={launch} disabled={running}>
          [ {beat === 0 ? '▶ launch swarm' : running ? 'running…' : '↺ run it again'} ]
        </button>
        {picked && (
          <button type="button" className="link" onClick={() => setPicked(null)}>
            {detail ? (
              <>[ <span className="timeline-back">back to the </span>timeline ]</>
            ) : (
              '[ back to the timeline ]'
            )}
          </button>
        )}
        <span className="spacer" />
        <span className="meter" title="Budget for API seats: a hard limit">
          <i style={{ width: `${(spend / BUDGET) * 100}%` }} />
          <span>
            ${spend.toFixed(2)} of ${BUDGET.toFixed(2)}
          </span>
        </span>
      </div>
      <p className="demo-note">// a prerecorded sample: no agents run and nothing is spent</p>
    </div>
  );
}
