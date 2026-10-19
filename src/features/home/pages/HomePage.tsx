import type { CSSProperties, ReactNode } from 'react';
import Button from '../../../components/atoms/Button.tsx';
import { PROFILE } from '../../../domains/portfolio/content.ts';

export default function HomePage({ hidden, flying, backdrop, route, onFly }: {
  hidden: boolean; flying: boolean; backdrop: ReactNode; route: ReactNode; onFly: () => void;
}) {
  return (
    <div hidden={hidden}>
      <header className="hero">
        {backdrop}
          {!flying && (
            <div className="hero-copy">
              <p className="dim">$ whoami</p>
              <p className="who">
                <b>{PROFILE.name}</b> · {PROFILE.role.toLowerCase()}
              </p>
              {/* `--chars` is the longest line with its prompt, so the type can shrink to keep it on one line. */}
              <h1 className="shout" style={{ '--chars': Math.max(...PROFILE.headline.map((line) => line.length)) + 2 } as CSSProperties}>
                {PROFILE.headline.map((line) => (
                  <span className="line" key={line}>
                    <span>&gt;</span> {line}
                  </span>
                ))}
              </h1>
              <p className="intro">
                // <span className="long">{PROFILE.intro}</span>
                <span className="short">{PROFILE.introShort}</span>
              </p>
              <p className="actions">
                <Button className="primary" onClick={() => onFly()}>
                  [ ./fly.sh ]
                </Button>
                <a className="button" href="#projects">
                  [ ./view_work.sh ]
                </a>
                <a className="button roomy" href="#contact">
                  [ ./contact.sh ]
                </a>
              </p>
            </div>
          )}
      </header>
      {route}
    </div>
  );
}
