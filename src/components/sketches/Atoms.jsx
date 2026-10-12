import { useState } from 'react';

// Atomic Design in one example screen: step up from the smallest pieces to the whole page and
// watch each level get its outline and its name.

const LEVELS = [
  { name: 'atoms', says: 'The smallest pieces: a label, an input, a button, an avatar.' },
  { name: 'molecules', says: 'Atoms that always travel together. A field is a label with its input; a person is an avatar with a name.' },
  { name: 'organisms', says: 'Molecules arranged into a working part of the interface: a list of people, a form.' },
  { name: 'screen', says: 'Organisms placed on a page. Design and code name every level the same way, which is the shared language.' },
];

function Person({ name }) {
  return (
    <div className="molecule" data-name="person">
      <i className="atom avatar" />
      <span className="atom">{name}</span>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="molecule" data-name="field">
      <span className="atom label">{label}</span>
      <span className="atom input">{value}</span>
    </div>
  );
}

export default function Atoms() {
  const [level, setLevel] = useState(0);
  return (
    <div className="demo atoms">
      <div className="efforts" role="group" aria-label="Level of the design system">
        {LEVELS.map((step, i) => (
          <button className={i === level ? 'on' : undefined} aria-pressed={i === level} onClick={() => setLevel(i)} key={step.name}>
            {step.name}
          </button>
        ))}
      </div>
      <div className="atoms-stage" data-level={level} aria-hidden="true">
        <div className="template" data-name="screen">
          <div className="organism" data-name="people list">
            <Person name="Astrid" />
            <Person name="Bjørn" />
          </div>
          <div className="organism" data-name="form">
            <Field label="to" value="Astrid" />
            <Field label="amount" value="120.00" />
            <span className="atom action">send</span>
          </div>
        </div>
      </div>
      <p aria-live="polite">{LEVELS[level].says}</p>
      <p className="demo-note">// an example screen, not the product</p>
    </div>
  );
}
