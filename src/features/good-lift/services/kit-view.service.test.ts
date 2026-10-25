import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore, kitSheet } from '../../../domains/progression/good-lift-store.ts';
import { emptyKit } from '../../../domains/progression/wing-kit.ts';
import { asks, buildKitView, gliderMenu, nameOf, pieceName } from './kit-view.service.ts';

test('kit view derives unlock progress and independent choices without changing progression', () => {
  const store = emptyStore();
  store.tonnage = 75;
  const sheet = kitSheet(store, { ...emptyKit(), wing: 'raven' }, ['raven']);
  const before = structuredClone(sheet);
  const view = buildKitView(sheet);
  assert.ok(view.fresh.has('raven'));
  assert.ok(view.wings.includes('standard'));
  assert.equal(view.piece('standard').earned, true);
  assert.ok(view.done >= 0 && view.done <= 1);
  view.state(view.piece('raven'));
  assert.deepEqual(sheet, before);
});

const banked = (tonnage: number, feats: string[] = []) => ({ ...emptyStore(), tonnage, feats });

test('a glider says every ask it has, each with whether it is met, and is named with its class', () => {
  const sheet = kitSheet(banked(800, ['opener']), emptyKit(), []);
  const item = (id: string) => sheet.items.find((each) => each.id === id)!;
  assert.equal(asks(item('en-c'), sheet), '750 kg ✓ · First link — bank a named link: a wingover dived into a spiral, say');
  assert.equal(asks(item('en-d'), sheet), '2 t banked · 1,200 kg to go · Wingover ×5 — land five linked wingovers past 50°');
  assert.equal(asks(item('acro'), sheet), 'unlock Sleipnir first · Flow ×3 — bank a combo with three flows: moves begun before the last one settled');
  assert.equal(pieceName(item('en-b')), 'Fylgja · EN-B glider');
  assert.equal(nameOf('acro'), 'Loki');
});

test('the launch hub is offered every glider, the ones not yet earned with what they ask, and flies the one worn', () => {
  const menu = gliderMenu(banked(200), { glider: 'en-c' });
  assert.deepEqual(menu.options.map((option) => [option.id, option.earned]), [['en-a', true], ['en-b', true], ['en-c', false], ['en-d', false], ['acro', false]]);
  assert.equal(menu.worn, 'en-a', 'a glider not earned is not flown');
  assert.match(menu.options[2].lock, /^750 kg banked · 550 kg to go · First link/);
  assert.equal(menu.options[0].lock, '');
  assert.deepEqual([menu.options[4].badge, menu.options[4].name], ['ACRO', 'Loki']);
  assert.equal(gliderMenu(banked(200), { glider: 'en-b' }).worn, 'en-b');
});
