import type { StoragePort } from '../../../adapters/browser/storage.port.ts';
// Background music for the flight, very quietly under everything else, with a switch of its own:
// the tracks in public/music/ one after the other, round and round. It streams through one media
// element (a whole track decoded would take tens of megabytes on a phone), routed through the game's
// own audio context so its level holds on phones, which ignore a media element's volume, and kept
// apart from the sounds' own level, so either can be switched off without the other. Nothing is
// fetched until the flight first plays it, so the page's hero never loads a note.

// Each track with its loudness, measured in Chromium by decoding the whole file (dBFS RMS), so that
// every track plays at the same quiet `level`. Re-measure when a track is swapped.
export const MUSIC = Object.freeze({
  tracks: Object.freeze([
    Object.freeze({ file: 'arcade-hallgrimr.mp3', rms: -19.3 }),
    Object.freeze({ file: 'vikings-challenge.mp3', rms: -18.4 }),
  ]),
  // dBFS RMS the music plays at (about -45.5 LUFS): under every sound of a run. The wind is quietest
  // on the EN-A with both brakes at working depth, -45.5 dBFS RMS (wind-tone.js windLevelDb); the
  // classic wing's at trim is -42.8 (-41 LUFS, measured in Chromium, BS.1770). At their loudest the
  // run's vario is -31 LUFS, the surge's swell -37, a rep's ting -38 and a raven's alarm -40.
  level: -48,
  // Seconds it takes to fade in or out.
  fade: 1.5,
  // Seconds to wait, once every track has failed to load, before a touch or a key tries again.
  retry: 10,
  // Where the visitor's choice is kept: 'off' once switched off.
  key: 'fjord-music',
});

/** The gain that brings `track` to MUSIC.level. */
export const musicGain = (track: { rms: number }) => 10 ** ((MUSIC.level - track.rms) / 20);

// The page's localStorage, or nothing where it is blocked: reading the property itself can throw.
function deviceStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The flight's music. `base` is where the site is served from (import.meta.env.BASE_URL), `storage`
 * keeps the visitor's choice, `makeElement` makes the media element (a test's stand-in) and `first`
 * is the track to start on (by default either, so a visit does not always open the same way).
 *
 *   attach(context)   joins the game's audio context, once it has one (a click has made it)
 *   start()           the flight wants music: it plays, fading in, if it is switched on
 *   stop(now)         the flight is over: it fades out and pauses (at once with `now`)
 *   toggle()          the visitor's switch; returns whether it is now on, and keeps the choice
 *   nudge()           a touch or a key: a play the browser refused without one is tried again,
 *                     and so are tracks that failed to load, once MUSIC.retry seconds have passed
 *   hide(hidden)      the page went out of sight, or came back: the music waits for it
 *   dispose()         lets everything go
 *   on, playing, track, blocked   for the switch's label and for checking from outside
 */
export interface MusicOptions {
  base?: string; storage?: StoragePort | null; makeElement?: () => HTMLAudioElement; first?: number;
}
export function createMusic({ base = '/', storage = deviceStorage(), makeElement = () => new Audio(), first = Math.random() < 0.5 ? 0 : 1 }: MusicOptions = {}) {
  const tracks = MUSIC.tracks;
  let on = true;
  try {
    on = storage?.getItem(MUSIC.key) !== 'off';
  } catch {
    // A choice that cannot be read is the default: on.
  }
  let ctx: AudioContext | null = null;
  let element: HTMLAudioElement|null = null;
  let gain: GainNode | null = null;
  let index = Math.min(Math.max(0, first), tracks.length - 1);
  // Whether the flight wants music, whether the page is out of sight, whether the browser refused
  // to play without a gesture (or no track would load), the pause waiting for a fade to finish, the
  // play last asked for, the tracks that have failed to load in a row, and when to try them again.
  let wanted = false;
  let hidden = false;
  let blocked = false;
  let pausing: ReturnType<typeof setTimeout> | 0 = 0;
  let asked = 0;
  let failures = 0;
  let retryAt = 0;

  const audible = () => on && wanted && !hidden;

  function load(i: number) {
    index = i;
    element!.src = `${base}music/${tracks[i].file}`;
  }

  // Fades toward `to` (a gain) from wherever it is.
  function fadeTo(to: number) {
    if (!gain) return;
    const now = ctx!.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(to, now, MUSIC.fade / 3);
  }

  function play() {
    clearTimeout(pausing);
    pausing = 0;
    const id = ++asked;
    const started = element!.play();
    blocked = false;
    // A browser can refuse to play before the page has had a touch or a key: the next one tries
    // again. A play cut short by a pause or by the next track is no refusal.
    started?.catch?.(() => {
      if (id === asked && audible()) blocked = true;
    });
    fadeTo(musicGain(tracks[index]));
  }

  function quieten(now: boolean) {
    clearTimeout(pausing);
    if (now || !gain) {
      if (gain) gain.gain.value = 0;
      element?.pause();
      pausing = 0;
      return;
    }
    fadeTo(0);
    pausing = setTimeout(() => {
      pausing = 0;
      if (!audible()) element!.pause();
    }, MUSIC.fade * 1000);
  }

  // The next track, as one ends.
  function next() {
    load((index + 1) % tracks.length);
    if (audible()) play();
  }

  // A track that will not load (the connection dropped, a file went missing) gives way to the
  // next. Once every one has failed in a row, the music waits for a touch or a key to try again.
  function failed() {
    failures += 1;
    if (failures < tracks.length) {
      next();
      return;
    }
    blocked = true;
    retryAt = ctx!.currentTime + MUSIC.retry;
  }

  function loaded() {
    failures = 0;
  }

  function attach(context: AudioContext | null | undefined) {
    if (ctx || !context) return;
    ctx = context;
    element = makeElement();
    element.preload = 'none';
    element.addEventListener('ended', next);
    element.addEventListener('error', failed);
    element.addEventListener('playing', loaded);
    gain = ctx.createGain();
    gain.gain.value = 0;
    // Straight to the speakers: the sounds' own switch is a different gain.
    ctx.createMediaElementSource(element).connect(gain).connect(ctx.destination);
    load(index);
    if (audible()) play();
  }

  function start() {
    wanted = true;
    if (element && audible()) play();
  }

  function stop(now = false) {
    wanted = false;
    if (element) quieten(now);
  }

  function toggle() {
    on = !on;
    try {
      if (on) storage?.removeItem(MUSIC.key);
      else storage?.setItem(MUSIC.key, 'off');
    } catch {
      // Blocked storage: the choice lasts for this visit.
    }
    if (!element) return on;
    if (audible()) play();
    else quieten(false);
    return on;
  }

  function nudge() {
    if (!blocked || !element || !audible()) return;
    if (element.error) {
      if (ctx!.currentTime < retryAt) return;
      failures = 0;
      load(index);
    }
    play();
  }

  function hide(out: boolean) {
    hidden = out;
    if (!element) return;
    if (audible()) play();
    else quieten(true);
  }

  function dispose() {
    clearTimeout(pausing);
    if (!element) return;
    element.removeEventListener('ended', next);
    element.removeEventListener('error', failed);
    element.removeEventListener('playing', loaded);
    element.pause();
    element.removeAttribute?.('src');
    gain!.disconnect();
    element = null; gain = null; ctx = null;
  }

  return {
    attach, start, stop, toggle, nudge, hide, dispose,
    get on() { return on; },
    get playing() { return !!element && audible() && !blocked; },
    get track() { return tracks[index].file; },
    get blocked() { return blocked; },
  };
}
