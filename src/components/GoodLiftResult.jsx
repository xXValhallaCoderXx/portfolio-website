import { useEffect, useId, useRef, useState } from 'react';
import { FEATS, JUDGES, barogram, kilos, metres, shareText } from '../game/meet-card.js';

// How a run can end, as the meet sheet says it.
const ENDINGS = {
  fog: 'The mist judged the bar.',
  landed: 'Back on the ground; the bar was judged where you touched down.',
  quit: 'Run ended; the bar was forfeit.',
};
const TABS = [
  { key: 'result', label: 'result' },
  { key: 'board', label: 'board' },
];

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
 * the bests, the feats (`earned` ever, `fresh` this run, `streak` days), the day's `board`
 * ({ rows, mine }) for a Daily Sky, the challenge `link` it can be shared by, and whether the
 * `music` was on. The sheet covers the game's own switch for the music, so it carries one: `music`
 * is the switch as last thrown, from anywhere (null until it is), and `onMusic` throws it.
 */
export default function GoodLiftResult({ result, music = null, onRetry, onSky, onFjord, onPage, onInitials, onMusic }) {
  const heading = useRef(null);
  const words = useRef(null);
  const buttons = useRef([]);
  const id = useId();
  const [tab, setTab] = useState('result');
  const [shared, setShared] = useState('');
  // The initials as typed; they are kept (onInitials) once they are three letters, or none.
  const [initials, setInitials] = useState(result.initials ?? '');
  const musicOn = music ?? result.music ?? true;
  const switchMusic = () => onMusic?.();
  const text = shareText(result, { label: result.label, link: result.link });

  useEffect(() => {
    heading.current?.focus();
    setShared('');
  }, [result]);

  // R, M and L go on to the game; B switches the music here, so the sheet's switch says what it
  // is; Escape goes back to the fjord; every other key stays here.
  const guardKeys = (event) => {
    const typing = event.target.closest?.('input, textarea');
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
  const earned = new Set(result.feats?.earned ?? []);
  const fresh = new Set(result.feats?.fresh ?? []);
  const best = result.best ?? { total: result.total, peak: result.peak };
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
        <p className="good-lift-total" id={`${id}-total`}>
          TOTAL <strong>{kilos(result.total)} kg</strong> · peak <strong>{metres(result.peak)} m</strong> · best {kilos(best.total)} kg
        </p>
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
              <ol className="good-lift-board">
                {result.board.rows.map((row) => (
                  <li key={row.log || `${row.at}-${row.total}`} className={row.log && row.log === result.board.mine ? 'mine' : ''}>
                    <b>
                      {row.who || (row.via === 'link' ? 'a pilot' : 'you')}
                      {row.via === 'link' && <i className="good-lift-tag"> · link</i>}
                      {row.log && row.log === result.board.mine && <i className="good-lift-tag"> · this run</i>}
                    </b>
                    <span>{kilos(row.total)} kg</span>
                    <span>{metres(row.peak)} m</span>
                    <span className="good-lift-row-lights" aria-hidden="true">
                      {row.red.map((red, index) => (
                        <i key={index} className={red ? (red & (red - 1) ? 'none' : 'one') : 'clean'} />
                      ))}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="dim">// this browser's best runs of {result.label}; a shared board comes later.</p>
              <label className="good-lift-initials">
                initials{' '}
                <input
                  value={initials}
                  maxLength={3}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby={`${id}-initials`}
                  onChange={(event) => {
                    const typed = event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
                    setInitials(typed);
                    if (typed.length === 3 || typed.length === 0) onInitials?.(typed);
                  }}
                />
              </label>{' '}
              <span className="dim" id={`${id}-initials`}>
                // three letters to name your next runs
              </span>
            </>
          ) : (
            <p className="dim">// only the Daily Sky keeps a board: practice is yours alone.</p>
          )}
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
