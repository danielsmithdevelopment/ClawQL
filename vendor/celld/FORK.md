# Fork retired

**Status:** removed. ClawQL no longer vendors or ships a `0.4.0-clawql.*` celld fork.

**Why:** stock **denoland/celld v0.6.3** held the wedged-fleet and stale-owner durability boards. Maintaining a patched binary (and its CI build) had no remaining durability benefit.

**Pin:** [`UPSTREAM_PIN`](./UPSTREAM_PIN) → `v0.6.3`  
**Install + attestation:** [`README.md`](./README.md) · `scripts/ci/install-celld-pinned.sh`

Former patch notes (fenced ack, epoch-at-confirm, `/alive`, maintenance budgets) remain in git history under this path if needed for archaeology — not as a supported product surface.
