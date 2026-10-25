import test from 'node:test';
import assert from 'node:assert/strict';
import { MUSIC, createMusic, musicGain } from './music.ts';
import { GLIDERS, nominalFor } from '../../../domains/good-lift/gliders.ts';
import { windLevelDb } from '../../flight/presentation/wind-tone.ts';

// Stand-ins for the browser's audio: a media element that plays, is refused, or keeps a play
// waiting (`pending`) until it is paused, given a new track or refused; and an audio context whose
// gains remember where they were sent and what they were set to.
function fakes({ refuse = false, pending = false } = {}) {
  interface FakeGain { gain: { value: number; target: number | null; setTargetAtTime(value: number): void; cancelScheduledValues(): void }; connect(next: {name?:string}): {name?:string}; disconnect(): void }
  const log: { plays: number; pauses: number; gains: FakeGain[]; connections: string[][] } = { plays: 0, pauses: 0, gains: [], connections: [] };
  let waiting: { resolve(value: void): void; reject(reason: Error): void } | null = null;
  const cut = () => {
    waiting?.reject(new Error('AbortError'));
    waiting = null;
  };
  const element = {
    preload: 'auto', paused: true, listeners: {} as Record<string, (() => void) | undefined>, error: null as {code:number} | null, file: '',
    // A new track starts a new load: any error is forgotten, and a waiting play is cut short.
    get src() { return this.file; },
    set src(value) {
      cut();
      this.file = value;
      this.error = null;
    },
    play() {
      log.plays += 1;
      if (refuse) return Promise.reject(new Error('NotAllowedError'));
      if (this.error) return Promise.reject(new Error('NotSupportedError'));
      if (pending) return new Promise<void>((resolve, reject) => (waiting = { resolve, reject }));
      this.paused = false;
      return Promise.resolve();
    },
    pause() {
      log.pauses += 1;
      this.paused = true;
      cut();
    },
    addEventListener(type: string, handler: () => void) { this.listeners[type] = handler; },
    removeEventListener(type: string) { delete this.listeners[type]; },
    removeAttribute(name: string) { if (name === 'src') this.src = ''; },
    end() { this.listeners.ended?.(); },
    // The track would not load.
    fail() {
      this.error = { code: 4 };
      this.listeners.error?.();
    },
    refuseWaiting() {
      waiting?.reject(new Error('NotAllowedError'));
      waiting = null;
    },
  };
  const destination = { name: 'speakers' };
  const ctx = {
    currentTime: 0,
    destination,
    createGain() {
      const node = {
        gain: { value: 1, target: null as number | null, setTargetAtTime(value: number) { this.target = value; }, cancelScheduledValues() {} },
        connect(next: {name?:string}) { log.connections.push(['gain', next.name ?? 'node']); return next; },
        disconnect() { log.connections.push(['gain', 'gone']); },
      };
      log.gains.push(node);
      return node;
    },
    createMediaElementSource(source: unknown) {
      assert.equal(source, element);
      return { connect(next: FakeGain) { log.connections.push(['element', 'gain']); return next; } };
    },
  };
  const store = new Map<string, string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) };
  return { element, ctx: ctx as unknown as AudioContext & { currentTime: number }, storage, store, log, makeElement: () => element as unknown as HTMLAudioElement };
}

// The quietest steady sound of a run: the wind in the lines on any wing, at trim or with both brakes
// at working depth, in a 44.1 or a 48 kHz context.
const QUIETEST_WIND = Math.min(...['classic', ...GLIDERS].flatMap((id) => {
  const { speed } = nominalFor(id);
  return [44100, 48000].flatMap((rate) => [speed.trim, speed.light].map((at) => windLevelDb(at, speed.trim, rate)));
}));

test('every track plays at the same quiet level, under the wind in the lines', () => {
  for (const track of MUSIC.tracks) assert.ok(Math.abs(20 * Math.log10(musicGain(track)) + track.rms - MUSIC.level) < 1e-9, track.file);
  assert.ok(MUSIC.level <= QUIETEST_WIND - 2, `very low: under the wind (${QUIETEST_WIND.toFixed(1)} dBFS at its quietest), and so under every cue`);
  assert.ok(musicGain(MUSIC.tracks[0]) < 0.1 && musicGain(MUSIC.tracks[1]) < 0.1);
});

test('nothing is fetched or played before the flight asks for it, and then it fades in on the music\'s own level', () => {
  const { element, ctx, storage, log, makeElement } = fakes();
  const music = createMusic({ base: '/', storage, makeElement, first: 0 });
  music.attach(ctx);
  assert.equal(element.preload, 'none', 'a track loads only once it plays');
  assert.equal(log.plays, 0);
  assert.equal(element.src, '/music/arcade-hallgrimr.mp3');
  music.start();
  assert.equal(log.plays, 1);
  assert.equal(log.gains[0].gain.target, musicGain(MUSIC.tracks[0]));
  // Its own gain, straight to the speakers: the sounds' switch is a different gain.
  assert.deepEqual(log.connections, [['element', 'gain'], ['gain', 'speakers']]);
  assert.equal(music.playing, true);
});

