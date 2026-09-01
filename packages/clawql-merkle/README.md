# clawql-merkle

Zero-dependency **Merkle tree** primitives: snapshots, inclusion proofs, and SHA-256 leaf hashing.

Works alone or as the batch-root layer for [`clawql-audit`](https://www.npmjs.com/package/clawql-audit). No ClawQL runtime required.

## Install

```bash
npm install clawql-merkle
```

Requires **Node.js ≥ 22**.

## Quick start

```typescript
import { buildMerkleSnapshot, merkleProof, verifyMerkleProof } from "clawql-merkle";

const snapshot = buildMerkleSnapshot([
  { path: "notes/a.md", bodySha256Hex: /* sha256 hex of file body */ "ab".repeat(32) },
  { path: "notes/b.md", bodySha256Hex: "cd".repeat(32) },
]);

console.log(snapshot.rootHex);

const proof = merkleProof(snapshot, 0);
const ok = verifyMerkleProof(snapshot.leaves[0]!, 0, snapshot.leafCount, proof, snapshot.rootHex);
```

## API

| Export                             | Role                                                 |
| ---------------------------------- | ---------------------------------------------------- |
| `buildMerkleSnapshot(rows)`        | Lexicographic path order → `rootHex`, leaves, height |
| `merkleProof(snapshot, leafIndex)` | Sibling path leaf → root                             |
| `verifyMerkleProof(...)`           | Check inclusion against an expected root             |
| `leafHash` / `nodeHash`            | Domain-separated SHA-256 helpers                     |

Leaf domain separator: `clawql:merkle:leaf:v1`.

## License

Apache-2.0
