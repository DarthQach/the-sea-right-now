# 04 · Build Prompt — The Sea, Right Now

> Written 2026-08-25. Composed from `docs/01-idea.md`, `docs/02-architecture.md`
> and `docs/03-design-prompt.md`. No `design/` folder exists in the repo at time
> of writing, so the written design direction governs the UI in full.

## 1. Access checklist — do this before starting the agent

Ordered by what blocks earliest.

| # | What | Exact name / command | First needed |
|---|---|---|---|
| 1 | Authenticate the Cloudflare CLI locally | `npx wrangler login` | Milestone 1 — first local run and first deploy |
| 2 | Create a GitHub repository and note its URL | — | Milestone 1 — repo creation and first push |
| 3 | Cloudflare API token with **Workers Scripts: Edit** | `CLOUDFLARE_API_TOKEN` — GitHub Actions secret | Milestone 1 — CI deploy |
| 4 | Cloudflare account ID | `CLOUDFLARE_ACCOUNT_ID` — GitHub Actions secret | Milestone 1 — CI deploy |
| 5 | Confirm the subdomain `sea.vicaai.dev` is free on the `vicaai.dev` zone | — | Milestone 1 — custom domain binding |
| 6 | Decide the contact address that goes in the outbound User-Agent | `NDBC_USER_AGENT` — a plain `vars` entry in `wrangler.jsonc`, not a secret | Milestone 2 — first upstream fetch |
| 7 | Node.js 20+ and npm installed | `node --version` | Everything |
| 8 | Add a Cloudflare Rate Limiting Rule on `sea.vicaai.dev/api/*` in the dashboard | — | Before the URL is shared publicly, not before the build |
| 9 | A machine with a real GPU to look at the result | — | Confirming Definition of Done item 3 by eye |

Nothing else is required. There are no third-party API keys in this project —
NOAA NDBC needs none.

## 2. The build prompt

```text
# Build: The Sea, Right Now

The Sea, Right Now is a web page that renders the actual ocean, live. You spin a
3D globe covered in ocean-buoy pins, click one, and the page draws that specific
patch of water — driven by the wave height, period, direction and wind that the
buoy is reporting at this moment — and synthesises the sound of it from the same
numbers. Every wave on screen is computed from a real measurement taken within
the last hour or so; nothing is a video, a loop or an artist's impression. It is
free, has no accounts, and a visitor can send someone a URL that opens on exactly
the same stretch of water. It is deployed at https://sea.vicaai.dev.

## The finished state

When you are done, this exists and works.

**Deployed:** a single-page web application at `https://sea.vicaai.dev`, served
by one Cloudflare Worker that also handles the two API routes below. No other
environment, no other host.

**Routes (client-side, all reachable by direct URL):**
- `/` — the globe view. Every station plotted. Also the landing state when no
  station is specified.
- `/?station={id}` — the sea view for one station, e.g. `/?station=46042`. This
  is the shareable unit and the hero of the product.
- `/?station={id}&mode=literal|tuned` — the same, with the audio mapping preset.
- `/?station={id}&forceWebGL=1` — the same, forced onto the reduced-fidelity
  renderer. Used by the smoke tests and for debugging.
- `/?about=1` — the about-and-attribution panel open over whatever is behind it.
- An unknown station ID renders the "station not found" card, not a blank page.

**Endpoints (served by the Worker):**
- `GET /api/stations` — the station index: every active NDBC station with id,
  name, latitude, longitude, owner, type and capability flags. Cached at the
  edge for 24 hours. Returns the bundled snapshot with `source: "bundled"` if
  NDBC is unreachable.
- `GET /api/station/:id` — one station's current reading, parsed to JSON, with
  per-field provenance. Cached at the edge for 5 minutes. `404` for an ID that
  is not in the index. `503` with the last cached reading and its age if NDBC is
  unreachable and nothing fresh can be had.

**What is stored:** nothing server-side. There is no database. The only
persistence is in the visitor's own browser: a favourites list and a preferences
object in `localStorage`. A station index snapshot ships as a static JSON file
inside the bundle.

**Repository shape:**
    /src/app        — React UI: panels, readout, spectrum plot, controls
    /src/scene      — three.js: globe, ocean, cameras, renderer setup
    /src/scene/ocean— FFT ocean (WebGPU compute) and Gerstner fallback
    /src/audio      — Web Audio graph, both mappings
    /src/lib        — spectrum math, URL state, localStorage wrappers
    /src/worker     — the Cloudflare Worker: routes, NDBC parser, caching
    /public         — static assets, including stations.snapshot.json
    /tests/unit     — Vitest
    /tests/smoke    — Playwright, one spec per journey
    /docs           — the four specification documents and changes.md
    AGENTS.md  CLAUDE.md  DECISIONS.md  README.md  wrangler.jsonc

**Walkthrough — journey 1: see one station's water.**
A person opens `https://sea.vicaai.dev/?station=46042`. Within about a second
they see a dark ocean surface filling the entire viewport, camera low and near
the water with the horizon in the upper third. Top left reads "Monterey Bay, CA"
with "46042" in monospace beneath it and "14 min ago" beside it. Bottom left, a
readout shows large tabular numbers: wave height 2.4 m, dominant period 14 s,
wind 11.8 kt, water 16.2 °C — each with a small uppercase label. Above it sits a
small line graph, roughly 240×80, showing wave energy against frequency: the
actual spectrum the water is being generated from. The water moves continuously
and its character matches the numbers — long slow swell at 14 s, not chop. The
person drags to orbit the camera up and sees the swell as a field, drags back
down, and presses the reset control to return to the low framing. Fifteen
minutes later a new reading arrives and the surface eases into its new state over
several seconds rather than jumping.

**Walkthrough — journey 2: hear it.**
On the same screen, the audio control in the bottom-right cluster is the most
inviting thing on the page. The person clicks it once. Sound begins immediately —
the literal mapping: broadband noise shaped by the spectrum, swells breaking at
the dominant period, wind hiss layered on top. They switch to "Tuned" and the
same numbers become a slow harmonic drone that shifts as the sea does, with no
reload and no gap. They set the volume to about a third and reload the page; the
volume and the mapping are remembered, and the audio waits for their click again
because a browser will never start it on its own.

**Walkthrough — journey 3: find a station.**
The person clicks the globe thumbnail. A dark globe appears with roughly 1,300
pins: solid amber for stations that reported within two hours, hollow grey for
stale, small faded hollow for dead. They spin it, hover a pin, and a small label
gives the name, the ID and how long ago it reported. They open the stations panel
and type "Nantucket"; the list filters as they type and they click the row. The
sea view loads for that station. They click a faded pin off the Oregon coast; a
card says that station is not reporting, gives the last time it did, and offers
"Go to 46050 · Stonewall Bank, 41 km away" as a single primary action. They take
it and land on live water.

**Walkthrough — journey 4: keep it and share it.**
The person clicks the star on the current station. It fills. They open the
stations panel and switch to Favourites; the station is listed with its status
dot and reading age. Before saving anything, that same tab had shown a calm
one-sentence explanation of what favouriting does. They click the copy-link
control; a quiet inline confirmation appears and the clipboard now holds
`https://sea.vicaai.dev/?station=46042`. They send it. The recipient opens it in
a browser that has never seen the site, and lands directly on that station's
water with nothing to dismiss, no account, and no cookie banner. They reload
their own tab and the favourites list is still there.

**Walkthrough — journey 5: it stays honest on any machine.**
The person opens the site on an old laptop with no WebGPU support. The full
product loads with a simpler ocean, and one quiet dismissible line says a
simplified ocean is being shown and why. The readout, the spectrum plot and the
audio all work exactly as before. They switch to another tab for ten minutes;
rendering throttles hard and a small unalarming marker says so, and the laptop
stays cool. They come back and it resumes. Meanwhile NDBC goes down: a slim
banner appears at the top saying live data is unavailable, showing the age of the
last known reading, with a retry action — and the water keeps moving from that
last reading rather than freezing or emptying. Their operating system is set to
reduce motion, so the water renders in a calmer, lower-amplitude mode and every
interface animation is off; the settings panel lets them force full motion if
they want it.

