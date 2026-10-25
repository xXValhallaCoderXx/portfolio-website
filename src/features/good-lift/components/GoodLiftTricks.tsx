import type { TrickBook } from '../../../domains/progression/good-lift-store.ts';
import { buildTricksView, type BookPage } from '../services/tricks-view.service.ts';

// The meet sheet's tricks tab: the trick book this device has kept (good-lift-store.js), every move
// and named link the combos have banked here, how often and the best of each, those still to find as
// a '?' with a hint of how, and the best combo ever banked. It only reads: the book fills as the store
// records a run's sheet, and tricks-view.service.js works out what is shown. Like the
// rest of the sheet it ships with the game, never with the page.

/** One page of the book, lit once found as an earned feat is, and marked new when this run found it. */
function Page({ page, kind }: { page: BookPage; kind: string }) {
  return (
    <li className={`${page.known ? 'earned' : ''}${page.fresh ? ' fresh' : ''}`.trim() || undefined}>
      <b>
        {page.known ? page.name : <><span aria-hidden="true">?</span><span className="good-lift-hide">{kind} not yet found</span></>}
      </b>
      {page.fresh && <em> new</em>}
      <span>{page.said}</span>
    </li>
  );
}

/** What this run found first for the trick book, said as the sheet opens, as new kit is (KitNews). */
export function TricksNews({ book, run }: { book?: TrickBook | null; run?: { moves: readonly number[]; links: readonly number[] } | null }) {
  const { news } = buildTricksView(book, run);
  if (!news.length) return null;
  return <p className="good-lift-fresh">new in the trick book: {news.join(' · ')} — see [ tricks ]</p>;
}

/** The tricks tab, from `book` (the result's trick book) and `run` (its own sheet's, to mark what it found first). */
export default function GoodLiftTricks({ book, run }: { book?: TrickBook | null; run?: { moves: readonly number[]; links: readonly number[] } | null }) {
  const { moves, links, found, best, flows, mirror, empty } = buildTricksView(book, run);
  return (
    <div className="good-lift-trick-book">
      {empty && <p className="dim">// the trick book is empty: moves and named links go into it as combos bank.</p>}
      <h3 className="good-lift-section-title">BEST COMBO <span>{best ? `${best.points} pts` : 'none banked yet'}</span></h3>
      {best && (
        <>
          <p className="good-lift-book-best">{best.said}</p>
          <p className="dim">most flows in one combo: {flows} · {mirror ? 'a move flown both ways' : 'no move flown both ways yet'}</p>
        </>
      )}
      <h3 className="good-lift-section-title">MOVES <span>{found.moves} / {moves.length} found</span></h3>
      <ul className="good-lift-feats good-lift-book" aria-label="Moves">
        {moves.map((page) => <Page key={page.id} page={page} kind="move" />)}
      </ul>
      <h3 className="good-lift-section-title">NAMED LINKS <span>{found.links} / {links.length} found</span></h3>
      <ul className="good-lift-feats good-lift-book" aria-label="Named links">
        {links.map((page) => <Page key={page.id} page={page} kind="link" />)}
      </ul>
      <p className="dim">// the book holds every combo banked on this device; reset progress clears it with the rest.</p>
    </div>
  );
}
