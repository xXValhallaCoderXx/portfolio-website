// Everything a visitor reads. The page and the flight's landing panels both draw from this file,
// so the two can never drift apart.

export const PROFILE = {
  name: 'Renate Gouveia',
  role: 'Engineering lead',
  user: 'renate',
  host: 'forge-frost',
  headline: ['FORGED_IN_CODE', 'TEMPERED_BY_GRIT'],
  intro:
    'Engineering lead with a frontend core, building for the web since 2016. Martial artist and student of old ' +
    'sagas, bringing the old ways of craft and discipline to the new ways of building with AI. I architect ' +
    'resilient software the way I train: deliberately, without shortcuts.',
  // The same thought in a line or two, for a phone, where the full version would fill the screen.
  introShort: 'Engineering lead with a frontend core. Old ways of craft and discipline, new ways of building with AI.',
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

// The places you can land at in the flight, each one a section of the page with the same `id`.
// `file` and `command` are how the flight's landing panel prints it.
export const SECTIONS = [
  { id: 'about', file: 'about.md', command: 'cat about.md', place: 'the hall' },
  { id: 'experience', file: 'experience.log', command: 'git log --oneline --decorate experience.log', place: 'rune ridge' },
  { id: 'projects', file: 'projects/', command: 'ls -la ./projects/', place: 'the forge' },
  { id: 'contact', file: 'contact.sh', command: './contact --reach-out', place: 'the beacon' },
];

// The page below the hero is one flight path, and these are its waypoints in order. Skills is the
// only one with no place to land at in the flight.
export const ROUTE = [
  { id: 'about', title: 'About', sub: 'the pilot' },
  { id: 'experience', title: 'Experience', sub: 'the ascent' },
  { id: 'projects', title: 'Projects', sub: 'the destinations' },
  { id: 'skills', title: 'Skills', sub: 'the gear' },
  { id: 'contact', title: 'Contact', sub: 'next flight' },
];

// Handwritten in the margin of a waypoint, on screens wide enough to have a margin.
export const NOTES = {
  about: 'A journey through code, systems and curiosity.',
  experience: 'Higher, together.',
  projects: 'Side quests build better engineers.',
  contact: "Good people. Great projects. Let's fly.",
};

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

// Newest first, from the CV. `text` is the line always on the page. `report` is the field report a
// role unfolds into: where things stood, what I did, and what changed, each taken from the CV's own
// wording. `sketch` names the small interactive illustration that goes with a few of them. In the
// flight each entry becomes a rune stone along the shore, oldest first.
export const EXPERIENCE = [
  {
    hash: 'a1f09e2',
    years: 'Sep 2025 – now',
    role: 'Engineering Lead',
    company: 'HQ.xyz (Gnosis Business)',
    text:
      'Own the product vision and delivery of a major greenfield initiative. Designed the team\'s development ' +
      'process from scratch and lead the engineering unit, with the final say on UI and UX.',
    report: {
      situation: 'A major greenfield initiative at HQ.xyz, with the product vision and the delivery both in my hands.',
      contribution: [
        'Direct the product vision and its execution, working closely with stakeholders to keep the technical and business goals aligned.',
        'Designed and implemented the development process from scratch, and own the sprint cadence.',
        'Lead the engineering unit, and act as the final technical and aesthetic authority on UI and UX.',
      ],
      changed: ['The team delivers faster under the new process.', 'The product is held to a mobile-first, user-centred standard.'],
    },
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
    report: {
      situation:
        "HQ's frontend had been developed by a remote team. I joined as the first in-house frontend lead and took " +
        'charge of that codebase.',
      contribution: [
        'Introduced a scalable application architecture, adopted over time.',
        'Designed and built a component library on Atomic Design principles.',
        'Wrote an in-depth onboarding manual for the application.',
        'Built analytics tracking on APIs, shown in a Retool dashboard, to get around the Web3 constraints that block third-party JavaScript trackers.',
        'Proposed and shipped custom solutions, such as a feature to salvage funds from early multi-sig wallets.',
        'Ran sprint execution and resource allocation for the frontend team, and scoped features with stakeholders across departments.',
      ],
      changed: [
        'Feature iteration sped up, and the codebase stayed uniform and maintainable.',
        'Designers and developers got a shared language for new screens, and a consistent UI.',
        "New remote contractors needed less supervision, and the manual became the application's living reference.",
        'Funds that were typically lost, when multi-sig wallets were still new to Web3, were salvaged.',
        'The product team could see how users behaved.',
      ],
    },
    sketch: 'atoms',
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
    report: {
      situation: 'An inherited codebase, and an engineering team that had to be rebuilt from the ground up.',
      contribution: [
        'Recruited two local and four remote developers, and established a satellite office in Jakarta.',
        'Restructured the inherited codebase with Domain-Driven Design.',
        'Reworked a bulk crypto payroll system around Redis and worker threads, for parallel processing.',
        'Integrated AWS Key Management Service to protect wallets and sensitive data.',
        'Standardised coding practices with linters, formatters and other tooling, and introduced local and test blockchain networks.',
      ],
      changed: [
        'Less duplication, and faster development.',
        'Higher throughput for bulk payroll.',
        'Core services validated on local and test networks before release.',
      ],
    },
    sketch: 'payroll',
  },
  {
    hash: '9d5e7b4',
    years: 'Jun 2021 – Mar 2022',
    role: 'Senior Frontend Engineer',
    company: 'Finxflo',
    text:
      'Delivered core product features in a complex trading codebase, and made the order book fast enough for ' +
      'rapid updates with worker threads and the Canvas API.',
    report: {
      situation: 'A complex trading codebase, tight deadlines, and an order book that had to keep up with rapid updates.',
      contribution: [
        'Delivered core product features under tight deadlines.',
        'Optimised the trading order book with worker threads and the Canvas API.',
        'Worked with business stakeholders on requirements, and coordinated external vendors: email and SMS providers and SaaS platforms.',
        'Wrote interview materials and ran technical assessments for hiring.',
      ],
      changed: ['The order book kept up with rapid updates.'],
    },
    sketch: 'orderbook',
  },
  {
    hash: '3b6f0c1',
    years: 'Jan – Jun 2021',
    role: 'Frontend Engineering Manager',
    company: 'Hmlet',
    text:
      'Led four frontend engineers across two products, turning two siloed teams into one, and brought the team ' +
      'to adopt TypeScript and shared coding conventions.',
    report: {
      situation: 'Four frontend engineers across two products, working as two siloed teams.',
      contribution: [
        'Led the four engineers as one team.',
        'Introduced weekly sync-ups for knowledge sharing and brainstorming.',
        "Won the team's agreement to adopt TypeScript and standard coding conventions across both products.",
        'Worked with cross-functional stakeholders to define product requirements and shape roadmaps.',
      ],
      changed: ['Two siloed teams became one.', 'Morale and collaboration lifted.', 'TypeScript and shared conventions on both products.'],
    },
  },
  {
    hash: 'e2a47d9',
    years: 'Feb 2020 – Feb 2021',
    role: 'Senior Frontend Engineer',
    company: 'Hmlet',
    text:
      'Finished a property management platform against a tight launch date, and built a framework-agnostic ' +
      'design system proof of concept that the company later adopted.',
    report: {
      situation: 'A property management platform with a launch date. I joined mid-sprint.',
      contribution: [
        'Finished the platform under tight deadlines.',
        'Used a headless CMS to manage property listings and app content.',
        'Built and presented a framework-agnostic design system proof of concept, working with React, React Native, Vue and others on web and mobile.',
      ],
      changed: [
        'The platform launched on time.',
        'Listings and content needed less developer involvement.',
        'The design system was later adopted across the company.',
      ],
    },
  },
  {
    hash: '0a1c338',
    years: 'Oct 2016 – Feb 2020',
    role: 'Frontend Engineer',
    company: 'Horangi',
    text:
      'One of the earliest frontend hires. Shipped the flagship client-facing application on an accelerated ' +
      'schedule and introduced a headless CMS for the marketing pages.',
    report: {
      situation: 'One of the earliest frontend hires, with the flagship client-facing application on an accelerated launch schedule.',
      contribution: [
        'Shipped the flagship client-facing application.',
        'Contributed to public-facing apps and an internal tool, integrating several third-party SaaS products.',
        'Proposed and implemented a headless CMS for the marketing pages.',
      ],
      changed: ['The accelerated launch schedule was met.', 'Blog posts and resources could be published without a developer.'],
    },
  },
];

// The projects, written from each repository's own README and docs.
//   `prop`    the model that stands for the project beside the forge
//   `image`   `src` is the picture on the card and `full` the whole screenshot in the README;
//             `tall` marks a phone screenshot, which sits beside the README's text, not under it
//   `platform` a short platform and framework label for the project detail header
//   `screens` full screenshots for the detail gallery; `placeholder` marks an existing image
//             temporarily reused for a screen that still needs its own screenshot
//   `built`   contributions with their authoritative `text` and an optional `screenId`, caption
//             and highlight rectangle (left/top/width/height as percentages of the screenshot)
//   `diagram` drawn in place of a screenshot when there is none, with `glyph` as its short form on a card
//   `links`   only what a visitor can actually open; private repositories are left out
//   `demo`    the playable preview that goes with it, for the projects that have one
export const PROJECTS = [
  {
    id: 'hird',
    name: 'hird',
    title: 'Hird',
    path: './projects/hird',
    tagline: 'A desktop workspace where teams of AI agents research, plan and review work on your repository.',
    status: 'in active development',
    year: '2026',
    platform: 'Desktop · Electron',
    summary:
      'Hird connects a repository and its Linear tickets to one shared orchestration engine. You can chat with an ' +
      'assistant that knows the project, hand an investigation to a swarm of agents that research in parallel and ' +
      'then synthesise what they found, and turn tickets into reviewed plans. It is named after the Norse hird, a ' +
      "lord's household warband.",
    built: [
      {
        text: 'A desktop app in Electron, React and Mantine, with a sandboxed renderer and typed messaging to the engine.',
        screenId: 'agents',
        caption: "The desktop app, with the engine's status in the top right.",
        highlight: { left: 83.4, top: 0.4, width: 16.2, height: 4.6 },
      },
      {
        text: 'A separately runnable Mastra engine that runs agents through OpenRouter, with a scheduler, a concurrency cap and recovery after a restart.',
        screenId: 'agents',
        caption: 'The OpenRouter key and the models each role can use.',
        highlight: { left: 18.6, top: 27.6, width: 78.8, height: 26 },
      },
      {
        text: 'Research swarms of two to six agents, each with its own budget, optional web search and cited sources.',
        screenId: 'runs',
        caption: 'A research swarm: seats, budgets and cited sources. Temporary preview using the Agents screen.',
      },
      {
        text: 'Every run recorded with a live timeline, its result, and what it cost in tokens and dollars.',
        screenId: 'agents',
        caption: 'What the key has spent: today, this week, this month and all time.',
        highlight: { left: 19.2, top: 55.6, width: 39.8, height: 11.8 },
      },
    ],
    tags: ['typescript', 'electron', 'react', 'mantine', 'mastra', 'openrouter'],
    image: {
      src: '/projects/hird-card.webp',
      full: '/projects/hird.webp',
      alt: "Hird's Agents page, listing the model sources a team of agents can draw on and what each has spent.",
    },
    screens: [
      {
        id: 'agents',
        title: 'Agents',
        src: '/projects/hird.webp',
        alt: "Hird's Agents page, listing the model sources a team of agents can draw on and what each has spent.",
        caption: 'Model sources, the OpenRouter key and what it has spent.',
      },
      {
        id: 'chat-research',
        title: 'Chat & Research',
        src: '/projects/hird.webp',
        alt: "Temporary preview for Chat & Research: Hird's existing Agents page showing model sources and spend.",
        caption: 'The assistant that knows the project, mid-conversation.',
        placeholder: true,
      },
      {
        id: 'runs',
        title: 'Runs',
        src: '/projects/hird.webp',
        alt: "Temporary preview for Runs: Hird's existing Agents page showing model sources and spend.",
        caption: 'A research swarm: live timeline, result and cost.',
        placeholder: true,
      },
      {
        id: 'tickets',
        title: 'Tickets',
        src: '/projects/hird.webp',
        alt: "Temporary preview for Tickets: Hird's existing Agents page showing model sources and spend.",
        caption: 'A Linear ticket turned into a reviewed plan.',
        placeholder: true,
      },
      {
        id: 'approvals',
        title: 'Approvals',
        src: '/projects/hird.webp',
        alt: "Temporary preview for Approvals: Hird's existing Agents page showing model sources and spend.",
        caption: 'Approvals.',
        placeholder: true,
      },
    ],
    links: [],
    prop: 'shield-rack',
    demo: 'hird',
  },
  {
    id: 'flight-log',
    name: 'flight-log',
    title: 'Flight Log',
    path: './projects/flight-log',
    tagline: 'A paragliding logbook that records a flight on your phone with no signal, then replays it on a map.',
    status: 'internal alpha on Android',
    year: '2026',
    platform: 'Android · Expo',
    summary:
      "An Android-first paragliding journal. It records a flight from the phone's GPS and barometer with no account and " +
      'no connection, keeps the raw evidence, and afterwards replays the route on a map with altitude and speed. ' +
      'Flights can be exported as IGC files or shared with friends.',
    built: [
      {
        text: 'Offline-first recording with background location, and recovery of an interrupted flight when the app is reopened.',
        screenId: 'flight-replay',
        caption: 'The existing flight replay screen; recording screenshots will follow.',
      },
      {
        text: 'Replay on Mapbox maps with a moving pilot marker, an altitude chart, scrubbing and playback at up to 60 times speed, plus map areas you can download for use with no signal.',
        screenId: 'flight-replay',
        caption: 'A recorded route replayed on the map, with elapsed time, altitude and an altitude chart.',
      },
      {
        text: 'Deterministic IGC export, and shareable postcard images drawn from the recorded route.',
        screenId: 'flight-replay',
        caption: 'The existing flight replay screen; export and postcard screenshots will follow.',
      },
      {
        text: 'Optional sign-in on Supabase: private cloud backup that restores a logbook on a new phone, and a friends feed with shared flights and kudos.',
        screenId: 'flight-replay',
        caption: 'The existing flight replay screen; backup and friends screenshots will follow.',
      },
    ],
    tags: ['typescript', 'react-native', 'expo', 'supabase', 'mapbox'],
    image: {
      src: '/projects/flight-log.webp',
      full: '/projects/flight-log-screen.webp',
      tall: true,
      alt: 'A recorded flight replayed in Flight Log: the route drawn on a map, with elapsed time, altitude and an altitude chart.',
    },
    screens: [
      {
        id: 'flight-replay',
        title: 'Flight replay',
        src: '/projects/flight-log-screen.webp',
        alt: 'A recorded flight replayed in Flight Log: the route drawn on a map, with elapsed time, altitude and an altitude chart.',
        caption: 'A recorded flight: route, elapsed time, altitude and altitude chart.',
      },
    ],
    links: [{ label: 'source', url: 'https://github.com/xXValhallaCoderXx/paragliding-tracker' }],
    prop: 'wing-bag',
    demo: 'flight',
  },
  {
    id: 'sheetless',
    name: 'sheetless',
    title: 'Sheetless',
    path: './projects/sheetless',
    tagline: "A strength-training log that replaces the spreadsheet and knows what today's session is.",
    status: 'web app, with a native app being explored',
    year: '2026',
    platform: 'Web · React',
    summary:
      'Sheetless holds a training programme and shows the next session: the lift, the sets and reps, the effort to aim ' +
      'for and the top set to beat. It tracks estimated one-rep max as the weeks go by, so the planning a lifter ' +
      'would do in a spreadsheet is already done.',
    built: [
      {
        text: 'A web app on React, Mantine and Supabase.',
        screenId: 'next-session',
        caption: 'The next training session, with the prescribed sets, top set and estimated one-rep max.',
      },
      {
        text: 'A shared domain package for calendar and time-zone logic, with 25 assertions ported to check that it behaves the same on a phone as it does on the server.',
        screenId: 'next-session',
        caption: 'The existing session screen; calendar screenshots will follow.',
      },
      {
        text: 'A native spike in Expo that tests the plan for a phone app: the shared code bundled for Android, sessions stored encrypted on the device, and the design tokens carried over.',
        screenId: 'next-session',
        caption: 'The existing web session screen; native screenshots will follow.',
      },
    ],
    tags: ['typescript', 'react', 'mantine', 'supabase', 'expo'],
    image: { src: '/projects/sheetless.webp', alt: "Sheetless showing the next session: competition bench press, four sets of five, with the top set and estimated one-rep max." },
    screens: [
      {
        id: 'next-session',
        title: 'Next session',
        src: '/projects/sheetless.webp',
        alt: 'Sheetless showing the next session: competition bench press, four sets of five, with the top set and estimated one-rep max.',
        caption: 'Competition bench press: four sets of five, the top set and estimated one-rep max.',
      },
    ],
    links: [],
    prop: 'kettlebell',
    demo: 'sets',
  },
  {
    id: 'sentiment-hound',
    name: 'sentiment-hound',
    title: 'Sentiment Hound',
    path: './projects/sentiment-hound',
    tagline: 'Social-media sentiment analysis as a product, built by a pipeline of coding agents with a human merge as the final gate.',
    status: 'SaaS idea, ongoing',
    year: '2025 – 2026',
    platform: 'Web · Next.js',
    summary:
      'A SaaS idea for understanding what people say on social media. It analyses comments across platforms such as ' +
      'YouTube, Twitter and Instagram with AI models from Hugging Face, interprets the context behind a sentiment, ' +
      "aggregates the results into metrics, and can run the same analysis on a competitor's posts. The product is " +
      'at an early stage; most of the work so far is the engineering agent that builds it.',
    built: [
      { text: 'An engineering agent that takes a Linear ticket through planning, an isolated build, deterministic verification, browser checks and independent review, and ends in a draft pull request.' },
      { text: 'A Mastra control plane that owns that lifecycle in code: state, retries, worktrees and the verification gate. No model decides what runs next, or that the tests passed.' },
      { text: 'Claude Code and Codex as interchangeable workers in a sandbox. Every call is a fresh session, so the reviewer never sees the builder\'s conversation.' },
      { text: 'A console with an inbox of everything waiting on a human, and a batch queue that works through tickets two at a time.' },
      { text: 'The product itself as a Next.js web app with shared services and Playwright end-to-end tests.' },
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
    platform: 'Web · Phaser 3',
    summary:
      'My entry to an online hackathon with a game-development theme, built alone. A simple top-down combat RPG in ' +
      'Phaser 3, with React drawing the interface around it.',
    built: [
      { text: 'The game in Phaser 3, with characters and objects animated from sprite sheets.' },
      { text: 'An event-driven bridge between the game logic and the React interface, so neither reaches into the other.' },
      { text: 'A game loop tuned for smooth combat.' },
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
