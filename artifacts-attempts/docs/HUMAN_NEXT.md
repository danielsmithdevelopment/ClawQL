# Human next — Oct 14 submission

Agent-local work through Day 15 is done, including a proven **`demo:record-prep` GATE PASS (3/3)**. Agents cannot create the public GitHub repo or hold your Cloudflare billing keys.

## Do these in order

### 1. Film (required)

```bash
cd artifacts-attempts
npm ci
npm run demo:film-preflight
npm run demo:record-prep    # expect GATE PASS
npm run board:serve         # terminal A
# terminal B after a demo snapshot exists:
npm run board:hydrate-from
```

Record scenes in [`VIDEO_SCRIPT.md`](./VIDEO_SCRIPT.md) (5–10 min). Caption note about at-least-once + dedup is in that file.

### 2. Submit (required)

Checklist: [`SUBMISSION.md`](./SUBMISSION.md). Deadline **Oct 14, 2026**.

### 3. Public repo (optional but recommended)

Create GitHub repo `artifacts-attempts` (Apache-2.0), then extract per [`STANDALONE.md`](./STANDALONE.md). Point judges at that URL + [`JUDGE_RUNBOOK.md`](./JUDGE_RUNBOOK.md).

### 4. Live Cloudflare (optional; billing Oct 15)

Workers Paid + Artifacts beta + Turbo credits. Set secrets from `.env.example`, then `ATTEMPTS_E2E=1`. Gradual deploy body is already built by `prepareRelease().gradualDeploy` / `buildGradualDeployRequest` — POST when ready (`gradualDeployUrl`).

## Do not wait on agents for

- Creating the public repository  
- Paying Workers Paid / Artifacts / Turbo  
- Recording or uploading the demo video  

Status matrix: [`STATUS.md`](./STATUS.md) · FAQ: [`FAQ.md`](./FAQ.md).
