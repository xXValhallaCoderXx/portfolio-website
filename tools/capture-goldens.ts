// The Chromium receipts the tests hold Node to (src/test/fixtures/good-lift-*-chromium.json). Each
// set of flights is flown in a real Chromium page, served by Vite from this checkout with nothing
// else on the page, and then flown again here, in Node: a receipt is written only once every flight
// in it comes out the very same in both, and the runs on each glider are also sent through the board
// function's own handler, which must rank them as their browser did. A receipt keeps the engine,
// when it was made and a digest of every source its flights were flown from, which must not change
// while they are flown. Expected values are only ever made this way, never by a test run.
//
//   npx tsx tools/capture-goldens.ts [set …]     every set, or only those named (SETS below)
//
// It needs a Chromium to drive (CHROMIUM: a chrome or chrome-headless-shell binary) and Playwright's
// core (PLAYWRIGHT_CORE: its index.mjs, unless playwright-core is installed here). QA_BASE points it
// at a server already serving this checkout instead of starting one. Then `npm test`.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { closure } from './source-graph.ts';
import { decodeLog, isDirectFrame } from '../src/domains/good-lift/recorder.ts';
import { replayLog } from '../src/domains/good-lift/replay.ts';
import { SIM_VERSION } from '../src/domains/good-lift/sim-version.ts';
import { DAY_MS } from '../src/domains/good-lift/good-lift-address.ts';
import { replayLesson, replayManeuver, replayRecoveryFlight } from '../src/test/helpers/test-goldens.ts';
import { replayBrakeCapture } from '../src/test/helpers/test-brake-replay.ts';
import { replayDirectLesson } from '../src/test/helpers/test-direct-lessons.ts';
import { replaySpiralCombo } from '../src/test/helpers/test-spiral-combo.ts';
import { createBoard } from '../functions/src/runs.ts';

