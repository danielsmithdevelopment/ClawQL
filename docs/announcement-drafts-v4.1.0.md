# ClawQL 4.1.0 — release announcement drafts (Medium, LinkedIn, HN/Reddit, X)

**Links:** [GitHub release v4.1.0](https://github.com/danielsmithdevelopment/ClawQL/releases/tag/v4.1.0) · [npm: clawql-mcp](https://www.npmjs.com/package/clawql-mcp) · [Docs](https://docs.clawql.com) · [CHANGELOG](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md)

---

## 1) Medium / long blog post (draft)

**Title:** _ClawQL 4.1.0: Onyx search, Slack notify, and Ouroboros MCP — one server, optional superpowers_

**Subhead:** The Model Context Protocol server for OpenAPI-scale APIs adds enterprise knowledge, completion signals, and an evolutionary loop — all behind feature flags, same stdio/HTTP/gRPC process.

**Body:**

If you are wiring AI assistants to real systems, the hard part is rarely “call an API once.” It is keeping context small, auth sane, and workflows coherent across sessions. **ClawQL 4.1.0** pushes that story forward: optional tools that sit beside the two core tools — **`search`** and **`execute`** — without turning the MCP into a monolithic “everything in one JSON blob” server.

**What is new in 4.1.0**

**1. `knowledge_search_onyx` (optional)** — When you enable Onyx in your merge and set `CLAWQL_ENABLE_ONYX`, ClawQL exposes a thin `knowledge_search_onyx` tool that routes to your self-hosted [Onyx](https://www.onyx.app/) `send-search-message` flow. The same `execute` stack applies; you keep a single spec-driven mental model. The bundle also includes an Onyx ingestion path for `execute` workflows (post-archive indexing), documented in the repo. This is the “enterprise knowledge next to your APIs” chapter we have been building toward on the public roadmap.

**2. `notify` (optional)** — Turn on `CLAWQL_ENABLE_NOTIFY` and you get a first-class Slack `chat.postMessage` wrapper, aligned with the bundled Slack spec and the same error surfaces as the rest of `execute`. It is the obvious “done” and “failed” channel for long-running or multi-step automation — without shelling out to a separate process.

**3. Ouroboros MCP tools (optional)** — The new **`clawql-ouroboros`** workspace package (also on npm at 0.1.0) is an evolutionary loop library. When you set `CLAWQL_ENABLE_OUROBOROS`, the server registers three `ouroboros_*` tools backed by the library, with an optional Postgres-backed event store for lineage when you configure `CLAWQL_OUROBOROS_DATABASE_URL`. This is experimental, API-stable enough to try in anger, and documented in-repo and on the docs site.

**4. Durable memory improvements** — `memory_ingest` can carry optional **enterprise citation** payloads into the vault, and the existing **`toolOutputsFile`** path remains the escape hatch for very large bodies without stuffing megabytes into MCP tool JSON (added in the previous line release, now part of the story customers tell when ingesting big decks and logs).

**5. Hardening and operator reality** — The release includes a Vitest + `graphql` module resolution fix that removes a class of “two GraphQL realms” test failures, plus a compatibility note for Node 25 and the full bundled Slack spec under Omnigraph (REST fallback still works; upstream tracking remains open). Helm chart **0.4.0** carries `appVersion` **4.1.0** and the new feature flags for Onyx and Ouroboros.

**Why it matters**

ClawQL is not “yet another API wrapper.” It is a spec-first MCP process where optional capabilities stay opt-in, the GraphQL layer keeps answers lean, and the vault and tools you already run (Obsidian, Slack, document APIs) stay composable. Version **4.1.0** is a step toward the unified narrative in our public deck: APIs, documents, memory, and knowledge in one operable surface — without giving up self-hosting or clear boundaries between features.

**CTA:** Install `clawql-mcp@4.1.0`, read [`docs/mcp-tools.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp-tools.md), and open an issue if you need a follow-up (we already split a future `alert` tool to a dedicated ticket so `notify` can stand on its own).

**Footnote (honesty):** Some optional test depth (live Slack contract, Ouroboros + notify integration) and full OpenAPI GraphQL coverage for the giant Slack spec remain on the roadmap; see the project issues for the exact numbers. Production REST paths are unchanged.

---

## 2) LinkedIn (draft)

**Post:**

We just shipped **clawql-mcp 4.1.0** — a meaningful step for anyone running Model Context Protocol against real OpenAPI / Google Discovery surface area.

**What is in the box (all opt-in, same binary):**

- **`knowledge_search_onyx`** — wire self-hosted Onyx next to the rest of your merged specs.
- **`notify`** — Slack `chat.postMessage` as a first-class tool when the Slack spec is in the merge.
- **Ouroboros** — three optional `ouroboros_*` MCP tools from the new `clawql-ouroboros` library, with optional Postgres for lineage.
- **Memory** — optional enterprise citation blocks on `memory_ingest`, plus the existing `toolOutputsFile` path for huge payloads.

**Why we care:** Feature flags keep the default surface small; stdio, Streamable HTTP, and gRPC stay the same wire story. GraphQL in-process still trims execute responses. Helm 0.4.0 / app 4.1.0 for operators.

**Links:** GitHub release: `https://github.com/danielsmithdevelopment/ClawQL/releases/tag/v4.1.0`  
npm: `clawql-mcp@4.1.0`  
Docs: `https://docs.clawql.com`

If you are building agent platforms on top of MCP, this is a good release to pin.

#MCP #OpenAPI #ClawQL #AIinfrastructure #opensource

---

## 3) Hacker News + Reddit (draft)

**Hacker News `title` line (80 chars max for style):**

> ClawQL 4.1.0 – MCP server: optional Onyx, Slack notify, Ouroboros tools

(Adjust length if needed: “ClawQL 4.1.0: Onyx + Slack notify + Ouroboros MCP (OpenAPI)”)

**Submission URL:** `https://github.com/danielsmithdevelopment/ClawQL/releases/tag/v4.1.0` (or the blog post URL once published on Medium / your site)

**First comment (HN / r/golang or r/LocalLLaMA / r/MachineLearning as appropriate):**

I maintain **ClawQL** — a TypeScript MCP server that does spec-driven **`search` / `execute`** over OpenAPI 3, Swagger 2, and Google Discovery, with an in-process OpenAPI→GraphQL path for single-spec responses.

**4.1.0** is mostly “optional superpowers, still one process”:

- **`knowledge_search_onyx`** behind `CLAWQL_ENABLE_ONYX` — talks to a bundled Onyx OpenAPI shape (`onyx` in the default `all-providers` merge or your own merge).
- **`notify`** behind `CLAWQL_ENABLE_NOTIFY` — Slack `chat.postMessage` without ad hoc scripts.
- **Three `ouroboros_*` tools** behind `CLAWQL_ENABLE_OUROBOROS` — from the new **`clawql-ouroboros`** package, optional PG event store.
- **Memory:** optional **enterpriseCitations** on `memory_ingest`; large bodies can use `toolOutputsFile` (path allowlist on the server).

We also fixed a class of Vitest + duplicate `graphql` “realm” test failures and documented a Node 25 + Omnigraph quirk for the _full_ mega Slack spec (tests use a minimal fixture; production still has REST).

Repo is Apache-2.0. `npm i clawql-mcp@4.1.0`.  
Happy to answer questions about the merge model, Onyx auth envs, or why Ouroboros is feature-flagged.

**Reddit title (example for r/selfhosted):**  
_ClawQL 4.1.0 released — MCP for OpenAPI + optional Onyx knowledge + Slack notify (self-hosted)_

---

## 4) X (Twitter) thread (draft; ~280 char segments)

**1/12**  
ClawQL 4.1.0 is out. Same MCP: `search` + `execute` on OpenAPI / Discovery. New optional tools sit behind flags — you choose what loads.

**2/12**  
`knowledge_search_onyx` — `CLAWQL_ENABLE_ONYX`, `onyx` in merge, point `ONYX_BASE_URL` at self-hosted Onyx. Enterprise search next to the rest of your tools.

**3/12**  
`notify` — `CLAWQL_ENABLE_NOTIFY` — Slack `chat.postMessage` with the same auth + error model as the rest of execute. Good for “done” / “failed” from agents.

**4/12**  
Ouroboros: three optional `ouroboros_*` tools when `CLAWQL_ENABLE_OUROBOROS=1`, powered by the new `clawql-ouroboros` package. Optional Postgres via `CLAWQL_OUROBOROS_DATABASE_URL` for event lineage.

**5/12**  
Memory: `memory_ingest` can store capped `enterpriseCitations` from Onyx-flavored JSON. For huge text, `toolOutputsFile` reads a server-side file under an allowlist — no 80 KB tool JSON.

**6/12**  
Ops: Helm chart 0.4.0, appVersion 4.1.0. Enable Onyx + Ouroboros from values. stdio, Streamable HTTP, gRPC unchanged.

**7/12**  
DX: Vitest + `graphql` `index.js` alias fixes duplicate GraphQL class bugs in our test suite. Node 25 + full bundled Slack spec still a known Omnigraph path — we doc’d it; REST fallback is fine.

**8/12**  
`npm i clawql-mcp@4.1.0`  
Release: `github.com/danielsmithdevelopment/ClawQL/releases/tag/v4.1.0`

**9/12**  
Docs site updated: `/onyx-knowledge`, `/notify`, `/ouroboros`, tools page no longer says Ouroboros “isn’t on the server” — it is, when you turn the flag on.

**10/12**  
Apache-2.0. Roadmap: optional `alert` tool split to #150; full Slack OpenAPI GraphQL test after upstream graphql-mesh#9447 — we track the numbers in GitHub.

**11/12**  
If you want “APIs + docs + memory + search” in one self-hosted process, this release is a good one to read the CHANGELOG and try a merge preset.

**12/12**  
Thread links: [CHANGELOG](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md) · [mcp-tools](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/mcp-tools.md) · [docs.clawql.com](https://docs.clawql.com) — DMs open for production feedback.

---

_End of draft file. You can copy sections into Medium/LinkedIn/HN/Reddit/X without the horizontal rules, and trim tone per platform policy._
