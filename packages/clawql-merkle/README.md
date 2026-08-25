# clawql-merkle

Zero-dependency integrity primitives: a **Merkle tree** (`buildMerkleSnapshot`, inclusion proofs) and a **hash chain** (`sealHashChainRecord`, `verifyHashChain`).

This package has **no ClawQL product dependencies** and no runtime npm dependencies. `clawql-core` re-exports the same APIs for existing callers. `clawql-audit` imports this package directly and must not import `clawql-core`.

Merkle trees and hash chains are different: the tree proves inclusion of a leaf in a root; the chain proves append order via `prev_hash`.

Sync `node:crypto` helpers are the public API so this package stays dependency-free. Effect wrapping lives in product packages (`clawql-core`, `clawql-audit`).
