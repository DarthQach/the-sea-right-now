# AGENTS.md

Instructions for the next agent working in this repository. This is the single
instruction file; `CLAUDE.md` only points here.

## What this is

**The Sea, Right Now** renders the actual ocean, live. A 3D globe of NOAA NDBC
buoys; click one and the page draws that patch of water from the wave height,
period, direction and wind that buoy is reporting right now, and synthesises the
sound of it from the same numbers. Free, no accounts, deployed at
<https://sea.vicaai.dev>.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with the Worker running in real `workerd` (port 5173) |
| `npm run build` | Production build to `dist/client` and `dist/the_sea_right_now` |
| `npm run preview` | Runs the build output locally in the Workers runtime |
| `npm run deploy` | `build` then `wrangler deploy` (uses the generated `dist/.../wrangler.json`) |
| `npm run lint` | ESLint over the whole repo |
| `npm run typecheck` | The three `tsc --noEmit` projects, in parallel |
| `npm run verify` | The fast gate — see **Verification** |
| `npm run smoke` | The journey gate — see **Verification** |
| `npm run verify:all` | Everything, plus the production build |
| `npm run smoke:webgpu` | The opt-in WebGPU project — slow, excluded from `smoke` |
| `npm run snapshot:stations` | Regenerates `src/data/stations.snapshot.json` from NDBC |
| `node scripts/build-land-outline.mjs` | Regenerates `src/data/land-110m.json` from Natural Earth |

## Stack

| Piece | Where it lives |
|---|---|
| React 19 UI — panels, readout, spectrum plot, controls | `src/app` |
| The composition root: routing, data, every panel's state | `src/app/App.tsx` |
| One canvas and one renderer, hosting both worlds | `src/app/components/SceneStage.tsx`, `src/scene/SceneHost.ts` |
| The sea world — camera, sky, ocean | `src/scene/SeaWorld.ts` |
| The globe world — sphere, pins, picking | `src/scene/GlobeWorld.ts`, `src/scene/globe` |
| Ocean — FFT (WebGPU compute, TSL) and Gerstner fallback | `src/scene/ocean` |
| Web Audio graph — both sonification mappings | `src/audio` |
| Shared logic — spectrum maths, geography, URL state, storage | `src/lib` |
| Types shared verbatim with the Worker | `src/lib/shared/types.ts` |
| Cloudflare Worker — routes, NDBC parser, caching, rate limiting | `src/worker` |
| Bundled station index and coastline outlines, imported at build time | `src/data` |
| Static files served as-is | `public` |
| Unit tests (Vitest) | `tests/unit` |
| Worker tests (Vitest inside workerd) | `tests/worker` |
| Journey tests (Playwright) | `tests/smoke` |

Hosting is one Cloudflare Worker serving both the static bundle and `/api/*`.
There is no database. The only persistence is `localStorage` in the visitor's
browser.

## Conventions

- **Dark only.** There is no light theme; panels always sit over rendered water.
- Hand-written CSS with custom properties, one stylesheet. No CSS framework.
- No state-management, UI-component, CSS, audio, globe or charting library. Each
  was considered and ruled out; the pieces are small enough to write directly.
- All user-facing copy is in English.
- Numeric surfaces use `font-variant-numeric: tabular-nums` so the readout does
  not shift horizontally when digits change.

## Routes

Every one is reachable by direct URL, which is what lets a journey be entered at
any point and what makes a shared link work.

| URL | What it is |
|---|---|
| `/` | The globe. Also the landing state. |
| `/?station={id}` | One station's water. The shareable unit. |
| `/?station={id}&mode=literal\|tuned` | The same, opening in that sonification. |
| `/?station={id}&forceWebGL=1` | The same, on the reduced renderer. Every smoke test uses this. |
| `/?about=1` | The about-and-attribution panel, over whatever is behind it. |
| `/?station={id}&simulateOutage=1` | Loads normally, then induces one real fetch failure so the data-problem banner can be reached on demand. The retry succeeds. |
| `/?station={id}&forceThrottled=1` | Forces the deliberate low-power rendering mode. |

`GET /api/stations` and `GET /api/station/:id` are the only endpoints. Both are
public reads; there is no write path and no authentication anywhere.

## Things that will surprise you

- **`MM` in NDBC data means missing, and must map to `null`** — never to `0`.
  Mapping it to zero renders a flat sea and reports a measurement nobody took.
  It is the single most damaging parsing bug available in this project, and
  there is a unit test whose whole job is to catch it.
- **WebGL 2 has no compute shaders**, so the FFT ocean cannot run there.
  three.js's `WebGPURenderer` falls back to WebGL 2 automatically and that covers
  the interface, the globe and the readout — but the ocean needs its own second
  implementation (Gerstner sum-of-sines, same `SpectrumParams` input).
- **`ShaderMaterial`, `RawShaderMaterial` and `EffectComposer` do not work on the
  WebGPU path.** Node materials and TSL only. Most three.js example code online
  targets the WebGL renderer and will not port directly.
- **NDBC sends no CORS headers.** The page can never fetch it directly; every
  reading goes through the Worker.
- **NDBC updates roughly hourly**, most data around 25 minutes past the hour.
  Never imply second-by-second freshness in the interface.
- **The in-Worker rate limiter is per-isolate and therefore approximate.** It is
  defence in depth. The hard limit is a Cloudflare Rate Limiting Rule configured
  in the dashboard.
- **The `poseidon` repository declares no licence.** Read it; do not copy it. The
  ocean is implemented from the published papers.
