# clawql-merkle

Zero-dependency Merkle tree primitives used by ClawQL vault snapshots and `clawql-audit` batch roots.

## API

- `buildMerkleSnapshot(rows)` — lexicographic path order; returns `rootHex`, leaf digests, height
- `merkleProof(snapshot, leafIndex)` — sibling path from leaf to root
- `verifyMerkleProof(leafHash, leafIndex, leafCount, proof, expectedRootHex)`
- `leafHash(path, bodySha256Hex)` / `nodeHash(left, right)`

Leaf domain separator: `clawql:merkle:leaf:v1`. No ClawQL package dependencies.

## Install

```bash
npm install clawql-merkle
```
