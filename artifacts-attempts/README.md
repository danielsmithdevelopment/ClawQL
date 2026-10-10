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

## Day-1 status

See [`DAY1.md`](./DAY1.md) for the six Artifacts constraint checks and locked product decisions.

Shipped today (local witnesses):

- `packages/notes` — RFC 8785 evidence hash chain + tests  
- `packages/manifest` — Merkle release manifest + tests  
- `packages/artifacts-client` — binding + REST + memory test double  
- `packages/shared` — Task/Attempt contracts + trust rule  
- `cli/verify` — `--notes` / `--local-manifest` / Arweave fetch  
- `demo/webhooks-service` — real retry-storm bug + suite  
- Worker skeletons: api, coordinator, intake, evaluator, decider, merge-queue, release  
- Replay patches under `demo/fixtures/patches/`

Not yet (Days 2–5): live Artifacts forks, Sandbox test runs, DO storage, Arweave upload, e2e against real witnesses, demo video.

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
