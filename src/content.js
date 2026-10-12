// Everything a visitor reads. The page and the flight's landing panels both draw from this file,
// so the two can never drift apart.

export const PROFILE = {
  name: 'Renate Gouveia',
  role: 'Engineering lead',
  user: 'renate',
  host: 'forge-frost',
  headline: ['FORGED_IN_CODE', 'TEMPERED_BY_GRIT'],
  intro:
    'Engineering lead with a frontend core, building for the web since 2016. Martial artist, student of old ' +
    'sagas and new systems. I architect resilient software the way I train: deliberately, without shortcuts.',
};

export const STATS = [
  { label: 'Now', value: 'Engineering Lead at HQ.xyz' },
  { label: 'Uptime', value: 'on the web since 2016' },
  { label: 'Shell', value: 'TypeScript / React / Node' },
  { label: 'Domains', value: 'Web3, fintech, property' },
  { label: 'Rank', value: '1st Dan Black Belt' },
];

// From the CV's skills list, split into what I build with and how I lead.
export const SKILLS = [
  { label: 'build', items: ['JavaScript / TypeScript', 'React', 'React Native', 'Node.js', 'Redux', 'Webpack', 'Jest', 'REST and GraphQL APIs', 'Web3'] },
  { label: 'lead', items: ['SDLC and agile methods', 'project management', 'technical process improvement'] },
];

// The four sections, in page order: what a recruiter looks for first comes first. Each `id` is
// also the place you land at in the flight.
export const SECTIONS = [
  { id: 'experience', file: 'experience.log', command: 'git log --oneline --decorate experience.log', place: 'rune ridge' },
  { id: 'projects', file: 'projects/', command: 'ls -la ./projects/', place: 'the forge' },
  { id: 'about', file: 'about.md', command: 'cat about.md', place: 'the hall' },
  { id: 'contact', file: 'contact.sh', command: './contact --reach-out', place: 'the beacon' },
];

export const ABOUT = {
  paragraphs: [
    'I came into engineering by an unorthodox path, and started building for the web in 2016. Since then I have ' +
      'gone from one of the first frontend hires at a startup to leading engineering teams, without ever moving far ' +
      'from the code. React and TypeScript are home; Web3 and AI are where I keep exploring.',
    'I like the people side of the work as much as the technical side: taking over a codebase someone else ' +
      'built, giving a team a shared way of working, and writing things down so the next person starts faster.',
    "Outside the terminal you'll find me on the mats, chasing a personal best, or buried in Norse history " +
      'and mythology — a blend of movement, strategy, and old-world storytelling that shapes how I build.',
  ],
  facts: [
    { label: 'education', value: 'BS Information Systems (Software Engineering), De La Salle–College of St Benilde, 2014 – 2018' },
    { label: 'languages', value: 'English (native), Portuguese (limited working proficiency)' },
  ],
  flags: ['martial-arts', 'endurance-sports', 'norse-history', 'game-design'],
};

