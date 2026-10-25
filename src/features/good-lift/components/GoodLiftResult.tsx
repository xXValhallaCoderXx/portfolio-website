import type { TrainingLessonId } from '../../../domains/coaching/training-catalog.ts';
import type { GameKind } from '../../../domains/good-lift/good-lift-address.ts';
import { verdict, buildResultView, worldBoardView, resultSummary, medalTrack, submissionUnavailable, submissionSaid } from '../services/result-view.service.ts';
import type { BoardRow as BoardRowData, RunResult, BotResult, WorldResult, KitChoice, ScoreSubmission } from '../good-lift.models.ts';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { FEATS, JUDGES, barogram, bestComboSaid, kilos, metres, points, trickSaid, worldSaid } from '../../../domains/good-lift/meet-card.ts';
import { scoreOf } from '../../../domains/good-lift/score.ts';
import { isJudgedEnding } from '../../../domains/good-lift/run-rules.ts';
import { bynameOf } from '../../../domains/good-lift/meet-bynames.ts';
import { isBlocked, runesOf } from '../../../domains/good-lift/meet-initials.ts';
import { GLIDER_NAMES, isGlider } from '../../../domains/good-lift/glider-ids.ts';
import GoodLiftKit,{ KitNews } from './GoodLiftKit.tsx';
import GoodLiftTricks, { TricksNews } from './GoodLiftTricks.tsx';
import { sheetFeats } from '../services/tricks-view.service.ts';
import '../result-layout.css';
import '../meet-sheet.css';

// How a run can end, as the meet sheet says it.
const ENDINGS: Record<string, string> = {
  fog: 'The mist judged the bar.',
  time: 'Ten minutes aloft. Flight complete; the bar and recovered style are banked.',
  landed: 'Back on the ground; the bar was judged where you touched down.',
  quit: 'Run ended; the bar was forfeit.',
};
// The tricks tab for a sheet with a trick book, as every run's is; a sheet without one keeps three.
const TABS = [
  { key: 'board', label: 'Board' },
  { key: 'result', label: 'Result' },
  { key: 'kit', label: 'Kit' },
  { key: 'tricks', label: 'Tricks' },
];
const BOOKLESS_TABS = TABS.slice(0, 3);
/** One judge's light: a filled white disc or a hollow red ring, and the word for whoever cannot see either. */
function Light({ judge, red }: { judge: string; red: number | boolean }) {
  return (
    <span className={`good-lift-light ${red ? 'red' : 'white'}`} title={`${judge}: ${red ? 'red' : 'white'}`}>
      <span className="good-lift-hide">{red ? 'red' : 'white'}</span>
    </span>
  );
}

/**
 * Three initials in the runes of the Elder Futhark, each rune over its Latin letter as ruby sets a
 * reading over a word, so the letters keep to the line of the words beside them. Read out as the
 * letters alone.
 */
function Initials({ who }: { who: string }) {
  const runes = runesOf(who);
  return (
    <span className="good-lift-name">
      <span className="good-lift-runes" aria-hidden="true">
        {[...who].map((letter, i) => (
          <ruby key={i}>
            {letter}
            <rt>{runes[i]}</rt>
          </ruby>
        ))}
      </span>
      <span className="good-lift-hide">{who}</span>
    </span>
  );
}

// How the Beast came out, in words (good-lift.js's OUTCOMES).
const BEAST_SAID: Readonly<Record<string, string>> = Object.freeze({
  falling: 'still falling', hit: 'it hit you', close: 'a close call', dodged: 'dodged',
  shielded: 'it found you shielded', hidden: 'lost you in cloud', glanced: 'glanced off',
});

/**
 * What the sky itself put in the run's way, on a line of its own under the costs and only if there
 * was any: the runes taken at the stones, the plates taken off the wind, from under a storm cloud
 * and off the fog, the plates a strike sprayed and how many were caught again, and the Beast.
 */
