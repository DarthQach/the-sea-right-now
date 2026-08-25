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
