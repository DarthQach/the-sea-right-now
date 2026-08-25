# 01 · Idea — The Sea, Right Now

> Structured 2026-08-25 · Source: Notion "🌊 The Sea, Right Now" (Ideas Proyectos)
> Inspired by the open-source `poseidon` GPU FFT ocean renderer (owenyuwono/poseidon).

## 1. One-liner

A web page where you spin a globe, click any ocean buoy, and see — and hear — the
actual sea at that spot right now, rendered from the live reading that buoy is
reporting.

## 2. The problem

Nothing is broken. This is a thing that should exist and doesn't.

Every ocean you have ever seen on a screen is fictional: synthetic parameters,
a looping video, an artist's spectrum. The real data is public and free — the
NOAA NDBC buoy network reports wave height, period, direction, wind and water
temperature from hundreds of stations — and nobody has pointed a renderer at it.

The people who feel the gap:

- Anyone who left a coast behind and wants to know what it is doing *right now*,
  not what it looked like in a photo. Surf cams answer this only for a handful of
  breaks, at a fixed low-resolution angle, framed as a forecasting product.
- Anyone who likes an instrument pointed at the planet — the flight-radar, the
  seismograph, the live-webcam-of-a-volcano audience. There is no ocean entry in
  that genre.
- The author, who wants a tab worth leaving open.

The honest framing: this is built because it should exist, and because the data
being real is what makes it worth looking at.

## 3. Who it's for

**First user: me.** Built to be opened every morning.

**Second user: whoever gets sent a URL.** No account, no onboarding — they land
directly on a specific stretch of water. Within that group, three recognisable
shapes: the person with a coast they miss, the person who reads the numbers
(surfer, sailor, fisherman) and wants to *see* them, and the ambient-tab person
who will leave it running all day.

There is no second privileged role — no admin, no operator, no logged-in tier.
Every visitor sees the same product.

## 4. What it does

The complete capability set. Items marked ➕ were proposed during the interview
and accepted; everything else came from the original dump.

**Finding a stretch of water**

- Spin and zoom a 3D world globe with every NDBC station plotted, and tell live
  stations from stale and dead ones at a glance, before clicking anything.
- Click a station pin and land on that station's water — camera, audio and
  readout all switch to it.
- Search stations by name or station ID and jump straight to one.
- ➕ Click a station with no usable data and be offered the nearest reporting
  station in one click, rather than an error.
- Favourite the current station; favourites persist in this browser across
  visits, appear as a one-click list, and can be removed individually.
- ➕ See a deliberate empty state on the favourites list before any have been
  saved, that explains what favouriting does.

**Watching the water**

- See a full-frame ocean surface whose wave spectrum is computed from that
  station's live significant wave height, dominant and average period, wave
  direction, and wind speed and direction.
- Watch the surface change when a new reading arrives — interpolated between
  readings, never snapping, because readings land tens of minutes apart.
- Orbit, pan and zoom the camera freely: low on the surface (the default on
  load), up to a field view of the swell pattern, and anywhere between.
- Return to the default framing in one action after moving the camera.
- ➕ Get a calmer, lower-amplitude rendering automatically when the browser
  reports `prefers-reduced-motion`, and switch it manually either way.

**Hearing the water**

- Start the sound with a single explicit click (browsers never autoplay), and
  hear the sea synthesised from the same spectrum driving the water — the
  literal mapping plays first.
- Switch between the two mappings without reloading: **literal** (noise
  synthesis driven by the spectrum — period sets the swell rhythm, height the
  intensity, wind the hiss) and **tuned** (the same spectrum mapped to a musical
  drone that stays beautiful on a flat day).
- Set volume or mute, and have that choice remembered in this browser.

**Reading the instrument**

- Read a persistent panel showing station name and ID, significant wave height,
  dominant period, wind, water temperature, and the timestamp of the reading.
- ➕ Tell measured values apart from interpolated or absent ones — many stations
  report waves but not wind, or wind but not waves — so the panel never implies
  a measurement that was not taken.
- See the live spectrum plot the water is being built from, as a small graph
  next to the readout.
- Hide all chrome for a clean full-frame view, and bring it back — the readout
  fades in on pointer movement while hidden.

**Sharing it**

- Copy a URL that encodes the current station, and hand it to someone who lands
  on that exact water with no signup, no account, nothing to dismiss.
