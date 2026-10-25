import { useEffect, useId, useRef, useState } from 'react';
import { dailyNumber, DAY_MS } from '../../../domains/good-lift/good-lift-address.ts';
import { GLIDER_NAMES, isGlider } from '../../../domains/good-lift/glider-ids.ts';
import type { GameAddress, ResolvedSky } from '../../good-lift/good-lift.models.ts';
import { createFlightOverlay } from '../presentation/flight-overlay.ts';
import { TRAINING_LESSONS, TRAINING_LESSON_INFO, type TrainingLessonId } from '../../../domains/coaching/training-catalog.ts';
import TrainingPreview, { BrakeDiagram, LESSON_ART } from './TrainingPreview.tsx';
import type { GliderMenu, MenuStats } from '../presentation/menu-model.ts';
import '../game.css';
import '../flight-revamp.css';

interface Props {
  sky: ResolvedSky | null; address: GameAddress; state: string;
  stage: React.RefObject<HTMLDivElement | null>;
  onFly(key?: string, lesson?: TrainingLessonId): void; onRetry(): void; onExit(): void;
  initialLesson?: TrainingLessonId; backLabel?: string; onTraining?(lesson?: TrainingLessonId): void; onFreeForm?(): void; onPage?(): void;
  audio?(): { sound: boolean; available: boolean; music: boolean | null }; onSound?(): void; onMusic?(): void;
  stats?: MenuStats | null;
  // What each Training lesson is on the glider flown: '' to fly it, why it is locked, or null when it is not offered.
  lessons?: Readonly<Record<TrainingLessonId, string | null>> | null;
  // The glider Training flies, by class and glide ('' for the classic wing).
  trainingWing?: string;
  // Puts on another glider (the game keeps only one earned) and hands back the one now worn.
  onGlider?(id: string): { glider: string } | undefined;
}

/**
 * The glider the next run is flown on, and the choice of another: every glider, those not yet earned
 * with what they still ask.
 */
function GliderPicker({ menu, onGlider }: { menu: GliderMenu; onGlider?(id: string): { glider: string } | undefined }) {
  const id = useId();
  const [worn, setWorn] = useState(menu.worn);
  const [open, setOpen] = useState(false);
  useEffect(() => setWorn(menu.worn), [menu.worn]);
  const chosen = menu.options.find(option => option.id === worn) ?? menu.options[0];
  const choose = (glider: string) => {
    const kept = onGlider?.(glider);
    if (kept) setWorn(kept.glider);
  };
  return <div className="fj-hub-glider">
    <button type="button" aria-expanded={open} aria-controls={`${id}-gliders`} onClick={() => setOpen(!open)}>
      <span>GLIDER</span><b>{chosen.badge} · {chosen.name}</b><i aria-hidden="true">{open ? '‹' : '›'}</i>
    </button>
    {open && <fieldset id={`${id}-gliders`} className="fj-hub-gliders"><legend className="fj-visually-hidden">Choose a glider</legend>
      {menu.options.map(option => <label key={option.id} className={[worn === option.id ? 'selected' : '', option.earned ? '' : 'locked'].filter(Boolean).join(' ') || undefined}>
        <input type="radio" name={`${id}-glider`} value={option.id} checked={worn === option.id} disabled={!option.earned} onChange={() => choose(option.id)} />
        <strong>{option.badge} · {option.name}</strong><small>{option.earned ? option.role : `Locked · ${option.lock}`}</small>
      </label>)}
    </fieldset>}
  </div>;
}

