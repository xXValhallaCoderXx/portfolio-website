import { useEffect, useRef } from 'react';
import { dailyNumber, DAY_MS } from '../../../domains/good-lift/good-lift-address.ts';
import type { GameAddress, ResolvedSky } from '../../good-lift/good-lift.models.ts';
import { createFlightOverlay } from '../presentation/flight-overlay.ts';
import '../game.css';

interface Props {
  sky: ResolvedSky | null; address: GameAddress; state: string;
  stage: React.RefObject<HTMLDivElement | null>;
  onFly(key?: string): void; onRetry(): void; onExit(): void;
}

/** The only Good Lift launch screen. Preparing this dialog never begins a run. */
export function GoodLiftLaunch({ sky, address, state, stage, onFly, onRetry, onExit }: Props) {
  const element = useRef<HTMLDivElement>(null);
  const activation = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!element.current || !stage.current) return;
    const abort = new AbortController(), focus = createFlightOverlay(stage.current, abort.signal);
    focus.activate(element.current);
    return () => { abort.abort(); focus.deactivate(false); };
  }, [stage]);
  const target = sky?.target;
  const notice = address.bad ? "That sky could not be read, so here is today's."
    : sky?.notice ? `${sky.notice === 'version' ? 'That challenge was flown under older rules' : 'That challenge could not be read'}, so here is today's sky.` : '';
  const label = sky ? sky.kind === 'daily' ? `Daily #${dailyNumber(sky.day)} · ${new Date(sky.day * DAY_MS).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`
    : `${sky.kind === 'practice' ? 'Practice · ' : ''}Sky ${(sky.seed >>> 0).toString(16).padStart(8, '0')}`
    : address.kind === 'vs' ? 'Reading the challenge…' : 'Preparing the sky…';
  return <div ref={element} className="fj-brief fj-launch" data-flight-launch={state} role="dialog" aria-modal="true" aria-labelledby="fj-launch-title" aria-describedby="fj-launch-objective" tabIndex={-1}
    onPointerDown={() => { activation.current = undefined; }}
    onKeyDown={event => {
      if (event.code === 'Escape') { event.preventDefault(); event.stopPropagation(); onExit(); return; }
      if (!['Enter', 'Space'].includes(event.code)) return;
      if (event.repeat) { event.preventDefault(); event.stopPropagation(); return; }
      activation.current = event.code;
      if (!(event.target instanceof Element && event.target.closest('button, a'))) {
        event.preventDefault(); event.stopPropagation();
        if (state === 'ready') onFly(event.code);
      }
    }}
    onKeyUp={event => { if (activation.current === event.code) activation.current = undefined; }}>
    <small>{label}</small>
    <b id="fj-launch-title" data-overlay-focus tabIndex={-1}>GOOD_LIFT</b>
    <p id="fj-launch-objective" className="fj-brief-objective">Climb through a line every 150 m. Three judges light each lift.</p>
    {(notice || target) && <p className="fj-brief-note" role="status">{notice || `To beat: ${target!.who || 'a pilot'} · ${(target!.score ?? target!.total ?? 0).toLocaleString('en-GB')} pts · ${target!.peak.toLocaleString('en-GB')} m · verified`}</p>}
    <ol className="fj-brief-controls">
      <li><svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true"><polygon points="28,6 50,28 28,50 6,28" fill="none" stroke="currentColor" opacity=".45" /><circle cx="28" cy="28" r="4" fill="currentColor" /><path d="M20 28H8m4-4-4 4 4 4m24-4h12m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg><div><strong>Turn</strong><span>pull either side handle · A / D on keyboard</span></div></li>
      <li><svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true"><polygon points="8,28 28,48 48,28" fill="#9b7bff" fillOpacity=".35" stroke="#9b7bff" strokeOpacity=".8" /><polygon points="16,28 28,40 40,28" fill="#0f2434" stroke="currentColor" strokeOpacity=".6" /><circle cx="28" cy="16" r="4" fill="currentColor" /><path d="M28 21v15m-5-5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg><div><strong>Brake</strong><span>pull both handles · Space on keyboard · full pulls can stall</span></div></li>
      <li><svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true"><polygon points="28,8 42,22 28,36 14,22" fill="#e8f1fa" fillOpacity=".08" stroke="#e8f1fa" strokeOpacity=".6" /><circle cx="28" cy="42" r="4" fill="currentColor" /><path d="M28 37V14m-5 5 5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg><div><strong>Hands up</strong><span>lift your thumbs, release the keys or let go of the mouse</span></div></li>
    </ol>
    <p className="fj-brief-note">Thermals, plates, kettlebells and tricks: the coach introduces each one in flight.</p>
    <div className="fj-brief-actions">
      {state === 'failed' ? <><p role="alert">The sky beyond the arch did not load.</p><button type="button" className="primary" onClick={onRetry}>Try again</button></>
        : <button type="button" className="primary" data-launch-action="fly" disabled={state !== 'ready'} onClick={() => onFly(activation.current)}>{state === 'ready' ? '▶ Fly' : 'Loading the sky…'}</button>}
      <button type="button" onClick={onExit}>Back to the page</button>
    </div>
  </div>;
}
