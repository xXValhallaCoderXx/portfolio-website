import { useEffect, useId, useRef, useState } from 'react';
import { FEATS, JUDGES, barogram, kilos, medalsSaid, metres, shareText, trickSaid, worldSaid } from '../game/meet-card.js';
import { bynameOf } from '../game/meet-bynames.js';
import { isBlocked, runesOf } from '../game/meet-initials.js';
import { outranks, withBot } from '../game/board.js';
import GoodLiftKit, { KitNews } from './GoodLiftKit.jsx';

// How a run can end, as the meet sheet says it.
const ENDINGS = {
  fog: 'The mist judged the bar.',
  landed: 'Back on the ground; the bar was judged where you touched down.',
  quit: 'Run ended; the bar was forfeit.',
};
const TABS = [
  { key: 'result', label: 'result' },
  { key: 'board', label: 'board' },
  { key: 'kit', label: 'kit' },
];
// Rows of the world board the sheet shows, as many as this browser's board keeps; this browser's
// own place follows them if it is further down.
const WORLD_SHOWN = 10;

// Who won a race: on the total, and on the peak if the totals are level.
function verdict(mine, theirs) {
  const name = theirs.who || 'they';
  const ahead = mine.total - theirs.total;
  if (ahead > 0) return `you won by ${kilos(ahead)} kg`;
  if (ahead < 0) return `${name} won by ${kilos(-ahead)} kg`;
  if (mine.peak > theirs.peak) return 'level on kilos; you climbed higher';
  if (mine.peak < theirs.peak) return `level on kilos; ${name} climbed higher`;
  return 'a dead heat';
}