function SkyLine({ result }: { result: RunResult }) {
  const { stats } = result;
  const taken = result.runes ?? [];
  const sky = [
    stats.wind > 0 && `${stats.wind} on the wind`,
    stats.thunder > 0 && `${stats.thunder} under thunder`,
    stats.bait > 0 && `${stats.bait} fog bait`,
  ].filter(Boolean);
  const parts = [
    sky.length > 0 && `plates off the sky: ${sky.join(', ')}`,
    stats.scattered > 0 && `${stats.recovered} of ${stats.scattered} sprayed plates caught`,
    result.beast && `the Beast: ${BEAST_SAID[result.beast] ?? result.beast}`,
  ].filter(Boolean);
  if (!taken.length && !parts.length) return null;
  return (
    <p className="good-lift-cost">
      {taken.length > 0 && 'runes: '}
      {taken.map((rune, i) => (
        <span key={rune.rune}>
          {i ? ', ' : ''}
          <span className="good-lift-rune" aria-hidden="true">
            {rune.sign}
          </span>{' '}
          {rune.name}
        </span>
      ))}
      {parts.map((part, i) => (
        <span key={String(part)}>
          {taken.length > 0 || i ? ' · ' : ''}
          {part}
        </span>
      ))}
    </p>
  );
}

/**
 * Who flew a run, as the sheet and the board name them: their initials in runes, or else 'you' (or
 * 'a pilot', for a run from a challenge link), and the byname the run earned. `told` also says what
 * earned the byname, for whoever cannot hover over it.
 */
function Pilot({ who, via, byname, told = false }: { who?: string; via?: string; byname?: string | null; told?: boolean }) {
  const named = !!who && !isBlocked(who);
  const earned = bynameOf(byname);
  return (
    <>
      {named ? <Initials who={who} /> : via === 'link' ? 'a pilot' : 'you'}
      {earned && (
        <span className="good-lift-byname" title={told ? undefined : earned.rule}>
          {named ? ' ' : ', '}
          {earned.name}
          {told && <span className="dim"> ({earned.rule})</span>}
        </span>
      )}
    </>
  );
}

// A glider's class as a board and the sheet name it (EN-A … ACRO), or '' for none.
const badgeOf = (glider?: string) => isGlider(glider) ? GLIDER_NAMES[glider].badge : '';

/**
 * One run on a board, in its place (`place`, from 1, or none for the pinned bot): who flew it, what
 * it banked, its peak and its lights, and `tag`, a word on whose it is, with the class of glider it
 * was flown on.
 */
function BoardRow({ row, place, className = '', tag = '' }: { row: BoardRowData; place?: number; className?: string; tag?: string }) {
  const said = [tag, badgeOf(row.glider)].filter(Boolean).join(' · ');
  return (
    <li value={place} className={className || undefined}>
      <span className="good-lift-row-rank">{row.via === 'bot' ? 'BOT' : place}</span>
      <b className="good-lift-row-name"><Pilot who={row.who} via={row.via} byname={row.byname} />{said && <i className="good-lift-tag">{said}</i>}</b>
      <span className="good-lift-row-lights"><span className="good-lift-hide">{row.red.length ? `${row.red.length} judged lifts` : 'No lift yet'}</span>{!row.red.length && <small>—</small>}{row.red.map((red: number, index: number) => <i aria-hidden="true" key={index} className={red ? (red & (red - 1) ? 'none' : 'one') : 'clean'} />)}</span>
      <span className="good-lift-row-peak">{metres(row.peak)} <small>m</small></span>
      <span className="good-lift-row-score">{points(row)} <small>pts</small></span>
    </li>
  );
}

/**
 * The world board beside this browser's: its best runs of the day, with
 * TST (`tst`, once the bots have flown) pinned where it ranks among them as on this browser's board,
 * and this browser's own run further down if it is not among them; then a line on where this
 * browser stands and what became of the run sent, and a way to take this browser's run off again.
 * The line is a status, so taking a run off is heard as well as seen. Once the run is taken off, or
 * is found to have been sent from another browser and so to stay, the button stays where it is, the
 * focus with it, but asks nothing more.
 */
