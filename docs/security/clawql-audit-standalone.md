---
title: clawql-audit + clawql-merkle (standalone WORM)
status: current
---

# Standalone WORM packages

[`clawql-merkle`](https://www.npmjs.com/package/clawql-merkle) and [`clawql-audit`](https://www.npmjs.com/package/clawql-audit) are published as an independent **7.2.0** wedge. You can use them from any Node ≥ 22 agent host without installing ClawQL MCP.

## Packages

| Package         | Role                                                         | Semver  |
| --------------- | ------------------------------------------------------------ | ------- |
| `clawql-merkle` | Zero-dep Merkle snapshots + inclusion proofs                 | `7.2.0` |
| `clawql-audit`  | Hash-chained WORM trail, dual-ack (sql.js/memory), TEE ECDSA | `7.2.0` |

`clawql-audit` is CI-gated to depend on **only** `clawql-merkle` among `clawql-*` names.

## Install

```bash
npm install clawql-audit
```

## Publish (maintainers)

Full monorepo order (merkle and audit first):

[`scripts/release/npm-publish-order.json`](../../scripts/release/npm-publish-order.json)

Wedge-only (first registry publish of `7.2.0` without a monorepo tag):

```bash
# dry-run
node scripts/release/npm-publish-audit-wedge.mjs --dry-run

# live (NPM_TOKEN / OIDC trusted publisher required)
node scripts/release/npm-publish-audit-wedge.mjs
```

Pack smoke (no registry):

```bash
bash scripts/dev/test-npm-pack-audit-wedge.sh
```

First-time npmjs.com: create empty `clawql-merkle` and `clawql-audit` packages (or link trusted publishers) so `--provenance` / OIDC can publish.

## Related

- Package READMEs: `packages/clawql-merkle/README.md`, `packages/clawql-audit/README.md`
- Streams TEE draft: [`docs/streams/clawql-tee.md`](../streams/clawql-tee.md)
- Air-gap QR: [`docs/streams/clawql-tee-airgap-audit.md`](../streams/clawql-tee-airgap-audit.md)
