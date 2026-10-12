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
- Landing at a place opens the same section the page shows. "Open on page" leaves the flight at
  that section; Escape, the exit button and the browser's back button leave it too.
- Phones, and visitors who ask for reduced motion, get a still image in the hero. The 3D code
  loads for them only if they choose to fly.

The host must serve `index.html` for `/fly` (a single-page-app rewrite), or a direct link to the
flight will 404.

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
