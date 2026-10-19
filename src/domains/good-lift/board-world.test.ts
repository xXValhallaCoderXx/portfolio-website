import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { WORLD_BOARD, normalizeWorldRow } from './board-world.ts';
import { digest, runId } from '../../adapters/crypto/run-identity.service.ts';
import { decodeLog, encodeLog } from './recorder.ts';
import { SIM_VERSION } from './sim-version.ts';
import { BYNAMES } from './meet-bynames.ts';
import { BLOCKED } from './meet-initials.ts';

// A log of any controls at all: a run's id is worked out from its log alone, flown or not.
const BITS = Uint8Array.from({ length: 900 }, (_, i) => [0, 1, 1, 4, 8, 2, 3][(i >> 5) % 7]);
const log = (meta = {}, bits = BITS) => {
  const decoded = decodeLog(encodeLog({ simVersion: SIM_VERSION, seed: 0xc0ffee, day: 20_770, initials: 'REN', total: 102.5, peak: 640, ...meta }, bits, bits.length));
  assert.ok(decoded.ok);
  return decoded.log;
};

test('digest is SHA-256 in hex, cut to the digits asked for, as the page and the function both work it out', async () => {
  assert.equal(await digest('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await digest('abc', 24), 'ba7816bf8f01cfea414140de');
  // Its text is read as UTF-8, as Node's own hash reads it.
  assert.equal(await digest('ᚱᛖᚾ'), createHash('sha256').update('ᚱᛖᚾ', 'utf8').digest('hex'));
});

test('a run\'s id is a digest of the run alone: its rules, seed and controls, never its initials, claims, day or flags', async () => {
  const id = await runId(log());
  assert.match(id, new RegExp(`^[0-9a-f]{${WORLD_BOARD.id}}$`));
  // Its controls each as the step reads them: the brake and the bar bits together are the ears, both
  // arrows are the bar, and the brake wins over it.
  const read = Uint8Array.from(BITS, (bits) => {
    const both = (bits & 3) === 3;
    if ((bits & 12) === 12) return 12 | (both ? 0 : bits & 3);
    const brake = bits & 4;
    return (both ? 0 : bits & 3) | brake | (!brake && (both || bits & 8) ? 8 : 0);
  });
  const bare = encodeLog({ simVersion: SIM_VERSION, seed: 0xc0ffee }, read, BITS.length);
  assert.equal(id, createHash('sha256').update(bare).digest('hex').slice(0, WORLD_BOARD.id));
  // The same run however its link is dressed: renamed, unnamed, re-claimed, on a phone, any day.
  for (const meta of [{ initials: 'TOR' }, { initials: '' }, { total: 1000, peak: 1 }, { touch: true }, { day: 0 }]) {
    assert.equal(await runId(log(meta)), id, JSON.stringify(meta));
  }
  // Any other run is another id: another sky, other rules, one step's controls changed, one step more.
  const changed = Uint8Array.from(BITS);
  changed[450] ^= 4;
  const longer = Uint8Array.from([...BITS, 0]);
  const others = await Promise.all([runId(log({ seed: 0xc0ffef })), runId(log({ simVersion: SIM_VERSION + 1 })), runId(log({}, changed)), runId(log({}, longer))]);
  assert.equal(new Set([id, ...others]).size, 5);
});

test('a row of the world board is kept clean: named, never blocked, its numbers whole and its id a run\'s, and nothing more', () => {
  const row = { who: 'REN', byname: BYNAMES[0].id, total: 512.5, style: 0, peak: 1412, red: [0, 2, 4], at: 1_792_000_000_000, id: 'a'.repeat(WORLD_BOARD.id) };
  assert.deepEqual(normalizeWorldRow(row), row);
  // The device a run came from, and anything else, never leaves the function.
  assert.deepEqual(normalizeWorldRow({ ...row, device: 'f'.repeat(32), log: 'AQ', extra: 1 }), row);
  // A byname this build does not know is blanked, and the row kept.
  assert.deepEqual(normalizeWorldRow({ ...row, byname: 'the Unknown' }), { ...row, byname: '' });
  assert.deepEqual(normalizeWorldRow({ ...row, byname: undefined }), { ...row, byname: '' });
  const damaged = [
    { who: '' }, { who: 'ren' }, { who: 'RE' }, { who: 7 }, ...BLOCKED.map((who) => ({ who })),
    { total: 101 }, { total: -2.5 }, { total: '512.5' }, { peak: 1.5 }, { red: [8] }, { red: 'clean' },
    { at: -1 }, { at: Infinity }, { at: '1' }, { id: 'A'.repeat(WORLD_BOARD.id) }, { id: 'a'.repeat(WORLD_BOARD.id + 1) }, { id: undefined },
  ];
  for (const harm of damaged) assert.equal(normalizeWorldRow({ ...row, ...harm }), null, JSON.stringify(harm));
  for (const nonsense of [null, undefined, 'row', [], 7]) assert.equal(normalizeWorldRow(nonsense), null);
  // A copy: changing it changes nothing the caller holds.
  const copy = normalizeWorldRow(row);
  assert.ok(copy);
  copy.red.push(1);
  assert.deepEqual(row.red, [0, 2, 4]);
});

test('a run keeps its id however its keys are written, where the step flies them the same', async () => {
  const log = (bits: number[]) => ({ simVersion: 4, seed: 7, steps: bits.length, bits: Uint8Array.from(bits) });
  const plain = await runId(log([0, 2, 2, 8, 4, 4, 1, 9, 12, 13, 0]));
  // Both arrows are the bar, and the brake wins over the bar they make; the ears with both arrows
  // are the ears held straight.
  assert.equal(await runId(log([0, 2, 2, 3, 7, 4, 1, 9, 15, 13, 0])), plain);
  assert.equal(await runId(log([0, 2, 2, 11, 4, 7, 1, 9, 12, 13, 0])), plain);
  // A step the wing flies differently is another run: the brake and the bar bits together are the
  // big ears, not the brake, and the ears steer as the arrows say.
  assert.notEqual(await runId(log([0, 2, 2, 8, 12, 4, 1, 9, 12, 13, 0])), plain);
  assert.notEqual(await runId(log([0, 2, 2, 8, 4, 4, 1, 9, 12, 14, 0])), plain);
  assert.notEqual(await runId(log([0, 2, 2, 8, 4, 4, 2, 9, 12, 13, 0])), plain);
  assert.notEqual(await runId(log([0, 2, 2, 0, 4, 4, 1, 9, 12, 13, 0])), plain);
  assert.notEqual(await runId({ ...log([0, 2, 2, 8, 4, 4, 1, 9, 12, 13, 0]), seed: 8 }), plain);
});


test('run identity preserves deep intent but canonicalizes its aliases and ears priority', async () => {
  const make = (bits: number[]) => ({ simVersion: SIM_VERSION, seed: 7, steps: bits.length, bits: Uint8Array.from(bits) });
  const canonical = await runId(make([0, 20, 21, 22, 20, 12, 13, 0]));
  assert.equal(await runId(make([0, 16, 17, 18, 23, 28, 29, 0])), canonical);
  assert.notEqual(await runId(make([0, 4, 5, 6, 4, 12, 13, 0])), canonical);
});