test('the tracks take turns, round and round, each at its own level', () => {
  const { element, ctx, storage, log, makeElement } = fakes();
  const music = createMusic({ base: '/base/', storage, makeElement, first: 1 });
  music.attach(ctx);
  music.start();
  assert.equal(element.src, '/base/music/vikings-challenge.mp3');
  element.end();
  assert.equal(element.src, '/base/music/arcade-hallgrimr.mp3');
  assert.equal(log.gains[0].gain.target, musicGain(MUSIC.tracks[0]));
  element.end();
  assert.equal(element.src, '/base/music/vikings-challenge.mp3');
  assert.equal(log.plays, 3, 'each track plays as the last ends');
  // A track ending while the flight is over starts nothing.
  music.stop(true);
  element.end();
  assert.equal(log.plays, 3);
});

test('switched off, the music stops while the sounds go on, and the choice is kept for the next visit', () => {
  const { element, ctx, storage, store, log, makeElement } = fakes();
  const music = createMusic({ storage, makeElement, first: 0 });
  music.attach(ctx);
  music.start();
  assert.equal(music.toggle(), false);
  assert.equal(store.get(MUSIC.key), 'off');
  assert.equal(log.gains[0].gain.target, 0, 'it fades out');
  // The next visit starts with it off, and the flight starting plays nothing.
  const next = fakes();
  next.store.set(MUSIC.key, 'off');
  const later = createMusic({ storage: next.storage, makeElement: next.makeElement });
  later.attach(next.ctx);
  later.start();
  assert.equal(next.log.plays, 0);
  assert.equal(later.on, false);
  // Switched back on, it plays, and the choice is forgotten.
  assert.equal(later.toggle(), true);
  assert.equal(next.log.plays, 1);
  assert.equal(next.store.has(MUSIC.key), false);
  // The first one, still off, stays so when the flight starts again.
  music.stop(true);
  music.start();
  assert.equal(log.plays, 1);
  assert.equal(element.paused, true);
});

test('a play the browser refuses without a gesture is tried again on the next touch or key', async () => {
  const { ctx, storage, log, makeElement } = fakes({ refuse: true });
  const music = createMusic({ storage, makeElement, first: 0 });
  music.attach(ctx);
  music.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(music.blocked, true);
  assert.equal(music.playing, false);
  music.nudge();
  assert.equal(log.plays, 2);
  // Nothing is retried while the music is not wanted.
  await new Promise((resolve) => setImmediate(resolve));
  music.stop(true);
  music.nudge();
  assert.equal(log.plays, 2);
});

test('the music waits while the page is out of sight, and blocked storage keeps it on for the visit', () => {
  const { element, ctx, log, makeElement } = fakes();
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const music = createMusic({ storage: blocked, makeElement, first: 0 });
  assert.equal(music.on, true);
  music.attach(ctx);
  // Out of sight as the flight starts (the game can finish loading after a tab switch): it waits.
  music.hide(true);
  music.start();
  assert.equal(log.plays, 0);
  music.hide(false);
  assert.equal(log.plays, 1);
  music.hide(true);
  assert.equal(element.paused, true);
  music.hide(false);
  assert.equal(element.paused, false);
  assert.equal(music.toggle(), false, 'the switch still works');
  music.dispose();
  assert.equal(element.src, '');
  assert.ok(log.pauses >= 2);
});

test('a track that will not load gives way to the next, and once none will, a touch tries again after a while', () => {
  const { element, ctx, storage, log, makeElement } = fakes();
  const music = createMusic({ storage, makeElement, first: 0 });
  music.attach(ctx);
  music.start();
  element.fail();
  assert.equal(element.src, '/music/vikings-challenge.mp3', 'the other track is tried');
  assert.equal(log.plays, 2);
  element.fail();
  assert.equal(music.blocked, true, 'none will load: the music waits');
  assert.equal(music.playing, false);
  // A touch straight away is too soon to fetch again; one MUSIC.retry seconds on tries again.
  music.nudge();
  assert.equal(log.plays, 2);
  ctx.currentTime = MUSIC.retry;
  music.nudge();
  assert.equal(log.plays, 3);
  assert.equal(element.src, '/music/vikings-challenge.mp3', 'the same track, fetched again');
  assert.equal(music.blocked, false);
  // Once one plays, its failures are forgotten: the next failure moves on rather than giving up.
  element.listeners.playing!();
  element.fail();
  assert.equal(element.src, '/music/arcade-hallgrimr.mp3');
  assert.equal(music.blocked, false);
});

test('a play cut short by a pause or by the next track is not taken for the browser refusing it', async () => {
  const { element, ctx, storage, makeElement } = fakes({ pending: true });
  const music = createMusic({ storage, makeElement, first: 0 });
  const settled = () => new Promise((resolve) => setImmediate(resolve));
  music.attach(ctx);
  music.start();
  music.stop(true);
  await settled();
  assert.equal(music.blocked, false, 'paused before it began');
  music.start();
  element.end();
  await settled();
  assert.equal(music.blocked, false, 'overtaken by the next track');
  // The play still waiting, refused outright, is a refusal.
  element.refuseWaiting();
  await settled();
  assert.equal(music.blocked, true);
});
