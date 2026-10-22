import { useEffect, useState } from 'react';
import { ROUGH_LANDINGS, SECTIONS } from '../../../domains/portfolio/content.ts';
import { dailyNumber, dayOf } from '../../../domains/good-lift/good-lift-address.ts';
import type { ComponentType } from 'react';
import type { SectionId } from '../../../domains/portfolio/portfolio.types.ts';
import type { GameAddress } from '../../good-lift/good-lift.models.ts';
import type { readProgress } from '../../../adapters/browser/flight-progress.service.ts';
import { useFjordFlight } from '../hooks/useFjordFlight.ts';
import type { FlightPanel, LandingScoreData } from '../flight.models.ts';

export interface FjordProps {
  flying: boolean; armed: boolean; target: string | null; lost: string | null; game: GameAddress | null; warping: boolean;
  sectionBodies: Record<string, ComponentType>;
  onArm(): void; onExit(id: SectionId | null): void; onFly(id?: string | null): void;
  onPortal(address?: GameAddress): void; onFjord(): void; onProgress(progress: ReturnType<typeof readProgress>): void;
}

function LandingScore({ landing }: { landing: LandingScoreData }) {
  const [visible, setVisible] = useState(() => landing.expiresAt > Date.now());
  useEffect(() => {
    const remaining = landing.expiresAt - Date.now();
    setVisible(remaining > 0);
    if (remaining <= 0) return undefined;
    const timeout = setTimeout(() => setVisible(false), remaining);
    return () => clearTimeout(timeout);
  }, [landing.expiresAt]);
  if (!visible) return null;
  return (
    <p className="fjord-landing-score" role="status">
      {landing.distance.toFixed(1)} m from centre · {landing.grade} · {landing.points} pts · best {landing.bestDistance.toFixed(1)} m
    </p>
  );
}

/** What a landing shows: the matching page section, or a short note for a landing anywhere else. */
function LandingPanel({ panel, onTakeOff, onNext, onMap, onOpenPage, sectionBodies }: { panel: FlightPanel; onTakeOff(): void; onNext(): void; onMap(): void; onOpenPage(): void; sectionBodies: Record<string, ComponentType> }) {
  const section = SECTIONS.find((candidate) => candidate.id === panel.id);
  const Body = sectionBodies[panel.id];
  return (
    <section className="window fjord-panel">
      <header>
        <i />
        <i />
        <i />
        <span>{panel.path} — zsh</span>
      </header>
      <div className="fjord-panel-body">
        {panel.landing && <LandingScore landing={panel.landing} />}
        <p className="dim">$ {section ? section.command : 'echo $?'}</p>
        {Body ? (
          <Body />
        ) : (
          <>
            <p>{ROUGH_LANDINGS[panel.id as keyof typeof ROUGH_LANDINGS]}</p>
            <p className="dim">// the lit pillars mark the places worth landing at</p>
          </>
        )}
      </div>
      <footer>
        <button onClick={onTakeOff}>
          [ take off ]
        </button>
        {panel.next && (
          <button onClick={onNext}>
            [ fly me to {panel.next.label} ]
          </button>
        )}
        <button onClick={onMap}>
          [ map ]
        </button>
        {section && <button onClick={onOpenPage}>[ open on page ]</button>}
      </footer>
    </section>
  );
}

// What each ending of a missing page says once the visitor is safely down.
const ENDINGS: Record<string, string> = {
  tree: 'You threw the reserve in time and came down in a tree. Every pilot gets one of those.',
  aboard: 'The reserve stayed in its bag. The fjord is four degrees; the longship crew fished you out.',
  skipped: 'There is nothing at this address.',
  still: 'There is nothing at this address.',
};

/**
 * The missing page. Its text and its way home are plain page content, there from the first moment;
 * the emergency plays behind them, and `stage` is the beat it has reached.
 */