## Definition of Done

This build is complete ONLY when every criterion below passes. Do not stop before
then.

1. The GitHub repository exists, contains the full project, and the default
   branch is current with all work pushed.
2. `npm run build` completes with 0 errors.
3. `https://sea.vicaai.dev` serves the application over TLS and renders moving
   water for a live station.
4. `GET https://sea.vicaai.dev/api/station/46042` returns 200 with a JSON body
   containing `stationId`, `observedAt`, `fieldSources` and at least one non-null
   measurement.
5. `GET https://sea.vicaai.dev/api/station/ZZZZZ` returns 404, not a 500 and not
   an empty 200.
6. Every security requirement in `## Security` is implemented, and each one can
   be pointed at in the code.
7. `DECISIONS.md` exists at the repo root and lists every assumption and default
   chosen during the run.
8. `npm run verify:all` passes end to end, and the GitHub Actions job that runs
   it on push to the default branch is green.
9. Both budgets are met **with the measured times stated in the final report**:
   `npm run verify` at or under 15 seconds, `npm run smoke` at or under 120
   seconds. A budget asserted without its measured number has not been checked.
10. **Journey 1 is demonstrable:** on the live URL, opening `/?station=46042`
    shows moving water with the readout populated from a real reading, the
    spectrum plot drawn, and the camera orbitable and resettable.
11. **Journey 2 is demonstrable:** on the live URL, one click starts audio in the
    literal mapping, switching to tuned changes the sound without a reload, and
    volume and mapping survive a page reload.
12. **Journey 3 is demonstrable:** on the live URL, the globe renders its pins in
    three visually distinct states, search filters to a named station and opens
    it, and clicking a station with no usable data offers a named nearby live
    station that loads when taken.
13. **Journey 4 is demonstrable:** on the live URL, favouriting persists across a
    reload, the empty favourites state appears before anything is saved, and the
    copied link opens the same station in a fresh browser profile.
14. **Journey 5 is demonstrable:** on the live URL, `?forceWebGL=1` renders a
    working simplified ocean with readout, spectrum and audio intact; throttling
    engages and is indicated when the tab is hidden; an induced upstream failure
    shows the banner with the last reading's age and a working retry.
15. **No mock or stub data path remains reachable.** Every user journey reads and
    writes real storage and real upstream data. No mock data, fixture, or stub
    introduced during earlier milestones is reachable in the deployed
    application. Search the codebase for stub and mock paths before declaring
    done and remove or gate every one.
16. **The documentation exists and is current.** `README.md` and `AGENTS.md` are
    written, accurate against the code as built, and committed; `CLAUDE.md` is a
    short pointer to `AGENTS.md` and contains no duplicated content.

## Tooling you have

Provision your own infrastructure. Do not ask for anything you can do yourself.

- **Cloudflare**, via the Wrangler CLI (already authenticated) and the Cloudflare
  MCP server if available: create the Worker, bind the custom domain
  `sea.vicaai.dev`, configure static assets, deploy, and read deployment logs.
- **GitHub**, via `gh` or the GitHub MCP server if available: create the
  repository, push, and add the Actions workflow.
- **Documentation**: consult Cloudflare, three.js, React, Vite, Playwright and
  NOAA NDBC documentation directly rather than guessing at an API.
- **The live NDBC service**: fetch real data during development. It is public and
  needs no key. Keep retrieval minimal, as NDBC asks.

Human work is limited to true secrets and dashboard-only actions: the Cloudflare
API token and account ID as GitHub Actions secrets, and the rate-limiting rule.

## Pre-flight — your first action

Before writing any code, post ONE consolidated message listing every
human-supplied item for the entire build:

- `CLOUDFLARE_API_TOKEN` — GitHub Actions secret, needed by milestone 1's CI
  deploy step.
- `CLOUDFLARE_ACCOUNT_ID` — GitHub Actions secret, needed by milestone 1's CI
  deploy step.
- `NDBC_USER_AGENT` — a `vars` entry in `wrangler.jsonc`, needed by milestone 2's
  first upstream fetch. Not a secret. If it is not supplied, default it to
  `TheSeaRightNow/1.0 (+https://sea.vicaai.dev)` and record that in
  `DECISIONS.md`.
- Confirmation that `sea.vicaai.dev` is free on the `vicaai.dev` zone.

Then **do not wait**. Start milestone 1 immediately — local development needs
none of these. Scaffold `.dev.vars.example` with every variable as a placeholder,
and add `.dev.vars` to `.gitignore`. Stop only if no remaining milestone can
proceed without a still-missing item, and then re-post exactly what is needed in
one message.

## Execution contract

- Work through ALL milestones continuously. Do not stop for approval — not
  between steps, not between milestones.
- After each milestone, run its Exit Checks. Never advance past a failing check.
- **When a check or a test fails, iterate on that one thing alone.** Re-run the
  single failing test by name, or the single failing command — never the whole
  tier — until it passes, then re-run the tier once to confirm. Re-running a full
  tier after every small fix is the single most expensive habit available to you.
- At each milestone boundary post a short **📍 Checkpoint**: what was built, each
  exit check with the command or flow actually run and its actual result, and the
  capabilities delivered. Then continue immediately. Checkpoints are progress
  reports, not gates. An exit check reported without its actual result is an exit
  check that was not run.
- **Re-anchor at every milestone boundary.** Before starting the next milestone,
  re-read `## The finished state` and the next milestone's capabilities, and name
  in the checkpoint anything drifting from that picture.
- **If the run is interrupted or context is lost**, resume by reading
  `AGENTS.md`, `DECISIONS.md` and the progress checklist, then re-read
  `## The finished state` before touching code. Never resume from memory.
- **Deferred-input rule.** When something needs human input: if it does not block
  the remaining work, choose the most reasonable default, record it in
  `DECISIONS.md`, and keep going. If it blocks only some work, reorder and build
  the rest first. Stop only when nothing can proceed.
- **Never fabricate a secret, key or credential.** Fabricating one is never a
  reasonable default.
- Commit at every green Exit Check, and push.
- Maintain a visible progress checklist and keep it current.
- Keep `AGENTS.md` current as you go.
- **Final report, mandatory:** the Definition of Done checklist with each item's
  pass status, the full contents of `DECISIONS.md`, the live URL, and the repo
  link.

## Tech stack

| Component | Choice | Version | What it does |
|---|---|---|---|
| Language | TypeScript | 5.x | Types across page and Worker; one `tsc --noEmit` gate |
| Build tool / dev server | Vite | 8.2.x | Bundles the app, runs the dev server, builds for production |
| Worker integration | `@cloudflare/vite-plugin` | current | Runs the Worker in the real `workerd` runtime during `vite dev`; builds assets + Worker as one deployable |
| UI layer | React + react-dom | 19.2.x | Panels, station search, favourites list, settings |
| Styling | Hand-written CSS, custom properties, one stylesheet | — | Dark instrument UI over the canvas. No CSS framework |
| 3D renderer | three.js | r185 | Scene graph, camera, `WebGPURenderer`, automatic WebGL 2 fallback |
| Shading / compute | TSL (Three.js Shading Language, ships with three.js) | r185 | Ocean compute and surface shading, transpiled to WGSL or GLSL |
| Ocean simulation | Custom — cascaded inverse-FFT height field in TSL compute | — | Spectrum parameters to a moving surface, every frame |
| Fallback ocean | Custom — Gerstner sum-of-sines, same spectrum inputs | — | The WebGL 2 path, where compute shaders do not exist |
| Globe | Custom — three.js `SphereGeometry` + `InstancedMesh` pins | — | World globe, station pins, three status states, click picking |
| Audio | Web Audio API, browser built-in | — | Both sonification mappings, generated live. No audio assets, no audio library |
| Client storage | `localStorage`, browser built-in | — | Favourites, audio mode, volume, last station, chrome visibility |
| Server runtime | Cloudflare Workers, module worker | current | Serves the static bundle; `/api/*` fetches, parses and caches NDBC data |
| Edge cache | Workers Cache API | — | 5-minute cache on readings, 24-hour on the station index |
| Data source | NOAA NDBC `realtime2` text files + `activestations.xml` | — | Wave, wind and water-temperature measurements; station positions |
| Deploy tooling | Wrangler CLI | current | `wrangler deploy`, custom domain binding |
| Hosting / DNS | Cloudflare, `sea.vicaai.dev` | — | Public URL, TLS, edge delivery |
| Unit tests | Vitest | current | Parser, spectrum math, URL state, storage |
| Worker tests | `@cloudflare/vitest-pool-workers` | current | Worker handler tests inside `workerd` |
| Journey tests | Playwright | current | One end-to-end test per journey |
| Lint | ESLint flat config + `typescript-eslint` | current | Static checks in the fast tier |
| CI | GitHub Actions | — | Runs `verify:all` on push to the default branch |

