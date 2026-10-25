import type { TrickWatch } from './models.ts';
// A run's style: chain combos scored from the trick watch (trick-watch.js). Every move confirmed
// joins the combo in hand; its value grows with its band and units, falls for a move repeated to
// the same side, and the whole combo is multiplied by what made it a chain: each different move,
// each named link used for the first time, each flow (the next move begun before the last one's
// energy settled). Three seconds settled bank the combo into the run's style; a bail (a fold, a
// strike, a stall or spin not asked for) loses it; ears and assistance drop it unscored. A combo
// flown again exactly as one already banked this run pays less. Integer arithmetic only, every
// value a multiple of 5, so the server's replay pays to the point. It only reads the watch and
// writes nothing back to the run.
import { COMBO, DETECT, LINK_COUNT, LINKS, MOVE, MOVE_COUNT, TRICKS, isBail } from './trick-tables.ts';

const MOST = 24;
const round5 = (value: number, divisor: number) => 5 * Math.floor((value + divisor / 2) / divisor);

/** A banked (or best) combo's receipt: its points and its moves, the latest last. */
export interface ComboReceipt {
  points: number; base: number; variety: number; moves: number; mask: number; sequence: number[];
  links: number[]; sides: number[]; flows: number; multiplier: number;
}
const emptyReceipt = (): ComboReceipt => ({ points: 0, base: 0, variety: 0, moves: 0, mask: 0, sequence: [], links: [], sides: [], flows: 0, multiplier: 2 });

/** One move's value: 5·round(base·c·grade·units·repeat / divisor), 0 for a move short of its first band. */
export function moveValue(move: number, band: number, units: number, repeats: number, c: number = TRICKS[move]?.c ?? 0) {
  if (band < 1 || units < 1) return 0;
  const n = COMBO.base * c * COMBO.grade[Math.min(band, 4) - 1] * COMBO.units[Math.min(units, COMBO.units.length) - 1] *
    COMBO.repeat[Math.min(repeats, COMBO.repeat.length - 1)];
  return round5(n, COMBO.divisor);
}

/** A combo's payout: the sum of its values times its multiplier (in halves), to the nearest 5. */
export const comboPayout = (sum: number, multiplier: number) => round5(sum * multiplier, 10);

/**
 * The style of one run, made once and reset for every run. Its `state` carries
 * what the meet sheet and the readouts read (total, landed, lost, said, pending,
 * elements, last, sequence, bankCalm, lastCombo, bestCombo, wingovers, mostLoops, mostSpirals, pitch)
 * and the chain's own: `multiplier` and `cap` (in halves), `sum` (the moves' values), `flows`,
 * `linked` (named links in the combo, by id, latest last), `move`, `units`, `band` and `value` of
 * the move in hand, and `book`: what this run banked of each move and link and each move's best value,
 * and its most: flows in one banked combo, points in one, and whether one flew a move both ways.
 */