/** One judge's light: a filled white disc or a hollow red ring, and the word for whoever cannot see either. */
function Light({ judge, red }) {
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
function Initials({ who }) {
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
const BEAST_SAID = Object.freeze({
  falling: 'still falling', hit: 'it hit you', close: 'a close call', dodged: 'dodged',
  shielded: 'it found you shielded', hidden: 'lost you in cloud', glanced: 'glanced off',
});

/**
 * What the sky itself put in the run's way, on a line of its own under the costs and only if there
 * was any: the runes taken at the stones, the plates taken off the wind, from under a storm cloud
 * and off the fog, the plates a strike sprayed and how many were caught again, and the Beast.
 */
function SkyLine({ result }) {
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
        <span key={part}>
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
function Pilot({ who, via, byname, told = false }) {
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

/**
 * One run on a board, in its place (`place`, from 1, or none for the pinned bot): who flew it, what
 * it banked, its peak and its lights, and `tag`, a word on whose it is.
 */
function BoardRow({ row, place, className = '', tag = '' }) {
  return (
    <li value={place} className={className || undefined}>
      <b>
        <Pilot who={row.who} via={row.via} byname={row.byname} />
        {tag && <i className="good-lift-tag"> · {tag}</i>}
      </b>
      <span>{kilos(row.total)} kg</span>
      <span>{metres(row.peak)} m</span>
      <span className="good-lift-row-lights" aria-hidden="true">
        {row.red.map((red, index) => (
          <i key={index} className={red ? (red & (red - 1) ? 'none' : 'one') : 'clean'} />
        ))}
      </span>
    </li>
  );
}

/**
 * The world board beside this browser's (good-lift.js shareWorld): its best runs of the day, with
 * TST (`tst`, once the bots have flown) pinned where it ranks among them as on this browser's board,
 * and this browser's own run further down if it is not among them; then a line on where this
 * browser stands and what became of the run sent, and a way to take this browser's run off again.
 * The line is a status, so taking a run off is heard as well as seen. Once the run is taken off, or
 * is found to have been sent from another browser and so to stay, the button stays where it is, the
 * focus with it, but asks nothing more.
 */
function WorldBoard({ world, tst, id, onWithdraw }) {
  const top = world.rows.slice(0, WORLD_SHOWN);
  // TST stands among the rows shown, or just under the last of them, or it is further down and not shown.
  const below = world.rows[WORLD_SHOWN];
  const shown = tst && !(below && outranks(below, tst)) ? withBot(top, tst) : top;
  const mine = world.rank > WORLD_SHOWN ? world.rows[world.rank - 1] : null;
  // While its request is out, the button says so and asks nothing more: one press, one request.
  const [taking, setTaking] = useState(false);
  const asked = world.removed || world.stays || taking;
  let place = 0;
  return (
    <section className="good-lift-world" aria-labelledby={`${id}-world`}>
      <h3 className="good-lift-board-head" id={`${id}-world`}>
        world
      </h3>
      {world.rows.length > 0 && (
        <ol className="good-lift-board">
          {shown.map((row) => {
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
        // {worldSaid(world)}
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
            {world.removed ? '[ taken off ]' : taking ? '[ taking it off… ]' : '[ take mine off ]'}
          </button>
        </p>
      )}
    </section>
  );
}

// The sky's medals, as the bots set them once they have landed, and the one this run took. Each is
// named in words, so colour is never the only sign of which is which.
function Medals({ bots }) {
  if (!bots) return <p className="good-lift-medals dim">medals: the bots are flying this sky…</p>;
  if (bots.failed) return <p className="good-lift-medals dim">medals: the bots could not fly this sky</p>;
  return (
    <p className="good-lift-medals">
      <span className="dim">medals:</span>{' '}
      {bots.medals.map((mark, i) => (
        <span key={mark.medal}>
          {i > 0 && ' · '}
          <b className={`good-lift-medal ${mark.medal}`}>{mark.medal}</b> {kilos(mark.total)} kg
          {mark.by === 'tst' && <i className="good-lift-tag"> (TST)</i>}
        </span>
      ))}
      {' · yours: '}
      <b className={`good-lift-medal ${bots.medal || 'none'}`}>{bots.medal || 'none'}</b>
    </p>
  );
}

// The climb over its fog, once there are seconds enough of it to draw.
function Barogram({ result }) {
  if (!(result.trace?.n >= 3)) return null;
  const chart = barogram(result.trace, result.lifts, { width: 320, height: 96, peak: result.peak });
  return (
    <svg
      className="good-lift-barogram"
      viewBox={`0 0 ${chart.width} ${chart.height}`}
      role="img"
      aria-label={`The climb: up to ${metres(result.peak)} m in ${Math.round(result.seconds ?? 0)} s, with the fog rising under it.`}
    >
      <polygon className="fog" points={chart.fog} />
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
 * feats have earned is `result.kit`, and `onKit` puts a choice of it on.
 *
 * `bots` is what the bots came to on the run's sky (good-lift.js askBots), which lands after the
 * sheet has opened: it comes as a prop of its own, so taking it in never moves the focus, and it is
 * shown only on the sheet of the run it was flown for. Its medals and any feat it earned are said
 * through a status line that is always there.
 *
 * `world` is the world board's word on a Daily Sky (good-lift.js shareWorld), which comes the same
 * way and is shown, beside this browser's board, only on the sheet of its run; `result.online` says
 * the build has a world board at all, so the sheet can say how to get onto it before it answers,
 * `result.optIn` whether the initials are the pilot's opt-in to it (initials set before it was
 * offered are not, until the pilot says so here), and `onWithdraw` takes this browser's run off it.
 */
export default function GoodLiftResult({ result, music = null, bots = null, world = null, onRetry, onSky, onFjord, onPage, onInitials, onMusic, onWithdraw, onKit }) {
  const heading = useRef(null);
  const words = useRef(null);
  const buttons = useRef([]);
  const id = useId();
  const [tab, setTab] = useState('result');
  const [shared, setShared] = useState('');
  // The initials as typed; they are kept (onInitials) once they are three letters the board will
  // show, or none.
  const [initials, setInitials] = useState(result.initials ?? '');
  const blocked = initials.length === 3 && isBlocked(initials);
  // Whether the initials are the pilot's opt-in to the world board: typed under the line that says
  // they put runs on it, or, where they were set before it was offered (`asking`), confirmed with
  // [ opt in ], which then stays, saying so, with the focus on it.
  const [optedIn, setOptedIn] = useState(!!result.optIn);
  const named = initials.length === 3 && !blocked;
  // Decided once as the sheet opens: opting in here turns the button to '[ opted in ]' where it
  // stands, the focus kept on it, and a sheet drawn again after the map opens with it gone.
  const [asking] = useState(() => !!result.online && !result.optIn && !!result.initials);
  const musicOn = music ?? result.music ?? true;
  const switchMusic = () => onMusic?.();
  const text = shareText(result, { label: result.label, link: result.link });

  useEffect(() => {
    heading.current?.focus();
    setShared('');
  }, [result]);

  // R, M and L go on to the game; B switches the music here, so the sheet's switch says what it
  // is; Escape goes back to the fjord; every other key stays here. In a text field they are all
  // typing, but the kit tab's radio buttons and check boxes take no letters, so there they work.
  const guardKeys = (event) => {
    const typing = event.target.closest?.('textarea, input:not([type="radio"]):not([type="checkbox"])');
    if (event.code === 'KeyB' && !typing && event.type === 'keydown' && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey) switchMusic();
    if (!['KeyR', 'KeyM', 'KeyL'].includes(event.code) || typing) event.stopPropagation();
    if (event.type === 'keydown' && event.key === 'Escape') {
      event.preventDefault();
      onFjord();
    }
  };
  const onTabKey = (event, index) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    buttons.current[next]?.focus();
    setTab(TABS[next].key);
  };

  // Shared where the device can share, copied where it cannot, and left selected if even that fails.
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ text });
        setShared('shared');
        return;
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setShared('copied');
    } catch {
      words.current?.select();
      setShared('selected: copy it from here');
    }
  };

  const rival = result.target && !result.target.error ? result.target : null;
  // The bots' word on this run, once they have landed on its sky: never another run's.
  const landed = bots && bots.at === result.at && bots.seed === result.seed ? bots : null;
  const said = !landed ? '' : landed.failed ? 'The bots could not fly this sky.' : medalsSaid(landed);
  const earned = new Set([...(result.feats?.earned ?? []), ...(landed?.fresh ?? [])]);
  const fresh = new Set([...(result.feats?.fresh ?? []), ...(landed?.fresh ?? [])]);
  const best = result.best ?? { total: result.total, peak: result.peak };
  // The day's runs, with TST pinned among them once it has flown; numbered as runs, the bot unnumbered.
  const rows = !result.board ? [] : landed?.tst ? withBot(result.board.rows, landed.tst) : result.board.rows;
  let place = 0;
  // The world board's answer, once it has come for this very run.
  const worldFor = world && world.at === result.at && world.seed === result.seed && result.board ? world : null;
  const here = (
    <ol className="good-lift-board">
      {rows.map((row) => {
        const bot = row.via === 'bot';
        const mine = !bot && !!row.log && row.log === result.board.mine;
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
    </ol>
  );
  return (
    <section
      className="window good-lift-result"
      aria-labelledby={`${id}-heading`}
      aria-describedby={`${id}-ending ${id}-total`}
      onKeyDown={guardKeys}
      onKeyUp={guardKeys}
    >
      <header>
        <i />
        <i />
        <i />
        <span>~/fjord/good-lift — meet sheet</span>
      </header>
      <div className="fjord-panel-body">
        <h2 className="shout" id={`${id}-heading`} ref={heading} tabIndex={-1}>
          <span>&gt;</span> GOOD_LIFT
        </h2>
        <p className="dim" id={`${id}-ending`}>
          {ENDINGS[result.reason] ?? 'Run complete.'}
        </p>
        {result.verse && <p className="dim good-lift-verse">{result.verse}</p>}
        <p className="good-lift-total" id={`${id}-total`}>
          TOTAL <strong>{kilos(result.total)} kg</strong> · peak <strong>{metres(result.peak)} m</strong>
          {result.stats.style > 0 && (
            <>
              {' · style '}
              <span className="good-lift-style">{result.stats.style.toLocaleString('en-GB')}</span>
            </>
          )}
          {' · '}best {kilos(best.total)} kg
        </p>
        {((result.pilot ?? result.initials) || bynameOf(result.byname)) && (
          <p className="good-lift-who">
            <Pilot who={result.pilot ?? result.initials} via="me" byname={result.byname} told />
          </p>
        )}
        <p className="good-lift-cost">
          {result.label}
          {result.newBest ? ' · a new best' : ''}
          {' · '}
          {result.stats.strikes ? `${result.stats.strikes} strike${result.stats.strikes === 1 ? '' : 's'}` : 'no strikes'}
          {result.stats.stalls > 0 && ` · ${result.stats.stalls} stall${result.stats.stalls === 1 ? '' : 's'}`}
          {result.stats.cloud > 0 && ` · ${result.stats.cloud} s in cloud`}
          {result.stats.thrown > 0 && ` · ${result.stats.thrown - result.stats.hits} of ${result.stats.thrown} kettlebells dodged`}
          {result.stats.reps > 0 && ` · ${result.stats.reps} rep${result.stats.reps === 1 ? '' : 's'}, ${result.stats.deep || 'none'} to depth`}
        </p>
        <SkyLine result={result} />
        {trickSaid(result.stats) && <p className="dim good-lift-tricks">{trickSaid(result.stats)}</p>}
        <Medals bots={landed} />
        <p className="good-lift-hide" role="status">
          {said}
        </p>

        {rival && (
          <p className="good-lift-verdict">
            vs {rival.who || 'a pilot'} · {kilos(rival.total)} kg · {metres(rival.peak)} m — {verdict(result, rival)}
          </p>
        )}
        {fresh.size > 0 && (
          <p className="good-lift-fresh">
            new feat{fresh.size === 1 ? '' : 's'}: {FEATS.filter((feat) => fresh.has(feat.id)).map((feat) => feat.name).join(' · ')}
          </p>
        )}
        <KitNews sheet={result.kit} />

        <div className="good-lift-tabs" role="tablist" aria-label="Meet sheet">
          {TABS.map((item, index) => (
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
              [ {item.label} ]
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`${id}-panel-result`} aria-labelledby={`${id}-tab-result`} hidden={tab !== 'result'}>
          <Barogram result={result} />
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
                {result.lifts.map((lift, index) => (
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
            <p className="dim">// no line reached: the first is at 250 m.</p>
          )}

          <ul className="good-lift-feats" aria-label="Feats">
            {FEATS.map((feat) => (
              <li key={feat.id} className={`${earned.has(feat.id) ? 'earned' : ''}${fresh.has(feat.id) ? ' fresh' : ''}`}>
                <b>
                  {earned.has(feat.id) ? '✓ ' : ''}
                  {feat.name}
                  <span className="good-lift-hide">{earned.has(feat.id) ? ', earned' : ', not yet earned'}</span>
                </b>
                {fresh.has(feat.id) && <em> new</em>}
                <span>
                  {feat.text}
                  {feat.streak && !earned.has(feat.id) ? ` (${Math.min(result.feats?.streak ?? 0, feat.streak)} of ${feat.streak})` : ''}
                </span>
              </li>
            ))}
          </ul>

          <div className="good-lift-share">
            <textarea ref={words} readOnly value={text} rows={text.includes('\n') ? 3 : 2} aria-label="The line to share this run by" />
            <p>
              <button type="button" onClick={share}>
                [ share ]
              </button>{' '}
              <span className="dim" role="status">
                {shared}
              </span>
            </p>
          </div>
        </div>

        <div role="tabpanel" id={`${id}-panel-board`} aria-labelledby={`${id}-tab-board`} hidden={tab !== 'board'}>
          {result.board ? (
            <>
              {worldFor ? (
                <div className="good-lift-boards">
                  <section aria-labelledby={`${id}-here`}>
                    <h3 className="good-lift-board-head" id={`${id}-here`}>
                      this browser
                    </h3>
                    {here}
                  </section>
                  <WorldBoard world={worldFor} tst={landed?.tst ?? null} id={id} onWithdraw={onWithdraw} />
                </div>
              ) : (
                here
              )}
              <p className="dim">
                // this browser's best runs of {result.label}, and TST, the bot to beat
                {result.online ? (worldFor ? "; with them, the world's best of the day." : '.') : '; a shared board comes later.'}
              </p>
              <label className="good-lift-initials">
                initials{' '}
                <input
                  value={initials}
                  maxLength={3}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby={`${id}-initials`}
                  aria-invalid={blocked || undefined}
                  onChange={(event) => {
                    const typed = event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
                    setInitials(typed);
                    if (typed.length === 0 || (typed.length === 3 && !isBlocked(typed))) {
                      onInitials?.(typed);
                      // Typed under the line that says what they do, they opt in; none opt out.
                      if (result.online || !typed) setOptedIn(!!typed);
                    }
                  }}
                />
                <span className="good-lift-typed" aria-hidden="true">
                  {runesOf(initials).join('')}
                </span>
              </label>{' '}
              <span className="dim" id={`${id}-initials`} role="status">
                {blocked
                  ? '// not those three: the board will not show them'
                  : !result.online
                    ? '// three letters to name your next runs'
                    : named && !optedIn
                      ? '// these name your runs here only; opt in to put your best of each day on the world board'
                      : '// three letters name your next runs and put your best of each day on the world board; none keeps them here'}
              </span>
              {asking && named && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="good-lift-opt-in"
                    aria-disabled={optedIn || undefined}
                    onClick={() => {
                      if (optedIn) return;
                      onInitials?.(initials);
                      setOptedIn(true);
                    }}
                  >
                    {optedIn ? '[ opted in ]' : '[ opt in ]'}
                  </button>
                </>
              )}
            </>
          ) : (
            <p className="dim">// only the Daily Sky keeps a board: practice is yours alone.</p>
          )}
        </div>

        <div role="tabpanel" id={`${id}-panel-kit`} aria-labelledby={`${id}-tab-kit`} hidden={tab !== 'kit'}>
          <GoodLiftKit sheet={result.kit} onKit={onKit} />
        </div>
      </div>
      <footer>
        <button className="primary" onClick={onRetry}>
          [ <kbd>r: </kbd>again ]
        </button>
        <button onClick={() => onSky(result.kind === 'daily' ? 'practice' : 'daily')}>{result.kind === 'daily' ? '[ new sky ]' : "[ today's sky ]"}</button>
        <button onClick={onFjord}>[ back to the fjord ]</button>
        <button onClick={onPage}>[ back to the portfolio ]</button>
        <button onClick={switchMusic}>
          [ <kbd>b: </kbd>music: {musicOn ? 'on' : 'off'} ]
        </button>
      </footer>
    </section>
  );
}
