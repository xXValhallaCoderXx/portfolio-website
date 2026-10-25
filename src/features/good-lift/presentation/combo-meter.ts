import { COMBO, DETECT, LINKS, MOVE_NAMES } from '../../../domains/good-lift/trick-tables.ts';
// The combo meter: the chain in hand, shown beside the pilot, where the eye already is while a
// trick is flown. Its first line is the chain, its latest three moves with the units of the one in
// hand, and the multiplier, with how far the variety in hand lets it climb shown faintly after it;
// its second what the combo would pay banked now, and a ring that fills as the wing settles to bank
// it. For a moment it says the named link or the flow a move joined by (on the card's top edge),
// the flight's word for hands on time (on its bottom edge), and what a combo banked or lost. In a
// run's last seconds with a combo in hand it says BANK NOW.
//
// It observes the style (meet-combo.js) and the trick watch (trick-watch.js) once a fixed step,
// saying what that step did so its sound lands in the same step, and draws once a frame by its own
// clock. It writes nothing back to a run, and once a chain is in hand neither observing nor
// drawing makes anything. Where the card goes is worked out by placeMeter, from where the pilot is
// on the screen and what was measured to be in its way.

export const COMBO_METER = Object.freeze({
  // Milliseconds each moment is shown for: a link's banner, the flight's word, a combo banked or
  // lost; and the pause before an outcome is said aloud, so the same words twice are said twice.
  banner: 900, word: 800, banked: 1600, lost: 1200, announce: 120,
  // Seconds before the run's time limit at which a combo in hand is told to bank.
  hurry: 10,
  // Pixels: the meter this far right of and above the pilot, kept `margin` off the screen's edges
  // and the readouts, or docked `gap` above the brake handles; and the room kept for the banner on
  // the card's top edge and the word on its bottom edge, which the meter stands on.
  right: 48, up: 24, margin: 8, gap: 10, above: 10, below: 10,
  // Pixels: the card's size until it has been measured, and how much higher beside the pilot it may
  // rise to stand clear of the handles (a laptop's screen puts the pilot just under their top).
  width: 220, height: 52, rise: 60,
  // Milliseconds the card stays docked once something was in its way beside the pilot, so a pilot
  // flying along the edge of the coach card never makes it flicker between the two.
  dwell: 800,
  // Pixels kept clear round the lines from the pilot up to the canopy: the card never covers the wing.
  wing: 14,
  // Pixels: the compact card's size, its multiplier and what banking would pay, docked where the
  // whole card has no clear place (a short landscape phone, its handles and buttons all along the
  // bottom), and the steps it is tried at along a docked row, out from the middle.
  compactWidth: 96, compactHeight: 30, compactStep: 8,
});

// The multiplier and its cap as written, from halves (×1 is 2 halves, ×2.5 is 5), and the bank
// ring's dash offset for each step round (out of a path 100 long): made once, so a frame makes no
// words. A combo banks after DETECT.settle fixed steps settled, 60 a second.
const TIMES = Object.freeze(Array.from({ length: COMBO.most + 1 }, (_, halves) => `×${halves / 2}`));
const CAPS = Object.freeze(TIMES.map((written) => `/${written}`));
const RING_STEPS = 60;
const RING = Object.freeze(Array.from({ length: RING_STEPS + 1 }, (_, step) => (100 - (100 * step) / RING_STEPS).toFixed(1)));
const SETTLE = DETECT.settle / 60;
// The moves by name, each kept to one line: a long chain wraps between its moves, never inside one.
const NAMES = Object.freeze(MOVE_NAMES.map((name) => name.replaceAll(' ', '\u00a0')));
// The flight's word for a pump that counted is a count (2/3); any other is the hands on time.
const COUNT = /\d/;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const number = (value: number) => value.toLocaleString('en-GB');
const times = (halves: number) => TIMES[clamp(halves, 0, COMBO.most)];
const caps = (halves: number) => CAPS[clamp(halves, 0, COMBO.most)];

