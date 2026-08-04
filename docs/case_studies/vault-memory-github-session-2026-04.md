**Source:** This page and [`docs/case_studies/vault-memory-github-session-2026-04.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/case_studies/vault-memory-github-session-2026-04.md) are kept in sync; edit both when the narrative changes.

# Case study: Vault memory ingest, GitHub tracking, and shipping enterprise `audit` (April 2026)

A multi-turn working session in Cursor: ingesting external and assistant-generated content into the ClawQL MCP `memory_ingest` / `memory_recall` Obsidian vault, prioritizing GitHub work, opening tracking issues, and delivering a concrete feature slice (`audit` tool, [#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)) plus docs / Helm / website wiring.

**Audience:** Operators and contributors who use vault memory for long-running context, GitHub for execution, and want a repeatable pattern for "ingest → prioritize → issue → implement."

---

## 1. Why this session mattered

Long-horizon product work generates more context than any single chat can hold: vendor analyses, roadmap essays, ecosystem posts, and cross-session prioritization. Without a durable store, you re-argue the same design every week. This session used the vault as the system of record for that material, then used GitHub as the system of execution — issues, epics, and shipped code.

The three durability tiers in play:

| Layer                 | Tooling                                      | Durability                                                                                                                                                             |
| --------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scratch**           | `cache()` (optional, in-process LRU)         | Lost on process restart — good for ephemeral tool state                                                                                                                |
| **Operator trail**    | `audit()` (optional, in-process ring buffer) | In-session MCP event visibility; see [`docs/mcp/enterprise-mcp-tools.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/enterprise-mcp-tools.md) |
| **Narrative + graph** | `memory_ingest` / `memory_recall`            | Markdown + `[[wikilinks]]` (+ optional `memory.db` hybrid features)                                                                                                    |

---

## 2. Narrative timeline (April 2026)

