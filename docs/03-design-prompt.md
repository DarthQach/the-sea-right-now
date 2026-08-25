# 03 · Design Prompt — The Sea, Right Now

> Written 2026-08-25. Derived from `docs/01-idea.md` → *What it does* and
> `docs/02-architecture.md` → *The decision* (single web surface).

## 1. The prompt

```
Design the complete interface for a web product called "The Sea, Right Now."

WHAT THIS IS

The Sea, Right Now is a web page that renders the actual ocean, live. You spin a
3D globe covered in ocean buoy pins, click one, and the page draws that specific
patch of water — driven by the wave height, period, direction and wind that the
buoy is reporting at this moment — and synthesises the sound of it. It is not a
video, not a loop, and not an artist's impression: every wave on screen is
computed from a real measurement taken in the last hour. People will leave it
open in a background tab all day, and send each other links to specific stretches
of water.

The differentiator is entirely visual and it must dominate: the water is the
product. Every pixel of interface exists to sit quietly on top of a full-screen,
constantly moving 3D ocean without competing with it. If a screen you design
would look good with the water removed, the interface is too heavy.

There is a second, quieter identity underneath the ambient one: this is an
instrument. It shows the actual numbers, it shows the wave-energy spectrum it is
building the water from, and it is scrupulously honest about how old the reading
is and which values were measured versus filled in. Beautiful and truthful at the
same time — never beautiful at the expense of truthful.

AUDIENCE AND TONE

Three kinds of people, one interface:
- Someone who left a coast behind and wants to see what it is doing right now.
- Someone who reads ocean numbers already — a surfer, sailor or fisherman — who
  wants to see the numbers rather than just read them.
- Someone who collects live-instrument tabs: flight radar, seismographs, volcano
  webcams. This is the ocean entry in that genre.

None of them have an account. None of them were onboarded. Many arrive on a link
someone sent them and land directly on a specific buoy. They distrust anything
that feels like a marketing site, anything that asks for an email, and anything
that claims to be "live" while showing an obviously canned animation.

The tone is calm, precise, unhurried, and quietly confident. Think observatory
instrument panel or marine chart, not weather app and not surf brand. No
exclamation marks, no hype, no illustrations of waves — there is real water on
screen, so drawing a wave icon anywhere would be absurd.

ALL INTERFACE COPY IS IN ENGLISH.

VISUAL DIRECTION

Dark only. There is no light theme, and this is a deliberate decision, not an
omission: the interface always sits on top of rendered ocean, and light panels
over moving water are unreadable at any opacity. Design for dark and only dark.

Palette:
- Panel surface: #0B0F14 at 72% opacity with a heavy background blur, so the
  water is sensed through the panel but never legible through it.
- Panel border: 1px #FFFFFF at 8% opacity. Hairlines only, never heavy strokes.
- Primary text: #E8EDF2
- Secondary text and labels: #8FA3B0
- Single accent, warm amber: #FFB45A — interactive elements, the live indicator,
  the "click to hear" affordance, focus rings. Amber is chosen deliberately
  against the blue-grey of water so that anything interactive is unmistakably
  interface rather than ocean. Use it sparingly; if more than roughly 5% of the
  screen is amber, it has stopped meaning "you can touch this."
- Station status colours, which must NEVER carry meaning by colour alone:
  · Live (reported within 2 hours): #FFB45A, solid dot, with a subtle ring
  · Stale (2–24 hours): #8FA3B0, hollow dot
  · Dead (no data): #5A6670, small hollow dot at 50% opacity
  Each state also differs in fill, size and ring, so it is distinguishable in
  greyscale and by anyone who cannot separate those hues.
- Alert / data-problem state: #E4572E, used only for genuine failures.

Typography:
- Interface text: a neutral grotesk with true tabular figures — Inter, IBM Plex
  Sans or equivalent. Tabular figures are mandatory: the readout shows numbers
  that update every few minutes and they must not shift horizontally when the
  digits change.
- Station IDs, coordinates and timestamps: a monospace face — IBM Plex Mono,
  JetBrains Mono or equivalent.
- Scale: readout values 28–32px, their labels 11px uppercase with generous
  letter-spacing, body 14px, secondary 12px. The numbers are the biggest text on
  screen; nothing else competes.

Density and spacing: airy. Panels are small, anchored to the edges and corners,
with generous internal padding (16–20px) and clear separation between groups.
The centre of the screen is always water — never place a panel there except for
a modal that genuinely demands attention. Corner radius 12px on panels, 8px on
controls.

Motion: minimal in the interface. Fades and slides of 150–200ms with a gentle
ease-out, nothing bouncy, nothing that draws the eye away from the water. The
entire motion budget belongs to the ocean. Every interface animation must be
disabled when the operating system reports a reduced-motion preference.

Responsive priority: design desktop first at 1440×900 — this is a thing people
leave open on a laptop — then design a complete phone layout at 390×844. On
phone, side panels become bottom sheets that can be dragged up, the readout
condenses to a single row of three values with the rest one tap away, and the
globe gets larger hit targets. Never show a desktop panel scaled down on a phone.

Persistent elements, visible on every screen unless the interface is explicitly
hidden:
- Station name and ID, top left.
- Reading age, immediately beside it — the single most important honesty
  element. It reads "12 min ago" in secondary text when recent, and becomes
  visually louder as it ages.
- A small "NOAA NDBC" attribution, bottom right, at low emphasis, linking to the
  about panel.

SCREENS

Design these nine. They are one continuous single-page experience, not separate
pages — panels and overlays appear over a persistent 3D canvas — but design each
as its own composition.

1. THE SEA — THIS IS THE HERO SCREEN. DESIGN THIS ONE FIRST AND SPEND THE MOST
   TIME ON IT.
   Purpose: looking at, and listening to, one station's water.
   Layout: the ocean fills the entire viewport, edge to edge, with no letterbox
   and no frame. The camera sits low, near the surface, horizon visible. Over it:
   - Top left: station name, station ID in mono, reading age.
   - Bottom left: THE READOUT. Wave height, dominant period, wind, water
     temperature — each a large tabular number with a small uppercase label and
     its unit. Every value carries a quiet indicator of provenance: measured
     values are plain, interpolated or estimated values are marked with a small
     glyph and dimmed label, and absent values show an em-dash rather than a
     zero. Design all three provenance treatments explicitly; this is a core
     honesty requirement and the most commonly botched detail in the product.
   - Bottom left, directly above or beside the readout: THE SPECTRUM PLOT. A
     small graph, roughly 240×80, showing wave energy against frequency — the
     actual distribution the water is being generated from. Fine amber line on
     near-transparent ground, no gridlines heavier than 6% white, no chart
     junk, no legend. This is the nerd payoff and the thing people screenshot.
   - Bottom right: a compact control cluster — audio toggle, audio mapping
     switch (two labelled options, "Literal" and "Tuned"), volume, favourite
     (star), copy link, reset camera, settings, and hide interface.
   - Top right: a small globe thumbnail that returns to the globe view.
   States to design:
   · Loading — the cold boot, before any reading has arrived. Show the interface
     skeleton with dashes where numbers will be and a calm, still, dark water
     surface. It must never look broken or empty, and it must never show a
     spinner in the centre of the screen.
   · Populated — the normal case. Use realistic values: 2.4 m, 14 s, 11.8 kt,
     16.2 °C, and a real station name like "46042 · Monterey Bay, CA".
   · Populated with an old reading — the same screen where the reading is 6
     hours old. The age indicator is visually louder, and a single quiet line
     explains that the water is being drawn from the last reading. The water
     keeps moving; nothing is hidden or greyed out.
   · Populated with partial data — a station reporting wind but no wave height.
     Show how the readout handles missing values without looking broken.
   · Audio off versus audio on — design both. In the off state, the audio control
     is the most inviting element on screen: this single click is the moment the
     product proves itself, so make it quietly irresistible without being loud.
   · Interface hidden — the same water with everything faded out except an almost
     invisible station name and age. Design what returns on pointer movement.
   · Error — the reading could not be fetched at all. See screen 7.
   · Success — the link-copied confirmation. See screen 3's share treatment.
   · Limit — n/a, nothing is capped here.

2. THE GLOBE
   Purpose: choosing a stretch of water; also the first thing a cold visitor sees
   if no station is specified.
   Layout: a dark 3D globe, centred, with the ocean rendered as deep near-black
   blue and landmasses as flat dark grey with a hairline coast. Roughly 1,300
   station pins in the three status treatments described above. Hovering a pin
   raises a small label with station name, ID and last reading age. A search
   affordance sits at the top; a "favourites" affordance sits near it.
   Important honesty requirement: the buoy network this uses is operated by the
   United States, so pins cluster heavily on US coasts, Hawaii, Alaska, Puerto
   Rico and the Great Lakes, and much of the rest of the world's coastline has
   none. Design the globe so this reads as an honest map of a real network rather
   than as missing data — including a single quiet line of copy that says whose
   network it is, placed so a first-time visitor sees it without it being a modal
   to dismiss.
   States:
   · Empty — n/a; the station list always exists, it ships with the page.
   · Loading — globe present, pins fading in as the index resolves.
   · Populated — the normal case, with realistic pin density.
   · Error — the live station index could not refresh and a bundled snapshot is
     in use. A quiet line, not an alarm; the globe still works.
   · Success — n/a.
   · Limit — n/a.

3. STATIONS PANEL — SEARCH AND FAVOURITES
   Purpose: finding a station by name or ID, and returning to saved ones.
   Layout: a panel anchored to one side (bottom sheet on phone) with a search
   field at the top and two segments, "All" and "Favourites". Results are a list:
   station name, ID in mono, distance-free, with a status dot and last reading
   age on the right. Each row has a star for favouriting; favourited rows show a
   filled star. A row is one tap to open. Include the share/copy-link
   confirmation treatment here: a brief, quiet inline confirmation, never a
   full-width banner.
   States:
   · Empty — two distinct empty states, both required. (a) Favourites with
     nothing saved: explain in one calm sentence what favouriting does and how,
     and show the star glyph inline in the copy. (b) Search with no matches:
     offer the nearest alternative interpretation rather than a dead end.
   · Loading — n/a for search, which runs against a local index; design the
     momentary state anyway if the list is long.
   · Populated — a realistic list, mixing live, stale and dead stations so all
     three treatments are visible together.
   · Error — n/a; no network call.
   · Success — station favourited, and link copied.
   · Limit — favourites soft-capped at 100; design the message shown at the cap.

4. SETTINGS PANEL
   Purpose: the preferences that have nowhere else to live.
   Layout: a small panel with grouped rows — audio mapping (Literal / Tuned),
   volume, motion (Auto / Full / Reduced, where Auto follows the system
   preference and says so), reset camera to default framing, and hide interface.
   Plain rows, no icons-only controls, every control labelled.
   States: Populated only. Empty, loading, error, success and limit are all n/a —
   this panel reads and writes local settings and cannot fail visibly.

5. STATION UNAVAILABLE — NEAREST LIVE OFFER
   Purpose: the visitor clicked a pin with no usable data.
   Layout: a compact card, centred over a calm, still water surface. It states
   plainly that this station is not reporting, gives the last time it did if
   known, and offers the nearest station that IS reporting as a single primary
   action, naming it — "Go to 46042 · Monterey Bay, 34 km away". A secondary
   action returns to the globe. Never a dead end, never a raw error code.
   States: Populated, and a variant where no nearby live station exists either.
   Loading, empty, success and limit are n/a.

6. REDUCED CAPABILITY NOTICE
   Purpose: the visitor's browser or machine cannot run the high-fidelity water.
   Layout: the full product, working, with a simpler ocean — plus one quiet,
   dismissible line explaining that a simplified ocean is being shown and why.
   The readout, the spectrum plot and the audio are fully present and fully
   functional. This must read as a deliberate, complete experience, not as a
   degraded one: design it so someone who never sees the high-fidelity version
   would not feel they were given a broken page.
   States: Populated, and dismissed. Others n/a.

7. DATA PROBLEM — BANNER AND RETRY
   Purpose: the upstream buoy service is unreachable.
   Layout: a slim banner docked to the top edge, in the alert colour at low
   saturation, stating that live data is unavailable and showing the age of the
   last known reading, with a retry action. Behind it, the water continues to
   move from the last known reading — it does not freeze and it does not empty.
   Also design the throttling indicator here: when rendering is deliberately
   reduced because the tab lost focus or the machine is on battery, a small,
   unalarming marker says so, so nobody thinks the product broke.
   States: Populated (unreachable), retrying, recovered. Empty and limit n/a.

8. ABOUT AND ATTRIBUTION
   Purpose: what this is, where the data comes from, and the required credit.
   Layout: a single narrow panel of text — two short paragraphs on what the
   product does, the NOAA NDBC attribution, a plain-language note that readings
   update roughly hourly so "now" means "the most recent measurement," and a
   link out to the source. No team page, no logos wall, no marketing.
   States: Populated only.

9. UNKNOWN STATION
   Purpose: a shared link points at a station ID that does not exist.
   Layout: the same compact card treatment as screen 5, over calm water. States
   the ID was not found, and offers the globe as the primary action and search as
   secondary.
   States: Populated only.

CONSTRAINTS

- Platform: responsive web. Real keyboard navigation throughout — the globe must
  be operable without a mouse, station rows must be reachable by tab, and every
  interactive element needs a visible focus state in the amber accent at a
  minimum 2px offset ring. Do not design a phone app in a browser frame.
- Contrast: body text at 4.5:1 minimum against its panel, large readout numbers
  at 3:1 minimum. Because panels sit over unpredictable moving water, every panel
  needs an opaque-enough scrim that these ratios hold over both the brightest and
  darkest water the renderer produces — design and state that scrim.
- Touch targets: 44×44px minimum on every control, on every size.
- Never use colour alone to carry meaning. Station status, data provenance and
  alert states must each be distinguishable in greyscale.
- No stock photography, no photographs of the sea, no illustrated waves, no
  gradients pretending to be water. The only water is the rendered water.
- No modal dialogs except screens 5 and 9. Nothing that must be dismissed before
  the visitor can see the ocean.
- No sign-up, no email capture, no cookie banner, no newsletter, no marketing
  surface of any kind anywhere in the product.
- Audio never starts on its own; the design must make the first click feel like
  an invitation rather than a requirement.
- Everything on screen must remain legible over water in motion. Test every panel
  composition against both a calm, dark sea and a bright, foaming one.

DELIVERABLES

Design all nine screens at 1440×900 and the hero screen plus screens 2, 3 and 7
additionally at 390×844. Provide every state listed for each screen as its own
composition. Include a one-screen style sheet showing the palette with hex
values, the type scale, the three station status treatments, the three data
provenance treatments, and the focus state.
```