// Newest first, from the CV. `text` is the short version on the page and `details` the full list shown when a
// role is opened. In the flight each entry becomes a rune stone along the shore, oldest first.
export const EXPERIENCE = [
  {
    hash: 'a1f09e2',
    years: 'Sep 2025 – now',
    role: 'Engineering Lead',
    company: 'HQ.xyz (Gnosis Business)',
    text:
      'Own the product vision and delivery of a major greenfield initiative. Designed the team\'s development ' +
      'process from scratch and lead the engineering unit, with the final say on UI and UX.',
    details: [
      'Directed the product vision and execution of a major greenfield initiative, aligning technical and business goals through close work with stakeholders.',
      "Designed and implemented a development process from scratch, owning the sprint cadence and speeding up the team's delivery.",
      'Lead the engineering unit and act as the final technical and aesthetic authority on UI and UX, holding the product to a mobile-first, user-centred standard.',
    ],
  },
  {
    hash: '7c3b91a',
    years: 'Dec 2022 – Sep 2025',
    role: 'Frontend Engineering Lead',
    company: 'HQ.xyz (Gnosis Business)',
    text:
      'First in-house frontend lead, taking over a codebase built by a remote team. Introduced the application ' +
      'architecture and an Atomic Design component library, wrote the onboarding manual that became the living ' +
      'reference, and shipped a feature that salvaged funds usually lost to the quirks of early multi-sig wallets.',
    details: [
      "Led the frontend team as HQ's first in-house lead, taking charge of a codebase developed by a remote team.",
      'Introduced a scalable application architecture, adopted over time, that sped up feature iteration and kept the codebase uniform and maintainable.',
      'Designed and built a component library on Atomic Design principles, giving designers and developers a shared language for new screens and a consistent UI.',
      'Ran sprint execution and resource allocation across the frontend team, keeping delivery and velocity high.',
      'Worked with stakeholders across departments to scope and define features.',
      "Wrote an in-depth onboarding manual that cut the supervision new remote contractors needed, and became the application's living reference.",
      'Proposed and shipped custom solutions, such as a feature that salvaged funds typically lost when multi-sig wallets were still a new concept in Web3.',
      'Built analytics tracking on APIs to get around the Web3 constraints that block third-party JavaScript trackers, shown in a Retool dashboard, so the product team could see how users behaved.',
    ],
  },
  {
    hash: '4e82d10',
    years: 'Mar – Dec 2022',
    role: 'Engineering Lead',
    company: 'Salad Ventures',
    text:
      'Rebuilt the engineering team from the ground up, two local and four remote developers, and set up a ' +
      'satellite office in Jakarta. Restructured an inherited codebase around Domain-Driven Design and sped up a ' +
      'bulk crypto payroll system with Redis and worker threads.',
    details: [
      'Restructured an inherited codebase with Domain-Driven Design, reducing duplication and speeding up development.',
      'Raised the throughput of a bulk crypto payroll system with Redis and worker threads for parallel processing.',
      'Strengthened security by integrating AWS Key Management Service to protect wallets and sensitive data.',
      'Standardised coding practices with linters, formatters and other tooling.',
      'Rebuilt the engineering team from the ground up, recruiting two local and four remote developers and establishing a satellite office in Jakarta.',
      'Introduced local and test blockchain networks to validate core services before release.',
    ],
  },
  {
    hash: '9d5e7b4',
    years: 'Jun 2021 – Mar 2022',
    role: 'Senior Frontend Engineer',
    company: 'Finxflo',
    text:
      'Delivered core product features in a complex trading codebase, and made the order book fast enough for ' +
      'rapid updates with worker threads and the Canvas API.',
    details: [
      'Integrated into a complex codebase and delivered core product features under tight deadlines.',
      'Worked with business stakeholders to gather requirements and shape solutions.',
      'Coordinated with external vendors, including email and SMS providers and SaaS platforms.',
      'Contributed to hiring by writing interview materials and running technical assessments.',
      'Optimised the trading order book with worker threads and the Canvas API, so it could keep up with rapid updates.',
    ],
  },
  {
    hash: '3b6f0c1',
    years: 'Jan – Jun 2021',
    role: 'Frontend Engineering Manager',
    company: 'Hmlet',
    text:
      'Led four frontend engineers across two products, turning two siloed teams into one, and brought the team ' +
      'to adopt TypeScript and shared coding conventions.',
    details: [
      'Led a team of four frontend engineers across two products, unifying previously siloed teams.',
      'Introduced weekly sync-ups for knowledge sharing and brainstorming, which lifted morale and collaboration.',
      "Won the team's agreement to adopt TypeScript and standard coding conventions across both products.",
      'Worked with cross-functional stakeholders to define product requirements and shape roadmaps.',
    ],
  },
  {
    hash: 'e2a47d9',
    years: 'Feb 2020 – Feb 2021',
    role: 'Senior Frontend Engineer',
    company: 'Hmlet',
    text:
      'Finished a property management platform against a tight launch date, and built a framework-agnostic ' +
      'design system proof of concept that the company later adopted.',
    details: [
      'Joined mid-sprint to finish a property management platform under tight deadlines, for a launch on time.',
      'Used a headless CMS to manage property listings and app content with less developer involvement.',
      'Built and presented a framework-agnostic design system proof of concept, working with React, React Native, Vue and others on web and mobile, which was later adopted across the company.',
    ],
  },
  {
    hash: '0a1c338',
    years: 'Oct 2016 – Feb 2020',
    role: 'Frontend Engineer',
    company: 'Horangi',
    text:
      'One of the earliest frontend hires. Shipped the flagship client-facing application on an accelerated ' +
      'schedule and introduced a headless CMS for the marketing pages.',
    details: [
      'Joined as one of the earliest frontend hires and met an accelerated launch schedule for the flagship client-facing application.',
      'Contributed to public-facing apps and an internal tool, integrating several third-party SaaS products.',
      'Proposed and implemented a headless CMS for the marketing pages, so blog posts and resources could be published without a developer.',
    ],
  },
];

