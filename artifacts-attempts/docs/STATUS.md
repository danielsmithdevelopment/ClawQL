# Competition status — artifacts-attempts

As of Day 12 (local path). Deadline **Oct 14, 2026**. Artifacts billing starts **Oct 15**.

## Ready (no Cloudflare account)

| Area | Status |
| --- | --- |
| Apache-2.0 tree under `artifacts-attempts/` | yes |
| Local pipeline (git notes, vitest, Merkle dry-run) | yes — `demo:local` / `demo:judge-smoke` |
| Policy block (`att_3` / evil.example) | yes |
| Decider + trust rule (calibrated auto-merge / approval) | yes |
| Canary dry-run status + board panel | yes |
| Board SSE + MCP tools | yes — `demo:board-mcp-smoke` |
| Recording gate (3× verify) | yes — `demo:record-prep` |
| Judge docs | [`JUDGE_RUNBOOK.md`](./JUDGE_RUNBOOK.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`VIDEO_SCRIPT.md`](./VIDEO_SCRIPT.md) |
| CI (path-filtered) | `.github/workflows/artifacts-attempts.yml` |

## Blocked on credentials / human steps

| Item | Blocker |
| --- | --- |
| Public standalone `artifacts-attempts` repo | GitHub create denied to agents; needs human |
| Live Artifacts forks / tokens | Workers Paid + Artifacts beta |
| Live Turbo Arweave publish | `ARWEAVE_JWK` / Turbo credits |
| Workers gradual deploy API | Cloudflare account |
| Demo video | Run `demo:record-prep` then film [`VIDEO_SCRIPT.md`](./VIDEO_SCRIPT.md) |

## Submit path if CF stays blocked

Ship the **local-witness** path: real git, real vitest, real Merkle verify, honest dry-run labels for Arweave/canary. Judges follow [`JUDGE_RUNBOOK.md`](./JUDGE_RUNBOOK.md). Checklist: [`SUBMISSION.md`](./SUBMISSION.md).
