# Case study: Slide deck vs GitHub — `memory_recall`, `cache`, and filing parity issues (April 2026)

This case study walks through a **Cursor** session that aligned the **ClawQL** pitch deck in [`docs/presentations/clawql-slides.md`](../presentations/clawql-slides.md) with the **GitHub** backlog. The goal was to **close narrative gaps** by creating tracking issues for themes that appeared in the **80-slide** deck (including **§08** security) but had **no** or **incomplete** issue coverage.

**Audience:** Teams using **ClawQL MCP** who want a repeatable split between **durable** context (**`memory_ingest` / `memory_recall` / Obsidian**), **ephemeral** session state (**`cache`**, optional, in-process), and **GitHub** for execution.

---

## 1. Why this session mattered

A consolidated slide deck is a **product contract**: it lists Web3, Fabric, The Graph, Chainlink, OSV-Scanner, Istio, defense-in-depth, and more. If that narrative runs ahead of **issues and code**, the story drifts. This session was **reconcile deck → open issues → new issues** while keeping a clear boundary:

| Layer                 | Tooling                              | Role in this session                                                                                                              |
| --------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Ephemeral scratch** | MCP **`cache`** (always on)          | Stash **transient** keys (working notes, last-known issue list, “do not put in the vault” scratch) — **not** long-term memory.    |
| **Durable recall**    | **`memory_recall`** (vault Markdown) | **Before** writing new issues, pull prior decisions and deck-related notes so filing is **informed**, not from chat memory alone. |
| **Durable write**     | **`memory_ingest`**                  | **After** the session, append a **summary** of what was created and how it links to the deck.                                     |
| **Execution**         | **`gh`**, GitHub                     | The **system of record** for shippable work.                                                                                      |

For when **`cache` is** vs is **not** the right tool, see **[`docs/cache-tool.md`](../cache-tool.md)**. **`cache`** is **in-process** and **LRU-bounded** — it is the right place for “temporary issue numbers and information we do **not** want to persist to long-term memory” for as long as the MCP server process (and the session) lasts.

---

## 2. The slide deck as product contract

- **Source:** [`docs/presentations/clawql-slides.md`](../presentations/clawql-slides.md) — **80** slides, sections **§01–§08** (Core through Defense in Depth), plus a closing slide.
- **Paired long-form security reference:** [`docs/security/clawql-security-defense-in-depth.md`](../security/clawql-security-defense-in-depth.md) (aligns with **§08**).
- **Not used as a second source of truth:** the deck is **aspirational** in places; the gap pass explicitly preferred **“file an issue and label scope”** over silently assuming the repo already matched every slide bullet.

The assistant enumerated **all open issues** in **`danielsmithdevelopment/ClawQL`**, then compared that set to the deck’s major **themes** (Istio, OSV, Fabric, The Graph, Chainlink, Jaeger, Vault, Web3, transcript parity, etc.).

---

## 3. memory_recall before creating issues

**Before** opening new GitHub issues, the assistant called **`memory_recall`** (ClawQL MCP) with a focused **query** — e.g. keywords like **clawql slide deck**, **slides security**, **roadmap** — so the filing pass could reuse **prior vault notes** instead of inventing context.

**What came back (examples):**

- `Memory/clawql-slide-deck-and-security-documentation-april-2026.md` — prior ingest describing the **80-slide** deck and **§08** work.
- `Memory/clawql-complete-consolidated-slide-deck-april-2026.md` and transcript-related notes (older; useful as **history**, not as the canonical slide count).
- `Memory/clawql-agent-platform-vision-and-roadmap-2026-04-17.md` and related **roadmap** material.

**Why this step matters:** **`memory_recall`** grounds **“what we already said in the vault”** (titles, wikilinks, earlier prioritization) so new issues can **link** to stable narrative and avoid duplicate “deck refresh” work where an ingest already exists. It does **not** replace **`gh issue list`**, which is the **authoritative** set of open engineering tickets.

**Parameters used (illustrative):** `query` = short keyword phrase, **`limit`** small (e.g. 5–8), optional **`maxDepth`** when graph follow-through matters (wikilinks). See [`docs/mcp-tools.md`](../mcp-tools.md) under **`memory_recall`**.

---

## 4. cache for short-lived working state

During the gap pass, the assistant used the MCP **`cache`** tool to hold **transient** state that should **not** be committed to the Obsidian vault — for example:

- A short **working summary** of “what we are comparing this round” (deck section → theme list).
- **Scratch keys** such as `deck-gap-analysis-2026-04-25` and, after new issues were filed, a compact list of **new issue numbers and titles** under something like `deck-gaps-issues` — **ephemeral** labels for the rest of the **same** assistant run, not durable project memory.

**Important:** `cache` is **ephemeral in this MCP server process** (see [`docs/cache-tool.md`](../cache-tool.md)). A restart, a different process, or another client does not see these keys. That is the intended behavior: **scratch**, not a substitute for **`memory_ingest`**.

**Contrast:** Issue numbers, titles, and the **rationale** for each gap were written to **GitHub** (durable, linkable) and, at the end, to **`memory_ingest`** (durable, recallable in the vault). The **`cache`** copy was only to avoid re-listing 12 issues in every tool turn **within the session**.

---

## 5. Comparing the deck to open issues

