import { RATES, useOrderBook } from '../../hooks/useOrderBook.ts';

export default function OrderBook() {
  const { running, setRunning, rate, setRate, seen, broken, canvas } = useOrderBook();
  return (
    <div className="demo orderbook">
      <canvas ref={canvas} role="img" aria-label="A toy order book: bids on the left, asks on the right, redrawn as updates arrive." />
      <p aria-live="off">
        {running ? (
          <>
            worker: <b>{seen.updates.toLocaleString('en')}</b> updates/s <span className="dim">·</span> canvas: <b>{seen.frames}</b>{' '}
            frames/s
          </>
        ) : (
          <span className="dim">// start the stream, then turn it up: the drawing rate stays the same</span>
        )}
      </p>
      {broken && <p className="warn">// this browser would not start a worker thread</p>}
      <div className="demo-bar">
        <button className={running ? undefined : 'primary'} onClick={() => setRunning(!running)}>
          [ {running ? '■ stop' : '▶ start the stream'} ]
        </button>
        <span className="efforts" role="group" aria-label="Updates per second">
          <span className="dim">updates/s</span>
          {RATES.map((value) => (
            <button className={value === rate ? 'on' : undefined} aria-pressed={value === rate} onClick={() => setRate(value)} key={value}>
              {value.toLocaleString('en')}
            </button>
          ))}
        </span>
      </div>
      <p className="demo-note">// a toy with random numbers: a real worker thread and a real canvas, no real market</p>
    </div>
  );
}
