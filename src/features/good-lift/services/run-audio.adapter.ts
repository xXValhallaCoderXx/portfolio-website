import { BELLS } from '../../../domains/good-lift/bells.ts';
import { LIGHTNING } from '../presentation/run-lightning.ts';
import { JUDGES } from '../../../domains/good-lift/meet-card.ts';

export interface RunAudioPort {
  readonly audio: { noise: AudioBuffer; master: GainNode };
  panned(ctx: AudioContext, pan: number): GainNode|StereoPannerNode;
}

const PENTA=[0, 2, 4, 7, 9];
const clamp=(value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Web Audio synthesis owns no run state; the session decides when each voice is heard. */
export function createRunVoices(sound: RunAudioPort) {
  const panned=(ctx: AudioContext, pan: number) => sound.panned(ctx, pan);
  // A raven's call: a rough falling croak. `level` is its loudness and `pitch` raises it in alarm.
  function caw(ctx: AudioContext, at: number, level: number, pan: number, pitch: number) {
    const voice=ctx.createOscillator();
    voice.type='sawtooth';
    voice.frequency.setValueAtTime(470*pitch, at);
    voice.frequency.exponentialRampToValueAtTime(330*pitch, at+0.26);
    // The rasp comes from switching the voice on and off some seventy times a second.
    const rasp=ctx.createOscillator();
    rasp.type='square';
    rasp.frequency.value=68;
    const depth=ctx.createGain();
    depth.gain.value=0.45;
    const throat=ctx.createGain();
    throat.gain.value=0.55;
    rasp.connect(depth).connect(throat.gain);
    const beak=ctx.createBiquadFilter();
    beak.type='bandpass';
    beak.frequency.value=1250;
    beak.Q.value=1.4;
    const shape=ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(level, at+0.02);
    shape.gain.setTargetAtTime(0, at+0.14, 0.05);
    voice.connect(throat).connect(beak).connect(shape).connect(panned(ctx, pan));
    voice.start(at);
    rasp.start(at);
    voice.stop(at+0.4);
    rasp.stop(at+0.4);
  }

  // A strike: a thud, the rattle of a wing losing its shape, and (from a raven, not a kettlebell)
  // the bird's own complaint.
  function thud(ctx: AudioContext, at: number, pan: number, bird: boolean) {
    const out=panned(ctx, pan);
    const body=ctx.createOscillator();
    body.frequency.setValueAtTime(160, at);
    body.frequency.exponentialRampToValueAtTime(42, at+0.22);
    const hit=ctx.createGain();
    hit.gain.setValueAtTime(0.5, at);
    hit.gain.exponentialRampToValueAtTime(0.001, at+0.3);
    body.connect(hit).connect(out);
    body.start(at);
    body.stop(at+0.32);
    const cloth=ctx.createBufferSource();
    cloth.buffer=sound.audio.noise;
    const flap=ctx.createBiquadFilter();
    flap.type='bandpass';
    flap.frequency.setValueAtTime(1400, at);
    flap.frequency.exponentialRampToValueAtTime(320, at+1.6);
    const rattle=ctx.createGain();
    rattle.gain.setValueAtTime(0.28, at);
    rattle.gain.exponentialRampToValueAtTime(0.05, at+1.6);
    rattle.gain.linearRampToValueAtTime(0, at+2.1);
    cloth.loop=true;
    cloth.connect(flap).connect(rattle).connect(out);
    cloth.start(at, Math.random());
    cloth.stop(at+2.15);
    if(bird) caw(ctx, at+0.05, 0.11, pan, 1.25);
  }

  // A gust front going over: a rush of air that rises, peaks as it arrives and dies away, moving
  // across from the side it comes from so its direction is heard.
  function whoosh(ctx: AudioContext, at: number, level: number, from: number) {
    const air=ctx.createBufferSource();
    air.buffer=sound.audio.noise;
    air.loop=true;
    const band=ctx.createBiquadFilter();
    band.type='bandpass';
    band.Q.value=0.6;
    band.frequency.setValueAtTime(320, at);
    band.frequency.exponentialRampToValueAtTime(1100, at+1);
    band.frequency.exponentialRampToValueAtTime(420, at+2.4);
    const shape=ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(level, at+0.9);
    shape.gain.linearRampToValueAtTime(0, at+2.4);
    const out=panned(ctx, 0.8*from);
    if('pan' in out) {
      out.pan.setValueAtTime(clamp(0.8*from, -1, 1), at);
      out.pan.linearRampToValueAtTime(clamp(-0.8*from, -1, 1), at+2.2);
    }
    air.connect(band).connect(shape).connect(out);
    air.start(at, Math.random());
    air.stop(at+2.45);
  }

  // A kettlebell going past close: a short rush of air from high to low.
  function rush(ctx: AudioContext, at: number, pan: number) {
    const air=ctx.createBufferSource();
    air.buffer=sound.audio.noise;
    air.loop=true;
    const band=ctx.createBiquadFilter();
    band.type='bandpass';
    band.Q.value=1.2;
    band.frequency.setValueAtTime(1800, at);
    band.frequency.exponentialRampToValueAtTime(300, at+0.45);
    const shape=ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.2, at+0.06);
    shape.gain.exponentialRampToValueAtTime(0.001, at+0.5);
    air.connect(band).connect(shape).connect(panned(ctx, pan));
    air.start(at, Math.random());
    air.stop(at+0.55);
  }

  // A plate onto the bar: a bright ting of two partials, `step` pentatonic steps above the first.
  function ting(ctx: AudioContext, at: number, step: number, level: number) {
    const f=523.25*2**(PENTA[step%5]/12+Math.floor(step/5));
    for(const [ratio, gain, ring] of [[1, 1, 0.5], [2.76, 0.35, 0.18]]) {
      const tone=ctx.createOscillator();
      tone.frequency.value=f*ratio;
      const shape=ctx.createGain();
      shape.gain.setValueAtTime(0, at);
      shape.gain.linearRampToValueAtTime(level*gain, at+0.005);
      shape.gain.exponentialRampToValueAtTime(0.0001, at+ring);
      tone.connect(shape).connect(sound.audio.master);
      tone.start(at);
      tone.stop(at+ring+0.02);
    }
  }

  // A rep to depth: the ting, and another a step higher straight after it.
  function twice(ctx: AudioContext, at: number, step: number, level: number) {
    ting(ctx, at, step, level);
    ting(ctx, at+0.09, step+2, level*0.8);
  }

  // A trail laid: three quick tings up the scale, to say there are plates to fetch.
  function sparkle(ctx: AudioContext, at: number) {
    for(let i=0;i<3;i++) ting(ctx, at+i*0.07, 5+i*2, 0.05);
  }

  // The wing surging ahead toward a fold: its cloth whooshing forward over the pilot, a falling
  // rush in the band of the canopy's own noise, quicker than a gust's.
  function lurch(ctx: AudioContext, at: number) {
    const air=ctx.createBufferSource();
    air.buffer=sound.audio.noise;
    air.loop=true;
    const band=ctx.createBiquadFilter();
    band.type='bandpass';
    band.Q.value=1.1;
    band.frequency.setValueAtTime(1300, at);
    band.frequency.exponentialRampToValueAtTime(420, at+0.32);
    const shape=ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.16, at+0.04);
    shape.gain.exponentialRampToValueAtTime(0.001, at+0.38);
    air.connect(band).connect(shape).connect(sound.audio.master);
    air.start(at, Math.random());
    air.stop(at+0.4);
  }

  // A front tuck: the leading edge folding under with a short rattle of loose cloth, shorter and
  // lighter than a stall's (slump), and with no call in it.
  function flap(ctx: AudioContext, at: number, pan=0) {
    const cloth=ctx.createBufferSource();
    cloth.buffer=sound.audio.noise;
    cloth.loop=true;
    const band=ctx.createBiquadFilter();
    band.type='bandpass';
    band.Q.value=0.8;
    band.frequency.value=900;
    const rattle=ctx.createGain();
    rattle.gain.setValueAtTime(0, at);
    for(let i=0;i<9;i++) {
      const when=at+i*0.055;
      rattle.gain.setValueAtTime(0.13*(1-i/10), when);
      rattle.gain.setValueAtTime(0.02, when+0.025);
    }
    rattle.gain.linearRampToValueAtTime(0, at+0.55);
    cloth.connect(band).connect(rattle).connect(pan? panned(ctx, pan):sound.audio.master);
    cloth.start(at, Math.random());
    cloth.stop(at+0.56);
  }

  // A trick's element scored: a rush of air up the canopy's band, with a soft note a pentatonic step
  // higher for each linked (`links`), so a chain is heard climbing as the plates' tings do, in a
  // voice of its own.
  function swish(ctx: AudioContext, at: number, links=1) {
    const air=ctx.createBufferSource();
    air.buffer=sound.audio.noise;
    air.loop=true;
    const band=ctx.createBiquadFilter();
    band.type='bandpass';
    band.Q.value=1.4;
    band.frequency.setValueAtTime(600, at);
    band.frequency.exponentialRampToValueAtTime(1800, at+0.22);
    const shape=ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.05, at+0.06);
    shape.gain.exponentialRampToValueAtTime(0.001, at+0.26);
    air.connect(band).connect(shape).connect(sound.audio.master);
    air.start(at, Math.random());
    air.stop(at+0.28);
    const steps=[0, 2, 4, 7, 9, 12, 14, 16];
    const note=ctx.createOscillator();
    note.type='triangle';
    note.frequency.value=392*2**(steps[Math.min(links, steps.length)-1]/12);
    const ring=ctx.createGain();
    ring.gain.setValueAtTime(0.04, at+0.04);
    ring.gain.exponentialRampToValueAtTime(0.001, at+0.3);
    note.connect(ring).connect(sound.audio.master);
    note.start(at+0.04);
    note.stop(at+0.32);
  }

  // A set of tricks landed: three bright notes up an arpeggio, and a faint shimmer.
  function arpeggio(ctx: AudioContext, at: number) {
    for(const [i, ratio] of [1, 1.5, 2].entries()) {
      const note=ctx.createOscillator();
      note.type='triangle';
      note.frequency.value=523.25*ratio;
      const ring=ctx.createGain();
      ring.gain.setValueAtTime(0.06, at+i*0.07);
      ring.gain.exponentialRampToValueAtTime(0.001, at+i*0.07+0.45);
      note.connect(ring).connect(sound.audio.master);
      note.start(at+i*0.07);
      note.stop(at+i*0.07+0.5);
    }
    const shimmer=ctx.createBufferSource();
    shimmer.buffer=sound.audio.noise;
    const high=ctx.createBiquadFilter();
    high.type='highpass';
    high.frequency.value=5000;
    const shape=ctx.createGain();
    shape.gain.setValueAtTime(0.015, at+0.14);
    shape.gain.exponentialRampToValueAtTime(0.001, at+0.6);
    shimmer.connect(high).connect(shape).connect(sound.audio.master);
    shimmer.start(at+0.14, Math.random());
    shimmer.stop(at+0.62);
  }

  // A set of tricks lost: two soft notes falling, after the fold's own sound has had its moment.
  function dud(ctx: AudioContext, at: number) {
    for(const [i, freq] of [196, 164.81].entries()) {
      const note=ctx.createOscillator();
      note.type='triangle';
      note.frequency.value=freq;
      const ring=ctx.createGain();
      ring.gain.setValueAtTime(0.04, at+0.25+i*0.16);
      ring.gain.exponentialRampToValueAtTime(0.001, at+0.25+i*0.16+0.3);
      note.connect(ring).connect(sound.audio.master);
      note.start(at+0.25+i*0.16);
      note.stop(at+0.25+i*0.16+0.32);
    }
  }

  // A pump of a folded wing let go: a soft, low thunk of the cloth filling.
  function thunk(ctx: AudioContext, at: number) {
    const tone=ctx.createOscillator();
    tone.frequency.setValueAtTime(110, at);
    tone.frequency.exponentialRampToValueAtTime(68, at+0.12);
    const shape=ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.12, at+0.01);
    shape.gain.exponentialRampToValueAtTime(0.001, at+0.16);
    tone.connect(shape).connect(sound.audio.master);
    tone.start(at);
    tone.stop(at+0.18);
  }

  // The moment to turn into a core: a low thump from its side, falling where the surge's swell
  // rises, so the one says turn and the other straighten.
  function thump(ctx: AudioContext, at: number, pan: number) {
    const out=panned(ctx, pan);
    const tone=ctx.createOscillator();
    tone.frequency.setValueAtTime(110, at);
    tone.frequency.exponentialRampToValueAtTime(55, at+0.25);
    const shape=ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.16, at+0.008);
    shape.gain.exponentialRampToValueAtTime(0.001, at+0.3);
    tone.connect(shape).connect(out);
    tone.start(at);
    tone.stop(at+0.32);
    const puff=ctx.createBufferSource();
    puff.buffer=sound.audio.noise;
    const low=ctx.createBiquadFilter();
    low.type='lowpass';
    low.frequency.value=380;
    const breath=ctx.createGain();
    breath.gain.setValueAtTime(0.08, at);
    breath.gain.exponentialRampToValueAtTime(0.001, at+0.22);
    puff.connect(low).connect(breath).connect(out);
    puff.start(at, Math.random());
    puff.stop(at+0.24);
  }

  // The lift surging under the wing: a soft swell of air with a low note rising in it, from the
  // side the core is on.
  function swell(ctx: AudioContext, at: number, pan: number) {
    const out=panned(ctx, pan);
    const air=ctx.createBufferSource();
    air.buffer=sound.audio.noise;
    air.loop=true;
    const band=ctx.createBiquadFilter();
    band.type='bandpass';
    band.Q.value=0.9;
    band.frequency.setValueAtTime(260, at);
    band.frequency.exponentialRampToValueAtTime(760, at+0.4);
    const shape=ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.07, at+0.14);
    shape.gain.setTargetAtTime(0, at+0.2, 0.12);
    air.connect(band).connect(shape).connect(out);
    air.start(at, Math.random());
    air.stop(at+0.9);
    const note=ctx.createOscillator();
    note.frequency.setValueAtTime(150, at);
    note.frequency.exponentialRampToValueAtTime(240, at+0.32);
    const hum=ctx.createGain();
    hum.gain.setValueAtTime(0, at);
    hum.gain.linearRampToValueAtTime(0.05, at+0.1);
    hum.gain.exponentialRampToValueAtTime(0.001, at+0.45);
    note.connect(hum).connect(out);
    note.start(at);
    note.stop(at+0.47);
  }

  // Hrungnir throwing: a giant's grunt, lower for a heavier bell, and a breath with it.
  function grunt(ctx: AudioContext, at: number, pan: number, weight: number) {
    const out=panned(ctx, pan);
    const low=Math.sqrt(weight/BELLS.kg[1]);
    const voice=ctx.createOscillator();
    voice.type='sawtooth';
    voice.frequency.setValueAtTime(76/low, at);
    voice.frequency.exponentialRampToValueAtTime(50/low, at+0.42);
    const chest=ctx.createBiquadFilter();
    chest.type='lowpass';
    chest.frequency.value=320;
    chest.Q.value=2;
    const shape=ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.34, at+0.04);
    shape.gain.setTargetAtTime(0, at+0.3, 0.08);
    voice.connect(chest).connect(shape).connect(out);
    voice.start(at);
    voice.stop(at+0.75);
    const breath=ctx.createBufferSource();
    breath.buffer=sound.audio.noise;
    const band=ctx.createBiquadFilter();
    band.type='bandpass';
    band.frequency.value=600;
    band.Q.value=0.8;
    const puff=ctx.createGain();
    puff.gain.setValueAtTime(0.14, at);
    puff.gain.exponentialRampToValueAtTime(0.001, at+0.35);
    breath.connect(band).connect(puff).connect(out);
    breath.start(at, Math.random());
    breath.stop(at+0.4);
  }

  // The Beast thrown: the giant's grunt lower and longer, heaving as he puts his back into it, and
  // a long breath out after it.
  function growl(ctx: AudioContext, at: number, pan: number) {
    const out=panned(ctx, pan);
    const voice=ctx.createOscillator();
    voice.type='sawtooth';
    voice.frequency.setValueAtTime(48, at);
    voice.frequency.exponentialRampToValueAtTime(30, at+1.1);
    // The heave: the voice swells and slackens six times a second.
    const heave=ctx.createOscillator();
    heave.frequency.value=6;
    const depth=ctx.createGain();
    depth.gain.value=0.3;
    const throat=ctx.createGain();
    throat.gain.value=0.7;
    heave.connect(depth).connect(throat.gain);
    const chest=ctx.createBiquadFilter();
    chest.type='lowpass';
    chest.frequency.value=260;
    chest.Q.value=2.5;
    const shape=ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.36, at+0.08);
    shape.gain.setValueAtTime(0.36, at+0.7);
    shape.gain.setTargetAtTime(0, at+0.75, 0.14);
    voice.connect(throat).connect(chest).connect(shape).connect(out);
    voice.start(at);
    heave.start(at);
    voice.stop(at+1.5);
    heave.stop(at+1.5);
    const breath=ctx.createBufferSource();
    breath.buffer=sound.audio.noise;
    const band=ctx.createBiquadFilter();
    band.type='bandpass';
    band.frequency.value=420;
    band.Q.value=0.8;
    const puff=ctx.createGain();
    puff.gain.setValueAtTime(0, at);
    puff.gain.setValueAtTime(0, at+0.6);
    puff.gain.linearRampToValueAtTime(0.12, at+0.75);
    puff.gain.exponentialRampToValueAtTime(0.001, at+1.5);
    breath.connect(band).connect(puff).connect(out);
    breath.start(at+0.6, Math.random());
    breath.stop(at+1.55);
  }

  // The bell coming down: a whistle that falls as it nears and grows louder, lower for a heavier
  // bell, and as long as its warning (`lead`: the Beast's is longer).
  function whistle(ctx: AudioContext, at: number, pan: number, weight: number, lead: number=BELLS.lead) {
    const low=weight/BELLS.kg[1];
    const tone=ctx.createOscillator();
    tone.frequency.setValueAtTime(2200/low, at);
    tone.frequency.exponentialRampToValueAtTime(700/low, at+lead);
    const shape=ctx.createGain();
    shape.gain.setValueAtTime(0.0001, at);
    shape.gain.exponentialRampToValueAtTime(0.06, at+lead*0.9);
    shape.gain.linearRampToValueAtTime(0, at+lead+0.15);
    tone.connect(shape).connect(panned(ctx, pan));
    tone.start(at);
    tone.stop(at+lead+0.2);
  }

  // A kettlebell turned aside by Algiz: iron struck a glancing blow, ringing bright, and the rush
  // of it going off the other way.
  function ricochet(ctx: AudioContext, at: number, pan: number) {
    const out=panned(ctx, pan);
    for(const [f, level, ring] of [[2100, 0.05, 0.5], [3170, 0.03, 0.35], [4890, 0.018, 0.2]]) {
      const tone=ctx.createOscillator();
      tone.frequency.value=f;
      const shape=ctx.createGain();
      shape.gain.setValueAtTime(level, at);
      shape.gain.exponentialRampToValueAtTime(0.0001, at+ring);
      tone.connect(shape).connect(out);
      tone.start(at);
      tone.stop(at+ring+0.02);
    }
    const away=ctx.createOscillator();
    away.frequency.setValueAtTime(1800, at+0.03);
    away.frequency.exponentialRampToValueAtTime(500, at+0.45);
    const fade=ctx.createGain();
    fade.gain.setValueAtTime(0.03, at+0.03);
    fade.gain.exponentialRampToValueAtTime(0.0001, at+0.45);
    away.connect(fade).connect(out);
    away.start(at+0.03);
    away.stop(at+0.47);
  }

  // A rune stone flown through: a deep chime, a bell's partials over a hum an octave down, the low
  // ones ringing longest.
  function chime(ctx: AudioContext, at: number, pan: number) {
    const out=panned(ctx, pan*0.5);
    for(const [ratio, level, ring] of [[0.5, 0.05, 2.6], [1, 0.07, 2.2], [1.19, 0.035, 1.5], [1.5, 0.03, 1.3], [2, 0.025, 1], [2.74, 0.012, 0.7]]) {
      const tone=ctx.createOscillator();
      tone.frequency.value=196*ratio;
      const shape=ctx.createGain();
      shape.gain.setValueAtTime(0, at);
      shape.gain.linearRampToValueAtTime(level, at+0.01);
      shape.gain.exponentialRampToValueAtTime(0.0001, at+ring);
      tone.connect(shape).connect(out);
      tone.start(at);
      tone.stop(at+ring+0.02);
    }
  }

  // Stones crumbling: a dull knock, a run of grit as the pieces break away (further apart and
  // fainter as they go), and a low rumble under it.
  function rubble(ctx: AudioContext, at: number, pan: number) {
    const out=panned(ctx, pan);
    const body=ctx.createOscillator();
    body.frequency.setValueAtTime(120, at);
    body.frequency.exponentialRampToValueAtTime(45, at+0.3);
    const knock=ctx.createGain();
    knock.gain.setValueAtTime(0.14, at);
    knock.gain.exponentialRampToValueAtTime(0.001, at+0.35);
    body.connect(knock).connect(out);
    body.start(at);
    body.stop(at+0.37);
    const grit=ctx.createBufferSource();
    grit.buffer=sound.audio.noise;
    grit.loop=true;
    const band=ctx.createBiquadFilter();
    band.type='bandpass';
    band.frequency.value=1500;
    band.Q.value=1.1;
    const shape=ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    let when=at+0.04;
    for(let k=0;k<7;k++) {
      shape.gain.setValueAtTime(0, when);
      shape.gain.linearRampToValueAtTime(0.1*(1-k/8), when+0.008);
      shape.gain.exponentialRampToValueAtTime(0.001, when+0.06);
      when+=0.07+k*0.035;
    }
    grit.connect(band).connect(shape).connect(out);
    grit.start(at, Math.random());
    grit.stop(when+0.1);
    const ground=ctx.createBufferSource();
    ground.buffer=sound.audio.noise;
    ground.loop=true;
    const low=ctx.createBiquadFilter();
    low.type='lowpass';
    low.frequency.value=220;
    const rumble=ctx.createGain();
    rumble.gain.setValueAtTime(0, at);
    rumble.gain.linearRampToValueAtTime(0.07, at+0.1);
    rumble.gain.exponentialRampToValueAtTime(0.001, at+1.1);
    ground.connect(low).connect(rumble).connect(out);
    ground.start(at, Math.random());
    ground.stop(at+1.15);
  }

  // A strike's plates spraying off the bar: a clatter of iron, one clink a plate, from all round.
  function clatter(ctx: AudioContext, at: number, count: number) {
    for(let k=0;k<count;k++) {
      const when=at+k*0.045+(k%3)*0.012;
      const out=panned(ctx, (k%2? 1:-1)*(0.25+0.1*(k%4)));
      for(const [f, level, ring] of [[1560+140*(k%5), 0.035, 0.16], [3720+210*(k%3), 0.015, 0.08]]) {
        const tone=ctx.createOscillator();
        tone.frequency.value=f;
        const shape=ctx.createGain();
        shape.gain.setValueAtTime(level, when);
        shape.gain.exponentialRampToValueAtTime(0.0001, when+ring);
        tone.connect(shape).connect(out);
        tone.start(when);
        tone.stop(when+ring+0.02);
      }
    }
  }

  // A plate taken off a gust front: a quick rush of its air, rising, about as loud as a gust heard
  // coming (whoosh) and some 7 dB under the ting it comes with, in a band of its own above the
  // wind's: any fainter and the wind in the lines covers it.
  function gale(ctx: AudioContext, at: number) {
    const air=ctx.createBufferSource();
    air.buffer=sound.audio.noise;
    air.loop=true;
    const band=ctx.createBiquadFilter();
    band.type='bandpass';
    band.Q.value=1.4;
    band.frequency.setValueAtTime(700, at);
    band.frequency.exponentialRampToValueAtTime(2600, at+0.22);
    const shape=ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.25, at+0.03);
    shape.gain.exponentialRampToValueAtTime(0.001, at+0.3);
    air.connect(band).connect(shape).connect(sound.audio.master);
    air.start(at, Math.random());
    air.stop(at+0.32);
  }

  // The fog's bait taken: a low ring out of the mist, and the mist sighing under it.
  function lure(ctx: AudioContext, at: number) {
    for(const [f, level, ring] of [[147, 0.07, 0.9], [405, 0.03, 0.5]]) {
      const tone=ctx.createOscillator();
      tone.frequency.value=f;
      const shape=ctx.createGain();
      shape.gain.setValueAtTime(0, at);
      shape.gain.linearRampToValueAtTime(level, at+0.01);
      shape.gain.exponentialRampToValueAtTime(0.0001, at+ring);
      tone.connect(shape).connect(sound.audio.master);
      tone.start(at);
      tone.stop(at+ring+0.02);
    }
    const mist=ctx.createBufferSource();
    mist.buffer=sound.audio.noise;
    mist.loop=true;
    const low=ctx.createBiquadFilter();
    low.type='lowpass';
    low.frequency.value=600;
    const sigh=ctx.createGain();
    sigh.gain.setValueAtTime(0, at);
    sigh.gain.linearRampToValueAtTime(0.05, at+0.15);
    sigh.gain.exponentialRampToValueAtTime(0.001, at+0.6);
    mist.connect(low).connect(sigh).connect(sound.audio.master);
    mist.start(at, Math.random());
    mist.stop(at+0.62);
  }

  // The judges: a clack as each light comes on, 150 ms apart (bright for white, dull for red), then
  // the call: plates clanking down onto the platform for a good lift, a low double buzz for none.
  function judges(ctx: AudioContext, at: number, red: number, good: boolean) {
    for(let i=0;i<JUDGES.length;i++) clack(ctx, at+i*0.15, (red>>i)&1);
    if(good) clank(ctx, at+0.55);
    else buzz(ctx, at+0.55);
  }

  function clack(ctx: AudioContext, at: number, red: number) {
    const tap=ctx.createBufferSource();
    tap.buffer=sound.audio.noise;
    const band=ctx.createBiquadFilter();
    band.type='bandpass';
    band.frequency.value=red? 700:2400;
    band.Q.value=3;
    const shape=ctx.createGain();
    shape.gain.setValueAtTime(0.3, at);
    shape.gain.exponentialRampToValueAtTime(0.001, at+0.05);
    tap.connect(band).connect(shape).connect(sound.audio.master);
    tap.start(at, Math.random());
    tap.stop(at+0.06);
    const tone=ctx.createOscillator();
    tone.type=red? 'square':'sine';
    tone.frequency.value=red? 196:1320;
    const blip=ctx.createGain();
    blip.gain.setValueAtTime(red? 0.05:0.07, at);
    blip.gain.exponentialRampToValueAtTime(0.001, at+0.09);
    tone.connect(blip).connect(sound.audio.master);
    tone.start(at);
    tone.stop(at+0.1);
  }

  // Iron plates set down hard: a few unrelated ringing partials over a low thump.
  function clank(ctx: AudioContext, at: number) {
    for(const [f, level, ring] of [[420, 0.12, 0.7], [1093, 0.08, 0.45], [1730, 0.05, 0.3], [2520, 0.03, 0.2]]) {
      const tone=ctx.createOscillator();
      tone.frequency.value=f;
      const shape=ctx.createGain();
      shape.gain.setValueAtTime(level, at);
      shape.gain.exponentialRampToValueAtTime(0.0001, at+ring);
      tone.connect(shape).connect(sound.audio.master);
      tone.start(at);
      tone.stop(at+ring+0.02);
    }
    const body=ctx.createOscillator();
    body.frequency.setValueAtTime(95, at);
    body.frequency.exponentialRampToValueAtTime(55, at+0.2);
    const thump=ctx.createGain();
    thump.gain.setValueAtTime(0.3, at);
    thump.gain.exponentialRampToValueAtTime(0.001, at+0.25);
    body.connect(thump).connect(sound.audio.master);
    body.start(at);
    body.stop(at+0.27);
  }

  function buzz(ctx: AudioContext, at: number) {
    const mouth=ctx.createBiquadFilter();
    mouth.type='lowpass';
    mouth.frequency.value=900;
    mouth.connect(sound.audio.master);
    for(let i=0;i<2;i++) {
      const start=at+i*0.25;
      const tone=ctx.createOscillator();
      tone.type='square';
      tone.frequency.value=150;
      const shape=ctx.createGain();
      shape.gain.setValueAtTime(0, start);
      shape.gain.linearRampToValueAtTime(0.09, start+0.01);
      shape.gain.setValueAtTime(0.09, start+0.16);
      shape.gain.linearRampToValueAtTime(0, start+0.18);
      tone.connect(shape).connect(mouth);
      tone.start(start);
      tone.stop(start+0.2);
    }
  }

  // Gjallarhorn: a long low call and its fifth, swelling and brightening, then dying away.
  function horn(ctx: AudioContext, at: number) {
    const mouth=ctx.createBiquadFilter();
    mouth.type='lowpass';
    mouth.frequency.setValueAtTime(400, at);
    mouth.frequency.linearRampToValueAtTime(1400, at+1.2);
    mouth.frequency.linearRampToValueAtTime(700, at+2.6);
    const shape=ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.16, at+0.5);
    shape.gain.setValueAtTime(0.16, at+2);
    shape.gain.linearRampToValueAtTime(0, at+2.8);
    mouth.connect(shape).connect(sound.audio.master);
    for(const ratio of [1, 1.5, 2]) {
      const voice=ctx.createOscillator();
      voice.type='sawtooth';
      voice.frequency.setValueAtTime(98*ratio, at);
      voice.frequency.linearRampToValueAtTime(110*ratio, at+0.6);
      voice.connect(mouth);
      voice.start(at);
      voice.stop(at+2.85);
    }
  }

  // Thunder: from a bolt close by, a crack and then the roll; from one far off only the roll, lower,
  // softer and slower to come up. It rolls because the sound from further along the bolt keeps
  // arriving after the first. Always quiet, a fifth as loud as a strike's thud or less: it is
  // weather, not news. It settles no lower than a phone's speaker can give. `distance` (m) is to the
  // nearest part of the bolt.
  function thunder(ctx: AudioContext, at: number, distance: number, pan: number) {
    const out=panned(ctx, pan);
    const far=clamp((distance-LIGHTNING.range[0])/(LIGHTNING.range[1]-LIGHTNING.range[0]), 0, 1);
    const level=0.16-0.08*far;
    const air=ctx.createBufferSource();
    air.buffer=sound.audio.noise;
    air.loop=true;
    const low=ctx.createBiquadFilter();
    low.type='lowpass';
    low.Q.value=0.7;
    low.frequency.setValueAtTime(1400-900*far, at);
    low.frequency.exponentialRampToValueAtTime(140, at+2);
    // The roll: the loudness swells and sags a few times a second.
    const roll=ctx.createGain();
    roll.gain.value=0.7;
    const sway=ctx.createOscillator();
    sway.frequency.value=2.5+2*Math.random();
    const depth=ctx.createGain();
    depth.gain.value=0.3;
    sway.connect(depth).connect(roll.gain);
    const shape=ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(level, at+0.04+0.25*far);
    shape.gain.setTargetAtTime(0, at+0.3+0.4*far, 0.6+0.4*far);
    air.connect(low).connect(roll).connect(shape).connect(out);
    air.start(at, Math.random());
    sway.start(at);
    air.stop(at+4);
    sway.stop(at+4);
    if(far>=0.4) return;
    // A near one tears the air first: a short, bright crack.
    const tear=ctx.createBufferSource();
    tear.buffer=sound.audio.noise;
    const bright=ctx.createBiquadFilter();
    bright.type='highpass';
    bright.frequency.value=1800;
    const crack=ctx.createGain();
    crack.gain.setValueAtTime(level*(1-2*far), at);
    crack.gain.exponentialRampToValueAtTime(0.0005, at+0.12);
    tear.connect(bright).connect(crack).connect(out);
    tear.start(at, Math.random());
    tear.stop(at+0.14);
  }

  return { caw, thud, whoosh, rush, ting, twice, sparkle, lurch, flap, swish, arpeggio, dud, thunk, thump, swell, grunt, growl, whistle, ricochet, chime, rubble, clatter, gale, lure, judges, clack, clank, buzz, horn, thunder };
}
