# Effect v4 stable cutover (ClawQL)

**Status:** In progress on `cursor/effect-v4-stable-f4ec` — `effect@4.0.0` GA  
**Created:** 2026-09-02 (as RC spike); **cutover started:** 2026-10-02  
**Tracking issue:** [#1034](https://github.com/danielsmithdevelopment/ClawQL/issues/1034)  
**Baseline (pre-cutover):** `effect@3.22.1`  
**Target (this branch):** `effect@4.0.0` + `@effect/opentelemetry@4.0.0` (singular Effect line; `@effect/platform` removed — folded into `effect`)

---

## Why this doc exists

ClawQL’s **Effect everywhere** claim is enforced by `npm run check:effect-every-package` (every `packages/*` declares `effect` and ships a `Context.Service` + `Layer`).

Effect **v4.0.0** is stable GA (2026-10-01). This document tracks the production cutover from the former RC spike checklist.

---

## Cutover inventory (v4)

| Area | Status |
|------|--------|
| Root / workspace `effect` pin | `4.0.0` |
| `@effect/opentelemetry` | `4.0.0` (`OtelTracer` / `Resource` bridge in `src/composition/effect-otel-bridge.ts`) |
| `@effect/platform` | **Removed** (folded into `effect`) |
| `Context.Tag` → `Context.Service` | Done (codemod + `Context.Service.Shape`) |
| `Effect.catchAll` → `Effect.catch` | Done |
| `Effect.either` / `Either` → `Effect.result` / `Result` | Done |
| Schema MCP input modules | Migrated (`annotate`, `check(is*)`, `decodeUnknownEffect`, `Union([...])`, `Literals`, `withDecodingDefaultType`) |
| All `packages/*` build + DTS | Green (30/30) |
| Root `tsc --noEmit` | Green |
| CI guard | Detects `Context.Service` (legacy Tag still accepted during partial trees) |

### Codemods (scripts/)

- `effect-v4-codemod-tags.mjs` — `Context.Tag` / `GenericTag` → `Context.Service`
- `effect-v4-codemod-renames.mjs` — `catchAll*` → `catch*`
- `effect-v4-codemod-either.mjs` — `either` / `Either` → `result` / `Result`
- `effect-v4-codemod-schema.mjs` — Schema / ParseResult renames

---

## Remaining work

1. **Domain Promise façades** — convert remaining bare `async` domain exports in packages (sandbox backends, etc.) to Effect primary APIs; keep CLI / Express / MCP as thin `runPromise` façades only.
2. **Full vitest matrix** — keep fixing package suites as CI surfaces v4 leftovers (e.g. `Layer.scopedDiscard` → `Layer.effectDiscard`).
3. **Close #1034** after merge + soak.

---

## Rollback

Pin root overrides back to `effect@3.22.1` and restore `@effect/platform` / Tag APIs from `main` prior to this branch’s merge commit.

---

## References

- [Effect 4.0 announcement](https://effect.website/blog/releases/effect/40)
- [MIGRATION.md](https://github.com/Effect-TS/effect/blob/main/MIGRATION.md)
- [Services: Tag → Service](https://github.com/Effect-TS/effect/blob/main/migration/services.md)
- [Schema v4](https://github.com/Effect-TS/effect/blob/main/migration/schema.md)