function WorldBoard({ world, tst, id, busy = false, onWithdraw }: { world: WorldResult; tst?: BoardRowData | null; id: string; busy?: boolean; onWithdraw?: () => Promise<boolean> | undefined }) {
  const { shown, mine } = worldBoardView(world, tst);
  // While its request is out, the button says so and asks nothing more: one press, one request.
  const [taking, setTaking] = useState(false);
  const asked = world.removed || world.stays || taking || world.loading || busy;
  let place = 0;
  return (
    <section className="good-lift-world" aria-labelledby={`${id}-world`}>
      <h3 className="good-lift-board-head" id={`${id}-world`}>
        World leaderboard
      </h3>
      <BoardColumns />
      {!world.rows.length && !world.loading && !world.readFailed && <p className="good-lift-board-empty">No submitted scores yet.</p>}
      {world.rows.length > 0 && (
        <ol className="good-lift-board">
          {shown.map((row: BoardRowData) => {
            if (row.via === 'bot') return <BoardRow key=":bot" row={row} className="bot" tag="bot to beat" />;
            place += 1;
            return <BoardRow key={row.id} row={row} place={place} className={place === world.rank ? 'mine' : ''} tag={place === world.rank ? 'you' : ''} />;
          })}
          {mine && (
            <>
              <li className="gap" aria-hidden="true">
                …
              </li>
              <BoardRow row={mine} place={world.rank} className="mine" tag="you" />
            </>
          )}
        </ol>
      )}
      <p className="dim" role="status">
        {world.loading ? 'Loading world scores…' : world.readFailed ? 'World scores could not be loaded. Your local scores are available above.' : worldSaid({ ...world, sent: null })}
      </p>
      {(world.rank > 0 || world.removed) && (
        <p>
          <button
            type="button"
            aria-disabled={asked || undefined}
            onClick={() => {
              if (asked) return;
              setTaking(true);
              Promise.resolve(onWithdraw?.()).finally(() => setTaking(false));
            }}
          >
            {world.removed ? 'Entry removed' : taking ? 'Removing entry…' : 'Remove my leaderboard entry'}
          </button>
        </p>
      )}
    </section>
  );
}

// The sky's medals, as the bots set them once they have landed, and the one this run took. Each is
// named in words, so colour is never the only sign of which is which.
function Medals({ result, bots }: { result: RunResult; bots: BotResult | null }) {
  const track = medalTrack(result, bots);
  if (!track) return <p className="good-lift-medals dim" role="status">{bots?.failed ? 'Medal targets unavailable for this sky.' : 'Medal targets · the bots are still flying…'}</p>;
  return <section className="good-lift-medal-track" aria-label="Medal track">
    <h3 className="good-lift-section-title">MEDAL TRACK <span>{track.caption}</span></h3>
    <div className="good-lift-medal-rail" aria-hidden="true"><i style={{ width: `${Math.min(100, track.score / track.maximum * 100)}%` }} />{track.marks.map(mark => <b key={mark.medal} className={mark.medal} style={{ left: `${mark.score / track.maximum * 100}%` }} />)}</div>
    <p><span>● you {points(result)}</span>{track.marks.map(mark => <span key={mark.medal} className={mark.medal}>● {mark.medal} {mark.score.toLocaleString('en-GB')}{mark.by === 'tst' ? ' · TST' : ''}</span>)}</p>
    <p className="good-lift-medal-awarded">This run: <b>{bots?.medal || 'no medal yet'}</b></p>
  </section>;
}

function BoardColumns() {
  return <div className="good-lift-board-columns" aria-hidden="true"><span>RANK</span><span>NAME</span><span>LIFTS</span><span>PEAK</span><span>SCORE</span></div>;
}

// The climb over its fog, once there are seconds enough of it to draw.
function Barogram({ result }: { result: RunResult }) {
  if (!(result.trace?.n >= 3)) return <div className="good-lift-chart-empty">{metres(result.peak)} m peak · this flight ended before a chart could be recorded.</div>;
  const chart = barogram(result.trace, result.lifts, { width: 320, height: 96, peak: result.peak });
  return (
    <svg
      className="good-lift-barogram"
      viewBox={`0 0 ${chart.width} ${chart.height}`}
      role="img"
      aria-label={`The climb: up to ${metres(result.peak)} m in ${Math.round(result.seconds ?? 0)} s, with the fog rising under it.`}
    >
      <polygon className="fog" points={chart.fog} />
      {result.peak < 150 && <><line className="first-line" x1="0" x2={chart.width} y1={chart.height * (1 - 150 / chart.ceiling)} y2={chart.height * (1 - 150 / chart.ceiling)} /><text x="2" y={chart.height * (1 - 150 / chart.ceiling) - 4}>LINE 1 · 150 m</text></>}
      {chart.lines.map((line) => (
        <line key={line.line} className={line.good ? 'judged good' : 'judged none'} x1="0" x2={chart.width} y1={line.y} y2={line.y} />
      ))}
      {chart.horn !== null && <line className="horn" x1={chart.horn} x2={chart.horn} y1="0" y2={chart.height} />}
      <polyline className="alt" points={chart.alt} />
    </svg>
  );
}