- **The spectrum has two components, not one.** A single JONSWAP peak at the
  reported dominant period renders a literal mirror on a swell day — 1.2 m at
  15 seconds is a surface slope of about 0.003. NDBC publishes the swell and
  wind-sea split in the `.spec` file; it is estimated from wind speed elsewhere.
- **The FFT cascade patch sizes are 1024 m, 96 m and 12 m.** A patch cannot carry
  waves longer than itself, and a 14-second swell is about 300 m long. The
  *bands* those patches cover are the ones the specification describes.
- **The looping frequency quantisation applies to the phase only.** Feeding the
  snapped frequency into the spectrum as well throws away most of a narrow swell
  peak. There is a comment at the exact line; do not merge the two values.
- **Never import anything from `public/`.** Vite rejects it — it is a copy
  directory, not part of the module graph. Data that both the page and the
  Worker need lives in `src/data` and is imported by both.
- **A `<canvas>` hands out one graphics context in its lifetime.** That is why
  `SceneStage` creates the element inside its effect rather than rendering it:
  under StrictMode a React-owned canvas reaches the second renderer already dead.
- **Globe pin status comes from NDBC's index flags, not from live readings.**
  Knowing real ages for 1,275 stations would need a poller over the whole
  network, which is out of scope. Stations the visitor opens use their real age.
- **Panel opacity is 86%, not the 72% in the design direction.** The contrast
  floor in the same document cannot hold over foam at 72%.

## Verification

Three commands, and nothing else gates this project.

| Command | Budget | Runs |
|---|---|---|
| `npm run verify` | **≤ 15 s** | `tsc --noEmit` × 3 projects, ESLint, unit tests — all in parallel |
| `npm run smoke` | **≤ 120 s** | Exactly one Playwright test per user journey, tagged `@smoke` |
| `npm run verify:all` | no budget | `verify` + `smoke` + Worker tests + `vite build` |

**A failing test is re-run alone, by name.** `npx vitest run -t "the case"` or
`npx playwright test -g "the journey"`. Never re-run the whole tier to check a
one-line fix — a tier re-run costs its entire budget, a single test costs
seconds, and a fix usually takes several attempts. Re-run the tier once at the
end to confirm.

**A budget breach is a defect, fixed before moving on.** Fix it by running tests
in parallel, by moving a test down a layer (a browser test that only checks a
JSON fact becomes an HTTP test), or by deleting a duplicate. **Never raise a
budget.** Never report a budget as met without the measured number.

**The budgets are measured on a developer machine**, which is the reference: it
is where these commands are run constantly and where being slow costs something.
A CI runner has two cores and no GPU, so every shader in the smoke tier is
compiled and rasterised on the CPU; `verify:all` allows three times the budget
there and says so in its output. That is an allowance for different hardware, not
a raised budget — the number to quote is always the local one.

**Tests are born from exactly two things:** a new user journey (one smoke test),
or a real bug (one regression test, **written failing first** so it is proven to
catch the thing). Do not write a test because a piece of code looks untested. A
unit test is for logic whose correctness is genuinely non-obvious — here that is
the NDBC fixed-width parser, the `MM`-to-null mapping, the spectrum derivation,
the great-circle nearest-station search, the URL state round-trip and the
`localStorage` wrappers' failure handling. If you are unsure whether something
deserves a unit test, it does not.

**WebGPU in headless browsers is unreliable**, so the smoke tier never depends on
it. Every journey runs against `?forceWebGL=1` and asserts on the DOM, the
readout values, the audio graph state, and the canvas being present and
painting — never on pixels. `npm run smoke:webgpu` is a separate opt-in project
that exercises the compute path under SwiftShader; it is excluded from `smoke`
and allowed to be slow.

### Change protocol

1. Make the change.
2. Run `npm run verify` and iterate there until green.
3. If the change altered an existing journey, **update that journey's smoke test
   in the same commit.** This is not new coverage and the growth rule does not
   gate it — a smoke test that no longer matches its journey is a broken test,
   not a passing one.
4. If it added a journey, add its one smoke test.
5. If it fixed a bug, add its one regression test, written failing first.
6. Run `npm run smoke` before committing.
7. Run `npm run verify:all` before deploying.
8. Record it per the table below.

## Docs are part of the change

| What you changed | What to update |
|---|---|
| Commands or environment variables | **Commands** section above |
| Stack or services | **Stack** section above |
| An invariant | **Conventions** section above |
| An implementation choice or default | `DECISIONS.md` |
| What the product does | `docs/changes.md` |
| Internals only | Nothing |
| **An altered journey** | **That journey's smoke test, in the same commit** |
| **A fixed bug** | **One regression test, written failing first** |
| **A budget breach and its fix** | `DECISIONS.md`, **with the measured timing** — without the number, someone re-adds the slow test later having no idea why it left |
| **The verification commands or budgets themselves** | This file |

Three rules:

- **Edit in place.** Never append a changelog to this file. `AGENTS.md` is the
  only instruction file to change.
- **The code wins.** These files describe what the code does now. A doc that
  disagrees with the code is a bug in the doc.
- **Never rewrite the spec documents.** `docs/01-idea.md` through
  `docs/04-build-prompt.md` are the record of what was asked for. A change that
  makes one of them wrong is recorded in `docs/changes.md`, never edited into the
  spec.

The two record files are different things. `DECISIONS.md` at the repo root is for
implementation choices made while coding. `docs/changes.md` is for changes to
what the product does. The test is *would a user notice?*

When behaviour changed, add one dated line to the `## Registro` section of the
project note at
`20-Personal/Proyectos/The Sea, Right Now/The Sea, Right Now.md` in the Obsidian
vault.
