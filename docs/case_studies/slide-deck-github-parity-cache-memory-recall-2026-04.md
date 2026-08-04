**Source:** This page and [`docs/case_studies/slide-deck-github-parity-cache-memory-recall-2026-04.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/case_studies/slide-deck-github-parity-cache-memory-recall-2026-04.md) are kept in sync; edit both when the narrative changes.

# Case study: Slide deck vs GitHub — `memory_recall`, `cache`, and filing parity issues (April 2026)

A Cursor session that aligned the ClawQL pitch deck in [`docs/presentations/clawql-slides.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/presentations/clawql-slides.md) with the GitHub backlog. The goal was to close narrative gaps by creating tracking issues for themes that appeared in the 80-slide deck (including §08 security) but had no or incomplete issue coverage.

**Audience:** Teams using ClawQL MCP who want a repeatable split between durable context (`memory_ingest` / `memory_recall` / Obsidian), ephemeral session state (`cache`, optional, in-process), and GitHub for execution.

---

## 1. Why this session mattered

A consolidated slide deck is a product contract: it lists Web3, Fabric, The Graph, Chainlink, OSV-Scanner, Istio, defense-in-depth, and more. When that narrative runs ahead of issues and code, the story drifts. This session was about reconciling deck → open issues → new issues while keeping a clear boundary between the three memory layers in play:

| Layer                 | Tooling                          | Role in this session                                                                                                             |
| --------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Ephemeral scratch** | MCP `cache` (always on)          | Stash transient keys (working notes, last-known issue list, scratch that shouldn't go in the vault) — in-process and LRU-bounded |
| **Durable recall**    | `memory_recall` (vault Markdown) | Pull prior decisions and deck-related notes before writing new issues, so filing is informed by vault context                    |
| **Durable write**     | `memory_ingest`                  | After the session, append a summary of what was created and how it links to the deck                                             |
| **Execution**         | `gh`, GitHub                     | System of record for shippable work                                                                                              |

For when `cache` is vs is not the right tool, see [`docs/mcp/cache-tool.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/cache-tool.md).

---

## 2. The slide deck as product contract

- **Source:** [`docs/presentations/clawql-slides.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/presentations/clawql-slides.md) — 80 slides, sections §01–§08 (Core through Defense in Depth), plus a closing slide.
- **Paired long-form security reference:** [`docs/security/clawql-security-defense-in-depth.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/security/clawql-security-defense-in-depth.md) (aligns with §08).
- **Scope:** the deck is aspirational in places; the gap pass explicitly preferred "file an issue and label scope" over silently assuming the repo already matched every slide bullet.

The assistant enumerated all open issues in `danielsmithdevelopment/ClawQL`, then compared that set to the deck's major themes (Istio, OSV, Fabric, The Graph, Chainlink, Tempo / OTLP traces, Vault, Web3, transcript parity, etc.).

---

## 3. `memory_recall` before creating issues

Before opening new GitHub issues, the assistant called `memory_recall` (ClawQL MCP) with a focused query — e.g. keywords like `clawql slide deck`, `slides security`, `roadmap` — so the filing pass could reuse prior vault notes instead of inventing context.

**What came back (examples):**

- `Memory/clawql-slide-deck-and-security-documentation-april-2026.md` — prior ingest describing the 80-slide deck and §08 work.
- `Memory/clawql-complete-consolidated-slide-deck-april-2026.md` and transcript-related notes (older; useful as history, not as the canonical slide count).
- `Memory/clawql-agent-platform-vision-and-roadmap-2026-04-17.md` and related roadmap material.

This step grounded "what we already said in the vault" (titles, wikilinks, earlier prioritization) so new issues could link to stable narrative and avoid duplicate "deck refresh" work where an ingest already existed. `gh issue list` remained the authoritative set of open engineering tickets — recall supplemented it, not replaced it.

**Parameters used (illustrative):** `query` = short keyword phrase, `limit` small (e.g. 5–8), optional `maxDepth` when graph follow-through matters (wikilinks). See [`docs/mcp/mcp-tools.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/mcp-tools.md) under `memory_recall`.

---

## 4. `cache` for short-lived working state

During the gap pass, the assistant used the MCP `cache` tool to hold transient state that shouldn't be committed to the Obsidian vault — for example:

- A short working summary of "what we are comparing this round" (deck section → theme list).
- Scratch keys such as `deck-gap-analysis-2026-04-25` and, after new issues were filed, a compact list of new issue numbers and titles under something like `deck-gaps-issues` — ephemeral labels for the rest of the same assistant run.

`cache` is ephemeral in this MCP server process (see [`docs/mcp/cache-tool.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/cache-tool.md)). A restart, a different process, or another client doesn't see these keys. The `cache` copy existed only to avoid re-listing 12 issues in every tool turn within the session. Issue numbers, titles, and the rationale for each gap were written to GitHub (durable, linkable) and at the end to `memory_ingest` (durable, recallable in the vault).

---

## 5. Comparing the deck to open issues

1. **Extract structure** from the deck: slide titles / sections (e.g. Architecture, Web3, Defense in Depth) and major themes.
2. **List open issues** in the repo (`gh issue list --state open` — sort by number for a stable view).
3. **Keyword map:** for each major theme (Istio, OSV, Fabric, Graph, Chainlink, x402, …), check whether an open issue already tracks it. Many were already covered (e.g. public x402 / gateway [#88](https://github.com/danielsmithdevelopment/ClawQL/issues/88), Helm full-stack was previously shipped; Onyx / Flink have dedicated closed or open items).
4. **Gap = deck claims work that has no or a clearly incomplete issue** — file a new issue with scope, acceptance, and links to the deck and related docs so future readers know why the issue exists.

---

## 6. New GitHub issues filed (April 2026)

Twelve new issues were opened to connect the April 2026 deck to an explicit backlog:

| #        | Area                                                                                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#155** | Optional Istio + Kiali, mTLS east-west                                                                                                                                                   |
| **#156** | OSV-Scanner + Golden Image / CI / optional CronJob / `search`+`execute` path                                                                                                             |
| **#157** | Hyperledger Fabric — Helm, `CLAWQL_ENABLE_FABRIC`, `providers/fabric`                                                                                                                    |
| **#158** | The Graph — bundled OpenAPI / execute path                                                                                                                                               |
| **#159** | Chainlink — bundled provider surface                                                                                                                                                     |
| **#160** | Tempo / OTLP tracing                                                                                                                                                                     |
| **#161** | HashiCorp Vault or OpenBao (vs chart Obsidian `vault` hostPath naming)                                                                                                                   |
| **#162** | ClawQL-Web3 — AgentKit / IPFS / CCIP (extends beyond #88)                                                                                                                                |
| **#163** | Transcript parity: [`clawql-slides-transcript.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/presentations/archive/clawql-slides-transcript.md) vs 80 slides + §08 |
| **#164** | Defense-in-depth doc → control / deliverable matrix                                                                                                                                      |
| **#165** | Meta: update obsolete slide § references in existing issue bodies                                                                                                                        |
| **#166** | Demos — honest walkthroughs for high-stakes narrative slides (e.g. 50, 56)                                                                                                               |

Cross-links between issues (e.g. #88, #132, #133, #128, #129, #131) were added in the bodies so P2/P3 dependencies stay navigable from GitHub, not only from the deck.

---

## 7. `memory_ingest` when the work is done

After creating issues and updating the mental model of "deck ↔ backlog," the assistant used `memory_ingest` with a stable title, a `sessionId`, and `append: true` to record:

- The 12 new issues and the thematic buckets.
- A pointer to the canonical deck file and the defense-in-depth companion doc.
- (Optional) `wikilinks` to related vault note titles for graph recall in Obsidian.

The vault is the durable place to answer, next month: "What did we file when the deck went to 80 slides?" `cache` from that day is long gone. `memory_ingest` is the durable counterpart for human+assistant continuity across sessions.

---

## 8. Scratch, trail, and durable memory

| Store               | When to use                                                        | This session                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`cache`**         | Session handoff, scratch keys, ephemeral lists (same MCP process)  | Stashed working gap labels and new-issue list in-session                                                                                                                                                                   |
| **`audit`**         | In-process operator trail of MCP tool calls (optional)             | Not the focus; see [`docs/mcp/enterprise-mcp-tools.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/enterprise-mcp-tools.md) and [#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89) |
| **`memory_recall`** | Find existing deck/roadmap/security notes before editing or filing | Queried the vault for slide-deck and prior security ingests before creating issues                                                                                                                                         |
| **GitHub issues**   | Shippable, linkable, assignable work                               | 12 new issues + cross-links to prior epics                                                                                                                                                                                 |
| **`memory_ingest`** | Durable summary of outcomes and wikilinks for the graph            | Appended session outcome to the long-running "slide deck + security" note                                                                                                                                                  |

---

## 9. References

- [`docs/presentations/clawql-slides.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/presentations/clawql-slides.md) — canonical deck
- [`docs/security/clawql-security-defense-in-depth.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/security/clawql-security-defense-in-depth.md) — §08 long-form
- [`docs/mcp/cache-tool.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/cache-tool.md) — cache tool semantics
- [`docs/mcp/mcp-tools.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp/mcp-tools.md) — `memory_ingest`, `memory_recall`
- GitHub: issues #155–#166 in `danielsmithdevelopment/ClawQL` (April 2026)
- [`.cursor/skills/clawql-vault-memory/SKILL.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/.cursor/skills/clawql-vault-memory/SKILL.md) — deep ingest and recall pattern

**Full deck (this site):** [/vision/slide-deck](https://docs.clawql.com/vision/slide-deck) — same Markdown as the canonical file; that route inlines the deck in its static HTML at build time (large route bundle, crawler-friendly).

---

## Case study metadata

| Item         | Value                                                                                                                                                           |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Session**  | April 2026, Cursor + ClawQL MCP (scoped server id e.g. `project-0-ClawQL-clawql` in multi-config setups)                                                        |
| **Outcomes** | 12 new GitHub issues, vault `memory_ingest` append, this case study + website mirror                                                                            |
| **Pattern**  | `memory_recall` for grounding → `gh` for ground truth on open work → `cache` for same-session scratch → `memory_ingest` for durable "what we decided and filed" |

© Copyright 2026. All rights reserved. · [ClawQL on GitHub](https://github.com/danielsmithdevelopment/ClawQL)