Do not add a state-management library, a UI component library, a CSS framework,
an audio library, a globe library, or a charting library. Every one of those was
considered and ruled out; the pieces they would cover are small enough to write
directly and each would add a dependency to a project that deliberately has few.

## Architecture

Almost everything runs in the visitor's browser, on their own GPU. That is why
this can be free.

The page is a static bundle — HTML, JavaScript, one stylesheet, and a station
index snapshot — served from Cloudflare's edge. It boots into a three.js scene
running on WebGPU.

The wave measurements come from NDBC, NOAA's buoy network, which publishes plain
text files at fixed URLs, updated roughly hourly, as a US federal work that is
free and openly redistributable. A browser cannot read those files directly:
NDBC does not send CORS headers, so the request is blocked before the page sees
the response. So the Worker fetches them instead, parses the fixed-width text
into clean JSON, and returns that to the page. It caches each reading at the edge
for five minutes — which both honours NDBC's request that retrievals be kept
minimal and collapses a thousand simultaneous visitors on one buoy into a single
upstream request.

The page turns the reading into a wave spectrum — a description of how much wave
energy exists at each size and direction — and feeds it to an FFT ocean: fill a
grid with energy in the frequency domain, run an inverse Fast Fourier Transform,
get a height field. This runs as a compute shader on the visitor's GPU, every
frame. The server renders nothing.

The same spectrum drives the audio through the Web Audio API. Nothing is
downloaded; both mappings are synthesised live from the same numbers.

