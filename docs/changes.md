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

## 2026-08-25 — Globe pin status reports what the index knows, not a live age

`docs/03-design-prompt.md` specifies three pin states by reading age: live within
two hours, stale within a day, dead beyond. Knowing that for all 1,275 stations
would require polling the whole NDBC network, which `docs/04-build-prompt.md`
rules out in the same breath as it asks for the states.

The globe therefore colours pins from NDBC's own index: a station the index marks
as having reported weather within eight hours is live, one still publishing
currents or water quality is stale, one publishing nothing is dead. Stations the
visitor has actually opened use their real reading age instead, and the pins
recolour when that becomes known. Hover labels are worded differently for the two
cases, so the interface never claims an age it does not have.

## 2026-08-25 — The sound works on an iPhone

The sonification played on every desktop browser and on no iPhone, in either
Safari or Chrome — the same engine on iOS, which is what identified it as a
platform policy rather than a browser bug.

Every sound this product makes is synthesised from the buoy's numbers; nothing is
downloaded and nothing is a recording. WebKit assigns a page like that the
*ambient* audio session category, which iOS silences with the Ring/Silent switch
regardless of volume, and whose level follows the ringer rather than the media
volume. A page playing a recording would have been given the `playback` category
for free. This one now asks for it, on the tap that starts the sound.

A visitor on a phone hears the sea with the switch in either position, and the
volume buttons change the sound instead of the ringer.
