/** A toy market model used only by the portfolio's worker illustration. */
export interface OrderBookSnapshot { mid: number; bids: number[]; asks: number[]; applied: number }
export interface OrderBookCommand { rate?: number; run?: boolean }
export const BOOK_LEVELS = 12;
export const BOOK_INTERVAL = 20;

export function createOrderBookService(random: () => number = Math.random) {
  const book: OrderBookSnapshot = { mid: 100, bids: Array<number>(BOOK_LEVELS).fill(0), asks: Array<number>(BOOK_LEVELS).fill(0), applied: 0 };
  let owed = 0;
  function update() {
    const side = random() < 0.5 ? book.bids : book.asks;
    const level = Math.floor(random() ** 2 * BOOK_LEVELS);
    side[level] = Math.max(0, Math.min(1, side[level] + (random() - 0.48) * 0.35));
    if (random() < 0.004) book.mid = Math.max(90, Math.min(110, book.mid + (random() < 0.5 ? -0.5 : 0.5)));
    book.applied += 1;
  }
  return {
    initialize() {
      for (let i = 0; i < BOOK_LEVELS * 8; i += 1) update();
      book.applied = 0;
    },
    step(rate: number) {
      owed += (rate * BOOK_INTERVAL) / 1000;
      while (owed >= 1) { update(); owed -= 1; }
      return book;
    },
  };
}