/** What the meter reads of the style (meet-combo.js's state). */
export interface MeterStyle {
  elements: number; pending: number; multiplier: number; cap: number; flows: number; linked: readonly number[];
  move: number; units: number; value: number; bankCalm: number; sequence: readonly number[];
  landed: number; lost: number; said: number; total: number;
  lastCombo: { moves: number; sequence: readonly number[]; multiplier: number };
}
/** What it reads of the trick watch: the move being flown, and whether it still is. */
export interface MeterWatch { move: number; active: number }
export type MeterPhase = 'move' | 'unit' | 'link' | 'multiplier' | 'banked' | 'lost' | 'dropped';
/**
 * What one fixed step did to the chain, for its sounds: one object, written over every step.
 * `phase` is null for a step with nothing to hear; `units` are the move in hand's; `multiplier` is
 * in halves (a banked combo's own); `link` is the named link a move joined by (LINKS id, or 0) and
 * `flow` whether it flowed in; `points` what a combo banked or lost, or what the one in hand would
 * pay; `hurry` that BANK NOW was said for the first time this run.
 */
export interface MeterEvent {
  phase: MeterPhase | null; move: number; units: number; multiplier: number; link: number; flow: boolean; points: number; hurry: boolean;
}

/** The pilot on the screen this frame and the screen itself, in pixels from the stage's top left. */
export interface MeterFrame {
  x: number; y: number;
  // The canopy on the screen, where the pilot's lines lead (the pilot's own place when it is not seen).
  wingX: number; wingY: number;
  // Whether the pilot is in front of the camera and on the screen.
  seen: boolean;
  width: number; height: number;
  // Whether the card docks whatever is beside the pilot: a phone or a compact window, or less motion asked for.
  dock: boolean;
}
/**
 * What is in the card's way, measured now and then rather than every frame: `count` boxes in
 * `boxes`, four numbers each (left, top, right, bottom); `top` the bottom of the readouts, which it
 * never rises into; `dock` the top of the brake handles and their buttons, the line the card docks
 * above (Infinity with none showing); and `width` and `height`, the card's own size.
 */
export interface MeterLayout { boxes: Float64Array; count: number; top: number; dock: number; width: number; height: number }
/**
 * Where the card goes: its anchor (its bottom left beside the pilot, its bottom middle docked),
 * whether it is docked, whether that was for something in its way beside the pilot, which of its
 * docked places it took (DOCKS; -1 beside the pilot), which it keeps while that stays clear, and
 * whether it is compact there, no place being clear for the whole card.
 */
export interface MeterSpot { x: number; y: number; docked: boolean; blocked: boolean; slot: number; compact: boolean }

// The card's docked places, in the order they are tried: above the handles in the middle, then
// under the readouts in the middle, at the left and at the right.
const DOCKS = 4;

/** Room for `most` boxes in the card's way, and the card's size until it is measured. */
export function createMeterLayout(most: number): MeterLayout {
  return { boxes: new Float64Array(most * 4), count: 0, top: 0, dock: Infinity, width: COMBO_METER.width, height: COMBO_METER.height };
}

/** One more box in the card's way, while there is room for it. */
export function addBox(layout: MeterLayout, left: number, top: number, right: number, bottom: number) {
  const at = layout.count * 4;
  if (at + 4 > layout.boxes.length) return;
  layout.boxes[at] = left;
  layout.boxes[at + 1] = top;
  layout.boxes[at + 2] = right;
  layout.boxes[at + 3] = bottom;
  layout.count += 1;
}

// Whether the box from (left, top) to (right, bottom) touches any box in the layout.
function blocked(layout: Readonly<MeterLayout>, left: number, top: number, right: number, bottom: number) {
  const { boxes } = layout;
  for (let i = 0; i < layout.count * 4; i += 4) {
    if (left < boxes[i + 2] && right > boxes[i] && top < boxes[i + 3] && bottom > boxes[i + 1]) return true;
  }
  return false;
}

