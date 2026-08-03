# ClawQL: A Practical, Hybrid Decentralized GitHub Alternative

## The Problem

Modern software development depends on artifacts that get published once and then trusted indefinitely: a tagged release, a Docker image, a Helm chart, an npm package. The platforms hosting these artifacts — GitHub, GitLab, npm, Docker Hub — are excellent for collaboration but were never designed to guarantee that what you download today is the same thing that was published originally.

Tags can be moved. A `v2.1.0` release today might not be the same bytes as `v2.1.0` six months ago, whether through human error, a compromised account, or a deliberate supply chain attack. Most consumers — humans, CI pipelines, Kubernetes clusters, and increasingly AI agents — have no way to verify exactly what they're running or where it came from. Build environments are typically mutable, making it hard to reproduce an exact build from six months ago byte for byte even when you have the source code. AI agents that autonomously pull dependencies, deploy services, or apply updates need machine-readable information about what's safe to run and what to do if something goes wrong — information that doesn't exist in a typical repository today.

ClawQL addresses this while keeping GitHub, Git, and existing workflows intact. Day-to-day collaboration stays exactly as it is. Official releases become permanent, verifiable, and self-describing.

## The Hybrid Architecture

ClawQL has four layers, each handling a distinct part of the problem.

### Layer 1: Collaboration — Radicle, with GitHub as a Mirror

Day-to-day development — branches, pull requests, code review, issues — happens on Radicle, a peer-to-peer Git-compatible collaboration network. Radicle gives every contributor a cryptographic identity, replicates repositories directly between peers without a central server, and supports private repositories through access lists.

GitHub remains in the picture as a read-only mirror. Anyone can still find your project on GitHub, star it, browse it, and clone it — but the mirror displays a banner pointing to the canonical source on Arweave (Layer 3) for anything that matters for verification.

**On the Radicle choice.** A self-hosted Git server — Forgejo, GitLab, Gitea — solves a different problem. It still has a single point of control: whoever runs the server can rewrite history, take the service down, or be compromised. It's an improvement over depending on GitHub specifically, but it doesn't remove the single-point-of-failure property that's the actual concern here.

Signed Git bundles stored on IPFS is a simpler alternative worth considering. IPFS gives you content-addressed storage, and a signed bundle gives you provenance for that specific snapshot. It doesn't give you ongoing collaboration — you'd still need something for issues, pull requests, and code review, and that something would be a separate system with its own trust model.

Radicle's advantage is providing the collaboration layer — issues, patches (Radicle's equivalent of pull requests), code review — and peer-to-peer replication with cryptographic identity, in one system, without a central operator. The honest tradeoffs: Radicle is less mature than GitHub or GitLab, most developers haven't used it, and its long-term maintenance trajectory is something to watch rather than take for granted.

This is why Radicle is the collaboration layer and not the trust layer. If Radicle's ecosystem doesn't pan out, the cost of switching collaboration tools is real but bounded — releases (Layer 3) remain permanent and verifiable regardless of what happens to the collaboration layer, because they don't depend on it. The trust guarantees this document is about don't live in Radicle.

### Layer 2: Staging and Build Environments — IPFS and Rift

In-progress branches, CI build artifacts, and build environments are stored on IPFS, a content-addressed storage network — meaning files are identified by a hash of their contents, so any change produces a different identifier and tampering is immediately detectable.

For build environments specifically, ClawQL recommends Rift, a tool that uses the same copy-on-write filesystem features your operating system already has (btrfs on Linux, APFS on macOS) to create isolated, instantly-available workspaces:

| | `git worktree` | Rift |
|---|---|---|
| Time to create a workspace | Seconds (full checkout) | Under 0.1 seconds |
| Extra disk space used | High (full copy of files) | Near-zero until files change |
| Running many agents in parallel | Painful (shared lock files, `node_modules` conflicts) | Straightforward |
| Immutability | None | Built in — every snapshot has a parent and a timestamp |

Rift is early-stage and maintained by a separate project. If it doesn't work for your setup, `git worktree` remains fully supported — everything downstream in this document works with either.

### Layer 3: Official Releases — Arweave

When you tag a release (`v2.1.0`, for example), ClawQL bundles everything that matters — source code, container images, Helm charts, a software bill of materials (SBOM), cryptographic signatures, and attestations — and uploads it once to Arweave, a network designed for permanent storage.

Arweave works differently from typical cloud storage: you pay a one-time fee, and the network guarantees the data stays available indefinitely. The pricing model is built around an endowment that funds storage for roughly 200 years. There's no subscription, no renewal, and no account suspension risk.

