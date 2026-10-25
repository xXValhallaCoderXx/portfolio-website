import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunVoices, type RunAudioPort } from './run-audio.adapter.ts';

// A stand-in for the browser's audio that remembers each tone started (its pitch, kind and when),
// each burst of noise started, and every level a gain was set to.
function fakeAudio() {
  const tones: { at: number; frequency: number; type: string }[] = [], noises: number[] = [], levels: number[] = [];
  const param = () => ({ value: 0, setValueAtTime(value: number) { levels.push(value); }, linearRampToValueAtTime(value: number) { levels.push(value); },
    exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  const node = () => ({ connect<T>(next: T) { return next; } });
  const ctx = {
    createOscillator() {
      const tone = { ...node(), type: 'sine', frequency: param(), start(at: number) { tones.push({ at, frequency: tone.frequency.value, type: tone.type }); }, stop() {} };
      return tone;
    },
    createGain: () => ({ ...node(), gain: param() }),
    createBiquadFilter: () => ({ ...node(), type: '', frequency: param(), Q: param() }),
    createBufferSource: () => ({ ...node(), buffer: null, loop: false, start(at: number) { noises.push(at); }, stop() {} }),
  } as unknown as AudioContext;
  const port = { audio: { noise: {}, master: node() }, panned: () => node() } as unknown as RunAudioPort;
  return { ctx, voices: createRunVoices(port), tones, noises, levels };
}

const close = (actual: number[], expected: number[]) =>
  actual.length === expected.length && actual.every((value, i) => Math.abs(value - expected[i]) < 1e-9);

test('a set banked is still the three notes it always was, unless a bigger combo asks for four or five', () => {
  const today = fakeAudio();
  today.voices.arpeggio(today.ctx, 1);
  assert.ok(close(today.tones.map(tone => tone.frequency), [523.25, 784.875, 1046.5]), JSON.stringify(today.tones));
  assert.ok(close(today.tones.map(tone => tone.at), [1, 1.07, 1.14]));
  assert.ok(close(today.noises, [1.14]), 'its shimmer as the last note sounds');
  for (const [notes, top] of [[4, 523.25 * 2.5], [5, 523.25 * 3]]) {
    const lab = fakeAudio();
    lab.voices.arpeggio(lab.ctx, 0, notes);
    assert.equal(lab.tones.length, notes);
    assert.ok(close([lab.tones.at(-1)!.frequency], [top]), 'climbing on up the chord');
    assert.ok(close(lab.noises, [(notes - 1) * 0.07]));
  }
});

test('a unit\'s tick climbs with the units, and BANK NOW is two quick ticks', () => {
  const pitches: number[] = [];
  for (let units = 2; units <= 11; units++) {
    const audio = fakeAudio();
    audio.voices.tick(audio.ctx, 0, units);
    pitches.push(audio.tones[0].frequency);
  }
  assert.ok(pitches.every((pitch, i) => i === 0 || pitch > pitches[i - 1]), pitches.join());
  const hurry = fakeAudio();
  hurry.voices.hurry(hurry.ctx, 0);
  assert.equal(hurry.tones.length, 2);
  assert.ok(hurry.tones[1].at > hurry.tones[0].at);
});

test('a link is a fifth, and a flow brightens it with the octave and a shimmer', () => {
  const linked = fakeAudio();
  linked.voices.fifth(linked.ctx, 0);
  assert.equal(linked.tones.length, 2);
  assert.ok(close([linked.tones[1].frequency / linked.tones[0].frequency], [1.5]));
  assert.equal(linked.noises.length, 0);
  assert.ok(linked.tones[0].at > 0, 'just after the swish of the move it joins with');
  const flowed = fakeAudio();
  flowed.voices.fifth(flowed.ctx, 0, true);
  assert.equal(flowed.tones.length, 3);
  assert.equal(flowed.noises.length, 1);
});

test('the combo\'s voices are quiet: no louder than a banked set\'s notes, save the tick\'s narrow click', () => {
  const audio = fakeAudio();
  audio.voices.arpeggio(audio.ctx, 0, 5);
  const arpeggio = Math.max(...audio.levels);
  for (const voice of ['tick', 'fifth', 'hurry'] as const) {
    const heard = fakeAudio();
    if (voice === 'tick') heard.voices.tick(heard.ctx, 0, 5);
    else if (voice === 'fifth') heard.voices.fifth(heard.ctx, 0, true);
    else heard.voices.hurry(heard.ctx, 0);
    assert.ok(Math.max(...heard.levels) <= 0.08, `${voice}: ${Math.max(...heard.levels)}`);
    assert.ok(Math.max(...heard.levels.filter(level => level !== 0.08)) <= arpeggio, voice);
  }
});

test('a core met at half weight thumps exactly as it always did; met harder, louder and lower', () => {
  const today = fakeAudio(), half = fakeAudio(), hard = fakeAudio();
  today.voices.thump(today.ctx, 1, 0.3);
  half.voices.thump(half.ctx, 1, 0.3, 0.5);
  hard.voices.thump(hard.ctx, 1, 0.3, 1);
  assert.deepEqual(half.levels, today.levels);
  assert.ok(close(today.levels, [110, 0, 0.16, 0.08]), JSON.stringify(today.levels));
  assert.ok(hard.levels[0] < 110 && hard.levels[2] > 0.16, JSON.stringify(hard.levels));
  const creaked = fakeAudio();
  creaked.voices.creak(creaked.ctx, 2, 0.3);
  assert.deepEqual(creaked.noises, [2.04], 'a creak just after the thump');
});
