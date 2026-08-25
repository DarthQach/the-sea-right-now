# Changes

> Append-only record of changes to what this product does. One dated entry each.
>
> Implementation choices made while coding live in `DECISIONS.md` at the repo
> root — different file, different job.

## 2026-08-25 — Worker test package renamed upstream

`docs/04-build-prompt.md` names `@cloudflare/vitest-pool-workers` in the tech
stack. Cloudflare renamed that package to `@cloudflare/vitest-plugin` for its
version 1 release (2026-08-19) and moved the Vitest 4 configuration API from
`defineWorkersProject` to a `cloudflareTest()` Vite plugin. The build uses the
current package. Same product, current name; no user-visible difference.

## 2026-08-25 — The sea is rendered as two wave systems, not one

`docs/01-idea.md` and `docs/02-architecture.md` describe the ocean as driven by
significant wave height, dominant period and direction. Driving a single JONSWAP
peak from those alone renders a mirror on a swell day — 1.2 m at 15 seconds is a
surface slope of about 0.003 — because the chop a person actually sees on such a
day is the local wind sea, not the swell.

The ocean now renders a swell component and a wind-sea component together. For
spectral stations the split comes straight from NDBC's `.spec` file, which
publishes it; elsewhere it is estimated from wind speed and marked as derived.
The two are normalised so their total is exactly the reported significant wave
height, so nothing about the measurement is overstated. A visitor sees a real
sea instead of a mirror, and the spectrum plot shows both peaks.