**Data flow:**
    Browser page  ──fetch /api/station/:id──▶  Worker  ──cache hit?──▶  Cache API
                                                  │ miss
                                                  ▼
                                          NDBC realtime2/*.txt + *.spec
                                                  │
                                          parse → JSON reading
                                                  ▼
    Browser page  ◀──────────────────────────────┘
        │
        ├─▶ SpectrumParams ─▶ FFT ocean (WebGPU compute) or Gerstner fallback
        ├─▶ SpectrumParams ─▶ Web Audio graph (literal or tuned)
        └─▶ readout + spectrum plot

**Important implementation note on the fallback.** three.js's `WebGPURenderer`
falls back to WebGL 2 automatically when WebGPU is absent, and that covers the
interface, the globe and the readout completely. It does NOT carry the FFT
across, because WebGL 2 has no compute shaders. That is why a second ocean
implementation — Gerstner sum-of-sines, driven by the same `SpectrumParams` — is
specified. Do not attempt to run the compute path on WebGL 2. Also note that
`ShaderMaterial`, `RawShaderMaterial` and `EffectComposer` are not supported on
the WebGPU path; use node materials and TSL only.

**On the ocean implementation and its provenance.** Implement the FFT ocean from
the published technique — Tessendorf's "Simulating Ocean Water" and the Horvath
directional spectrum, with a JONSWAP spectrum and TMA depth correction, and a
Stockham-formulation butterfly IFFT with a precomputed twiddle/index buffer.
Three cascades covering roughly 250 m, 17 m and 5 m wavelength bands, with foam
derived from the displacement Jacobian. Do NOT copy code from the `poseidon`
repository: it is an excellent reference and worth reading, but it declares no
license, which means there is no permission to reuse its source. Credit it as an
inspiration in `README.md` alongside the papers.

## Data model

There is no database. These are the shapes that move through the system and the
two that persist in the visitor's browser. Use these field names.

**`Station`** — one buoy, from `activestations.xml`:
- `id: string` — NDBC station ID, e.g. `46042`. Uppercase for C-MAN land
  stations, e.g. `FPSN7`. Primary key, unique.
- `name: string` — human label, e.g. `Monterey Bay, CA`
- `lat: number` — degrees, −90…90
- `lon: number` — degrees, −180…180
- `owner: string` — operating agency
- `type: string` — `buoy` | `fixed` | `dart` | `oilrig` | `tao`
- `met: boolean` — reported meteorological data within 8 hours, per NDBC
- `currents: boolean`
- `waterquality: boolean`
- `dart: boolean` — tsunami station; no wave data

Constraints: stations with `dart === true` or missing coordinates are filtered
out at index-build time, not at render time. The index is sorted by `id` so the
bundled snapshot diffs cleanly in git.

**`StationIndex`**:
- `stations: Station[]` — roughly 1,300 entries after filtering
- `builtAt: string` — ISO 8601 timestamp of the fetch
- `source: 'live' | 'bundled'`

A snapshot ships as a static JSON file with the bundle so the globe renders on
first paint without a network round trip. The Worker refreshes from NDBC at most
once every 24 hours; when NDBC is unreachable the bundled snapshot is used and
`source` says so.

**`Reading`** — one station's current state, parsed by the Worker from
`realtime2/{id}.txt` and, when present, `realtime2/{id}.spec`. Both are
fixed-width text with `MM` in every column NDBC has no value for.
- `stationId: string`
- `observedAt: string` — ISO 8601 UTC, from the `YY MM DD hh mm` columns
- `waveHeightM: number | null` — `WVHT`, significant wave height in metres
- `dominantPeriodS: number | null` — `DPD`, seconds
- `averagePeriodS: number | null` — `APD`, seconds
- `waveDirectionDeg: number | null` — `MWD`, degrees from true north
- `windSpeedMs: number | null` — `WSPD`, m/s
- `windGustMs: number | null` — `GST`, m/s
- `windDirectionDeg: number | null` — `WDIR`, degrees
- `waterTempC: number | null` — `WTMP`, °C
- `airTempC: number | null` — `ATMP`, °C
- `pressureHpa: number | null` — `PRES`, hPa
- `swellHeightM`, `swellPeriodS`, `swellDirection`, `windWaveHeightM`,
  `windWavePeriodS`, `steepness` — from `.spec`, present only for spectral
  stations; same nullability rules
- `fieldSources: Record<string, 'measured' | 'derived' | 'absent'>` — set by the
  Worker, never inferred in the UI. Drives the readout's provenance treatments
- `fetchedAt: string` — ISO 8601, when the Worker fetched it

Constraints: every numeric field is nullable — a large share of stations report
wind but not waves, or the reverse. `MM` maps to `null` and to
`fieldSources[field] = 'absent'`, **never to zero**. A `Reading` with
`waveHeightM === null` AND `windSpeedMs === null` is treated as *no usable data*
and triggers the nearest-live-station offer. `ageSeconds` is computed on the page
from `observedAt`, not stored.

**`SpectrumParams`** — derived on the page, never stored:
- `significantHeightM: number` — from `waveHeightM`, or estimated from wind when
  absent, in which case the readout marks it derived
- `peakPeriodS: number` — from `dominantPeriodS`, falling back to
  `averagePeriodS`
- `directionDeg: number` — from `waveDirectionDeg`, falling back to
  `windDirectionDeg`
- `directionalSpread: number` — constant per sea state; tuned, not measured
- `windSpeedMs: number` — feeds the short-wavelength cascade and the audio hiss
- `cascades: { lengthM: number; weight: number }[]` — three bands

Two `SpectrumParams` values are held at once, the previous and the incoming
reading, and interpolated over several seconds so readings never snap.

**`Favourites`** — `localStorage`, key `tsrn.favourites`:
- `schemaVersion: number` — starts at 1; an unrecognised version is discarded,
  not migrated blindly
- `stationIds: string[]` — ordered by when added, deduplicated on write, soft cap
  100

**`Prefs`** — `localStorage`, key `tsrn.prefs`:
- `schemaVersion: number`
- `audioMode: 'literal' | 'tuned'` — defaults to `literal`
- `volume: number` — 0…1
- `muted: boolean` — audio never starts without a user gesture regardless
- `chromeHidden: boolean`
- `motionOverride: 'auto' | 'full' | 'reduced'` — `auto` follows
  `prefers-reduced-motion`
- `lastStationId: string | null`

Every read from `localStorage` is wrapped: a private window, disabled site data,
or a corrupt value must produce defaults, never a broken page.

**URL state:** `?station={id}` is the shareable unit and the only parameter that
must be stable. `&mode=literal|tuned` and `&forceWebGL=1` are also read. Camera
position is deliberately NOT encoded. Unknown parameters are ignored, never an
error.

## What it must do

Every capability below is required. The numbering is for reference and mapping
only — it confers no priority. Nothing here is optional or deferrable.

**Journey A — finding a stretch of water**

- **C1.** Spin and zoom a 3D world globe with every NDBC station plotted, and
  tell live stations from stale and dead ones at a glance, before clicking
  anything.
- **C2.** Click a station pin and land on that station's water — camera, audio
  and readout all switch to it.
- **C3.** Search stations by name or station ID and jump straight to one.
- **C4.** Click a station with no usable data and be offered the nearest
  reporting station in one click, rather than an error. The nearest station is
  computed on the page, from the station index already in memory, by great-circle
  distance filtered to stations whose `met` flag is true — no server call and no
  second endpoint.

**Journey B — watching the water**

- **C7.** See a full-frame ocean surface whose wave spectrum is computed from that
  station's live significant wave height, dominant and average period, wave
  direction, and wind speed and direction.
- **C8.** Watch the surface change when a new reading arrives — interpolated
  between readings, never snapping, because readings land tens of minutes apart.
- **C9.** Orbit, pan and zoom the camera freely: low on the surface (the default
  on load), up to a field view of the swell pattern, and anywhere between.
- **C10.** Return to the default framing in one action after moving the camera.
- **C15.** Read a persistent panel showing station name and ID, significant wave
  height, dominant period, wind, water temperature, and the timestamp of the
  reading.
- **C16.** Tell measured values apart from interpolated or absent ones — many
  stations report waves but not wind, or wind but not waves — so the panel never
  implies a measurement that was not taken.
- **C17.** See the live spectrum plot the water is being built from, as a small
  graph next to the readout.
- **C21.** See the age of the reading stated plainly whenever it is old, with the
  water still rendering from it — never a spinner, never an implied "live" that
  is not.
- **C22.** See a deliberate cold-load state during the first NOAA response, which
  never looks like a broken page.

**Journey C — hearing the water**

- **C12.** Start the sound with a single explicit click (browsers never
  autoplay), and hear the sea synthesised from the same spectrum driving the
  water — the literal mapping plays first.
- **C13.** Switch between the two mappings without reloading: **literal** (noise
  synthesis driven by the spectrum — period sets the swell rhythm, height the
  intensity, wind the hiss) and **tuned** (the same spectrum mapped to a musical
  drone that stays beautiful on a flat day).
- **C14.** Set volume or mute, and have that choice remembered in this browser.

**Journey D — keeping it and sharing it**

- **C5.** Favourite the current station; favourites persist in this browser
  across visits, appear as a one-click list, and can be removed individually.
- **C6.** See a deliberate empty state on the favourites list before any have been
  saved, that explains what favouriting does.
- **C19.** Copy a URL that encodes the current station, and hand it to someone who
  lands on that exact water with no signup, no account, nothing to dismiss.
- **C20.** Open a shared URL cold and go straight to that station rather than the
  globe.

**Journey E — honest and usable on any machine**

- **C11.** Get a calmer, lower-amplitude rendering automatically when the browser
  reports `prefers-reduced-motion`, and switch it manually either way.
- **C18.** Hide all chrome for a clean full-frame view, and bring it back — the
  readout fades in on pointer movement while hidden.
- **C23.** Get an honest, usable experience with no WebGPU support: a reduced
  WebGL rendering with the readout, the spectrum plot and the audio all still
  working.
- **C24.** Have rendering throttle hard when the tab loses focus or the machine is
  on battery, with a visible indication that it is throttling deliberately.
- **C25.** See the last known reading with its age, and a way to retry, when NOAA
  itself is unreachable.

**Explicitly NOT doing — do not build these:**

- The macOS / tvOS app. Screensaver, menubar app and one-time purchase are a
  separate project.
- Forecast. Nothing about what the sea will do later. This is a witness, not a
  prediction.
- Historical playback. No scrubbing back through past swell.
- Accounts, sync, social. No profiles, no login, no comments, no shared feed, no
  user-generated content.
- Non-NOAA data sources. No Copernicus/CMEMS or national-network adapters. NDBC
  coverage is the map you get.
- Surf-condition judgement. No good/fair/poor ratings, no scores, no advice.
- A packaged mobile app. The page is responsive; there is no app store presence.
- Monetisation of any kind. No payments, no ads, no email capture. Free forever.

**How this fulfils the idea — the plain statement of what must be true at the
end:**

1. **The one that matters:** when a real swell arrives at a station, the water
   visibly changes, and what is rendered agrees with the NDBC reading for that
   station at that time. If this fails, everything else is decoration.
2. Opening the page cold puts real, reading-driven water on screen within about
   three seconds, with a station name and a reading timestamp visible.
3. One click starts the sound, and a 1 m day and a 4 m day are audibly different
   without anyone explaining which is which.
4. Any station on the globe can be clicked and either loads its water or honestly
   offers the nearest live one.
5. A URL sent to another person lands them on the same water, with no signup.
6. An hour in a background tab on battery leaves the laptop unaffected.
7. A machine without WebGPU still gets something honest and usable.
8. Someone who is not the author leaves it open for a full working day.

## Security

Implement every one of these. Each names the mechanism.

- **Secrets.** The project has no API keys — NDBC needs none. Deploy credentials
  (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) live in GitHub Actions
  secrets and in the developer's `wrangler login` session. `.dev.vars` is
  gitignored and ships as `.dev.vars.example` with placeholders only. Never
  commit a secret; never print one in a log or a checkpoint.
- **Authentication.** None. No accounts, no sign-in. Every visitor is anonymous
  and equal. Do not add auth.
- **Authorization.** Not applicable — there is no private data and no
  state-changing endpoint. Both Worker routes are public reads of public
  measurements. Do not add a write endpoint.
- **Transport.** TLS end to end. Cloudflare terminates TLS for the site; the
  Worker fetches NDBC over HTTPS, never HTTP. Enable HSTS.
- **Data at rest.** Nothing is stored server-side. The only persistence is
  `localStorage` on the visitor's machine, readable only by this origin.
- **Personal data.** None is collected. No accounts, no analytics, no email
  capture, no cookies, no fingerprinting. Favourites and preferences never leave
  the browser. The Worker logs no request bodies and no IP-linked records.
- **Input validation.** Validate `:id` against `^[A-Za-z0-9]{4,7}$` AND check
  membership in the station index before any upstream fetch. Construct the
  upstream URL from the validated ID, never from raw user input. This is the
  anti-SSRF control: an unvalidated ID would let a stranger point the Worker at
  an arbitrary path.
- **Rate limiting / abuse.** The `/api/*` routes are reachable by anyone. Two
  layers, both required. (a) In the Worker: an in-memory per-isolate token
  bucket, 60 requests per IP per minute, returning 429 with a `Retry-After`
  header. Note in `DECISIONS.md` that this is per-isolate and therefore
  approximate — it is defence in depth, not a hard global limit. (b) The hard
  limit is a Cloudflare Rate Limiting Rule on `sea.vicaai.dev/api/*`, configured
  in the dashboard by a human; document in `README.md` that it must exist before
  the URL is shared publicly.
- **File uploads.** Not applicable. Do not add any upload path.
- **Dependencies.** Every runtime dependency must be a well-adopted, maintained
  package: three.js, React, Vite, and Cloudflare's own tooling. Do not add a
  single-maintainer package as a load-bearing dependency. Run `npm audit` in CI
  and address anything high or critical.
- **Third-party access.** One external service, NDBC, which receives station IDs
  and nothing else. Never forward a visitor's headers, IP, or any derived
  identifier upstream.
- **Upstream courtesy.** NDBC asks for minimal retrievals. Enforce with the
  5-minute reading cache and 24-hour index cache, a descriptive `User-Agent`
  identifying the project with a contact address, and by never polling stations
  the visitor is not looking at. Do not build a background poller over all
  stations — it would raise request volume by three orders of magnitude and is
  explicitly out of scope.
- **Client-side resource use.** Throttle continuous GPU rendering on
  `visibilitychange` and via the Battery Status API where available, and respect
  `prefers-reduced-motion`.

## Design

No design files exist in the repository. Build the interface from this
specification in full. If a `design/` folder is added later, its files take
precedence over this written direction wherever the two differ, and this written
direction governs anything the files do not cover.

**ALL USER-FACING COPY IS IN ENGLISH.**

**The core principle.** The water is the product. Every pixel of interface exists
to sit quietly on top of a full-screen, constantly moving 3D ocean without
competing with it. If a screen would look good with the water removed, the
interface is too heavy. Underneath the ambient identity is an instrument: real
numbers, the actual spectrum, and scrupulous honesty about reading age and data
provenance. Beautiful and truthful at once, never beautiful at the expense of
truthful.

**Tone.** Calm, precise, unhurried, quietly confident. Observatory instrument
panel or marine chart, not weather app and not surf brand. No exclamation marks,
no hype, no illustrations of waves — there is real water on screen.

**Dark only.** There is no light theme, and this is deliberate: the interface
always sits over rendered ocean, and light panels over moving water are
unreadable at any opacity.

**Palette:**
- Panel surface `#0B0F14` at 72% opacity with a heavy backdrop blur — the water
  is sensed through the panel, never legible through it
- Panel border: 1px `#FFFFFF` at 8% opacity. Hairlines only
- Primary text `#E8EDF2`; secondary text and labels `#8FA3B0`
- Single accent, warm amber `#FFB45A` — interactive elements, the live
  indicator, the "click to hear" affordance, focus rings. Amber is chosen against
  the blue-grey of water so anything interactive is unmistakably interface. Use
  sparingly: if more than roughly 5% of the screen is amber it has stopped
  meaning "you can touch this"
- Station status, which must NEVER be carried by colour alone:
  live (reported within 2 hours) `#FFB45A` solid dot with a subtle ring; stale
  (2–24 hours) `#8FA3B0` hollow dot; dead `#5A6670` small hollow dot at 50%
  opacity. Each state differs in fill, size and ring so it survives greyscale
- Alert / data-problem `#E4572E`, used only for genuine failures

**Typography:**
- Interface text: a neutral grotesk with true tabular figures — Inter, IBM Plex
  Sans or equivalent. **Tabular figures are mandatory**: the readout updates
  every few minutes and must not shift horizontally when digits change
- Station IDs, coordinates and timestamps: a monospace face — IBM Plex Mono,
  JetBrains Mono or equivalent
- Scale: readout values 28–32px; their labels 11px uppercase with generous
  letter-spacing; body 14px; secondary 12px. The numbers are the biggest text on
  screen

**Density and layout.** Airy. Panels are small, anchored to edges and corners,
16–20px internal padding, clear separation between groups. The centre of the
screen is always water — never place a panel there except a modal that genuinely
demands attention. Corner radius 12px on panels, 8px on controls.

**Motion.** Minimal in the interface: fades and slides of 150–200ms, gentle
ease-out, nothing bouncy. The entire motion budget belongs to the ocean. Every
interface animation is disabled when the OS reports reduced motion.

**Responsive.** Desktop first at 1440×900 — this is a thing people leave open on
a laptop. Full phone layout at 390×844: side panels become bottom sheets that
drag up, the readout condenses to a single row of three values with the rest one
tap away, and the globe gets larger hit targets. Never a scaled-down desktop
panel on a phone.

**Persistent elements**, visible unless the interface is explicitly hidden:
station name and ID top left; **reading age immediately beside it** — the single
most important honesty element, reading "12 min ago" in secondary text when
recent and becoming visually louder as it ages; a small low-emphasis "NOAA NDBC"
attribution bottom right, linking to the about panel.

### Screens — build all nine

**1. THE SEA — the hero. Build this first and spend the most care on it.**
The ocean fills the entire viewport, edge to edge, no letterbox, no frame,
camera low near the surface with the horizon in the upper third. Over it:
top left, station name, station ID in mono, reading age. Bottom left, THE
READOUT: wave height, dominant period, wind, water temperature — each a large
tabular number with a small uppercase label and its unit. Every value carries a
quiet provenance indicator: measured values plain, interpolated or estimated
values marked with a small glyph and a dimmed label, absent values shown as an
em-dash and never as a zero. Build all three treatments explicitly; this is a
core honesty requirement and the most commonly botched detail in the product.
Directly above or beside the readout, THE SPECTRUM PLOT: roughly 240×80, wave
energy against frequency, fine amber line on near-transparent ground, no
gridlines heavier than 6% white, no chart junk, no legend. Bottom right, a
compact control cluster: audio toggle, mapping switch labelled "Literal" and
"Tuned", volume, favourite star, copy link, reset camera, settings, hide
interface. Top right, a small globe thumbnail returning to the globe view.
States: **loading** — the cold boot, interface skeleton with dashes where numbers
will be and calm still dark water; never a broken look, never a centred spinner.
**populated** — the normal case. **populated with an old reading** — age
indicator visually louder, one quiet line explaining the water is drawn from the
last reading; the water keeps moving and nothing is greyed out. **populated with
partial data** — a station reporting wind but no wave height, readout handling
missing values without looking broken. **audio off vs audio on** — build both; in
the off state the audio control is the most inviting element on screen, quietly
irresistible without being loud. **interface hidden** — same water, everything
faded except an almost invisible station name and age, returning on pointer
movement. **error** — see screen 7. **success** — the link-copied confirmation.
No limit state; nothing here is capped.

**2. THE GLOBE.** A dark 3D globe, centred, ocean as deep near-black blue,
landmasses flat dark grey with a hairline coast. Roughly 1,300 pins in the three
status treatments. Hovering a pin raises a small label with station name, ID and
last reading age. A search affordance at the top; a favourites affordance beside
it. **Honesty requirement:** the buoy network is operated by the United States,
so pins cluster on US coasts, Hawaii, Alaska, Puerto Rico and the Great Lakes,
and much of the world's coastline has none. Build the globe so this reads as an
honest map of a real network rather than as missing data, including one quiet
line of copy naming whose network it is, placed so a first-time visitor sees it
without it being a modal to dismiss. States: loading (globe present, pins fading
in), populated, error (live index could not refresh, bundled snapshot in use — a
quiet line, not an alarm; the globe still works). No empty state — the index
ships with the page. No success or limit state.

**3. STATIONS PANEL — SEARCH AND FAVOURITES.** A panel anchored to one side,
bottom sheet on phone, with a search field at the top and two segments, "All" and
"Favourites". Results are a list: station name, ID in mono, status dot and last
reading age on the right, a star for favouriting, filled when favourited. One tap
opens a row. Includes the share/copy-link confirmation: a brief quiet inline
confirmation, never a full-width banner. States: **two distinct empty states,
both required** — (a) favourites with nothing saved: one calm sentence on what
favouriting does and how, with the star glyph inline in the copy; (b) search with
no matches: offer the nearest alternative interpretation rather than a dead end.
**loading** for a long list. **populated** — mix live, stale and dead stations so
all three treatments appear together. **success** — favourited, and link copied.
**limit** — favourites soft-capped at 100; build the message shown at the cap. No
error state; search runs against the local index with no network call.

**4. SETTINGS PANEL.** A small panel with grouped rows: audio mapping (Literal /
Tuned), volume, motion (Auto / Full / Reduced, where Auto follows the system
preference and says so), reset camera to default framing, hide interface. Plain
rows, no icon-only controls, every control labelled. Populated state only —
everything else is not applicable, since this panel reads and writes local
settings and cannot fail visibly.

**5. STATION UNAVAILABLE — NEAREST LIVE OFFER.** A compact card, centred over
calm still water. States plainly that this station is not reporting, gives the
last time it did if known, and offers the nearest reporting station as a single
primary action, naming it — "Go to 46042 · Monterey Bay, 34 km away". A secondary
action returns to the globe. Never a dead end, never a raw error code. Build the
populated state and the variant where no nearby live station exists either.

**6. REDUCED CAPABILITY NOTICE.** The full product, working, with the simpler
ocean, plus one quiet dismissible line explaining that a simplified ocean is
shown and why. Readout, spectrum plot and audio fully present and fully
functional. It must read as a deliberate complete experience: someone who never
sees the high-fidelity version should not feel they were given a broken page.
States: populated, dismissed.

**7. DATA PROBLEM — BANNER AND RETRY.** A slim banner docked to the top edge in
the alert colour at low saturation, stating live data is unavailable, showing the
age of the last known reading, with a retry action. Behind it the water continues
to move from the last known reading — it does not freeze and does not empty. The
throttling indicator lives here too: when rendering is deliberately reduced
because the tab lost focus or the machine is on battery, a small unalarming
marker says so, so nobody thinks the product broke. States: populated
(unreachable), retrying, recovered.

**8. ABOUT AND ATTRIBUTION.** A single narrow panel of text: two short paragraphs
on what the product does, the NOAA NDBC attribution, a plain-language note that
readings update roughly hourly so "now" means "the most recent measurement", and
a link out to the source. No team page, no logos, no marketing. Populated only.

**9. UNKNOWN STATION.** Same compact card treatment as screen 5, over calm water.
States that the ID was not found, offers the globe as primary action and search
as secondary. Populated only.

### Interface constraints

- Responsive web. Real keyboard navigation throughout: the globe operable without
  a mouse, station rows reachable by tab, every interactive element with a
  visible focus state in the amber accent at a minimum 2px offset ring. Not a
  phone app in a browser frame.
- Contrast: body text 4.5:1 minimum against its panel, large readout numbers 3:1
  minimum. Because panels sit over unpredictable moving water, every panel needs
  a scrim opaque enough that these ratios hold over both the brightest and
  darkest water the renderer produces.
- Touch targets 44×44px minimum on every control at every size.
- Never use colour alone to carry meaning. Station status, data provenance and
  alert states must each be distinguishable in greyscale.
- No stock photography, no photographs of the sea, no illustrated waves, no
  gradients pretending to be water. The only water is the rendered water.
- No modal dialogs except screens 5 and 9. Nothing that must be dismissed before
  the visitor can see the ocean.
- No sign-up, no email capture, no cookie banner, no newsletter, no marketing
  surface anywhere.
- Audio never starts on its own; the first click must feel like an invitation.
- Everything must remain legible over water in motion — check every panel against
  both a calm dark sea and a bright foaming one.

## How this build is verified

**This project is verified by three commands.** Wire them up in milestone 1 and
keep them true for the rest of the build.

| Command | Budget | What it runs |
|---|---|---|
| `npm run verify` | **≤ 15 seconds** | `tsc --noEmit` across app and Worker, ESLint, `vitest run` unit tests only |
| `npm run smoke` | **≤ 120 seconds** | exactly one Playwright end-to-end test per user journey |
| `npm run verify:all` | no budget | `verify` + `smoke` + `vitest run` with the Workers pool + `vite build` |

**Write exactly one smoke test per user journey, and no other test.** Not one per
capability, not one per screen, not one per endpoint — one per journey, tagged
`@smoke`. There are five journeys, so the smoke tier ends with five tests. Add no
coverage tool and no coverage threshold. Do not write a test because a piece of
code looks untested. A unit test is written only for logic whose correctness is
genuinely non-obvious — here that means the NDBC fixed-width parser, the `MM` to
null mapping, the spectrum derivation, the great-circle nearest-station search,
the URL state round-trip, and the `localStorage` wrappers' failure handling. If
you are unsure whether something deserves a unit test, it does not.

**When a test fails, re-run that one test by name until it passes.** Never re-run
the whole tier to check a one-line fix; re-run the tier once at the end to
confirm. A tier re-run costs its entire budget, a single test costs seconds, and
a fix usually takes several attempts.

**The budgets are hard limits, not targets.** If `verify` exceeds 15 seconds or
`smoke` exceeds 120 seconds, that is a defect to fix before moving on: run tests
in parallel, move a test down a layer — a browser test that only checks a JSON
fact becomes an HTTP test — or delete a duplicate. Never raise a budget. Never
report a budget as met without the measured time.

**WebGPU in headless browsers is unreliable, so the smoke tier does not depend on
it.** Run all Playwright journeys against `?forceWebGL=1`, and assert on the DOM,
the readout values, the audio graph state, and the canvas being present and
painting — never on pixels. Add a separate opt-in Playwright project launched
with `--enable-unsafe-webgpu --use-angle=swiftshader` that exercises the compute
path; exclude it from `smoke`, and let it be slow. That the water agrees with the
reading is verified by unit tests on the spectrum math plus a human looking at it
on real hardware.

Two things also belong in the built app, because they make a flow walkable by
hand and are what make a one-per-journey smoke test possible to write at all:

- **Every route reachable by direct URL**, so a journey can be entered at any
  point rather than clicked into from the start.
- **Empty, loading, error and success states reachable on demand** — through real
  data or an obvious control, not by waiting for the right conditions. For this
  project that means query parameters or a settings control that can force the
  reduced-capability notice, the data-problem banner, and the throttled state.

## Documentation you must write

Three files, written from the code as actually built. Where the code and this
prompt disagree, the code wins in the description and the gap is recorded in
`DECISIONS.md`. Committed, or they do not exist.

**`README.md`** — for a competent stranger opening the repository:
- What this is, in two or three sentences
- The stack, briefly
- How to set it up and run it locally — exact commands, in order
- Required environment variables and what each is for. **Never real values**
- How to deploy
- Project structure — top-level shape, one line per directory
- The note that a Cloudflare Rate Limiting Rule on `/api/*` must exist before the
  URL is shared publicly
- Credit: NOAA NDBC as the data source; the Tessendorf and Horvath papers and the
  `poseidon` repository as inspiration for the ocean
- The path to the project's note in the Obsidian vault:
  `20-Personal/Proyectos/The Sea, Right Now/The Sea, Right Now.md`

**`AGENTS.md` — the single instruction file** for the next agent that opens this
repository:
- The real commands: build, run, deploy, lint
- The current stack and where each piece lives
- The project's actual conventions, as the code does them
- Anything surprising: the WebGL fallback needing its own ocean, the `MM`-to-null
  rule, the per-isolate rate limiter being approximate, the poseidon licensing
  note
- **A `## Verification` section**, written so someone who has never seen this
  prompt can act on it alone. It contains: the three commands with their budgets
  and what each runs; the rule that a failing test is re-run alone by name, never
  by re-running its tier; the rule that a budget breach is a defect fixed by
  parallelizing, moving a test down a layer, or deleting a duplicate — never by
  raising the budget; and the rule that tests are born only from a new journey
  (one smoke test) or a real bug (one regression test, **written failing first**
  so it is proven to catch the thing). Then the change protocol as a numbered
  list: make the change → run `verify` and iterate there → if the change altered
  an existing journey, update that journey's smoke test in the same commit (this
  is not new coverage and the growth rule does not gate it; a smoke test that no
  longer matches its journey is a broken test, not a passing one) → if it added a
  journey, add its one smoke test → if it fixed a bug, add its one regression
  test → run `smoke` before committing → run `verify:all` before deploying →
  record it per the table below.
- **A `## Docs are part of the change` section** — a table mapping what you
  changed to what to update: commands and env vars → **Commands**; stack and
  services → **Stack**; invariants → **Conventions**; an implementation choice →
  `DECISIONS.md`; a change in what the product does → `docs/changes.md`;
  internals only → nothing. Four rows are not optional: an **altered journey** →
  that journey's smoke test, updated in the same commit; a **fixed bug** → one
  regression test written failing first; a **budget breach and its fix** →
  `DECISIONS.md` **with the measured timing**, because without the number someone
  later re-adds the slow test having no idea why it left; and a change to **the
  verification commands or budgets themselves** → `AGENTS.md`. Then three rules:
  **edit in place** (never append a changelog; `AGENTS.md` is the only file to
  change); **the code wins** (these files describe what the code does now; a doc
  that disagrees with the code is a bug in the doc); and **never rewrite the spec
  documents** — `docs/01-idea.md` through `docs/04-build-prompt.md` are the record
  of what was asked for, so a change that makes one of them wrong is recorded in
  `docs/changes.md`, never edited into the spec. Close by separating the two
  record files — `DECISIONS.md` at the repo root for implementation choices made
  while coding, `docs/changes.md` for changes to what the product does, with
  "would a user notice?" as the test — and by asking for one dated line in the
  project note's `## Registro` whenever behaviour changed.

**`CLAUDE.md` is a pointer, not a copy.** Write it once, as a handful of lines
naming `AGENTS.md` and saying the instructions live there — nothing else, and
never content duplicated from it. Two instruction files that disagree is worse
than having none: an agent reads the stale twin in preference to the current one
and is confidently wrong. A pointer cannot drift, because there is only ever one
file to change. Do not invent a third arrangement — no summary, no index, no
quick reference that repeats the commands.

**`docs/` stays current.** The four documents in `docs/` describe what was
specified. If the build departs from them in a way that matters — a component
swapped, an entity renamed, a capability implemented differently — append a dated
line to `docs/changes.md` saying what changed and why. Do not rewrite the
specification documents to match the build.

## Milestones

**Milestone 1 — foundation and a live deploy.**
Steps: create the GitHub repository and push. Scaffold Vite + TypeScript + React
with `@cloudflare/vite-plugin`. Create the Worker with a health route. Configure
static assets. Bind the custom domain `sea.vicaai.dev` and deploy something live.
Register the three commands `verify`, `smoke` and `verify:all` in `package.json`
exactly as named. Add ESLint flat config and Vitest. Add a Playwright config with
the `@smoke` tag and the forced-WebGL project, with no tests in it yet. Add one
GitHub Actions job running `verify:all` on push to the default branch. Write
`AGENTS.md`, the `CLAUDE.md` pointer, and an empty `DECISIONS.md`. Write
`.dev.vars.example` and `.gitignore`.
Capabilities covered: none — this is the rails everything else runs on.
Exit checks:
- `npm run verify` → exits 0, and report the measured time; must be ≤ 15s
- `npm run smoke` → exits 0 with zero tests (correct at this stage)
- `npm run build` → exits 0, no errors
- `curl -sI https://sea.vicaai.dev` → HTTP 200 over TLS
- The GitHub Actions run for the initial push → green
✅ Playtest: the person can open `https://sea.vicaai.dev` and see a deployed page.
📍 Checkpoint, then continue immediately.

**Milestone 2 — journey 1: see one station's water.**
Steps: implement `GET /api/stations` (fetch and parse `activestations.xml`, cache
24h, filter DART and coordinate-less stations, sort by id) and generate the
bundled `stations.snapshot.json`. Implement `GET /api/station/:id` — validate the
ID, check index membership, fetch `.txt` and `.spec`, parse fixed-width columns,
map `MM` to null, set `fieldSources`, cache 5 minutes, send the descriptive
`User-Agent`. Implement the spectrum derivation. Build the three.js scene with
`WebGPURenderer`, the cascaded FFT ocean in TSL compute, the free camera with the
low default framing and a reset action, the readout with all three provenance
treatments, the spectrum plot, the reading-age element, and the cold-load state.
Wire the two-`SpectrumParams` interpolation.
Capabilities covered: C7, C8, C9, C10, C15, C16, C17, C21, C22.
Exit checks:
- `curl -s https://sea.vicaai.dev/api/station/46042` → 200, body contains
  `stationId`, `observedAt` and `fieldSources`
- `curl -so /dev/null -w '%{http_code}' https://sea.vicaai.dev/api/station/ZZZZZ`
  → `404`
- Open `https://sea.vicaai.dev/?station=46042` → water is moving, the readout
  shows a real wave height and a reading age, and the spectrum plot is drawn
- Unit tests for the parser pass, including a fixture with `MM` in the wave
  columns asserting `null` and `absent`, not `0`
- `npm run verify` green, measured time reported, ≤ 15s
- The journey-1 smoke test green
📍 Checkpoint, then continue immediately.

**Milestone 3 — journey 2: hear it.**
Steps: build the Web Audio graph. Implement the literal mapping (broadband noise
shaped by the spectrum; dominant period sets the swell rhythm, height sets
intensity, wind adds hiss) and the tuned mapping (oscillators and filters forming
a drone from the same numbers). Gate the first sound on an explicit user gesture.
Build the audio control cluster, the mapping switch, volume and mute. Persist
`audioMode`, `volume` and `muted` in `localStorage` through the wrapped accessor.
Capabilities covered: C12, C13, C14.
Exit checks:
- Open `/?station=46042`, click the audio control once → audio starts in the
  literal mapping
- Switch to Tuned → the sound changes with no page reload and no gap
- Set volume to 0.3, reload → the volume and mapping are restored and audio is
  waiting for a gesture
- `npm run verify` green, measured time reported, ≤ 15s
- The journey-2 smoke test green (asserts the audio graph state, not sound)
📍 Checkpoint, then continue immediately.

**Milestone 4 — journey 3: find a station.**
Steps: build the globe — sphere, land, hairline coasts, `InstancedMesh` pins with
the three status treatments, hover labels, click picking, keyboard operability.
Add the honest coverage line naming the network. Build the stations panel with
search over the in-memory index. Implement the great-circle nearest-live-station
search and the station-unavailable card with its named primary action and its
no-nearby variant. Build the unknown-station card.
Capabilities covered: C1, C2, C3, C4.
Exit checks:
- Open `/` → the globe renders with pins in three visually distinct states
- Search "Monterey" → the list filters; clicking the row opens `/?station=46042`
- Click a station with no usable data → the card names a specific nearby live
  station, and taking it loads that station's water
- Open `/?station=ZZZZZ` → the unknown-station card, not a blank page
- Unit tests for the great-circle search pass
- `npm run verify` green, measured time reported, ≤ 15s
- The journey-3 smoke test green
📍 Checkpoint, then continue immediately.

**Milestone 5 — journey 4: keep it and share it.**
Steps: implement the favourites store with `schemaVersion`, dedup on write and
the 100 soft cap. Build the star control, the Favourites segment, per-row
removal, the favourites empty state and the at-cap message. Build the search
no-matches empty state. Implement URL state — read and write `?station=` and
`&mode=`, ignore unknown parameters — and the copy-link control with its inline
confirmation. Ensure a cold load on a shared URL goes straight to the station.
Capabilities covered: C5, C6, C19, C20.
Exit checks:
- Before favouriting anything, the Favourites tab shows the explanatory empty
  state
- Favourite a station, reload → it is still listed; remove it → it is gone after
  a reload
- Click copy link → the clipboard holds
  `https://sea.vicaai.dev/?station=<current id>`
- Open that URL in a fresh browser profile → it lands on that station's water
  with no signup and nothing to dismiss
- Unit tests for the URL round-trip and the storage wrappers pass, including a
  corrupt-value case that yields defaults
- `npm run verify` green, measured time reported, ≤ 15s
- The journey-4 smoke test green
📍 Checkpoint, then continue immediately.

**Milestone 6 — journey 5: honest and usable on any machine, and finish.**
Steps: implement the Gerstner fallback ocean and the capability detection that
selects it, plus `?forceWebGL=1`. Build the reduced-capability notice and its
dismissed state. Implement `prefers-reduced-motion` handling with the manual
override in the settings panel, and the calmer rendering mode. Build the
hide-interface mode with pointer-movement fade-in. Implement throttling on
`visibilitychange` and the Battery Status API with its visible indicator.
Implement the data-problem banner with last-known-reading age and a working
retry, and the Worker's `503`-with-last-cached behaviour. Implement the
per-isolate token-bucket rate limiter returning 429 with `Retry-After`. Build the
settings panel and the about-and-attribution panel. Remove or gate every mock and
stub introduced in earlier milestones. Write `README.md` and bring `AGENTS.md` up
to date against the finished code.
Capabilities covered: C11, C18, C23, C24, C25.
Exit checks:
- Open `/?station=46042&forceWebGL=1` → a working simplified ocean, with readout,
  spectrum plot and audio all functioning, and the notice line present
- Hide the tab for 60 seconds, return → the throttle indicator appeared and
  rendering resumed
- Force an upstream failure → the banner shows with the last reading's age, the
  water keeps moving, and retry works
- Set the OS reduced-motion preference → the calmer rendering is active and
  interface animation is off; the settings override restores full motion
- Send 61 requests in a minute to `/api/station/46042` from one IP → at least one
  `429` with a `Retry-After` header
- `grep -ri "mock\|stub\|fixture" src/` → no result reachable from a user journey
- `npm run verify:all` → passes end to end; report the measured `verify` and
  `smoke` times
- The GitHub Actions run → green
✅ Playtest: the whole product, on any machine.
📍 Checkpoint, then the final report.

## Constraints and watch-outs

- **NDBC readings update roughly hourly**, with most data available about 25
  minutes past the hour. "Live" is coarser than the word suggests. Never imply
  second-by-second freshness anywhere in the interface.
- **NDBC sends no CORS headers.** The page can never fetch it directly;
  everything goes through the Worker.
- **NDBC asks that retrievals be kept minimal.** Respect the caches. Do not build
  a poller over all stations.
- **`MM` means missing.** Mapping it to `0` would render a flat sea and report a
  measurement that was never taken. This is the single most damaging parsing bug
  available in this project.
- **WebGL 2 has no compute shaders.** Do not try to run the FFT there.
- **`ShaderMaterial`, `RawShaderMaterial` and `EffectComposer` are unsupported on
  the WebGPU path.** Node materials and TSL only. Example code found online for
  the WebGL renderer will not port directly.
- **The `poseidon` repository declares no license.** Read it, do not copy it.
- **Workers free plan is 100,000 requests/day; the paid plan includes 10 million
  requests and 30 million CPU-milliseconds per month.** This project should use a
  tiny fraction. If request volume ever looks large, the cause is almost
  certainly an accidental poll loop.
- **The in-Worker rate limiter is per-isolate and therefore approximate.** It is
  defence in depth. The hard limit is a dashboard rule; say so in `README.md`.
- **Continuous WebGPU rendering drains laptop batteries.** Throttling is a
  requirement, not an optimisation, and bad word of mouth is the cost of getting
  it wrong.
- **Never commit secrets.** No keys in the repo, in a log, or in a checkpoint.

## Decisions made

These were open questions in the earlier documents. They are settled. Do not
reopen them.

1. **No accounts, no database.** Favourites and preferences live in
   `localStorage`; a shareable URL is the sharing mechanism. From
   `docs/01-idea.md`.
2. **Default camera framing is low on the surface**, horizon in the upper third.
3. **Coverage promise is the US buoy network, not "any coastline on Earth."** A
   check on 2026-08-25 against ten coastlines found moored buoys near 3 of 3 US
   locations and 0 of 5 outside US waters — Nazaré, Bondi, Biarritz, Ipanema and
   Puerto Escondido returned nothing; Cabo San Lucas and Cancún returned passing
   ship reports only. The globe therefore presents coverage honestly and names
   whose network it is. Non-NOAA sources remain out of scope for this build.
4. **The shared URL encodes the station, and optionally the audio mode. Camera
   position is not encoded** — links stay short and stable.
5. **Public URL is `https://sea.vicaai.dev`.** Product name: "The Sea, Right
   Now". No wordmark or logo is specified; nothing in the design depends on one.
6. **The tuned audio mapping never engages automatically on a flat sea.** The
   literal mapping stays literal, however dull the conditions; switching is the
   visitor's choice. Honesty over prettiness.
7. **NOAA attribution** appears as a persistent low-emphasis credit bottom right
   plus the about panel, which also explains that readings are roughly hourly.
8. **Rate limiting** is implemented in two layers as specified in `## Security`.
   This resolves the one open security item from `docs/02-architecture.md`.
9. **The fallback ocean is Gerstner sum-of-sines**, not a fragment-shader FFT.
   The fragment-shader FFT remains the upgrade path if the no-WebGPU share turns
   out to matter; that decision belongs to real traffic, not to this build.
10. **`.data_spec` directional spectra are out of scope for this build.** The
    ocean is driven by parameters derived from `Hs`, `Tp` and direction.
11. **The ocean is implemented from the published technique, not copied from
    `poseidon`**, which declares no license.
12. **All interface copy is in English.**

## Expected output

- A GitHub repository containing the full project, pushed and current.
- A live application at `https://sea.vicaai.dev` serving the globe and the sea
  view, with `/api/stations` and `/api/station/:id` responding.
- `README.md`, `AGENTS.md`, `DECISIONS.md` at the repo root, and `CLAUDE.md` as a
  pointer to `AGENTS.md`.
- Five Playwright smoke tests, one per journey, and unit tests for the parser,
  the spectrum math, the nearest-station search, the URL round-trip and the
  storage wrappers.
- A green GitHub Actions run of `verify:all` on the default branch.
```

## 3. Coverage

Built by reading the emitted prompt above.

**25 capabilities in `docs/01-idea.md` → *What it does*. 25 in the prompt. All 25
mapped to exactly one milestone.**

| Capability | Milestone |
|---|---|
| C1 · Globe with every station plotted, live/stale/dead at a glance | M4 |
| C2 · Click a pin and land on that station's water | M4 |
| C3 · Search by name or station ID | M4 |
| C4 · Dead station offers the nearest reporting station | M4 |
| C5 · Favourite, persist, list, remove individually | M5 |
| C6 · Favourites empty state | M5 |
| C7 · Full-frame ocean from the live reading | M2 |
| C8 · Interpolated change on a new reading, never snapping | M2 |
| C9 · Free camera, low default framing | M2 |
| C10 · Reset to default framing in one action | M2 |
| C11 · Reduced-motion rendering, automatic and overridable | M6 |
| C12 · One click starts sound, literal mapping first | M3 |
| C13 · Switch literal / tuned without reloading | M3 |
| C14 · Volume and mute, remembered | M3 |
| C15 · Persistent readout panel | M2 |
| C16 · Measured vs interpolated vs absent | M2 |
| C17 · Live spectrum plot | M2 |
| C18 · Hide chrome, fade back in on pointer movement | M6 |
| C19 · Copy a URL encoding the station | M5 |
| C20 · Shared URL opens cold on that station | M5 |
| C21 · Reading age stated plainly when old | M2 |
| C22 · Deliberate cold-load state | M2 |
| C23 · Honest usable experience with no WebGPU | M6 |
| C24 · Throttling on blur or battery, visibly | M6 |
| C25 · Last known reading, age and retry when NOAA is down | M6 |

Per milestone: M1 = 0 (foundation), M2 = 9, M3 = 3, M4 = 4, M5 = 4, M6 = 5.
Total 25.

Five journeys, five milestones delivering one each, five smoke tests.

## 4. If it was split

Not split. One prompt, one run.
