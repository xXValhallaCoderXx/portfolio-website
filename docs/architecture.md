# Application architecture

All authored application, simulation, worker, function, test and tool code is TypeScript.
Shared compiler settings are strict and browser code rejects unused locals; separate browser, worker, Node and test configurations
check the APIs available in each environment. Bundling still uses Vite and its single React root.

## Ownership and dependencies

`app` composes the application and owns URL/history transitions. Features own their pages,
components, hooks and services. A feature component renders props; its hook owns React lifecycle,
DOM interaction and subscriptions; its service owns cohesive operations and state transitions.
Services use explicit input/output models and small ports where environment access is needed.

Only UI reused across features belongs in `components`. Atoms include buttons, external links
and terminal lights. Molecules compose them into breadcrumbs, window headers and sheets. Shared
hooks cover reusable interaction such as focus restoration and keyboard dismissal. These modules
cannot import a feature, the app or a domain. Project-specific galleries and demos remain in
`features/projects`; career reports and sketches remain in `features/experience`.

Domains own plain models and rules:

| Domain | Responsibility |
| --- | --- |
| `portfolio` | Content, project/experience lookup and display data |
| `flight` | Physical solver, controls, atmosphere, terrain and landing rules |
| `coaching` | Observations, instruction acceptance, thermal guidance and recovery |
| `good-lift` | Fixed-step run, sky, meet, recording/replay, competition and board rules |
| `progression` | Normalization, achievements, rewards, kit and saved-progress transforms |

Domains cannot import app/features/shared UI/adapters, React, Three.js or Node modules. Time,
randomness, scheduling and hashing enter through parameters or ports. Browser storage and its
blocked-storage fallback live in `adapters/browser`; audio and rendering live in their adapters.
The world-board identity adapter uses WebCrypto in both browser and Node, with its digest
injected into the plain identity rule. Import and environment checks enforce these boundaries.

## Flight lifecycle and lazy loading

`features/flight/components/Fjord.tsx` connects its lifecycle hook to the flight session service.
The session coordinates input, fixed steps and presentation. Dedicated adapters own the scene,
camera and WebAudio; presentation helpers sample snapshots without changing simulation state.
Section renderers are injected from app composition, so flight does not import the application.

The outdoor session dynamically imports `good-lift-session.service.ts` at one entry. Good Lift's
result and kit UI, run-only rules, board networking and voices remain behind that entry. Optional
livery and helmet implementations remain lazy. The source graph and production bundle checks
both enforce this split; they classify modules by ownership rather than a filename list.

The function build bundles the same fixed-step run and replay domains with the server HTTP/store
adapter and crypto implementation. It rejects browser, React and Three.js dependencies.

## Compatibility and verification

This refactor changes ownership and contracts without changing URLs, keyboard/focus behavior,
flight numeric operations or fixed-step ordering. Simulation version **3**, fingerprint
**`b9dd2bdb`**, recording format **2**, storage keys and persisted data remain unchanged.
There are no old-path reexports or migration readers. Historical source paths inside captured
browser fixtures remain intact because they describe the artifact originally captured.

Run from the repository root:

```sh
npm ci
npm --prefix functions ci
npm run verify
```

`verify` checks all four TypeScript environments, import/environment boundaries, all behavioral
tests (including opening/recovery and server replay), both builds and production bundle splits.
Tests stay beside their owner. Reuse acceptance helpers under `src/test/helpers`; compare the
committed Chromium fixtures without regenerating them. `npm run dev -- --host 0.0.0.0 --port 4190`
starts a local review server. Physical-device acceptance and deployment remain separate gates.