- Open a shared URL cold and go straight to that station rather than the globe.

**When the data or the machine is not cooperating**

- ➕ See the age of the reading stated plainly whenever it is old, with the water
  still rendering from it — never a spinner, never an implied "live" that isn't.
- ➕ See a deliberate cold-load state during the first NOAA response, which never
  looks like a broken page.
- ➕ Get an honest, usable experience with no WebGPU support: either a reduced
  WebGL rendering or a still frame, with the readout, the spectrum plot and the
  audio all still working.
- ➕ Have rendering throttle hard when the tab loses focus or the machine is on
  battery, with a visible indication that it is throttling deliberately.
- ➕ See the last known reading with its age, and a way to retry, when NOAA
  itself is unreachable.

## 5. Explicitly NOT doing

- **The macOS / tvOS app.** Screensaver, menubar app and the one-time purchase
  are a separate project, started after this one proves the water moves.
- **Forecast.** Nothing about what the sea will do later. This is a witness, not
  a prediction.
- **Historical playback.** No scrubbing back through past swell.
- **Accounts, sync, social.** No profiles, no login, no comments, no shared feed,
  no user-generated content.
- **Non-NOAA data sources.** No Copernicus/CMEMS or national-network adapters in
  this project. NDBC coverage is the map you get.
- **Surf-condition judgement.** No good/fair/poor ratings, no scores, no advice.
- **A packaged mobile app.** The page is responsive; there is no App Store or
  Play Store presence.
- **Monetisation of any kind.** No payments, no ads, no email capture. The web
  version is free forever by design.

## 6. Known constraints

- **Zero running cost.** Free tiers only.
- **Hosting is decided: Cloudflare.** Deploys to a subdomain of `vicaai.dev`;
  Cloudflare Workers is already paid for and is the intended runtime for any
  server-side piece (the NOAA proxy).
- **Data source is NOAA NDBC**, a US federal work — free and openly
  redistributable, with attribution.
- **Buoy readings update on the order of tens of minutes**, not seconds. "Live"
  is coarser than the word suggests; the product has to be honest about that
  rather than fake continuity.
- **Continuous WebGPU rendering drains laptop batteries.** Throttling is a
  requirement, not an optimisation.
- **No deadline** stated.

## 7. How I'll know it fulfilled the idea

⚠️ **Assumed** — proposed and accepted with "decide for me". Change by editing
this list; the first entry is the one that matters and should survive any edit.

1. **The falsifiable one:** when a real swell arrives at a station, the water
   visibly changes, and what is rendered agrees with the NDBC reading for that
   station at that time. If this fails, everything else is decoration.
2. Opening the page cold puts real, reading-driven water on screen within about
   three seconds, with a station name and a reading timestamp visible.
3. One click starts the sound, and a 1 m day and a 4 m day are audibly different
   without anyone explaining which is which.
4. Any station on the globe can be clicked and either loads its water or
   honestly offers the nearest live one.
5. A URL sent to another person lands them on the same water, with no signup.
6. An hour in a background tab on battery leaves the laptop unaffected.
7. A machine without WebGPU still gets something honest and usable.
8. **Someone who is not me leaves it open for a full working day.**

## 8. Open questions

- ⚠️ **Accounts (section 4).** Assumed out: shareable URL plus browser-local
  favourites, no auth, no database. Decided with "decide for me". Reverse by
  adding auth later; nothing else in the design has to change, and "your saved
  coastlines everywhere" stays available as the native app's reason to exist.
- ⚠️ **Success criteria (section 7).** Assumed as written above.
- **Default camera framing on load** — set to low on the surface by me, not
  stated. Trivial to change.
- **The coverage check, before any code.** Pull the NDBC station list and check
  how many coastlines people actually feel something about have a usable buoy
  nearby. An afternoon's work; it decides how big the promise on the landing
  page can be, and whether a second data source ever becomes worth it.
- **What exactly the shared URL encodes** — station only, or station plus camera
  and audio state.
- **Subdomain name** under `vicaai.dev`, and the product's public name.
- **Flat-day behaviour.** The literal audio mapping is honest and therefore dull
  when the sea is calm. Whether the tuned mapping should take over automatically
  below some threshold, or that is left entirely to the user, is undecided.
- **NOAA attribution wording and placement** in the UI.
