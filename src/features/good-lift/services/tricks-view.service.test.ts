import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyBook } from '../../../domains/progression/good-lift-store.ts';
import { FEATS } from '../../../domains/good-lift/meet-card.ts';
import { LINKS, MOVE, MOVE_COUNT, MOVE_NAMES } from '../../../domains/good-lift/trick-tables.ts';
import { buildTricksView, sheetFeats } from './tricks-view.service.ts';

const link = (name: string) => LINKS.find((each) => each.name === name)!.id;

test('an empty trick book is every move and named link still to find, each with a hint of how, and says it is empty', () => {
  for (const book of [emptyBook(), undefined, null]) {
    const view = buildTricksView(book);
    assert.equal(view.empty, true);
    assert.deepEqual(view.moves.map((page) => page.id), Array.from({ length: MOVE_COUNT - 1 }, (_, i) => i + 1), 'every move, in the book\'s order');
    assert.deepEqual(view.links.map((page) => page.id), LINKS.map((each) => each.id));
    for (const page of [...view.moves, ...view.links]) {
      assert.deepEqual([page.known, page.name, page.count, page.fresh], [false, '?', 0, false], String(page.id));
      assert.match(page.said, /^[A-Z].{20,100}\.$/, `a one-line hint for ${page.id}`);
    }
    assert.equal(new Set(view.moves.map((page) => page.said)).size, view.moves.length, 'a hint of its own for each move');
    assert.equal(new Set(view.links.map((page) => page.said)).size, view.links.length, 'and for each link');
    assert.deepEqual(view.found, { moves: 0, links: 0 });
    assert.deepEqual([view.best, view.flows, view.mirror, view.news], [null, 0, false, []]);
  }
  assert.equal(buildTricksView().links.find((page) => page.id === link('WING-SPIRAL'))!.said, 'Hold the turn at a wingover\'s top to dive into a spiral.');
});

test('the moves and links a book has banked are named, with how often and the best of each, and those this run found first are new', () => {
  const book = emptyBook();
  book.moves[MOVE.wingover] = 5; book.best[MOVE.wingover] = 1_250;
  book.moves[MOVE.spiral] = 1; book.best[MOVE.spiral] = 15;
  book.links[link('WING-SPIRAL')] = 1;
  book.bestCombo = { points: 450, moves: 5, sequence: [MOVE.wingover, MOVE.spiral], links: [0, link('WING-SPIRAL')] };
  book.flows = 2; book.points = 450; book.mirror = 1;
  const before = structuredClone(book);
  // This run banked the only spiral and the only WING-SPIRAL there are, and two of the five wingovers.
  const run = { moves: new Array(MOVE_COUNT).fill(0), links: new Array(LINKS.length + 1).fill(0) };
  run.moves[MOVE.wingover] = 2; run.moves[MOVE.spiral] = 1; run.links[link('WING-SPIRAL')] = 1;
  const view = buildTricksView(book, run);
  assert.equal(view.empty, false);
  const move = (id: number) => view.moves.find((page) => page.id === id)!;
  assert.deepEqual(move(MOVE.wingover), { id: MOVE.wingover, known: true, name: 'WINGOVERS', count: 5, best: 1_250, said: 'banked ×5 · best +1,250', fresh: false });
  assert.deepEqual(move(MOVE.spiral), { id: MOVE.spiral, known: true, name: MOVE_NAMES[MOVE.spiral], count: 1, best: 15, said: 'banked ×1 · best +15', fresh: true });
  assert.equal(move(MOVE.loop).known, false);
  const wing = view.links.find((page) => page.id === link('WING-SPIRAL'))!;
  assert.deepEqual([wing.known, wing.name, wing.said, wing.fresh], [true, 'WING-SPIRAL', 'WINGOVERS → SPIRAL DIVE / ASYM SPIRAL · banked ×1', true]);
  assert.deepEqual(view.found, { moves: 2, links: 1 });
  assert.deepEqual(view.news, ['SPIRAL DIVE', 'WING-SPIRAL'], 'what this run found first, moves before links');
  assert.deepEqual(view.best, { said: '+3 earlier · WINGOVERS ⟨wing-spiral⟩ SPIRAL DIVE', points: '+450' });
  assert.deepEqual([view.flows, view.mirror], [2, true]);
  // Without the run's own book, nothing is new.
  assert.ok(buildTricksView(book).moves.every((page) => !page.fresh));
  assert.deepEqual(buildTricksView(book).news, []);
  assert.deepEqual(book, before, 'the view only reads the book');
});

test('a sheet lists the trick book\'s feats only when it keeps a trick book, so today\'s sheet lists today\'s feats', () => {
  const today = sheetFeats({});
  assert.deepEqual(today.map((feat) => feat.id), ['opener', 'under-the-horn', 'giant-dodger', 'clean-meet', 'thousand-pound-club', 'wingover-five', 'pitched-45',
    'training-block', 'beat-the-bot']);
  assert.deepEqual(sheetFeats({ tricks: undefined }), today);
  assert.deepEqual(sheetFeats({ tricks: { moves: [], links: [] } }), FEATS);
});
