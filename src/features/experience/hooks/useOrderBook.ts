import { useEffect, useRef, useState } from 'react';
import type { OrderBookSnapshot } from '../services/orderbook.service.ts';
import { paintOrderBook } from '../presentation/orderbook.ts';
export const RATES = [50, 200, 1000, 5000];

export function useOrderBook() {
  const [running, setRunning] = useState(false);
  const [rate, setRate] = useState(RATES[1]);
  const [seen, setSeen] = useState({ updates: 0, frames: 0 });
  const [broken, setBroken] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const worker = useRef<Worker | null>(null);

  useEffect(() => {
    if (!running) return undefined;
    let book: OrderBookSnapshot | null = null;
    let frame = 0;
    let frames = 0;
    let counted = 0;
    try {
      worker.current = new Worker(new URL('../components/sketches/orderbook.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      setBroken(true);
      setRunning(false);
      return undefined;
    }
    worker.current.onmessage = ({ data }: MessageEvent<OrderBookSnapshot>) => {
      book = data;
    };
    worker.current.onerror = () => {
      setBroken(true);
      setRunning(false);
    };
    worker.current.postMessage({ rate, run: true });
    const draw = () => {
      if (book) paintOrderBook(canvas.current!, book);
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
    watch.observe(canvas.current!);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(report);
      watch.disconnect();
      worker.current?.terminate();
      worker.current = null;
    };
    // `rate` is sent to the running worker below; changing it must not restart the stream.
  }, [running]);

  useEffect(() => {
    worker.current?.postMessage({ rate });
  }, [rate]);

  return { running, setRunning, rate, setRate, seen, broken, canvas };
}
