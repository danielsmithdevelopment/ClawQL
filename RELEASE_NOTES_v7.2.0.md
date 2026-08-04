## clawql-mcp 7.2.0

**npm:** [`clawql-mcp@7.2.0`](https://www.npmjs.com/package/clawql-mcp/v/7.2.0) (publish on tag `v7.2.0`)  
**Full changelog:** [CHANGELOG.md#720---2026-08-04](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md#720---2026-08-04)  
**Release date:** 2026-08-04  
**Since:** `v7.1.0` (2026-07-20) — **~223 commits**, **48 merged PRs** (excluding the 7.1.0 prep PR)

---

## Headline

**ClawQL 7.2.0** is the **Memory Stack + IDP completion** minor on the **7.0 Agentic Gateway** line: production recall that beats keyword grep, **git-native vault Mode A**, hybrid RRF, WORM seal + recall events, CodeGraph → vault flywheel, Convergence Week protocol/OKF/PorTAL, **mcp-api-adapter**, Managed Edge Gateway wedge, Cloud Agent / team-sync hardening, and the remaining IDP Partials (Stirling redact + NATS document queues).

**ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI.** 7.1 shipped Ontology + payments rails; **7.2** closes the PragmaticVectors memory-stack gaps and finishes the IDP event bus story.

→ Announcement drafts: [`docs/announcements/announcement-drafts-v7.2.0.md`](docs/announcements/announcement-drafts-v7.2.0.md) · Prior minor: [`RELEASE_NOTES_v7.1.0.md`](RELEASE_NOTES_v7.1.0.md) · Checklist: [`docs/release/v7.2.0-checklist.md`](docs/release/v7.2.0-checklist.md)

---

## What’s new (operator truths)

### 1. Memory Stack 2.0 (vision gap closure)

| Piece                  | What shipped                                                                                                                                          | PRs                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Layer 2 ranking**    | IDF + log-TF; wikilink surface; honest embedding sync; **in-process MiniLM**; **vectors mandatory**; bakeoff regressions; default `minScore` **0.05** | [#801](https://github.com/danielsmithdevelopment/ClawQL/pull/801) |
| **Index-first recall** | Survey `index.md` / `log.md` before bodies; large-vault body restriction                                                                              | [#803](https://github.com/danielsmithdevelopment/ClawQL/pull/803) |
| **Git Mode A**         | `CLAWQL_MEMORY_BACKEND=git` — commit-on-ingest, optional push; `result.git`                                                                           | [#804](https://github.com/danielsmithdevelopment/ClawQL/pull/804) |
| **Hybrid RRF**         | Path-keyed reciprocal rank fusion; `CLAWQL_MEMORY_RECALL_HYBRID=1`                                                                                    | [#806](https://github.com/danielsmithdevelopment/ClawQL/pull/806) |
| **WORM seal**          | Auto `worm_ref: sha256:…` on ingest; `MEMORY_RECALL` events                                                                                           | [#807](https://github.com/danielsmithdevelopment/ClawQL/pull/807) |
| **CodeGraph flywheel** | `codegraph_impact` → vault `type: code_change`                                                                                                        | [#808](https://github.com/danielsmithdevelopment/ClawQL/pull/808) |

→ [`docs/memory/okf.md`](docs/memory/okf.md) · [`docs/memory/hybrid-memory-backends.md`](docs/memory/hybrid-memory-backends.md)

### 2. Convergence Week — MCP / OKF / PorTAL

- **mcp-grpc-transport 1.0.0** + Streamable HTTP: MCP **2026-07-28** ([#792](https://github.com/danielsmithdevelopment/ClawQL/pull/792)).
- **OKF v0.2** trust signals; `clawql memory lint|migrate|query`.
- **PorTAL flywheel** — `portal-bundle` export + finetune refit.

### 3. Native CodeGraph ([#793](https://github.com/danielsmithdevelopment/ClawQL/pull/793))

- TypeScript-first `codegraph_sync` (no Python Graphify CLI required).
- `codegraph_explore` / `codegraph_impact`; 30+ languages via tree-sitter WASMs.

### 4. mcp-api-adapter + Managed Edge Gateway

- **`mcp-api-adapter`** — any MCP → OpenAPI + GraphQL + `/mcp` + gRPC + `gen-cli` ([#795](https://github.com/danielsmithdevelopment/ClawQL/pull/795), [#796](https://github.com/danielsmithdevelopment/ClawQL/pull/796)).
- **Managed Edge Gateway** wedge — `clawql gateway create|status|destroy`, compose/nginx examples, virtual-key tenant claims, gated Helm ([#746](https://github.com/danielsmithdevelopment/ClawQL/pull/746)).

### 5. IDP document pipeline (Partials → Shipped)

| Track                                                                  | PR                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| pdf-inspector / anydoc + Helm classifier/LangExtract                   | [#797](https://github.com/danielsmithdevelopment/ClawQL/pull/797) |
| Vertical Compose + HITL predictions                                    | [#802](https://github.com/danielsmithdevelopment/ClawQL/pull/802) |
| Local Privacy Filter after Presidio                                    | [#805](https://github.com/danielsmithdevelopment/ClawQL/pull/805) |
| Stirling redact + Nextcloud/Coneshare NATS queues + classifier promote | [#810](https://github.com/danielsmithdevelopment/ClawQL/pull/810) |
| NATS IDP e2e enablement (Helm profile, KEDA, smoke, Agent contract) | [#812](https://github.com/danielsmithdevelopment/ClawQL/pull/812) |
| Tracking hygiene (#226–#259)                                           | [#809](https://github.com/danielsmithdevelopment/ClawQL/pull/809) |

### 6. Sync, Cloud Agent, inference, OpenBench, release tooling

- `clawql sync ensure` bucket create ([#755](https://github.com/danielsmithdevelopment/ClawQL/pull/755)); auto-push rate limits ([#800](https://github.com/danielsmithdevelopment/ClawQL/pull/800)).
- Cloud Agent stdio MCP + R2 guide ([#754](https://github.com/danielsmithdevelopment/ClawQL/pull/754), [#756](https://github.com/danielsmithdevelopment/ClawQL/pull/756), [#757](https://github.com/danielsmithdevelopment/ClawQL/pull/757)).
- OpenBench + OpenRouter-first inference ([#741](https://github.com/danielsmithdevelopment/ClawQL/pull/741), [#750](https://github.com/danielsmithdevelopment/ClawQL/pull/750), [#752](https://github.com/danielsmithdevelopment/ClawQL/pull/752)).
- Layer 0 immutable release pipeline + guide ([#743](https://github.com/danielsmithdevelopment/ClawQL/pull/743), [#747](https://github.com/danielsmithdevelopment/ClawQL/pull/747)).
- Quiet dotenv + fast stdio Ready for Cursor ([#799](https://github.com/danielsmithdevelopment/ClawQL/pull/799)).

### 7. Site / GTM

- clawql.com agent readiness + deploy fixes ([#742](https://github.com/danielsmithdevelopment/ClawQL/pull/742), [#744](https://github.com/danielsmithdevelopment/ClawQL/pull/744), [#791](https://github.com/danielsmithdevelopment/ClawQL/pull/791)).
- `/idp` landing + IDP GTM playbook ([#760](https://github.com/danielsmithdevelopment/ClawQL/pull/760), [#753](https://github.com/danielsmithdevelopment/ClawQL/pull/753)).
- Plugins top-level nav + Aug 2026 rewrite pack ([#751](https://github.com/danielsmithdevelopment/ClawQL/pull/751), [#790](https://github.com/danielsmithdevelopment/ClawQL/pull/790)).

---

## Merged since `v7.1.0` (finished inventory)

Product / docs / CI (non-Dependabot):

| Date       | PR                                                                | Title                                 |
| ---------- | ----------------------------------------------------------------- | ------------------------------------- |
| 2026-07-23 | [#742](https://github.com/danielsmithdevelopment/ClawQL/pull/742) | clawql.com agent readiness            |
| 2026-07-23 | [#744](https://github.com/danielsmithdevelopment/ClawQL/pull/744) | Restore docs/landing deploys          |
| 2026-07-23 | [#743](https://github.com/danielsmithdevelopment/ClawQL/pull/743) | Layer 0 immutable release pipeline    |
| 2026-07-23 | [#745](https://github.com/danielsmithdevelopment/ClawQL/pull/745) | Restore main after Dependabot fallout |
| 2026-07-24 | [#741](https://github.com/danielsmithdevelopment/ClawQL/pull/741) | OpenBench + clawql-inference BYOK     |
| 2026-07-24 | [#746](https://github.com/danielsmithdevelopment/ClawQL/pull/746) | Managed Edge Gateway go-live wedge    |
| 2026-07-24 | [#747](https://github.com/danielsmithdevelopment/ClawQL/pull/747) | Immutable releases guide UX           |
| 2026-07-25 | [#750](https://github.com/danielsmithdevelopment/ClawQL/pull/750) | OpenBench CI A/B (skip-if-no-secret)  |
| 2026-07-26 | [#751](https://github.com/danielsmithdevelopment/ClawQL/pull/751) | Plugins top-level nav                 |
| 2026-07-26 | [#753](https://github.com/danielsmithdevelopment/ClawQL/pull/753) | IDP GTM playbook                      |
| 2026-07-26 | [#755](https://github.com/danielsmithdevelopment/ClawQL/pull/755) | `clawql sync ensure`                  |
| 2026-07-26 | [#754](https://github.com/danielsmithdevelopment/ClawQL/pull/754) | Cloud Agent MCP + R2 bootstrap        |
| 2026-07-26 | [#752](https://github.com/danielsmithdevelopment/ClawQL/pull/752) | OpenRouter-first inference            |
| 2026-07-26 | [#757](https://github.com/danielsmithdevelopment/ClawQL/pull/757) | Cloud Agent workspace npx fix         |
| 2026-07-26 | [#756](https://github.com/danielsmithdevelopment/ClawQL/pull/756) | Cloud Agent e2e R2 memory guide       |
| 2026-07-29 | [#760](https://github.com/danielsmithdevelopment/ClawQL/pull/760) | clawql.com/idp landing                |
| 2026-08-04 | [#790](https://github.com/danielsmithdevelopment/ClawQL/pull/790) | Content rewrite pack                  |
| 2026-08-04 | [#791](https://github.com/danielsmithdevelopment/ClawQL/pull/791) | Docs deploy brace-expansion fix       |
| 2026-08-04 | [#792](https://github.com/danielsmithdevelopment/ClawQL/pull/792) | Convergence Week parity               |
| 2026-08-04 | [#793](https://github.com/danielsmithdevelopment/ClawQL/pull/793) | Native CodeGraph                      |
| 2026-08-04 | [#795](https://github.com/danielsmithdevelopment/ClawQL/pull/795) | mcp-api-adapter                       |
| 2026-08-04 | [#796](https://github.com/danielsmithdevelopment/ClawQL/pull/796) | mcp-api-adapter gRPC /mcp fix         |
| 2026-08-04 | [#799](https://github.com/danielsmithdevelopment/ClawQL/pull/799) | Quiet dotenv + fast stdio Ready       |
| 2026-08-04 | [#800](https://github.com/danielsmithdevelopment/ClawQL/pull/800) | Sync auto-push rate limit             |
| 2026-08-04 | [#797](https://github.com/danielsmithdevelopment/ClawQL/pull/797) | pdf-inspector / anydoc / Helm IDP     |
| 2026-08-04 | [#802](https://github.com/danielsmithdevelopment/ClawQL/pull/802) | Vertical Compose + HITL predictions   |
| 2026-08-04 | [#801](https://github.com/danielsmithdevelopment/ClawQL/pull/801) | Memory IDF + local embeddings         |
| 2026-08-04 | [#803](https://github.com/danielsmithdevelopment/ClawQL/pull/803) | Index-first recall                    |
| 2026-08-04 | [#805](https://github.com/danielsmithdevelopment/ClawQL/pull/805) | Local Privacy Filter                  |
| 2026-08-04 | [#804](https://github.com/danielsmithdevelopment/ClawQL/pull/804) | Git Mode A                            |
| 2026-08-04 | [#806](https://github.com/danielsmithdevelopment/ClawQL/pull/806) | Hybrid RRF                            |
| 2026-08-04 | [#808](https://github.com/danielsmithdevelopment/ClawQL/pull/808) | CodeGraph flywheel                    |
| 2026-08-04 | [#809](https://github.com/danielsmithdevelopment/ClawQL/pull/809) | IDP shipped-issue hygiene             |
| 2026-08-04 | [#807](https://github.com/danielsmithdevelopment/ClawQL/pull/807) | WORM seal + MEMORY_RECALL             |
| 2026-08-04 | [#810](https://github.com/danielsmithdevelopment/ClawQL/pull/810) | Stirling + NATS IDP Partials          |

Dependabot / toolchain (also in CHANGELOG): [#727](https://github.com/danielsmithdevelopment/ClawQL/pull/727), [#739](https://github.com/danielsmithdevelopment/ClawQL/pull/739), [#733](https://github.com/danielsmithdevelopment/ClawQL/pull/733), [#731](https://github.com/danielsmithdevelopment/ClawQL/pull/731), [#729](https://github.com/danielsmithdevelopment/ClawQL/pull/729), [#730](https://github.com/danielsmithdevelopment/ClawQL/pull/730), [#725](https://github.com/danielsmithdevelopment/ClawQL/pull/725), [#651](https://github.com/danielsmithdevelopment/ClawQL/pull/651), [#724](https://github.com/danielsmithdevelopment/ClawQL/pull/724), [#732](https://github.com/danielsmithdevelopment/ClawQL/pull/732), [#737](https://github.com/danielsmithdevelopment/ClawQL/pull/737), [#738](https://github.com/danielsmithdevelopment/ClawQL/pull/738) — see CHANGELOG **Changed**.

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
- IDP NATS paths need Helm `nats.*` worker flags for Nextcloud / Coneshare consumers ([#810](https://github.com/danielsmithdevelopment/ClawQL/pull/810)).
- Workspace packages remain **7.2.0** in lockstep; separate registry publish of `clawql-*` modules still follows OIDC package linking.

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
- TypeScript 7 as the supported toolchain (Dependabot #651 landed then #745 restored main; root remains on TS 6 for this tag).
- Ontology essay “disclose” items (SQL / Command Deck / VS Code / Arweave).

---

## Release checklist

See [`docs/release/v7.2.0-checklist.md`](docs/release/v7.2.0-checklist.md).
