// Everything the visitor reads. Section copy is lifted from the portfolio mockups; edit it here.

const project = (name, text, tags) => `
  <article class="card">
    <h3>${name}</h3>
    <p># ${text}</p>
    <p class="tags">${tags.map((tag) => `<span>--${tag}</span>`).join('')}</p>
  </article>`;

const commit = (hash, years, role, text) => `
  <li><span class="hash">commit ${hash}</span> <span class="dim">[${years}]</span> <b>${role}</b><br>${text}</li>`;

export const SECTIONS = {
  about: {
    prompt: 'cat about.md',
    html: `
      <p>I've been an engineer for over ten years, and I've learned that the best systems aren't just
      written — they're earned. The same discipline I bring to a sparring session shows up in how I
      architect software.</p>
      <p>Outside the terminal you'll find me on the mats, chasing a personal best, or buried in Norse
      history and mythology — a blend of movement, strategy, and old-world storytelling that shapes how
      I build.</p>
      <p class="tags"><span>--martial-arts</span><span>--endurance-sports</span><span>--norse-history</span><span>--game-design</span></p>`,
  },
  projects: {
    prompt: 'ls -la ./projects/',
    html: `<div class="cards">
      ${project('sheetless.app', 'Eliminates spreadsheet busywork — replacing manual sheets with something that actually thinks ahead.', ['react', 'node', 'postgres'])}
      ${project('flyte-paragliding.app', 'Flight tracking, conditions, and logs for paragliding pilots — built for life above the clouds.', ['flutter', 'firebase', 'maps-api'])}
      ${project('hird-orchestrator', 'Named after the Norse warband — coordinates multiple AI agents into one disciplined workflow.', ['python', 'langchain', 'docker'])}
      ${project('sentiment-hound', 'Hunts down opinion signals across text and social data — fast, sharp, and relentless.', ['typescript', 'ml', 'redis'])}
    </div>`,
  },
  experience: {
    prompt: 'git log --oneline --decorate experience.log',
    html: `<ul class="log">
      ${commit('a1f09e2', '2021 – now', 'Staff Engineer', 'Leading platform architecture across distributed teams and high-throughput services.')}
      ${commit('7c3b91a', '2017 – 2021', 'Senior Engineer', 'Built and scaled core product features used by hundreds of thousands of users daily.')}
      ${commit('4e82d10', '2014 – 2017', 'Software Engineer', 'Full-stack development across web and mobile, shipping end-to-end product features.')}
      ${commit('0a1c338', '2012 – 2014', 'Junior Engineer', 'Where it started — learning the craft, writing the first real systems, earning the scars.')}
    </ul>`,
  },
  contact: {
    prompt: './contact --reach-out',
    html: `
      <p>Always open to interesting problems, collaborations, and conversations. If you've got a
      challenge worth tackling, pipe it my way.</p>
      <p class="links"><a href="#">[ github ]</a> <a href="#">[ linkedin ]</a> <a href="#">[ email ]</a></p>`,
  },
  // Landings outside any ring.
  water: {
    prompt: 'echo $?',
    html: `<p>Splash. The fjord is four degrees and you are now in it.</p>
      <p class="dim">// the lit pillars mark the places worth landing at</p>`,
  },
  slope: {
    prompt: 'echo $?',
    html: `<p>Rough landing on open hillside. Nothing here but heather and rock.</p>
      <p class="dim">// the lit pillars mark the places worth landing at</p>`,
  },
};

export const ACHIEVEMENTS = [
  { id: 'airborne', name: 'Airborne', text: 'Take off.' },
  { id: 'touchdown', name: 'Touchdown', text: 'Land inside a ring.' },
  { id: 'thermal', name: 'Thermal hunter', text: 'Gain 60 m in a single climb.' },
  { id: 'aegir', name: "Ægir's guest", text: 'Land in the fjord.' },
  { id: 'goat', name: 'Mountain goat', text: 'Land on open hillside.' },
  { id: 'runes', name: 'Rune reader', text: 'Fly past all four rune stones.' },
  { id: 'valkyrie', name: 'Valkyrie', text: 'Climb above 330 m.' },
  { id: 'tour', name: 'Grand tour', text: 'Land at all four places.' },
];

// One belt per achievement earned. Swap in your own art's grading order.
export const BELTS = ['white', 'yellow', 'orange', 'green', 'blue', 'purple', 'brown', 'brown · 1st kyu', 'black · 1st dan'];