The resulting transaction ID becomes the permanent, canonical identifier for that release. Anyone — a person, a CI pipeline, a Kubernetes cluster, an AI agent — can fetch that exact release from any Arweave gateway, indefinitely, and verify it matches what was originally published.

**What does this cost?** Arweave pricing is roughly $6–$12 per gigabyte, one time, with the price fluctuating along with the AR token.

| Release contents | Approximate cost |
|---|---|
| Source + signatures only (~10 MB) | ~$0.07 |
| Source + container image + SBOM (~100 MB) | ~$0.70 |
| Full release with large images (~500 MB) | ~$3.50 |
| Large monorepo bundle (~1 GB) | ~$7–10 |

For most projects, a release costs under a dollar.

### Layer 4: The Glue — `clawql-release`

A single command-line tool ties everything together:

```bash
clawql-release init
clawql-release immutable-volume snapshot [--backend rift|git-worktree|cloudflare|ebs]
clawql-release golden-image build
clawql-release publish --tag v2.1.0
clawql-release verify [tx-id]
clawql-release pull [--rift]
```

Open source, written in TypeScript, and works whether or not Rift is available — `--backend git-worktree` is always a valid fallback.

## The Release Manifest

Every upload to Arweave includes a manifest file — a compact JSON document that turns a pile of binary artifacts into something a machine can reason about:

```json
{
  "version": "2.1.0",
  "merkleRoot": "8f3a9b...",
  "artifacts": {
    "source": { "cid": "bafy...", "sha256": "a1b2..." },
    "image": { "cid": "bafy...", "sha256": "c3d4...", "ref": "myapp:2.1.0" },
    "sbom": { "cid": "bafy...", "format": "spdx-json" }
  },
  "buildEnvironment": {
    "type": "rift",
    "snapshotId": "snap_8821",
    "parentSnapshotId": "snap_8790",
    "createdAt": "2026-06-01T14:22:00Z"
  },
  "policy": {
    "requireSignatures": ["build-pipeline", "security-review"],
    "canaryPercent": 5,
    "blastRadiusCap": "single-region",
    "rollback": {
      "previousRelease": "tx_7f2a9c...",
      "trigger": "error_rate > 1% for 5min"
    }
  },
  "compatiblePolicyVersion": "1.0"
}
```

The `merkleRoot` covers the entire bundle — change one byte of anything, and the root no longer matches. Anyone can verify this without trusting ClawQL or Arweave's operators. The `buildEnvironment` section records exactly which Rift snapshot (or `git worktree` commit) produced this release, with a link back to its parent. A Kubernetes cluster running Kyverno or OPA Gatekeeper can read the `policy` block directly and refuse to deploy anything that doesn't meet `requireSignatures`, automatically configure a canary rollout at `canaryPercent`, or know exactly what to roll back to if the `rollback.trigger` condition fires. An autonomous agent deploying this release reads the policy block and acts accordingly, including knowing how to undo the deployment if something goes wrong.

The manifest schema is versioned (`compatiblePolicyVersion`) and publicly documented, so auditing a release means auditing against a known, stable schema.

## Private and Paid Releases

Public releases are uploaded unencrypted. Private or commercial releases work the same way, with one addition: the bundle is encrypted (using XChaCha20-Poly1305) before upload, and the manifest declares which cryptocurrency wallet address is authorized to decrypt it.

For more complex access conditions — "decrypt after payment," for example — the manifest can reference Lit Protocol, which handles conditional decryption based on on-chain conditions.

**What this looks like for an AI agent consuming a paid release:**

```javascript
const manifest = await clawql.verify(txId)

if (manifest.access.paymentRequired) {
  const payment = await x402.pay({
    amount: manifest.access.price,
    recipient: manifest.access.wallet,
    resource: txId,
  })

  const decryptionKey = await lit.requestKey({
    condition: manifest.access.decryptCondition,
    proof: payment.receipt,
  })

  const bundle = await clawql.decrypt(txId, decryptionKey)
}
```

The agent pays, receives a key, and decrypts — one atomic flow, no human approval step required for routine, low-value transactions. Whether that's appropriate without human approval is a policy decision for whoever configures the agent — see the permission-tiering discussion in other ClawQL documentation for how to think about this.

## The Release Workflow in Practice

