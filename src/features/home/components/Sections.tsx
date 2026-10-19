import ExternalLink from '../../../components/atoms/ExternalLink.tsx';
import { ABOUT, CONTACT, SKILLS, STATS } from '../../../domains/portfolio/content.ts';
export function AboutBody() {
  return (
    <div className="about">
      <div className="prose">
        {ABOUT.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <p className="tags">
          {ABOUT.flags.map((flag) => (
            <span key={flag}>{flag}</span>
          ))}
        </p>
      </div>
      <aside className="card">
        <p className="card-title">pilot log</p>
        <dl className="facts">
          {[...STATS, ...ABOUT.facts].map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label.toLowerCase()}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}

export function SkillsBody() {
  return (
    <dl className="gear">
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

export function ContactBody() {
  return (
    <div className="contact">
      <h3 className="shout">
        <span>&gt;</span> {CONTACT.heading}
      </h3>
      <p>{CONTACT.text}</p>
      <p className="links">
        {CONTACT.links
          .filter((link) => link.url)
          .map((link) => (
            <ExternalLink className="button" href={link.url} key={link.label}>
              [ {link.label} ↗ ]
            </ExternalLink>
          ))}
      </p>
    </div>
  );
}

