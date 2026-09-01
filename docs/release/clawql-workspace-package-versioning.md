# ClawQL workspace packages — npm versioning policy

**Applies to:** every `packages/*` workspace package and the root `clawql-mcp` consumer.  
**Canonical targets:** [`scripts/release/package-npm-version-targets.json`](../../scripts/release/package-npm-version-targets.json)  
**Apply script:** `node scripts/release/apply-package-npm-versions.mjs`

---

## Summary

| Line | Package(s) | In-tree version | npm today | Rule |
| ---- | ---------- | --------------- | --------- | ---- |
| **Gateway** | `clawql-mcp` (root) | **8.0.0** | **7.2.0** | Major consumer surface; publish on `v8.0.0` tag |
| **First publish** | Most `clawql-*`, `mcp-api-adapter`, `panguard-mcp-bridge`, `openbench-dataset` | **0.1.0** | **404** | Never published — reset from in-tree `8.0.0` lockstep |
| **Already published** | `clawql-ouroboros` | **0.1.1** | **0.1.1** | Align to registry; do **not** reset to `0.1.0` |
| **Next major (grpc)** | `mcp-grpc-transport` | **1.0.0** | **0.2.0** | Published; planned major for v8 tag — not `0.1.0` |

The in-tree **`8.0.0`** on workspace `clawql-*` packages tracked the **`clawql-mcp` 8.0 major line**, not independent semver releases. **`npm view <pkg>`** returns **404** for almost all of them — so first publish is **`0.1.0`**, not `8.0.0`.

---

## Why not lockstep `8.0.0` on every package?

[`scripts/release/npm-publish-order.json`](../../scripts/release/npm-publish-order.json) states:

> Each `clawql-*` package uses **independent semver**. Do NOT lockstep package versions to `clawql-mcp`.

Consumers install **`clawql-mcp@8`** as the gateway bundle. Library packages (`clawql-api`, `clawql-core`, `clawql-audit`, …) publish on their **own 0.x cadence** when extracted for standalone use (audit wedge, observability, ouroboros, etc.).

Publishing `clawql-api@8.0.0` when nothing was ever on npm would falsely imply seven prior major lines. **`0.1.0`** is the correct first public version.

---

## Package inventory (September 2026)

### Gateway (stays on major 8 in-tree)

| Package | In-tree | npm | Notes |
| ------- | ------- | --- | ----- |
| `clawql-mcp` | 8.0.0 | 7.2.0 | Root; bundles workspace packages at publish via `prepack` |

### First npm publish at `0.1.0` (npm 404 as of audit)

| Package | Role |
| ------- | ---- |
| `clawql-merkle` | Merkle tree primitives (audit wedge) |
| `clawql-audit` | WORM audit trail (audit wedge) |
| `clawql-core` | Plugin architecture, Effect runtime |
| `clawql-auth` | Auth / ID-JAG |
| `clawql-analytics` | Product analytics (PostHog bridge) |
| `clawql-tee` | Simulated TEE signing |
| `clawql-agents` | Agent adapters (Cline, etc.) |
| `clawql-pageindex` | PageIndex MCP |
| `clawql-codegraph` | Code graph indexer |
| `clawql-api` | Composition root, search/execute |
| `clawql-memory` | Vault / memory MCP |
| `clawql-ontology` | Ontology CLI + lint |
| `clawql-release` | Release manifest helpers |
| `clawql-sandbox` | Sandbox exec MCP |
| `clawql-data` | DuckDB data MCP |
| `clawql-web` | Web / IDP fetch helpers |
| `clawql-documents` | Documents pipeline |
| `clawql-automation` | NATS / workflows |
| `clawql-payments` | Stripe / x402 / credits |
| `clawql-inference` | Inference gateway |
| `clawql-harness` | Bench / scenario harness |
| `clawql-observability` | LGTM+ stack (see [observability versioning](./clawql-observability-versioning.md)) |
| `clawql-operator` | Operator scaffold |
| `mcp-api-adapter` | MCP → OpenAPI/gRPC adapter |
| `panguard-mcp-bridge` | Panguard bridge |
| `openbench-dataset` | OpenBench dataset helpers |

### Exceptions (already on npm)

| Package | In-tree | npm | Rule |
| ------- | ------- | --- | ---- |
| `clawql-ouroboros` | **0.1.1** | **0.1.1** | Match published line; next publish is `0.1.2+` or `0.2.0` |
| `mcp-grpc-transport` | **1.0.0** | **0.2.0** | Next publish is **major** `1.0.0` per v8 release notes |

---

## Workspace dependency pins

After applying targets, **all inter-`clawql-*` dependencies** in `package.json` files use the **target version** (e.g. `clawql-core: "0.1.0"`), not `8.0.0`.

Root `package.json` still declares **`clawql-mcp` version `8.0.0`** but depends on workspace packages at **`0.1.0`** (and `clawql-ouroboros@0.1.1`, `mcp-grpc-transport@1.0.0`).

`scripts/release/prepack-clawql-mcp.mjs` replaces workspace pins with concrete versions from each package's `version` field at **`clawql-mcp` publish** time.

---

## Development phases ≠ npm semver

Some packages (notably **`clawql-observability`**) used internal **Phase 1–5** labels and temporary in-tree versions (e.g. `0.7.0`) during monorepo development. Those are **not** npm releases. See [clawql-observability-versioning.md](./clawql-observability-versioning.md).

---

## Maintaining versions

1. Edit [`package-npm-version-targets.json`](../../scripts/release/package-npm-version-targets.json) when a package publishes (bump its `inTreeTargets` entry).
2. Run `node scripts/release/apply-package-npm-versions.mjs`.
3. Run `npm install` to refresh `package-lock.json`.
4. Update [`RELEASE_NOTES_v8.0.0.md`](../../RELEASE_NOTES_v8.0.0.md) standalone npm table and package changelogs as needed.

**Verify npm state:**

```bash
for pkg in clawql-api clawql-core clawql-audit clawql-observability mcp-api-adapter; do
  printf "%-22s " "$pkg"
  npm view "$pkg" version 2>/dev/null || echo "NOT_PUBLISHED"
done
```

---

## Publish order

Unchanged: [`npm-publish-order.json`](../../scripts/release/npm-publish-order.json). Publish upstream `clawql-*` packages before `clawql-mcp`.

**Checklists:**

- [First-publish verification (all `0.1.0` packages)](./workspace-packages-0.1.0-checklist.md)
- [Observability-specific](./clawql-observability-0.1.0-checklist.md)
- [v8.0.0 gateway tag](./v8.0.0-checklist.md)

---

## Open PRs / coordination

Before merging version-reset PRs, check open branches for hardcoded `8.0.0` workspace pins — rebase and re-run `apply-package-npm-versions.mjs` if they touch `package.json` / `package-lock.json`.

---

## Related

- [Modularization status](../design/modularization-implementation-status.md)
- [Migrate to 8.0](../getting-started/migrate-to-8.0.md) — **gateway** behavior, not per-package npm versions