```bash
# One-time setup
rift init
clawql-release init

# Day-to-day development — unchanged
rift create --name agent-fix-42
cd .rifts/agent-fix-42
# ...edit, test, commit as normal...

# When ready to ship
clawql-release immutable-volume snapshot --backend rift --name build-2026-06-01
clawql-release golden-image build
clawql-release publish --tag v2.1.0

# Consuming a release
clawql-release pull --rift
```

Teams not using Rift run the same commands with `--backend git-worktree`. Nothing about steps 1–2 changes regardless of which backend is used.

## Why This Model Holds Up

| | Typical GitHub + CI setup | ClawQL |
|---|---|---|
| Can a release be silently changed after publishing? | Yes — tags can move | Arweave transactions are permanent |
| Can you prove what build environment produced a release? | Usually not | Yes — snapshot ancestry in the manifest |
| Can a Kubernetes cluster enforce policy automatically? | Only with custom tooling | Yes — manifest is machine-readable |
| Can an AI agent verify and consume a release safely? | Not designed for this | Yes — first-class |
| Running many isolated build environments in parallel | Painful | Trivial with Rift |
| Private/paid releases | Requires custom infrastructure | Built in |
| How long does the release last? | As long as the platform exists | ~200 years (Arweave endowment) |
| Effort to adopt | None — it's GitHub | Near-zero — mirror + one CLI |

## What Happens When Things Go Wrong

A system built around "permanent and trustworthy" needs to be honest about its own failure modes.

**An Arweave gateway is unreachable.** Arweave data is replicated across many independent gateways run by different operators. If one gateway is down, `clawql-release pull` and `verify` try another. The transaction ID itself doesn't depend on any single gateway — it's a property of the network, not of one server. The practical risk here is closer to "occasionally slower" than "occasionally unavailable."

**The price of AR changes dramatically.** Arweave's storage guarantee is funded by an endowment calculated at upload time, designed to cover storage costs even if the token's value drops substantially afterward. The real-world risk isn't zero, since it depends on the endowment model continuing to hold up over decades, which is a long time for any cryptoeconomic assumption. This risk applies to data already uploaded being maintained — it doesn't affect verification of releases already published, since the transaction ID and content hash don't change regardless of what AR is worth. A practical mitigation: keep release artifacts modest in size. The manifest, signatures, and source are what truly need permanence; large binary blobs can be re-derivable from source plus a recorded build environment.

**A malicious or compromised manifest gets published.** This is the most important failure mode. Suppose someone with valid signing credentials publishes a release with a manifest that looks legitimate — correct signatures, valid Merkle root — but contains a `policy` block designed to do something harmful: a `rollback.previousRelease` pointing to an old, vulnerable version, or a `canaryPercent` of 100 disguised as 5.

The defenses are layered. The manifest schema is public and versioned, so an admission controller can validate that policy values are sane (a `canaryPercent` outside 0–100, a `rollback` target that doesn't itself verify) before acting on them — independent of whether the signatures check out. Signature requirements in `policy.requireSignatures` should require multiple independent signers for production releases; a "build pipeline" signature alone leaves a gap that's worth closing, and this is a configuration choice each project makes. Because every release is permanent, a malicious release doesn't erase the legitimate history — the previous good release and its manifest are still there, still verifiable, and still pullable.

A compromised signing key is serious. The blast radius is bounded and auditable in a way that a quietly-rewritten Git tag isn't, but the mitigation is the same as anywhere else: protect signing credentials with the same rigor as production deployment credentials.

## Adoption Path

Nothing here requires an all-or-nothing migration.

1. **Day zero**: Add `clawql-release` alongside your existing GitHub workflow. Nothing about how you develop or review code changes.
2. **First release**: Run `clawql-release publish`. Your release is now permanent and verifiable. GitHub still works exactly as before — your users won't notice anything different, except that this release can never be silently altered.
3. **When it makes sense**: Adopt Rift for faster, isolated build environments — especially useful if you're running many AI agents in parallel. `git worktree` works indefinitely if Rift doesn't fit.
4. **When it makes sense**: Move day-to-day collaboration to Radicle for full peer-to-peer operation. GitHub can remain as a mirror for as long as you want.

The only required step is publishing your first release. Everything else is optional hardening that you adopt when it solves a problem you have.

*For package boundaries and Layer 0 in the platform architecture, see [Modularization v2.1](https://docs.clawql.com/vision/modularization). For platform vision and roadmap, see [Vision & Roadmap](https://docs.clawql.com/vision/roadmap).*

© Copyright 2026. All rights reserved. · [ClawQL on GitHub](https://github.com/danielsmithdevelopment/ClawQL)
