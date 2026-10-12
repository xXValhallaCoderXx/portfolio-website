# portfolio-website

A terminal-styled portfolio with a flight in its hero: visitors can scroll the page as usual, or
steer a paraglider over a night fjord and land at the place for each section.

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm run build` writes the static site to `dist/`.

## How the page and the flight fit together

- The page is the website. The fjord idles behind the hero and takes no input.
- `[ ./fly.sh ]`, the `fly.sh` tab or a section's "fly to" link starts the flight. It fills the
  window, locks page scrolling and moves the address to `/fly`.
- The swap in either direction plays behind a short warp of star streaks.
- In flight, Shift speeds time up. Clicking a place's pillar or label makes the glider fly itself
  there, and steering takes control back.
- Landing at a place opens the same section the page shows. "Open on page" leaves the flight at
  that section; Escape, the exit button and the browser's back button leave it too.
- Phones, and visitors who ask for reduced motion, get a still image in the hero. The 3D code
  loads for them only if they choose to fly.

- Any other address is a missing page, and gets an emergency of its own: the wing collapses and the
  visitor either throws the reserve in time and lands in a tree, or does not and is fished out of
  the fjord by the longship. The way home is on screen from the first moment. The story is in
  `src/game/lost.js`.

The host must serve `index.html` for every address (a single-page-app rewrite), or direct links to
the flight and to missing pages will show the host's own error page instead.

## Where things live

- `src/content.js`: everything a visitor reads. The page and the flight both draw from it.
- `src/App.jsx`, `src/components/`, `src/styles.css`: the page.
- `src/game/`: the flight. `game.js` is the flight model, HUD, map and sound; `terrain.js` is the
  world; `scenery.js` is the sky, buildings and glider; `achievements.js` is progress and belts.
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
and rewrites addresses to `index.html` for `/fly` and the missing-page flight. It caches Vite's
hashed bundles for a year; HTML, models and images revalidate because their filenames stay the
same when their contents change.

Serve the optimized GLBs from the same Firebase Hosting site at `/models/*.glb`. They are small,
self-contained files with embedded textures and already use Meshopt compression. A separate
storage bucket or model CDN is unnecessary for this site.

Install the [Firebase CLI](https://firebase.google.com/docs/cli), sign in with `firebase login`,
and create or choose a project in the [Firebase console](https://console.firebase.google.com/).
The committed config is ready to use; there is no need to run `firebase init` or add a Firebase
SDK to the app. Replace `YOUR_PROJECT_ID` below with the project's ID.

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
firebase hosting:channel:deploy prelaunch --project YOUR_PROJECT_ID
firebase deploy --only hosting --project YOUR_PROJECT_ID
```

Firebase Hosting includes a [global CDN and usage quotas](https://firebase.google.com/docs/hosting/usage-quotas-pricing).
Monitor data transfer as traffic grows; move models to separate storage only if their size or
release workflow warrants it.