/**
 * The meet sheet at the end of a run of Good Lift. `result` is what the run controller hands over:
 * summariseRun's numbers (total, peak, lifts, stats, trace, reason), the sky's `label` and `kind`,
 * when the run began (`at`), the bests, the feats (`earned` ever, `fresh` this run, `streak` days),
 * the day's `board` ({ rows, mine }) for a Daily Sky, the challenge `link` it can be shared by,
 * the `byname` the run earned, its skald's `verse`, and whether the `music` was on. The sheet
 * covers the game's own switch for the music, so it carries one: `music` is the switch as last
 * thrown, from anywhere (null until it is), and `onMusic` throws it. The kit the run's tonnage and
 * feats have earned is `result.kit`, and `onKit` puts a choice of it on. The trick book, as the run
 * left it, is `result.book`: the tricks tab shows it.
 *
 * `bots` is what the bots came to on the run's sky (good-lift.js askBots), which lands after the
 * sheet has opened: it comes as a prop of its own, so taking it in never moves the focus, and it is
 * shown only on the sheet of the run it was flown for. Its medals and any feat it earned are said
 * through a status line that is always there.
 *
 * `world` is a read of the Daily leaderboard. `onSubmitScore` explicitly publishes the current
 * verified result; typing initials is only a draft. `onWithdraw` removes this device's entry.
 */
