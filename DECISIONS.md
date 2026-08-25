# Decisions

Implementation choices and defaults taken while building. Assumptions live here,
not in the specification documents in `docs/`, which are the record of what was
asked for.

Format: one entry per decision, newest section last.

---

## Milestone 1 — foundation

**`NDBC_USER_AGENT` defaulted.** No contact address was supplied at pre-flight,
so the outbound User-Agent is `TheSeaRightNow/1.0 (+https://sea.vicaai.dev)`,
set as a plain `vars` entry in `wrangler.jsonc`. It is not a secret. Replace the
URL with a mailbox if NDBC ever needs to reach a human.

**`CLOUDFLARE_ACCOUNT_ID` read from the local Wrangler session** rather than
requested from a human: `036c0bdf33d62256b3166b640d964496`. It is an account
identifier, not a credential, and is set as a GitHub Actions variable/secret for
CI. `CLOUDFLARE_API_TOKEN` is a true secret and is supplied by a human.

**`sea.vicaai.dev` was not free before this build.** It resolved through
Cloudflare to a Vercel deployment returning `404 DEPLOYMENT_NOT_FOUND` — a stale
or wildcard record. Binding the Workers custom domain took the hostname over
cleanly with no conflict reported by Wrangler.

**`@cloudflare/vitest-plugin@1` is used instead of
`@cloudflare/vitest-pool-workers`.** The package named in `docs/04-build-prompt.md`
was renamed for version 1 (Cloudflare changelog, 2026-08-19) and the Vitest 4
configuration API moved from `defineWorkersProject` to a `cloudflareTest()` Vite
plugin. Same product, current name. Recorded in `docs/changes.md`.

**TypeScript is pinned to `~5.9.3`, not the latest major.** TypeScript 7 is
published, but `typescript-eslint@8` declares `typescript <6.1.0` as a peer. The
prompt specifies TypeScript 5.x, which is also the compatible choice.

**Three TypeScript projects, typechecked in parallel.** `tsconfig.app.json` (DOM
libs), `tsconfig.worker.json` (Workers types) and `tsconfig.node.json` (build and
test configs) cannot share one program: the Workers and DOM globals collide on
names like `Response` and `caches`. `scripts/parallel.mjs` runs all three plus
ESLint plus the unit tests concurrently, which is what keeps `verify` inside its
15-second budget.

**No web fonts.** The design direction asks for "Inter, IBM Plex Sans or
equivalent" with true tabular figures, and a monospace face for IDs and
timestamps. Loading those from Google Fonts would send every visitor's IP to a
third party, which contradicts the project's own privacy stance ("no analytics,
no fingerprinting; one external service, NDBC"). Self-hosting the files would add
several hundred kilobytes to a bundle that is otherwise deliberately small. The
interface therefore uses the platform UI stack (`ui-sans-serif, system-ui,
-apple-system, "Segoe UI", Roboto`) and the platform monospace stack
(`ui-monospace, SFMono-Regular, Menlo`), with `font-variant-numeric: tabular-nums`
applied to every numeric surface. SF Pro, Segoe UI and Roboto all honour
`tnum`, so the mandatory tabular-figure requirement is met.

**`passWithNoTests` is enabled at the Vitest root and `--pass-with-no-tests` on
the Playwright smoke script** so milestone 1 can prove the three commands are
wired before any test exists. Both are removed once the first test in each tier
lands, so a broken include glob cannot pass silently.

---

## Milestone 2 — journey 1: see one station's water

**`Reading.fieldSources` uses all three states, and `fieldObservedAt` was added.**
NDBC publishes wind every ten minutes but waves only two or three times an hour,
so the newest row of `realtime2/{id}.txt` almost always has `MM` in the wave
columns. Taking only that row would show an em-dash for wave height on most
stations most of the time, which is true of the row but false about the buoy. So
each field takes the newest non-`MM` value within a three-hour window and is
marked `measured` when it came from the `observedAt` row and `derived` when it
was carried forward; `fieldObservedAt` records when each value was actually
taken. Beyond three hours the value is stale enough that `absent` is the more
honest answer.

**FFT cascade patch sizes are 1024 m, 96 m and 12 m, not 250 m, 17 m and 5 m.**
`docs/04-build-prompt.md` describes "three cascades covering roughly 250 m, 17 m
and 5 m wavelength bands". A patch can only carry wavelengths up to its own size,
and a 14-second swell is about 300 m long, so a 250 m patch would lose the swell
entirely — it would fall below the grid's fundamental. The patch sizes above
produce bands of wavelength above 40 m, 3.5–40 m, and below 3.5 m, which is what
the prompt describes. Verified in `tests/unit/fft-ocean.test.ts`.

