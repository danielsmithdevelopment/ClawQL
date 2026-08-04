# ClawQL 7.2.0 — release announcement drafts (Medium, LinkedIn, HN/Reddit, X)

**Status:** Draft — publish after the live [GitHub release](https://github.com/danielsmithdevelopment/ClawQL/releases) tag `v7.2.0` and npm confirmation for **`clawql-mcp@7.2.0`**.

**Positioning (use everywhere):** ClawQL provides the **Agentic Gateway** as the **Foundational Platform for Auditable Production AI**.

**Links:** [GitHub release v7.2.0](https://github.com/danielsmithdevelopment/ClawQL/releases/tag/v7.2.0) · [npm: clawql-mcp@7.2.0](https://www.npmjs.com/package/clawql-mcp) · [Docs](https://docs.clawql.com) · [OKF memory](https://docs.clawql.com/memory/okf) · [CHANGELOG](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md) · [RELEASE_NOTES_v7.2.0.md](../../RELEASE_NOTES_v7.2.0.md)

**Note:** 7.1.0 announcement drafts remain at [`announcement-drafts-v7.1.0.md`](announcement-drafts-v7.1.0.md); **7.2** is the Memory Stack minor.

---

## 1) Medium / long blog post (draft)

**Title:** _ClawQL 7.2.0: Memory Stack that beats grep_

**Subhead:** A **semver-minor** that closes the PragmaticVectors memory gaps — IDF + local MiniLM, index-first recall, git Mode A, hybrid RRF, WORM seal, and a CodeGraph flywheel — on the same Agentic Gateway install.

**Body:**

**ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI.**

**7.1.0** gave you Ontology and agent economics. **7.2.0** is where the vault stops losing to `rg`.

We measured recall against keyword-count grep on a shared-vocabulary corpus and lost — until Layer 2 ranking, mandatory vectors, and index-first survey landed. This release packages that closure:

1. **Rank like a search engine** — IDF + log-TF, local MiniLM embeddings (no API key / Ollama egress by default), vectors mandatory.
2. **Survey before you drown** — `index.md` / `log.md` first; restrict body scans on large vaults.
3. **Git-native Mode A** — commit-on-ingest when `CLAWQL_MEMORY_BACKEND=git`.
4. **Hybrid RRF** — fuse vault + codegraph / pageindex / onyx when you flip the hybrid switch.
5. **WORM + flywheel** — auto `worm_ref` on ingest, `MEMORY_RECALL` events, CodeGraph impact → `type: code_change` notes.

Also in the box: MCP **2026-07-28**, OKF v0.2, PorTAL flywheel, native multi-language CodeGraph, and a deeper IDP pipeline (pdf-inspector, anydoc, vertical Compose, local Privacy Filter).

### Why it matters

If 7.1 was “schema the world and pay the agents,” **7.2** is “make the shared vault the source of truth agents can actually find.” Pin **`@7.2`** when you move images and Helm `appVersion`.

**CTA:** `npm install clawql-mcp@7.2.0` · read [CHANGELOG 7.2.0](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md) · [RELEASE_NOTES_v7.2.0.md](../../RELEASE_NOTES_v7.2.0.md)

---

## 2) LinkedIn (draft)

**Post:**

Shipped **clawql-mcp 7.2.0** (semver-**minor** on the 7.0 Agentic Gateway line).

Headline: **Memory Stack 2.0** — IDF ranking, local MiniLM vectors (mandatory), index-first recall, git Mode A, hybrid RRF, WORM seal, CodeGraph → vault flywheel.

Also: MCP 2026-07-28, OKF v0.2, native CodeGraph, deeper IDP docs pipeline.

Pin `@7.2` · notes: RELEASE_NOTES_v7.2.0.md · npm: clawql-mcp@7.2.0

#MCP #AgenticAI #Obsidian #DevTools

---

## 3) Hacker News / Reddit (draft)

**Title:** ClawQL 7.2.0 – Memory Stack that beats keyword grep (IDF + local MiniLM, git Mode A, hybrid RRF)

**Text:**

We open-source an Agentic Gateway (MCP search/execute over OpenAPI + vault memory). In 7.1 we shipped Ontology + payments. For 7.2 we closed measured memory gaps vs `rg` on a 116-note corpus: IDF keyword ranking, in-process MiniLM (no API egress), index-first survey, optional git commit-on-ingest, hybrid RRF, auto worm_ref, and CodeGraph impact → vault notes.

npm: `clawql-mcp@7.2.0`  
Notes: https://github.com/danielsmithdevelopment/ClawQL/blob/main/RELEASE_NOTES_v7.2.0.md

Happy to answer questions about the bakeoff methodology or the break-glass keyword-only flag.

---

## 4) X / short (draft)

**ClawQL 7.2.0** — Memory Stack minor: IDF + local MiniLM (vectors mandatory), index-first recall, git Mode A, hybrid RRF, WORM seal, CodeGraph flywheel. Also MCP 2026-07-28 + OKF v0.2.

`npm i clawql-mcp@7.2.0`
