# portfolio-website

## Fjord glider (prototype)

An interactive hero piece: fly a paraglider over a night fjord and land at the lit places to read
each section of the portfolio.

```bash
python3 -m http.server 4173 --directory glider
```

Then open http://localhost:4173. There is no build step; Three.js loads from a CDN.

Generated 3D models go through one step before the page uses them. Put the raw `.glb` export in
`glider/assets/`, then shrink it into `glider/models/`:

```bash
cd glider/tools && npm install && npm run models
```

A model's file name is the name the scene loads it by, so keep them short and stable (`hall.glb`,
`pine-tree.glb`). Where each one stands is set in the `FURNITURE` table in `glider/src/scenery.js`.

- `glider/assets/`: raw model exports (large, not loaded by the page)
- `glider/models/`: web-ready models produced by the step above
- `glider/concepts/`: concept images used to generate the models
- `glider/src/content.js`: section copy, achievements and belt order
- `glider/src/terrain.js`: the world (fjord shape, landing places, rune stones, thermals)
- `glider/src/scenery.js`: sky, buildings and the glider model
- `glider/src/main.js`: flight model, HUD, map and sound
