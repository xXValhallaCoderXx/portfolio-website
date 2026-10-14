# portfolio-website

A terminal-styled portfolio with a flight in its hero: visitors can scroll the page as usual, or
steer a paraglider over a night fjord and land at the place for each section.

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm run build` writes the static site to `dist/`.

## How the page and the flight fit together

- The page is the website. The fjord idles behind the hero; its glider can be pulled about with
  the mouse and swings back when let go, but nothing there is needed to use the page.
- "Take-off", at the foot of the hero, is the way in to the route: clicking it scrolls to the
  first section. On a phone the hero stops short of the window so that it shows.
- Below the hero the page is one flight path with a waypoint per section. A small glider follows
  the path as the page scrolls, and the top bar counts its height down. Scrolling is never taken
  over. As the hero scrolls away the fjord's camera climbs until the scene reads as a map, and
  the path starts where the glider hangs.
- On a phone, Experience reads one career camp at a time: pick from the compact ridge or list,
  use Older/Newer or swipe the summary, then explore the report a section at a time. It starts
  at the current role with its chapter closed, and keeps reading mode when changing camps.
  Desktop keeps a career list with summaries/titles controls and Report/Behind tabs. The existing
  rune ridge and live view follow the role being read. Both layouts use the same career reader
  in the page and flight panels; sketches run only while their Behind tab is visible.
- Three projects have a playable preview: a scripted model of what the product does, never the
  product itself. Each project also has its own address, `/projects/<id>`, with the full report.
- Project reports use a screenshot-led header and a selectable contribution tour. Screens open
  in a gallery with arrow-key navigation and Escape to close; the phone layout uses numbered
  contribution buttons and a compact stage selector for Hird's sample run.
  The project pages and the reading windows in `fly.sh` use the same detail component. Escape
  closes the gallery first, then the project window, leaving the visitor at the forge.
- `[ ./fly.sh ]`, the `fly.sh` tab or a section's "fly to" link starts the flight. It fills the
  window, locks page scrolling and moves the address to `/fly`.
- The swap in either direction plays behind a short warp of star streaks.
- In flight, `[ h: controls ]` at the top right lists every key. Shift speeds time up. Clicking a place's pillar or label makes the glider fly itself
  there, and steering takes control back.
- Space, ↓ and S (▼ on a touch screen) are one brake that goes deeper the longer it is held. A
  fifth of a second in it is light: the wing slows to where it sinks least and turns a circle of
  about 8 m instead of 14. Held on, it goes deep (after about half a second over the fjord, eight
  seconds in a Cloudbase run): slow and steep, the way down into a ring. A meter under the hint
  shows it; red grows in from the right as the wing nears a stall, and letting go of the key for
  a fifteenth of a second (70 ms) returns a deep brake to a light one. Held into the red the wing stalls, and in a turn it spins toward
  the inside wing; it recovers by itself, sooner with the brake let go. Over the fjord a stall is
  short and cheap and cannot begin near the ground. ↑ or W is the speed bar: hands up, faster,
  sinking more and turning wider.
- Landing at a place opens the same section the page shows. "Open on page" leaves the flight at
  that section; Escape, the exit button and the browser's back button leave it too.
- A manual landing briefly shows distance from the centre, a grade, points and the best distance
  for that place. Accuracy supplies 95 points and a soft arrival supplies up to five more.
  Map travel, automatic flight and "fly me to next" do not score, including after taking control
  back. A fresh manual takeoff starts a new scoring leg. Light approach wind is shown by each
  windsock; the forge floats you longer, rune ridge has lee-side sink, and the beacon is a small island.
- Cloudbase is an optional altitude game through the glowing east-shore arch: turn hard right
  for roughly two seconds after launch, then glide east through it. After discovery, the map
  and menu offer direct entry. The amber column beyond the arch lifts you clear of the hillside
  and then wears out. After that the lift is hidden: a flock of ravens circles inside each live
  thermal, so find the birds, fly to them and climb beside them. Sparks and the core ring show
  only from close by. Two thermals are alive at a time; each fades with use and with age, and
  when it dies its ravens fly on to the next, where the lift starts as they arrive. Turn the way
  the ravens turn: touching one collapses the wing, which costs about 60 m and a moment of
  steering, and then no bird can strike for a few seconds. Storm clouds drift through in layers
  from about 580 m, thicker higher up. Inside one there is no lift, the wing sinks and the view
  greys out until you fly clear, so a cloud over a thermal caps it for a while. Only the rising
  fog, the ground or quitting ends a run. Each run draws a new sky from its own seed, and the
  same seed always gives the same sky. The 500/1,000/1,500 m rings are visual milestones.
  A breeze of 2-4 m/s blows through the run, the wind that carries that height's storm clouds,
  so it turns as you climb; it carries the glider, and rising air shelters a pilot from two
  thirds of it. Every 16-26 s a gust band crosses the zone, drawn as a curtain of bright streaks
  well before it arrives; it adds 3-5.5 m/s for a few seconds and pushes a circling pilot off the
  core. A front that reaches a braked wing from behind takes airspeed away and can tip a deep
  brake into a stall, so the hint says to ease off when one is near. Above 260 m a stall in a run
  costs about as much height as a raven strike; easing the brake once a circle keeps it light.
  Altitude is measured above sea level. A run lasts about two and a half minutes; peak, personal
  best, raven strikes and time in cloud appear at the end, with one-click retry. Landing at a
  portfolio place opens its content immediately, with the run result inline. Map travel and page
  exit also save the run. The map pauses movement, fog, ravens, clouds and thermal exhaustion
  together; time boost is switched off in a run, because a raven at three times the speed gives
  no warning. Escape ends a run, R retries, and the existing sound switch controls vario, wind,
  fog rumble, raven calls and the sounds of the wing stalling and of a gust going over. Scores
  and discovery are saved locally; Reset progress clears them. The result counts raven strikes,
  stalls and time in cloud. Music and a shared leaderboard are deferred. Cloudbase uses the same
  keyboard and touch controls as flight, except that on a touch screen the » button is a second
  brake in a run, so the four buttons sit as two pairs, one under each thumb.
- Phones, and visitors who ask for reduced motion, get a still image in the hero. The 3D code
  loads for them only if they choose to fly.
- In an upright window the hero is two bands, the scene above the words, so the glider is never
  behind the headline. In any small window the top bar is one row and the hero says less. The
  rules are together at the end of `src/styles.css`, under "small windows".
- On a touch screen the flight shows as little as it can: a line of readouts, a map button and a
  menu, and round buttons to fly with. Key names are left out of every button there.

- Any other address is a missing page, and gets an emergency of its own: the wing collapses and the
  visitor either throws the reserve in time and lands in a tree, or does not and is fished out of
  the fjord by the longship. The way home is on screen from the first moment. The story is in
  `src/game/lost.js`.

The host must serve `index.html` for every address (a single-page-app rewrite), or direct links to
the flight, to a project and to missing pages will show the host's own error page instead.

## Where things live

- `src/content.js`: everything a visitor reads. The page and the flight both draw from it.
- `src/App.jsx`: the top bar, the hero, and which of the page, a project or the flight is showing.
- `src/components/Route.jsx`, `src/route.css`: the flight path and its waypoints.
  `Sections.jsx` is what each waypoint holds, and what a landing in the flight shows.
- `src/components/demos/`, `src/components/sketches/`, `src/demos.css`: the playable previews on
  the projects and the sketches in the field reports.
- `src/components/Experience.jsx`, `src/experience.css`: the shared career reader. It adapts to
  its container width and reads roles, reports and sketch names from `EXPERIENCE` in `src/content.js`.
- `src/components/ProjectDetail.jsx`, `src/project.css`: the shared project reports; `ProjectPage`
  adds standalone page navigation. Layouts adapt to the available page or window width. Gallery
  images, captions and contribution highlights live in `PROJECTS` in `src/content.js`. Replace
  a screen's `src` and `alt` and remove `placeholder` when its real screenshot is available;
  highlights use percentages of the uncropped image. Runtime images belong in `public/projects/`.
- `src/game/`: the flight. `game.js` runs it: input, HUD, map and sound; `terrain.js` is the
  world; `scenery.js` is the sky, buildings and glider; `achievements.js` is progress and belts;
  `landing.js` scores a landing, `approach.js` is the wind at each place (and the breeze the
  streaks draw over the fjord) and `gateway.js` the arch. `flight.js` is how the glider flies:
  airspeed and sink, the brake, the speed bar, the stall and gusts, with no 3D code, so tests fly
  it; `stall-effects.js` is what a stall does to the wing and camera and what the brake meter
  shows; `fjord-hints.js` picks free flight's line of advice; `wind-streaks.js` draws the wind.
  `cloudbase-state.js` is a Cloudbase run (seeded thermals, ravens, storm clouds, wind, gusts and
  fog) with no 3D code, so `npm test` can fly it; `cloudbase.js` and `ravens.js` draw that run;
  `run-effects.js` is what a run does to the wing, the picture and the camera;
  `cloudbase-hints.js` picks its one line of advice. `lost.js` is the missing page and `ridge.js`
  the small live view of rune ridge on the page.
- `public/poster.jpg`: the still shown in the hero before the live scene loads.

## 3D models

Put a raw `.glb` export in `models-raw/`, then shrink it into `public/models/`:

```bash
npm run models
```

A model's file name is the name the scene loads it by, so keep them short and stable (`hall.glb`,
`pine-tree.glb`). Where each one stands is set in the `FURNITURE` table in `src/game/scenery.js`.
`concepts/` holds the images the models were generated from.

The optimizer maps the new generator filenames to `windsock.glb`, `gateway.glb`, `raven.glb`
and `clouds.glb`. To process just these sources, run `npm run models -- windsock gateway raven clouds`.
The windsock and gateway load with the fjord. The raven and the storm cloud load the first time
a Cloudbase run starts, with simple stand-ins drawn until they arrive. The raven's file has a
skeleton but no animation, so its wingbeat is posed in code (`src/game/ravens.js`); it is drawn
about three and a half times life size and lit a little, because a real raven at 200 m against
a night sky is four dark pixels.
Run `npm test` for the scoring, progress, gateway, flight and Cloudbase checks. The Cloudbase
tests include reference pilots that fly whole runs on `flight.js` in the run's own wind, with
their hands up or circling on the brake, which catch a large shift in how hard the game is: if a
tuning table in `cloudbase-state.js` or `flight.js` changes, they say whether 1,000 m and 1,500 m
are still roughly where they were. The measured numbers are in a comment beside that test.

`concepts/` and `models-raw/` are local source folders, ignored by Git and unused by the production
build. Back them up separately if you want to regenerate or edit the models later. Keep
`public/models/`, `public/projects/` and `public/poster.jpg` in Git: Vite copies these runtime
assets into `dist/`, so a fresh checkout can build without the raw sources. `npm run models` is
an optional authoring step, not part of deployment.

For a checkout that already tracks the source folders, stop tracking them once with
`git rm -r --cached -- concepts models-raw`. This preserves the local files; it does not remove
them from older commits.

## Firebase Hosting

This is a static Vite app. `firebase.json` deploys only `dist/`, rebuilds before `firebase deploy`,
and rewrites addresses to `index.html` for `/fly`, `/projects/<id>` and the missing-page flight. It caches Vite's
hashed bundles for a year; HTML, models and images revalidate because their filenames stay the
same when their contents change.

Serve the optimized GLBs from the same Firebase Hosting site at `/models/*.glb`. They are small,
self-contained files with embedded textures and already use Meshopt compression. A separate
storage bucket or model CDN is unnecessary for this site.

Install the [Firebase CLI](https://firebase.google.com/docs/cli) and sign in with `firebase login`.
This repository targets [`renate-gouveia-portfolio`](https://console.firebase.google.com/project/renate-gouveia-portfolio/overview)
through `.firebaserc`. The config is ready to use; there is no need to run `firebase init` or add
a Firebase SDK to the app.

To check the built site locally with Firebase's routing and headers:

```bash
npm ci
npm run build
firebase emulators:start --only hosting --project demo-portfolio
```

Open http://localhost:5000 and check `/`, a direct visit and refresh at `/fly`, an unknown address,
project images, and the 3D models. The `demo-` project ID keeps this local check independent of a
real Firebase project.

To publish a temporary preview, then deploy the live site after reviewing it:

```bash
npm run build
firebase hosting:channel:deploy prelaunch --project renate-gouveia-portfolio
firebase deploy --only hosting --project renate-gouveia-portfolio
```

### Automatic deployment from GitHub

After `.github/workflows/firebase-hosting.yml` is merged, every push to `main`, including a merged
pull request, starts the **Deploy portfolio** workflow. It installs dependencies with `npm ci`,
authenticates to Google Cloud, and runs `firebase deploy --only hosting`. The predeploy hook
builds `dist/`; a failed build stops the deployment.

Follow the run in [GitHub Actions](https://github.com/xXValhallaCoderXx/portfolio-website/actions/workflows/firebase-hosting.yml).
A successful run publishes the site at https://renate-gouveia-portfolio.web.app. To deploy again
manually, open **Actions → Deploy portfolio → Run workflow** and select `main`.

GitHub authenticates using [Workload Identity Federation](https://github.com/google-github-actions/auth),
which issues temporary credentials. The configured provider accepts only this repository's
`firebase-hosting.yml` workflow on `main`, triggered by `push` or `workflow_dispatch`. The
`github-hosting-deploy` service account has Firebase Hosting Admin and API Keys Viewer roles
in `renate-gouveia-portfolio`. This setup uses no service-account keys or repository secrets.

The Google Cloud provider is
`projects/194838900506/locations/global/workloadIdentityPools/github-actions/providers/portfolio-main`.
Its repository and owner conditions use GitHub's numeric IDs. If the repository moves to a new
owner or the workflow is renamed, update the provider's conditions as well as the workflow.

Firebase Hosting includes a [global CDN and usage quotas](https://firebase.google.com/docs/hosting/usage-quotas-pricing).
Monitor data transfer as traffic grows; move models to separate storage only if their size or
release workflow warrants it.
