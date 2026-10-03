# ChatGPT live pass — RC prep (8.0.0)

**Blocking gate:** [`docs/specs/mcp/mcp-events-chatgpt-checklist.md`](../specs/mcp/mcp-events-chatgpt-checklist.md)  
**Rule:** Protocol/unit tests are **not** a substitute. This file records what the agent can prep; the operator must complete ChatGPT deliveries + WORM evidence on the **signed** digest that will become `v8.0.0`.

## Protocol smoke (done in CI / agent)

Run from repo root (same commands as checklist “Protocol smoke”):

```bash
npm run test -w clawql-mcp-events
npm run test -w clawql-automation -- \
  src/schedule/schedule-change-detect.test.ts \
  src/schedule/change-detect.test.ts \
  src/schedule/schedule.test.ts \
  src/schedule/projection-store.test.ts
```

Agent run (2026-10-03): **24/24** `clawql-mcp-events`, **33/33** schedule tests — green. Logs under `/opt/cursor/artifacts/chatgpt-gate/`.

## RC image under test

Build the runtime image from the `main` tip you intend to tag (or the merge commit after #1194 lands):

```bash
git checkout main && git pull
SHA=$(git rev-parse HEAD)
docker build -f docker/Dockerfile --target runtime \
  -t "ghcr.io/danielsmithdevelopment/clawql-mcp:rc-8.0.0-${SHA}" \
  -t clawql-mcp:rc-8.0.0 .
# Prefer the digest from Docker publish / cosign after push — local Id is not the GHCR digest.
```

| Field | Value |
| --- | --- |
| Git commit SHA (intended RC base at prep) | `159399c5e984ae9780a7fc06b4054f4c0d730e8d` (`origin/main` as of 2026-10-03) |
| Local image tag | `clawql-mcp:rc-8.0.0` |
| Local manifest list Id (not GHCR) | `sha256:310677dd24a0d39b4da1f5f8e0e4bcd6df9718d47df49e5fa7365e677c102b3e` |
| **GHCR digest to paste into checklist §0** | _operator: after signed Docker publish of this SHA_ `ghcr.io/danielsmithdevelopment/clawql-mcp@sha256:…` |
| Cosign verified | [ ] |

**Important:** A local `docker build` digest is **not** the release digest. Checklist §0 requires the **signed OCI image** that will be tagged `v8.0.0` (typically from [Docker publish](../../.github/workflows/docker-publish.yml) + Cosign). Use this prep to:

1. Confirm `main` SHA.
2. Optionally smoke the same bits locally over Streamable HTTP.
3. After publish: `crane digest ghcr.io/danielsmithdevelopment/clawql-mcp:<rc-tag>` → paste into checklist §0 + sign-off.

## Operator sequence (unchanged)

1. Deploy ChatGPT plugin against digest-pinned RC (`@sha256:…` only).
2. Complete every row in the live checklist (seven events + negatives + evidence columns).
3. Sign off with name, UTC, commit SHA, **image digest**, PASS.
4. Tag `v8.0.0` only when digest matches; after tag, confirm published digest equals checklist.

## Not done by the agent

- ChatGPT plugin connection / webhook deliveries
- WORM `mcp_events.delivery` evidence capture in production trail
- Cosign verify on GHCR
- Checklist sign-off
