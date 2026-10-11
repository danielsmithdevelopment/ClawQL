---
canonical: https://pragmaticvectors.com/posts/agent-memory-stack/
meta-description: ClawQL's memory stack in 8.0 — OKF vault, vector recall, optional Onyx — and why PageIndex and CodeGraph were removed after graded evals failed the ship bar.
status: READY TO PASTE over the live post (applies agent-memory-stack-corrections.md)
---

Architecture · Updated for ClawQL 8.0

# The Complete Agent Memory Stack

[Daniel Smith](https://pragmaticvectors.com/about) · [@danielsmithdev](https://x.com/danielsmithdev) · [ClawQL](https://clawql.com)

ClawQL’s memory architecture — OKF vault, vector recall, and optional Onyx — and how they compose into persistent, auditable, sovereign agent intelligence. **8.0 correction:** PageIndex and CodeGraph are no longer product layers.

This pairs with [Git-native agent memory](https://pragmaticvectors.com/posts/) (vault backend, auto-commit, R2/Arweave durability), the [Enterprise Ontology](https://docs.clawql.com/architecture/enterprise-ontology), and [twelve layers of LLM cost](https://pragmaticvectors.com/posts/twelve-layers-llm-cost/). OKF serialization: [docs/memory/okf.md](https://docs.clawql.com/). Token-efficiency layers: [docs.clawql.com/architecture/token-efficiency](https://docs.clawql.com/architecture/token-efficiency).

- [Agents](https://pragmaticvectors.com/tags/agents)
- [Memory](https://pragmaticvectors.com/tags/memory)
- [Benchmarks](https://pragmaticvectors.com/tags/benchmarks)

---

## The tax nobody measures

Every AI coding session opens with the same overhead. The developer types something like “continue working on the authentication refactor.” The agent asks what the authentication refactor is.

It has no idea. The decision to use JWT over sessions last week is gone. The three hours spent benchmarking argon2 against bcrypt — gone. Organizational knowledge — the reasoning behind decisions, the approaches that were tried and rejected — doesn’t survive the context window boundary at all.

This isn’t a model failure. Models demonstrate within-session memory just fine. The problem is architectural: nothing persists between sessions.

## What agents actually need to remember

“Memory” covers at least five distinct categories, each requiring different storage and retrieval:

1. **Decisions** — why JWT instead of sessions; why the current architecture rather than the alternatives.
2. **Domain entities** — typed, relationship-aware facts (contracts, customers, assets). See the Enterprise Ontology post.
3. **Session context** — what was in progress, what was blocked, what the next step was.
4. **Team knowledge** — decisions and patterns shared across the swarm.
5. **Codebase structure** — which files exist, how they relate. Agents still rediscover this with `grep` / `read_around` today; a structural index may return later (see below).

## The live stack (8.0)

```
Layer 3: Onyx — Semantic enterprise knowledge (opt-in hybrid / explicit sources)
Layer 2: Vector Recall — Semantic similarity search over vault entries
Layer 1: OKF Vault (.cqk / OKF .md) — Durable, auditable, structured knowledge
         + in-process lexical scoring (corpus IDF × log-saturated TF)
```

**Default `memory_recall` (omit `sources`):** vault keyword + wikilinks, plus vector KNN. That is the whole default path.

Onyx joins the default set only when `CLAWQL_MEMORY_RECALL_HYBRID_ONYX=1`, or when the caller passes explicit `sources: [...]`. Hybrid defaults are gated on measured task-completion gains — not on “more layers look better.”

> By default, `memory_recall` queries the OKF vault (keyword + wikilinks) and vector KNN. Onyx is available via `sources` or a hybrid env flag. ClawQL’s heading-tree PageIndex tools and hybrid PageIndex recall, and its structural CodeGraph tools, were removed in 8.0 after graded evals failed the ship bar; a Vectify-style redesign may return later as a new PageIndex experiment on a fresh hard set, and CodeGraph may be revisited on a large-monorepo cohort or with a local model — neither is a revival of the purged surface.

## Layer 1: The OKF vault

Every memory entry ClawQL stores is OKF-compatible: Markdown body, YAML frontmatter, file path as concept identity, wikilinks between concepts. The `.cqk` extension is the ClawQL Knowledge promotion of the same format.

Required `type` field. Optional `resource`, `description`, `tags`. Catalog in `index.md`. Changelog in `log.md`. ClawQL adds `worm_ref`, `correlation_id`, `agent_id`, `verdict`, and `confidence_score` — fields that tie every entry to the WORM audit trail.

Wikilinks create a traversable knowledge graph. `memory_recall` can follow them the way a human would navigate a wiki — start at one decision, follow links to related ones, build a coherent picture of a decision cluster.

Lexical scoring on the vault path is **corpus IDF × log-saturated TF** (not SQLite FTS5 / Okapi BM25). BM25 was evaluated as a length-normalized candidate and washed vs IDF — it is not the default.

`memory_recall` reads `index.md` first. Scanning the catalog is cheap; loading every entry in a large vault is not. The index-first pattern is what keeps recall economical as the vault grows.

## Layer 2: Vector recall

When `memory_ingest` creates an entry, it can also generate an embedding and store it in the derived index (`memory.db` / optional pgvector). On edge gateways this stays local; in the Virtual Gateway, Postgres/pgvector handles team scale.

The recall pipeline surveys the index, runs vault lexical scoring, runs vector similarity when configured, follows wikilinks from high-scoring seeds, and returns normalized `hits[]` with source attribution. Embedding failures fail open — the lexical vault path still works.

OpenBench tooling WINs prove the tools work; they are not claims of retrieval superiority over every alternative stack.

## Layer 3: Onyx (optional)

The vault captures what agents learned. Onyx surfaces what the organization already knew — Confluence, Notion, Slack, Drive, GitHub, Jira, and other connectors — with citation-backed, permission-aware results.

Wire it with `CLAWQL_ENABLE_ONYX=1` and either hybrid env or explicit `sources: ["onyx"]` (often alongside `vault` and `vector`).

## Removed in 8.0 (not Layer 3 / 4)

### PageIndex — purged

7.x shipped deterministic heading-tree tools (`pageindex_build_tree` / traverse / synthesize). They were vectorless hierarchical retrieval over Markdown structure — **not** an LLM category router (`page_index_path` sketches never shipped as product).

Graded evidence: hybrid PageIndex as a merge was harmful (−7.8 pts; 13/13 displaced). Track A fair test tied Net=4 → no Vectify port. The ClawQL PageIndex surface is **gone** in 8.0. Any future hierarchical index work is [post-8.0 Vectify backlog](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/backlog/post-8.0-vectify-pageindex.md), not a present-tense layer.

### CodeGraph — purged

Structural CodeGraph (`codegraph_*`, Graphify import/sync, `clawql-codegraph`) was removed after a strong-model Track B retest tied **Net=0** vs working `grep` + `read_around` → `tie_purge`. Do not list CodeGraph as a live stack layer or teach `CLAWQL_ENABLE_CODEGRAPH` / `codegraph_*` as operator guidance. Revival conditions (large-monorepo cohort / local model): [post-8.0 CodeGraph backlog](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/backlog/post-8.0-codegraph-revisit.md).

Purge inventory: [8.0.0-purge-inventory-spec](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/releases/8.0.0-purge-inventory-spec-v0.1.md).

## How the layers compose (8.0)

```ts
// Default (omit sources): vault + vector only
await memory_recall({ query: "why JWT over sessions?" });

// Explicit enterprise peer
await memory_recall({
  query: "token handling policy",
  sources: ["vault", "vector", "onyx"],
});
```

The agent receives normalized `hits[]` plus specialist `followUps` when needed. Source is recorded per hit. There is **no** default fan-out across purged PageIndex/CodeGraph layers.

## Team memory, WORM, flywheel

Individual vaults, team namespaces, and org vaults still compose through sync (R2) and ATRClaims. Every memory mutation can land in WORM — not just “we remember,” but provable records of what was ingested or recalled, when, and by which agent.

Verdict-filtered Flywheel export still turns good sessions into training data. That loop does not depend on PageIndex or CodeGraph.

## Getting started (8.0)

### Day 1: OKF vault

```bash
export CLAWQL_OBSIDIAN_VAULT_PATH=~/.ClawQL/vault
# Connect MCP; call memory_ingest / memory_recall
```

### Week 1: Vector recall

```bash
export CLAWQL_EMBEDDING_MODEL=text-embedding-3-small
# or a local embedding model
```

### When you need enterprise search

```bash
export CLAWQL_ENABLE_ONYX=1
export CLAWQL_MEMORY_RECALL_HYBRID_ONYX=1   # optional default join
```

Do **not** set `CLAWQL_ENABLE_PAGEINDEX` or `CLAWQL_ENABLE_CODEGRAPH` — those flags and tools are deleted in 8.0.

## The moat

The memory stack compounds. The longer it runs, the more the vault knows. The richer the vault, the better each session. Hybrid layers earn their place only when graded task completion moves — PageIndex and CodeGraph did not clear that bar in 8.0, so they are out of the default product surface until new evidence says otherwise.

OKF vault serialization and `memory_ingest` / `memory_recall` behavior: docs/memory/okf.md. Migration: [migrate-to-8.0](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/getting-started/migrate-to-8.0.md). Related essay: [Memory Finds. Ontology Decides.](https://pragmaticvectors.com/posts/memory-finds-ontology-decides/).