**The spectrum has two components, not one.** A single JONSWAP peak at the
reported dominant period renders a mirror on a swell day: 1.2 m at 15 seconds is
a surface slope of about 0.003. Real seas carry a short wind sea on top of the
long swell, and NDBC publishes that split directly in the `.spec` file for
spectral stations (`SwH`/`SwP`/`SwD` and `WWH`/`WWP`). Where `.spec` exists the
split is used verbatim and marked `measured`; elsewhere the wind sea is estimated
from wind speed with Pierson–Moskowitz, capped so it can never claim more energy
than the buoy measured, and marked `derived`. Both components are normalised to
their own significant wave height, so the two together reproduce the reported
total exactly. Recorded in `docs/changes.md` as well, because a visitor notices.

**The spectrum normalisation is analytic, not tuned.** The GPU fills each grid
cell with `scale x shape x spread x (domega/dk)/k x dk^2`, and every cell
contributes twice. `spectrumEnergyScale` closes that to exactly `(Hs/4)^2` by
dividing out the two integrals on the CPU. Measured against a GPU buffer readback
during the build: cascade variances came out at 97%, 102% and 93% of prediction.

**The looping frequency quantisation applies to the phase only.** Snapping omega
to a multiple of `2*pi/240s` makes the surface periodic in time. Feeding the
snapped value into the spectrum as well shifts cells off a narrow swell peak,
which came out five times too flat before it was separated.

**Panel opacity is 86%, not the 72% in the design direction.** The same document
requires body text to hold 4.5:1 against its panel "over both the brightest and
darkest water the renderer produces". Over foam at 72%, secondary text
(`#8FA3B0`) falls to roughly 1.4:1. The interface constraint wins over the
palette number; the design explicitly says the scrim must be opaque enough for
the ratio to hold.

**The Gerstner fallback ocean was built in milestone 2, not milestone 6.** The
verification strategy requires every smoke test to run against `?forceWebGL=1`,
so journey 1 could not be tested at all without it. Milestone 6 still owns
capability detection, the reduced-capability notice and its dismissed state.

**The canvas element is created inside the effect, not rendered by React.** A
canvas hands out exactly one graphics context in its lifetime. Under StrictMode
the effect mounts, tears down and remounts, so a React-owned canvas reaches the
second renderer already dead — which showed up as a white frame and a "WebGL
device lost" on the fallback path.

**`/` renders the sea view for the last or default station.** The globe lands in
milestone 4 and takes over that route then. This is real water for a real
station, not a placeholder.

**The first sea-state transition is 2.5 seconds; later ones are 8.** Readings land
tens of minutes apart and should ease, but the product promises real,
reading-driven water within about three seconds of a cold load.

---

## Milestone 3 — journey 2: hear it

**Preferences are read synchronously on the first render, not in an effect.**
Reading them in an effect meant the audio graph was built from the defaults and
the stored volume never took, which the journey-2 exit check caught. `loadPrefs`
is fully guarded, so a private window or disabled site data still yields defaults
rather than throwing during render.

**The audio output is tapped with an `AnalyserNode` and its RMS published as
`data-audio-level`.** It turns "an audio graph exists" into "sound is actually
being generated", which is a much stronger thing for a journey test to assert,
and it is real state rather than a test hook. Measured in a real browser: silent
before the first click, 0.089 in the literal mapping, 0.033 in the tuned one, and
silent again after a reload.

**Noise is generated deterministically, not with `Math.random`.** The same
reading sounds the same on every visit and to every visitor, which is the same
promise the water makes.

**Both mappings are rebuilt rather than reconfigured when the mapping changes.**
They are genuinely different graphs. The master gain stays where it is and the
outgoing graph is disconnected then disposed after its fade, so switching has no
gap in it.

---

## Milestone 4 — journey 3: find a station

**Pin status comes from NDBC's own index flag, not from live readings.** The
design describes live (within 2 hours), stale (2–24 hours) and dead. Knowing that
for all 1,275 stations would need a poller over the whole network, which
`docs/04-build-prompt.md` explicitly rules out — it would raise request volume by
three orders of magnitude. So the globe uses what the index actually contains:
`met` (NDBC reported meteorological data within 8 hours) is live, a station still
publishing currents or water quality is stale, and one publishing nothing is
dead. For any station the visitor has actually opened, the exact reading age is
known and used instead, and the pins recolour. The hover label wording is
different in each case, because they are different claims — it never states an
age this project does not have. Recorded in `docs/changes.md`.

**Coastlines are Natural Earth 110m, rasterised in the browser.** Public domain,
so it can ship inside the bundle; 66 KB after rounding coordinates to two
decimals, which is about a kilometre and far finer than a few-hundred-pixel globe
can show. The polygons are drawn into an equirectangular canvas at runtime and
used as the sphere's texture, so there is no image asset and nothing that could
be mistaken for a photograph of the Earth.