## 2. Visual direction rationale

Dark-only is not a style preference here, it is a legibility constraint: every
panel sits over a full-screen moving ocean, and there is no light surface that
stays readable over both foam and deep water. The single warm accent exists to
separate interface from ocean — amber is the one hue that cannot be mistaken for
water, so anything amber is unambiguously a thing you can touch.

The typography choice is driven by the readout: this product's credibility rests
on numbers that change every few minutes, and tabular figures are what stop those
numbers from twitching horizontally and looking fake. The spectrum plot gets
deliberate prominence for the same reason — it is the visible proof that the
water is generated from data rather than decorated with it.

Density is airy and edge-anchored because the centre of the screen is the
product. Everything else is instrumentation around the edge of a window.

## 3. Coverage

### Capabilities → screens

| Capability (`01-idea.md` → *What it does*) | Screen · State |
|---|---|
| Spin and zoom a globe with every station plotted, telling live from stale and dead at a glance | Globe · populated, loading |
| Click a station pin and land on that station's water | Globe · populated → The Sea · populated |
| Search stations by name or ID and jump to one | Stations panel · populated, empty (no matches) |
| ➕ Dead station offers the nearest reporting station in one click | Station unavailable · populated, and no-nearby variant |
| Favourite the current station; persists; one-click list; remove individually | The Sea · populated (star control) + Stations panel · populated, success, limit |
| ➕ Deliberate empty state on the favourites list | Stations panel · empty (a) |
| Full-frame ocean surface from the station's live reading | The Sea · populated — hero |
| Water changes on a new reading, interpolated, never snapping | Non-visual — a rendering behaviour, not a screen state. Surfaces only as the readout's values updating in place |
| Orbit, pan and zoom the camera freely; low default | The Sea · populated (no chrome change; camera is direct manipulation) |
| Return to default framing in one action | The Sea · control cluster + Settings panel · populated |
| ➕ Reduced-motion rendering, automatic and manually overridable | Settings panel · populated (Auto / Full / Reduced) |
| One click starts sound; literal mapping plays first | The Sea · audio-off and audio-on states |
| Switch literal / tuned without reloading | The Sea · control cluster + Settings panel · populated |
| Volume and mute, remembered | The Sea · control cluster + Settings panel · populated |
| Persistent readout: station, wave height, period, wind, water temp, timestamp | The Sea · populated |
| ➕ Measured values distinguishable from interpolated and absent | The Sea · populated with partial data — three provenance treatments |
| Live spectrum plot of the energy driving the water | The Sea · populated |
| Hide all chrome and bring it back; fades in on pointer movement | The Sea · interface hidden |
| Copy a URL encoding the current station | Stations panel · success (copy confirmation) + The Sea · control cluster |
| Open a shared URL cold and go straight to that station | The Sea · loading → populated; failure path is Unknown station · populated |
| ➕ Reading age stated plainly when old, water still rendering | The Sea · populated with an old reading |
| ➕ Deliberate cold-load state that never looks broken | The Sea · loading |
| ➕ Honest, usable experience with no WebGPU support | Reduced capability notice · populated, dismissed |
| ➕ Rendering throttles on blur or battery, visibly and deliberately | Data problem · throttling indicator |
| ➕ Last known reading with age and a retry when NOAA is unreachable | Data problem · populated, retrying, recovered |
| *(added, no capability — every product needs it)* NOAA attribution and what "now" means | About and attribution · populated |

