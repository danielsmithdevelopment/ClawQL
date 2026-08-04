## clawql-mcp 7.2.0

**npm:** [`clawql-mcp@7.2.0`](https://www.npmjs.com/package/clawql-mcp/v/7.2.0) (publish on tag `v7.2.0`)  
**Full changelog:** [CHANGELOG.md#720---2026-08-04](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md#720---2026-08-04)  
**Release date:** 2026-08-04

---

## Headline

**ClawQL 7.2.0** is the **Memory Stack** minor on the **7.0 Agentic Gateway** line: production recall that beats keyword grep, **git-native vault Mode A**, hybrid RRF, WORM seal + recall events, and a **CodeGraph → vault** flywheel — plus Convergence Week protocol/OKF/PorTAL, native codegraph, and a deeper IDP document pipeline.

**ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI.** 7.1 shipped Ontology + payments rails; **7.2** closes the PragmaticVectors memory-stack gaps so agents can trust the vault in real corpora.

→ Announcement drafts: [`docs/announcements/announcement-drafts-v7.2.0.md`](docs/announcements/announcement-drafts-v7.2.0.md) · Prior minor: [`RELEASE_NOTES_v7.1.0.md`](RELEASE_NOTES_v7.1.0.md)

---

## What’s new (operator truths)

### 1. Memory Stack 2.0 (vision gap closure)

| Piece                  | What shipped                                                                                                                                                                                                                        | PRs                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Layer 2 ranking**    | IDF + log-TF keyword scores; wikilink surface; honest embedding sync; **in-process MiniLM** (`Xenova/all-MiniLM-L6-v2`); **vectors mandatory** (keyword-only is break-glass only); bakeoff regressions; default `minScore` **0.05** | [#801](https://github.com/danielsmithdevelopment/ClawQL/pull/801) |
| **Index-first recall** | Survey `index.md` / `log.md` before bodies; large-vault body restriction; catalog boost                                                                                                                                             | [#803](https://github.com/danielsmithdevelopment/ClawQL/pull/803) |
| **Git Mode A**         | `CLAWQL_MEMORY_BACKEND=git` — commit-on-ingest, optional push; `result.git`                                                                                                                                                         | [#804](https://github.com/danielsmithdevelopment/ClawQL/pull/804) |
| **Hybrid RRF**         | Path-keyed reciprocal rank fusion; `CLAWQL_MEMORY_RECALL_HYBRID=1`                                                                                                                                                                  | [#806](https://github.com/danielsmithdevelopment/ClawQL/pull/806) |
| **WORM seal**          | Auto `worm_ref: sha256:…` on ingest; `MEMORY_RECALL` events                                                                                                                                                                         | [#807](https://github.com/danielsmithdevelopment/ClawQL/pull/807) |
| **CodeGraph flywheel** | `codegraph_impact` → vault `type: code_change` (disable with `CLAWQL_CODEGRAPH_CODE_CHANGE_INGEST=0`)                                                                                                                               | [#808](https://github.com/danielsmithdevelopment/ClawQL/pull/808) |

→ Operator knobs: [`docs/memory/okf.md`](docs/memory/okf.md) · Hybrid backends: [`docs/memory/hybrid-memory-backends.md`](docs/memory/hybrid-memory-backends.md)

### 2. Convergence Week — MCP / OKF / PorTAL

- **mcp-grpc-transport 1.0.0** + Streamable HTTP: MCP **2026-07-28** (`Discover`, per-request client info).
- **OKF v0.2** trust signals (`generated`, `verified`, `stale_after`, …); `clawql memory lint|migrate|query`.
- **PorTAL flywheel** — `portal-bundle` export + finetune refit path.

### 3. Native CodeGraph

- TypeScript-first `codegraph_sync` (no Python Graphify CLI required).
- `codegraph_explore` / `codegraph_impact`; 30+ languages via tree-sitter WASMs.

### 4. IDP document pipeline deepening

- `inspect_pdf` / `convert_document` (pdf-inspector / anydoc); Helm classifier + LangExtract sidecars.
- Vertical Compose stacks (healthcare / legal / education) + HITL Label Studio predictions.
- Local Privacy Filter backup after Presidio ([#245](https://github.com/danielsmithdevelopment/ClawQL/issues/245)).

### 5. MCP stdio reliability

- Quiet `dotenv` (no stdout banner corrupting JSON-RPC).
- Spec warm after **Ready** so Cursor discovery is not blocked by six-vendor `loadSpec()`.

---

## Upgrade (7.1.0 → 7.2.0)

```bash
npm install clawql-mcp@7.2.0
# or
npx -p clawql-mcp@7.2.0 clawql-mcp

helm upgrade --install clawql ./charts/clawql-mcp \
  --set image.tag=7.2.0   # or your digest
```

### Behavioral notes (not a semver-major, but operators should read)

- **Vectors are mandatory** for memory. `CLAWQL_VECTOR_BACKEND=off` is ignored unless **`CLAWQL_ALLOW_KEYWORD_ONLY_MEMORY=1`** (tests / emergencies only). Default embeds **in-process** with local MiniLM (no API key / Ollama required).
- Default **`CLAWQL_MEMORY_RECALL_MIN_SCORE`** is **`0.05`** (IDF fractional scores). Callers that hard-coded `minScore: 1` may see empty results until they lower the floor.
- New **opt-in** memory knobs: `CLAWQL_MEMORY_BACKEND=git`, `CLAWQL_MEMORY_RECALL_HYBRID=1`, index-first / RRF toggles — see [`docs/memory/okf.md`](docs/memory/okf.md).
- Workspace packages remain **7.2.0** in lockstep; separate registry publish of `clawql-*` modules still follows OIDC package linking (same story as 7.1 — may ship inside `clawql-mcp` until linked).

---

## Helm

| Chart                    | Chart version | appVersion |
| ------------------------ | ------------- | ---------- |
| `charts/clawql-mcp`      | `0.7.2`       | `7.2.0`    |
| `charts/clawql-operator` | `0.2.2`       | `7.2.0`    |
| `charts/clawql-idp`      | `0.1.2`       | `7.2.0`    |

---

## Out of scope for 7.2.0

- OpenBench full A/B win matrix ([#758](https://github.com/danielsmithdevelopment/ClawQL/pull/758) still open).
- Separate npm publish of every `clawql-*` package (OIDC link gated).
- TypeScript 7 major (#651 / dependabot).
- Ontology essay “disclose” items (SQL / Command Deck / VS Code / Arweave) — not a ship gate for this minor.

---

## Release checklist

See [`docs/release/v7.2.0-checklist.md`](docs/release/v7.2.0-checklist.md).