**Picking casts one ray at the globe, not 1,275 rays at pins.** The sphere is a
single intersection test and the nearest station to the point it hits is a linear
scan over an array the page already has. It also means stations on the far side
can never be picked, because the ray stops at the front surface.

**One canvas and one renderer host both worlds.** Building a second GPU context
for the globe would cost a fresh context every time someone went back to the map;
`SceneHost` swaps worlds instead, and both stay alive once made.

**`formatDistance` says "right beside it" under 100 m.** Some stations share a
mooring — a saildrone parked at a buoy — and the nearest-station offer read
"0 m away", which looks like a bug rather than a fact.

**The journey-3 smoke test finds a silent station at run time rather than
hardcoding an ID.** Which buoys are down changes by the week. It asks the live
index for a station that is not reporting and has a reporting one within 300 km,
then probes a few. The no-nearby-station variant is covered by unit tests, which
can put a station in the Bay of Biscay without waiting for one to fail there.

---

## Milestone 5 — journey 4: keep it and share it

**At the favourites cap, the star refuses rather than dropping the oldest.**
Which one would go is not this product's decision to make. The panel says so
plainly and points at removing one.

**A refused clipboard is handled rather than pretended.** Clipboard access can be
denied outright. When it is, the link is written into the address bar and the
confirmation says where it went, instead of claiming a copy that did not happen.

**The shared link carries the station and, if one was chosen, the audio mapping —
and nothing else.** Camera position is deliberately not encoded, per the settled
decision in `docs/04-build-prompt.md`: a link means "this water", not "this exact
view of it", and it keeps the URL short enough to read aloud.

**Journey 4 opens the copied link in a fresh browser context**, not the same one
with storage cleared. It is the only way to prove the claim the product actually
makes — that someone who has never seen the site lands on that water with nothing
to dismiss.

---

## Milestone 6 — journey 5: honest on any machine, and finish

**Throttled frame rates differ by reason.** A hidden tab drops to 4 fps and half
resolution — nobody is looking, and it is the case that actually flattens a
battery. Running on battery drops to 30 fps at full resolution instead: a laptop
is the device people leave this open on all day, and 4 fps water there would make
the primary device the worst experience. Both are indicated.

**`?simulateOutage=1` arms one real failure rather than substituting fake data.**
The station loads normally, the next fetch throws before any request is made, and
the retry succeeds — the whole arc of populated, unreachable and recovered, with
real data at both ends. There is no mock reading anywhere in this project.

**The data-problem banner shows the reading's own age when the Worker cannot say.**
A client-side failure has no `staleForSeconds` from the server, so the banner
computes the age from `observedAt`. Either way it states an age it actually has.

**Hiding the interface fades every panel except the station header**, which stays
at 30% with its background removed. CSS opacity is multiplicative, so the whole
chrome cannot be faded to zero and one child brought back — the slots are faded
individually instead. Escape always restores it, so it can never be hidden
irrecoverably.

**The reduced-capability notice and the data-problem banner share one top stack.**
They collided when the notice sat at the bottom centre, over the readout. Only
the notice fades when the interface is hidden; a genuine data problem still
speaks up.

**A Worker-runtime test suite was added** (`tests/worker/api-contract.test.ts`).
It is the only place the anti-SSRF validation and the rate limiter run end to end
through the real handler, the real cache and the real `fetch`, rather than as
functions. It talks to live NDBC, because there is no mock upstream.

**The bundled station index and the coastlines live in `src/data`, not `public`,
and the Worker imports the snapshot rather than fetching it from the asset
store.** Vite rejects imports from `public/` — it is a copy directory, not part
of the module graph. It happened to work on the development machine and failed in
CI, which is where it was caught. Importing the snapshot into the Worker as well
means there is exactly one copy of the file in the repository and no round trip
on the failure path, which is the last place anyone wants one.

**Four controls were under the 44 px minimum and were fixed.** The mute button,
the "NOAA NDBC" attribution and the notice's dismiss were 32 px tall, and the
volume slider's hit area was its own 3 px track. The track is still 3 px — it is
the right weight to look at — but it is now drawn inside a 44 px input. Checked
across desktop, phone and the globe: nothing interactive is under 44×44.

**The smoke tier's per-test ceiling is 90 seconds on CI and 45 locally.** A
two-core runner with no GPU compiles and rasterises every shader on the CPU. The
first CI failure looked like a bug and was not: the trace showed a perfectly
rendered page with real readout values, reached slowly. CI also runs one
Playwright worker rather than two, because two software-rasterised pages on two
cores are each slower than one.
