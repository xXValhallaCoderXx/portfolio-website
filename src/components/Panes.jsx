import { useEffect, useState } from 'react';
import { PROFILE, SECTIONS, SKILLS, STATS } from '../content.js';
import { BODIES } from './Sections.jsx';
import Sheet from './Sheet.jsx';

// The page below the hero is one terminal split into panes, the way tmux or a tiling window manager
// lays them out: everything in view at once, and any pane can be zoomed to fill the window.

/** One pane. `area` is its slot in the layout and `index` its number in the status bar. */
function Pane({ id, area, index, title, command, place, onFly, onZoom, children }) {
  return (
    <section className="pane" id={id} style={{ gridArea: area }} aria-label={title}>
      <header>
        <span className="pane-index">{index}</span>
        <h2>{title}</h2>
        <span className="spacer" />
        {onFly && (
          <button className="link" onClick={onFly} aria-label={`Fly to ${place}`}>
            ↗ fly<span className="to"> to {place}</span>
          </button>
        )}
        {onZoom && (
          <button className="link" onClick={onZoom} aria-label={`Zoom ${title}`}>
            [ zoom ]
          </button>
        )}
      </header>
      <div className="pane-body">
        <p className="dim">$ {command}</p>
        {children}
        <p className="dim pane-end">
          $ <i className="cursor" />
        </p>
      </div>
    </section>
  );
}

/** The system summary, printed the way `neofetch` prints one. */
function Neofetch() {
  const who = `${PROFILE.user}@${PROFILE.host}`;
  return (
    <div className="neofetch">
      <p>
        <b>{PROFILE.user}</b>@<b>{PROFILE.host}</b>
      </p>
      <p className="dim">{'-'.repeat(who.length)}</p>
      <dl>
        {STATS.map((stat) => (
          <div key={stat.label}>
            <dt>{stat.label}:</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
      <p className="swatches" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </p>
    </div>
  );
}

function Skills() {
  return (
    <dl className="skills">
      {SKILLS.map((group) => (
        <div key={group.label}>
          <dt>{group.label}/</dt>
          <dd className="tags">
            {group.items.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// The panes that are not sections of their own: what each prints, and the command that prints it.
const EXTRAS = {
  neofetch: { command: 'neofetch', Body: Neofetch },
  'skills.txt': { command: 'cat skills.txt', Body: Skills },
};

function clock() {
  return new Date().toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short', year: '2-digit' });
}

/** The status bar under the panes: every pane by number, and the time. */
function StatusBar({ panes }) {
  const [now, setNow] = useState(clock);
  useEffect(() => {
    const tick = setInterval(() => setNow(clock()), 30000);
    return () => clearInterval(tick);
  }, []);
  return (
    <nav className="statusbar" aria-label="Panes">
      <span className="session">[portfolio]</span>
      {panes.map((pane, i) => (
        <a href={`#${pane.id}`} key={pane.id}>
          {i}:{pane.title}
        </a>
      ))}
      <span className="spacer" />
      <span className="dim">
        &quot;{PROFILE.host}&quot; {now}
      </span>
    </nav>
  );
}

export default function Panes({ onFly }) {
  const [zoomed, setZoomed] = useState(null);
  // The four sections, with the system summary and the skills list slotted in before the last.
  const panes = [
    ...SECTIONS.slice(0, 3).map((section) => ({ id: section.id, title: section.file, section })),
    { id: 'neofetch', title: 'neofetch' },
    { id: 'skills', title: 'skills.txt' },
    ...SECTIONS.slice(3).map((section) => ({ id: section.id, title: section.file, section })),
  ];
  const ZoomedBody = zoomed && BODIES[zoomed.id];

  return (
    <main className="desk">
      <p className="dim desk-prompt">$ tmux attach -t portfolio</p>
      <div className="tiles">
        {panes.map((pane, i) => {
          if (!pane.section) {
            const { command, Body: Extra } = EXTRAS[pane.title];
            return (
              <Pane id={pane.id} area={pane.id} index={i} title={pane.title} command={command} key={pane.id}>
                <Extra />
              </Pane>
            );
          }
          const { section } = pane;
          const Body = BODIES[section.id];
          return (
            <Pane
              id={section.id}
              area={section.id}
              index={i}
              title={section.file}
              command={section.command}
              place={section.place}
              onFly={() => onFly(section.id)}
              onZoom={() => setZoomed(section)}
              key={section.id}
            >
              <Body />
            </Pane>
          );
        })}
      </div>
      <StatusBar panes={panes} />
      {zoomed && (
        <Sheet title={`tmux — zoom ${zoomed.file}`} label={zoomed.file} onClose={() => setZoomed(null)}>
          <div className="readme-body">
            <div>
              <p className="dim">$ {zoomed.command}</p>
              <ZoomedBody />
            </div>
          </div>
        </Sheet>
      )}
    </main>
  );
}
