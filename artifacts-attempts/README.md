# artifacts-attempts

**Cloudflare Artifacts competition entry** — a task forks into parallel agent attempts, evidence decides the winner, and the merge becomes an immutable Arweave release anyone can verify.

Apache-2.0. No private Ontologiql code. Nothing personal goes into a release.

## What it does

1. Create a task against a demo repo → three Artifacts attempt forks with repo-scoped tokens  
2. Agents (or labeled **replay** patches) push to their forks  
3. Every push → queue → evaluator (tests + policy + hash-chained Git note)  
4. One attempt is **blocked** for calling a host off the allowlist  
5. Decider calls configurable `/v1/decisions`; auto-merge only when calibrated + confident  
6. Merge queue rebases, re-tests, merges; losers stand down  
7. **Release** (never cut): bundle + Merkle manifest → Arweave → `artifacts-verify`  
8. Workers gradual deploy at the manifest canary %  
9. Live board page

## Status

- Day 1 checks + packages: [`DAY1.md`](./DAY1.md)  
- Day 2 local pipeline (no Cloudflare creds): [`DAY2.md`](./DAY2.md)  
- Day 3–6: board, gate, decider, approval path — see `DAY3.md`…`DAY6.md`  
- Day 7 decider-in-pipeline + dry-run canary: [`DAY7.md`](./DAY7.md)  
- Day 8 board canary + gate asserts: [`DAY8.md`](./DAY8.md)  
- Day 9 judge smoke + canary verify: [`DAY9.md`](./DAY9.md)  
- Day 10 hydrate-from + architecture: [`DAY10.md`](./DAY10.md)  
- Day 11 CI + board MCP smoke: [`DAY11.md`](./DAY11.md)  
- Day 12 status + board trust: [`DAY12.md`](./DAY12.md) · [`docs/STATUS.md`](./docs/STATUS.md)  
- Day 13 standalone + film preflight: [`DAY13.md`](./DAY13.md) · [`docs/STANDALONE.md`](./docs/STANDALONE.md)  
- Day 14 gradual-deploy builder + FAQ: [`DAY14.md`](./DAY14.md) · [`docs/FAQ.md`](./docs/FAQ.md)  
- Day 15 release wire + record-prep GATE PASS: [`DAY15.md`](./DAY15.md)  
- Day 16 human handoff: [`DAY16.md`](./DAY16.md) · [`docs/HUMAN_NEXT.md`](./docs/HUMAN_NEXT.md)  
- Day 17 pitch + live-check: [`DAY17.md`](./DAY17.md) · [`docs/PITCH.md`](./docs/PITCH.md)

### Run the local demo (real git notes + vitest + dry-run release)

```bash
cd artifacts-attempts
npm ci
npm test                 # includes local-git + pipeline
npm run demo:local       # one full pipeline run under .local/demo-run
npm run demo:judge-smoke # one verified demo (notes + manifest + canary)
npm run demo:film-preflight  # fast tree/scripts check before filming
npm run demo:live-check  # Cloudflare cred readiness (+ LIVE_PROBE=1 to hit Artifacts)
npm run demo:gate        # 3 consecutive verified runs (record only after GATE PASS)
npm run demo:record-prep # alias gate before filming
npm run board:serve      # http://127.0.0.1:8787/
npm run board:hydrate    # run demo + POST; writes result.json
npm run board:hydrate-from  # POST existing result.json (no re-run)
npm run demo:approval-path  # uncalibrated → approve (board must be up)
```

Judges: [`docs/JUDGE_RUNBOOK.md`](./docs/JUDGE_RUNBOOK.md) · Architecture: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) · Video: [`docs/VIDEO_SCRIPT.md`](./docs/VIDEO_SCRIPT.md) · Submit: [`docs/SUBMISSION.md`](./docs/SUBMISSION.md).

Live Cloudflare Artifacts / Turbo Arweave remain gated on account credentials (`ATTEMPTS_E2E=1`).

## Decisions for judges

| Topic | Default |
| --- | --- |
| `/v1/decisions` | Set `DECISIONS_URL`. **ClawQL gateway** → can return `calibrated: true` and auto-merge. **OpenAI-compatible** → missing `calibrated` always routes to the approval page (honest). |
| No model keys | `./agents/run-attempt.sh --replay demo/fixtures/patches/att_1.good.patch …` — pipeline is live; agent work is labeled `replay`. |
| Demo repo | `demo/webhooks-service` |

## Quick start (local packages)

```bash
cd artifacts-attempts
npm ci
npm test
npm run build
node cli/verify/dist/cli.js --help   # after build
```

### Verify a note chain

```bash
# after producing notes.jsonl (one EvidenceNote JSON per line)
npm run build -w @artifacts-attempts/verify
node cli/verify/dist/cli.js --notes path/to/notes.jsonl
```

### Verify a local release dry-run

```bash
node cli/verify/dist/cli.js --local-manifest path/to/manifest.json --bundle-dir path/to/bundle
```

## Keys and cost (when live)

| Secret | Used for | Notes |
| --- | --- | --- |
| Cloudflare account + Workers Paid | Artifacts, Queues, Workflows, Sandbox | Billing for Artifacts starts **Oct 15, 2026** |
| Model API key | Live agents only | Not needed for `--replay` |
| `ARWEAVE_JWK` / Turbo credits | Permanent release | Demo bundle ~10 MB ≈ **~$0.07**; dry-run writes `.local/arweave/` |
| `DECISIONS_URL` + optional API key | Decider | ClawQL or OpenAI-compatible |

## License

Apache License 2.0 — see [`LICENSE`](./LICENSE).
