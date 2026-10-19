import type { OrderBookSnapshot } from '../services/orderbook.service.ts';

export function paintOrderBook(canvas: HTMLCanvasElement, book: OrderBookSnapshot) {
  const scale = Math.min(2, devicePixelRatio || 1);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width * scale) {
    canvas.width = width * scale;
    canvas.height = height * scale;
  }
  const pen = canvas.getContext('2d')!;
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