export function createComboStyle() {
  const moves = new Int8Array(MOST), sides = new Int8Array(MOST), units = new Int16Array(MOST), bands = new Int8Array(MOST);
  const coefficients = new Int16Array(MOST), counted = new Uint8Array(MOST), values = new Int32Array(MOST);
  const linkOf = new Int8Array(MOST), flowOf = new Uint8Array(MOST), measures = new Int16Array(MOST);
  const state = {
    total: 0, pending: 0, elements: 0, links: 0, last: 0, landed: 0, lost: 0, said: 0, sequence: [] as number[], bankCalm: 0,
    armed: true, bankedAt: -Infinity, lostAt: -Infinity, wingovers: 0, mostLoops: 0, mostSpirals: 0, pitch: 0,
    multiplier: COMBO.start as number, cap: COMBO.start as number, sum: 0, flows: 0, linked: [] as number[], move: 0, units: 0, band: 0, value: 0,
    lastCombo: emptyReceipt(), bestCombo: emptyReceipt(),
    book: { moves: new Array<number>(MOVE_COUNT).fill(0), links: new Array<number>(LINK_COUNT).fill(0), best: new Array<number>(MOVE_COUNT).fill(0),
      flows: 0, points: 0, mirror: 0 },
  };
  // What the watch had counted when last read, and the combos banked this run, by their moves.
  const seen = { instances: 0, units: 0, breaks: 0 };
  const banked = new Map<string, number>();
  let n = 0, credits = 0, usedLinks = 0, mask = 0, dirty = false;

  function clear() {
    n = credits = usedLinks = mask = 0;
    state.pending = state.elements = state.links = state.last = state.sum = state.flows = state.bankCalm = 0;
    state.move = state.units = state.band = state.value = 0;
    state.multiplier = state.cap = COMBO.start;
    state.sequence = []; state.linked = [];
  }

  function reset() {
    clear();
    state.total = state.landed = state.lost = state.said = state.wingovers = state.mostLoops = state.mostSpirals = state.pitch = 0;
    state.armed = true; state.bankedAt = state.lostAt = -Infinity;
    state.lastCombo = emptyReceipt(); state.bestCombo = emptyReceipt();
    state.book.moves.fill(0); state.book.links.fill(0); state.book.best.fill(0);
    state.book.flows = state.book.points = state.book.mirror = 0;
    seen.instances = seen.units = seen.breaks = 0;
    banked.clear();
  }

  // Values every move in the combo again: a move's repeats are the moves before it to the same side.
  function price() {
    let sum = 0, distinct = 0;
    for (let i = 0; i < n; i++) {
      let repeats = 0;
      for (let j = 0; j < i; j++) if (moves[j] === moves[i] && sides[j] === sides[i] && counted[j]) repeats += 1;
      values[i] = counted[i] ? moveValue(moves[i], bands[i], units[i], repeats, coefficients[i]) : 0;
      sum += values[i];
    }
    for (let move = 1; move < MOVE_COUNT; move++) if (mask & (1 << move)) distinct += 1;
    state.cap = Math.min(COMBO.most, Math.max(COMBO.start, COMBO.perMove * distinct));
    state.multiplier = Math.min(state.cap, COMBO.start + credits);
    state.sum = sum;
    // What banking now would pay: less, if the very same combo has been banked already this run.
    const again = COMBO.again[Math.min(banked.get(keyOf()) ?? 0, COMBO.again.length - 1)];
    state.pending = round5(comboPayout(sum, state.multiplier) * again, 500);
    state.value = n ? values[n - 1] : 0;
  }

  // A move counts once it reaches its first band: then it adds to the chain, once.
  function count(i: number) {
    if (counted[i] || bands[i] < 1) return;
    counted[i] = 1;
    const bit = 1 << moves[i];
    if (!(mask & bit)) { mask |= bit; credits += 1; }
    const link = linkOf[i];
    if (link && !(usedLinks & (1 << link))) { usedLinks |= 1 << link; credits += 1; state.linked = [...state.linked, link]; }
    if (flowOf[i]) { credits += 1; state.flows += 1; }
    state.elements += 1; state.links = state.elements;
    state.sequence = [...state.sequence.slice(-2), moves[i]];
  }

  // The combo in hand by its moves and their sides: the very same one banked again pays less.
  const keyOf = () => Array.from(moves.subarray(0, n), (move, i) => counted[i] ? `${move}${sides[i]}` : '').join('.');

  function bank(now: number) {
    const key = keyOf();
    banked.set(key, (banked.get(key) ?? 0) + 1);
    // Exactly what was shown in hand.
    const points = state.pending;
    state.total += points;
    state.landed += 1; state.bankedAt = now; state.said = points;
    let wingovers = 0, loops = 0, spirals = 0;
    for (let i = 0; i < n; i++) {
      if (!counted[i]) continue;
      if (moves[i] === MOVE.pitch) state.pitch = Math.max(state.pitch, measures[i]);
      state.book.moves[moves[i]] += 1;
      state.book.best[moves[i]] = Math.max(state.book.best[moves[i]], values[i]);
      if (linkOf[i]) state.book.links[linkOf[i]] += 1;
      if (moves[i] === MOVE.wingover) wingovers += units[i];
      else if (moves[i] === MOVE.loop) loops += units[i];
      else if (moves[i] === MOVE.spiral || moves[i] === MOVE.asym) spirals += units[i];
    }
    state.wingovers = Math.max(state.wingovers, wingovers);
    state.mostLoops = Math.max(state.mostLoops, loops);
    state.mostSpirals = Math.max(state.mostSpirals, spirals);
    const sequence: number[] = [], links: number[] = [], sideways: number[] = [];
    let mirror = 0;
    for (let i = 0; i < n; i++) {
      if (!counted[i]) continue;
      sequence.push(moves[i]); links.push(linkOf[i]); sideways.push(sides[i]);
      for (let j = 0; j < i; j++) if (counted[j] && moves[j] === moves[i] && sides[i] !== 0 && sides[j] === -sides[i]) mirror = 1;
    }
    state.book.flows = Math.max(state.book.flows, state.flows);
    state.book.points = Math.max(state.book.points, points);
    state.book.mirror = Math.max(state.book.mirror, mirror);
    state.lastCombo = { points, base: state.sum, variety: state.multiplier - COMBO.start, moves: state.elements, mask, sequence, links,
      sides: sideways, flows: state.flows, multiplier: state.multiplier };
    if (points > state.bestCombo.points || points === state.bestCombo.points && state.elements > state.bestCombo.moves)
      state.bestCombo = { ...state.lastCombo, sequence: [...sequence], links: [...links], sides: [...sideways] };
    clear();
  }

  /** One fixed step of the run in `world`, after its trick watch has stepped. */
  function step(_dt: number, world: { tricks: TrickWatch }) {
    const watch = world.tricks.state;
    const now = watch.steps;
    if (watch.breaks > seen.breaks) {
      seen.breaks = watch.breaks;
      if (state.elements > 0 && isBail(watch.broke)) { state.lost += 1; state.lostAt = now; state.said = state.pending; }
      clear();
      state.armed = false;
      seen.instances = watch.instances; seen.units = watch.unitCount;
    }
    if (!state.armed && watch.settled >= DETECT.rearm) state.armed = true;
    if (watch.instances > seen.instances) {
      seen.instances = watch.instances; seen.units = watch.unitCount;
      if (state.armed && n < MOST) {
        const i = n++;
        moves[i] = watch.move; sides[i] = watch.side; units[i] = watch.units; bands[i] = watch.band; measures[i] = watch.measure;
        linkOf[i] = watch.link; flowOf[i] = watch.flow; counted[i] = 0; dirty = true;
        const linked = watch.link ? LINKS[watch.link - 1].c : 0;
        coefficients[i] = Math.max(TRICKS[watch.move]?.c ?? 0, linked);
        count(i);
        state.last = watch.move;
      }
    } else if (watch.unitCount > seen.units) {
      seen.units = watch.unitCount;
      if (n > 0 && moves[n - 1] === watch.move) { units[n - 1] = watch.units; bands[n - 1] = watch.band; measures[n - 1] = watch.measure; count(n - 1); dirty = true; }
    } else if (n > 0 && moves[n - 1] === watch.move && watch.band > bands[n - 1]) {
      bands[n - 1] = watch.band; measures[n - 1] = watch.measure; count(n - 1); dirty = true;
    }
    if (dirty && n > 0) {
      price();
      state.move = moves[n - 1]; state.units = units[n - 1]; state.band = bands[n - 1];
    }
    dirty = false;
    // Settled for long enough, with something in hand: the combo banks.
    state.bankCalm = state.elements > 0 ? Math.min(DETECT.settle, watch.settled) / 60 : 0;
    if (state.elements > 0 && watch.settled >= DETECT.settle) bank(now);
    else if (n > 0 && state.elements === 0 && !watch.active && watch.settled >= DETECT.settle) clear();
  }

  /** The run is over: a combo still in hand lands none of it. */
  function finish(_reason?: string) {
    clear();
  }

  return { reset, step, finish, get state() { return state; } };
}
