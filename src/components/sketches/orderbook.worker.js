// A toy order book kept off the main thread. It applies a stream of made-up updates at whatever
// rate it is asked for, and posts the latest book back fifty times a second.

const LEVELS = 12;
const EVERY = 20; // milliseconds between posts

const book = { mid: 100, bids: new Array(LEVELS).fill(0), asks: new Array(LEVELS).fill(0), applied: 0 };
let rate = 200;
let owed = 0;
let timer = 0;

function update() {
  const side = Math.random() < 0.5 ? book.bids : book.asks;
  // Most activity is near the middle of the book.
  const level = Math.floor(Math.random() ** 2 * LEVELS);
  side[level] = Math.max(0, Math.min(1, side[level] + (Math.random() - 0.48) * 0.35));
  if (Math.random() < 0.004) book.mid = Math.max(90, Math.min(110, book.mid + (Math.random() < 0.5 ? -0.5 : 0.5)));
  book.applied += 1;
}

function round() {
  owed += (rate * EVERY) / 1000;
  while (owed >= 1) {
    update();
    owed -= 1;
  }
  postMessage(book);
}

onmessage = ({ data }) => {
  if (data.rate) rate = data.rate;
  if (data.run && !timer) {
    for (let i = 0; i < LEVELS * 8; i += 1) update();
    book.applied = 0;
    timer = setInterval(round, EVERY);
  }
};
