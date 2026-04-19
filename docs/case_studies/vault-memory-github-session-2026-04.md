# Case study: Vault memory ingest, GitHub tracking, and shipping enterprise `audit` (April 2026)

This case study summarizes a **multi-turn working session** in Cursor: ingesting external and assistant-generated content into the **ClawQL MCP `memory_ingest` / `memory_recall` Obsidian vault**, **prioritizing GitHub work**, **opening tracking issues**, and **delivering** a concrete feature slice (**`audit`** tool, [#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)) plus **docs / Helm / website** wiring.

**Audience:** Operators and contributors who use **vault memory** for long-running context, **GitHub** for execution, and want a **repeatable pattern** for “ingest → prioritize → issue → implement.”

---

## 1. Context

- **ClawQL MCP** exposes optional tools behind **`CLAWQL_ENABLE_*`** flags; durable knowledge lives in **`memory_ingest`** / **`memory_recall`**; ephemeral scratch uses **`cache`** (and **`audit`** is an in-process ring buffer — not the vault).
- The session mixed **user-provided threads** (Grok replies, LinkedIn drafts, product vision), **prioritization** against live **`gh issue list`**, and **implementation** in this repo.

---

## 2. What was ingested into the vault (`memory_ingest`)

Structured **`insights`** plus verbatim or summarized **`conversation`** blocks were stored under stable titles (append-friendly) so Obsidian **`[[wikilinks]]`** and **`memory_recall`** stay useful:

| Theme                            | Vault note title (representative)                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Grok repo analysis vs **v3.2.3** | `ClawQL MCP v3.2.3 Grok repo analysis (Apr 17 2026)` — cross-check vs open issues, suggested issue titles, follow-on design (schedule + sandbox, synthetics, cache vs memory). |
| **ClawQL-Agent** vision          | `ClawQL-Agent platform vision and roadmap (2026-04-17)` — plus Grok validations, enterprise (DORA/DACI), x402/Ramp payments, **clawql.com** gateway, payment discovery.        |
| **gRPC** + Gallery / LinkedIn    | `ClawQL gRPC MCP transport and Gemma Gallery skill (announcement 2026-04)`; LinkedIn ecosystem post note.                                                                      |
| **SuperQwen** benchmark tweet    | `SuperQwen3.6-35B Song Jun tweet — ClawQL-Agent model note (2026-04)` — third-party claims flagged for verification.                                                           |
| **Workflow tips**                | `ClawQL MCP cache vs memory_ingest — when to use which`.                                                                                                                       |
| **GitHub prioritization**        | `ClawQL open-issues prioritization (2026-04-17)` — open/closed snapshot, **#39** merged into **#69**, new issues **#88–#91**.                                                  |

**Practice:** Prefer **`memory_ingest`** for durable decisions; use **`cache()`** only for session scratch the user asked not to persist forever.

---

## 3. GitHub: issues created and housekeeping

| Action               | Detail                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Closed duplicate** | [#39](https://github.com/danielsmithdevelopment/ClawQL/issues/39) → canonical [#69](https://github.com/danielsmithdevelopment/ClawQL/issues/69) (`iac_inspect`).                                                                                                                                                                                                                                             |
| **New issues**       | [#88](https://github.com/danielsmithdevelopment/ClawQL/issues/88) public gateway / x402 / discovery; [#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89) enterprise tools epic; [#90](https://github.com/danielsmithdevelopment/ClawQL/issues/90) synthetic checks + schedule; [#91](https://github.com/danielsmithdevelopment/ClawQL/issues/91) Gallery fork gRPC (upstream issues disabled). |
| **Starter artifact** | `website/public/.well-known/payments.json` placeholder + `/.well-known/*` cache headers — ties to **#88** / **#87** (docs deploy).                                                                                                                                                                                                                                                                           |

**Gallery:** Issues are disabled on the fork; **#91** in this repo tracks downstream PRs.

---

## 4. Prioritization snapshot (session)

- **Open** work included **#76–#78** (schedule, notify, vision), **#69** / memory epics, **#87** (docs site), **#88–#91** (new).
- **Suggested order** discussed: dedupe **iac_inspect** (done), optional tools **#76 → #77 → #78**, memory under **#68**, docs **#70** / eval **#71**, public gateway when ready.
- **Picked for implementation:** **[#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)** — design doc + first vertical slice.

---

## 5. Work completed: enterprise `audit` (#89)

1. **Design:** [`docs/enterprise-mcp-tools.md`](../enterprise-mcp-tools.md) — flags, threat model, future `metrics` / `governance`.
2. **Code:** [`src/clawql-audit.ts`](../../src/clawql-audit.ts) — `append` / `list` / `clear`; [`src/clawql-optional-flags.ts`](../../src/clawql-optional-flags.ts) — `CLAWQL_ENABLE_AUDIT`; registration in [`src/tools.ts`](../../src/tools.ts).
3. **Tests:** [`src/clawql-audit.test.ts`](../../src/clawql-audit.test.ts), extended optional-flags + stdio smoke ([`src/server.test.ts`](../../src/server.test.ts)).
4. **Docs / env:** [`docs/mcp-tools.md`](../mcp-tools.md), [`.env.example`](../../.env.example), [`README.md`](../../README.md), [`CHANGELOG.md`](../../CHANGELOG.md).
5. **Ops:** **Helm** `enableAudit` in [`charts/clawql-mcp`](../../charts/clawql-mcp); [`docs/deploy-k8s.md`](../deploy-k8s.md), [`docs/helm.md`](../helm.md).
6. **Website & Cursor:** site copy ([`website/src/app/tools/page.mdx`](../../website/src/app/tools/page.mdx), etc.), [`.cursor/skills/clawql-vault-memory/SKILL.md`](../../.cursor/skills/clawql-vault-memory/SKILL.md).

**Tests:** `npm test` green before merge.

---

## 6. Outcomes and follow-ups

| Outcome         | Notes                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Vault**       | Searchable narrative for roadmap, payments, gRPC, and GitHub state — refresh stale notes (e.g. **#67** closed) when re-calling. |
| **Tracker**     | **#89** remains an **epic** until `metrics` / `governance` ship; **`audit`** v1 satisfies “one vertical slice.”                 |
| **Next builds** | **#76–#78**, **#88** payment gateway hardening, **Gallery** gRPC via **#91**.                                                   |
| **Deploy**      | Validate `/.well-known/payments.json` on **docs.clawql.com** after **#87**.                                                     |

---

## 7. References

- **MCP tools:** [mcp-tools.md](../mcp-tools.md)
- **Enterprise design:** [enterprise-mcp-tools.md](../enterprise-mcp-tools.md)
- **Vault memory skill:** [cursor-vault-memory.md](../cursor-vault-memory.md)
- **Issues:** [#88](https://github.com/danielsmithdevelopment/ClawQL/issues/88)–[#91](https://github.com/danielsmithdevelopment/ClawQL/issues/91), [#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)

**Website (readable summary):** **`/case-studies/vault-memory-github-session-2026-04`** on [docs.clawql.com](https://docs.clawql.com).

Token estimates for this doc are not the focus; the win is **durable graph + executable backlog** with **one shipped slice** per milestone.
