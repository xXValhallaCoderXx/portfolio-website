import assert from 'node:assert/strict';
import test from 'node:test';
import { createNavigationService, DAILY, type NavigationState } from './navigation.service.ts';

function browserAt(path: string, saved: NavigationState | null = null) {
  let index = 0;
  const entries = [{ url: new URL(path, 'https://portfolio.test'), state: saved }];
  const location = {
    get pathname() { return entries[index].url.pathname; },
    get search() { return entries[index].url.search; },
    get hash() { return entries[index].url.hash; },
  };
  const history = {
    get state() { return entries[index].state; },
    replaceState(state: NavigationState | null, _unused: string, href?: string | URL | null) {
      entries[index] = { state, url: href ? new URL(href, entries[index].url) : entries[index].url };
    },
    pushState(state: NavigationState | null, _unused: string, href?: string | URL | null) {
      const url = href ? new URL(href, entries[index].url) : entries[index].url;
      entries.splice(index + 1); entries.push({ state, url }); index += 1;
    },
    go(delta: number) { index = Math.max(0, Math.min(entries.length - 1, index + delta)); },
    back() { this.go(-1); },
  };
  return { service: createNavigationService({ location, history, scroll: () => 740 }), location, history, entries };
}

test('direct routes and missing paths remain distinct', () => {
  assert.equal(browserAt('/projects/hird').service.detailAddress()?.section, 'projects');
  assert.equal(browserAt('/experience/a1f09e2').service.detailAddress()?.section, 'experience');
  assert.equal(browserAt('/good-lift?sky=1').service.gameAddress()?.sky, 1);
  assert.equal(browserAt('/fly').service.isFlightAddress(), true);
  assert.equal(browserAt('/projects/missing').service.missingAddress(), '/projects/missing');
  assert.equal(browserAt('/index.html').service.missingAddress(), null);
});

test('detail chains preserve original scroll, focus and experience view', () => {
  const { service, history, location } = browserAt('/#experience');
  service.openDetail('experience', 'a1f09e2', 'list');
  service.openDetail('projects', 'hird');
  assert.equal(history.state?.returnTo?.scroll, 740);
  assert.equal(history.state?.returnTo?.focus, '/experience/a1f09e2');
  assert.equal(history.state?.returnTo?.experienceView, 'list');
  assert.equal(service.closeDetail(), null);
  assert.equal(location.hash, '#experience');
  assert.equal(history.state?.scroll, 740);
});

test('moving between experience roles keeps browser history and the original overview return', () => {
  const { service, history, location } = browserAt('/#experience');
  service.openDetail('experience', '7c3b91a', 'list');
  service.openDetail('experience', '4e82d10');
  assert.equal(location.pathname, '/experience/4e82d10');
  assert.equal(service.detailAddress()?.section, 'experience');
  assert.equal(history.state?.returnTo?.experience, '7c3b91a');
  assert.equal(history.state?.returnTo?.experienceView, 'list');
  history.back();
  assert.equal(location.pathname, '/experience/7c3b91a');
  history.go(1);
  assert.equal(location.pathname, '/experience/4e82d10');
  assert.equal(service.closeDetail(), null);
  assert.equal(location.pathname + location.hash, '/#experience');
  assert.equal(history.state?.scroll, 740);
  assert.equal(history.state?.focus, '/experience/7c3b91a');
  assert.equal(history.state?.experienceView, 'list');
});

test('moving from a directly opened role can return to the experience overview', () => {
  const { service, location } = browserAt('/experience/a1f09e2');
  service.openDetail('experience', '7c3b91a');
  assert.equal(service.closeDetail(), 'experience');
  assert.equal(location.pathname + location.hash, '/#experience');
});

test('flight returns to the original history entry, including from a detail page', () => {
  const { service, location, history } = browserAt('/projects/hird');
  service.takeFlight();
  assert.equal(location.pathname, '/fly');
  assert.equal(history.state?.home, 1);
  service.leaveFlight();
  assert.equal(location.pathname, '/projects/hird');
  assert.equal(history.state?.scroll, 740);
});

test('landing opens the requested section and direct flights can leave safely', () => {
  const { service, location } = browserAt('/fly');
  service.leaveFlight('projects');
  assert.equal(location.pathname + location.hash, '/#projects');
  const direct = browserAt('/fly');
  direct.service.leaveFlight();
  assert.equal(direct.location.pathname, '/');
});

test('game changes replace its entry and leaving restores the fjord', () => {
  const { service, location, entries } = browserAt('/fly', { flight: true, home: 1 });
  service.enterGame(DAILY);
  const count = entries.length;
  service.enterGame({ kind: 'sky', sky: 3, vs: null, bad: null });
  assert.equal(entries.length, count);
  assert.equal(location.search, '?sky=00000003');
  service.leaveGame();
  service.syncLeaving();
  assert.equal(location.pathname, '/fly');
});

test('leaving Good Lift repairs a replaced fjord entry', () => {
  const { service, location, history } = browserAt('/fly', { flight: true, home: 0 });
  service.enterGame(DAILY);
  history.go(-1); history.replaceState(null, '', '/'); history.go(1);
  service.leaveGame(); service.syncLeaving();
  assert.equal(location.pathname, '/fly');
  assert.equal(history.state?.home, 0);
});
