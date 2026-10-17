# Postgres migration rollback policy

**Audience:** Engineers changing ClawQL Postgres DDL; ops running restores  
**Pairs with:** [`restore-drill.md`](./restore-drill.md) · [SOC 2 Type II packaging](../security/soc2-type2-readiness-packaging.md) (A1)  
**Status:** Binding eng policy — 2026-10-17

ClawQL Postgres migrations are **forward-only** idempotent DDL tracked in per-package `*_schema_migrations` tables. There is **no** automatic `down` migration runner. Rollback of a bad schema change is **restore from backup / PITR** (or a carefully authored manual reverse SQL reviewed like a forward migration).

## Inventory (code)

| Package            | Runner                                    | Version table                        |
| ------------------ | ----------------------------------------- | ------------------------------------ |
| `clawql-memory`    | `runPostgresHybridMemoryMigrationsEffect` | `clawql_pg_schema_migrations`        |
| `clawql-inference` | `runInferencePostgresMigrationsEffect`    | `clawql_inference_schema_migrations` |
| `clawql-ouroboros` | glue migrations                           | (events DDL; see package)            |
| `clawql-payments`  | audit store bootstrap                     | `clawql_payments_audit` (+ meta)     |

SQLite `memory.db` / JSONL stores are **out of scope** here — they have their own backup story under restore-drill.

## Rules for authors

1. **Forward only in code** — add a new integer version with `INSERT … ON CONFLICT DO NOTHING`. Never rewrite an already-shipped version’s DDL.
2. **Idempotent DDL** — prefer `CREATE TABLE/INDEX IF NOT EXISTS`, additive columns with defaults, or expand-contract patterns. Avoid destructive `DROP` / type changes in the same version that ships to prod.
3. **Expand → migrate → contract** for breaking shape changes:
   - **Expand:** add new column/table; dual-write if needed.
   - **Migrate:** backfill / cut readers.
   - **Contract:** drop old column in a **later** version after a release that no longer reads it.
4. **No silent data loss** — if a step can destroy rows, it must be gated (env flag / manual operator SQL) and called out in the PR + release notes.
5. **Document reverse** — every migration PR that is not purely additive must include a **Manual reverse** subsection (SQL + verification) in the PR body or a sibling `docs/` note. That reverse is **not** auto-run.

## Rollback paths (ops)

| Situation                                          | Action                                                                                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App bug, schema OK                                 | Roll back **image** / Helm revision; leave DB alone                                                                                                        |
| Bad forward migration just applied, backup current | **PITR / snapshot restore** to pre-migration; re-deploy prior chart                                                                                        |
| Need surgical undo without full restore            | Run the migration’s **Manual reverse** SQL in a maintenance window; bump a new forward version that matches reality (do not delete migration history rows) |
| Unknown schema drift                               | Stop. Diff live `\d` vs expected version. Prefer restore over improvising                                                                                  |

**Never** delete rows from `*_schema_migrations` to “re-run” a version in production. If you must re-apply, ship a **new** version.

## Pre-merge checklist

- [ ] Version constant bumped once; name string unique.
- [ ] DDL is idempotent under re-run / concurrent pods.
- [ ] Destructive steps absent **or** flagged + Manual reverse written.
- [ ] Restore-drill owner knows if this changes RPO assumptions (large table rewrite → longer restore).

## Verification

```bash
# After deploy: confirm version advanced
psql "$DATABASE_URL" -c "SELECT * FROM clawql_pg_schema_migrations ORDER BY version;"
psql "$DATABASE_URL" -c "SELECT * FROM clawql_inference_schema_migrations ORDER BY version;"
```

Unit/integration tests that open a temp Postgres (CI optional jobs) should call the Effect runners twice and assert no throw (idempotency).

## Type II evidence

Keep one dated note per quarter: “migration inventory reviewed; no unlogged destructive DDL; last restore drill covers Postgres.” Link this file + [`restore-drill.md`](./restore-drill.md) record.
