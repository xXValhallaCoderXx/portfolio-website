import type { WorldRow } from '../../src/domains/good-lift/board.types.ts';

export interface ServerRow extends WorldRow { device: string; flight?: string }
export interface DayBoard { rows: ServerRow[]; devices: Record<string, number> }
export interface BoardDocument extends DayBoard { version: number; day: number; updated: number; expires: Date }
export interface PublicBoard { version: number; day: number; rows: WorldRow[] }
export interface ApiBody {
  ok: boolean; why?: string; board?: PublicBoard; rank?: number; removed?: number;
}
export interface ApiReply { status: number; body: ApiBody; cache: string }
export interface BoardChange { doc: BoardDocument | null; result: ApiReply }
export interface BoardStore {
  read(key: string): Promise<unknown>;
  update(key: string, change: (doc: unknown) => BoardChange): Promise<ApiReply>;
}
export interface BoardLimits {
  minute: Record<string, number>; runs: number; devices: number; body: number;
  token: readonly number[]; cache: number;
}
export interface BoardOptions {
  store: BoardStore; now?: () => number;
  log?: (message: string, detail: unknown) => void;
  limits?: BoardLimits;
}
export interface JudgmentOptions { version: number; day: number; at: number; limits?: BoardLimits }
export interface BoardRequest { method?: string; path?: string; body?: unknown; ip?: string; authorization?: string }