/**
 * Where the card goes this frame, into `out`: beside the pilot, `right` px to the side away from the
 * canopy (the other side when that is off the screen or in the way) and standing, with the word's
 * room under it, `up` px above them, or as much as `rise` px higher to stand clear of the handles;
 * or docked, when it must be (`frame.dock`, or `held` while a dock for something in its way lasts),
 * when the pilot is off the screen, or when beside the pilot it, its banner or its word would still
 * cover something in `layout` or the wing. Docked, it takes the first of its places (DOCKS) clear of
 * everything and the wing, keeping the one it had while that stays clear, so it never hops with the
 * pilot; with none clear for the whole card, it goes compact, as near the middle of a docked row
 * (above the handles, then under the readouts) as is clear, or, with nothing clear at all, above the
 * handles. Either way it keeps to the screen under the readouts, and `out.y` is the card's bottom.
 */
export function placeMeter(frame: Readonly<MeterFrame>, layout: Readonly<MeterLayout>, out: MeterSpot, held = false) {
  const { width, height } = frame, w = layout.width, h = layout.height;
  const { right, up, margin, gap, above, below, rise, wing } = COMBO_METER;
  const highest = Math.max(margin, layout.top + margin / 2) + above + h, lowest = height - margin - below;
  const docking = (Number.isFinite(layout.dock) ? layout.dock : height) - gap - below;
  // The pilot's lines up to the canopy, with room round them.
  const wingLeft = Math.min(frame.x, frame.wingX) - wing, wingRight = Math.max(frame.x, frame.wingX) + wing;
  const wingTop = Math.min(frame.y, frame.wingY) - wing, wingBottom = Math.max(frame.y, frame.wingY) + wing;
  const free = (left: number, top: number, end: number, bottom: number) => !blocked(layout, left, top, end, bottom) &&
    !(frame.seen && left < wingRight && end > wingLeft && top < wingBottom && bottom > wingTop);
  out.blocked = false;
  out.compact = false;
  if (!frame.dock && !held && frame.seen) {
    const away = frame.wingX > frame.x ? -1 : 1;
    for (let pass = 0; pass < 2; pass++) {
      const side = pass ? -away : away;
      const left = side > 0 ? frame.x + right : frame.x - right - w;
      if (left < margin || left + w > width - margin) continue;
      let bottom = clamp(frame.y - up - below, highest, lowest);
      let clear = free(left, bottom - h - above, left + w, bottom + below);
      const raised = clamp(docking, highest, lowest);
      if (!clear && raised < bottom && bottom - raised <= rise) {
        bottom = raised;
        clear = free(left, bottom - h - above, left + w, bottom + below);
      }
      if (clear) {
        out.docked = false;
        out.slot = -1;
        out.x = Math.round(left);
        out.y = Math.round(bottom);
        return out;
      }
    }
    out.blocked = true;
  }
  out.docked = true;
  const slot = findDock(w, h);
  if (slot >= 0) {
    out.slot = slot;
    dockAt(slot, w, h);
  } else {
    out.compact = true;
    out.slot = compactSpot(COMBO_METER.compactWidth, COMBO_METER.compactHeight);
  }
  out.x = Math.round(dock.x);
  out.y = Math.round(dock.bottom);
  return out;

  // The compact card has no banner or word to make room for: the clear place nearest the middle
  // of either docked row, or above the handles. The slot is the row's.
  function compactSpot(cw: number, ch: number) {
    for (let row = 0; row < 2; row++) {
      dockAt(row, cw, ch);
      const bottom = dock.bottom;
      for (let reach = 0; reach <= width / 2; reach += COMBO_METER.compactStep) {
        for (let sign = -1; sign <= 1; sign += 2) {
          const x = width / 2 + sign * reach;
          if (x - cw / 2 < margin || x + cw / 2 > width - margin) continue;
          if (free(x - cw / 2, bottom - ch - margin / 2, x + cw / 2, bottom + margin / 2)) {
            dock.x = x;
            dock.bottom = bottom;
            return row;
          }
        }
      }
    }
    dockAt(0, cw, ch);
    return 0;
  }

  // The docked place for a card `cw` by `ch`: the one it had while that stays clear, else the first clear, else -1.
  function findDock(cw: number, ch: number) {
    if (out.slot >= 0 && out.slot < DOCKS && dockFree(out.slot, cw, ch)) return out.slot;
    for (let i = 0; i < DOCKS; i++) if (dockFree(i, cw, ch)) return i;
    return -1;
  }
  function dockAt(i: number, cw: number, ch: number) {
    dock.x = i === 2 ? margin + cw / 2 : i === 3 ? width - margin - cw / 2 : width / 2;
    dock.bottom = i === 0 ? clamp(docking, highest - h + ch, lowest) : highest - h + ch;
  }
  function dockFree(i: number, cw: number, ch: number) {
    dockAt(i, cw, ch);
    return free(dock.x - cw / 2, dock.bottom - ch - above, dock.x + cw / 2, dock.bottom + below);
  }
}
// A docked place being tried, written over each time.
const dock = { x: 0, bottom: 0 };