1. **Ingest wave:** External threads (Grok cross-checks, Agent vision, gRPC/Gallery notes) landed in the vault with stable titles and often `append: true` so related updates consolidated rather than fragmenting.
2. **Tracker sync:** Open issues were listed, deduped, and extended — `iac_inspect` duplicate closure (#39 → #69), new epics #88–#91 for gateway, enterprise tools, synthetics, Gallery downstream work.
3. **Prioritization:** Among schedule/notify/vision (#76–#78), memory epics (#68), docs/evals (#70–#71), docs site (#87), and new items, the group picked #89 for a vertical slice with a clear acceptance condition: one enterprise tool shipped end-to-end.
4. **Implementation:** `audit` — design doc, code, tests, Helm/K8s/env/docs/site/Cursor skill — through to `npm test` green.

---

## 3. What was ingested into the vault (`memory_ingest`)

Structured `insights` plus verbatim or summarized `conversation` blocks were stored under stable titles (append-friendly) so Obsidian `[[wikilinks]]` and `memory_recall` stay useful:

| Theme                        | Vault note title (representative)                                                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grok repo analysis vs v3.2.3 | `ClawQL MCP v3.2.3 Grok repo analysis (Apr 17 2026)` — cross-check vs open issues, suggested issue titles, follow-on design (schedule + sandbox, synthetics, cache vs memory) |
| ClawQL-Agent vision          | `ClawQL-Agent platform vision and roadmap (2026-04-17)` — enterprise framing (DORA/DACI), x402 / public gateway, payment discovery, clawql.com gateway notes                  |
| gRPC + Gallery / LinkedIn    | `ClawQL gRPC MCP transport and Gemma Gallery skill (announcement 2026-04)`; LinkedIn ecosystem post note                                                                      |
| SuperQwen benchmark tweet    | `SuperQwen3.6-35B Song Jun tweet — ClawQL-Agent model note (2026-04)` — third-party claims flagged for verification                                                           |
| Workflow tips                | `ClawQL MCP cache vs memory_ingest — when to use which`                                                                                                                       |
| GitHub prioritization        | `ClawQL open-issues prioritization (2026-04-17)` — open/closed snapshot, #39 merged into #69, new issues #88–#91                                                              |

Prefer `memory_ingest` for durable decisions; use `cache()` only for session scratch the user asked not to persist. Use `wikilinks` to connect roadmap ↔ GitHub issue notes ↔ architecture sketches so `memory_recall` with `maxDepth` can pull related pages, not only keyword hits.

---

## 4. GitHub: issues created and housekeeping

| Action               | Detail                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Closed duplicate** | [#39](https://github.com/danielsmithdevelopment/ClawQL/issues/39) → canonical [#69](https://github.com/danielsmithdevelopment/ClawQL/issues/69) (`iac_inspect`)                                                                                                                                                                                                                                             |
| **New issues**       | [#88](https://github.com/danielsmithdevelopment/ClawQL/issues/88) public gateway / x402 / discovery; [#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89) enterprise tools epic; [#90](https://github.com/danielsmithdevelopment/ClawQL/issues/90) synthetic checks + schedule; [#91](https://github.com/danielsmithdevelopment/ClawQL/issues/91) Gallery fork gRPC (upstream issues disabled) |
| **Starter artifact** | `website/public/.well-known/payments.json` placeholder + `/.well-known/*` cache headers — ties to #88 / #87 (docs deploy)                                                                                                                                                                                                                                                                                   |

Gallery issues are disabled on the fork; #91 in this repo tracks downstream PRs.

Tracking duplicates explicitly reduces split-brain prioritization and keeps `search` / `execute` automation aligned with a single canonical thread per topic.

---

## 5. Prioritization snapshot (session)

Open work included #76–#78 (schedule, notify, vision), #69 / memory epics, #87 (docs site), #88–#91 (new). The suggested order discussed: dedupe `iac_inspect` (done), optional tools #76 → #77 → #78, memory under #68, docs #70 / eval #71, public gateway when ready.

The session picked [#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89) for implementation because it was scoped to ship something observable in MCP + Helm + docs — a forcing function for the optional-tool plumbing (`CLAWQL_ENABLE_*`, chart values, website tables) that future enterprise tools (`metrics`, `governance`) reuse.

---

## 6. Why `audit` was the right vertical slice

The enterprise epic needed a first tool with specific properties. It had to be off by default so existing deployments saw no surprise behavior. Operators needed to `list` recent events without SSHing to grep logs. The ring buffer plus `CLAWQL_AUDIT_MAX_ENTRIES` kept storage bounded — no silent unbounded log file on disk. And the tool's threat-model language paired naturally with [`docs/mcp/enterprise-mcp-tools.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/enterprise-mcp-tools.md).

`audit` covers runtime MCP events. The vault covers human-readable narrative. The two stores serve different purposes and neither substitutes for the other.

---

## 7. Work completed: enterprise `audit` (#89)

1. **Design:** [`docs/mcp/enterprise-mcp-tools.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/enterprise-mcp-tools.md) — flags, threat model, future `metrics` / `governance`.
2. **Code:** [`src/clawql-audit.ts`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/src/clawql-audit.ts) — `append` / `list` / `clear`; unconditional registration in [`src/tools.ts`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/src/tools.ts); optional flags in [`src/clawql-optional-flags.ts`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/src/clawql-optional-flags.ts) cover other tools.
3. **Tests:** [`src/clawql-audit.test.ts`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/src/clawql-audit.test.ts), extended optional-flags + stdio smoke ([`src/server.test.ts`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/src/server.test.ts)).
4. **Docs / env:** [`docs/mcp/mcp-tools.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/mcp-tools.md), [`.env.example`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/.env.example), [`README.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/README.md), [`CHANGELOG.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md).
5. **Ops:** [`docs/deployment/deploy-k8s.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/deployment/deploy-k8s.md), [`docs/deployment/helm.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/deployment/helm.md) — `audit` is ClawQL Core (no Helm/env toggle).
6. **Website & Cursor:** site copy ([`website/src/app/tools/page.mdx`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/website/src/app/tools/page.mdx), related MDX), [`.cursor/skills/clawql-vault-memory/SKILL.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/.cursor/skills/clawql-vault-memory/SKILL.md) — clarifies `audit` vs vault.

`npm test` green before merge.

---

## 8. Optional tools: `audit` vs `cache` vs vault

| Tool                | Env                                                                      | Persists?           | Use for                                     |
| ------------------- | ------------------------------------------------------------------------ | ------------------- | ------------------------------------------- |
| **`cache`**         | ClawQL Core (always on)                                                  | No (in-process LRU) | Session scratch, tool handoff state         |
| **`audit`**         | Always on (no env gate)                                                  | No (ring buffer)    | Operator-visible MCP event trail in-session |
| **`memory_ingest`** | On by default; vault path + DB sidecar; `CLAWQL_ENABLE_MEMORY=0` to hide | Yes (Markdown + DB) | Decisions, runbooks, cross-session recall   |

---

## 9. Helm and website wiring

Docs and Helm describe `audit` as ClawQL Core (alongside `search` / `execute`, always on, no opt-out) so `docs.clawql.com` matches the diagram and the server's tool list.

---

## 10. Outcomes and follow-ups

| Outcome         | Notes                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Vault**       | Searchable narrative for roadmap, payments, gRPC, and GitHub state — refresh stale cross-links (e.g. closed issues) when re-calling |
| **Tracker**     | #89 remains an epic until `metrics` / `governance` ship; `audit` v1 satisfies "one vertical slice"                                  |
| **Next builds** | #76–#78, #88 payment gateway hardening, Gallery gRPC via #91, #90 synthetics                                                        |
| **Deploy**      | Validate `/.well-known/payments.json` on `docs.clawql.com` after #87                                                                |

---

## 11. References

- **MCP tools:** [mcp-tools.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/mcp-tools.md)
- **Enterprise design:** [enterprise-mcp-tools.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/enterprise-mcp-tools.md)
- **Vault memory skill:** [integrations/cursor-vault-memory.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/integrations/cursor-vault-memory.md)
- **Issues:** [#88](https://github.com/danielsmithdevelopment/ClawQL/issues/88)–[#91](https://github.com/danielsmithdevelopment/ClawQL/issues/91), [#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)

© Copyright 2026. All rights reserved. · [ClawQL on GitHub](https://github.com/danielsmithdevelopment/ClawQL)
