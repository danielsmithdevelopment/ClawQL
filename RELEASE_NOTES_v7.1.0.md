## clawql-mcp 7.1.0

**npm:** [`clawql-mcp@7.1.0`](https://www.npmjs.com/package/clawql-mcp/v/7.1.0) (publish on tag `v7.1.0`)  
**Full changelog:** [CHANGELOG.md#710---2026-07-20](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md#710---2026-07-20)  
**Release date:** 2026-07-20 (tag after ontology PRs #718–#720 and Docker publish fix #740 land)

---

## Headline

**ClawQL 7.1.0** is the first minor on the **7.0 Agentic Gateway** line: **enterprise Ontology + OKF memory**, a production-shaped **payments** stack (credits → payouts → compensation → deduction), and a large **Effect**-first platform rewrite — without a semver-major break.

**ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI.** 7.0 shipped that as the install story; **7.1** ships the rails operators asked for next: schema’d Ontology, prepaid agent economics, and typed Effect services end-to-end.

→ Announcement drafts: [`docs/announcements/announcement-drafts-v7.1.0.md`](docs/announcements/announcement-drafts-v7.1.0.md) · Prior major: [`RELEASE_NOTES_v7.0.0.md`](RELEASE_NOTES_v7.0.0.md)

---

## What’s new (operator truths)

### 1. Enterprise Ontology + OKF

- Package **`clawql-ontology`**: `clawql ontology lint` / `generate` (read MCP stubs).
- ADR **0009** / **0010** (`.cqe` / `.cqm` / … dual-accept).
- Vault **`memory_ingest`** OKF frontmatter (`type`, `worm_ref`, …).
- CI **Ontology lint (examples)**; schema shipped inside the npm package.

→ [`docs/architecture/enterprise-ontology.md`](docs/architecture/enterprise-ontology.md) · [`docs/memory/okf.md`](docs/memory/okf.md)

### 2. Payments wave

| Surface                                       | Doc                                                            |
| --------------------------------------------- | -------------------------------------------------------------- |
| Prepaid credits + Stripe FC/ACH               | [`credits-ach.md`](docs/payments/credits-ach.md)               |
| Connect payouts + Base USDC + Ramp + off-ramp | [`payouts-ramp.md`](docs/payments/payouts-ramp.md)             |
| Agent compensation (2PC stage/confirm)        | [`agent-compensation.md`](docs/payments/agent-compensation.md) |
| Sync `DeductionService` on inference          | [`deduction-service.md`](docs/payments/deduction-service.md)   |

Enable MCP payout/compensation tools with **`CLAWQL_PAYMENTS_MCP_TOOLS=1`**.

### 3. Effect platform (internal → durable)

Search/execute, memory, documents/IDP, automation, sandbox, ouroboros, payments audit, scoped resources, fibers, OTel bridge — Effect services with DI layers. Operators see the same MCP tools; contributors get typed error channels and testable Layers.

### 4. Inference + GTM

Policy/manifest locks, observability paths, and an inference-first GTM playbook aligned to the Agentic Gateway story.

### 5. Team vault sync

**`clawql sync`** to R2 / S3 / GCS; optional auto push/pull around memory ingest/recall.

---

## Upgrade (7.0.0 → 7.1.0)

```bash
npm install clawql-mcp@7.1.0
# or
npx -p clawql-mcp@7.1.0 clawql-mcp

helm upgrade --install clawql ./charts/clawql-mcp \
  --set image.tag=7.1.0   # or your digest
```

- **No intentional breaking env renames** vs 7.0.0.
- New **opt-in** flags: credits / compensation / payments MCP tools / ontology CLI (see `.env.example` + payments docs).
- Workspace packages remain **7.1.0** in lockstep; separate registry publish of `clawql-*` modules still follows OIDC package linking (same story as 7.0 — may ship inside `clawql-mcp` tarball via `bundledDependencies` until linked).

---

## Helm

| Chart                    | Chart version | appVersion |
| ------------------------ | ------------- | ---------- |
| `charts/clawql-mcp`      | `0.7.1`       | `7.1.0`    |
| `charts/clawql-operator` | `0.2.1`       | `7.1.0`    |
| `charts/clawql-idp`      | `0.1.1`       | `7.1.0`    |

---

## Release checklist

See [`docs/release/v7.1.0-checklist.md`](docs/release/v7.1.0-checklist.md).
