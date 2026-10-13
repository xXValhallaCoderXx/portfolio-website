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
- Each role unfolds in place into a field report, and a few carry a small interactive sketch.
  Beside the list, on a desktop, a live view of the flight's rune ridge goes to the stone of the
  role being read.
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
- Landing at a place opens the same section the page shows. "Open on page" leaves the flight at
  that section; Escape, the exit button and the browser's back button leave it too.
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
- `src/components/ProjectDetail.jsx`, `src/project.css`: the shared project reports; `ProjectPage`
  adds standalone page navigation. Layouts adapt to the available page or window width. Gallery
  images, captions and contribution highlights live in `PROJECTS` in `src/content.js`. Replace
  a screen's `src` and `alt` and remove `placeholder` when its real screenshot is available;
  highlights use percentages of the uncropped image. Runtime images belong in `public/projects/`.
- `src/game/`: the flight. `game.js` is the flight model, HUD, map and sound; `terrain.js` is the
  world; `scenery.js` is the sky, buildings and glider; `achievements.js` is progress and belts;
  `ridge.js` is the small live view of rune ridge on the page.
- `public/poster.jpg`: the still shown in the hero before the live scene loads.

## 3D models

Put a raw `.glb` export in `models-raw/`, then shrink it into `public/models/`:

```bash
npm run models
```

A model's file name is the name the scene loads it by, so keep them short and stable (`hall.glb`,
`pine-tree.glb`). Where each one stands is set in the `FURNITURE` table in `src/game/scenery.js`.
`concepts/` holds the images the models were generated from.

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