### State matrix

| Screen | Empty | Loading | Populated | Error | Success | Limit |
|---|---|---|---|---|---|---|
| 1 · The Sea (hero) | n/a — always has a station or routes to 5/9 | ✓ | ✓ (normal, old reading, partial data, audio off/on, interface hidden) | ✓ → screen 7 | ✓ (link copied) | n/a — nothing capped |
| 2 · The Globe | n/a — index ships with the page | ✓ | ✓ | ✓ (bundled snapshot in use) | n/a | n/a |
| 3 · Stations panel | ✓ ×2 (no favourites; no search matches) | ✓ (long list only) | ✓ | n/a — local index, no network call | ✓ (favourited, link copied) | ✓ (100 favourites) |
| 4 · Settings panel | n/a — no list | n/a — local only | ✓ | n/a — cannot fail visibly | n/a — changes apply instantly | n/a |
| 5 · Station unavailable | n/a | n/a | ✓ (+ no-nearby variant) | n/a — this screen *is* the error path | n/a | n/a |
| 6 · Reduced capability | n/a | n/a | ✓ (+ dismissed) | n/a — this screen *is* the degraded path | n/a | n/a |
| 7 · Data problem | n/a | ✓ (retrying) | ✓ (unreachable, recovered, throttling) | n/a — this screen *is* the error path | ✓ (recovered) | n/a |
| 8 · About | n/a | n/a | ✓ | n/a | n/a | n/a |
| 9 · Unknown station | n/a | n/a | ✓ | n/a — this screen *is* the error path | n/a | n/a |