// The projects, written from each repository's own README and docs.
//   `prop`    the model that stands for the project beside the forge
//   `image`   `src` is the picture on the card and `full` the whole screenshot in the README;
//             `tall` marks a phone screenshot, which sits beside the README's text, not under it
//   `diagram` drawn in place of a screenshot when there is none, with `glyph` as its short form on a card
//   `links`   only what a visitor can actually open; private repositories are left out
export const PROJECTS = [
  {
    id: 'hird',
    name: 'hird',
    title: 'Hird',
    path: './projects/hird',
    tagline: 'A desktop workspace where teams of AI agents research, plan and review work on your repository.',
    status: 'in active development',
    year: '2026',
    summary:
      'Hird connects a repository and its Linear tickets to one shared orchestration engine. You can chat with an ' +
      'assistant that knows the project, hand an investigation to a swarm of agents that research in parallel and ' +
      'then synthesise what they found, and turn tickets into reviewed plans. It is named after the Norse hird, a ' +
      "lord's household warband.",
    built: [
      'A desktop app in Electron, React and Mantine, with a sandboxed renderer and typed messaging to the engine.',
      'A separately runnable Mastra engine that runs agents through OpenRouter, with a scheduler, a concurrency cap and recovery after a restart.',
      'Research swarms of two to six agents, each with its own budget, optional web search and cited sources.',
      'Every run recorded with a live timeline, its result, and what it cost in tokens and dollars.',
    ],
    tags: ['typescript', 'electron', 'react', 'mantine', 'mastra', 'openrouter'],
    image: {
      src: '/projects/hird-card.webp',
      full: '/projects/hird.webp',
      alt: "Hird's Agents page, listing the model sources a team of agents can draw on and what each has spent.",
    },
    links: [],
    prop: 'shield-rack',
  },
  {
    id: 'flight-log',
    name: 'flight-log',
    title: 'Flight Log',
    path: './projects/flight-log',
    tagline: 'A paragliding logbook that records a flight on your phone with no signal, then replays it on a map.',
    status: 'internal alpha on Android',
    year: '2026',
    summary:
      "An Android-first paragliding journal. It records a flight from the phone's GPS and barometer with no account and " +
      'no connection, keeps the raw evidence, and afterwards replays the route on a map with altitude and speed. ' +
      'Flights can be exported as IGC files or shared with friends.',
    built: [
      'Offline-first recording with background location, and recovery of an interrupted flight when the app is reopened.',
      'Replay on Mapbox maps with a moving pilot marker, an altitude chart, scrubbing and playback at up to 60 times speed, plus map areas you can download for use with no signal.',
      'Deterministic IGC export, and shareable postcard images drawn from the recorded route.',
      'Optional sign-in on Supabase: private cloud backup that restores a logbook on a new phone, and a friends feed with shared flights and kudos.',
    ],
    tags: ['typescript', 'react-native', 'expo', 'supabase', 'mapbox'],
    image: {
      src: '/projects/flight-log.webp',
      full: '/projects/flight-log-screen.webp',
      tall: true,
      alt: 'A recorded flight replayed in Flight Log: the route drawn on a map, with elapsed time, altitude and an altitude chart.',
    },
    links: [{ label: 'source', url: 'https://github.com/xXValhallaCoderXx/paragliding-tracker' }],
    prop: 'wing-bag',
  },
  {
    id: 'sheetless',
    name: 'sheetless',
    title: 'Sheetless',
    path: './projects/sheetless',
    tagline: "A strength-training log that replaces the spreadsheet and knows what today's session is.",
    status: 'web app, with a native app being explored',
    year: '2026',
    summary:
      'Sheetless holds a training programme and shows the next session: the lift, the sets and reps, the effort to aim ' +
      'for and the top set to beat. It tracks estimated one-rep max as the weeks go by, so the planning a lifter ' +
      'would do in a spreadsheet is already done.',
    built: [
      'A web app on React, Mantine and Supabase.',
      'A shared domain package for calendar and time-zone logic, with 25 assertions ported to check that it behaves the same on a phone as it does on the server.',
      'A native spike in Expo that tests the plan for a phone app: the shared code bundled for Android, sessions stored encrypted on the device, and the design tokens carried over.',
    ],
    tags: ['typescript', 'react', 'mantine', 'supabase', 'expo'],
    image: { src: '/projects/sheetless.webp', alt: "Sheetless showing the next session: competition bench press, four sets of five, with the top set and estimated one-rep max." },
    links: [],
    prop: 'kettlebell',
  },
  {
    id: 'sentiment-hound',
    name: 'sentiment-hound',
    title: 'Sentiment Hound',
    path: './projects/sentiment-hound',
    tagline: 'Social-media sentiment analysis as a product, built by a pipeline of coding agents with a human merge as the final gate.',
    status: 'SaaS idea, ongoing',
    year: '2025 – 2026',
    summary:
      'A SaaS idea for understanding what people say on social media. It analyses comments across platforms such as ' +
      'YouTube, Twitter and Instagram with AI models from Hugging Face, interprets the context behind a sentiment, ' +
      "aggregates the results into metrics, and can run the same analysis on a competitor's posts. The product is " +
      'at an early stage; most of the work so far is the engineering agent that builds it.',
    built: [
      'An engineering agent that takes a Linear ticket through planning, an isolated build, deterministic verification, browser checks and independent review, and ends in a draft pull request.',
      'A Mastra control plane that owns that lifecycle in code: state, retries, worktrees and the verification gate. No model decides what runs next, or that the tests passed.',
      'Claude Code and Codex as interchangeable workers in a sandbox. Every call is a fresh session, so the reviewer never sees the builder\'s conversation.',
      'A console with an inbox of everything waiting on a human, and a batch queue that works through tickets two at a time.',
      'The product itself as a Next.js web app with shared services and Playwright end-to-end tests.',
    ],
    tags: ['typescript', 'next.js', 'hugging-face', 'mastra', 'playwright'],
    diagram: [
      'ticket ─▶ plan ─▶ build ─▶ verify ─▶ review ─▶ draft PR',
      '                    ▲                   │',
      '                    └── bounded fixes ◀─┘',
    ].join('\n'),
    glyph: 'ticket ─▶ PR',
    links: [],
    prop: 'hound',
  },
  {
    id: 'whispering-garden',
    name: 'whispering-garden',
    title: 'Whispering Garden',
    path: './projects/whispering-garden',
    tagline: 'A top-down combat RPG, built solo for an online game-development hackathon.',
    status: 'hackathon game',
    year: '2025',
    summary:
      'My entry to an online hackathon with a game-development theme, built alone. A simple top-down combat RPG in ' +
      'Phaser 3, with React drawing the interface around it.',
    built: [
      'The game in Phaser 3, with characters and objects animated from sprite sheets.',
      'An event-driven bridge between the game logic and the React interface, so neither reaches into the other.',
      'A game loop tuned for smooth combat.',
    ],
    tags: ['javascript', 'phaser-3', 'react'],
    diagram: ['Phaser scene ◀── events ──▶ React UI', '     │', '     └─ game loop: input ─▶ update ─▶ draw'].join('\n'),
    glyph: 'Phaser ⇄ React',
    links: [],
  },
];

// Only links with an address are shown. Email is left blank on purpose: fill it in to publish it.
export const CONTACT = {
  heading: "LET'S_BUILD_SOMETHING_FORGED",
  text:
    "Always open to interesting problems, collaborations, and conversations. If you've got a challenge " +
    'worth tackling, pipe it my way.',
  links: [
    { label: 'linkedin', url: 'https://www.linkedin.com/in/xxvalhallaxx/' },
    { label: 'github', url: 'https://github.com/xXValhallaCoderXx' },
    { label: 'medium', url: 'https://xvalhallacoderx.medium.com/' },
    { label: 'email', url: '' },
  ],
};

// What the flight says when you land somewhere that is not a place.
export const ROUGH_LANDINGS = {
  water: 'Splash. The fjord is four degrees and you are now in it.',
  slope: 'Rough landing on open hillside. Nothing here but heather and rock.',
};
