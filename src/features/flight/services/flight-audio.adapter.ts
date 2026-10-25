import type { FlightState } from '../../../domains/flight/models.ts';
import type { WornWing } from '../presentation/wing-feel.ts';
import { VARIO, varioTone } from '../presentation/vario.ts';
import { WIND_TONE, noiseReach, windTone } from '../presentation/wind-tone.ts';
export interface FlightAudioState { ctx: AudioContext; master: GainNode; noise: AudioBuffer; wind: GainNode; windFilter: BiquadFilterNode; whistle: GainNode; whistleBand: BiquadFilterNode; buffet: GainNode;
  soft: GainNode; softPan: StereoPannerNode | null; osc: OscillatorNode; beep: GainNode; rumble: GainNode; flap: BiquadFilterNode; luff: GainNode; beat: OscillatorNode; tips: GainNode; nextBeep: number; next: Record<string, number> }
export type AudioVoice<Args extends unknown[]> = (ctx: AudioContext, at: number, ...args: Args) => void;
// `worn` is the wing being flown (its trim, for the wind), `load` the eased load on the lines and
// `turbulence` how rough the air is (m/s), for the buffet.
export interface FlightAudioPort { stage: HTMLElement; g: FlightState; effects: { floor: number; veil: number; luff: number; soft: { left: number; right: number } }; vario: { readonly value: number; readonly beep: number }; readonly mode: string; readonly paused: boolean; isAirborne(): boolean; runSounds(): void;
  worn(): Readonly<WornWing>; readonly load: number; readonly turbulence: number }
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Browser sound resources and synthesis; simulation only supplies sampled values. */
export function createFlightAudio(port: FlightAudioPort) {
 const { stage, g, effects, vario } = port;
  let audio: FlightAudioState | null = null;
  let soundOn = true;
  // Whether the vario is beeping (it starts and stops at different climbs).
  let beeping = false;
  // The vario's next beep, and the wind as it is to be played, each written in place every time.
  const tone = { pitch: 0, gap: 0 };
  const windNow = { loud: 0, bright: 0, whistle: 0, whistleAt: 0, buffet: 0 };

  function startAudio() {
    const Ctx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (audio) return audio.ctx.resume();
    if (!Ctx) return;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = soundOn ? 1 : 0;
    master.connect(ctx.destination);

    // As loud for each hertz at any sample rate (wind-tone.js NOISE), so every sound cut from it is too.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const samples = noise.getChannelData(0), reach = noiseReach(ctx.sampleRate);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * reach;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = WIND_TONE.bright.base;
    windFilter.Q.value = WIND_TONE.bright.q;
    const wind = ctx.createGain();
    wind.gain.value = 0.01;
    source.connect(windFilter).connect(wind).connect(master);
    // A whistle in the lines as the wing runs past its trim (wind-tone.js): the same noise in a narrow
    // band high over the wind's own, rising with the speed.
    const whistleBand = ctx.createBiquadFilter();
    whistleBand.type = 'bandpass';
    whistleBand.frequency.value = WIND_TONE.whistle.from;
    whistleBand.Q.value = 6;
    const whistle = ctx.createGain();
    whistle.gain.value = 0;
    source.connect(whistleBand).connect(whistle).connect(master);
    // The buffet of loaded lines and rough air: the noise low, its loudness shaken a few times a second.
    const buffetFilter = ctx.createBiquadFilter();
    buffetFilter.type = 'lowpass';
    buffetFilter.frequency.value = 160;
    const buffetShake = ctx.createGain();
    buffetShake.gain.value = 1;
    const buffet = ctx.createGain();
    buffet.gain.value = 0;
    source.connect(buffetFilter).connect(buffetShake).connect(buffet).connect(master);
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 6;
    const wobbleDepth = ctx.createGain();
    wobbleDepth.gain.value = 0.6;
    wobble.connect(wobbleDepth).connect(buffetShake.gain);
    wobble.start();
    const fogFilter = ctx.createBiquadFilter();
    fogFilter.type = 'lowpass';
    fogFilter.frequency.value = 85;
    const rumble = ctx.createGain();
    rumble.gain.value = 0;
    source.connect(fogFilter).connect(rumble).connect(master);
    source.start();

    // A variometer: it beeps faster and higher the harder you climb.
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const beep = ctx.createGain();
    beep.gain.value = 0;
    osc.connect(beep).connect(master);
    osc.start();

    // The cloth of a wing near the stall: the same noise through a narrow band, switched on and
    // off by a slow square wave (the raven's rasp, much slower), louder and quicker as it nears.
    const flap = ctx.createBiquadFilter();
    flap.type = 'bandpass';
    flap.frequency.value = 900;
    flap.Q.value = 0.9;
    const shudder = ctx.createGain();
    shudder.gain.value = 0.5;
    const luff = ctx.createGain();
    luff.gain.value = 0;
    source.connect(flap).connect(shudder).connect(luff).connect(master);
    const beat = ctx.createOscillator();
    beat.type = 'square';
    beat.frequency.value = 9;
    const swing = ctx.createGain();
    swing.gain.value = 0.5;
    beat.connect(swing).connect(shudder.gain);
    beat.start();

    // The folded tips of big ears: the same noise lower and in a wider band, beating slower and
    // softer than a stall's flutter, so the two are never taken for each other.
    const tipBand = ctx.createBiquadFilter();
    tipBand.type = 'bandpass';
    tipBand.frequency.value = 340;
    tipBand.Q.value = 1.2;
    const tipBeat = ctx.createGain();
    tipBeat.gain.value = 0.6;
    const tips = ctx.createGain();
    tips.gain.value = 0;
    source.connect(tipBand).connect(tipBeat).connect(tips).connect(master);
    const tipWave = ctx.createOscillator();
    tipWave.frequency.value = 5.5;
    const tipDepth = ctx.createGain();
    tipDepth.gain.value = 0.4;
    tipWave.connect(tipDepth).connect(tipBeat.gain);
    tipWave.start();

    // `next` holds when each one-off sound may play again, so none can pile up.
    // A half near stalling by itself (stall-effects.js softBrakes): the cloth on that side going soft,
    // a low trembling flutter panned to it, under the whole wing's luff.
    const softBand = ctx.createBiquadFilter();
    softBand.type = 'bandpass';
    softBand.frequency.value = 450;
    softBand.Q.value = 1.5;
    const softShake = ctx.createGain();
    softShake.gain.value = 0.6;
    const soft = ctx.createGain();
    soft.gain.value = 0;
    const softPan = ctx.createStereoPanner?.() ?? null;
    source.connect(softBand).connect(softShake).connect(soft);
    if (softPan) soft.connect(softPan).connect(master);
    else soft.connect(master);
    const softWave = ctx.createOscillator();
    softWave.frequency.value = 4;
    const softDepth = ctx.createGain();
    softDepth.gain.value = 0.4;
    softWave.connect(softDepth).connect(softShake.gain);
    softWave.start();

    audio = { ctx, master, noise, wind, windFilter, whistle, whistleBand, buffet, soft, softPan, osc, beep, rumble, flap, luff, beat, tips, nextBeep: 0, next: {} };
  }

  // A wing folding: a crack of cloth slammed by air, a low body under it, and a slap.
  function crack(ctx: AudioContext, at: number) {
    const snapNoise = ctx.createBufferSource();
    snapNoise.buffer = audio!.noise;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 2400;
    const snapGain = ctx.createGain();
    snapGain.gain.setValueAtTime(0.12, at);
    snapGain.gain.exponentialRampToValueAtTime(0.001, at + 0.025);
    snapNoise.connect(high).connect(snapGain).connect(audio!.master);
    snapNoise.start(at, Math.random());
    snapNoise.stop(at + 0.03);
    const body = ctx.createOscillator();
    body.frequency.setValueAtTime(75, at);
    body.frequency.exponentialRampToValueAtTime(45, at + 0.2);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.1, at);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
    body.connect(bodyGain).connect(audio!.master);
    body.start(at);
    body.stop(at + 0.24);
    const slap = ctx.createBufferSource();
    slap.buffer = audio!.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900;
    const slapGain = ctx.createGain();
    slapGain.gain.setValueAtTime(0.06, at + 0.01);
    slapGain.gain.exponentialRampToValueAtTime(0.001, at + 0.09);
    slap.connect(band).connect(slapGain).connect(audio!.master);
    slap.start(at + 0.01, Math.random());
    slap.stop(at + 0.1);
  }

  // Plays a one-off sound unless it played less than `gap` seconds ago. Nothing new starts while
  // an overlay has the run paused, or with the sound switched off.
  function play<Args extends unknown[]>(name: string, gap: number, voice: (ctx: AudioContext, at: number, ...args: Args) => void, ...args: Args) {
    if (!audio || !soundOn || port.paused || audio.ctx.state !== 'running') return;
    const now = audio.ctx.currentTime;
    if (now < (audio.next[name] ?? 0)) return;
    audio.next[name] = now + gap;
    voice(audio.ctx, now + 0.01, ...args);
  }

  // Sends a sound to one side: -1 is the pilot's left, 1 the right.
  function panned(ctx: AudioContext, pan: number) {
    const out = ctx.createStereoPanner?.();
    if (!out) return audio!.master;
    out.pan.value = clamp(pan, -1, 1);
    out.connect(audio!.master);
    return out;
  }

  // A stall: the wing slumps with a low drop and its cloth rattles loose, slowing as it goes. No
  // call in it: a stall must never sound like a raven. `level` is softer for the forgiving kind.
  function slump(ctx: AudioContext, at: number, pan: number, level: number) {
    const out = panned(ctx, pan);
    const body = ctx.createOscillator();
    body.frequency.setValueAtTime(110, at);
    body.frequency.exponentialRampToValueAtTime(34, at + 0.4);
    const drop = ctx.createGain();
    drop.gain.setValueAtTime(0.3 * level, at);
    drop.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
    body.connect(drop).connect(out);
    body.start(at);
    body.stop(at + 0.52);
    const cloth = ctx.createBufferSource();
    cloth.buffer = audio!.noise;
    cloth.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(950, at);
    band.frequency.exponentialRampToValueAtTime(280, at + 1.3);
    const chop = ctx.createGain();
    chop.gain.value = 0.5;
    const rattle = ctx.createOscillator();
    rattle.type = 'square';
    rattle.frequency.setValueAtTime(14, at);
    rattle.frequency.linearRampToValueAtTime(6, at + 1.3);
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    rattle.connect(depth).connect(chop.gain);
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0.2 * level, at);
    shape.gain.exponentialRampToValueAtTime(0.04 * level, at + 1.3);
    shape.gain.linearRampToValueAtTime(0, at + 1.7);
    cloth.connect(band).connect(chop).connect(shape).connect(out);
    cloth.start(at, Math.random());
    rattle.start(at);
    cloth.stop(at + 1.75);
    rattle.stop(at + 1.75);
  }

  // The wing filling again: a soft thump of cloth taking the air.
  function refill(ctx: AudioContext, at: number, pan: number) {
    const out = panned(ctx, pan);
    const body = ctx.createOscillator();
    body.frequency.setValueAtTime(85, at);
    body.frequency.exponentialRampToValueAtTime(60, at + 0.18);
    const thump = ctx.createGain();
    thump.gain.setValueAtTime(0.12, at);
    thump.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
    body.connect(thump).connect(out);
    body.start(at);
    body.stop(at + 0.2);
    const cloth = ctx.createBufferSource();
    cloth.buffer = audio!.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 520;
    band.Q.value = 0.7;
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.16, at + 0.03);
    shape.gain.setTargetAtTime(0, at + 0.06, 0.07);
    cloth.connect(band).connect(shape).connect(out);
    cloth.start(at, Math.random());
    cloth.stop(at + 0.5);
  }

  function playStall() {
    play('stall', 1.2, slump, 0, 0.7);
  }

  function playRefill(side: number) {
    play('refill', 1, refill, side * 0.3);
  }

  // The moment to act on a swing: a short wooden knock, from the side to turn to, lighter for a
  // let-go. Nothing like the judges' bright clack.
  function tock(ctx: AudioContext, at: number, pan = 0, light = false) {
    const out = pan ? panned(ctx, pan) : audio!.master;
    const knock = ctx.createOscillator();
    knock.frequency.setValueAtTime(light ? 760 : 520, at);
    knock.frequency.exponentialRampToValueAtTime(light ? 600 : 410, at + 0.07);
    const body = ctx.createGain();
    body.gain.setValueAtTime(light ? 0.05 : 0.08, at);
    body.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
    knock.connect(body).connect(out);
    knock.start(at);
    knock.stop(at + 0.08);
    const tap = ctx.createBufferSource();
    tap.buffer = audio!.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = light ? 1700 : 1100;
    band.Q.value = 5;
    const click = ctx.createGain();
    click.gain.setValueAtTime(light ? 0.05 : 0.08, at);
    click.gain.exponentialRampToValueAtTime(0.001, at + 0.03);
    tap.connect(band).connect(click).connect(out);
    tap.start(at, Math.random());
    tap.stop(at + 0.04);
  }

  // The hands on time on a swing: two quick bright notes up a fifth, from the side swapped from.
  function chime(ctx: AudioContext, at: number, pan = 0) {
    const out = pan ? panned(ctx, pan) : audio!.master;
    for (const [i, freq] of [880, 1318.5].entries()) {
      const note = ctx.createOscillator();
      note.type = 'triangle';
      note.frequency.value = freq;
      const ring = ctx.createGain();
      ring.gain.setValueAtTime(0.055, at + i * 0.06);
      ring.gain.exponentialRampToValueAtTime(0.001, at + i * 0.06 + 0.22);
      note.connect(ring).connect(out);
      note.start(at + i * 0.06);
      note.stop(at + i * 0.06 + 0.24);
    }
  }

  // Reaching a lesson's brake position: one quiet bell, separate from acro timing sounds.
  function bing(ctx: AudioContext, at: number) {
    const note = ctx.createOscillator(), ring = ctx.createGain();
    note.type = 'sine'; note.frequency.value = 1046.5;
    ring.gain.setValueAtTime(0, at);
    ring.gain.linearRampToValueAtTime(.035, at + .008);
    ring.gain.exponentialRampToValueAtTime(.001, at + .14);
    note.connect(ring).connect(audio!.master);
    note.start(at); note.stop(at + .15);
  }

  // A swing caught: the lines coming taut under the brake, a short dry snap with a low knock in it.
  function snap(ctx: AudioContext, at: number) {
    const crack = ctx.createBufferSource();
    crack.buffer = audio!.noise;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 2200;
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0.12, at);
    shape.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    crack.connect(high).connect(shape).connect(audio!.master);
    crack.start(at, Math.random());
    crack.stop(at + 0.06);
    const knock = ctx.createOscillator();
    knock.frequency.setValueAtTime(140, at);
    knock.frequency.exponentialRampToValueAtTime(90, at + 0.08);
    const body = ctx.createGain();
    body.gain.setValueAtTime(0.09, at);
    body.gain.exponentialRampToValueAtTime(0.001, at + 0.1);
    knock.connect(body).connect(audio!.master);
    knock.start(at);
    knock.stop(at + 0.11);
  }

  // A swing through its bottom: the wing rushing past overhead, a soft sweep of air up and down
  // the canopy's own band, louder the faster it goes (`level`, 0 to 1).
  function swoosh(ctx: AudioContext, at: number, level = 1) {
    const air = ctx.createBufferSource();
    air.buffer = audio!.noise;
    air.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.9;
    band.frequency.setValueAtTime(500, at);
    band.frequency.exponentialRampToValueAtTime(1100, at + 0.18);
    band.frequency.exponentialRampToValueAtTime(600, at + 0.4);
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.06 * level, at + 0.15);
    shape.gain.exponentialRampToValueAtTime(0.001, at + 0.42);
    air.connect(band).connect(shape).connect(audio!.master);
    air.start(at, Math.random());
    air.stop(at + 0.44);
  }

  function updateAudio() {
    if (!audio) return;
    const now = audio.ctx.currentTime;
    const flying = port.isAirborne() && !port.paused;
    const running = port.mode === 'cloudbase' && !port.paused;
    const rush = port.paused ? 0 : port.mode === 'lost' ? Math.min(0.14, 0.01 + Math.abs(g.vy) * 0.005) : 0.01;
    // The wind in the lines follows the airspeed: louder and brighter on the bar, dull on the brake,
    // and quicker to while the wing swings, so it rises at every bottom of a swing; it whistles past
    // the wing's own trim, and buffets as the lines load or the air turns rough (wind-tone.js).
    const swinging = Math.abs(g.roll) > 0.3 || Math.abs(g.pitch) > 0.4;
    windTone(g.speed, port.worn().trim, port.load, port.turbulence, windNow);
    audio.wind.gain.setTargetAtTime(flying ? windNow.loud : rush, now, swinging ? 0.12 : 0.3);
    audio.whistle.gain.setTargetAtTime(flying ? windNow.whistle : 0, now, 0.2);
    audio.whistleBand.frequency.setTargetAtTime(windNow.whistleAt, now, 0.2);
    audio.buffet.gain.setTargetAtTime(flying ? windNow.buffet : 0, now, 0.15);
    const fogNear = running ? 1 - clamp((g.pos.y - effects.floor) / 140, 0, 1) : 0;
    // Inside a storm cloud the same rumble swells and the wind goes dull.
    const inCloud = running ? effects.veil : 0;
    audio.rumble.gain.setTargetAtTime(Math.max(fogNear, inCloud * 0.8) * 0.35, now, 0.3);
    const pitch = flying ? windNow.bright : WIND_TONE.bright.base;
    audio.windFilter.frequency.setTargetAtTime(Math.max(120, pitch - 260 * inCloud), now, 0.3);
    // The cloth flutters harder and faster as the stall comes, and flaps loose in it.
    const luff = flying ? effects.luff : 0;
    audio.luff.gain.setTargetAtTime(0.11 * luff * luff, now, 0.08);
    audio.beat.frequency.setTargetAtTime(8 + 9 * luff, now, 0.08);
    audio.flap.frequency.setTargetAtTime(700 + 500 * luff, now, 0.08);
    audio.tips.gain.setTargetAtTime(running ? 0.05 * g.ears : 0, now, 0.12);
    const soft = flying ? Math.max(effects.soft.left, effects.soft.right) : 0;
    audio.soft.gain.setTargetAtTime(0.06 * soft * soft, now, 0.08);
    audio.softPan?.pan.setTargetAtTime(clamp(effects.soft.right - effects.soft.left, -1, 1), now, 0.08);
    if (running) port.runSounds();
    // The beep follows the quicker climb, from above VARIO.start until it falls below VARIO.stop.
    beeping = flying && vario.beep > (beeping ? VARIO.stop : VARIO.start);
    if (beeping && now >= audio.nextBeep) {
      varioTone(vario.beep, port.mode === 'cloudbase', tone);
      audio.osc.frequency.setValueAtTime(tone.pitch, now);
      audio.beep.gain.setValueAtTime(0.05, now);
      audio.beep.gain.setValueAtTime(0, now + tone.gap * 0.5);
      audio.nextBeep = now + tone.gap;
    } else if (!beeping) audio.beep.gain.setTargetAtTime(0, now, 0.03);
  }

  function toggleSound() {
    soundOn = !soundOn;
    for (const button of stage.querySelectorAll('[data-do="sound"]')) { button.textContent = `SFX: ${soundOn ? 'on' : 'off'}`; button.setAttribute('aria-pressed', String(soundOn)); }
    audio?.master.gain.setTargetAtTime(soundOn ? 1 : 0, audio.ctx.currentTime, 0.05);
    return soundOn;
  }


 return { start: startAudio, play, panned, slump, crack, refill, playStall, playRefill, tock, chime, bing, snap, swoosh, update: updateAudio, toggle: toggleSound, get on() { return soundOn; }, get available() { return !!(window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext); }, get audio() { return audio; }, dispose() { void audio?.ctx.close(); } };
}