## 4. What to do with the output

Run the prompt in your design tool. Bring the results back and save them into the
repo under `design/` — images, exported files, whatever comes out.
`dev-system-04-build-prompt` takes them as taking precedence over the written
direction wherever the two differ, and the coding agent can only see what is in
the repository.

If nothing comes back, skill 4 builds the UI from **section 1 of this document —
the prompt itself, in full**: its screen list, its per-screen states, and its
visual direction. Not from the rationale in section 2, which is only the
reasoning. The build is never blocked waiting on design.

## 5. Open questions

- **⚠️ Assumed: interface language is English.** Not stated anywhere upstream.
  Reasoning: the product is shared by URL to strangers, the audience is global,
  and every value and station name coming from NOAA is already in English.
  Reverse it by saying so — Spanish copy runs roughly 20% longer and the readout
  labels and panel widths would need re-checking, nothing structural.
- **Coverage honesty on the globe.** The buoy network is US-operated, so pins
  cluster on US coasts and much of the world has none. The prompt requires the
  globe to present this as an honest map rather than missing data, and asks for
  one quiet line of copy naming whose network it is. The exact wording is open,
  and it is worth getting right — it is the first impression for anyone who spins
  the globe looking for their own coast.
- **Carried from `01-idea.md`, still open and both design decisions:** what the
  shared URL encodes beyond `?station=`, and whether the tuned audio mapping
  should take over automatically on a flat sea or stay entirely manual. The
  prompt currently assumes manual only.
- **The product's public name and subdomain**, still undecided, so no wordmark is
  specified. The prompt deliberately asks for no logo — add one later without
  disturbing any layout, since nothing in the design depends on it.
