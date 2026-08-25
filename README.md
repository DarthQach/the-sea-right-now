# The Sea, Right Now

A web page that renders the actual ocean, live. Spin a globe of NOAA's buoy
network, click one, and the page draws that patch of water — computed from the
wave height, period, direction and wind that buoy is reporting at this moment —
and synthesises the sound of it from the same numbers. Every wave on screen comes
from a real measurement taken within the last hour or so; nothing is a video, a
loop, or an artist's impression.

Live at **<https://sea.vicaai.dev>**. Free, no accounts, and a link opens on
exactly the same stretch of water for whoever you send it to.

## The stack

TypeScript throughout. React 19 for the interface, three.js r185 with
`WebGPURenderer` and TSL for the ocean and the globe, the Web Audio API for both
sonifications, and hand-written CSS. It is served by a single Cloudflare Worker
that also stands between the browser and NOAA — NDBC sends no CORS headers, so
the page can never fetch it directly.

There is no database. The only persistence is `localStorage` in the visitor's own
browser, and nothing in it ever leaves.

## Running it locally

```sh
npm install
npm run dev
```

That serves the page on <http://localhost:5173> with the Worker running in the
real `workerd` runtime, so `/api/*` behaves exactly as it does in production.

```sh
npm run verify      # types, lint and unit tests — under 15 seconds
npm run smoke       # one end-to-end test per user journey — under 120 seconds
npm run verify:all  # both of the above, plus Worker tests and a production build
```

`npm run smoke` needs a browser once: `npx playwright install chromium`.

## Environment variables

There are no API keys. NOAA NDBC is public and requires none.

| Variable | What it is | Where it lives |
|---|---|---|
| `NDBC_USER_AGENT` | Identifies this project to NDBC, with a contact address. **Not a secret.** | `vars` in `wrangler.jsonc`; override locally in `.dev.vars` |
| `CLOUDFLARE_API_TOKEN` | Deploy credential, Workers Scripts: Edit. **A real secret.** | GitHub Actions secrets |
| `CLOUDFLARE_ACCOUNT_ID` | Which Cloudflare account to deploy to | GitHub Actions secrets |

Copy `.dev.vars.example` to `.dev.vars` for local overrides. `.dev.vars` is
gitignored and must never be committed.

## Deploying

```sh
npm run deploy
```

That builds and runs `wrangler deploy`, which picks up the generated
`dist/the_sea_right_now/wrangler.json`. Pushing to `main` runs `verify:all` in
GitHub Actions and deploys from there when `CLOUDFLARE_API_TOKEN` is set.

### Before sharing the URL publicly

**A Cloudflare Rate Limiting Rule must exist on `sea.vicaai.dev/api/*`.** The
Worker has its own token bucket at 60 requests per IP per minute, but it is
per-isolate and Cloudflare runs many isolates, so it is defence in depth rather
than a hard limit. Configure the real one in the Cloudflare dashboard under
Security → Rate limiting rules.

## Project structure

```
src/app       React interface — panels, readout, spectrum plot, controls
src/scene     three.js — the sea and globe worlds, renderer, camera, frame loop
src/audio     Web Audio — both sonification mappings, generated live
src/lib       Shared logic — spectrum maths, geography, URL state, storage
src/worker    The Cloudflare Worker — routes, NDBC parser, caching, rate limiting
public        Static assets: the bundled station index and coastline outlines
scripts       One-off generators and the verification runners
tests/unit    Vitest — logic whose correctness is not obvious
tests/worker  Vitest inside workerd — the API contract
tests/smoke   Playwright — exactly one test per user journey
docs          The specification documents, and a log of departures from them
```

Working in this repository? Read [AGENTS.md](AGENTS.md) first.

## Credit

**The data is NOAA's.** Measurements come from the
[National Data Buoy Center](https://www.ndbc.noaa.gov/), operated by the United
States National Oceanic and Atmospheric Administration, as a US federal work.

**Coastlines** are [Natural Earth](https://www.naturalearthdata.com/) 110m
physical land, public domain.

**The ocean** is implemented from the published technique: Jerry Tessendorf's
*Simulating Ocean Water* for the inverse-FFT height field, a JONSWAP spectrum with
the Kitaigorodskii/TMA depth correction, and a Horvath-style directional spread
(Christopher Horvath, *Empirical Directional Wave Spectra for Computer Graphics*).
The `poseidon` ocean renderer is excellent reading and worth studying; **none of
its source is reused here**, because it declares no licence and there is
therefore no permission to reuse it.

Project notes live in the Obsidian vault at
`20-Personal/Proyectos/The Sea, Right Now/The Sea, Right Now.md`.