1. **Extract structure** from the deck: slide titles / sections (e.g. Architecture, Web3, Defense in Depth) and major themes.
2. **List open issues** in the repo (`gh issue list --state open` — sort by number for a stable view).
3. **Keyword map:** for each **major** theme (Istio, OSV, Fabric, Graph, Chainlink, x402, …), check whether an open issue **already** tracks it. Many were already covered (e.g. public **x402** / gateway [**#88**](https://github.com/danielsmithdevelopment/ClawQL/issues/88), **Helm** full-stack was previously shipped; **Onyx** / **Flink** have dedicated closed or open items).
4. **Gap = deck claims work that has no (or a clearly incomplete) issue** — file a new issue with **scope**, **acceptance**, and **links** to the deck and related docs so future readers know **why** the issue exists.

---

## 6. New GitHub issues filed (April 2026)

Twelve new issues were opened to connect the **April 2026** deck to an explicit backlog (numbers shown as filed in that session):

| #        | Area                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **#155** | Optional **Istio** + **Kiali**, mTLS east-west                                                                                  |
| **#156** | **OSV-Scanner** + Golden Image — **CI + publish + docs** (narrowed); **#202**–**#204** = MCP OSV, Helm rescan, audit/memory hooks |
| **#157** | **Hyperledger Fabric** — Helm, `CLAWQL_ENABLE_FABRIC`, `providers/fabric`                                                       |
| **#158** | **The Graph** — bundled OpenAPI / execute path                                                                                  |
| **#159** | **Chainlink** — bundled provider surface                                                                                        |
| **#160** | **Jaeger** / **OTLP** tracing                                                                                                   |
| **#161** | **HashiCorp Vault** or **OpenBao** (vs chart **Obsidian** `vault` hostPath naming)                                              |
| **#162** | **ClawQL-Web3** — AgentKit / **IPFS** / **CCIP** (extends beyond **#88**)                                                       |
| **#163** | **Transcript** parity: [`clawql-slides-transcript.md`](../presentations/clawql-slides-transcript.md) vs **80** slides + **§08** |
| **#164** | **Defense-in-depth** doc → control / deliverable **matrix**                                                                     |
| **#165** | **Meta:** update obsolete **slide §** references in existing issue bodies                                                       |
| **#166** | **Demos** — honest walkthroughs for high-stakes narrative slides (e.g. 50, 56)                                                  |

Cross-links between issues (e.g. **#88**, **#132**, **#133**, **#128**, **#129**, **#131**) were added in the bodies so **P2/P3** dependencies stay navigable from GitHub, not only from the deck.

---

## 7. memory_ingest when the work is done

After creating issues and updating the mental model of “deck ↔ backlog,” the assistant used **`memory_ingest`** with a **stable title** (so related sessions **append**), a **`sessionId`**, and **`append: true`**, to record:

- The **12** new issues and the **thematic** buckets.
- A pointer to the **canonical** deck file and the **defense-in-depth** companion doc.
- (Optional) **`wikilinks`** to related vault note titles, e.g. the consolidated deck ingest note, for **graph** recall in Obsidian.

**Why not only `cache`?** The vault is the **durable** place to answer, next month: _“What did we file when the deck went to 80 slides?”_ **`cache`** from that day is long gone. **`memory_ingest`** is the durable counterpart for **human+assistant** continuity.

---

## 8. Scratch, trail, and durable memory (summary)

| Store               | When to use                                                            | This session                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`cache`**         | Session handoff, scratch keys, **ephemeral** lists (same MCP process)  | Stashed working **gap** labels and new-issue list **in-session**; **not** vault-persisted.                                                             |
| **`audit`**         | In-process **operator** trail of MCP tool calls (optional)             | Not the focus; see [`docs/enterprise-mcp-tools.md`](../enterprise-mcp-tools.md) and [#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89). |
| **`memory_recall`** | Find **existing** deck/roadmap/security notes before editing or filing | **Queried** the vault for slide-deck and prior security ingests **before** creating issues.                                                            |
| **GitHub issues**   | Shippable, linkable, assignable work                                   | **12** new issues + cross-links to prior epics.                                                                                                        |
| **`memory_ingest`** | Durable **summary** of outcomes and **wikilinks** for the graph        | **Appended** session outcome to the long-running “slide deck + security” note (or a sibling title).                                                    |

---

## 9. References

- [`docs/presentations/clawql-slides.md`](../presentations/clawql-slides.md) — canonical deck
- [`docs/security/clawql-security-defense-in-depth.md`](../security/clawql-security-defense-in-depth.md) — **§08** long-form
- [`docs/cache-tool.md`](../cache-tool.md) — **cache** tool semantics
- [`docs/mcp-tools.md`](../mcp-tools.md) — **memory_ingest**, **memory_recall**
- GitHub: issues **#155**–**#166** in **danielsmithdevelopment/ClawQL** (April 2026)
- [`.cursor/skills/clawql-vault-memory/SKILL.md`](../../.cursor/skills/clawql-vault-memory/SKILL.md) — deep ingest and recall pattern

**Website (readable layout with TOC):** `https://docs.clawql.com/case-studies/slide-deck-github-parity-cache-memory-recall-2026-04` — kept in **sync** with this file; edit both when the narrative changes.

---

## Case study metadata

| Item               | Value                                                                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Session**        | April 2026, Cursor + ClawQL MCP (scoped server id e.g. `project-0-ClawQL-clawql` in multi-config setups)                                                                                                                   |
| **Outcomes**       | 12 new GitHub issues, vault `memory_ingest` append, this case study + website mirror                                                                                                                                       |
| **Primary lesson** | **`memory_recall`** for grounding → **`gh`** for ground truth on open work → **`cache`** only for **same-session** scratch that must **not** bloat the vault → **`memory_ingest`** for durable “what we decided and filed” |
