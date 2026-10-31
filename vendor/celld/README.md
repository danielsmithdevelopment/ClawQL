# celld pin (stock upstream — no ClawQL fork)

ClawQL ships **[denoland/celld](https://github.com/denoland/celld) `v0.6.3`**. There is no vendored fork and no ClawQL-patched binary.

| Artifact | Path |
| -------- | ---- |
| Pin | [`UPSTREAM_PIN`](./UPSTREAM_PIN) |
| Contact / offer | [`UPSTREAM_OFFER.md`](./UPSTREAM_OFFER.md) |
| Board design notes | [`upstream-report/`](./upstream-report/) |

## Install + provenance

```sh
# Product default (also used by Streams CI):
CELLD_PINNED_VERSION=v0.6.3 bash scripts/ci/install-celld-pinned.sh
```

That script downloads the published `*.gz` release asset, runs
`gh attestation verify --repo denoland/celld` (attestations cover the gzip
assets, not the unpacked binary), then installs under `~/.local`.

Equivalent manual install:

```sh
curl -fsSL https://celld.dev/install.sh | CELLD_VERSION=v0.6.3 sh
# then download the matching *.gz and:
gh attestation verify celld-x86_64-unknown-linux-gnu.gz --repo denoland/celld
```

## History

Earlier `0.4.0-clawql.*` fence / alive-ready patches lived in this tree. Tip
**0.6.3** closed the mid-flight durability boards (wedged + stale-owner); the
fork was removed rather than maintained. See git history on this path for the
old source.
