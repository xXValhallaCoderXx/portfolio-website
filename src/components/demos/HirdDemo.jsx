import { useEffect, useState } from 'react';

// A prerecorded research swarm, in Hird's own words for its seats, steps and timeline. Nothing
// runs: the script below is replayed, and each seat's "work" is a sample written for this page.

const TOPIC = 'What would it take to make the mobile app work offline?';
const BUDGET = 3;

const SEATS = {
  a: {
    name: 'Research agent A',
    step: 'investigate',
    said: 'Writes go straight to the API with no local queue. Three screens read through one fetch wrapper, so a cache has a single place to live.',
    cites: ['src/api/client.ts:12-58', 'src/screens/Orders.tsx:40-71'],
  },
  b: {
    name: 'Research agent B',
    step: 'investigate',
    said: 'Two mature options: a sync engine with its own store, or a request queue over the storage the app already has. The queue is the smaller change.',
    cites: ['search "offline" (14 matches)', 'package.json:18-44'],
  },
  t: {
    name: 'Technical evaluator',
    step: 'investigate',
    said: 'Conflicts are the real cost. Orders are edited by one user at a time, so last-write-wins is safe there; shared lists are not.',
    cites: ['src/models/order.ts:5-33', 'src/models/list.ts:20-64'],
  },
  s: {
    name: 'Synthesizer',
    step: 'synthesize',
    said: 'Recommend the request queue first: one wrapper to change, last-write-wins for orders, and shared lists kept online-only until conflicts are designed.',
    cites: ['3 of 3 researchers reported'],
  },
  ra: {
    name: 'Council reviewer A',
    step: 'council',
    said: 'Evidence quality: pass. Coverage: pass. A1 (advisory): no estimate of how large the local store could grow.',
    cites: ['rubric: evidence quality, coverage'],
  },
  rb: {
    name: 'Council reviewer B',
    step: 'council',
    said: 'Contradictions: none found. Recommendation follows from the findings. No blocking findings.',
    cites: ['rubric: contradictions, recommendation follows'],
  },
  c: {
    name: 'Council chair',
    step: 'council',
    said: 'F1 (advisory) kept from A1. No blocking findings, so the outcome is a pass.',
    cites: ['Council: Pass'],
  },
  report: {
    name: 'research report',
    step: 'report',
    said: 'Council: Pass. Start with a request queue for orders, keep shared lists online-only, and estimate how large the local store could grow.',
    cites: ['Research: offline support', 'Council advisory: local store size'],
  },
};

const STAGES = [
  { key: 'investigate', seats: ['a', 'b', 't'] },
  { key: 'synthesize', seats: ['s'] },
  { key: 'council', seats: ['ra', 'rb', 'c'] },
  { key: 'report', seats: ['report'] },
];

// The run, beat by beat: who starts or finishes, what the timeline says, and what has been spent.
const SCRIPT = [
  { line: 'Started investigate', start: ['a', 'b', 't'], spend: 0 },
  { line: 'Research agent A: read_file src/api/client.ts:12-58', spend: 0.01 },
  { line: 'Research agent B: search_code "offline"', spend: 0.02 },
  { line: 'Technical evaluator: read_file src/models/order.ts:5-33', spend: 0.04 },
  { line: 'Research agent A reported ($0.03)', done: ['a'], spend: 0.06 },
  { line: 'Research agent B reported ($0.04)', done: ['b'], spend: 0.08 },
  { line: 'Technical evaluator reported ($0.03)', done: ['t'], spend: 0.1 },
  { line: 'Finished investigate', start: ['s'], spend: 0.1 },
  { line: 'Synthesizer answered', done: ['s'], start: ['ra', 'rb'], spend: 0.14 },
  { line: 'Council reviewer A answered', done: ['ra'], spend: 0.17 },
  { line: 'Council reviewer B answered', done: ['rb'], start: ['c'], spend: 0.19 },
  { line: 'Council chair answered', done: ['c'], spend: 0.21 },
  { line: 'Created research-report: Research: offline support', report: true, spend: 0.21 },
];

const BEAT = 720; // milliseconds between beats

function stateAt(beat) {
  const seats = {};
  let report = false;
  for (const step of SCRIPT.slice(0, beat)) {
    for (const id of step.start ?? []) seats[id] = 'running';
    for (const id of step.done ?? []) seats[id] = 'done';
    report ||= !!step.report;
  }
  return { seats, report, spend: beat ? SCRIPT[beat - 1].spend : 0 };
}

function Seat({ id, state, picked, onPick }) {
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
  const [picked, setPicked] = useState(detail ? 's' : null);
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

  const pickSeat = (id) => {
    setPicked(id);
    setStage(SEATS[id].step);
  };
  const seatState = (id) => (id === 'report' ? (report ? 'done' : 'waiting') : seats[id]);
  const seat = (id) => <Seat id={id} state={seatState(id)} picked={picked === id} onPick={pickSeat} key={id} />;
  const timeline = SCRIPT.slice(0, beat).slice(compact ? -3 : -6);
  const inspected = picked && SEATS[picked];
  const activeStage = STAGES.find((item) => item.key === stage);
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
              · {inspected.step} · {seatState(picked) ?? 'waiting'}
            </span>
          </p>
          {seatState(picked) === 'done' ? (
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
