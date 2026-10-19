# Authored floating islands — local QA

Candidate reviewed on 20 October 2026 (Singapore), based on
`e017b733c8ec58f13b9982a8a66ec283b0968f5e`, with all work uncommitted and unpushed.
Local production preview: <http://localhost:4191/good-lift?sky=1>.
No deployment was performed.

## Assets and authoring

The three supplied GLBs replace the earlier procedural island models. Raw sources remain
unchanged in the ignored `models-raw/` folder; optimized runtime files live in `public/models/`.

| Raw source | Runtime asset | Triangles | Runtime bytes |
| --- | --- | ---: | ---: |
| `rocky+alpine+island+3d+model.glb` | `island-alpine.glb` | 4,704 | 171,716 |
| `ruined+fortress+3d+model.glb` | `island-ruins.glb` | 4,827 | 174,116 |
| `rocky+island+ruins+3d+model.glb` | `island-split.glb` | 4,695 | 160,612 |

Rebuild only these runtime assets with:

```sh
npm run models -- island-alpine island-ruins island-split
```

This command runs offline during asset preparation. Application startup and normal builds
load/copy the optimized files without running the optimizer. Each asset has one matte material
and one embedded 512×512 JPEG colour texture. The optimizer removes normal and metallic/roughness
textures, preserves these low-poly meshes, applies Meshopt compression and normalizes island
bounds to a longest side of one unit, bottom Y=0 and centred X/Z.

The old procedural authoring script and its raw outputs were retired after backing them up in
`.artifacts/authored-islands/previous/`. The optimizer rejects duplicate sources targeting the
same runtime filename. Historical receipts describe the old assets and retain their original
evidence; the current assets are identified by SHA-256 in
`.artifacts/authored-islands/verification.json`.

## Verification

- Island and Nordic-sky acceptance: **6 tests passed, zero failures** using
  `node --import tsx --test src/adapters/rendering/islands.test.ts src/adapters/rendering/nordic-sky.test.ts`.
  Checks cover texture references and embedding, finite positions/UVs, valid triangle indices,
  material/download budgets, normalization, positive volume and substantial underside geometry.
  The tests exercise actual GLB geometry, progressive loading, bounded pools, reset and load failure.
- The authored-asset gate accepts embedded PNG/JPEG textures up to 1024 px and reports topology
  diagnostics. It no longer assumes the former generator's mesh names or perfectly sealed details.
  These exports have 0/1/1 boundary edges and 12/2/12 non-manifold edges for alpine/ruins/split;
  visual inspection found no large holes or missing backs.
- `npm run typecheck`, `npm run check:architecture`, `npm run build`,
  `npm run build:functions`, `npm run check:split` and `git diff --check` passed.
  Built `dist/models/` copies match the three optimized sources byte for byte.
- Compared with the preceding architecture-refactor receipt, only the optimizer and island test
  changed among retained source files, and the procedural generator was removed. All **139**
  checked domain, storage, replay-fixture and function source files remain byte-identical.
  Simulation 3, fingerprint `b9dd2bdb` and recording format 2 are unchanged.
  The earlier full **897-test** result belongs to that preceding candidate; this asset follow-up
  reruns focused asset/rendering checks and all builds/type/architecture gates.

Browser review uses Chromium 143 with desktop and emulated phone viewports. Twelve raw views
and fifteen optimized runtime views cover front, back and underside, plus Nordic formations
at 1000×760 and 390×844 with bloom disabled. The actual scenery loader decodes all assets and
requests each island once per context, with HTTP 200 responses and zero page/console errors.
Progressive loading and bounded pools passed sixteen altitude/seed cycles. The split bridge's
gap is visible from front/back; the existing early placement faces it end-on from the arena.

The production Good Lift page also passed at 1280×800 and touch-emulated 390×844. All three
responses matched the optimized asset hashes, all models reached ready, hero pools stayed at
three (two with bloom disabled), and returning to the fjord or retrying cleared prior islands.
Both in-game bloom-disabled compositions were reviewed with zero page/console errors. The
flight stayed held at zero run steps with no recording or score submitted. The direct retry
fixture primes presentation time before resetting it; capture-only CSS hides launch overlays.

Reproducible browser scripts, captures, render measurements and command logs are under
`.artifacts/authored-islands/`. `runtime-visual.json` records adapter-level checks; the production
smoke receipt records the separate in-game review. Held altitude/camera inspections are visual
sandboxes and do not submit scores. Physical-device performance and hosted acceptance remain
separate from these local checks.
