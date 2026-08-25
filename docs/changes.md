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
