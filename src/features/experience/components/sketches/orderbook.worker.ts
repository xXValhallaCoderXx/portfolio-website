import { BOOK_INTERVAL, createOrderBookService, type OrderBookCommand } from '../../services/orderbook.service.ts';

const model = createOrderBookService();
let rate = 200;
let timer: ReturnType<typeof setInterval> | null = null;

onmessage = ({ data }: MessageEvent<OrderBookCommand>) => {
  if (data.rate) rate = data.rate;
  if (data.run && !timer) {
    model.initialize();
    timer = setInterval(() => postMessage(model.step(rate)), BOOK_INTERVAL);
  }
};
