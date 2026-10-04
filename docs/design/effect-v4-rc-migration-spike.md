# Effect v4 stable cutover (ClawQL)

**Status:** **Done** — merged to `main` via [#1197](https://github.com/danielsmithdevelopment/ClawQL/pull/1197) (`45186b77`, 2026-10-03)  
**Created:** 2026-09-02 (as RC spike); **cutover started:** 2026-10-02; **merged:** 2026-10-03  
**Tracking issue:** [#1034](https://github.com/danielsmithdevelopment/ClawQL/issues/1034) (close with this release-prep PR)  
**Baseline (pre-cutover):** `effect@3.22.1`  
**Shipped:** `effect@4.0.0` + `@effect/opentelemetry@4.0.0` (singular Effect line; `@effect/platform` removed — folded into `effect`)

---

## Why this doc exists

ClawQL’s **Effect everywhere** claim is enforced by `npm run check:effect-every-package` (every `packages/*` declares `effect` and ships a `Context.Service` + `Layer`).

Effect **v4.0.0** is stable GA (2026-10-01). This document recorded the production cutover from the former RC spike checklist and now stands as the closeout record.

---

## Cutover inventory (v4)

| Area                                                    | Status                                                                                                            |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Root / workspace `effect` pin                           | `4.0.0`                                                                                                           |
| `@effect/opentelemetry`                                 | `4.0.0` (`OtelTracer` / `Resource` bridge in `src/composition/effect-otel-bridge.ts`)                             |
| `@effect/platform`                                      | **Removed** (folded into `effect`)                                                                                |
| `Context.Tag` → `Context.Service`                       | Done (codemod + `Context.Service.Shape`)                                                                          |
| `Effect.catchAll` → `Effect.catch`                      | Done                                                                                                              |
| `Effect.either` / `Either` → `Effect.result` / `Result` | Done                                                                                                              |
| Schema MCP input modules                                | Migrated (`annotate`, `check(is*)`, `decodeUnknownEffect`, `Union([...])`, `Literals`, `withDecodingDefaultType`) |
| All `packages/*` build + DTS                            | Green                                                                                                             |
| Root `tsc --noEmit`                                     | Green                                                                                                             |
| Full CI (incl. Node 22/24/25 vitest)                    | Green on merge tip                                                                                                |
| Post-merge evidence                                     | [`effect-v4-cutover-evidence.md`](effect-v4-cutover-evidence.md) — catalog digest fail-closed, named suites, OTEL |
| CI guard                                                | Detects `Context.Service` (legacy Tag still accepted during partial trees)                                        |

### Codemods (scripts/)

- `effect-v4-codemod-tags.mjs` — `Context.Tag` / `GenericTag` → `Context.Service`
- `effect-v4-codemod-renames.mjs` — `catchAll*` → `catch*`
- `effect-v4-codemod-either.mjs` — `either` / `Either` → `result` / `Result`
- `effect-v4-codemod-schema.mjs` — Schema / ParseResult renames

---

## Post-merge hygiene (optional)

1. Keep docs/examples on `Context.Service` (not `Context.Tag`) as Learn/contributor pages churn.
2. Rebase Dependabot OTEL bumps carefully so `@opentelemetry/api-logs` stays a direct root dep (MCP Docker prune).
3. Further bare `async` domain façades → Effect-primary as they surface (Effect-everywhere rule unchanged).

---

## Rollback

Pin root overrides back to `effect@3.22.1` and restore `@effect/platform` / Tag APIs from `main` prior to merge commit `45186b77` (#1197). Prefer a follow-up revert PR over force-push.

---

## References

- [Effect 4.0 announcement](https://effect.website/blog/releases/effect/40)
- [MIGRATION.md](https://github.com/Effect-TS/effect/blob/main/MIGRATION.md)
- [Services: Tag → Service](https://github.com/Effect-TS/effect/blob/main/migration/services.md)
- [Schema v4](https://github.com/Effect-TS/effect/blob/main/migration/schema.md)
- Merge PR: [#1197](https://github.com/danielsmithdevelopment/ClawQL/pull/1197)
