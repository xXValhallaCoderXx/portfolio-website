import { readStore, updateStore } from '../../../adapters/browser/good-lift-storage.service.ts';
import { boardKey, rowsFor } from '../../../domains/good-lift/board.ts';
import { gameHref } from '../../../domains/good-lift/good-lift-address.ts';
import { isBlocked } from '../../../domains/good-lift/meet-initials.ts';
import { decodeLog, encodeLog } from '../../../domains/good-lift/recorder.ts';
import { isJudgedEnding } from '../../../domains/good-lift/run-rules.ts';
import { SIM_VERSION } from '../../../domains/good-lift/sim-version.ts';
import { setInitials } from '../../../domains/progression/good-lift-store.ts';
import type { RunResult, ScoreSubmission, WorldResult } from '../good-lift.models.ts';
import { placeOf, takenOff, type createOnlineBoard } from './board-online.service.ts';

type OnlineBoard = ReturnType<typeof createOnlineBoard>;
type ResultIdentity = Pick<RunResult, 'at' | 'seed'>;
type SubmissionReply = Awaited<ReturnType<OnlineBoard['send']>>;

/** Reads never publish. Only submit(), called for the displayed finished run, can send a log. */
export function createResultBoard({ online, onResult, onWorld, read = readStore, update = updateStore, origin = () => location.origin }: {
  online: OnlineBoard;
  onResult?(result: RunResult): void;
  onWorld?(world: WorldResult): void;
  read?: typeof readStore;
  update?: typeof updateStore;
  origin?: () => string;
}) {
  let shown: RunResult | null = null;
  let world: WorldResult | null = null;
  let asks = 0;
  let pending: Promise<ScoreSubmission | undefined> | null = null;

  const ownLogs = (result: RunResult) => (result.board?.rows ?? []).filter(row => row.via === 'me' && row.log).map(row => row.log!);
  const tell = (value: WorldResult) => { world = value; onWorld?.(value); };
  const emptyWorld = (result: RunResult): WorldResult => ({ at: result.at, seed: result.seed, day: result.day, rows: [], rank: 0 });

  async function refresh() {
    const result = shown;
    if (!result?.online || result.verifying || pending) return;
    const ask = ++asks;
    const before = world ?? emptyWorld(result);
    tell({ ...before, loading: true, readFailed: false });
    const board = await online.board(result.day).catch(() => null);
    if (shown !== result || ask !== asks) return;
    const rank = board ? await placeOf(board.rows, ownLogs(result)) : before.rank;
    if (shown !== result || ask !== asks) return;
    tell({ ...before, rows: board?.rows ?? before.rows, rank, loading: false, readFailed: !board });
  }

  function show(result: RunResult | null) {
    asks += 1;
    shown = result;
    world = null;
    pending = null;
    if (result?.online) {
      tell({ ...emptyWorld(result), loading: true });
      void refresh();
    }
  }

  async function readAfterSubmission(result: RunResult, ask: number, sent: SubmissionReply) {
    const board = sent?.board ?? await online.board(result.day).catch(() => null);
    if (shown !== result || ask !== asks) return;
    const found = board ? await placeOf(board.rows, ownLogs(result)) : 0;
    if (shown !== result || ask !== asks) return;
    const rank = found || (sent?.ok || sent?.why === 'not-best' ? sent.rank : world?.rank ?? 0);
    tell({ ...emptyWorld(result), rows: board?.rows ?? world?.rows ?? [], rank, readFailed: !board,
      sent: sent && { ok: sent.ok, why: sent.why, rank: sent.rank } });
  }

  function submit(text: string, expected: ResultIdentity): Promise<ScoreSubmission | undefined> {
    const result = shown;
    if (!result || result.at !== expected.at || result.seed !== expected.seed) return Promise.resolve(undefined);
    if (pending) return pending;
    if (result.submission && result.submission.phase !== 'failed') return Promise.resolve(result.submission);
    const initials = text.trim().toUpperCase();
    if (!online.on || !result.online || result.kind !== 'daily' || !isJudgedEnding(result.reason) || result.verifying || !result.verified || !/^[A-Z]{3}$/.test(initials) || isBlocked(initials)) return Promise.resolve(undefined);
    const decoded = decodeLog(result.log);
    if (!decoded.ok) return Promise.resolve(undefined);

    // A name changes metadata only. Replace the local row in place: re-recording would award the
    // flight twice, and adding the renamed encoded text would duplicate it on the local board.
    const previousLog = result.log;
    const log = encodeLog({ ...decoded.log, initials }, decoded.log.bits, decoded.log.steps);
    const key = boardKey(SIM_VERSION, result.day);
    update(store => {
      setInitials(store, initials);
      // Retained for old stores, never authorization to publish a later run.
      store.optIn = false;
      const row = store.board.days[key]?.rows.find(row => row.via === 'me' && row.log === previousLog);
      if (row) { row.who = initials; row.log = log; }
    });
    result.initials = result.pilot = initials;
    result.log = log;
    result.link = `${origin()}${gameHref({ kind: 'vs', vs: log })}`;
    result.board = { rows: rowsFor(read().board, key), mine: log };
    result.submission = { phase: 'submitting', initials };
    const ask = ++asks; // An older GET cannot overwrite the explicit submission's response.
    if (world) tell({ ...world, loading: false });
    onResult?.(result);

    const sending = (async () => {
      const sent = await online.send(log, result.day).catch(() => null);
      if (shown !== result || ask !== asks) return undefined;
      const retryable = !sent || ['rate', 'store', 'fault', 'full'].includes(sent.why);
      result.submission = { initials, phase: sent?.ok ? 'submitted' : retryable ? 'failed' : sent?.why === 'not-best' ? 'not-best' : 'rejected', why: sent?.why, rank: sent?.rank };
      if (world) tell({ ...world, loading: true });
      onResult?.(result);
      const reading = readAfterSubmission(result, ask, sent);
      // A reply can already contain the new board. Otherwise its separate GET must not hold the
      // submit button or a retry hostage to another network timeout.
      if (sent?.board) await reading;
      else void reading;
      if (shown !== result || ask !== asks) return undefined;
      return result.submission;
    })();
    pending = sending;
    void sending.finally(() => { if (pending === sending) pending = null; });
    return sending;
  }

  async function remove(): Promise<boolean> {
    const before = world;
    const result = shown;
    if (!before || !result || pending || before.loading || before.removed || before.stays) return false;
    const ask = ++asks;
    const taken = online.token ? await online.remove(before.day).catch(() => null) : { ok: true, removed: 0, board: null };
    if (shown !== result || ask !== asks) return false;
    if (!taken?.ok) {
      tell({ ...before, failed: true });
      return false;
    }
    const after = { ...before, ...takenOff(before, taken), sent: null, failed: false };
    if (after.removed && result.submission) {
      result.submission = { ...result.submission, phase: 'withdrawn' };
      onResult?.(result);
    }
    tell(after);
    return after.removed;
  }

  return { show, refresh, submit, remove, get asks() { return asks; }, get world() { return world; } };
}