function MissingPage({ path, stage, onThrow, onSkip, onHome, onFly, onRetry }: { path: string; stage: string; onThrow(): void; onSkip(): void; onHome(id: SectionId | null): void; onFly(): void; onRetry(): void }) {
  const ending = ENDINGS[stage];
  return (
    <div className="fjord-lost">
      <p className="dim">$ cd {path}</p>
      <p>zsh: no such file or directory: {path}</p>
      <h2 className="shout">
        <span>&gt;</span> 404_{ending ? 'PAGE_NOT_FOUND' : 'WING_COLLAPSED'}
      </h2>
      {(stage === 'gliding' || stage === 'falling') && (
        <p>
          <button className="primary" onClick={onThrow} disabled={stage !== 'falling'}>
            [ throw reserve ]
          </button>{' '}
          <span className="dim">before 40 m</span>
        </p>
      )}
      {stage === 'late' && <p className="warn">// too low. the reserve would not open in time.</p>}
      {(stage === 'thrown' || stage === 'splash') && <p className="dim">// {stage === 'thrown' ? 'reserve out' : 'splash'}</p>}
      {ending && (
        <>
          <p>// {ending}</p>
          <p className="actions">
            <button className="primary" onClick={() => onHome(null)}>
              [ ~/ home ]
            </button>
            {SECTIONS.map((section) => (
              <button key={section.id} onClick={() => onHome(section.id)}>
                [ {section.file} ]
              </button>
            ))}
            <button onClick={() => onFly()}>[ fly.sh ]</button>
            {stage !== 'still' && <button onClick={onRetry}>[ fall again ]</button>}
          </p>
        </>
      )}
      {!ending && (
        <p className="fjord-lost-skip">
          <button onClick={onSkip}>
            [ skip ]
          </button>
          <button className="link" onClick={() => onHome(null)}>
            take me home →
          </button>
        </p>
      )}
    </div>
  );
}

/** Shared manual controls apply to both flight modes and every pointer device. */
function FlightControlHelp({ navigation = false }: { navigation?: boolean }) {
  return <>
    <ol className="fjord-intro-controls">
      <li><span aria-hidden="true">↔</span><div><strong>TURN</strong><span>pull either side handle · A / D on keyboard</span></div></li>
      <li><span aria-hidden="true">↓</span><div><strong>BRAKE</strong><span>pull both handles · Space on keyboard · full pulls can stall</span></div></li>
      <li><span aria-hidden="true">↑</span><div><strong>HANDS UP</strong><span>slide up, or just let go</span></div></li>
    </ol>
    {navigation && <p className="dim">Select a lit pillar for automatic travel, or open the map to pick a destination.</p>}
  </>;
}

/**
 * The fjord. Idle, it is the hero's backdrop; with `flying` it fills the window and the visitor steers.
 * `armed` says the visitor has already clicked something, which browsers require before sound may play;
 * arriving straight at the flight's address shows a start button first. `lost` is the address of a
 * missing page; it plays the emergency instead of a flight. `game` is a Good Lift address (see
 * good-lift-address.js): the game beyond the arch is played on the sky it asks for. Flying through
 * the arch asks the page for it with `onPortal`, and `onFjord` asks to leave it for the fjord.
 */
export default function Fjord({ flying, armed, target, lost, game: address, warping, onArm, onExit, onFly, onPortal, onFjord, onProgress, sectionBodies }: FjordProps) {
  const { stage, game, live, panel, result, music, bots, world, sky, rival, lostStage, retrySky, skipMissingPage, retryMissingPage } = useFjordFlight({ flying, armed, target, lost, game: address, warping, onArm, onExit, onFly, onPortal, onFjord, onProgress, sectionBodies });

  // The meet sheet comes with the game beyond the arch, never with the page: a run's result is
  // only ever shown once the game has loaded it.
  const MeetSheet = result ? game.current?.meetSheet : null;
  return (
    <div className={`fjord${flying ? ' flying' : ''}${live ? ' live' : ''}${flying && panel ? ' reading' : ''}`}>
      <div className="fjord-stage" ref={stage} />
      {flying && !live && !lost && <p className="fjord-note">loading the fjord…</p>}
      {flying && live && address && sky === 'loading' && <p className="fjord-note">loading the sky…</p>}
      {flying && live && address && sky === 'failed' && (
        <div className="fjord-start">
          <p className="dim">$ ./good-lift.sh</p>
          <p>// the sky beyond the arch did not load.</p>
          <p>
            <button className="primary" onClick={retrySky}>
              [ try again ]
            </button>{' '}
            <button onClick={() => onFjord()}>[ back to the fjord ]</button>
          </p>
        </div>
      )}
      {flying && lost && (
        <MissingPage
          path={lost}
          stage={lostStage}
          onThrow={() => game.current?.throwReserve()}
          onSkip={skipMissingPage}
          onHome={onExit}
          onFly={onFly}
          onRetry={retryMissingPage}
        />
      )}
      {flying && live && !armed && !lost && address && (
        <div className="fjord-start">
          <p className="dim">
            $ ./good-lift.sh{' '}
            {address.kind === 'practice'
              ? '--practice'
              : address.kind === 'vs'
                ? '--race'
                : address.kind === 'sky'
                  ? `--sky ${((address.sky ?? 0) >>> 0).toString(16).padStart(8, '0')}`
                  : '--daily'}
          </p>
          <h2 className="shout">
            <span>&gt;</span> GOOD_LIFT
          </h2>
          <p>
            Climb through a line every 150 m. Three judges light each lift.
            {address.kind === 'daily' ? ` Daily #${dailyNumber(dayOf(Date.now()))}.` : ''}
          </p>
          {address.bad && <p className="dim">// that sky could not be read, so here is today's.</p>}
          {address.kind === 'vs' &&
            (!rival ? (
              <p className="dim">// reading the challenge…</p>
            ) : 'error' in rival ? (
              <p className="dim">
                // {rival.error === 'version' ? 'that challenge was flown under older rules' : 'that challenge could not be read'}, so here is today's sky.
              </p>
            ) : (
              <p>
                // to beat: {rival.who || 'a pilot'} · {(rival.score ?? 0).toLocaleString('en-GB')} pts ·{' '}
                {rival.peak.toLocaleString('en-GB')} m · verified
              </p>
            ))}
          <FlightControlHelp />
          <p className="fjord-start-actions">
            <button className="primary" onClick={onArm}>
              [ <span className="for-keys">click</span>
              <span className="for-touch">tap</span> to start ]
            </button>{' '}
            <button onClick={() => onExit(null)}>[ back to the page ]</button>
          </p>
          <p className="dim fjord-start-note">Thermals, plates, kettlebells and tricks: the coach introduces each one in flight.</p>
        </div>
      )}
      {flying && live && !armed && !lost && !address && (
        <div className="fjord-start">
          <p className="dim">$ ./fly.sh</p>
          <h2 className="shout">
            <span>&gt;</span> FLY_THE_FJORD
          </h2>
          <p>// Steer a paraglider over the fjord. Land at the lit places to read about me.</p>
          <p>
            <button className="primary" onClick={onArm}>
              [ <span className="for-keys">click</span>
              <span className="for-touch">tap</span> to start ]
            </button>{' '}
            <button onClick={() => onExit(null)}>[ back to the page ]</button>
          </p>
          <FlightControlHelp navigation />
        </div>
      )}
      {flying && panel && (
        <LandingPanel
          panel={panel}
          sectionBodies={sectionBodies}
          onTakeOff={() => game.current?.takeOff()}
          onNext={() => game.current?.flyToNext()}
          onMap={() => game.current?.openMap()}
          onOpenPage={() => onExit(panel.id as SectionId)}
        />
      )}
      {flying && !panel && result && MeetSheet && (
        <MeetSheet
          result={result}
          onRetry={() => game.current?.retryCloudbase()}
          onSky={(kind) => onPortal({ kind, sky: null, vs: null, bad: null })}
          onFjord={() => onFjord()}
          onPage={() => onExit(null)}
          onInitials={(text) => game.current?.setInitials(text)}
          music={music}
          onMusic={() => game.current?.toggleMusic()}
          bots={bots}
          world={world}
          onWithdraw={() => game.current?.removeWorldRun() ?? Promise.resolve(false)}
          onKit={(choice) => game.current?.setKit(choice)}
        />
      )}
    </div>
  );
}
