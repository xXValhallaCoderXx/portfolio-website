import { rankOf, scoreOf } from '../../../domains/good-lift/score.ts';
import { medalsSaid } from '../../../domains/good-lift/meet-card.ts';
import { outranks, withBot } from '../../../domains/good-lift/board.ts';
import type { RankedScore } from '../../../domains/good-lift/board.types.ts';
import type { BoardRow, BotResult, RunResult, WorldResult } from '../good-lift.models.ts';

// Keep the world's leading rows, followed by this browser's place if it is further down.
const WORLD_SHOWN = 10;

export function worldBoardView(world: WorldResult, tst?: BoardRow | null) {
  const top = world.rows.slice(0, WORLD_SHOWN);
  // TST stands among the rows shown, or just under the last of them, or is not shown.
  const below = world.rows[WORLD_SHOWN];
  const shown = tst && !(below && outranks(below, tst)) ? withBot(top, tst) : top;
  const mine = world.rank > WORLD_SHOWN ? world.rows[world.rank - 1] : null;
  return { shown, mine };
}

// A race uses board ranking and peak height when the scores are level.
export function verdict(mine: RankedScore, theirs: RankedScore & { who?: string }) {
  const name = theirs.who || 'they';
  const by = (winner: RankedScore, loser: RankedScore) => {
    const pts = scoreOf(winner) - scoreOf(loser);
    return pts > 0 ? `${pts.toLocaleString('en-GB')} pts` : 'under a point';
  };
  const ahead = rankOf(mine) - rankOf(theirs);
  if (ahead > 0) return `you won by ${by(mine, theirs)}`;
  if (ahead < 0) return `${name} won by ${by(theirs, mine)}`;
  if (mine.peak > theirs.peak) return 'level on points; you climbed higher';
  if (mine.peak < theirs.peak) return `level on points; ${name} climbed higher`;
  return 'a dead heat';
}


/** Correlate delayed board/bot responses with the displayed run without changing it. */
export function buildResultView(result: RunResult, bots: BotResult | null, world: WorldResult | null) {
  const rival = result.target && !result.target.error ? result.target : null;
  // The bots' word on this run, once they have landed on its sky: never another run's.
  const landed = bots && bots.at === result.at && bots.seed === result.seed ? bots : null;
  const said = !landed ? '' : landed.failed ? 'The bots could not fly this sky.' : medalsSaid(landed);
  const earned = new Set([...(result.feats?.earned ?? []), ...(landed?.fresh ?? [])]);
  const fresh = new Set([...(result.feats?.fresh ?? []), ...(landed?.fresh ?? [])]);
  const best = result.best ?? { total: result.total, peak: result.peak, score: scoreOf(result) };
  // The day's runs, with TST pinned among them once it has flown; numbered as runs, the bot unnumbered.
  const rows = !result.board ? [] : landed?.tst ? withBot(result.board.rows, landed.tst) : result.board.rows;

  // The world board's answer, once it has come for this very run.
  const worldFor = world && world.at === result.at && world.seed === result.seed && result.board ? world : null;
  return { rival, landed, said, earned, fresh, best, rows, worldFor };
}

/** The carried bar and banked rewards remain different quantities after a quit. */
export function resultSummary(result: RunResult) {
  const endings: Record<string, string> = { quit: 'BAR FORFEIT', fog: 'CAUGHT BY THE MIST', time: 'TEN MINUTES ALOFT', landed: 'BACK ON THE GROUND' };
  return { ending: endings[result.reason] ?? 'FLIGHT COMPLETE',
    shortfall: result.peak < 150 ? Math.ceil(150 - result.peak) : 0,
    banked: result.total, score: scoreOf(result), personalBest: !!result.newBest };
}

export function medalTrack(result: RunResult, bots: BotResult | null) {
  if (!bots || bots.failed || bots.at !== result.at || bots.seed !== result.seed || !bots.medals?.length) return null;
  const marks = bots.medals.map(mark => ({ ...mark, score: scoreOf(mark) }));
  const score = scoreOf(result), next = marks.find(mark => !outranks(result, mark));
  return { marks, score, maximum: Math.max(1, score, ...marks.map(mark => mark.score)),
    caption: next ? next.score > score ? `${Math.ceil(next.score - score)} to ${next.medal}` : `Climb higher for ${next.medal}` : result.reason === 'quit' ? 'Targets reached · bar forfeited' : 'Gold reached' };
}
