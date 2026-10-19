import { useEffect, useState } from 'react';

// Bulk payroll as a queue of payouts shared out between worker threads: the more workers, the
// fewer rounds a batch takes. A picture of the idea, with made-up numbers.

const PAYOUTS = 24;
const CHOICES = [1, 2, 3, 4];
const ROUND = 420; // milliseconds a worker takes over one payout

export default function Payroll() {
  const [workers, setWorkers] = useState(1);
  const [paid, setPaid] = useState(0);
  const [rounds, setRounds] = useState(0);
  const [running, setRunning] = useState(false);
  // How many rounds each number of workers took, for the ones tried so far.
  const [tried, setTried] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!running) return undefined;
    if (paid >= PAYOUTS) {
      setRunning(false);
      setTried((before) => ({ ...before, [workers]: rounds }));
      return undefined;
    }
    const timer = setTimeout(() => {
      setPaid(Math.min(PAYOUTS, paid + workers));
      setRounds(rounds + 1);
    }, ROUND);
    return () => clearTimeout(timer);
  }, [running, paid, rounds, workers]);

  const run = () => {
    setPaid(0);
    setRounds(0);
    setRunning(true);
  };

  return (
    <div className="demo payroll">
      <div className="payroll-flow">
        <div>
          <p className="stage-name">queue · {PAYOUTS - paid} waiting</p>
          <div className="payouts" aria-hidden="true">
            {Array.from({ length: PAYOUTS }, (_, i) => (
              <i className={i < paid ? 'paid' : running && i < paid + workers ? 'working' : undefined} key={i} />
            ))}
          </div>
        </div>
        <div>
          <p className="stage-name">worker threads</p>
          <ul className="lanes">
            {Array.from({ length: workers }, (_, i) => (
              <li className={running && paid + i < PAYOUTS ? 'busy' : undefined} key={i}>
                worker {i + 1}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p aria-live="polite">
        {paid} of {PAYOUTS} payouts sent in {rounds} {rounds === 1 ? 'round' : 'rounds'}
        {Object.keys(tried).length > 0 && (
          <span className="dim">
            {' '}
            ·{' '}
            {Object.entries(tried)
              .map(([count, took]) => `${count} ${count === '1' ? 'worker' : 'workers'}: ${took}`)
              .join(' · ')}
          </span>
        )}
      </p>
      <div className="demo-bar">
        <span className="efforts" role="group" aria-label="Number of worker threads">
          <span className="dim">workers</span>
          {CHOICES.map((count) => (
            <button
              className={count === workers ? 'on' : undefined}
              aria-pressed={count === workers}
              onClick={() => setWorkers(count)}
              disabled={running}
              key={count}
            >
              {count}
            </button>
          ))}
        </span>
        <button className="primary" onClick={run} disabled={running}>
          [ ▶ run the batch ]
        </button>
      </div>
      <p className="demo-note">// a picture of parallel processing with made-up numbers, not the real system</p>
    </div>
  );
}
