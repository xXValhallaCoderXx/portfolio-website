/** Shared score and leaderboard values; persistence and transport validate unknown input. */
export interface Score { total: number; style: number; peak: number; red: number[] }
export interface BoardRow extends Score { who: string; via: 'me' | 'link'; at: number; log: string; byname: string; glider: string }
export interface Board { days: Record<string, { rows: BoardRow[] }> }
export type BotScore = Omit<Score, 'style'> & { style?: number };
export interface BotScores { key: string; seed: number; glider: string; scores: BotScore[] }
export interface WorldRow extends Score { who: string; byname: string; at: number; id: string; glider: string }
export interface BotRow extends Score { who: string; via: 'bot'; at: number; log: string; byname: string; glider?: string }
export type DisplayBoardRow = BoardRow | BotRow;
export interface RankedScore { total: number; style?: number; peak: number }
export interface RankableScore extends RankedScore { at: number }
