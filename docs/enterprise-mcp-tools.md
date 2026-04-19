# Enterprise MCP tools (audit, metrics, governance)

Design for optional, **env-gated** MCP surfaces that stay **off** the default schema unless explicitly enabled — see [GitHub #89](https://github.com/danielsmithdevelopment/ClawQL/issues/89).

## Goals

- **Zero context bloat** for minimal deployments: tools are **not registered** when flags are off.
- **Lean schemas**: single-tool + small `operation` enums where possible; long-form outputs belong in **Obsidian** via **`memory_ingest`**, not in giant MCP return bodies.
- **No secrets in logs**: handlers use shape-only logging ([`CLAWQL_MCP_LOG_TOOLS`](mcp-tools.md)); never log raw tokens, PANs, or session cookies.

## Feature flags (planned / partial)

| Env | MCP tool | Status |
| --- | --- | --- |
| **`CLAWQL_ENABLE_AUDIT=1`** | **`audit`** | **Shipped (v1):** in-process ring buffer — not durable (see below). |
| **`CLAWQL_ENABLE_METRICS=1`** | **`metrics`** | Planned — DORA/DevEx-style reporting; Obsidian artifacts. |
| **`CLAWQL_ENABLE_GOVERNANCE=1`** | **`governance`** | Planned — PII/RBAC/HITL policy hooks. |

Parsing for `CLAWQL_ENABLE_AUDIT` matches other `CLAWQL_ENABLE_*` booleans (`1` / `true` / `yes`).

## Threat model (summary)

| Risk | Mitigation |
| --- | --- |
| **Treat in-process audit as non-compliance-grade** | v1 **`audit`** is a **ring buffer in RAM** only — lost on restart, not replicated. For **immutable** or **regulated** trails, use **`memory_ingest`** (vault), export to SIEM, or a future disk-append / Merkle-backed store. |
| **Prompt injection / exfil via summaries** | Length caps on strings; operators should not paste secrets into **`summary`**. Prefer correlation IDs and redacted descriptions. |
| **Multi-tenant isolation** | Single-process buffer is **not** tenant-isolated; multi-tenant deployments should gate **`audit`** to trusted agents or add namespacing in a later revision. |

## `audit` tool (v1)

**Operations:** `append` (record an event), `list` (recent events), `clear` (empty buffer — mainly for tests/operators).

**Env:** **`CLAWQL_AUDIT_MAX_ENTRIES`** (default **500**, min 1, max 50_000) — oldest entries drop when over capacity.

**Not** a substitute for vault-backed compliance records: use **`memory_ingest`** when the note must survive process restarts and human review in Obsidian.

## References

- Optional flags matrix: [`src/clawql-optional-flags.ts`](../src/clawql-optional-flags.ts) ([#79](https://github.com/danielsmithdevelopment/ClawQL/issues/79)).
- [`docs/mcp-tools.md`](mcp-tools.md) — full tool reference.