/** Preparing the hub, selecting a lesson and playing previews never begin a run. */
export function GoodLiftLaunch({ sky, address, state, stage, onFly, onRetry, onExit, onTraining, initialLesson = 'steering', backLabel = 'Back to website', onFreeForm, onPage, audio, onSound, onMusic, stats, onGlider, lessons, trainingWing = '' }: Props) {
  const element = useRef<HTMLDivElement>(null);
  const activation = useRef<string | undefined>(undefined);
  const [lesson, setLesson] = useState<TrainingLessonId>(initialLesson);
  const training = address.kind === 'training';
  const [, refreshAudio] = useState(0);
  const settings = audio?.();
  useEffect(() => setLesson(initialLesson), [initialLesson, training]);
  useEffect(() => {
    if (!element.current || !stage.current) return;
    const abort = new AbortController(), focus = createFlightOverlay(stage.current, abort.signal);
    focus.activate(element.current);
    return () => { abort.abort(); focus.deactivate(false); };
  }, [stage, training]);
  const target = sky?.target, selected = TRAINING_LESSON_INFO[lesson];
  // The lessons offered (without word from Training, those any wing flies), and why the chosen one is locked.
  const offered = TRAINING_LESSONS.filter(id => lessons ? lessons[id] !== null : !['heli', 'sat', 'recovery'].includes(TRAINING_LESSON_INFO[id].needs ?? ''));
  const locked = lessons?.[lesson] ?? '';
  const notice = address.bad ? "That sky could not be read, so here is today's."
    : sky?.notice ? `${sky.notice === 'version' ? 'That challenge was flown under older rules' : 'That challenge could not be read'}, so here is today's sky.` : '';
  const label = training ? `UNRANKED · STARTS AT 1,100 m${trainingWing ? ` · ${trainingWing.toUpperCase()}` : ''}` : sky ? sky.kind === 'daily' ? `DAILY SKY #${dailyNumber(sky.day)} · ${new Date(sky.day * DAY_MS).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).toUpperCase()}`
    : `${sky.kind === 'practice' ? 'PRACTICE SKY · UNRANKED · ' : ''}SKY ${(sky.seed >>> 0).toString(16).padStart(8, '0')}`
    : address.kind === 'vs' ? 'READING THE CHALLENGE…' : 'PREPARING THE SKY…';
  const fly = <>{state === 'failed' ? <><p role="alert">The sky did not load.</p><button type="button" className="primary" onClick={onRetry}>Try again</button></>
    : <button type="button" className={`primary ${training ? 'fj-train-fly' : ''}`} data-launch-action="fly" disabled={state !== 'ready' || training && !!locked} onClick={() => onFly(activation.current, lesson)}>{state === 'ready' ? training ? locked ? 'Not on this glider' : `▶ Start ${selected.label}` : sky?.kind === 'practice' ? '▶ Play Practice Sky' : sky?.kind === 'daily' ? '▶ Play Daily Sky' : '▶ Play this sky' : 'Loading the sky…'}</button>}</>;
  return <div ref={element} className={`fj-brief fj-launch fj-arcade ${training ? 'fj-launch-training' : 'fj-launch-game'}`} data-flight-launch={state} role="dialog" aria-modal="true" aria-labelledby="fj-launch-title" aria-describedby="fj-launch-objective" tabIndex={-1}
    onPointerDown={() => { activation.current = undefined; }}
    onKeyDown={event => {
      if (event.code === 'Escape') { event.preventDefault(); event.stopPropagation(); onExit(); return; }
      if (!['Enter', 'Space'].includes(event.code)) return;
      if (event.repeat) { event.preventDefault(); event.stopPropagation(); return; }
      activation.current = event.code;
      if (!(event.target instanceof Element && event.target.closest('button, a, input, select, summary'))) {
        event.preventDefault(); event.stopPropagation();
        if (state === 'ready' && !(training && locked)) onFly(event.code, lesson);
      }
    }}
    onKeyUp={event => { if (activation.current === event.code) activation.current = undefined; }}>
    <header className="fj-launch-heading">
      {training && <button type="button" className="fj-launch-back" onClick={onExit} aria-label={backLabel}>‹</button>}
      <div><small>{label}</small><h1 id="fj-launch-title" data-overlay-focus tabIndex={-1}>{training ? 'TRAINING' : 'GOOD_LIFT'}</h1>{!training && <p>climb the lines · bank the tricks</p>}</div>
      {!training && <svg className="fj-launch-wing" viewBox="0 0 100 50" width="100" height="50" aria-hidden="true"><path d="M6 28Q50-10 94 28" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /><path d="M20 19 50 45 80 19M50 8V45" stroke="#9fb2c6" fill="none" /><circle cx="50" cy="45" r="3" fill="#29c7e3" /></svg>}
    </header>
    <div className="fj-launch-scroll">
      {training ? <>
        <p id="fj-launch-objective" className="fj-brief-objective">Pick a lesson. Follow the flight and brake cues to complete it.</p>
        <fieldset className="fj-lesson-picker"><legend className="fj-visually-hidden">Choose a lesson</legend>{offered.map(id => <label key={id} className={['fj-lesson-tile', lesson === id ? 'selected' : '', lessons?.[id] ? 'locked' : ''].filter(Boolean).join(' ')} title={lessons?.[id] || undefined}>
          <input type="radio" name="training-lesson" value={id} checked={lesson === id} onChange={() => setLesson(id)} />
          <svg viewBox="0 0 200 86" width="62" height="30" aria-hidden="true"><path d={LESSON_ART[id].path} fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" /></svg>
          <strong>{TRAINING_LESSON_INFO[id].label}</strong><small>{lessons?.[id] ? 'NOT ON THIS GLIDER' : LESSON_ART[id].level}</small>
        </label>)}</fieldset>
        <section className="fj-selected-lesson" aria-labelledby="fj-selected-lesson"><div className="fj-lesson-title"><h2 id="fj-selected-lesson">{selected.label}</h2><span>{LESSON_ART[lesson].level}</span></div><p>{selected.description}</p>{locked && <p className="fj-lesson-lock" role="status">{locked}</p>}<TrainingPreview lesson={lesson} steps={selected.steps} /></section>
        <p className="fj-brief-note">Same flight controls. Your scores, records and kit stay separate.</p>
      </> : <>
        <div className="fj-hub-cards"><section className="fj-hub-card fj-hub-fly"><div className="fj-hub-card-heading"><h2>{sky?.kind === 'daily' ? 'DAILY SKY' : address.kind === 'vs' ? 'CHALLENGE SKY' : 'PRACTICE SKY'}</h2><span>{sky?.kind === 'daily' ? 'RANKED' : 'UNRANKED'}</span></div>
          <p id="fj-launch-objective">A line every <b>150 m</b>. Three judges per lift.<br />Link tricks. Fly level for <b>3 s</b> to bank them.</p>
          {target && <div className="fj-hub-target"><span>TO BEAT · {target.who || 'A PILOT'}{isGlider(target.glider) && ` · ${GLIDER_NAMES[target.glider].badge}`}</span><strong>{(target.score ?? target.total ?? 0).toLocaleString('en-GB')} <small>PTS</small></strong><span>{target.peak.toLocaleString('en-GB')} m · verified</span></div>}
          {stats?.glider && <GliderPicker menu={stats.glider} onGlider={onGlider} />}
          {stats && <div className="fj-hub-stats"><span>BEST ON DEVICE <b>{stats.best.toLocaleString('en-GB')} pts</b></span>{sky?.kind === 'daily' && <span>DAILY STREAK <b>{stats.streak} days</b></span>}{stats.medals.length > 0 && <p>{stats.medals.map(mark => <span key={mark.medal} className={mark.medal}>● {mark.medal} {mark.score.toLocaleString('en-GB')}{mark.by === 'tst' ? ' · TST' : ''}</span>)}</p>}</div>}
          {fly}
        </section>
        <section className="fj-hub-card fj-hub-training"><div className="fj-hub-card-heading"><h2>TRAINING</h2><span>UNRANKED</span></div><p>Find your first thermal. Learn a new move.<br />Start high, at <b>1,100 m</b>.</p>
          <div className="fj-hub-moves" aria-label={`${offered.length} guided lessons`}>{offered.map(id => <span key={id}><svg viewBox="0 0 200 86" width="40" height="24" aria-hidden="true"><path d={LESSON_ART[id].path} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" /></svg><span>{LESSON_ART[id].chip}</span></span>)}</div>
          {onTraining && <button type="button" className="fj-train-action" data-launch-action="training" onClick={() => onTraining?.()}>Train a lesson ›</button>}
        </section>
        </div>
        {onFreeForm && <section className="fj-hub-explore"><div><h2>FREE FORM</h2><p>Just fly. Visit the website’s pages as places. No score.</p></div><button type="button" onClick={onFreeForm}>Explore ›</button></section>}
        <section className="fj-hub-controls" aria-label="How to fly"><h2>HOW TO FLY <span>TWO BRAKES · ONE WING</span></h2><ol>{[[.3, 0, 'PULL ONE', 'turn · A / D'], [.6, .6, 'PULL BOTH', 'brake · Space'], [0, 0, 'LET GO', 'hands up']] .map(([left, right, title, description]) => <li key={title}><BrakeDiagram left={left as number} right={right as number} /><strong>{title}</strong><span>{description}</span></li>)}</ol></section>
      </>}
      {notice && <p className="fj-brief-note" role="status">{notice}</p>}
    </div>
    <footer className="fj-brief-actions">{training && fly}<div className="fj-launch-settings">
      {settings?.available && onSound && <button type="button" aria-pressed={settings.sound} onClick={() => { onSound(); refreshAudio(n => n + 1); }}>SFX: {settings.sound ? 'on' : 'off'}</button>}
      {settings?.music != null && onMusic ? <button type="button" aria-pressed={settings.music} onClick={() => { onMusic(); refreshAudio(n => n + 1); }}>Music: {settings.music ? 'on' : 'off'}</button> : <span>Music · available in Game</span>}
    </div><button type="button" onClick={onExit}>← {backLabel}</button>{onPage && backLabel !== 'Back to website' && <button type="button" onClick={onPage}>Back to website</button>}</footer>
  </div>;
}
