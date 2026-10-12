// Everything a visitor reads. The page and the flight's landing panels both draw from this file,
// so the two can never drift apart.

export const PROFILE = {
  host: 'forge-frost',
  headline: ['FORGED_IN_CODE', 'TEMPERED_BY_GRIT'],
  intro:
    'Software engineer, 10+ years in production systems. Builder, martial artist, student of old ' +
    'sagas and new systems. I architect resilient software the way I train: deliberately, without shortcuts.',
};

export const STATS = [
  { label: 'Uptime', value: '10+ years, production' },
  { label: 'Shell', value: 'TypeScript / Python / Go' },
  { label: 'Packages', value: '40+ projects shipped' },
  { label: 'Modules', value: '04 core disciplines' },
  { label: 'Rank', value: '1st Dan Black Belt' },
];

// The four sections, in page order. Each `id` is also the place you land at in the flight.
export const SECTIONS = [
  { id: 'about', file: 'about.md', command: 'cat about.md', place: 'the hall' },
  { id: 'experience', file: 'experience.log', command: 'git log --oneline --decorate experience.log', place: 'rune ridge' },
  { id: 'projects', file: 'projects/', command: 'ls -la ./projects/', place: 'the forge' },
  { id: 'contact', file: 'contact.sh', command: './contact --reach-out', place: 'the beacon' },
];

export const ABOUT = {
  paragraphs: [
    "I've been an engineer for over ten years, and I've learned that the best systems aren't just " +
      "written — they're earned. The same discipline I bring to a sparring session shows up in how I architect software.",
    "Outside the terminal you'll find me on the mats, chasing a personal best, or buried in Norse history " +
      'and mythology — a blend of movement, strategy, and old-world storytelling that shapes how I build.',
  ],
  flags: ['martial-arts', 'endurance-sports', 'norse-history', 'game-design'],
};

// Newest first. In the flight each entry becomes a rune stone along the shore, oldest first.
export const EXPERIENCE = [
  {
    hash: 'a1f09e2',
    years: '2021 – now',
    role: 'Staff Engineer',
    text: 'Leading platform architecture across distributed teams and high-throughput services.',
  },
  {
    hash: '7c3b91a',
    years: '2017 – 2021',
    role: 'Senior Engineer',
    text: 'Built and scaled core product features used by hundreds of thousands of users daily.',
  },
  {
    hash: '4e82d10',
    years: '2014 – 2017',
    role: 'Software Engineer',
    text: 'Full-stack development across web and mobile, shipping end-to-end product features.',
  },
  {
    hash: '0a1c338',
    years: '2012 – 2014',
    role: 'Junior Engineer',
    text: 'Where it started — learning the craft, writing the first real systems, earning the scars.',
  },
];

// `prop` is the model that stands for the project beside the forge. `url` is still a placeholder.
export const PROJECTS = [
  {
    name: 'sheetless.app',
    path: './projects/sheetless',
    text: 'Eliminates spreadsheet busywork — replacing manual sheets with something that actually thinks ahead.',
    tags: ['react', 'node', 'postgres'],
    url: '#',
    prop: 'kettlebell',
  },
  {
    name: 'flyte-paragliding.app',
    path: './projects/flyte',
    text: 'Flight tracking, conditions, and logs for paragliding pilots — built for life above the clouds.',
    tags: ['flutter', 'firebase', 'maps-api'],
    url: '#',
    prop: 'wing-bag',
  },
  {
    name: 'hird-orchestrator',
    path: './projects/hird',
    text: 'Named after the Norse warband — coordinates multiple AI agents into one disciplined workflow.',
    tags: ['python', 'langchain', 'docker'],
    url: '#',
    prop: 'shield-rack',
  },
  {
    name: 'sentiment-hound',
    path: './projects/sentiment-hound',
    text: 'Hunts down opinion signals across text and social data — fast, sharp, and relentless.',
    tags: ['typescript', 'ml', 'redis'],
    url: '#',
    prop: 'hound',
  },
];

// The link addresses are still placeholders.
export const CONTACT = {
  heading: "LET'S_BUILD_SOMETHING_FORGED",
  text:
    "Always open to interesting problems, collaborations, and conversations. If you've got a challenge " +
    'worth tackling, pipe it my way.',
  links: [
    { label: 'github', url: '#' },
    { label: 'linkedin', url: '#' },
    { label: 'email', url: '#' },
  ],
};

// What the flight says when you land somewhere that is not a place.
export const ROUGH_LANDINGS = {
  water: 'Splash. The fjord is four degrees and you are now in it.',
  slope: 'Rough landing on open hillside. Nothing here but heather and rock.',
};
