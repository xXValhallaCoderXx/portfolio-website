# Portfolio navigation and job-page QA

The [architecture refactor receipt](architecture-refactor-qa.md) records the current TypeScript
structure, production preview and verification. The candidate details below are historical.

Date: 2026-10-19. Local working-tree candidate based on
`02fc7bccb97e266904f85fd815d54469bf1c7941`.

Original navigation source SHA-256: `bb82e1dfe89e62be71edee27ae2cc259eedd42e06e6693bd098bb26dcb8454bf`.
The eleven source files and their individual hashes are recorded in
`.artifacts/portfolio-navigation/candidate.json`; this receipt is excluded from the source hash.

## Delivered behavior

- Mobile navigation uses a Menu disclosure and a persistent fly.sh entry, including touch landscape. Section links have 48px targets and the panel scrolls vertically on short screens. Desktop retains its tabs.
- Menu selection, outside clicks, Escape, history navigation and switching to desktop close the panel. Escape restores trigger focus; section selection focuses its heading below the fixed header.
- The caption beneath the hero buttons and every section-heading flight shortcut are removed. The project-detail forge link is removed. Main fly.sh entries and flight guidance remain available.
- All seven job cards and mobile list rows open `/experience/:hash`. Dedicated pages retain the existing report copy and all three interactive sketches, with normal page scrolling.
- Back restores the originating card, scroll position and mobile ridge/list view, including after a reload. Direct job links return to Experience. Existing project links and galleries continue to work.
- Flight landings open the same job content in a Sheet. Leaving while airborne returns to the originating page; opening a landed section goes to that homepage section, including after taking off from a job page.

## Automated gates

Environment: Node v24.21.0, Vite v8.3.4, headless Chromium via Playwright 1.57.
Touch checks use browser emulation and native CDP touch input. Flight rendering uses SwiftShader.

| Check | Result | Evidence |
| --- | --- | --- |
| `npm test` | 822 passed, 0 failed | `test.log` |
| `npm run build` | Passed | `build.log` |
| `npm run check:split` | Passed; game modules remain behind the existing split | `split.log` |
| Responsive browser checks | All seven jobs at six sizes passed | `browser.json`, `browser.log`, `check.mjs` |
| Real flight landings and reading sheets | Passed | `flight.json`, `flight.log`, `flight-check.mjs` |
| History, menu resize, short viewport, invalid addresses and motion settings | Passed | `extended.json`, `extended.log`, `extended-check.mjs` |
| Reloaded mobile list and airborne exit to job | Passed | `return.json`, `return.log`, `return-check.mjs` |
| `git diff --check` | Passed | Local command |

Evidence paths in the table are relative to `.artifacts/portfolio-navigation/`.
The aggregate receipt is `qa.json`; scripts, logs and screenshots are local ignored artifacts.

## Browser acceptance

Viewports: 320×740, 390×844, 760×1024, 844×390, 1024×768 and 1440×1000.
The final matrix covers 42 job-page visits, with 16 menu, overview and report screenshots.

Verified: no horizontal document or header overflow; native swipes in both directions followed by a tap; older/newer controls; mobile list links; modified-click new tabs; browser Back/Forward; deep-link reloads and trailing slashes; origin focus and scroll restoration; menu keyboard operation; invalid-job 404 behavior; ordinary motion and reduced motion.

All three sketches respond to their controls, including real worker updates in the order book.
Project galleries, onward links, and nested galleries over flight sheets pass. Job sheets trap and restore focus and isolate keys from the flight. All browser checks recorded zero page errors.

The existing simulation, fingerprint, recordings and saved-data formats retain their versions;
this change touches frontend presentation and navigation only.

## Local review

Preview: http://localhost:4187/

Example job: http://localhost:4187/experience/7c3b91a

The preview serves the tested production build. Physical-device acceptance and deployment remain separate.

## Route endpoint correction — 2026-10-19

Current frontend source SHA-256: `61645555fef04ebf8aee54b75b514170873eaf9e33bd3121a5136ef7df4a1f17`.
This follow-up changes `src/components/Route.jsx` from the navigation candidate above.

The route now measures where its final node rests at maximum document scroll instead of
capping the glider at 80% of the viewport height. The previous desktop gap was about 58px
at 1440×1000 and 138px at 1440×1400. The animation also uses a positive frame step when
scrolling resumes, preventing an older frame timestamp from reversing its motion.

Fresh browser checks passed at 1440×900, 1440×1000, 1440×1400, 1920×1080, 1024×768,
390×844, 320×568 and 844×390, each with ordinary and reduced motion (16 cases).
At the bottom, every case finishes within one pixel of the final marker, fills the entire
cyan line, selects Contact and shows 0m in the route readout. Forward progress, reverse
scrolling, responsive reflow and return from a job detail page pass, with zero page errors.
Resize checks scroll to the new document end after the overview finishes changing layouts.

`npm run build`, `npm run check:split` and `git diff --check` pass for this follow-up.
The earlier 822-test result above belongs to the original navigation candidate.
Evidence, before/after screenshots, scripts and source hashes are in
`.artifacts/route-endpoint/`; its `qa.json` identifies the tested production build.
The local preview remains http://localhost:4187/.
