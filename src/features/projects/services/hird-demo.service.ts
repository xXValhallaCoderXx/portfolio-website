// A prerecorded research swarm, in Hird's own words for its seats, steps and timeline. Nothing
// runs: the script below is replayed, and each seat's "work" is a sample written for this page.

export const TOPIC = 'What would it take to make the mobile app work offline?';
export const BUDGET = 3;

export const SEATS = {
  a: {
    name: 'Research agent A',
    step: 'investigate',
    said: 'Writes go straight to the API with no local queue. Three screens read through one fetch wrapper, so a cache has a single place to live.',
    cites: ['src/api/client.ts:12-58', 'src/screens/Orders.tsx:40-71'],
  },
  b: {
    name: 'Research agent B',
    step: 'investigate',
    said: 'Two mature options: a sync engine with its own store, or a request queue over the storage the app already has. The queue is the smaller change.',
    cites: ['search "offline" (14 matches)', 'package.json:18-44'],
  },
  t: {
    name: 'Technical evaluator',
    step: 'investigate',
    said: 'Conflicts are the real cost. Orders are edited by one user at a time, so last-write-wins is safe there; shared lists are not.',
    cites: ['src/models/order.ts:5-33', 'src/models/list.ts:20-64'],
  },
  s: {
    name: 'Synthesizer',
    step: 'synthesize',
    said: 'Recommend the request queue first: one wrapper to change, last-write-wins for orders, and shared lists kept online-only until conflicts are designed.',
    cites: ['3 of 3 researchers reported'],
  },
  ra: {
    name: 'Council reviewer A',
    step: 'council',
    said: 'Evidence quality: pass. Coverage: pass. A1 (advisory): no estimate of how large the local store could grow.',
    cites: ['rubric: evidence quality, coverage'],
  },
  rb: {
    name: 'Council reviewer B',
    step: 'council',
    said: 'Contradictions: none found. Recommendation follows from the findings. No blocking findings.',
    cites: ['rubric: contradictions, recommendation follows'],
  },
  c: {
    name: 'Council chair',
    step: 'council',
    said: 'F1 (advisory) kept from A1. No blocking findings, so the outcome is a pass.',
    cites: ['Council: Pass'],
  },
  report: {
    name: 'research report',
    step: 'report',
    said: 'Council: Pass. Start with a request queue for orders, keep shared lists online-only, and estimate how large the local store could grow.',
    cites: ['Research: offline support', 'Council advisory: local store size'],
  },
};

export type SeatId = keyof typeof SEATS;
export type StageId = 'investigate' | 'synthesize' | 'council' | 'report';
export type SeatStatus = 'running' | 'done' | 'waiting';
export const STAGES: { key: StageId; seats: SeatId[] }[] = [
  { key: 'investigate', seats: ['a', 'b', 't'] },
  { key: 'synthesize', seats: ['s'] },
  { key: 'council', seats: ['ra', 'rb', 'c'] },
  { key: 'report', seats: ['report'] },
];

// The run, beat by beat: who starts or finishes, what the timeline says, and what has been spent.
export const SCRIPT: { line: string; start?: SeatId[]; done?: SeatId[]; spend: number; report?: boolean }[] = [
  { line: 'Started investigate', start: ['a', 'b', 't'], spend: 0 },
  { line: 'Research agent A: read_file src/api/client.ts:12-58', spend: 0.01 },
  { line: 'Research agent B: search_code "offline"', spend: 0.02 },
  { line: 'Technical evaluator: read_file src/models/order.ts:5-33', spend: 0.04 },
  { line: 'Research agent A reported ($0.03)', done: ['a'], spend: 0.06 },
  { line: 'Research agent B reported ($0.04)', done: ['b'], spend: 0.08 },
  { line: 'Technical evaluator reported ($0.03)', done: ['t'], spend: 0.1 },
  { line: 'Finished investigate', start: ['s'], spend: 0.1 },
  { line: 'Synthesizer answered', done: ['s'], start: ['ra', 'rb'], spend: 0.14 },
  { line: 'Council reviewer A answered', done: ['ra'], spend: 0.17 },
  { line: 'Council reviewer B answered', done: ['rb'], start: ['c'], spend: 0.19 },
  { line: 'Council chair answered', done: ['c'], spend: 0.21 },
  { line: 'Created research-report: Research: offline support', report: true, spend: 0.21 },
];

export const BEAT = 720; // milliseconds between beats

export function stateAt(beat: number) {
  const seats: Partial<Record<SeatId, SeatStatus>> = {};
  let report = false;
  for (const step of SCRIPT.slice(0, beat)) {
    for (const id of step.start ?? []) seats[id] = 'running';
    for (const id of step.done ?? []) seats[id] = 'done';
    report ||= !!step.report;
  }
  return { seats, report, spend: beat ? SCRIPT[beat - 1].spend : 0 };
}