interface TextNode { textContent: string | null }
interface ShownNode extends TextNode { hidden: string | boolean }
interface MeterNode { hidden: string | boolean; className: string; dataset: Record<string, string | undefined>; style: { transform: string } }
interface RingNode { style: { strokeDashoffset: string } }
/** The flight's word for hands on time (flight-effects.js's `good`): a new one each time `until` moves on. */
export interface FlightWord { word: string; until: number }

/**
 * The meter's DOM boundary, made once and reset for every run: `observe` once a fixed step, which
 * returns what the step did, for its sounds, or null; `present` once a frame, which says whether the
 * meter shows (`quiet` says an overlay is over the flight; `calm` that less motion is asked for:
 * nothing then pops); and `place` after it, with where the pilot is. `now` is its clock, in ms.
 */
export function createComboMeter({ element, banner, card, trail, hand, multiplier, cap, payout, ring, hurry, word, announce,
  now = () => performance.now() }: {
  element: MeterNode; banner: ShownNode; card: ShownNode; trail: TextNode; hand: TextNode; multiplier: TextNode; cap: TextNode;
  payout: TextNode; ring: RingNode; hurry: ShownNode; word: ShownNode; announce: TextNode; now?: () => number;
}) {
  const event: MeterEvent = { phase: null, move: 0, units: 0, multiplier: COMBO.start, link: 0, flow: false, points: 0, hurry: false };
  // What the last step left, to tell each change by.
  const seen = { landed: 0, lost: 0, total: 0, elements: 0, units: 0, move: 0, value: 0, pending: 0, multiplier: COMBO.start as number,
    links: 0, flows: 0, sequence: null as readonly number[] | null, hurried: false };
  // The chain in hand as it is drawn: its words, rebuilt only as they change, and its numbers.
  const held = { trail: '', hand: '', payout: '', elements: 0, multiplier: COMBO.start as number, cap: COMBO.start as number, ring: 0,
    live: false, hurry: false };
  // A combo banked or lost, in words, as the step that ended it left them.
  const told = { words: '', detail: '', multiplier: COMBO.start as number, said: '' };
  // What the steps have queued for the next frame: the latest phase, and a link's banner.
  const queued = { phase: null as MeterPhase | null, banner: '' };
  // What the frames show, and until when by the clock: the outcome, the banner, the flight's word
  // (and the `until` it was last heard by), the outcome said aloud at `sayAt`, the phase drawn and
  // the beat that restarts its animation, and the ring's step and whether the move is live as drawn.
  const shown = { outcome: null as 'banked' | 'lost' | null, until: -Infinity, banner: '', bannerUntil: -Infinity, word: '', wordUntil: -Infinity,
    heard: NaN, primed: false, sayAt: Infinity, phase: '', beat: 0, ring: -1, live: null as boolean | null };
  // Where the card goes, where it was last put, and until when it stays docked for something in its way.
  const spot: MeterSpot = { x: NaN, y: NaN, docked: false, blocked: false, slot: -1, compact: false };
  const placed = { x: NaN, y: NaN, docked: null as boolean | null, compact: null as boolean | null, until: -Infinity };

  const write = (node: TextNode, text: string) => { if (node.textContent !== text) node.textContent = text; };
  const show = (node: ShownNode | MeterNode, on: boolean) => { if (node.hidden !== !on) node.hidden = !on; };

  // Forgets everything seen: a new run.
  function forget() {
    seen.landed = seen.lost = seen.total = seen.elements = seen.units = seen.move = seen.value = seen.pending = seen.links = seen.flows = 0;
    seen.multiplier = COMBO.start;
    seen.sequence = null;
    seen.hurried = false;
    held.trail = held.hand = held.payout = '';
    held.elements = held.ring = 0;
    held.multiplier = held.cap = COMBO.start;
    held.live = held.hurry = false;
    queued.phase = null;
    queued.banner = '';
  }

  // The chain in hand in words: the moves before the latest, after how many came before those, and
  // the latest with its units while it is the move in hand and worth something.
  function name(style: Readonly<MeterStyle>) {
    const { sequence } = style, last = sequence.length - 1;
    let words = style.elements > sequence.length ? `+${style.elements - sequence.length} · ` : '';
    for (let i = 0; i < last; i++) words += `${NAMES[sequence[i]]} → `;
    const latest = last >= 0 ? NAMES[sequence[last]] : '';
    held.trail = words;
    held.hand = latest && style.units > 1 && style.value > 0 && style.move === sequence[last] ? `${latest} ×${style.units}` : latest;
  }

  // A banked combo's moves from its receipt, the latest three by name after how many came before.
  function receipt(sequence: readonly number[]) {
    const from = Math.max(0, sequence.length - 3);
    let words = from ? `+${from} · ` : '';
    for (let i = from; i < sequence.length; i++) words += i > from ? ` → ${NAMES[sequence[i]]}` : NAMES[sequence[i]];
    return words;
  }

  /**
   * One fixed step of the run, after its style has stepped: what it did to the chain in hand, as
   * the event to hear (null when nothing did). `remaining` is the seconds left to the time limit.
   */
  function observe(style: Readonly<MeterStyle>, watch: Readonly<MeterWatch>, remaining: number): MeterEvent | null {
    // The style was reset under the meter: a new run, and nothing seen of the last one counts.
    if (style.landed < seen.landed || style.lost < seen.lost || style.total < seen.total) forget();
    event.phase = null;
    event.link = 0;
    event.flow = false;
    event.hurry = false;
    event.move = style.move;
    event.units = style.units;
    event.multiplier = style.multiplier;
    event.points = style.pending;
    if (style.landed > seen.landed) {
      // Banked: what it paid and the moves it was, from its receipt.
      const combo = style.lastCombo;
      event.phase = 'banked';
      event.points = style.said;
      event.multiplier = combo.multiplier;
      told.words = `BANKED +${number(style.said)}`;
      told.detail = receipt(combo.sequence);
      told.multiplier = combo.multiplier;
      told.said = `${combo.moves > 1 ? 'Combo' : 'Move'} banked. ${number(style.said)} acro points.`;
      queued.banner = '';
    } else if (style.lost > seen.lost) {
      // Lost to a bail: what it would have paid, and the chain as the last step left it.
      event.phase = 'lost';
      event.points = style.said;
      event.multiplier = seen.multiplier;
      told.words = `COMBO LOST −${number(style.said)}`;
      told.detail = held.trail + held.hand;
      told.multiplier = seen.multiplier;
      told.said = `${seen.elements > 1 ? 'Combo' : 'Move'} lost. ${number(style.said)} acro points.`;
      queued.banner = '';
    } else if (seen.elements > 0 && style.elements === 0) {
      // Dropped unscored (the ears, assistance, the run's end): it goes quietly.
      event.phase = 'dropped';
      queued.banner = '';
    } else if (style.elements > seen.elements) {
      // A move joined: by a named link used for the first time in the combo, or flowing in, or
      // bringing variety that raised the multiplier, or simply as one more move.
      event.link = style.linked.length > seen.links ? style.linked[style.linked.length - 1] : 0;
      event.flow = style.flows > seen.flows;
      event.phase = event.link || event.flow ? 'link' : style.multiplier > seen.multiplier ? 'multiplier' : 'move';
      if (event.link) queued.banner = event.flow ? `${LINKS[event.link - 1].name} · FLOW` : LINKS[event.link - 1].name;
      else if (event.flow) queued.banner = 'FLOW';
    } else if (style.elements > 0 && style.move === seen.move && style.units > seen.units && style.value > 0) {
      // Another unit of the move in hand: another wingover pair, another turn of the spiral.
      event.phase = 'unit';
    }
    if (event.phase) queued.phase = event.phase;
    if (style.sequence !== seen.sequence || style.units !== seen.units || style.move !== seen.move ||
      style.elements !== seen.elements || style.value !== seen.value) name(style);
    if (style.pending !== seen.pending) held.payout = `+${number(style.pending)}`;
    held.elements = style.elements;
    held.multiplier = style.multiplier;
    held.cap = style.cap;
    held.ring = Math.round(clamp(style.bankCalm / SETTLE, 0, 1) * RING_STEPS);
    held.live = watch.active > 0 && watch.move === style.move;
    // BANK NOW: a combo in hand in the run's last seconds, said aloud once for each combo told so.
    held.hurry = style.elements > 0 && remaining > 0 && remaining <= COMBO_METER.hurry;
    if (held.hurry && !seen.hurried) seen.hurried = event.hurry = true;
    else if (style.elements === 0) seen.hurried = false;
    seen.landed = style.landed;
    seen.lost = style.lost;
    seen.total = style.total;
    seen.elements = style.elements;
    seen.units = style.units;
    seen.move = style.move;
    seen.value = style.value;
    seen.pending = style.pending;
    seen.multiplier = style.multiplier;
    seen.links = style.linked.length;
    seen.flows = style.flows;
    seen.sequence = style.sequence;
    return event.phase || event.hurry ? event : null;
  }

  // The phase drawn, which says what pops and in what colour.
  function phaseOf(phase: string) {
    if (shown.phase === phase) return;
    shown.phase = phase;
    element.dataset.phase = phase;
  }

  // A moment to pop: the beat alternates the animation's name, so the same phase twice runs it
  // twice without reading the layout. With less motion asked for, nothing pops.
  function pop(phase: MeterPhase, calm: boolean) {
    shown.beat = 1 - shown.beat;
    element.dataset.beat = shown.beat ? '1' : '0';
    phaseOf(phase);
    const className = calm ? 'fj-meter' : 'fj-meter pop';
    if (element.className !== className) element.className = className;
  }

  function dash(step: number) {
    if (step === shown.ring) return;
    shown.ring = step;
    ring.style.strokeDashoffset = RING[step];
  }

  /**
   * Draws the meter for this frame, by the clock: whether it shows. `flight` is the flight's word
   * for hands on time; the first look after a reset only notes where it stands, so a word from
   * before the run is never shown in it.
   */
  function present(quiet: boolean, calm: boolean, flight: Readonly<FlightWord>) {
    if (quiet) {
      clear();
      return false;
    }
    const clock = now();
    if (flight.until !== shown.heard) {
      if (shown.primed && flight.word) {
        shown.word = COUNT.test(flight.word) ? `PUMP ${flight.word}` : `✓ ${flight.word}`;
        shown.wordUntil = clock + COMBO_METER.word;
      }
      shown.heard = flight.until;
    }
    shown.primed = true;
    const phase = queued.phase;
    if (phase) {
      queued.phase = null;
      if (phase === 'banked' || phase === 'lost') {
        // Emptied now and said a moment later, so the same words twice are said twice.
        shown.outcome = phase;
        shown.until = clock + COMBO_METER[phase];
        shown.sayAt = clock + COMBO_METER.announce;
        write(announce, '');
      } else if (shown.outcome) {
        // A new move ends a banked or lost card at once: the chain in hand is the news.
        shown.outcome = null;
        shown.sayAt = Infinity;
        write(announce, '');
      }
      if (phase === 'dropped') shown.bannerUntil = -Infinity;
      else pop(phase, calm);
    }
    if (queued.banner) {
      shown.banner = queued.banner;
      shown.bannerUntil = clock + COMBO_METER.banner;
      queued.banner = '';
    }
    if (shown.outcome && clock >= shown.until) {
      shown.outcome = null;
      shown.sayAt = Infinity;
      write(announce, '');
      phaseOf('pending');
    }
    if (clock >= shown.sayAt) {
      shown.sayAt = Infinity;
      write(announce, told.said);
    }
    const telling = shown.outcome !== null, inHand = held.elements > 0, wordOn = clock < shown.wordUntil;
    const visible = telling || inHand || wordOn;
    show(element, visible);
    if (!visible) {
      if (element.className !== 'fj-meter') element.className = 'fj-meter';
      return false;
    }
    const bannerOn = !telling && inHand && clock < shown.bannerUntil;
    show(card, telling || inHand);
    show(banner, bannerOn);
    if (bannerOn) write(banner, shown.banner);
    show(word, wordOn);
    if (wordOn) write(word, shown.word);
    if (telling) {
      write(trail, '');
      write(hand, told.words);
      write(multiplier, times(told.multiplier));
      write(cap, '');
      write(payout, told.detail);
      dash(shown.outcome === 'banked' ? RING_STEPS : 0);
      show(hurry, false);
    } else if (inHand) {
      write(trail, held.trail);
      write(hand, held.hand);
      write(multiplier, times(held.multiplier));
      write(cap, caps(held.cap));
      write(payout, held.payout);
      dash(held.ring);
      show(hurry, held.hurry);
    }
    const live = inHand && !telling && held.live;
    if (live !== shown.live) {
      shown.live = live;
      element.dataset.live = live ? 'true' : 'false';
    }
    return true;
  }

  /** Puts the card where placeMeter says for the pilot at `frame`, written only as it moves. */
  function place(frame: Readonly<MeterFrame>, layout: Readonly<MeterLayout>) {
    const clock = now();
    placeMeter(frame, layout, spot, clock < placed.until);
    if (spot.blocked) placed.until = clock + COMBO_METER.dwell;
    if (spot.compact !== placed.compact) element.dataset.compact = spot.compact ? 'true' : 'false';
    placed.compact = spot.compact;
    if (spot.x === placed.x && spot.y === placed.y && spot.docked === placed.docked) return spot;
    if (spot.docked !== placed.docked) element.dataset.docked = spot.docked ? 'true' : 'false';
    placed.x = spot.x;
    placed.y = spot.y;
    placed.docked = spot.docked;
    element.style.transform = `translate(${spot.x}px, ${spot.y}px) translate(${spot.docked ? '-50%' : '0'}, -100%)`;
    return spot;
  }

  /** Hides the meter and drops its moments: a celebration held back is never shown late. */
  function clear() {
    queued.phase = null;
    queued.banner = '';
    shown.outcome = null;
    shown.bannerUntil = shown.wordUntil = -Infinity;
    shown.sayAt = Infinity;
    show(element, false);
    if (element.className !== 'fj-meter') element.className = 'fj-meter';
    write(announce, '');
  }

  /** A new run: nothing seen of the last one, nothing shown, and the card to be placed afresh. */
  function reset() {
    forget();
    clear();
    shown.primed = false;
    shown.heard = NaN;
    shown.live = null;
    phaseOf('');
    placed.x = placed.y = NaN;
    placed.docked = placed.compact = null;
    placed.until = -Infinity;
    spot.slot = -1;
    for (const node of [trail, hand, multiplier, cap, payout, banner, word]) write(node, '');
    show(hurry, false);
    shown.ring = -1;
    dash(0);
  }

  reset();
  return { observe, present, place, clear, reset };
}
