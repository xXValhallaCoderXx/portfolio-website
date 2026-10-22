import { useEffect, useRef, useState } from 'react';
import { dailyNumber, DAY_MS } from '../../../domains/good-lift/good-lift-address.ts';
import type { GameAddress, ResolvedSky } from '../../good-lift/good-lift.models.ts';
import { createFlightOverlay } from '../presentation/flight-overlay.ts';
import { TRAINING_LESSONS, TRAINING_LESSON_INFO, type TrainingLessonId } from '../../../domains/coaching/training-catalog.ts';
import TrainingPreview, { BrakeDiagram, LESSON_ART } from './TrainingPreview.tsx';
import '../game.css';

interface Props {
  sky: ResolvedSky | null; address: GameAddress; state: string;
  stage: React.RefObject<HTMLDivElement | null>;
  onFly(key?: string, lesson?: TrainingLessonId): void; onRetry(): void; onExit(): void; onTraining?(): void;
}

/** Preparing the hub, selecting a lesson and playing previews never begin a run. */
export function GoodLiftLaunch({ sky, address, state, stage, onFly, onRetry, onExit, onTraining }: Props) {
  const element = useRef<HTMLDivElement>(null);
  const activation = useRef<string | undefined>(undefined);
  const [lesson, setLesson] = useState<TrainingLessonId>('steering');
  const training = address.kind === 'training';
  useEffect(() => {
    if (!element.current || !stage.current) return;
    const abort = new AbortController(), focus = createFlightOverlay(stage.current, abort.signal);
    focus.activate(element.current);
    return () => { abort.abort(); focus.deactivate(false); };
  }, [stage]);
  const target = sky?.target, selected = TRAINING_LESSON_INFO[lesson];
  const notice = address.bad ? "That sky could not be read, so here is today's."
    : sky?.notice ? `${sky.notice === 'version' ? 'That challenge was flown under older rules' : 'That challenge could not be read'}, so here is today's sky.` : '';
  const label = training ? 'UNRANKED · STARTS AT 1,100 m' : sky ? sky.kind === 'daily' ? `DAILY SKY #${dailyNumber(sky.day)} · ${new Date(sky.day * DAY_MS).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).toUpperCase()}`
    : `${sky.kind === 'practice' ? 'PRACTICE · ' : ''}SKY ${(sky.seed >>> 0).toString(16).padStart(8, '0')}`
    : address.kind === 'vs' ? 'READING THE CHALLENGE…' : 'PREPARING THE SKY…';
  const fly = <>{state === 'failed' ? <><p role="alert">The sky did not load.</p><button type="button" className="primary" onClick={onRetry}>Try again</button></>
    : <button type="button" className={`primary ${training ? 'fj-train-fly' : ''}`} data-launch-action="fly" disabled={state !== 'ready'} onClick={() => onFly(activation.current, lesson)}>{state === 'ready' ? training ? `▶ Fly: ${selected.label}` : '▶ Fly' : 'Loading the sky…'}</button>}</>;
  return <div ref={element} className={`fj-brief fj-launch fj-arcade ${training ? 'fj-launch-training' : 'fj-launch-game'}`} data-flight-launch={state} role="dialog" aria-modal="true" aria-labelledby="fj-launch-title" aria-describedby="fj-launch-objective" tabIndex={-1}
    onPointerDown={() => { activation.current = undefined; }}
    onKeyDown={event => {
      if (event.code === 'Escape') { event.preventDefault(); event.stopPropagation(); onExit(); return; }
      if (!['Enter', 'Space'].includes(event.code)) return;
      if (event.repeat) { event.preventDefault(); event.stopPropagation(); return; }
      activation.current = event.code;
      if (!(event.target instanceof Element && event.target.closest('button, a, input, select, summary'))) {
        event.preventDefault(); event.stopPropagation();
        if (state === 'ready') onFly(event.code, lesson);
      }
    }}
    onKeyUp={event => { if (activation.current === event.code) activation.current = undefined; }}>
    <header className="fj-launch-heading">
      {training && <button type="button" className="fj-launch-back" onClick={onExit} aria-label="Back to game">‹</button>}
      <div><small>{label}</small><h1 id="fj-launch-title" data-overlay-focus tabIndex={-1}>{training ? 'TRAINING' : 'GOOD_LIFT'}</h1>{!training && <p>climb the lines · bank the tricks</p>}</div>
      {!training && <svg className="fj-launch-wing" viewBox="0 0 100 50" width="100" height="50" aria-hidden="true"><path d="M6 28Q50-10 94 28" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /><path d="M20 19 50 45 80 19M50 8V45" stroke="#9fb2c6" fill="none" /><circle cx="50" cy="45" r="3" fill="#29c7e3" /></svg>}
    </header>
    <div className="fj-launch-scroll">
      {training ? <>
        <p id="fj-launch-objective" className="fj-brief-objective">Pick a lesson. Follow the flight and brake cues to complete it.</p>
        <fieldset className="fj-lesson-picker"><legend className="fj-visually-hidden">Choose a lesson</legend>{TRAINING_LESSONS.map(id => <label key={id} className={`fj-lesson-tile ${lesson === id ? 'selected' : ''}`}>
          <input type="radio" name="training-lesson" value={id} checked={lesson === id} onChange={() => setLesson(id)} />
          <svg viewBox="0 0 200 86" width="62" height="30" aria-hidden="true"><path d={LESSON_ART[id].path} fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" /></svg>
          <strong>{TRAINING_LESSON_INFO[id].label}</strong><small>{LESSON_ART[id].level}</small>
        </label>)}</fieldset>
        <section className="fj-selected-lesson" aria-labelledby="fj-selected-lesson"><div className="fj-lesson-title"><h2 id="fj-selected-lesson">{selected.label}</h2><span>{LESSON_ART[lesson].level}</span></div><p>{selected.description}</p><TrainingPreview lesson={lesson} steps={selected.steps} /></section>
        <p className="fj-brief-note">Same flight controls. Your scores, records and kit stay separate.</p>
      </> : <>
        <section className="fj-hub-card fj-hub-fly"><div className="fj-hub-card-heading"><h2>{sky?.kind === 'daily' ? 'DAILY SKY' : address.kind === 'vs' ? 'CHALLENGE SKY' : 'FREE SKY'}</h2><span>{sky?.kind === 'daily' ? 'RANKED' : 'FREE FLIGHT'}</span></div>
          <p id="fj-launch-objective">A line every <b>150 m</b>. Three judges per lift.<br />Link tricks. Fly level for <b>3 s</b> to bank them.</p>
          {target && <div className="fj-hub-target"><span>TO BEAT · {target.who || 'A PILOT'}</span><strong>{(target.score ?? target.total ?? 0).toLocaleString('en-GB')} <small>PTS</small></strong><span>{target.peak.toLocaleString('en-GB')} m · verified</span></div>}
          {fly}
        </section>
        <section className="fj-hub-card fj-hub-training"><div className="fj-hub-card-heading"><h2>TRAINING</h2><span>UNRANKED</span></div><p>Find your first thermal. Learn a new move.<br />Start high, at <b>1,100 m</b>.</p>
          <div className="fj-hub-moves" aria-label="Six guided lessons">{TRAINING_LESSONS.map(id => <span key={id}><svg viewBox="0 0 200 86" width="40" height="24" aria-hidden="true"><path d={LESSON_ART[id].path} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" /></svg><span>{id === 'steering' ? 'STEER' : id === 'thermal' ? 'CLIMB' : id.toUpperCase()}</span></span>)}</div>
          {onTraining && <button type="button" className="fj-train-action" data-launch-action="training" onClick={onTraining}>Train a lesson ›</button>}
        </section>
        <section className="fj-hub-controls" aria-label="How to fly"><h2>HOW TO FLY <span>TWO BRAKES · ONE WING</span></h2><ol>{[[.3, 0, 'PULL ONE', 'turn · A / D'], [.6, .6, 'PULL BOTH', 'brake · Space'], [0, 0, 'LET GO', 'hands up']] .map(([left, right, title, description]) => <li key={title}><BrakeDiagram left={left as number} right={right as number} /><strong>{title}</strong><span>{description}</span></li>)}</ol></section>
      </>}
      {notice && <p className="fj-brief-note" role="status">{notice}</p>}
    </div>
    <footer className="fj-brief-actions">{training && fly}<button type="button" onClick={onExit}>{training ? 'Back to game' : 'Back to the page'}</button></footer>
  </div>;
}
