import { FEATS, comboLine } from '../../../domains/good-lift/meet-card.ts';
import { LINKS, MOVE_COUNT, MOVE_NAMES } from '../../../domains/good-lift/trick-tables.ts';
import { emptyBook, type TrickBook } from '../../../domains/progression/good-lift-store.ts';

// The meet sheet's tricks tab, worked out without a page: the trick book this device has kept
// (good-lift-store.js), with every move and named link there is (trick-tables.js) in the book's
// order, found or still to find, and the best combo it ever banked.

// How to find each move still missing from the book, by move id, in the words the lessons use.
const MOVE_HINTS = Object.freeze([
  '',
  'Pull both handles to working brake, release, and catch the forward swing.',
  'Swing the wing steep from side to side, changing hands at each top.',
  'Hold one handle deep until the wing banks steep and loads up, for half a turn.',
  'Drop into a spiral from a top past 80°, and hold it nearly on its side.',
  'From a spiral, brake the inside half until the wing turns round a point between you and it.',
  'From a full stall, let one hand up a little so the wing spins flat and slow over you.',
  'Build the swing until the wing goes right over the top and round.',
  'Hold both handles all the way down for two seconds, let them up together and catch the surge.',
  'Hold a full stall until the wing flies backwards for five seconds, then let it fly.',
]);

// How to find each named link still missing from the book, by link id.
const LINK_HINTS = Object.freeze([
  '',
  'Hold the turn at a wingover\'s top to dive into a spiral.',
  'Let a spiral go into a swing, and carry it on into wingovers.',
  'Brake a spiral\'s inside half and turn it straight into a SAT.',
  'Let a SAT fly forward again, straight into a spiral.',
  'Fly a SAT straight into another, with no pause between.',
  'Slow a SAT until it flattens out into a helicopter.',
  'Let a helicopter pick up speed and turn it into a SAT.',
  'Stop a helicopter and spin it the other way at once.',
  'Turn a full stall, or a tail slide, straight into a helicopter.',
  'Swing a wingover\'s top on past the vertical, into a loop.',
  'Carry a loop\'s swing on into wingovers.',
  'Turn a caught pitch swing into wingovers.',
]);

/** One page of the book: a move or a named link, found (`known`), or still a '?' whose `said` hints how. */
export interface BookPage { id: number; known: boolean; name: string; count: number; best: number; said: string; fresh: boolean }

const signed = (points: number) => `+${points.toLocaleString('en-GB')}`;
const named = (moves: readonly number[]) => moves.map((move) => MOVE_NAMES[move]).join(' / ');

/**
 * The tricks tab's view of `book` (a result's trick book; none reads as empty) after the run whose
 * own book was `run` (its sheet's stats.tricks, or none):
 *   moves, links   every move and named link, in id order: found ones by name, with how often the
 *                  book has banked them (`count`), a move's `best` value and a line that says both;
 *                  the rest as '?', their line a hint of how to find them. `fresh` marks one this
 *                  run banked for the first time (all the book has of it, this run banked).
 *   news           the names of those this run found first, moves before links
 *   found          how many moves and links are found
 *   best           the best combo banked, in words (meet-card.js comboLine), and its points; or null
 *   flows, mirror  the most flows in one combo banked, and whether one has flown a move both ways
 *   empty          nothing banked yet: the tab says so plainly
 */
export function buildTricksView(book?: TrickBook | null, run?: { moves: readonly number[]; links: readonly number[] } | null) {
  const kept = book ?? emptyBook();
  const firstBy = (counts: readonly number[], flown: readonly number[] | undefined, id: number) => counts[id] > 0 && flown?.[id] === counts[id];
  const moves: BookPage[] = [];
  for (let id = 1; id < MOVE_COUNT; id++) {
    const count = kept.moves[id], best = kept.best[id], known = count > 0;
    moves.push({ id, known, name: known ? MOVE_NAMES[id] : '?', count, best, fresh: firstBy(kept.moves, run?.moves, id),
      said: known ? `banked ×${count} · best ${signed(best)}` : MOVE_HINTS[id] });
  }
  const links = LINKS.map((link): BookPage => {
    const count = kept.links[link.id], known = count > 0;
    return { id: link.id, known, name: known ? link.name : '?', count, best: 0, fresh: firstBy(kept.links, run?.links, link.id),
      said: known ? `${named(link.from)} → ${named(link.to)} · banked ×${count}` : LINK_HINTS[link.id] };
  });
  const combo = kept.bestCombo;
  return {
    moves, links,
    news: [...moves, ...links].filter((page) => page.fresh).map((page) => page.name),
    found: { moves: moves.filter((move) => move.known).length, links: links.filter((link) => link.known).length },
    best: combo ? { said: comboLine(combo), points: signed(combo.points) } : null,
    flows: kept.flows, mirror: kept.mirror > 0,
    empty: !moves.some((move) => move.known),
  };
}

/**
 * The feats a sheet lists: the trick book's (meet-card.js FEATS `book`) only on a sheet that keeps a
 * trick book (`stats.tricks`), as every run's does; a sheet without one lists the rest.
 */
export const sheetFeats = (stats: { tricks?: unknown }) => FEATS.filter((feat) => !feat.book || !!stats.tricks);
