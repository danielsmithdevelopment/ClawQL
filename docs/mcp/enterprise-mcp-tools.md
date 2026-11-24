# Enterprise MCP tools (audit, metrics, governance)

Design for optional **env-gated** MCP surfaces (notably **`notify`**, future **`metrics`** / **`governance`**). The **`audit`** tool is **ClawQL Core** — always registered alongside **`search`** and **`execute`** (see [GitHub #89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)); there is **no** opt-out of Core. It is the agent's **view** over the process **WORM** trail (local hash-chained store on by default).

## Goals

- **Optional tools stay off** until enabled: **`notify`**, **`schedule`**, **`ouroboros_*`**, etc. **`audit`** is **not** optional — it is part of **Core** with **`search`** / **`execute`**.
- **Lean schemas**: single-tool + small `operation` enums where possible; long-form outputs belong in **Obsidian** via **`memory_ingest`**, not in giant MCP return bodies.
- **No secrets in logs**: handlers use shape-only logging ([`CLAWQL_MCP_LOG_TOOLS`](mcp-tools.md)); never log raw tokens, PANs, or session cookies.

## Feature flags (planned / partial)

| Env                                     | MCP tool                                                                  | Status                                                                                                                                                                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _(ClawQL Core — always registered)_     | **`audit`**                                                               | **Shipped:** agent view over process WORM (list/append/clear view only). Durable trail is **`clawql-audit`** (sqlite under `$CLAWQL_HOME/worm` by default). No **`CLAWQL_ENABLE_*`** flag; **no opt-out of Core**.                                                                                                                          |
| **`CLAWQL_ENABLE_NOTIFY=1`**            | **`notify`**                                                              | **Shipped:** Slack **`chat.postMessage`** when the Slack spec is loaded — **[notify-tool.md](notify-tool.md)** · [mcp-tools.md § notify](mcp-tools.md#notify-optional) ([#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)).                                  |
| **`CLAWQL_ENABLE_HITL_LABEL_STUDIO=1`** | **`hitl_enqueue_label_studio`** (+ **`POST /hitl/label-studio/webhook`**) | **Shipped:** Label Studio task import + webhook ingestion to **`memory_ingest`** / **`audit`** — **[hitl-label-studio.md](hitl-label-studio.md)** ([#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228)). Distinct from future **`governance`** policy hooks. |
| **`CLAWQL_ENABLE_METRICS=1`**           | **`metrics`**                                                             | Planned — DORA/DevEx-style reporting; Obsidian artifacts.                                                                                                                                                                                                                    |
| **`CLAWQL_ENABLE_GOVERNANCE=1`**        | **`governance`**                                                          | Planned — PII/RBAC/HITL policy hooks.                                                                                                                                                                                                                                        |

## Threat model (summary)

| Risk                                               | Mitigation                                                                                                                                                                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Do not confuse `audit.clear` with WORM erase** | MCP **`audit`** is a **view**. **`clear`** empties only the agent-facing buffer — never the hash-chained WORM store. For regulated profiles use durable backends (sqlite/postgres + S3 Object Lock); pair with **`memory_ingest`** / SIEM for operator notes. |
| **Prompt injection / exfil via summaries**         | Length caps on strings; operators should not paste secrets into **`summary`**. Prefer correlation IDs and redacted descriptions.                                                                                              |
| **Multi-tenant isolation**                         | Single-process buffer is **not** tenant-isolated; multi-tenant deployments should gate **`audit`** to trusted agents or add namespacing in a later revision.                                                                  |

## Regulated deployments

This repository documents **technical controls and patterns** that support **SOC 2–style** and **HIPAA-oriented** readiness narratives. It does **not** replace organizational policies, a **risk analysis**, **Business Associate Agreements** (BAAs) with subprocessors, or an assessor’s opinion. Packaging and Helm hardening: **[`docs/security/soc2-type2-readiness-packaging.md`](../security/soc2-type2-readiness-packaging.md)** ([#133](https://github.com/danielsmithdevelopment/ClawQL/issues/133)) and **[`docs/security/clawql-security-defense-deliverables.md`](../security/clawql-security-defense-deliverables.md)** ([#164](https://github.com/danielsmithdevelopment/ClawQL/issues/164)).

**Private tailnets (Tailscale / Headscale):** keeping MCP and **`execute`** targets on a **mesh-only** path (with **ACLs** and aligned **`BASE_URL`**s) supports **segmentation**, **encryption in transit**, and **reduced public exposure** themes that show up in **HIPAA**, **SOC 2**, **GDPR Art. 32**, and **CCPA/CPRA “reasonable security”** discussions—**not** as a substitute for BAAs, DPAs/SCCs, DPIAs, or legal review. See **[`docs/deployment/tailscale-and-headscale-for-clawql.md` § Regulatory and compliance](../deployment/tailscale-and-headscale-for-clawql.md#regulatory-and-compliance-context-how-tailnets-help)** (and website **`/tailscale`**).

**Observability (native GraphQL/gRPC metrics):**

- **Network:** Do not expose enriched **`GET /healthz`** or **`GET /metrics`** on a public ingress. Restrict scrapes and operator probes to **private networks**, **mesh-internal** addresses, or a **metrics-only** Service with **NetworkPolicies** / security groups so only Prometheus (or an approved agent) can reach them.
- **Transport:** Terminate **TLS** at the ingress or use **mTLS** inside the mesh for scrape targets. Align with your **encryption in transit** control.
- **Data minimization:** Metric **labels** must not contain **PHI**, end-user identifiers, or free-form request text. Treat native GraphQL/gRPC **`sourceLabel`** values as **operator-defined config names** (e.g. `linear-prod`), not patient or account IDs. If a label could become an identifier at scale, aggregate, drop, or relabel in your **Prometheus** / **Agent** config.
- **Separation of concerns:** Use **`GET /metrics`** (**`prom-client`** OpenMetrics text) with standard **ServiceMonitor** / **PodMonitor** scrapes for production Prometheus. Optional JSON on **`/healthz`** (**`CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS=1`**) remains for human probes; disabling the HTTP **`/metrics`** route is **`CLAWQL_ENABLE_HTTP_METRICS=0`** (uncommon).
- **Retention and access:** Route **centralized logging** and **WORM** evidence to systems with **role-based access**, **retention policies**, and (where required) **immutability**. The MCP **`audit`** tool is the agent view ([`audit` tool (v1)](#audit-tool-v1)); the process trail (`clawql-audit`) is durable by default — pair with **`memory_ingest`** / **SIEM** for operator notes.

## `audit` tool (v1)

**Operations:** `append` (record an event), `list` (recent events), `clear` (empty the agent-facing view only — does **not** truncate the WORM trail).

**Env:** **`CLAWQL_AUDIT_MAX_ENTRIES`** (default **500**, min 1, max 50_000) — oldest entries drop when over capacity.

**Prometheus:** aggregate counters/gauge registered with the HTTP **`/metrics`** exporter (**`clawql_audit_*`** — append total, ring drops, clears, current buffer size).

**Loki:** optional **`CLAWQL_LOKI_PUSH_URL`** (+ bearer / tenant headers) — fire-and-forget push per **`append`**; see **`docs/mcp/mcp-tools.md`** and **`.env.example`**.

Process WORM (`clawql-audit`) is the durable trail. Use **`memory_ingest`** when the note must also live in the Obsidian vault for human review.

## References

- Optional flags (`cache`, `memory_*`, documents, …): [`src/clawql-optional-flags.ts`](../src/clawql-optional-flags.ts) ([#79](https://github.com/danielsmithdevelopment/ClawQL/issues/79)).
- [`docs/mcp/mcp-tools.md`](mcp-tools.md) — full tool reference.
- **[`docs/readme/deployment.md`](../readme/deployment.md)** — HTTP endpoints; use with **Regulated deployments** above for ingress and telemetry placement.