const ROOT = resolve(import.meta.dirname, '..');
const FIXTURES = resolve(ROOT, 'src/test/fixtures');
type Captured = { [key: string]: unknown; link: string };
interface Capture {
  fixture: string;
  // The modules its flights are flown from, whose sources the receipt pins.
  roots: string[];
  // What the page runs, as JavaScript: an async function returning the records.
  browser: string;
  // Flies each record again here; throws on the first that differs.
  check(records: Captured[]): Promise<void> | void;
  provenance?: string;
  // What each record says it is, where the capture does not say so itself.
  source?: string;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const bitsOf = (record: Captured) => {
  const read = decodeLog(record.link);
  if (!read.ok) throw new Error(`a record's link does not read: ${read.why}`);
  return read.log;
};
const sheetMatches = (record: Captured) => {
  if (!same(replayLog(bitsOf(record)), record.sheet)) throw new Error(`${String(record.name ?? record.kind ?? record.glider)}: Node's sheet differs`);
};

const SETS: Readonly<{ [name: string]: Capture }> = {
  runs: {
    fixture: 'good-lift-chromium.json',
    roots: ['src/test/helpers/test-goldens.ts'],
    browser: `async () => { const m = await import('/src/test/helpers/test-goldens.ts');
      return [...m.GOLDEN_RUNS.map((plan) => m.captureRun(plan)), ...['orbit', 'wingover', 'pitch'].map((kind) => m.captureManeuver(kind))]; }`,
    check(records) {
      for (const record of records) {
        if (record.pureFlight) {
          if (!same(replayManeuver(record as never, bitsOf(record).bits), record.snapshot)) throw new Error(`${String(record.name)}: Node's flight differs`);
        } else sheetMatches(record);
      }
    },
  },
  lessons: {
    fixture: 'good-lift-lessons-chromium.json',
    roots: ['src/test/helpers/test-goldens.ts'],
    browser: `async () => { const m = await import('/src/test/helpers/test-goldens.ts'), records = [];
      for (const kind of ['pitch', 'wingover']) for (const side of [-1, 1]) for (const delay of [0, 0.1, 0.2, 0.3]) records.push(m.captureLesson(kind, side, delay));
      return records; }`,
    check(records) {
      for (const record of records) {
        if (!same(replayLesson(record as never, bitsOf(record).bits), record.snapshot)) throw new Error(`${String(record.kind)} lesson: Node's flight differs`);
      }
    },
  },
  recovery: {
    fixture: 'good-lift-recovery-chromium.json',
    roots: ['src/test/helpers/test-goldens.ts'],
    browser: `async () => { const m = await import('/src/test/helpers/test-goldens.ts'), records = [];
      for (const scenario of ['stall', 'frontal']) for (const delay of [0, 0.15, 0.3, 0.6]) records.push(m.captureRecoveryFlight(scenario, delay));
      return records; }`,
    check(records) {
      for (const record of records) {
        if (!same(replayRecoveryFlight(record as never, bitsOf(record).bits), record.snapshot)) throw new Error(`${String(record.scenario)} recovery: Node's flight differs`);
      }
    },
  },
  brakes: {
    fixture: 'good-lift-brakes-chromium.json',
    source: 'Chromium computed quantized proportional controls, bodies, wing, observers and results',
    roots: ['src/test/helpers/test-brake-replay.ts'],
    browser: `async () => { const m = await import('/src/test/helpers/test-brake-replay.ts');
      return ['direct', 'mixed'].map((kind) => m.captureBrakeRun(kind)).concat(['stall', 'frontal'].map((kind) => m.captureBrakeRecovery(kind))); }`,
    check(records) {
      for (const record of records) {
        const replay = replayBrakeCapture(record as never, bitsOf(record).bits);
        if (!same(replay.snapshot, record.snapshot) || !same(replay.checkpoints, record.checkpoints) || !record.pureFlight && !same(replay.sheet, record.sheet)) {
          throw new Error(`${String(record.kind)} brakes: Node's flight differs`);
        }
      }
    },
  },
  'direct-lessons': {
    fixture: 'good-lift-direct-lessons-chromium.json',
    source: 'Chromium computed visible paired-target lesson, canonical byte controls, complete bodies, observers and banked style',
    roots: ['src/test/helpers/test-direct-lessons.ts'],
    provenance: 'Isolated high-air lesson with fixed 5.5 m/s rising air; follows only visible paired targets and working-brake recovery. No body/angle/result injection. This is lesson and replay evidence, not a scored launch or device input trial.',
    browser: `async () => { const m = await import('/src/test/helpers/test-direct-lessons.ts'), records = [];
      for (const kind of ['pitch', 'wingover', 'loop']) for (const side of [-1, 1]) for (const delay of [0, 0.1, 0.2, 0.3]) {
        const record = m.captureDirectLesson(kind, side, delay), { watch, style, loops } = record.snapshot;
        if (!record.started || JSON.stringify(record.learned) !== JSON.stringify([kind]) || record.lesson.phase !== 'banked' || record.metrics.stalls ||
          record.metrics.tucks || watch.breaks || watch.calm < 1 || style.landed !== 1 || style.lost || !(style.total > 0) || loops !== (kind === 'loop' ? 1 : 0)) {
          throw new Error('Incomplete visible proportional lesson: ' + JSON.stringify({ kind, side, delay }));
        }
        records.push(record);
      }
      return records; }`,
    check(records) {
      for (const record of records) {
        const log = bitsOf(record);
        if (!same([...log.bits], record.frames) || ![...log.bits].every(isDirectFrame)) throw new Error('direct lesson: its frames are not its link\'s');
        const replay = replayDirectLesson(record as never, log.bits);
        if (!same(replay.snapshot, record.snapshot) || !same(replay.checkpoints, record.checkpoints)) throw new Error(`${String(record.kind)} direct lesson: Node's flight differs`);
      }
    },
  },
  'spiral-combo': {
    fixture: 'good-lift-spiral-combo-chromium.json',
    source: 'Chromium computed canonical paired brakes, physical spiral and fresh wingovers',
    roots: ['src/test/helpers/test-spiral-combo.ts'],
    provenance: 'Isolated still-air physical Spiral 360 -> Wingover combo; actual course, no injected angles, forces or results',
    browser: `async () => { const m = await import('/src/test/helpers/test-spiral-combo.ts'); return [-1, 1].map((side) => m.captureSpiralCombo(side, 0.3)); }`,
    check(records) {
      for (const record of records) {
        const replay = replaySpiralCombo(record as never, bitsOf(record).bits);
        if (!same(replay.snapshot, record.snapshot) || !same(replay.checkpoints, record.checkpoints)) throw new Error('spiral combo: Node\'s flight differs');
      }
    },
  },
  gliders: {
    fixture: 'good-lift-gliders-chromium.json',
    source: 'Chromium computed run on a glider: TST\'s keys, a spiral banked on one hand, every strike flown out',
    roots: ['src/test/helpers/test-glider-runs.ts', 'functions/src/runs.ts'],
    browser: `async () => { const [m, g] = await Promise.all([import('/src/test/helpers/test-glider-runs.ts'), import('/src/domains/good-lift/glider-ids.ts')]);
      return g.GLIDERS.map((glider) => m.captureGliderRun(glider)); }`,
    async check(records) {
      for (const record of records) {
        sheetMatches(record);
        // The board's function takes it on the day it was flown, as its browser ranked it.
        const store = { async read() { return null; }, async update(_key: string, change: (doc: unknown) => { result: unknown }) { return change(null).result; } };
        const board = createBoard({ store: store as never, now: () => (record.day as number) * DAY_MS + 5 * 3_600_000, log() {} });
        const reply = await board.handle({ method: 'POST', path: '/runs', ip: '203.0.113.7',
          body: JSON.stringify({ log: record.link, token: 'Q2hvc2VuLWJ5LWEtZmFpci1kaWNlLXJvbGwtZm9yLW1l' }) });
        const sheet = record.sheet as { total: number; peak: number; stats: { style: number } };
        const row = reply.body.board?.rows[0];
        if (reply.status !== 200 || !row || row.glider !== record.glider || row.total !== sheet.total || row.style !== sheet.stats.style || row.peak !== sheet.peak) {
          throw new Error(`${String(record.glider)}: the board's function took it as ${JSON.stringify(reply.body)}`);
        }
      }
    },
  },
};

// Every source a set's flights are flown from: the closure of its roots, this tool and its graph.
function sourcesOf(capture: Capture) {
  const files = new Set<string>();
  for (const root of [...capture.roots, 'tools/capture-goldens.ts', 'tools/source-graph.ts']) {
    for (const file of closure(resolve(ROOT, root)).files) files.add(relative(ROOT, file));
  }
  return [...files].sort();
}
const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const digestOf = (files: string[]) => sha256(files.map((file) => `${file}\0${readFileSync(resolve(ROOT, file), 'utf8')}`).join('\0'));

interface Page { route(url: string, handler: (route: { fulfill(response: object): Promise<void> }) => unknown): Promise<void>; goto(url: string): Promise<unknown>; evaluate(script: string): Promise<unknown> }
interface Browser { newPage(): Promise<Page>; version(): string; close(): Promise<void> }

const asked = process.argv.slice(2);
for (const name of asked) if (!(name in SETS)) throw new Error(`No set "${name}": there are ${Object.keys(SETS).join(', ')}`);
const chosen = asked.length ? asked : Object.keys(SETS);
const executablePath = process.env.CHROMIUM;
if (!executablePath) throw new Error('Set CHROMIUM to a chrome or chrome-headless-shell binary to fly the captures in.');
const core = process.env.PLAYWRIGHT_CORE;
const { chromium } = await import(core ? pathToFileURL(core).href : 'playwright-core') as { chromium: { launch(options: object): Promise<Browser> } };

let base = process.env.QA_BASE?.replace(/\/+$/, '');
let server: { close(): Promise<void> } | null = null;
if (!base) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port: 5190, strictPort: false, hmr: false } });
  await vite.listen();
  base = vite.resolvedUrls!.local[0].replace(/\/+$/, '');
  server = vite;
}
const browser = await chromium.launch({ executablePath, headless: true });
try {
  for (const name of chosen) {
    const capture = SETS[name], files = sourcesOf(capture), before = digestOf(files);
    const page = await browser.newPage();
    // An empty page of the same origin: no HMR client, no clocks of the page's own and nothing drawn.
    await page.route(`${base}/__goldens`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Good Lift receipts</title>' }));
    await page.goto(`${base}/__goldens`);
    const records = await page.evaluate(`(${capture.browser})()`) as Captured[];
    await capture.check(records);
    if (digestOf(files) !== before) throw new Error(`${name}: its sources changed while it was flown; fly it again`);
    for (const record of records) {
      if (capture.source) record.source = capture.source;
      record.nodeMatches = true;
    }
    const receipt = { engine: `Chromium ${browser.version()}`, node: process.version, generated: new Date().toISOString(),
      command: `npx tsx tools/capture-goldens.ts ${name}`, simVersion: SIM_VERSION, ...(capture.provenance ? { provenance: capture.provenance } : {}),
      sourceDigest: before, sourceManifest: files.map((path) => ({ path, sha256: sha256(readFileSync(resolve(ROOT, path))) })), records };
    writeFileSync(resolve(FIXTURES, capture.fixture), `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(`${name}: ${records.length} flights, Chromium and Node the same → src/test/fixtures/${capture.fixture}`);
  }
} finally {
  await browser.close();
  await server?.close();
}
