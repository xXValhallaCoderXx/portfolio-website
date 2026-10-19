import type { summariseRun } from '../domains/good-lift/meet-sheet.ts';

/** Committed browser evidence. Tests compare these values; they never regenerate them. */
export interface BrowserRunRecord {
  kind: string;
  scenario: string;
  pureFlight?: boolean;
  simVersion: number;
  day: number;
  link: string;
  sheet: ReturnType<typeof summariseRun>;
  metrics: { recovered: boolean; assisted: boolean; minimumClearance: number };
  phases: Array<{ phase: string }>;
}
export interface BrowserRunReceipt { engine: string; records: BrowserRunRecord[] }
