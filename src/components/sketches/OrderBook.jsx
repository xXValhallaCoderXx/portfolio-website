import { useEffect, useRef, useState } from 'react';

// The order book technique in miniature: a worker thread takes the stream of updates and keeps
// the book, and the page draws only the latest book to a canvas, once a frame. Turn the stream
// up and the drawing rate does not change.

const RATES = [50, 200, 1000, 5000];

function paint(canvas, book) {
  const scale = Math.min(2, devicePixelRatio || 1);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width * scale) {
    canvas.width = width * scale;
    canvas.height = height * scale;
  }
  const pen = canvas.getContext('2d');
  pen.setTransform(scale, 0, 0, scale, 0, 0);
  pen.clearRect(0, 0, width, height);
  const rows = book.bids.length;
  const row = height / rows;
  const half = width / 2;
  pen.font = '10px "JetBrains Mono", monospace';
  pen.textBaseline = 'middle';
  for (let i = 0; i < rows; i += 1) {
    const y = i * row;
    pen.fillStyle = 'rgba(45, 212, 238, 0.5)';
    pen.fillRect(half - 30 - book.bids[i] * (half - 34), y + 1, book.bids[i] * (half - 34), row - 2);
    pen.fillStyle = 'rgba(255, 157, 74, 0.5)';
    pen.fillRect(half + 30, y + 1, book.asks[i] * (half - 34), row - 2);
    pen.fillStyle = '#5d7a99';
    pen.textAlign = 'right';
    pen.fillText((book.mid - (i + 1) * 0.5).toFixed(1), half - 2, y + row / 2);
    pen.textAlign = 'left';
    pen.fillText((book.mid + (i + 1) * 0.5).toFixed(1), half + 2, y + row / 2);
  }
}

export default function OrderBook() {
  const [running, setRunning] = useState(false);
  const [rate, setRate] = useState(RATES[1]);
  const [seen, setSeen] = useState({ updates: 0, frames: 0 });
  const [broken, setBroken] = useState(false);
  const canvas = useRef(null);
  const worker = useRef(null);

  useEffect(() => {
    if (!running) return undefined;
    let book = null;
    let frame = 0;
    let frames = 0;
    let counted = 0;
    try {
      worker.current = new Worker(new URL('./orderbook.worker.js', import.meta.url), { type: 'module' });
    } catch {
      setBroken(true);
      setRunning(false);
      return undefined;
    }
    worker.current.onmessage = ({ data }) => {
      book = data;
    };
    worker.current.onerror = () => {
      setBroken(true);
      setRunning(false);
    };
    worker.current.postMessage({ rate, run: true });
    const draw = () => {
      if (book) paint(canvas.current, book);
      frames += 1;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    // Twice a second, report how many updates the worker took and how many frames were drawn.
    const report = setInterval(() => {
      if (!book) return;
      setSeen({ updates: (book.applied - counted) * 2, frames: frames * 2 });
      counted = book.applied;
      frames = 0;
    }, 500);
    // It stops by itself once it is scrolled out of sight.
    const watch = new IntersectionObserver(([entry]) => !entry.isIntersecting && setRunning(false));
    watch.observe(canvas.current);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(report);
      watch.disconnect();
      worker.current.terminate();
      worker.current = null;
    };
    // `rate` is sent to the running worker below; changing it must not restart the stream.
  }, [running]);

  useEffect(() => {
    worker.current?.postMessage({ rate });
  }, [rate]);

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
