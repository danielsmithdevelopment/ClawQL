# Human next — Oct 12–14 submission

Agent-local work through Day 18 is scaffolded. **Agents cannot create the public GitHub repo or hold your Cloudflare billing keys.**

## Correction

The **public repo is required**, not optional. Submission needs source under a permissive license that judges can run. Create it first.

## Three days, in order

### Oct 12 — public repo + live Artifacts path

1. **Create public GitHub repo** `artifacts-attempts` (Apache-2.0), extract per [`STANDALONE.md`](./STANDALONE.md), push, and put that URL in the submission draft.
2. **Accounts:** Workers Paid + Artifacts beta, API token, account ID → `.env` from `.env.example`.
3. **Live probe until forks work:**

```bash
cd artifacts-attempts
npm ci
LIVE_PROBE=1 npm run demo:live-check
# then exercise three forks + scoped tokens + push events against real Artifacts
```

If live Artifacts is not working by end of day: **stop**. Film the local-witness path with honest labels (`agents replayed`, `release dry-run`, `canary dry-run`). Do not burn Oct 13 on x402.

4. **One real agent** for `att_1` (Claude Code / Codex); keep `att_2` / `att_3` on `--replay` so labels stay honest.

### Oct 13 — permanence, canary, film

5. **One real Turbo upload** (even a small bundle) → gateway tx ID on camera + `artifacts-verify`.
6. **One real 10% gradual deploy** (body from `demo:live-check` / `prepareRelease().gradualDeploy`).
7. **Optional closing beat (only if Oct 12 live forks worked):** x402 unlock → private Artifacts buyer copy. See [`X402_UNLOCK.md`](./X402_UNLOCK.md). Base Sepolia; say so on screen. Dry-run: `npm run demo:unlock-dry`.
8. **Film:**

```bash
npm run demo:film-preflight
npm run demo:record-prep    # GATE PASS
# Open card: docs/video-cards/open.html (10–15s)
# Screen recording between beats: docs/video-cards/beat.html?t=...&s=...
# Close: docs/video-cards/close.html
```

Pitch: [`PITCH.md`](./PITCH.md) · Scenes: [`VIDEO_SCRIPT.md`](./VIDEO_SCRIPT.md).

### Oct 14 — before noon

9. Edit, upload, **submit**, confirm receipt. Afternoon is buffer.

## Honesty rule

If any live piece does not land, keep its label on screen. Do not trade honesty for spectacle.

## Do not wait on agents for

- Creating / publishing the public repository  
- Paying Workers Paid / Artifacts / Turbo  
- Recording or uploading the demo video  

Status: [`STATUS.md`](./STATUS.md) · FAQ: [`FAQ.md`](./FAQ.md) · Unlock design: [`X402_UNLOCK.md`](./X402_UNLOCK.md).