export default function GoodLiftResult({ result, music = null, bots = null, world = null, onRetry, onSky, onFjord, onPage, onSubmitScore, onMusic, onWithdraw, onKit, onTraining }: {
  result: RunResult; music?: boolean | null; bots?: BotResult | null; world?: WorldResult | null;
  onRetry(): void; onSky(kind: GameKind): void; onFjord(): void; onPage(): void; onTraining?(lesson?: TrainingLessonId): void;
  onSubmitScore?(initials: string): Promise<ScoreSubmission | undefined>; onMusic?(): boolean | undefined;
  onWithdraw?(): Promise<boolean>; onKit?(choice: Partial<KitChoice>): KitChoice | undefined;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const moreButton = useRef<HTMLButtonElement>(null);
  const moreMenu = useRef<HTMLDivElement>(null);
  const menuItems = useRef<(HTMLButtonElement | null)[]>([]);
  const menuStart = useRef(0);
  const panelScroll = useRef<HTMLDivElement>(null);
  const id = useId();
  const [tab, setTab] = useState('board');
  const [shared, setShared] = useState('');
  const [copying, setCopying] = useState(false);
  const copyAttempt = useRef(0);
  const submitAttempt = useRef(0);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [initials, setInitials] = useState(result.initials ?? '');
  const blocked = /^[A-Z]{3}$/.test(initials) && isBlocked(initials);
  const named = /^[A-Z]{3}$/.test(initials) && !blocked;
  const unavailable = submissionUnavailable(result);
  const ranked = result.kind === 'daily' && isJudgedEnding(result.reason) && result.online;
  const submission = result.submission;
  const locked = sending || !!submission && submission.phase !== 'failed';
  const submitLabels: Record<ScoreSubmission['phase'], string> = {
    submitting: 'Submitting…', submitted: 'Score submitted', failed: 'Try submitting again',
    'not-best': 'Higher score on board', withdrawn: 'Entry removed', rejected: 'Not submitted',
  };
  const submitLabel = sending ? 'Submitting…' : submission ? submitLabels[submission.phase] : submitError ? 'Try submitting again' : 'Submit score';
  const submitStatus = blocked ? 'Please choose different initials.' : submitError || submissionSaid(submission) || unavailable || (!named ? 'Enter three letters to submit this score.' : 'Saved here. Press Submit score to publish this result.');
  const submit = async () => {
    if (!named || unavailable || locked || !onSubmitScore) return;
    const attempt = ++submitAttempt.current;
    setSending(true);
    setSubmitError('');
    try {
      const response = await onSubmitScore(initials);
      if (!response && attempt === submitAttempt.current) setSubmitError('Couldn’t submit this score. Please try again.');
    } catch {
      if (attempt === submitAttempt.current) setSubmitError('Couldn’t submit this score. Please try again.');
    } finally {
      if (attempt === submitAttempt.current) setSending(false);
    }
  };
  const musicOn = music ?? result.music ?? true;
  const switchMusic = () => onMusic?.();

  useEffect(() => {
    heading.current?.focus();
    setTab('board');
    setMoreOpen(false);
    setInitials(result.initials ?? '');
    submitAttempt.current += 1;
    setSending(false);
    setSubmitError('');
  }, [result.at, result.seed]);

  useEffect(() => {
    copyAttempt.current += 1;
    setShared('');
    setCopying(false);
    return () => { copyAttempt.current += 1; };
  }, [result.at, result.seed, result.link]);

  useEffect(() => () => { submitAttempt.current += 1; }, []);

  useEffect(() => {
    if (!moreOpen) return;
    menuItems.current[menuStart.current]?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !moreMenu.current?.contains(event.target)) setMoreOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [moreOpen]);

  useEffect(() => {
    if (panelScroll.current) panelScroll.current.scrollTop = 0;
  }, [tab, result.at, result.seed]);

  const closeMore = () => {
    setMoreOpen(false);
    moreButton.current?.focus();
  };

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const index = menuItems.current.findIndex((item) => item === document.activeElement);
    let next;
    if (event.key === 'ArrowDown') next = (index + 1) % 4;
    else if (event.key === 'ArrowUp') next = (index + 3) % 4;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 3;
    else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      closeMore();
      return;
    } else return;
    event.preventDefault();
    menuItems.current[next]?.focus();
  };

  // R, M and L go on to the game; B switches the music here, so the sheet's switch says what it
  // is; Escape goes back to the fjord; every other key stays here. In a text field they are all
  // typing, but the kit tab's radio buttons and check boxes take no letters, so there they work.
  const guardKeys = (event: KeyboardEvent<HTMLElement>) => {
    const typing = event.target instanceof Element && event.target.closest('textarea, input:not([type="radio"]):not([type="checkbox"])');
    if (event.code === 'KeyB' && !typing && event.type === 'keydown' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey) switchMusic();
    if (!['KeyR', 'KeyM', 'KeyL'].includes(event.code) || typing) event.stopPropagation();
    if (event.type === 'keydown' && event.key === 'Escape') {
      event.preventDefault();
      if (moreOpen) closeMore();
      else onFjord();
    }
  };
  const tabs = result.stats.tricks ? TABS : BOOKLESS_TABS;
  // A sheet without the tab last looked at opens on the board.
  useEffect(() => { if (!tabs.some((item) => item.key === tab)) setTab('board'); }, [tabs, tab]);
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    buttons.current[next]?.focus();
    setTab(tabs[next].key);
  };

  const copyLink = async () => {
    if (copying || result.verifying || !result.verified || !result.link) return;
    const attempt = ++copyAttempt.current;
    setCopying(true);
    setShared('');
    try {
      await navigator.clipboard.writeText(result.link);
      if (attempt === copyAttempt.current) setShared('Link copied');
    } catch {
      if (attempt === copyAttempt.current) setShared('Couldn’t copy the link. Try again.');
    } finally {
      if (attempt === copyAttempt.current) setCopying(false);
    }
  };

  const { rival, landed, said, earned, fresh, best, rows, worldFor } = buildResultView(result, bots, world);
  const summary = resultSummary(result);
  const feats = sheetFeats(result.stats);
  let place = 0;
  const here = (
    <><BoardColumns /><ol className="good-lift-board">
      {rows.map((row) => {
        const bot = row.via === 'bot';
        const mine = !bot && !!row.log && row.log === result.board?.mine;
        const tag = [bot && 'bot to beat', row.via === 'link' && 'link', mine && 'this run'].filter(Boolean).join(' · ');
        return (
          <BoardRow
            key={bot ? ':bot' : row.log || `${row.at}-${row.total}`}
            row={row}
            place={bot ? undefined : ++place}
            className={bot ? 'bot' : mine ? 'mine' : ''}
            tag={tag}
          />
        );
      })}
    </ol>{!rows.some(row => row.via !== 'bot') && <p className="dim">{result.verifying ? 'Checking this flight before it joins your scores…' : 'No ranked runs saved here for this sky yet.'}</p>}</>
  );
  return (
    <section
      className="window good-lift-result"
      aria-labelledby={`${id}-heading`}
      aria-describedby={`${id}-total`}
      onKeyDown={guardKeys}
      onKeyUp={guardKeys}
    >
      <header>
        <i />
        <i />
        <i />
        <span>MEET OVER · {result.label}{badgeOf(result.wing) && ` · ${badgeOf(result.wing)}`}</span>
      </header>
      <div className="good-lift-result-layout">
        <div className="good-lift-result-summary">
          <h2 className="good-lift-hide" id={`${id}-heading`} ref={heading} tabIndex={-1}>Flight complete</h2>
          <div className="good-lift-score-card" id={`${id}-total`}>
            <div className="good-lift-score-main"><strong>{points(result)}</strong><span>PTS</span>{result.newBest && <b className="good-lift-new-best">New best</b>}</div>
            <dl className="good-lift-score-facts">
              <div><dt>Lifted</dt><dd>{kilos(result.total)} kg</dd></div>
              <div><dt>Peak</dt><dd>{metres(result.peak)} m</dd></div>
              <div><dt>Strikes</dt><dd>{result.stats.strikes || 'None'}</dd></div>
            </dl>
          </div>
          <div className="good-lift-result-tools">
            <p className="good-lift-save-status" id={`${id}-saved`} role="status">{result.verifying ? 'Saved here · checking flight…' : '✓ Saved on this device'}</p>
            <button type="button" onClick={copyLink} disabled={copying || result.verifying || !result.verified || !result.link} aria-describedby={`${id}-copy-status`}>{copying ? 'Copying…' : 'Copy link'}</button>
            <span className="good-lift-copy-status" id={`${id}-copy-status`} role="status">{shared || (result.verifying ? 'Challenge link is being checked.' : !result.verified || !result.link ? 'Challenge link unavailable for this flight.' : '')}</span>
          </div>
          <p className="good-lift-hide" role="status">{said}</p>
        </div>

        <div className="good-lift-result-detail">
          <div className="good-lift-tabs" role="tablist" aria-label="Meet sheet" data-tabs={tabs.length}>
            {tabs.map((item, index) => (
              <button
                key={item.key}
                ref={(element) => {
                  buttons.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`${id}-tab-${item.key}`}
                aria-selected={tab === item.key}
                aria-controls={`${id}-panel-${item.key}`}
                tabIndex={tab === item.key ? 0 : -1}
                onClick={() => setTab(item.key)}
                onKeyDown={(event) => onTabKey(event, index)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="fjord-panel-body good-lift-result-panels" ref={panelScroll}>
            <div role="tabpanel" id={`${id}-panel-result`} aria-labelledby={`${id}-tab-result`} hidden={tab !== 'result'} tabIndex={0}>
              <h3 className={`good-lift-ending ${result.reason}`} id={`${id}-ending`}>{summary.ending}</h3>
              <p className="dim">{ENDINGS[result.reason] ?? 'Run complete.'}</p>
              <p className="dim">Best on this device: {(best.score ?? scoreOf(best)).toLocaleString('en-GB')} pts.</p>
              {((result.pilot ?? result.initials) || bynameOf(result.byname)) && <p className="good-lift-who"><Pilot who={result.pilot ?? result.initials} via="me" byname={result.byname} told /></p>}
              <section className="good-lift-peak-card" aria-label="Peak altitude"><div><strong>{metres(result.peak)}</strong><span>m peak</span>{summary.shortfall > 0 && <b>{summary.shortfall} m short</b>}</div>{summary.shortfall > 0 && <><progress max={150} value={Math.max(0, result.peak)} aria-label="Altitude toward the first line" /><p>The first line is at <b>150 m</b>. Cross it to lock out a lift.</p></>}</section>
              {summary.shortfall > 0 && onTraining && <aside className="good-lift-next-time"><h3>NEXT TIME</h3><p>Circle in rising air to reach the first line. Thermal climb shows you how.</p><button type="button" onClick={() => onTraining('thermal')}>Train: Thermal climb ›</button></aside>}
              {result.verse && <p className="dim good-lift-verse good-lift-result-verse-detail">{result.verse}</p>}
              <Medals result={result} bots={landed} />
              <section className="good-lift-flight-chart"><h3 className="good-lift-section-title">YOUR FLIGHT <span>{result.lifts.length ? `${result.lifts.length} judged lifts` : 'no line reached'}</span></h3><Barogram result={result} /></section>
              {result.lifts.length > 0 ? (
                <table className="good-lift-lights">
                  <caption className="good-lift-hide">Each lift, its three lights and the call</caption>
                  <thead>
                    <tr>
                      <th scope="col">line</th>
                      {JUDGES.map((judge) => (
                        <th scope="col" key={judge}>
                          {judge}
                        </th>
                      ))}
                      <th scope="col">bar</th>
                      <th scope="col">call</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.lifts.map((lift, index: number) => (
                      <tr key={index} className={lift.good ? 'good' : 'none'}>
                        <th scope="row">{lift.line ? `${metres(lift.line)} m` : 'the mist'}</th>
                        {JUDGES.map((judge, bit) => (
                          <td key={judge}>
                            <Light judge={judge} red={(lift.red >> bit) & 1} />
                          </td>
                        ))}
                        <td>{kilos(lift.kg)} kg</td>
                        <td>
                          {lift.good ? 'GOOD' : 'NO LIFT'}
                          {lift.good && lift.double && <b className="good-lift-double"> ×2</b>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="dim">// no line reached: the first is at 150 m.</p>
              )}

              {result.stats.style > 0 && <p className="good-lift-style">{kilos(result.total)} flight + {result.stats.style.toLocaleString('en-GB')} acro points</p>}
              {(result.stats.stalls > 0 || result.stats.cloud > 0 || result.stats.thrown > 0 || result.stats.reps > 0) && (
                <p className="good-lift-cost">
                  {[
                    result.stats.stalls > 0 && `${result.stats.stalls} stall${result.stats.stalls === 1 ? '' : 's'}`,
                    result.stats.cloud > 0 && `${result.stats.cloud} s in cloud`,
                    result.stats.thrown > 0 && `${result.stats.thrown - result.stats.hits} of ${result.stats.thrown} kettlebells dodged`,
                    result.stats.reps > 0 && `${result.stats.reps} rep${result.stats.reps === 1 ? '' : 's'}, ${result.stats.deep || 'none'} to depth`,
                  ].filter(Boolean).join(' · ')}
                </p>
              )}
              <SkyLine result={result} />
              {trickSaid(result.stats) && <p className="dim good-lift-tricks">{trickSaid(result.stats)}</p>}
              {bestComboSaid(result.stats.bestCombo) && <p className="good-lift-tricks">{bestComboSaid(result.stats.bestCombo)}</p>}
              {rival && <p className="good-lift-verdict">vs {rival.who || 'a pilot'}{badgeOf(rival.glider) && ` · ${badgeOf(rival.glider)}`} · {points(rival)} pts · {metres(rival.peak)} m — {verdict(result, rival)}</p>}
              {fresh.size > 0 && <p className="good-lift-fresh">new feat{fresh.size === 1 ? '' : 's'}: {FEATS.filter((feat) => fresh.has(feat.id)).map((feat) => feat.name).join(' · ')}</p>}
              <KitNews sheet={result.kit} />
              <TricksNews book={result.book} run={result.stats.tricks} />

              <h3 className="good-lift-section-title good-lift-feats-title">FEATS <span>{feats.filter(feat => earned.has(feat.id)).length} / {feats.length}</span></h3>
              <ul className="good-lift-feats" aria-label="Feats">
                {feats.map((feat) => (
                  <li key={feat.id} className={`${earned.has(feat.id) ? 'earned' : ''}${fresh.has(feat.id) ? ' fresh' : ''}`}>
                    <b>
                      {earned.has(feat.id) ? '✓ ' : ''}
                      {feat.name}
                      <span className="good-lift-hide">{earned.has(feat.id) ? ', earned' : ', not yet earned'}</span>
                    </b>
                    {fresh.has(feat.id) && <em> new</em>}
                    <span>
                      {feat.text}
                      {('streak' in feat ? feat.streak ?? 0 : 0) && !earned.has(feat.id) ? ` (${Math.min(result.feats?.streak ?? 0, ('streak' in feat ? feat.streak ?? 0 : 0))} of ${('streak' in feat ? feat.streak ?? 0 : 0)})` : ''}
                    </span>
                  </li>
                ))}
              </ul>

            </div>

            <div role="tabpanel" id={`${id}-panel-board`} aria-labelledby={`${id}-tab-board`} hidden={tab !== 'board'} tabIndex={0}>
              <h3 className="good-lift-section-title">HIGH SCORES <span>{result.label}</span></h3>
              {result.board ? <section aria-labelledby={`${id}-here`}>
                <h3 className="good-lift-board-head" id={`${id}-here`}>This browser</h3>
                {here}
                <p className="dim good-lift-board-caption">Your best runs on this device. TST is the bot to beat.</p>
              </section> : <p className="dim">This sky is unranked. Your score and progress are saved on this device.</p>}

              {ranked ? <form className="good-lift-submit" onSubmit={event => { event.preventDefault(); void submit(); }} aria-labelledby={`${id}-submit-heading`}>
                <h3 id={`${id}-submit-heading`}>Submit this score</h3>
                <p id={`${id}-submit-help`}>Your three initials will appear on the world leaderboard. Each result needs its own submission.</p>
                <div className="good-lift-submit-controls">
                  <label htmlFor={`${id}-initials`}>Initials
                    <input
                      id={`${id}-initials`}
                      aria-describedby={`${id}-submit-help ${id}-submit-status`}
                      aria-invalid={blocked || undefined}
                      autoComplete="off" autoCapitalize="characters" spellCheck={false}
                      maxLength={3} placeholder="ABC" pattern="[A-Za-z]{3}" required
                      value={initials} readOnly={locked}
                      onChange={event => {
                        setInitials(event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3));
                        setSubmitError('');
                      }}
                    />
                  </label>
                  <button type="submit" disabled={!named || !!unavailable || locked || !onSubmitScore}>{submitLabel}</button>
                </div>
                <p id={`${id}-submit-status`} className={`good-lift-submit-status${blocked || submitError || submission?.phase === 'failed' || submission?.phase === 'rejected' ? ' error' : ''}`} role="status">{submitStatus}</p>
              </form> : <p className="dim good-lift-local-only" role="status">{unavailable}</p>}
              {worldFor && <WorldBoard world={worldFor} tst={landed?.tst ?? null} id={id} busy={sending || submission?.phase === 'submitting'} onWithdraw={onWithdraw} />}
            </div>

            <div role="tabpanel" id={`${id}-panel-kit`} aria-labelledby={`${id}-tab-kit`} hidden={tab !== 'kit'} tabIndex={0}>
              <GoodLiftKit key={`${result.at}-${result.seed}`} sheet={result.kit} onKit={onKit} />
            </div>

            {result.stats.tricks ? (
              <div role="tabpanel" id={`${id}-panel-tricks`} aria-labelledby={`${id}-tab-tricks`} hidden={tab !== 'tricks'} tabIndex={0}>
                <GoodLiftTricks book={result.book} run={result.stats.tricks} />
              </div>
            ) : null}
          </div>
        </div>
        <footer className={`good-lift-result-actions${onTraining ? ' has-training' : ''}`}>
          <button type="button" className="primary" onClick={onRetry}>
            ▶ again
          </button>
          {onTraining && <button type="button" className="good-lift-result-train" onClick={() => onTraining?.()}>Train ›</button>}
          <button type="button" className="good-lift-result-today" onClick={() => onSky('daily')}>today's sky</button>
          <div className="good-lift-result-more" ref={moreMenu} onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setMoreOpen(false);
          }}>
            <button type="button" ref={moreButton} aria-haspopup="menu" aria-expanded={moreOpen} aria-controls={`${id}-more`} onClick={() => {
              menuStart.current = 0;
              setMoreOpen(!moreOpen);
            }} onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (moreOpen) menuItems.current[event.key === 'ArrowUp' ? 3 : 0]?.focus();
                else {
                  menuStart.current = event.key === 'ArrowUp' ? 3 : 0;
                  setMoreOpen(true);
                }
              }
            }}>more ⋯</button>
            {moreOpen && <div className="good-lift-result-menu" id={`${id}-more`} role="menu" aria-label="More run actions" onKeyDown={onMenuKey}>
              <button type="button" role="menuitem" tabIndex={-1} ref={(element) => { menuItems.current[0] = element; }} onClick={() => { setMoreOpen(false); onSky('practice'); }}>new sky</button>
              <button type="button" role="menuitem" tabIndex={-1} ref={(element) => { menuItems.current[1] = element; }} onClick={onFjord}>Free Form · explore the website</button>
              <button type="button" role="menuitem" tabIndex={-1} ref={(element) => { menuItems.current[2] = element; }} onClick={onPage}>Back to website</button>
              <button type="button" role="menuitemcheckbox" aria-checked={musicOn} tabIndex={-1} ref={(element) => { menuItems.current[3] = element; }} onClick={switchMusic}>music: {musicOn ? 'on' : 'off'}</button>
            </div>}
          </div>
        </footer>
      </div>
    </section>
  );
}
